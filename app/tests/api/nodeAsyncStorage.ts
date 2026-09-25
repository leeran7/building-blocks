/**
 * Side-effect import: installs the AsyncLocalStorage global that Next's
 * request-scoped storage reads when its modules load. The Next server sets it
 * before any route runs, but plain vitest does not. Import this before
 * next/cache so a test can use Next's real cache.
 */
import { AsyncLocalStorage } from "node:async_hooks";

Object.assign(globalThis, { AsyncLocalStorage });
