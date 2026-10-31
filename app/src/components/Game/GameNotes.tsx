/**
 * GameNotes — the help buttons a game section (/play, /daily) puts at the
 * right end of the stack tab band: "Controls & power-ups" and the page's
 * About copy, each opening in a modal (InfoDialog).
 *
 * They used to be two collapsed cards under the stage; in the band they are
 * reachable without scrolling past the game, and the page below the stage
 * ends with its own content. The About copy is still server-rendered into the
 * page (inside the closed dialog), so it stays crawlable.
 *
 * Below `sm` the tabs leave room for one button, not two, so a single
 * "How to play" button opens both sections in one dialog. (On a touch screen
 * the game stage covers the band; this is for a narrow window with a mouse.)
 */

import type { ReactNode } from "react";
import { AboutIcon, ControlsIcon, InfoDialog } from "../ui/InfoDialog";
import { ClimbControlsGuide } from "./ClimbControlsGuide";

const CONTROLS = "Controls & power-ups";

export function GameNotes({ aboutTitle, children }: { aboutTitle: string; children: ReactNode }) {
  return (
    <>
      <div className="flex items-center gap-2 max-sm:hidden">
        <InfoDialog label={CONTROLS} title={CONTROLS} icon={<ControlsIcon />}>
          <ClimbControlsGuide variant="plain" />
        </InfoDialog>
        <InfoDialog label={aboutTitle} title={aboutTitle} icon={<AboutIcon />}>
          {children}
        </InfoDialog>
      </div>
      <div className="sm:hidden">
        <InfoDialog label="How to play" title="How to play" icon={<AboutIcon />}>
          <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
            {CONTROLS}
          </h3>
          <ClimbControlsGuide variant="plain" />
          <h3 className="mt-6 mb-3 border-t border-border-subtle pt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
            {aboutTitle}
          </h3>
          {children}
        </InfoDialog>
      </div>
    </>
  );
}
