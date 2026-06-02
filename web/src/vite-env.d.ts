/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASEMAP_PMTILES_URL?: string;
  readonly VITE_GOOGLE_API_KEY: string;
  readonly VITE_GOOGLE_OAUTH_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
