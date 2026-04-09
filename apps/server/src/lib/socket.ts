import type { Server } from "socket.io";

export const ADMIN_ROOM = "admin-room";

let io: Server | null = null;

export function setSocketServer(server: Server) {
  io = server;
}

export function getSocketServer() {
  return io;
}

export function emitToAdmins(event: string, payload: unknown) {
  io?.to(ADMIN_ROOM).emit(event, payload);
}
