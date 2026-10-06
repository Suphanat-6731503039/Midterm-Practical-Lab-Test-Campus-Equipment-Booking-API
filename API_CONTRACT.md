# API Contract

- **Local Base URL:** `http://localhost:8787/api`
- **Cloudflare Base URL:** `https://campus-equipment-booking-api.suphanat-dev.workers.dev/api`

## Equipment

| Method | Path | Success | Result |
|---|---|---:|---|
| GET | `/equipment` | 200 | Array of equipment `{ id, name, location }` |

The starter database contains `eq-1` (Projector A, Building 1), `eq-2` (Camera Kit, Media Lab), and `eq-3` (Meeting Room 2, Building 2). Equipment is read-only in this API.

## Bookings

| Method | Path | Success | Result |
|---|---|---:|---|
| GET | `/bookings` | 200 | List of bookings, ordered by start time |
| GET | `/bookings/:id` | 200 | One booking |
| POST | `/bookings` | 201 | Create and return a booking |
| PATCH | `/bookings/:id` | 200 | Apply supplied fields and return the updated booking |
| DELETE | `/bookings/:id` | 204 | Delete; response has no body |

Create requires all five fields. PATCH accepts one or more of these fields:

```json
{
  "equipmentId": "eq-1",
  "borrowerName": "Somchai Jaidee",
  "startAt": "2026-10-20T09:00:00.000Z",
  "endAt": "2026-10-20T11:00:00.000Z",
  "purpose": "Class presentation"
}
```

Times must be valid ISO 8601 timestamps with a timezone. They are normalized to UTC in responses. Start must be earlier than end. A booking interval conflicts when `existing.startAt < requested.endAt` and `existing.endAt > requested.startAt`; equal endpoints are allowed. The rule applies to creates and updates, and only bookings for the same equipment are compared.

## Errors

All API errors use JSON: `{ "error": "..." }`.

| Status | Meaning |
|---:|---|
| 400 | Malformed JSON, missing/invalid field, invalid time range, or unknown `equipmentId` in the request |
| 404 | Booking or route does not exist |
| 409 | Requested equipment/time interval conflicts with another booking |
| 500 | Unexpected server/database error |

A referenced equipment ID that does not exist is treated as invalid input (`400`); `404` is reserved for the booking resource addressed by its URL. SQL uses bound parameters for all request values.

## Browser tester (CORS)

The API allows browser requests from common local tester origins on ports 3000, 5173, 5500, and 8080. For another tester origin, set `CORS_ORIGINS` to its exact origin before starting the server; multiple origins may be comma-separated. Preflight requests allow `GET`, `POST`, `PATCH`, and `DELETE` with the `Content-Type` header. Credentials are not enabled. Set the tester's API/base URL to `http://localhost:8787/api`.

## Quick requests

```powershell
$base = "http://localhost:8787/api"
curl.exe -i "$base/equipment"
curl.exe -i "$base/bookings"
$payload = '{"equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-21T09:00:00.000Z","endAt":"2026-10-21T11:00:00.000Z","purpose":"Class presentation"}'
$payload | curl.exe -i -X POST "$base/bookings" `
  -H "Content-Type: application/json" `
  --data-binary "@-"
```

PowerShell can alter embedded quotes when passing JSON as a native command argument, so this example pipes the body to curl stdin. For a full successful and error-case run against the local server, see [TEST_EVIDENCE.md](TEST_EVIDENCE.md).