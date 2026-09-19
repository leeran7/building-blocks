---
name: migration
description: >-
  Database migrations, schema changes, and data backfills. Use when adding
  columns, changing types, renaming fields, backfilling data, or reviewing
  migration safety.
---

# Migration Skill

Every schema change is a one-way door in production. Treat migrations as
infrastructure, not application code.

## Safety checklist

Before writing any migration:

1. **Can it run while the app serves traffic?** If a migration locks a table
   for longer than a request timeout, it needs a multi-step approach.
2. **Is it reversible?** Write a down migration. If the change is truly
   irreversible (dropping a column with data), call it out explicitly.
3. **Does it have a backfill?** Adding a NOT NULL column to a populated table
   needs a default or a backfill step, never a deploy-and-pray.

## Patterns

### Add a column

1. Add as nullable (no lock on large tables).
2. Deploy code that writes to the new column.
3. Backfill existing rows in batches.
4. Add NOT NULL constraint after backfill completes.

### Rename a column

1. Add the new column.
2. Deploy code that writes to both.
3. Backfill old column values into new.
4. Deploy code that reads from new only.
5. Drop the old column.

### Change a column type

Same expand-contract pattern: add new, dual-write, backfill, switch reads,
drop old. Never `ALTER COLUMN TYPE` on a large table in one step.

### Drop a column

1. Remove all application reads and writes first.
2. Deploy and verify no errors.
3. Drop in a separate migration.

## Backfill safety

- Batch writes (1000-5000 rows per batch). Never unbounded `UPDATE ... WHERE`.
- Add a progress log or counter. Silent backfills are undebuggable.
- Run backfills in a transaction per batch, not one giant transaction.
- Idempotent: re-running the backfill must not corrupt already-migrated rows.

## Indexes

- Declare every index the application depends on in the ORM schema, not just
  in a one-off SQL file. Indexes that exist only in migration files vanish on
  `db push` or schema reset.
- Create indexes `CONCURRENTLY` on large tables (Postgres). A regular
  `CREATE INDEX` locks writes.
- Add the index in a separate migration from the column change.

## Don't

- Run migrations and deploy application code in the same step
- Use `DROP TABLE` without confirming zero application references
- Backfill in a single transaction that holds a lock for minutes
- Trust that "the table is small" — it grows
- Skip the down migration because "we'll never need it"
