const express = require("express");
const fetch = require("node-fetch");
const mongoose = require("mongoose");
const Contest = require('./models/Contest');

const BATCH_SIZE = 100; // Github API's limitation per request
const accessToken = "693b3c6b5ffb464ea368e81ceac8d6a7c5358140";

const app = express();
mongoose.connect(
    "mongodb+srv://viraj:virajpassword@cluster0-qvgd5.mongodb.net/repos?retryWrites=true&w=majority",
    { useNewUrlParser: true, useUnifiedTopology: true }
);

let fetchData = async (owner, repository) => {
    let contestKey = `${owner}/${repository}`;
    let contest = await Contest.findOne({key: contestKey}) || new Contest({key: contestKey});
    contest = await fetchMergedPrs(contest);
    await contest.save();
    return { users: contest.users };
}

const fetchMergedPrs = async (contest) => {
    let result = await fetch("https://api.github.com/graphql", {
        method: "POST",
        body: JSON.stringify({ query: formQueryForPRs('merged', contest) }),
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    })
    result = await result.json();
    if (result.errors) {
        console.log("error fetching merged prs: ", result.errors);
    } else {
        let pullRequests = result['data']['repository']['pullRequests'];
        if (pullRequests['nodes'].length > 0) {
            if (pullRequests["pageInfo"]["endCursor"]) {
                contest.merged_prs_cursor =
                    pullRequests["pageInfo"]["endCursor"];
            }
            contest.users = contest.users || {};
            pullRequests["nodes"].forEach(async (pr) => {
                console.log(pr);
                let user = contest.users[pr.author.login] || {};
                if (!user.picture) user.picture = pr.author.avatarUrl;
                user.merged_prs = user.merged_prs || [];

                user.merged_prs.filter((value) => value !== pr.id);
                user.closed_prs &&
                    user.closed_prs.filter((value) => value !== pr.id);
                user.open_prs &&
                    user.open_prs.filter((value) => value !== pr.id);

                user.merged_prs.push(pr.id);
                contest.users[pr.author.login] = user;
            });
            contest = fetchMergedPrs(contest);
        }
    }
    return contest;
}

const formQueryForPRs = (type, contest) => {
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

app.get("/leaderboard", (request, response) => {
    if (request.query.owner && request.query.repo) {
        fetchData(request.query.owner, request.query.repo).then(data => {
            response.json(data);
        });
    } else {
        response.json({ error: "Repository not available" });
    }
});

app.listen(3000, () => {
    console.log("server started! On 3000");
});
