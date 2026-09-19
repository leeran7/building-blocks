Reject, never substitute a default. Allow-list parsers return null; user-keyed
lookups use Object.hasOwn (or equivalent). Permissive defaults plus write-on-read
create ghost records.

A monotonic or irreversible write makes its input a hard trust boundary. The
value must be server-derived. If a comment claims verification happens elsewhere,
confirm that path exists before merge.

Reuse the repo's own hardened helper. Do not hand-roll !== for secrets when a
constant-time compare already exists. New token-authenticated routes get the same
rate limiter as the others.

Never derive an outbound URL that carries a secret from a request value (host
header, origin, redirects).

Do not supply production secrets to a pull_request-triggered job. Same-repo
branch PRs plus install lifecycle scripts are an exfil path.
