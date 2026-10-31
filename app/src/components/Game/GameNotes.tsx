/**
 * GameNotes — the collapsed cards under a game stage (/play, /daily):
 * "Controls & power-ups" and the page's About copy.
 *
 * One column for both, the same max-w-4xl the /daily header, streak strip and
 * "Keep climbing" block use, so the cards line up with the page and with each
 * other, and keep the same width when switching Play ↔ Daily. The bottom
 * margin lifts the last card clear of the ground glow at the page edge.
 */

import type { ReactNode } from "react";
import { Disclosure } from "../ui/Disclosure";
import { ClimbControlsGuide } from "./ClimbControlsGuide";

export function GameNotes({ aboutTitle, children }: { aboutTitle: string; children: ReactNode }) {
  return (
    <div className="mx-auto mt-6 mb-20 flex w-full max-w-4xl flex-col gap-3">
      <ClimbControlsGuide collapsible />
      <Disclosure title={aboutTitle}>{children}</Disclosure>
    </div>
  );
}
