Run locally: 
    - First install the serveless cli (https://www.serverless.com/framework/docs/getting-started/)
    - `serverless offline start`
Run locally with debug mode: `SLS_DEBUG=* serverless offline start`
Deploy to cloud: `serverless deploy`
localhost:3000/dev/prs?owner=denoland&repo=deno

The API:
- GET /prs?owner=denoland&repo=deno
    - Three possible responses:
        1. { status: "processing" }
        2. { status: "done", users: [{username, merged_prs, open_prs}, ...] } // users are sorted by merged_prs_count
        3. { status: "error" }

