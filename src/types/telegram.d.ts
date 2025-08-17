export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initDataUnsafe?: {
          user?: { id?: number; username?: string; first_name?: string; last_name?: string };
          start_param?: string;
        };
        expand?: () => void;
        ready?: () => void;
      };
    };
  }
}
