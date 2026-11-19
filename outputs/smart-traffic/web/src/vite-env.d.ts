/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRANSPORT_MODE?: 'local' | 'public';
  readonly VITE_BUILD_ID?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_WS_URL?: string;
}
