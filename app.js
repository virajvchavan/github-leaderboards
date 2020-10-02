const express = require("express");
const serverless = require("serverless-http");
const fetch = require("node-fetch");
const mongoose = require("mongoose");
var morgan = require("morgan");
const Contest = require('./models/Contest');

const BATCH_SIZE = 100; // Github API's limitation per request

const app = express();
app.use(morgan("dev"));
mongoose.connect(process.env.DB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const fetchAndBuildData = async (owner, repository) => {
    let contestKey = `${owner}/${repository}`;
    let contest = await Contest.findOne({key: contestKey})
    if (!contest) {
        contest = new Contest({ key: contestKey, status: "processing" });
        await contest.save();
        buildDataInBg(contest); // call a seperate lambda fn here
        return { status: contest.status };
    } else {
        if (contest.status === "processing") {
            return { status: contest.status };
        } else {
            // fetch latest data based on cursors
            await buildData(contest);
        }
    }

    contest = await Contest.findOne({ key: contestKey });
    return { status: contest.status, users: await users_pr_counts(contest) };
}

const buildDataInBg = (contest) => {
    fetch(`https://ohwoj3u4oi.execute-api.us-east-1.amazonaws.com/dev/build-data?key=${contest.key}`, {method: "POST"}).catch((err) => {
        console.log("error calling buildData" + err);
    });
}

const buildData = async (contest) => {
    contest = await fetchPRs('merged', contest);
    contest = contest.status === "error" ? contest : await fetchPRs('open', contest);
    contest = contest.status === "error" ? contest : await fetchPRs("closed", contest);

    if(contest.status != "error") {
        contest.status = "done";
    }

    try {
        await contest.save();
    } catch (error) {
        // this is for handling a behaviour by Lambda functions
        newContest = await Contest.findOne({key: contestKey});
        newContest.open_prs_cursor = contest.open_prs_cursor;
        newContest.closed_prs_cursor = contest.closed_prs_cursor;
        newContest.merged_prs_cursor = contest.merged_prs_cursor;
        newContest.users = contest.users;
        newContest.status = newContest.status;
        await newContest.save();
    }
}

const users_pr_counts = async (contest) => {
    if (contest.status === "error") {
        return [];
    }
    let users = [];
    Object.keys(contest.users).forEach(username => {
        users.push({
            username: username,
            merged_prs: contest.users[username].merged_prs && contest.users[username].merged_prs.length,
            open_prs: contest.users[username].open_prs && contest.users[username].open_prs.length,
            closed_prs: contest.users[username].closed_prs && contest.users[username].closed_prs.length
        });
    });
    return users.sort((a, b) => {
        if (a.merged_prs === b.merged_prs) {
            return b.open_prs - a.open_prs;
        }
        return b.merged_prs - a.merged_prs;
    });
}

const fetchPRs = async (type, contest) => {
    let result = await callGithubAPI(graphQLQueryForPRs(type, contest));
    result = await result.json();
    if (result.errors) {
        console.log(`error fetching ${type} prs: `, result.errors);
        if (result.errors[0].type === "INVALID_CURSOR_ARGUMENTS") {
            contest[`${type}_prs_cursor`] = "";
            contest = fetchPRs(type, contest);
        } else if (result.errors[0].type === "NOT_FOUND") {
            contest.status = "error";
            return contest;
        }
    } else {
        let pullRequests = result['data']['repository']['pullRequests'];
        if (pullRequests['nodes'].length > 0) { // recursion termination condition
            if (pullRequests["pageInfo"]["endCursor"]) {
                contest[`${type}_prs_cursor`] = pullRequests["pageInfo"]["endCursor"];
            }
            contest.users = contest.users || {};
            pullRequests["nodes"].forEach(async (pr) => {
                console.log(pr);
                if (pr.author && pr.author.login) {
                    let user = contest.users[pr.author.login] || {};
                    if (!user.picture) user.picture = pr.author.avatarUrl;
                    user[`${type}_prs`] = user[`${type}_prs`] || [];

                    user.merged_prs = removeValueFromArray(user.merged_prs || [], pr.id);
                    user.closed_prs = removeValueFromArray(user.closed_prs || [], pr.id);

                    // if a PR that was open is now closed, then reset the open_prs_cursor
                    // so that if the same PR is reopened, it'll be returned by the new cursor as open_pr
                    if (user.open_prs && user.open_prs.includes(pr.id)) {
                        if (type === 'closed') {
                            user.open_prs = removeValueFromArray(user.open_prs, pr.id);
                            contest.open_prs_cursor = "";
                        }
                    }

                    user[`${type}_prs`].push(pr.id);
                    contest.users[pr.author.login] = user;
                }
            });
            contest = fetchPRs(type, contest);
        }
    }
    return contest;
}

const callGithubAPI = (query) => {
    return fetch("https://api.github.com/graphql", {
        method: "POST",
        body: JSON.stringify({ query: query }),
        headers: {
            Authorization: `Bearer ${process.env.GITHUB_ACCESS_TOKEN}`,
        },
    });
}

const graphQLQueryForPRs = (type, contest) => {
    let [owner, repository] = contest.key.split("/");
    let cursorParam = contest[type + '_prs_cursor'] ? `,after:"${contest[type + '_prs_cursor']}"` : "";
    return `
        query {
            repository(owner:"${owner}", name: "${repository}") {
                pullRequests(states:${type.toUpperCase()}, first:${BATCH_SIZE}${cursorParam}) {
                    nodes {
                        id
                        author {
                            login
                            avatarUrl
                        }
                    }
                    pageInfo {
                        endCursor
                        startCursor
                    }
                }
            }
        }`;
}

const removeValueFromArray = (array, value) => {
    return array.filter((item) => item !== value);
}

app.get("/prs", (request, response) => {
    console.log("Request received: " + request.query.owner + ", " + request.query.repo);
    response.append('Access-Control-Allow-Origin', ['*']);
    response.append('Access-Control-Allow-Methods', 'GET');
    if (request.query.owner && request.query.repo) {
        fetchAndBuildData(request.query.owner, request.query.repo).then(data => {
            response.json(data);
        });
    } else {
        response.json({ error: "Repository not available." });
    }
});

app.post("/build-data", (request, response) => {
    console.log("Request received for buildData: " + request.query.key);
    response.append('Access-Control-Allow-Origin', ['*']);
    response.append('Access-Control-Allow-Methods', 'GET');
    if (request.query.key) {
        let contest = await Contest.findOne({key: request.query.key});
        buildData(contest).then(() => {
            response.json({ status: "Success" });
        });
    } else {
        response.json({ error: "Repository not available." });
    }
});

module.exports.handler = serverless(app);
