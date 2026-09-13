import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

const HAPTICS_KEY = "haptics_enabled";
const isNative = Capacitor.isNativePlatform();

export function isHapticsEnabled(): boolean {
  try {
    return localStorage.getItem(HAPTICS_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HAPTICS_KEY, enabled ? "true" : "false");
  } catch {
    /* ignore */
  }
}

function canHaptic(): boolean {
  return isNative && isHapticsEnabled();
}

export async function tapLight() {
  if (!canHaptic()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* ignore */
  }
}

export async function tapMedium() {
  if (!canHaptic()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    /* ignore */
  }
}

/** The heaviest thud — reserve for the single dominant action (PLAY). */
export async function tapHeavy() {
  if (!canHaptic()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Heavy });
  } catch {
    /* ignore */
  }
}

export async function notifySuccess() {
  if (!canHaptic()) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* ignore */
  }
}

export async function notifyError() {
  if (!canHaptic()) return;
  try {
    await Haptics.notification({ type: NotificationType.Error });
  } catch {
    /* ignore */
  }
}
