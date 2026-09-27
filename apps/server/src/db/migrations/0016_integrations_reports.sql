-- Task 17: Integrations Center + Scheduled Reports.
--
-- Integrations store their configuration in the existing `settings` table
-- (one `integration:<providerId>` row per provider, JSON with `enc:v1:`
-- encrypted secrets) — no new table is needed for them.
--
-- Scheduled reports DO need tables: one row per report definition and one row
-- per execution (with the stored CSV file + outbox delivery bookkeeping).
--
-- Timezone note: next_run_at / last_run_at are SERVER-LOCAL wall-clock strings
-- in `YYYY-MM-DDTHH:mm` format (no zone suffix). Comparisons are plain string
-- compares against the server's local clock — the install is a single-store
-- app running in the pharmacy's own timezone.
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  report_type TEXT NOT NULL,
  schedule TEXT NOT NULL,
  recipients TEXT NOT NULL DEFAULT '[]',
  format TEXT NOT NULL DEFAULT 'csv',
  filters TEXT NOT NULL DEFAULT '{}',
  next_run_at TEXT,
  last_run_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS scheduled_reports_owner_idx ON scheduled_reports(created_by, enabled, next_run_at);

-- One row per execution. scheduled_report_runs → scheduled_reports cascades on
-- DELETE so removing a report also removes its run history (documented in
-- docs/DATABASE.md). file_id references stored_files.id (purpose
-- "scheduled-report") but is intentionally NOT an FK: file rows are wiped by
-- the file-retention flow and a dangling id must never block a run insert.
CREATE TABLE IF NOT EXISTS scheduled_report_runs (
  id TEXT PRIMARY KEY,
  scheduled_report_id TEXT NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT,
  row_count INTEGER,
  file_id TEXT,
  outbox_event_id TEXT,
  message_status TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS scheduled_report_runs_owner_idx ON scheduled_report_runs(created_by, started_at);
CREATE INDEX IF NOT EXISTS scheduled_report_runs_report_idx ON scheduled_report_runs(scheduled_report_id);
