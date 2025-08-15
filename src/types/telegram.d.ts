// src/types/telegram.d.ts
export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id?: number;
            username?: string;
            first_name?: string;
            last_name?: string;
            [k: string]: any;
          };
          [k: string]: any;
        };
        [k: string]: any;
      };
    };
  }
}
