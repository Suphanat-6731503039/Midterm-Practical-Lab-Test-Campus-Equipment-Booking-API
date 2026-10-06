import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function createDatabase(path = "./data/bookings.sqlite"): DatabaseSync {
  if (path !== ":memory:") {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }

  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
      borrower_name TEXT NOT NULL CHECK (length(trim(borrower_name)) > 0),
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK (length(trim(purpose)) > 0),
      CHECK (start_at < end_at)
    );

    CREATE INDEX IF NOT EXISTS bookings_equipment_time
      ON bookings (equipment_id, start_at, end_at);

    CREATE TRIGGER IF NOT EXISTS bookings_no_overlap_insert
    BEFORE INSERT ON bookings
    WHEN EXISTS (
      SELECT 1 FROM bookings
      WHERE equipment_id = NEW.equipment_id
        AND start_at < NEW.end_at
        AND end_at > NEW.start_at
    )
    BEGIN
      SELECT RAISE(ABORT, 'booking_overlap');
    END;

    CREATE TRIGGER IF NOT EXISTS bookings_no_overlap_update
    BEFORE UPDATE ON bookings
    WHEN EXISTS (
      SELECT 1 FROM bookings
      WHERE equipment_id = NEW.equipment_id
        AND id <> NEW.id
        AND start_at < NEW.end_at
        AND end_at > NEW.start_at
    )
    BEGIN
      SELECT RAISE(ABORT, 'booking_overlap');
    END;
  `);

  const seedEquipment = db.prepare(
    "INSERT OR IGNORE INTO equipment (id, name, location) VALUES (?, ?, ?)",
  );
  seedEquipment.run("eq-1", "Projector A", "Building 1");
  seedEquipment.run("eq-2", "Camera Kit", "Media Lab");
  seedEquipment.run("eq-3", "Meeting Room 2", "Building 2");

  return db;
}