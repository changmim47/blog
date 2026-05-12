/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_KEY: string;
  // Google AdSense (활성화 후 설정 — 선택)
  readonly VITE_ADSENSE_CLIENT?: string;        // ca-pub-XXXXXXXXXXXXXXXX
  readonly VITE_ADSENSE_SLOT_BANNER?: string;
  readonly VITE_ADSENSE_SLOT_INFEED?: string;
  readonly VITE_ADSENSE_SLOT_RECTANGLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
