# Oral Review Guide

These notes explain the implementation in this workspace. They were prepared with AI assistance; reading them is not evidence that the student independently understands the code. Use them to study, then practice explaining each answer without looking at the notes.

## Design decisions

### Data model

`equipment.id` is the primary key, and `bookings.equipment_id` is a foreign key to it. One equipment record can have many bookings. SQLite foreign-key enforcement is enabled when the database opens, and `ON DELETE RESTRICT` prevents removing equipment that still has bookings. See [src/db.ts](src/db.ts).

### Overlap rule

Treat each booking as a half-open interval: the start is included and the end is excluded. Two intervals overlap when:

```text
existing.startAt < requested.endAt
and
existing.endAt > requested.startAt
```

Both comparisons are strict, so a booking ending at 11:00 and another beginning at 11:00 are adjacent, not overlapping. Times are validated and normalized to UTC ISO 8601 before storage so string ordering is chronological. SQLite triggers enforce the rule on both insert and update; the update trigger excludes the row being updated. The route translates the trigger's `booking_overlap` error to `409`. See [src/db.ts](src/db.ts) and [src/app.ts](src/app.ts).

### Status codes

- `400 Bad Request`: submitted JSON or fields are missing/invalid, time order is invalid, or the referenced equipment ID is not valid for this request.
- `404 Not Found`: the booking named by the URL, or the route, does not exist.
- `409 Conflict`: the request is valid, but its equipment/time interval conflicts with a booking already stored.
- `201 Created`: the booking was inserted.
- `204 No Content`: the booking was deleted and there is no response body.

The equipment reference on create/update is treated as invalid submitted data (`400`); `404` is used for the addressed booking resource.

### SQL parameter binding

Queries keep their SQL structure fixed and pass request-derived values through `?` placeholders, for example `db.prepare("SELECT * FROM bookings WHERE id = ?").get(id)`. A borrower name containing SQL-looking text remains ordinary data. Placeholders protect values; they are not used to choose SQL table names or keywords. See [src/app.ts](src/app.ts).

### PATCH behavior

PATCH accepts one or more known fields. The handler loads the current booking, validates the supplied fields, merges them with the existing values, checks the complete time range and equipment reference, then runs a parameterized update. This prevents a partial change from bypassing whole-booking rules.

### CORS and the browser tester

The API reflects only an exact origin from its allowlist; `CORS_ORIGINS` can replace the local defaults. The local tester runs at `http://localhost:5500`, so it is explicitly allowed. The API answers preflight requests and permits the API methods plus `Content-Type`; credentials are disabled. CORS controls what browser JavaScript may read, not who can call the API, so it is not authentication. See [src/index.ts](src/index.ts) and [src/app.ts](src/app.ts).

## Practice questions

1. **Why use SQLite triggers as well as route validation?** Route checks provide useful HTTP errors, while triggers keep the overlap invariant at the database boundary for every insert/update path. The handler catches the known trigger error and returns `409`.
2. **Why are adjacent bookings accepted?** The overlap comparisons are strict. If one end equals the other start, neither interval contains a positive-duration intersection.
3. **Why return `409` instead of `400` for an overlap?** The booking fields are valid; the conflict is with the current stored state, so the client may choose a different time.
4. **Does CORS make the API secure?** No. CORS is a browser policy, not authentication or authorization. This lab API has no login layer and should not be exposed publicly as a production service.
5. **How was the browser integration checked?** The page at `http://localhost:5500` used `fetch` against `http://localhost:8787/api`; the recorded browser checks include create `201`, read/update `200`, invalid time `400`, overlap `409`, and delete `204`.
6. **How do you run the two local services?** Start `npm.cmd run dev` for the API and `npm.cmd run tester` for the tester, then open `http://localhost:5500`.

Before submission, explain these points in your own words and be ready to locate the trigger, prepared statements, CORS configuration, and corresponding tests.