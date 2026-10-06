import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { Hono } from "hono";
import { cors } from "hono/cors";

export const DEFAULT_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

type Booking = {
  id: string;
  equipmentId: string;
  borrowerName: string;
  startAt: string;
  endAt: string;
  purpose: string;
};

type BookingInput = Omit<Booking, "id">;

type BookingRow = {
  id: string;
  equipment_id: string;
  borrower_name: string;
  start_at: string;
  end_at: string;
  purpose: string;
};

const fields = ["equipmentId", "borrowerName", "startAt", "endAt", "purpose"] as const;
type BookingField = (typeof fields)[number];

function rowToBooking(row: Record<string, SQLOutputValue> | undefined): Booking | null {
  if (!row) return null;
  const booking = row as unknown as BookingRow;
  return {
    id: booking.id,
    equipmentId: booking.equipment_id,
    borrowerName: booking.borrower_name,
    startAt: booking.start_at,
    endAt: booking.end_at,
    purpose: booking.purpose,
  };
}

function findBooking(db: DatabaseSync, id: string): Booking | null {
  const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);
  return rowToBooking(row);
}

function parseTimestamp(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number) as number[];
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function validatePayload(value: unknown, partial: boolean): { input?: Partial<BookingInput>; error?: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: "Request body must be a JSON object" };
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => !fields.includes(key as BookingField))) {
    return { error: "Request contains an unknown field" };
  }
  if (partial && keys.length === 0) {
    return { error: "At least one field is required" };
  }

  const input: Partial<BookingInput> = {};
  for (const field of fields) {
    if (!(field in record)) {
      if (!partial) return { error: `${field} is required` };
      continue;
    }

    const raw = record[field];
    if (field === "startAt" || field === "endAt") {
      const timestamp = parseTimestamp(raw);
      if (!timestamp) return { error: `${field} must be a valid ISO 8601 timestamp` };
      input[field] = timestamp;
      continue;
    }

    if (typeof raw !== "string" || raw.trim().length === 0) {
      return { error: `${field} must be a non-empty string` };
    }
    input[field] = raw.trim();
  }

  return { input };
}

function bookingExists(db: DatabaseSync, equipmentId: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM equipment WHERE id = ?").get(equipmentId));
}

function isOverlapError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("booking_overlap");
}

export function createApp(db: DatabaseSync, allowedOrigins = DEFAULT_CORS_ORIGINS): Hono {
  const app = new Hono();

  app.use(
    "/api/*",
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : undefined),
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 600,
    }),
  );

  app.get("/api/equipment", (c) => {
    const equipment = db
      .prepare("SELECT id, name, location FROM equipment ORDER BY id")
      .all();
    return c.json(equipment);
  });

  app.get("/api/bookings", (c) => {
    const rows = db
      .prepare("SELECT * FROM bookings ORDER BY start_at, id")
      .all();
    return c.json(rows.map((row) => rowToBooking(row)!));
  });

  app.get("/api/bookings/:id", (c) => {
    const booking = findBooking(db, c.req.param("id"));
    if (!booking) return c.json({ error: "Booking not found" }, 404);
    return c.json(booking);
  });

  app.post("/api/bookings", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Request body must be valid JSON" }, 400);
    }

    const result = validatePayload(body, false);
    if (result.error || !result.input) return c.json({ error: result.error }, 400);
    const input = result.input as BookingInput;
    if (input.startAt >= input.endAt) {
      return c.json({ error: "startAt must be before endAt" }, 400);
    }
    if (!bookingExists(db, input.equipmentId)) {
      return c.json({ error: "equipmentId does not identify existing equipment" }, 400);
    }

    const id = randomUUID();
    try {
      db.prepare(
        `INSERT INTO bookings (id, equipment_id, borrower_name, start_at, end_at, purpose)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, input.equipmentId, input.borrowerName, input.startAt, input.endAt, input.purpose);
    } catch (error) {
      if (isOverlapError(error)) {
        return c.json({ error: "The equipment is already booked during this time" }, 409);
      }
      throw error;
    }

    return c.json(findBooking(db, id), 201);
  });

  app.patch("/api/bookings/:id", async (c) => {
    const id = c.req.param("id");
    const existing = findBooking(db, id);
    if (!existing) return c.json({ error: "Booking not found" }, 404);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Request body must be valid JSON" }, 400);
    }

    const result = validatePayload(body, true);
    if (result.error || !result.input) return c.json({ error: result.error }, 400);
    const merged: BookingInput = { ...existing, ...result.input };
    if (merged.startAt >= merged.endAt) {
      return c.json({ error: "startAt must be before endAt" }, 400);
    }
    if (!bookingExists(db, merged.equipmentId)) {
      return c.json({ error: "equipmentId does not identify existing equipment" }, 400);
    }

    try {
      db.prepare(
        `UPDATE bookings
         SET equipment_id = ?, borrower_name = ?, start_at = ?, end_at = ?, purpose = ?
         WHERE id = ?`,
      ).run(
        merged.equipmentId,
        merged.borrowerName,
        merged.startAt,
        merged.endAt,
        merged.purpose,
        id,
      );
    } catch (error) {
      if (isOverlapError(error)) {
        return c.json({ error: "The equipment is already booked during this time" }, 409);
      }
      throw error;
    }

    return c.json(findBooking(db, id));
  });

  app.delete("/api/bookings/:id", (c) => {
    const result = db.prepare("DELETE FROM bookings WHERE id = ?").run(c.req.param("id"));
    if (result.changes === 0) return c.json({ error: "Booking not found" }, 404);
    return c.body(null, 204);
  });

  app.notFound((c) => c.json({ error: "Route not found" }, 404));
  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}