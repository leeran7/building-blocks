import { getMessaging } from "firebase-admin/messaging";
import "./firebaseAdmin";
import { getPushTokensForUser, removeStalePushTokens } from "../db/pushToken";

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  const tokens = await getPushTokensForUser(userId);
  if (tokens.length === 0) return;

  const messaging = getMessaging();
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data,
    apns: {
      payload: {
        aps: { sound: "default" },
      },
    },
    android: {
      priority: "high",
      notification: { sound: "default" },
    },
  });

  const stale: string[] = [];
  response.responses.forEach((r, i) => {
    if (
      r.error &&
      (r.error.code === "messaging/registration-token-not-registered" ||
        r.error.code === "messaging/invalid-registration-token")
    ) {
      stale.push(tokens[i]);
    }
  });
  if (stale.length > 0) {
    await removeStalePushTokens(stale).catch(() => {});
  }
}
