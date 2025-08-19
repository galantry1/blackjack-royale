import { io } from "socket.io-client";
import { BASE } from "./api";

/** Единый клиент Socket.IO (использует тот же BASE + путь /socket.io) */
export const socket = io(BASE, {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  withCredentials: false,
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
});

// Логи — удобно при отладке
socket.on("connect", () => console.log("[WS] connected:", socket.id));
socket.on("disconnect", (reason) => console.log("[WS] disconnected:", reason));
socket.on("connect_error", (err) => console.error("[WS] connect_error:", err?.message));
