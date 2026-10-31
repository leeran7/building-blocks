/**
 * The in-memory session cache (src/lib/sessionCache.ts) is module state, so a
 * list one test loaded would paint on the next test's first frame. Every test
 * starts with it empty.
 */
import { afterEach } from "vitest";
import { clearSessionCache } from "../../src/lib/sessionCache";

afterEach(() => clearSessionCache());
