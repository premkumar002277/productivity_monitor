import "dotenv/config";

import http from "http";

import { Server } from "socket.io";

import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { bootstrapJobs } from "./jobs";
import { prisma } from "./lib/prisma";
import { ensureRedisConnection, redis } from "./lib/redis";
import { adminRoom, setSocketServer, userRoom } from "./lib/socket";
import type { AccessTokenPayload } from "./services/jwt";
import { verifyAccessToken } from "./services/jwt";

async function main() {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (typeof token !== "string") {
        return next(new Error("Missing access token"));
      }

      socket.data.user = verifyAccessToken(token);
      return next();
    } catch {
      return next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as AccessTokenPayload;

    if (user.role === "ADMIN") {
      socket.join(adminRoom(user.sub));
    } else {
      socket.join(userRoom(user.sub));
    }

    socket.emit("socket:ready", {
      role: user.role,
    });
  });

  setSocketServer(io);
  await ensureRedisConnection();
  const queues = bootstrapJobs();

  server.listen(env.PORT, () => {
    logger.info(`WorkWatch server listening on port ${env.PORT}`);
  });

  const shutdown = async () => {
    logger.info("Shutting down WorkWatch server");

    await Promise.allSettled([
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
      prisma.$disconnect(),
      redis.isOpen ? redis.quit() : Promise.resolve("redis-already-closed"),
      ...queues.map((queue) => queue.close()),
    ]);

    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void main().catch((error) => {
  logger.error(error instanceof Error ? error.stack ?? error.message : "Fatal startup error");
  process.exit(1);
});
