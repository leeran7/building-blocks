import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

/**
 * Thin haptics wrapper — no-ops on web/SSR, fires native taptic feedback on
 * device. Wrap in try/catch so a missing plugin never breaks interaction.
 */
const isNative = Capacitor.isNativePlatform();

export async function tapLight() {
  if (!isNative) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* ignore */
  }
}

export async function tapMedium() {
  if (!isNative) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    /* ignore */
  }
}

/** The heaviest thud — reserve for the single dominant action (PLAY). */
export async function tapHeavy() {
  if (!isNative) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Heavy });
  } catch {
    /* ignore */
  }
}

export async function notifySuccess() {
  if (!isNative) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* ignore */
  }
}

export async function notifyError() {
  if (!isNative) return;
  try {
    await Haptics.notification({ type: NotificationType.Error });
  } catch {
    /* ignore */
  }
}
