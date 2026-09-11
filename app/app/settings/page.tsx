import { cookies } from "next/headers";
import { verifyIdToken } from "../../src/lib/firebaseAdmin";
import { getUserSettings } from "../../src/db/settings";
import { SettingsForm } from "./SettingsForm";
import type { UserSettings } from "../../src/db/settings";

export default async function SettingsPage() {
  let initialData: UserSettings | null = null;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("firebaseToken")?.value;
    if (token) {
      const decoded = await verifyIdToken(token);
      initialData = await getUserSettings(decoded.uid);
    }
  } catch {
    // Expired or invalid token — SettingsForm will client-fetch via useAuth.
  }

  return <SettingsForm initialData={initialData} />;
}
