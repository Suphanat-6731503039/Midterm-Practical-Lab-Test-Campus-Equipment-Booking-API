import { Hono } from "hono";
import { cors } from "hono/cors";

type D1Result<T = unknown> = {
  success: boolean;
  results: T[];
  meta: { changes: number };
};

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
};

type D1Binding = {
  prepare(sql: string): D1Statement;
};

type Bindings = {
  DB: D1Binding;
  CORS_ORIGINS?: string;
};

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
type EquipmentRow = { id: string; name: string; location: string };
type BookingField = keyof BookingInput;

const fields: BookingField[] = ["equipmentId", "borrowerName", "startAt", "endAt", "purpose"];
const defaultOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

function rowToBooking(row: BookingRow | null): Booking | null {
  if (!row) return null;
  return {
    id: row.id,
    equipmentId: row.equipment_id,
    borrowerName: row.borrower_name,
    startAt: row.start_at,
    endAt: row.end_at,
    purpose: row.purpose,
  };
}

async function findBooking(db: D1Binding, id: string): Promise<Booking | null> {
  const row = await db.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first<BookingRow>();
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
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
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

function validatePayload(
  value: unknown,
  partial: boolean,
): { input?: Partial<BookingInput>; error?: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: "Request body must be a JSON object" };
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => !fields.includes(key as BookingField))) {
    return { error: "Request contains an unknown field" };
  }
  if (partial && keys.length === 0) return { error: "At least one field is required" };

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
    } else {
      if (typeof raw !== "string" || raw.trim().length === 0) {
        return { error: `${field} must be a non-empty string` };
      }
      input[field] = raw.trim();
    }
  }

  return { input };
}

async function equipmentExists(db: D1Binding, id: string): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 FROM equipment WHERE id = ?").bind(id).first());
}

async function parseBody(c: { req: { json(): Promise<unknown> } }): Promise<unknown | Response> {
  try {
    return await c.req.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
}

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      const allowed = (c.env.CORS_ORIGINS ?? defaultOrigins.join(","))
        .split(",")
        .map((value: string) => value.trim());
      return allowed.includes(origin) ? origin : undefined;
    },
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 600,
  }),
);

app.get("/", (c) => c.json({ service: "Campus Equipment Booking API", baseUrl: "/api" }));

app.get("/api/equipment", async (c) => {
  const { results } = await c.env.DB
    .prepare("SELECT id, name, location FROM equipment ORDER BY id")
    .all<EquipmentRow>();
  return c.json(results);
});

app.get("/api/bookings", async (c) => {
  const { results } = await c.env.DB
    .prepare("SELECT * FROM bookings ORDER BY start_at, id")
    .all<BookingRow>();
  return c.json(results.map((row) => rowToBooking(row)!));
});

app.get("/api/bookings/:id", async (c) => {
  const booking = await findBooking(c.env.DB, c.req.param("id"));
  if (!booking) return c.json({ error: "Booking not found" }, 404);
  return c.json(booking);
});

app.post("/api/bookings", async (c) => {
  const body = await parseBody(c);
  if (body instanceof Response) return c.json({ error: "Request body must be valid JSON" }, 400);

  const result = validatePayload(body, false);
  if (result.error || !result.input) return c.json({ error: result.error }, 400);
  const input = result.input as BookingInput;
  if (input.startAt >= input.endAt) return c.json({ error: "startAt must be before endAt" }, 400);
  if (!(await equipmentExists(c.env.DB, input.equipmentId))) {
    return c.json({ error: "equipmentId does not identify existing equipment" }, 400);
  }

  const id = crypto.randomUUID();
  const inserted = await c.env.DB
    .prepare(`
      INSERT INTO bookings (id, equipment_id, borrower_name, start_at, end_at, purpose)
      SELECT ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM bookings
        WHERE equipment_id = ? AND start_at < ? AND end_at > ?
      )
    `)
    .bind(
      id,
      input.equipmentId,
      input.borrowerName,
      input.startAt,
      input.endAt,
      input.purpose,
      input.equipmentId,
      input.endAt,
      input.startAt,
    )
    .run();

  if (inserted.meta.changes === 0) {
    return c.json({ error: "The equipment is already booked during this time" }, 409);
  }
  return c.json(await findBooking(c.env.DB, id), 201);
});

app.patch("/api/bookings/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await findBooking(c.env.DB, id);
  if (!existing) return c.json({ error: "Booking not found" }, 404);

  const body = await parseBody(c);
  if (body instanceof Response) return c.json({ error: "Request body must be valid JSON" }, 400);
  const result = validatePayload(body, true);
  if (result.error || !result.input) return c.json({ error: result.error }, 400);

  const merged: BookingInput = { ...existing, ...result.input };
  if (merged.startAt >= merged.endAt) return c.json({ error: "startAt must be before endAt" }, 400);
  if (!(await equipmentExists(c.env.DB, merged.equipmentId))) {
    return c.json({ error: "equipmentId does not identify existing equipment" }, 400);
  }

  const updated = await c.env.DB
    .prepare(`
      UPDATE bookings
      SET equipment_id = ?, borrower_name = ?, start_at = ?, end_at = ?, purpose = ?
      WHERE id = ?
        AND NOT EXISTS (
          SELECT 1 FROM bookings
          WHERE equipment_id = ? AND id <> ? AND start_at < ? AND end_at > ?
        )
    `)
    .bind(
      merged.equipmentId,
      merged.borrowerName,
      merged.startAt,
      merged.endAt,
      merged.purpose,
      id,
      merged.equipmentId,
      id,
      merged.endAt,
      merged.startAt,
    )
    .run();

  if (updated.meta.changes === 0) {
    if (!(await findBooking(c.env.DB, id))) return c.json({ error: "Booking not found" }, 404);
    return c.json({ error: "The equipment is already booked during this time" }, 409);
  }
  return c.json(await findBooking(c.env.DB, id));
});

app.delete("/api/bookings/:id", async (c) => {
  const deleted = await c.env.DB.prepare("DELETE FROM bookings WHERE id = ?").bind(c.req.param("id")).run();
  if (deleted.meta.changes === 0) return c.json({ error: "Booking not found" }, 404);
  return c.body(null, 204);
});

app.notFound((c) => c.json({ error: "Route not found" }, 404));
app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;