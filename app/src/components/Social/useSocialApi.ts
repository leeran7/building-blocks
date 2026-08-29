"use client";

/**
 * Authenticated fetch helper for /api/social/** routes. Attaches the Firebase
 * ID token and normalizes error responses.
 */

import { useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";

export class SocialApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "SocialApiError";
    this.status = status;
    this.code = code;
  }
}

export function useSocialApi() {
  const { token } = useAuth();

  const request = useCallback(
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      if (!token) throw new SocialApiError("Not signed in", 401, "UNAUTHORIZED");

      const res = await fetch(path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(init?.headers ?? {}),
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new SocialApiError(data.error ?? "Request failed", res.status, data.code);
      }
      return data as T;
    },
    [token]
  );

  return { request, token };
}
