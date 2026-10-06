# Test Evidence

- **Date:** 2026-10-06
- **Local Base URL:** `http://localhost:8787/api`
**Client:** Windows `curl.exe` against the running local Hono server

The request JSON was piped to curl stdin (`--data-binary "@-"`) to preserve quotes under Windows PowerShell. The created booking was deleted at the end, leaving the seeded equipment available for another run.

| # | Request | Observed result |
|---:|---|---|
| 1 | `GET /equipment` | `200`; returned `eq-1`, `eq-2`, and `eq-3` |
| 2 | `POST /bookings` with the sample booking | `201`; returned booking `86297791-8785-455d-b6b5-9c02f72d7ec1` |
| 3 | `GET /bookings/86297791-8785-455d-b6b5-9c02f72d7ec1` | `200`; returned the created booking |
| 4 | `POST /bookings` with the same equipment and interval | `409`; `{"error":"The equipment is already booked during this time"}` |
| 5 | `PATCH /bookings/86297791-8785-455d-b6b5-9c02f72d7ec1` with a new purpose | `200`; returned the updated booking |
| 6 | `POST /bookings` where `startAt` is after `endAt` | `400`; `{"error":"startAt must be before endAt"}` |
| 7 | `DELETE /bookings/86297791-8785-455d-b6b5-9c02f72d7ec1` | `204`; empty response body |
| 8 | `GET /bookings/86297791-8785-455d-b6b5-9c02f72d7ec1` after deletion | `404`; `{"error":"Booking not found"}` |

## CORS / frontend tester

Sent a browser-style preflight with `curl.exe -i -X OPTIONS http://localhost:8787/api/bookings -H "Origin: http://localhost:5500" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: Content-Type"`.

Observed `204 No Content` with `Access-Control-Allow-Origin: http://localhost:5500`, `Access-Control-Allow-Methods: GET,POST,PATCH,DELETE,OPTIONS`, and `Access-Control-Allow-Headers: Content-Type`.

The local browser tester at `http://localhost:5500` was then used against `http://localhost:8787/api`. Browser-observed results: equipment/list loaded; create `201`; read `200`; update `200`; overlapping create `409`; invalid interval `400`; delete `204`; refreshed list `0 records`. The page also rendered at a 390px viewport with no horizontal overflow. Test bookings were deleted. This local tester is a substitute; the instructor-provided tester was not found.

Automated verification also passed: `npm.cmd test` (9 tests), `npm.cmd run typecheck`, and `npm.cmd run build`.

## Official cURL Quick Test Guide sequence

Ran the supplied guide's nine requests in order using PowerShell-compatible `curl.exe` commands. JSON bodies were piped through stdin to preserve quoting; the requests and expected outcomes were otherwise the guide's sequence.

| Guide step | Request | Observed result |
|---:|---|---|
| 1 | `GET /equipment` | `200`; three equipment records |
| 2 | `GET /bookings` | `200`; empty list before test |
| 3 | `POST /bookings` sample | `201`; booking `06003b66-ad20-4882-b4d5-7a027f0ed65d` |
| 4 | `GET /bookings/:id` | `200`; returned the created booking |
| 5 | `PATCH /bookings/:id` to 12:00–14:00 | `200`; returned the updated interval |
| 6 | `POST /bookings` with end before start | `400`; `{"error":"startAt must be before endAt"}` |
| 7 | `POST /bookings` overlapping 12:30–13:30 | `409`; JSON conflict error |
| 8 | `GET /bookings/not-found` | `404`; `{"error":"Booking not found"}` |
| 9 | `DELETE /bookings/:id` | `204`; empty response body |

After cleanup, `GET /bookings` returned `200` and `[]`.

The PowerShell POST example in `API_CONTRACT.md` was executed against the running API: it returned `201` for booking `4fca236c-eb44-463f-8a33-e63de6924403`, and cleanup returned `204`.

## Cloudflare Workers + D1 deployment

- **Deployed API Base URL:** `https://campus-equipment-booking-api.suphanat-dev.workers.dev/api`
- **D1 database:** `campus-equipment-bookings` (`536931b1-4658-407c-a766-7ef0966dd52a`)

The D1 migration `0001_initial.sql` applied successfully. `npm.cmd run test:cloudflare` then ran against the deployed Worker and passed all 11 requests:

| Request | Observed status |
|---|---:|
| `GET /equipment` | 200 |
| `GET /bookings` | 200 |
| CORS `OPTIONS /bookings` from `http://localhost:5500` | 204 |
| `POST /bookings` | 201 |
| `GET /bookings/:id` | 200 |
| `PATCH /bookings/:id` | 200 |
| invalid time `POST /bookings` | 400 |
| overlapping `POST /bookings` | 409 |
| `GET /bookings/not-found` | 404 |
| `DELETE /bookings/:id` | 204 |
| confirm deleted booking is missing | 404 |

The smoke test removed its test booking and verified that it could no longer be read.

