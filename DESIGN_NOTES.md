# API Design Notes

**Record status:** This is a retrospective design record for the current implementation. It documents the contract and assumptions, but it is not proof that a written design artifact was saved before coding or before the 30-minute checkpoint.

## Scenario and assumptions

- A booking belongs to exactly one existing equipment record; equipment can have many bookings.
- Equipment is seeded locally because the brief requires at least two records and defines only a read endpoint for equipment.
- Local SQLite is used, which is one of the allowed storage options. The workspace initially contained no starter repository.
- Booking times must be timezone-qualified ISO 8601 and are normalized to UTC.
- Booking intervals are half-open: `[startAt, endAt)`. A booking ending exactly when another starts is allowed.
- A missing equipment reference in submitted data is `400`; a booking addressed by an absent URL ID is `404`; a valid time request that conflicts with stored state is `409`.
- The browser tester is an optional local utility. Its origin is explicitly allowlisted; CORS is not authentication.

## Contract and model

The required equipment route is `GET /api/equipment`. The booking resource supports `GET /api/bookings`, `GET /api/bookings/:id`, `POST /api/bookings`, `PATCH /api/bookings/:id`, and `DELETE /api/bookings/:id`.

```text
equipment (1) ────────< bookings (many)
  id PK                    id PK
  name                     equipment_id FK
  location                 borrower_name
                           start_at, end_at
                           purpose
```

Create requires all booking fields. PATCH accepts a non-empty subset, then validates the merged booking. Each interval must satisfy `startAt < endAt`. Two intervals overlap exactly when:

```text
existing.startAt < requested.endAt
and existing.endAt > requested.startAt
```

SQLite foreign keys and insert/update triggers preserve the relationship and interval invariant at the database boundary. Request values are bound through prepared statements.

## Verification links

- HTTP methods, payloads, statuses, and error meanings: [API_CONTRACT.md](API_CONTRACT.md)
- Implemented routes and CORS: [src/app.ts](src/app.ts)
- Tables, foreign key, and overlap triggers: [src/db.ts](src/db.ts)
- Automated, curl, and browser results: [TEST_EVIDENCE.md](TEST_EVIDENCE.md)