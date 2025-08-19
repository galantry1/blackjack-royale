// src/lib/socket.ts
import { io, Socket } from "socket.io-client";
import { BASE } from "./api";

/**
 * На проде Render иногда закрывает апгрейд на холодном старте.
 * Делаем попытку через websocket, при ошибке — переключаемся на polling.
 */

function makeSocket(opts?: { forcePolling?: boolean }) {
  const usePolling = !!opts?.forcePolling;

  const s: Socket = io(BASE, {
    path: "/socket.io",
    transports: usePolling ? ["polling"] : ["websocket", "polling"],
    withCredentials: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    timeout: 10000,
  });

  s.on("connect", () => {
    console.log("[WS] connected", s.id, usePolling ? "(polling)" : "(websocket preferred)");
  });

  // если «websocket error» — переинициализируемся в режиме polling
  let switched = false;
  s.on("connect_error", (err) => {
    console.warn("[WS] connect_error:", err?.message || err);
    const msg = String(err?.message || "").toLowerCase();

    // характерные тексты при срыве апгрейда/закрытии соединения на Render-е
    const looksLikeWsBlocked =
      msg.includes("websocket") ||
      msg.includes("transport close") ||
      msg.includes("failed") ||
      msg.includes("closed") ||
      msg.includes("eio");

    if (!usePolling && !switched && looksLikeWsBlocked) {
      switched = true;
      try {
        s.removeAllListeners();
        s.close();
      } catch {}
      // повторное подключение — только polling
      const fallback = makeSocket({ forcePolling: true });
      // подсунем наружу новый экземпляр
      (socket as any).io = (fallback as any).io;
      Object.assign(socket, fallback);
    }
  });

  return s;
}

export const socket = makeSocket();
