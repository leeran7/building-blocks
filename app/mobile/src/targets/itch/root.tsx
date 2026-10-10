import { PortalApp } from "../../portal/PortalApp";
import { targetConfig } from "./config";

/** The Free-Climb-only portal shell. itch.io has no SDK: saves stay on the device. */
export function TargetRoot() {
  return <PortalApp config={targetConfig} />;
}
