import { serve } from "@hono/node-server";
import { createApp, DEFAULT_CORS_ORIGINS } from "./app.js";
import { createDatabase } from "./db.js";

const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const db = createDatabase(process.env.DB_PATH ?? "./data/bookings.sqlite");
const corsOrigins = (process.env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const app = createApp(db, corsOrigins);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Campus Equipment Booking API listening on http://localhost:${info.port}/api`);
});