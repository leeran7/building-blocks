---
name: api-design
description: >-
  API design conventions for REST and GraphQL. Resource naming, versioning,
  error shapes, pagination, and backward compatibility. Use when designing,
  reviewing, or extending an API surface.
---

# API Design Skill

An API is a contract. Breaking changes break trust. Design for the consumer
who reads no documentation.

## Resource naming

- Nouns, not verbs: `/users`, `/projects`, not `/getUsers`, `/createProject`.
- Plural collection names: `/users/123`, not `/user/123`.
- Nested resources for ownership: `/users/123/projects`, not
  `/projects?userId=123` (unless the resource exists independently).
- Kebab-case for multi-word paths: `/build-configs`, not `/buildConfigs`.

## HTTP methods

| Method | Semantics | Idempotent |
|--------|-----------|------------|
| GET | Read, no side effects | Yes |
| POST | Create or action | No |
| PUT | Full replace | Yes |
| PATCH | Partial update | Yes |
| DELETE | Remove | Yes |

Use POST for actions that don't map to CRUD: `/orders/123/cancel`, not
`DELETE /orders/123`.

## Error shape

Every error response uses the same envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Human-readable explanation",
    "details": [
      { "field": "email", "reason": "Must include @" }
    ]
  }
}
```

- `code` is a machine-stable string. Consumers switch on it.
- `message` is human-readable and may change without a version bump.
- `details` is optional, used for field-level validation.
- Never return a raw stack trace or internal error message.

## Pagination

- Cursor-based for real-time data or large collections.
- Offset-based only for small, stable datasets.
- Always return `hasNextPage` and `cursor` / `nextOffset`.
- Default page size in the server, not the client.

## Versioning

- URL prefix (`/v1/`, `/v2/`) for breaking changes.
- Additive changes (new optional fields, new endpoints) are not breaking.
- Removing a field, changing a type, or changing default behavior is breaking.
- Deprecate before removing: add a `Sunset` header and docs notice for at
  least one release cycle.

## Backward compatibility rules

These changes are **safe** (non-breaking):
- Adding a new optional request field
- Adding a new response field
- Adding a new endpoint
- Adding a new enum value (if consumers handle unknown values)

These changes are **breaking**:
- Removing or renaming a field
- Changing a field's type
- Making an optional field required
- Changing the meaning of a value
- Changing error codes consumers switch on

## Don't

- Return different error shapes from different endpoints
- Use HTTP 200 for errors with a `success: false` body
- Nest resources deeper than two levels (`/a/1/b/2/c` is too deep)
- Accept unbounded list inputs without a server-side limit
- Version every endpoint independently — version the API surface
