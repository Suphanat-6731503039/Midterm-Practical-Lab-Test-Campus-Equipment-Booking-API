# Campus Equipment Booking API

A TypeScript/Hono API backed by SQLite. It seeds three equipment records and prevents overlapping bookings for the same equipment.

## Requirements and run

- Node.js 24 or newer (uses the built-in `node:sqlite` module)
- npm

From this folder, install dependencies and start the development server:

```powershell
npm.cmd install
npm.cmd run dev
```

The local API listens at `http://localhost:8787/api`. The default database is created at `data/bookings.sqlite`. Set `$env:PORT` or `$env:DB_PATH` before starting to override the defaults. The database is seeded with `eq-1` (Projector A), `eq-2` (Camera Kit), and `eq-3` (Meeting Room 2); `INSERT OR IGNORE` keeps existing records intact on restart.

### Cloudflare Workers + D1 deployment

The local Node server uses `node:sqlite`; Cloudflare uses the separate `src/worker.ts` entrypoint and the dedicated `campus-equipment-bookings` D1 database. The live API is `https://campus-equipment-booking-api.suphanat-dev.workers.dev/api`. The Wrangler config is in `wrangler.jsonc`, and the initial schema/seed data is in `migrations/0001_initial.sql`.

After authenticating with `npx.cmd wrangler@4 login`, apply the remote migration and deploy:

```powershell
npx.cmd wrangler@4 d1 migrations apply campus-equipment-bookings --remote
npx.cmd wrangler@4 deploy
```

Wrangler prints the deployed `workers.dev` URL. The API base URL is that URL plus `/api`. Do not run the deployment against the unrelated `student-db` used by another project.

Verify the deployed Worker and D1 with:

```powershell
npm.cmd run test:cloudflare
```

Set `$env:CLOUDFLARE_API_URL` first if the deployment uses a different URL. The smoke test deletes its own booking when finished.

### Browser tester and CORS

This project includes a small standalone browser tester at `public/tester.html`. Start it in a second PowerShell terminal:

```powershell
npm.cmd run tester
```

Open `http://localhost:5500`; the tester defaults to `http://localhost:8787/api` and supports equipment lookup plus booking create/read/update/delete. The tester is a local substitute, not an instructor-provided frontend.

The API allows common local tester origins (ports 3000, 5173, 5500, or 8080). Set the exact tester origin in `$env:CORS_ORIGINS` if it uses another host or port:

```powershell
$env:CORS_ORIGINS = "http://localhost:5500"
npm.cmd run dev
```

If using another tester, set its API/base URL to `http://localhost:8787/api` and replace the example CORS origin with that page's origin (scheme + host + port), then restart the API. CORS uses an explicit origin allowlist and does not enable credentials.

Run checks and create a production build with:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd start
```

`npm.cmd start` runs the build from `dist/`. For HTTP request examples and status-code rules, see [API_CONTRACT.md](API_CONTRACT.md). Test results and command-line HTTP evidence are recorded in [TEST_EVIDENCE.md](TEST_EVIDENCE.md).

The supplied assessment materials are included at [rubric_en.md](rubric_en.md), [quality_gate.md](quality_gate.md), and [curl_test_guide.md](curl_test_guide.md). [QUALITY_GATE_CHECKLIST.md](QUALITY_GATE_CHECKLIST.md) remains a student-created working copy for marking verified items; the official Quality Gate is the source of truth. [ORAL_REVIEW_GUIDE.md](ORAL_REVIEW_GUIDE.md) summarizes implementation decisions for personal study; it does not replace being able to explain the work independently.

[DESIGN_NOTES.md](DESIGN_NOTES.md) records the contract, schema assumptions, and status-code decisions. It is retrospective documentation and does not claim to satisfy the brief's before-implementation timing requirement.

## Data model

```text
equipment (1) ────────< bookings (many)
  id PK                    id PK
  name                     equipment_id FK -> equipment.id
  location                 borrower_name
                           start_at, end_at (UTC ISO 8601)
                           purpose
```

SQLite foreign keys protect the relationship. The local SQLite server uses triggers for insert/update overlap rejection; the Cloudflare D1 worker uses parameterized conditional insert/update statements with the same half-open interval rule. Adjacent intervals are allowed. All request values are bound as prepared-statement parameters.