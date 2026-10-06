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

INSERT OR IGNORE INTO equipment (id, name, location) VALUES
  ('eq-1', 'Projector A', 'Building 1'),
  ('eq-2', 'Camera Kit', 'Media Lab'),
  ('eq-3', 'Meeting Room 2', 'Building 2');