import type { RunMoment } from "@app/components/Game/runMoments";
import { notifySuccess, tapLight, tapMedium } from "./haptics";

/** A run moment's taptic: a success buzz for a new best, a medium tap for the rest, a light one when overtaken. */
export function momentHaptic(moment: RunMoment): void {
  if (moment.kind === "new-best") void notifySuccess();
  else if (moment.kind === "lost-lead") void tapLight();
  else void tapMedium();
}
