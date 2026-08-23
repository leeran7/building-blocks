/**
 * Firebase Admin SDK — server-side only.
 *
 * Initializes the Admin app once (singleton pattern matching Prisma client).
 * Never import this from client components — it contains service account credentials.
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

if (!getApps().length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin not configured: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }

  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export const adminAuth = getAuth();

/**
 * Verify a Firebase ID token and return the decoded token payload.
 * Throws if the token is invalid or expired.
 */
export async function verifyIdToken(token: string) {
  return adminAuth.verifyIdToken(token);
}
