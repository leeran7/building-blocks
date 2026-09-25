/**
 * In-memory Prisma stand-in for the user-naming read paths: users,
 * friendships, climb records and challenges. Every user relation is projected
 * through the query's own `select`, so a query that forgets `avatar_id`
 * returns a row without it, exactly like Prisma, and the name it builds falls
 * back to the hash animal. Tests that assert the avatar-aware name therefore
 * fail when a select drops the column.
 */

export interface FakeUser {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_id: string | null;
  leaderboard_consent_at: Date | null;
}
export interface FakeFriendship {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted";
  created_at: Date;
  updated_at: Date;
}
export interface FakeRecord {
  userId: string;
  category_slug: string;
  peak_y: number;
  wins: number;
  updated_at: Date;
}
export interface FakeChallenge {
  id: string;
  sender_id: string;
  recipient_id: string;
  category_slug: string;
  status: "pending" | "accepted" | "declined";
  duel_id: string | null;
  expires_at: Date;
  created_at: Date;
}

export const db = {
  users: new Map<string, FakeUser>(),
  friendships: [] as FakeFriendship[],
  records: [] as FakeRecord[],
  challenges: [] as FakeChallenge[],
};

export function resetDb(): void {
  db.users.clear();
  db.friendships.length = 0;
  db.records.length = 0;
  db.challenges.length = 0;
}

type Select = Record<string, unknown>;

function project<T extends object>(row: T, select: Select | undefined): Partial<T> {
  if (!select) return { ...row };
  return Object.fromEntries(Object.entries(row).filter(([k]) => select[k] === true)) as Partial<T>;
}

function userOrThrow(id: string): FakeUser {
  const u = db.users.get(id);
  if (!u) throw new Error(`fakeSocialPrisma: no user ${id}`);
  return u;
}

/** `{ sender: { select }, receiver: { select } }` include → projected relations. */
function withUsers(
  row: FakeFriendship | FakeChallenge,
  include: Record<string, { select: Select }> | undefined,
  keys: Record<string, string>
): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...row };
  const out: Record<string, unknown> = { ...row };
  for (const [relation, fk] of Object.entries(keys)) {
    const spec = include?.[relation];
    if (spec) out[relation] = project(userOrThrow(String(flat[fk])), spec.select);
  }
  return out;
}

interface IdIn {
  in: string[];
}
interface FriendshipWhere {
  id?: string;
  status?: string;
  sender_id?: string;
  receiver_id?: string;
  OR?: Array<{ sender_id?: string; receiver_id?: string }>;
}
function matchesFriendship(f: FakeFriendship, where: FriendshipWhere): boolean {
  if (where.id !== undefined && f.id !== where.id) return false;
  if (where.status !== undefined && f.status !== where.status) return false;
  if (where.sender_id !== undefined && f.sender_id !== where.sender_id) return false;
  if (where.receiver_id !== undefined && f.receiver_id !== where.receiver_id) return false;
  if (where.OR && !where.OR.some((c) => c.sender_id === f.sender_id || c.receiver_id === f.receiver_id)) return false;
  return true;
}

interface ChallengeWhere {
  status?: string;
  OR?: Array<{ sender_id?: string; recipient_id?: string }>;
}

const FRIENDSHIP_USERS = { sender: "sender_id", receiver: "receiver_id" };
const CHALLENGE_USERS = { sender: "sender_id", recipient: "recipient_id" };

