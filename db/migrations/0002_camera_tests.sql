PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS camera_tests (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  created_by        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  combo_name        TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  tab               TEXT NOT NULL DEFAULT 'quality', -- 'quality' | 'low-light' | 'latency'
  camera_name       TEXT,
  vtx_name          TEXT,
  vrx_name          TEXT,
  firmware          TEXT,
  scene_name        TEXT,
  latency_method    TEXT,
  exposure_notes    TEXT,
  summary           TEXT,
  tags_json         TEXT,
  vtx_dvr_key       TEXT,
  vrx_dvr_key       TEXT,
  metadata_json     TEXT,
  status            TEXT NOT NULL DEFAULT 'published',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_camera_tests_tab ON camera_tests(tab, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_camera_tests_status ON camera_tests(status, created_at DESC);
