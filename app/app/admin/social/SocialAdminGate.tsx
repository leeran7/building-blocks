"use client";

/**
 * Gate for all /admin/social/** pages: requires Firebase auth + social-admin
 * allowlist (AC-2). Non-admins see a 403 message; unauthenticated users are
 * redirected to sign-in.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../src/contexts/AuthContext";
import { useSocialApi, SocialApiError } from "../../../src/components/Social/useSocialApi";

type GateState = "loading" | "allowed" | "forbidden" | "error";

export default function SocialAdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { request } = useSocialApi();
  const router = useRouter();
  const [state, setState] = useState<GateState>("loading");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/auth/signin?redirect=%2Fadmin%2Fsocial");
      return;
    }

    request<{ isSocialAdmin: boolean }>("/api/social/me")
      .then((data: { isSocialAdmin: boolean }) => setState(data.isSocialAdmin ? "allowed" : "forbidden"))
      .catch((err: unknown) => {
        if (err instanceof SocialApiError && err.status === 401) {
          router.replace("/auth/signin?redirect=%2Fadmin%2Fsocial");
          return;
        }
        setState("error");
      });
  }, [authLoading, user, request, router]);

  if (authLoading || state === "loading") {
    return (
      <div className="flex items-center justify-center py-24 text-text-muted text-sm">
        Checking admin access…
      </div>
    );
  }

  if (state === "forbidden") {
    return (
      <div className="rounded-xl border border-border bg-elevated p-8 text-center">
        <h1 className="font-display text-xl mb-2">Access denied</h1>
        <p className="text-text-muted text-sm">
          Your account is not on the social media admin allowlist. Contact an operator to add your UID or email to{" "}
          <code className="font-mono text-xs">ADMIN_UIDS</code> / <code className="font-mono text-xs">ADMIN_EMAILS</code>.
        </p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-xl border border-border bg-elevated p-8 text-center text-text-muted text-sm">
        Could not verify admin access. Try refreshing the page.
      </div>
    );
  }

  return <>{children}</>;
}
