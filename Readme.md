> Ranks contributors for a Github repository based on number of pull requests merged.

This is an API which is used here: https://github.com/virajvchavan/github-leaderboards-ui

Code is supposed to be deployed as serverless functions.

Built this to try out serverless deployments and the Serverless Framework (http://serverless.com/).

Deployed here: https://ohwoj3u4oi.execute-api.us-east-1.amazonaws.com/dev/prs
E.g.: https://ohwoj3u4oi.execute-api.us-east-1.amazonaws.com/dev/prs?owner=denoland&repo=deno

Run locally: 
    - First install the serveless cli (https://www.serverless.com/framework/docs/getting-started/)
    - Add a file env.yml with the required environment variables
    - `serverless offline start`
Run locally with debug mode: `SLS_DEBUG=* serverless offline start`
Deploy to cloud: `serverless deploy`
http://localhost:3000/dev/prs?owner=denoland&repo=deno

The API:
- GET `/prs?owner=denoland&repo=deno`
    - Three possible responses:
        -  `{ status: "processing" }`
        -  `{ status: "done", users: [{username, merged_prs, open_prs}, ...] } // users are sorted by merged_prs_count`
        -  `{ status: "error" }`

- View logs for the deployed app:
    `serverless logs -f leaderboard -t`
