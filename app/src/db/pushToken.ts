import { prisma } from "./client";

export async function registerPushToken(
  userId: string,
  token: string,
  platform: string
): Promise<void> {
  await prisma.pushToken.upsert({
    where: { token },
    update: { user_id: userId, platform },
    create: { user_id: userId, token, platform },
  });
}

export async function unregisterPushToken(
  token: string,
  userId?: string
): Promise<void> {
  await prisma.pushToken.deleteMany({
    where: { token, ...(userId ? { user_id: userId } : {}) },
  });
}

export async function getPushTokensForUser(
  userId: string
): Promise<string[]> {
  const rows = await prisma.pushToken.findMany({
    where: { user_id: userId },
    select: { token: true },
  });
  return rows.map((r) => r.token);
}

export async function removeStalePushTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await prisma.pushToken.deleteMany({
    where: { token: { in: tokens } },
  });
}
