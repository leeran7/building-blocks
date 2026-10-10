import { PortalApp } from "../../portal/PortalApp";
import { targetConfig } from "./config";

/** The Free-Climb-only portal shell, wired to the YouTube Playables SDK. */
export function TargetRoot() {
  return <PortalApp config={targetConfig} />;
}
