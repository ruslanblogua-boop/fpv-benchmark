-- FPV Heatmap Platform — Initial Schema
-- Apply with: wrangler d1 migrations apply fpv-heatmap-db --remote
-- Local dev:  wrangler d1 migrations apply fpv-heatmap-db --local

PRAGMA foreign_keys = ON;

-- ── Users ─────────────────────────────────────────────────────────────────────
-- Mirrors Supabase auth.users; we keep a local copy for display names,
-- roles, and join performance. Synced on first login via the API.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,  -- Supabase user UUID
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'pilot',  -- 'pilot' | 'admin'
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Drone Profiles ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drone_profiles (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,            -- e.g. "2.5\" Cinewhoop"
  frame       TEXT,                     -- e.g. "Nazghul 2525"
  motors      TEXT,                     -- e.g. "1404 4500KV"
  fc          TEXT,                     -- e.g. "SpeedyBee F405"
  vtx         TEXT,                     -- e.g. "WalkSnail Avatar Pro"
  props       TEXT,                     -- e.g. "Gemfan 2535 3-blade"
  weight_g    REAL,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_drone_profiles_user ON drone_profiles(user_id);

-- ── Tracks ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracks (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,          -- url-safe identifier
  type             TEXT NOT NULL DEFAULT 'circuit', -- 'circuit' | 'range'
  status           TEXT NOT NULL DEFAULT 'non-standard', -- 'standard' | 'non-standard'
  location_name    TEXT,                           -- human readable, e.g. "Enduro Racetrack, Piła"
  center_lat       REAL,                           -- for proximity matching
  center_lon       REAL,
  boundary_geojson TEXT,                           -- GeoJSON Polygon (optional, set on standardization)
  lap_gate_geojson TEXT,                           -- GeoJSON LineString — the lap crossing line
  length_m         REAL,                           -- approx track length in meters
  description      TEXT,
  test_count       INTEGER NOT NULL DEFAULT 0,     -- denormalized, updated on test publish
  promoted_at      TEXT,                           -- when it became 'standard'
  created_by       TEXT REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tracks_status ON tracks(status);
CREATE INDEX IF NOT EXISTS idx_tracks_center ON tracks(center_lat, center_lon);

-- ── Tests ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tests (
  id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  user_id             TEXT NOT NULL REFERENCES users(id),
  track_id            TEXT REFERENCES tracks(id),
  drone_profile_id    TEXT REFERENCES drone_profiles(id),

  -- Naming
  auto_name           TEXT NOT NULL,   -- system-generated, e.g. "WalkSnail Avatar Pro on Enduro #1 — 2026-05-03"
  custom_name         TEXT,            -- pilot override
  
  -- Category & subject
  category            TEXT NOT NULL DEFAULT 'link', -- 'link' | 'battery' | 'prop' | 'other'
  system_under_test   TEXT NOT NULL,  -- e.g. "WalkSnail Avatar Pro 1W" or "Gemfan 2535 3-blade"
  
  -- Pilot position (set during upload)
  pilot_lat           REAL,
  pilot_lon           REAL,
  pilot_bearing_deg   REAL,           -- 0–360, direction pilot is facing

  -- Processing settings
  grid_size_m         REAL NOT NULL DEFAULT 1.0,  -- 0.5 or 1.0
  lap_count           INTEGER NOT NULL DEFAULT 1,

  -- Weather (all optional)
  wind_speed          TEXT,           -- 'calm' | 'light' | 'moderate' | 'strong'
  wind_direction      TEXT,           -- 'N' | 'NE' | 'E' | etc.
  weather_notes       TEXT,

  -- Files in R2
  -- Keys follow pattern: tests/{id}/heatmap.geojson and tests/{id}/path.geojson
  heatmap_key         TEXT,           -- R2 object key for heatmap GeoJSON
  path_key            TEXT,           -- R2 object key for path GeoJSON

  -- Summary stats (denormalized from heatmap data for list views)
  stats_json          TEXT,           -- JSON: {rc_snr: {avg,min,max}, bitrate: {avg,min,max}, ...}
  duration_s          REAL,
  total_distance_m    REAL,
  link_loss_count     INTEGER NOT NULL DEFAULT 0,

  notes               TEXT,
  status              TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'published'
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  published_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_tests_user     ON tests(user_id);
CREATE INDEX IF NOT EXISTS idx_tests_track    ON tests(track_id);
CREATE INDEX IF NOT EXISTS idx_tests_category ON tests(category);
CREATE INDEX IF NOT EXISTS idx_tests_status   ON tests(status);
CREATE INDEX IF NOT EXISTS idx_tests_published ON tests(published_at DESC);

-- ── Test Laps ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS test_laps (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  test_id     TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  lap_number  INTEGER NOT NULL,
  duration_s  REAL,
  distance_m  REAL,
  stats_json  TEXT,   -- JSON: {rc_snr: {avg,min,max}, bitrate: {avg,min,max}, ...}
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(test_id, lap_number)
);

CREATE INDEX IF NOT EXISTS idx_test_laps_test ON test_laps(test_id);

-- ── Link Loss Events ──────────────────────────────────────────────────────────
-- Individual loss events stored in DB for spatial queries later
CREATE TABLE IF NOT EXISTS link_loss_events (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  test_id      TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  lat          REAL NOT NULL,
  lon          REAL NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  type         TEXT NOT NULL,   -- 'rc' | 'video' | 'both'
  duration_ms  INTEGER,         -- how long the loss lasted (if recoverable)
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_link_loss_test ON link_loss_events(test_id);

-- ── Track proximity helper view ───────────────────────────────────────────────
-- Used to find non-standard tracks within ~100m of a given coordinate.
-- Actual distance calculation happens in the Worker (Haversine).
-- This view gives the Worker a fast starting set to filter.
CREATE VIEW IF NOT EXISTS v_tracks_with_stats AS
SELECT
  t.*,
  COUNT(DISTINCT ts.id) AS published_test_count
FROM tracks t
LEFT JOIN tests ts ON ts.track_id = t.id AND ts.status = 'published'
GROUP BY t.id;

-- ── Seed: Enduro standard track placeholder ───────────────────────────────────
-- Geometry will be set after the first real test is uploaded.
-- Replace center_lat/lon with actual coordinates once you have them.
INSERT OR IGNORE INTO tracks (
  id, name, slug, type, status, location_name,
  center_lat, center_lon, description
) VALUES (
  'track-enduro-01',
  'Enduro Racetrack',
  'enduro-01',
  'circuit',
  'standard',
  'Enduro Racetrack — TBD',
  NULL,
  NULL,
  'Primary standard track for all link, prop, and battery comparison tests.'
);
