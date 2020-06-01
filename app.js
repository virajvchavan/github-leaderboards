const express = require("express");
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
        contest = new Contest({ key: contestKey, processing: true });
        await contest.save();
        buildData(contest);
        return { status: "Processing..." };
    } else {
        if (contest.processing) {
            return { status: "Processing..." };
        } else {
            await buildData(contest);
        }
    }
    return { users: await users_pr_counts(contestKey) };
}

const buildData = async (contest) => {
    contest = await fetchPRs('merged', contest);
    contest = contest.error ? contest : await fetchPRs('open', contest);
    contest = contest.error ? contest : await fetchPRs("closed", contest);
    if(contest.error) {
        return contest;
    } else {
        contest.processing = false;
        await contest.save();
    }
}

const users_pr_counts = async (contestKey) => {
    let contest = await Contest.findOne({ key: contestKey });
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
            return { error: "Repository not found." };
        }
    } else {
        let pullRequests = result['data']['repository']['pullRequests'];
        if (pullRequests['nodes'].length > 0) {
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

app.get("/leaderboard", (request, response) => {
    if (request.query.owner && request.query.repo) {
        fetchAndBuildData(request.query.owner, request.query.repo).then(data => {
            response.json(data);
        });
    } else {
        response.json({ error: "Repository not available" });
    }
});

app.listen(3000, () => {
    console.log("server started! On 3000");
});
