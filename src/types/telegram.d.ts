export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initDataUnsafe?: {
          user?: { id?: number; username?: string };
        };
      };
    };
  }
}
