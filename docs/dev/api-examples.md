# Generation API Quickstart

This document contains a few ready-to-run examples for exercising the chapter generation APIs. Replace the placeholder identifiers (`<projectId>`, `<chapterId>`, etc.) with real IDs from your environment before executing the commands.

## Prerequisites

- Backend server is running locally on `http://localhost:4000`.
- `.env` includes a valid `MONGO_URI` and OpenAI credentials.
- The target project already contains outline nodes and (optionally) memory/style resources.

## Start a Chapter Generation Job

```bash
curl -X POST "http://localhost:4000/api/projects/<projectId>/chapters/generate" \
  -H "Content-Type: application/json" \
  -d '{
        "outlineNodeId": "outline-node-1",
        "memoryIds": ["66f07acf588bc26a2c4c0331"],
        "targetLength": { "unit": "paragraphs", "value": 8 },
        "styleOverride": { "tone": "紧凑", "strength": 0.7 },
        "instructions": "聚焦主角与反派首次正面交锋"
      }'
```

A successful request returns HTTP 202 with a `jobId`. Use this identifier to attach to the Server-Sent Events (SSE) stream.

## Continue an Existing Chapter

```bash
curl -X POST "http://localhost:4000/api/projects/<projectId>/chapters/<chapterId>/continue" \
  -H "Content-Type: application/json" \
  -d '{
        "targetLength": { "unit": "characters", "value": 1200 },
        "styleProfileId": "66f07b05588bc26a2c4c0332",
        "memoryFragments": [
          {
            "label": "禁忌",
            "content": "主角不能透露真实身份",
            "type": "constraint"
          }
        ]
      }'
```

The continuation endpoint also responds with a `jobId` that can be streamed until completion.

## Subscribe to the SSE Stream

```bash
curl -N "http://localhost:4000/api/stream/<jobId>"
```

Events emitted by the stream:

- `start` – queue/initial status payload.
- `delta` – incremental text tokens (append them in arrival order).
- `progress` – percentage estimate based on the requested target length.
- `error` – emitted once if the job fails (followed by `done`).
- `done` – terminal event with the final job status (`completed`, `failed`, or `cancelled`).
- `heartbeat` – sent every 15 s to keep idle connections alive.

## Thunder Client Snippet

Import the JSON snippet below into [Thunder Client](https://www.thunderclient.com/) to get preconfigured requests:

```json
{
  "client": "thunder-client",
  "collectionName": "AI Novel Generation",
  "requests": [
    {
      "name": "Generate Chapter",
      "method": "POST",
      "url": "http://localhost:4000/api/projects/<projectId>/chapters/generate",
      "body": {
        "mode": "json",
        "json": {
          "outlineNodeId": "outline-node-1",
          "targetLength": { "unit": "paragraphs", "value": 6 }
        }
      }
    },
    {
      "name": "Continue Chapter",
      "method": "POST",
      "url": "http://localhost:4000/api/projects/<projectId>/chapters/<chapterId>/continue",
      "body": {
        "mode": "json",
        "json": {
          "targetLength": { "unit": "characters", "value": 900 }
        }
      }
    },
    {
      "name": "Stream Job",
      "method": "GET",
      "url": "http://localhost:4000/api/stream/<jobId>",
      "headers": [
        { "name": "Accept", "value": "text/event-stream" }
      ]
    }
  ]
}
```

> 💡 Use Thunder Client environment variables (e.g. `{{projectId}}`) to avoid editing each request manually.
