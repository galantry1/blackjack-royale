// src/types/telegram.d.ts
export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initDataUnsafe?: {
          user?: { id?: number; username?: string };
          start_param?: string;
        };
      };
    };
  }
}
