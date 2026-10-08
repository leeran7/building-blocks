// The Discord build's Vite env keys (env.ts). Referenced from env.ts so the
// root tsc, which reaches env.ts through tests/discord, sees them too.
interface ImportMetaEnv {
  readonly VITE_DISCORD_CLIENT_ID?: string;
  readonly VITE_DISCORD_GEM_SKUS?: string;
}
