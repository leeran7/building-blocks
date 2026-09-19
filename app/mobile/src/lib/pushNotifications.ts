import { Capacitor } from "@capacitor/core";
import {
  FirebaseMessaging,
  type GetTokenResult,
} from "@capacitor-firebase/messaging";
import { apiFetch } from "./api";

let registered = false;

export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform() || registered) return;

  const permission = await FirebaseMessaging.requestPermissions();
  if (permission.receive !== "granted") return;

  let result: GetTokenResult;
  try {
    result = await FirebaseMessaging.getToken();
  } catch {
    return;
  }

  const platform = Capacitor.getPlatform() as "ios" | "android";
  await apiFetch("/api/push/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: result.token, platform }),
  }).catch(() => {});

  registered = true;

  await FirebaseMessaging.addListener("tokenReceived", async ({ token }) => {
    await apiFetch("/api/push/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, platform }),
    }).catch(() => {});
  });
}

export async function unregisterPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { token } = await FirebaseMessaging.getToken();
    await apiFetch("/api/push/register", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => {});
    await FirebaseMessaging.deleteToken();
  } catch {
    // Best-effort
  }
  registered = false;
}
