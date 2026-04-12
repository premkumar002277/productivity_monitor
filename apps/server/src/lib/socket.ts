import type { Server } from "socket.io";

let io: Server | null = null;

export function setSocketServer(server: Server) {
  io = server;
}

export function getSocketServer() {
  return io;
}

export function adminRoom(adminId: string) {
  return `admin:${adminId}`;
}

export function userRoom(userId: string) {
  return `user:${userId}`;
}

export function emitToAdmin(adminId: string | null | undefined, event: string, payload: unknown) {
  if (!adminId) {
    return;
  }

  io?.to(adminRoom(adminId)).emit(event, payload);
}
