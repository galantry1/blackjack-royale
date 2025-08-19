// src/lib/realtime.ts
import { io, Socket } from "socket.io-client";

export type MatchHandlers = {
  onQueued?: () => void;
  onMatchFound?: (payload: { roomId: string; players: string[] }) => void;
  onError?: (message: string) => void;
};

export function createRealtime(userId: string) {
  const base =
    (import.meta as any)?.env?.VITE_WS_URL?.trim?.() ||
    (location.hostname === "localhost"
      ? "http://localhost:3001"
      : new URL((import.meta as any)?.env?.VITE_API_URL ?? "https://blackjack-royale-backend.onrender.com").origin);

  const socket: Socket = io(base, { transports: ["websocket"] });

  function hello() {
    socket.emit("hello", { userId });
  }

  function bindHandlers(h: MatchHandlers) {
    if (h.onQueued) socket.on("queued", h.onQueued);
    if (h.onMatchFound) socket.on("match_found", h.onMatchFound);
    socket.on("error_msg", (m: any) => h.onError?.(m?.message || "Ошибка соединения"));
  }

  function joinQueue() {
    socket.emit("join_queue");
  }
  function cancelQueue() {
    socket.emit("cancel_queue");
  }

  function createPrivate(cb: (room: { roomId: string }) => void) {
    socket.emit("create_private", null, cb);
  }
  function joinPrivate(roomId: string) {
    socket.emit("join_private", { roomId });
  }

  function close() {
    socket.close();
  }

  return { socket, hello, bindHandlers, joinQueue, cancelQueue, createPrivate, joinPrivate, close };
}
