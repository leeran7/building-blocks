# Security Baseline

Derived from OWASP's Database Security cheat sheet. Every new object and
every audited object clears this bar.

- **No default or shared accounts.** Never `root`, `sa`, `SYS`, `postgres`
  for application traffic. One low-privilege account per service; separate
  accounts for admin, backup, read-only, migrations.
- **Least privilege.** Grant `SELECT`/`INSERT`/`UPDATE`/`DELETE` only where
  the service needs it. Never `SUPERUSER`, never table ownership from an
  app account. Deny direct table access when a view can scope columns/rows.
- **Row-level security** for any table where a row is scoped to a
  tenant/user; assert the policy exists, not just the intent to add one.
- **TLS 1.2+** for every connection, with cert verification on the client
  side. Reject unencrypted connections at the server.
- **Encryption at rest** for the database, its WAL/transaction logs, and
  its backups. WAL on a separate volume from the data files.
- **Secrets** — connection strings and keys live in a secret store, never
  in source, never in a column, never in a log line.
- **Restrict connections** to allowed hosts (`pg_hba.conf` or engine
  equivalent). App servers, migration runners, jump hosts — nothing else.
- **PII/PHI/PCI classification** per column, with the deletion path
  named. A classification with no deletion mechanism is a compliance bug.
