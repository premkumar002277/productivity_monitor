# WorkWatch

WorkWatch is a monorepo for an employee productivity monitoring app with a React employee/admin client, an Express + Socket.io API, MySQL persistence through Prisma, Redis-backed token/session helpers, and Bull jobs for rollups and retention cleanup.

The project in this repository is scaffolded from the provided MySQL blueprint and includes:

- JWT auth with refresh rotation
- Employee session start/stop flow
- Event batching for face/tab/idle signals
- Emotion detection, head pose estimation, and mouse/keyboard behavior sampling
- Server-side productivity scoring with emotion and behavior weighting
- Live admin updates over Socket.io
- Daily rollup, emotion rollup, and retention cleanup jobs
- Docker Compose for MySQL, Redis, client, and server

## Quick start

1. Copy `.env.example` to `.env`.
2. Install Node.js 20+ and run `npm install`.
3. Start infrastructure with `docker compose up mysql redis -d`.
4. Generate the Prisma client with `npm run prisma:generate --workspace @workwatch/server`.
5. Create your first migration with `npm run prisma:migrate --workspace @workwatch/server`.
6. Start the API with `npm run dev:server`.
7. Start the React app with `npm run dev:client`.

## Workspace scripts

- `npm run dev:server` starts the Express + Socket.io API
- `npm run dev:client` starts the Vite client
- `npm run build` builds both workspaces
- `npm run test` runs the server Jest suite

## Notes

- The browser app uses `face-api.js` and expects Tiny Face Detector, Face Landmark 68, and Face Expression model files under `apps/client/public/models`.
- Keyboard monitoring records timing metadata only. It does not store actual key values.
- The default raw event/emotion retention window is `30` days via `RETENTION_DAYS`.
- The current implementation is structured for a college/demo build and should be hardened further before any real deployment because monitoring software has legal and privacy implications.
