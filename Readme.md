Deployed here: https://ohwoj3u4oi.execute-api.us-east-1.amazonaws.com/dev/prs

Run locally: 
    - First install the serveless cli (https://www.serverless.com/framework/docs/getting-started/)
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
