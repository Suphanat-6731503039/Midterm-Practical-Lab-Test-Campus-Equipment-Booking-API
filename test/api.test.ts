import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { createApp } from "../src/app.js";
import { createDatabase } from "../src/db.js";

let db: DatabaseSync;
let app: ReturnType<typeof createApp>;

const booking = {
  equipmentId: "eq-1",
  borrowerName: "Somchai Jaidee",
  startAt: "2026-10-20T09:00:00.000Z",
  endAt: "2026-10-20T11:00:00.000Z",
  purpose: "Class presentation",
};

beforeEach(() => {
  db = createDatabase(":memory:");
  app = createApp(db);
});

afterEach(() => db.close());

async function send(path: string, method = "GET", payload?: unknown): Promise<Response> {
  return app.request(path, {
    method,
    headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

async function createBooking(payload: unknown = booking): Promise<{ id: string }> {
  const response = await send("/api/bookings", "POST", payload);
  assert.equal(response.status, 201);
  return response.json() as Promise<{ id: string }>;
}

test("lists seeded equipment and returns an empty booking list", async () => {
  const equipmentResponse = await send("/api/equipment");
  assert.equal(equipmentResponse.status, 200);
  assert.equal((await equipmentResponse.json() as unknown[]).length, 3);

  const bookingsResponse = await send("/api/bookings");
  assert.deepEqual(await bookingsResponse.json(), []);
});

test("creates, reads, partially updates, lists, and deletes a booking", async () => {
  const created = await createBooking();
  const getResponse = await send(`/api/bookings/${created.id}`);
  assert.equal(getResponse.status, 200);
  assert.equal((await getResponse.json() as { equipmentId: string }).equipmentId, "eq-1");

  const patchResponse = await send(`/api/bookings/${created.id}`, "PATCH", {
    purpose: "Updated presentation",
  });
  assert.equal(patchResponse.status, 200);
  assert.equal((await patchResponse.json() as { purpose: string }).purpose, "Updated presentation");

  const listResponse = await send("/api/bookings");
  assert.equal((await listResponse.json() as unknown[]).length, 1);

  const deleteResponse = await send(`/api/bookings/${created.id}`, "DELETE");
  assert.equal(deleteResponse.status, 204);
  assert.equal((await send(`/api/bookings/${created.id}`)).status, 404);
});

test("rejects malformed data, invalid time ranges, and unknown equipment", async () => {
  const missingField = await send("/api/bookings", "POST", { ...booking, purpose: "" });
  assert.equal(missingField.status, 400);
  assert.equal(typeof (await missingField.json() as { error: string }).error, "string");

  const invalidRange = await send("/api/bookings", "POST", {
    ...booking,
    endAt: booking.startAt,
  });
  assert.equal(invalidRange.status, 400);

  const invalidEquipment = await send("/api/bookings", "POST", {
    ...booking,
    equipmentId: "does-not-exist",
  });
  assert.equal(invalidEquipment.status, 400);
});

test("rejects overlapping inserts but permits adjacent and different-equipment bookings", async () => {
  await createBooking();

  const overlap = await send("/api/bookings", "POST", {
    ...booking,
    startAt: "2026-10-20T10:00:00.000Z",
  });
  assert.equal(overlap.status, 409);

  const adjacent = await send("/api/bookings", "POST", {
    ...booking,
    startAt: booking.endAt,
    endAt: "2026-10-20T12:00:00.000Z",
  });
  assert.equal(adjacent.status, 201);

  const otherEquipment = await send("/api/bookings", "POST", {
    ...booking,
    equipmentId: "eq-2",
  });
  assert.equal(otherEquipment.status, 201);
});

test("prevents a PATCH from overlapping another booking", async () => {
  const first = await createBooking();
  const second = await createBooking({
    ...booking,
    startAt: "2026-10-20T12:00:00.000Z",
    endAt: "2026-10-20T13:00:00.000Z",
  });

  const response = await send(`/api/bookings/${second.id}`, "PATCH", {
    startAt: "2026-10-20T10:00:00.000Z",
  });
  assert.equal(response.status, 409);
  assert.equal((await send(`/api/bookings/${first.id}`)).status, 200);
});

test("returns JSON errors for invalid JSON, missing bookings, and unknown routes", async () => {
  const invalidJson = await app.request("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(invalidJson.status, 400);
  assert.equal(typeof (await invalidJson.json() as { error: string }).error, "string");

  const missing = await send("/api/bookings/missing-id");
  assert.equal(missing.status, 404);
  assert.equal(typeof (await missing.json() as { error: string }).error, "string");

  const unknownRoute = await send("/api/no-such-route");
  assert.equal(unknownRoute.status, 404);
  assert.equal(typeof (await unknownRoute.json() as { error: string }).error, "string");
});

test("keeps SQL-looking borrower input as ordinary data", async () => {
  const name = "O'Neil; DROP TABLE equipment; --";
  const created = await createBooking({ ...booking, borrowerName: name });
  const response = await send(`/api/bookings/${created.id}`);
  assert.equal((await response.json() as { borrowerName: string }).borrowerName, name);
  assert.equal((await send("/api/equipment")).status, 200);
});

test("allows the local frontend tester and handles CORS preflight", async () => {
  const response = await app.request("/api/bookings", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5500",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:5500");
  assert.match(response.headers.get("Access-Control-Allow-Methods") ?? "", /POST/);
});

test("does not grant CORS access to an unconfigured origin", async () => {
  const response = await app.request("/api/equipment", {
    headers: { Origin: "https://untrusted.example" },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});