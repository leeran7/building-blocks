"use client";

import { useEffect } from "react";
import { StatusPage } from "../src/components/ui/StatusPage";

/**
 * Any page that throws while rendering. Without this, a server error fell
 * through to Next's bare "Internal Server Error" text: no site header, no
 * title, no way back.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      {/* A client error boundary can't export metadata; React hoists this. */}
      <title>Something went wrong — Doomstack</title>
      <StatusPage
        eyebrow="Error"
        title="Something went wrong"
        primary={{ label: "Try again", onClick: reset }}
        secondary={{ label: "Go home", href: "/" }}
      >
        <p>This page hit a problem on our side. Try again, or head home and pick up the climb from there.</p>
      </StatusPage>
    </>
  );
}
