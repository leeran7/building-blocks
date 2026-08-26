/**
 * Firebase client SDK — browser-side only.
 *
 * Safe to import from client components. Contains only public config values
 * (from PUBLIC_CONFIG) — no secrets.
 */

import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { PUBLIC_CONFIG } from "../config/public";

const firebaseConfig = PUBLIC_CONFIG.firebase;

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
