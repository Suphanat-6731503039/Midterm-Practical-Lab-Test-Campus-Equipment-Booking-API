import assert from "node:assert/strict";

const baseUrl = (process.env.CLOUDFLARE_API_URL ??
  "https://campus-equipment-booking-api.suphanat-dev.workers.dev/api").replace(/\/+$/, "");
let bookingId;
const observed = [];

async function request(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  observed.push({ method, path, status: response.status });
  return { response, data };
}

function expectStatus(result, status, label) {
  assert.equal(result.response.status, status, `${label}: expected HTTP ${status}, got ${result.response.status}`);
}

try {
  const equipment = await request("/equipment");
  expectStatus(equipment, 200, "list equipment");
  assert.ok(equipment.data.length >= 2, "expected at least two equipment records");

  const list = await request("/bookings");
  expectStatus(list, 200, "list bookings");
  assert.ok(Array.isArray(list.data), "bookings response must be an array");

  const preflight = await request("/bookings", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5500",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "Content-Type",
    },
  });
  expectStatus(preflight, 204, "CORS preflight");
  assert.equal(preflight.response.headers.get("Access-Control-Allow-Origin"), "http://localhost:5500");

  const create = await request("/bookings", {
    method: "POST",
    body: {
      equipmentId: "eq-1",
      borrowerName: "Cloudflare Deployment Smoke Test",
      startAt: "2026-10-28T09:00:00.000Z",
      endAt: "2026-10-28T11:00:00.000Z",
      purpose: "Verify deployed Worker and D1",
    },
  });
  expectStatus(create, 201, "create booking");
  bookingId = create.data.id;
  assert.equal(create.data.equipmentId, "eq-1");

  const read = await request(`/bookings/${bookingId}`);
  expectStatus(read, 200, "read booking");
  assert.equal(read.data.id, bookingId);

  const update = await request(`/bookings/${bookingId}`, {
    method: "PATCH",
    body: {
      startAt: "2026-10-28T12:00:00.000Z",
      endAt: "2026-10-28T14:00:00.000Z",
      purpose: "Updated Cloudflare smoke test",
    },
  });
  expectStatus(update, 200, "update booking");
  assert.equal(update.data.purpose, "Updated Cloudflare smoke test");

  const invalid = await request("/bookings", {
    method: "POST",
    body: {
      equipmentId: "eq-1",
      borrowerName: "Cloudflare Validation Check",
      startAt: "2026-10-29T11:00:00.000Z",
      endAt: "2026-10-29T09:00:00.000Z",
      purpose: "Invalid interval",
    },
  });
  expectStatus(invalid, 400, "invalid time range");
  assert.equal(typeof invalid.data.error, "string");

  const conflict = await request("/bookings", {
    method: "POST",
    body: {
      equipmentId: "eq-1",
      borrowerName: "Cloudflare Conflict Check",
      startAt: "2026-10-28T12:30:00.000Z",
      endAt: "2026-10-28T13:30:00.000Z",
      purpose: "Intentional overlap",
    },
  });
  expectStatus(conflict, 409, "overlapping booking");
  assert.equal(typeof conflict.data.error, "string");

  const missing = await request("/bookings/not-found");
  expectStatus(missing, 404, "missing booking");
  assert.equal(typeof missing.data.error, "string");
} finally {
  if (bookingId) {
    const deleted = await request(`/bookings/${bookingId}`, { method: "DELETE" });
    expectStatus(deleted, 204, "delete test booking");
    const remaining = await request(`/bookings/${bookingId}`);
    expectStatus(remaining, 404, "confirm cleanup");
  }
}

for (const item of observed) {
  console.log(`${item.status} ${item.method} ${item.path}`);
}
console.log(`Cloudflare smoke test passed: ${observed.length} requests; test booking cleaned up.`);