import { API_BASE } from "./api";

const _origFetch = globalThis.fetch;

globalThis.fetch = function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof input === "string" && input.startsWith("/api/")) {
    input = `${API_BASE}${input}`;
  }
  return _origFetch.call(globalThis, input, init);
};
