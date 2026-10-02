/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** AI proxy farklı bir adresteyse (ör. kurum içi sunucu); varsayılan /api/ai. Gizli DEĞİLDİR. */
  readonly VITE_AI_PROXY_URL?: string;
}