export const fakePrisma = {
  user: {
    findUnique: async ({ where, select }: { where: { id?: string; username?: string }; select?: Select }) => {
      const u =
        where.id !== undefined
          ? db.users.get(where.id)
          : [...db.users.values()].find((x) => x.username !== null && x.username === where.username);
      return u ? project(u, select) : null;
    },
    findMany: async ({ where, select }: { where: { id: IdIn }; select?: Select }) =>
      [...db.users.values()].filter((u) => where.id.in.includes(u.id)).map((u) => project(u, select)),
    /** User search: exact username (the fake has no emails), excluding `id.not`. */
    findFirst: async ({ where, select }: { where: { username?: string; id?: { not: string } }; select?: Select }) => {
      const u = [...db.users.values()].find(
        (x) => where.username !== undefined && x.username === where.username && x.id !== where.id?.not
      );
      return u ? project(u, select) : null;
    },
  },
  friendship: {
    findMany: async ({
      where,
      include,
      select,
    }: {
      where: FriendshipWhere;
      include?: Record<string, { select: Select }>;
      select?: Select;
    }) =>
      db.friendships
        .filter((f) => matchesFriendship(f, where))
        .map((f) => (select ? project(f, select) : withUsers(f, include, FRIENDSHIP_USERS))),
    findUnique: async ({ where, select }: { where: { id: string }; select?: Select }) => {
      const f = db.friendships.find((x) => x.id === where.id);
      return f ? project(f, select) : null;
    },
  },
  climbRun: {
    create: async () => ({}),
    findMany: async () => [],
  },
  savedSocialHandle: {
    findMany: async () => [],
  },
  /** recordClimb's peak upsert: the stored record is returned unchanged. */
  $queryRaw: async () => [{ peak_y: db.records[0]?.peak_y ?? 0, improved: false }],
  climbRecord: {
    count: async () => db.records.length,
    findUnique: async ({
      where,
      select,
    }: {
      where: { climb_record_user_category: { userId: string; category_slug: string } };
      select: { user: { select: Select } } & Select;
    }) => {
      const key = where.climb_record_user_category;
      const r = db.records.find((x) => x.userId === key.userId && x.category_slug === key.category_slug);
      return r ? { ...project(r, select), user: project(userOrThrow(r.userId), select.user.select) } : null;
    },
    findMany: async ({
      where,
      select,
    }: {
      where: {
        category_slug: string;
        userId?: IdIn;
        user?: { leaderboard_consent_at: { not: null } };
      };
      select: { user: { select: Select } } & Select;
    }) =>
      db.records
        .filter((r) => r.category_slug === where.category_slug)
        .filter((r) => !where.userId || where.userId.in.includes(r.userId))
        .filter((r) => !where.user || userOrThrow(r.userId).leaderboard_consent_at !== null)
        .sort((a, b) => b.peak_y - a.peak_y)
        .map((r) => ({
          ...project(r, select),
          user: project(userOrThrow(r.userId), select.user.select),
        })),
  },
  challenge: {
    findMany: async ({ where, include }: { where: ChallengeWhere; include: Record<string, { select: Select }> }) =>
      db.challenges
        .filter((c) => where.status === undefined || c.status === where.status)
        .filter(
          (c) => !where.OR || where.OR.some((o) => o.sender_id === c.sender_id || o.recipient_id === c.recipient_id)
        )
        .map((c) => withUsers(c, include, CHALLENGE_USERS)),
    findUnique: async ({ where, include }: { where: { id: string }; include: Record<string, { select: Select }> }) => {
      const c = db.challenges.find((x) => x.id === where.id);
      return c ? withUsers(c, include, CHALLENGE_USERS) : null;
    },
  },
};

export function addUser(u: Partial<FakeUser> & { id: string }): FakeUser {
  const row: FakeUser = {
    display_name: null,
    username: null,
    avatar_id: null,
    leaderboard_consent_at: new Date(0),
    ...u,
  };
  db.users.set(row.id, row);
  return row;
}

let seq = 0;
export function befriend(sender_id: string, receiver_id: string, status: FakeFriendship["status"] = "accepted"): FakeFriendship {
  const at = new Date(Date.UTC(2026, 0, 1) + seq * 1000);
  const f: FakeFriendship = { id: `fr-${++seq}`, sender_id, receiver_id, status, created_at: at, updated_at: at };
  db.friendships.push(f);
  return f;
}

export function challengeBetween(sender_id: string, recipient_id: string): FakeChallenge {
  const c: FakeChallenge = {
    id: `ch-${++seq}`,
    sender_id,
    recipient_id,
    category_slug: "classic",
    status: "pending",
    duel_id: null,
    expires_at: new Date(Date.now() + 3_600_000),
    created_at: new Date(),
  };
  db.challenges.push(c);
  return c;
}
