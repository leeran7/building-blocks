/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Preview builds only: backend origin, e.g. a Vercel preview URL. */
  readonly VITE_API_BASE?: string;
  /** Preview builds only: Vercel "Protection Bypass for Automation" secret. */
  readonly VITE_VERCEL_BYPASS?: string;
}
