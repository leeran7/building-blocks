/**
 * Minimal in-memory Prisma stand-in for behavioural tests of src/db/*.
 *
 * Currently only the payment dead-letter path is exercised here (the block /
 * season / payment fakes went away with the paid-stacks removal).
 */

export const store: Store = {
  deadLetters: [],
};

export const fakePrisma = {
  paymentDeadLetter: {
    create: async ({ data }: { data: FakeDeadLetter }): Promise<FakeDeadLetter> => {
      store.deadLetters.push(data);
      return { ...data };
    },
  },
};

export function resetStore(): void {
  store.deadLetters = [];
}

export interface FakeDeadLetter {
  stripe_session_id: string;
  event_type: string;
  amount_cents: number;
  reason: string;
}

export interface Store {
  deadLetters: FakeDeadLetter[];
}
