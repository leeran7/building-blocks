import crypto from "crypto";

function base64url(data: string | Buffer): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as string);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function makeJwt(): string {
  const keyId = process.env.APPSTORE_CONNECT_KEY_ID;
  const issuerId = process.env.APPSTORE_CONNECT_ISSUER_ID;
  const rawKey = process.env.APPSTORE_CONNECT_PRIVATE_KEY;

  if (!keyId || !issuerId || !rawKey) {
    throw new Error("Missing APPSTORE_CONNECT_* env vars");
  }

  // Support both newline-escaped (\n) and literal newline formats
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iss: issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" })
  );
  const message = `${header}.${payload}`;

  const sign = crypto.createSign("SHA256");
  sign.update(message);
  // ieee-p1363 gives raw r||s bytes required by JWT ES256 (not DER)
  const sig = sign.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${message}.${base64url(sig)}`;
}

export interface AscResult {
  success: boolean;
  alreadyExists?: boolean;
  error?: string;
}

/**
 * Add an external tester to a TestFlight beta group via the App Store Connect API.
 * Apple still sends them an invite email they must accept.
 */
export async function addTesterToGroup(email: string): Promise<AscResult> {
  const groupId = process.env.APPSTORE_CONNECT_BETA_GROUP_ID;
  if (!groupId) return { success: false, error: "APPSTORE_CONNECT_BETA_GROUP_ID not set" };

  let jwt: string;
  try {
    jwt = makeJwt();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const body = {
    data: {
      type: "betaTesters",
      attributes: { firstName: "Beta", lastName: "Tester", email },
      relationships: {
        betaGroups: { data: [{ type: "betaGroups", id: groupId }] },
      },
    },
  };

  let res: Response;
  try {
    res = await fetch("https://api.appstoreconnect.apple.com/v1/betaTesters", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { success: false, error: `Network error: ${(err as Error).message}` };
  }

  if (res.status === 409) return { success: true, alreadyExists: true };
  if (res.ok) return { success: true };

  const text = await res.text().catch(() => res.statusText);
  return { success: false, error: `ASC API ${res.status}: ${text}` };
}
