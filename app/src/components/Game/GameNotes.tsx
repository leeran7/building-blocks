/**
 * GameNotes — the labelled buttons a game section (/play, /daily) puts at the
 * right end of the stack tab band, each opening a modal (InfoDialog):
 * "Today's tower" (Daily only: date, countdown, streak, result, where to go
 * next), "Controls" (keys, power-ups, tips) and "About" (the page's copy).
 *
 * They used to be cards under the stage; in the band they are reachable
 * without scrolling past the game. Everything is still rendered into the page
 * inside the closed dialogs, so the About copy and links stay crawlable.
 *
 * Below `md` the tabs leave room for one button, so a single "Info" button
 * opens every section in one dialog. (On a touch screen the game stage covers
 * the band; this is for a narrower window with a mouse.)
 */

import type { ReactNode } from "react";
import { AboutIcon, ControlsIcon, InfoDialog, TodayIcon } from "../ui/InfoDialog";
import { ClimbControlsGuide } from "./ClimbControlsGuide";

const CONTROLS = "Controls & power-ups";

export function GameNotes({
  stack,
  aboutTitle,
  today,
  children,
}: {
  /** Names the narrow Info dialog: "Endless", "Daily Climb", "1v1". */
  stack: string;
  aboutTitle: string;
  /** Daily only: the Today's tower button's words and its dialog body. */
  today?: { text: ReactNode; content: ReactNode };
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex items-center gap-2 max-md:hidden">
        {today ? (
          <InfoDialog label="Today's tower" title="Today's tower" icon={<TodayIcon />} text={today.text}>
            {today.content}
          </InfoDialog>
        ) : null}
        <InfoDialog label={CONTROLS} title={CONTROLS} icon={<ControlsIcon />} text="Controls">
          <ClimbControlsGuide variant="plain" />
        </InfoDialog>
        <InfoDialog label={aboutTitle} title={aboutTitle} icon={<AboutIcon />} text="About">
          {children}
        </InfoDialog>
      </div>
      <div className="md:hidden">
        <InfoDialog
          label={today ? "Today's tower, controls and about" : "Controls and about"}
          title={stack}
          icon={<AboutIcon />}
          text="Info"
        >
          {today ? (
            <Section title="Today's tower" first>
              {today.content}
            </Section>
          ) : null}
          <Section title={CONTROLS} first={!today}>
            <ClimbControlsGuide variant="plain" />
          </Section>
          <Section title={aboutTitle}>{children}</Section>
        </InfoDialog>
      </div>
    </>
  );
}

function Section({ title, first = false, children }: { title: string; first?: boolean; children: ReactNode }) {
  return (
    <section className={first ? "" : "mt-6 border-t border-border-subtle pt-4"}>
      <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">{title}</h3>
      {children}
    </section>
  );
}
