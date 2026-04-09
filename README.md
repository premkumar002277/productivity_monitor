# WorkWatch

WorkWatch is a monorepo for an employee productivity monitoring app with a React employee/admin client, an Express + Socket.io API, MySQL persistence through Prisma, Redis-backed token/session helpers, and Bull jobs for rollups and retention cleanup.

The project in this repository is scaffolded from the provided MySQL blueprint and includes:

- JWT auth with refresh rotation
- Employee session start/stop flow
- Event batching for face/tab/idle signals
- Server-side productivity scoring
- Live admin updates over Socket.io
- Daily rollup and retention job scaffolding
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

- The browser app uses `face-api.js` and expects Tiny Face Detector model files under `apps/client/public/models`.
- The current implementation is structured for a college/demo build and should be hardened further before any real deployment because monitoring software has legal and privacy implications.
