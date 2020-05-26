const express = require("express");
const fetch = require("node-fetch");
const mongoose = require("mongoose");
var morgan = require("morgan");
const Contest = require('./models/Contest');

const BATCH_SIZE = 100; // Github API's limitation per request
const accessToken = "693b3c6b5ffb464ea368e81ceac8d6a7c5358140";

const app = express();
app.use(morgan("dev"));
mongoose.connect(
    "mongodb+srv://viraj:virajpassword@cluster0-qvgd5.mongodb.net/repos?retryWrites=true&w=majority",
    { useNewUrlParser: true, useUnifiedTopology: true }
);

let fetchAndBuildData = async (owner, repository) => {
    let contestKey = `${owner}/${repository}`;
    let contest = await Contest.findOne({key: contestKey}) || new Contest({key: contestKey});
    contest = await fetchPRs('merged', contest);
    contest = await fetchPRs('open', contest);
    contest = await fetchPRs('closed', contest);
    if(contest.error) {
        return contest;
    } else {
        await contest.save();
    }
    return { users: contest.users };
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
            Authorization: `Bearer ${accessToken}`,
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
