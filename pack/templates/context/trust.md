# Trust boundaries

Replace this file with **this product’s** irreversible or money-adjacent
writes. Security-reviewer starts here. Kernel OWASP rules live in
`skills/closed-loop/gates.md` and do not belong in this file.

Examples of what to list (delete these; write yours):

1. Which writes are monotonic or otherwise irreversible, and where the
   value is derived (client vs server).
2. Payment / webhook paths: which provider event credits the user, and
   how you ack so the provider retries only on real failures.
3. Shared-secret compares (use one constant-time helper; rate-limit new
   token routes the same way as existing ones).
4. Whether middleware is real authz or presence-only.
