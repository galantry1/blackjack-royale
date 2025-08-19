// src/lib/socket.ts
import { io } from "socket.io-client";
import { BASE } from "./api"; // у тебя BASE уже выбирается (VITE_API_URL или localhost)

export const socket = io(BASE, {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  withCredentials: false,
});

// Вспомогательная подписка с авто-логом (по желанию)
socket.on("connect", () => console.log("[WS] connected", socket.id));
socket.on("connect_error", (e) => console.warn("[WS] connect_error", e?.message));
