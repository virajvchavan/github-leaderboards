const express = require("express");
const fetch = require("node-fetch");
const BATCH_SIZE = 100; // Github API's limitation per request
const accessToken = "693b3c6b5ffb464ea368e81ceac8d6a7c5358140";

const app = express();

let fetchData = async (owner, repository) => {
    const query = `
        query { 
            repository(owner:"${owner}", name: "${repository}") {
                pullRequests(states:MERGED, first:${BATCH_SIZE}) {
                nodes {
                    author {
                        login
                    }
                }
                }
            }
        }`;

    let result = await fetch("https://api.github.com/graphql", {
        method: "POST",
        body: JSON.stringify({ query }),
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    })
    result = await result.json();
    if (result.errors) {
        return {
            errors: result.errors
        }
    } else {
        return result;
    }
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
