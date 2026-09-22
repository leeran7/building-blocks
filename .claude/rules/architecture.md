When a counter is partitioned, every key that gates writes to it must gain the
partition (dedup, rate limit, hourly ceiling, uniqueness).

Enforce uniqueness at every write site for any collection later read with
.find(x => x.key === k).

Never replace an O(1) closed-form with a per-index scan without a prefix-sum or
memo in the same change. Treat a >10x suite-runtime jump as a perf regression.

When a cache key goes from low to unbounded cardinality, add eviction in the same
change.

Declare every index application logic depends on in the schema the ORM will not
drop. Indexes that exist only in a one-off SQL file vanish on db push.

Keyset pagination on a non-unique column (created_at) silently skips or
duplicates rows when values tie across a page boundary. Order by and cursor on a
tuple ending in a unique id, and carry that id in the cursor the caller pages
with.
