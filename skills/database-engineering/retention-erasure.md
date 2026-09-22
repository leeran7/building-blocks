# Retention & Erasure

- **Soft delete is not erasure.** A soft-deleted row still contains the
  personal data and does not satisfy GDPR Article 17 or CCPA deletion. Soft
  delete is only a grace window; something must hard-delete on schedule.
- **Verifiable and irreversible.** Per EDPB, erasure must be provable.
  Ship a deletion job with a receipt (row count, timestamp, actor) that a
  DPO can audit. 30 days is the standard SLA — beat it or document why.
- **Audit trails.** A log that names a person may need to outlive the
  person's account. Strip or one-way hash the identifier at erasure so the
  log stays useful and the record can no longer be linked to a subject.
- **Backups.** Maintain a deletion index and re-apply it when a backup is
  restored. Do not treat restored backups as re-ingested data.
- **Retention window per column, not per table.** Two columns in one row
  can have different regulatory lifetimes; the model must allow it.
