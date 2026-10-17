CREATE TABLE clients (
  id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE,
  active integer NOT NULL DEFAULT 1, timezone text NOT NULL DEFAULT 'America/New_York', brand_name text NOT NULL DEFAULT 'Wayfind'
);
CREATE TABLE client_settings (
  client_id text PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE, settings text NOT NULL DEFAULT '{}'
);
CREATE TABLE imports (
  id text PRIMARY KEY, client_id text NOT NULL REFERENCES clients(id),
  source text NOT NULL CHECK (source IN ('meta','indeed','driverhub')),
  file_name text NOT NULL, sha256 text NOT NULL, storage_path text NOT NULL,
  period_start text, period_end text, snapshot_date text,
  status text NOT NULL CHECK (status IN ('preview','active','superseded','failed','cancelled')),
  uploaded_by text NOT NULL, row_count integer NOT NULL CHECK (row_count BETWEEN 0 AND 50000),
  summary text NOT NULL, created_at integer NOT NULL,
  CHECK (status NOT IN ('active','superseded') OR
    (source = 'driverhub' AND snapshot_date IS NOT NULL AND period_start IS NULL AND period_end IS NULL) OR
    (source IN ('meta','indeed') AND snapshot_date IS NULL AND period_start IS NOT NULL AND period_end IS NOT NULL AND period_start <= period_end))
);
CREATE UNIQUE INDEX imports_duplicate ON imports(client_id, source, sha256);
CREATE UNIQUE INDEX imports_one_active ON imports(client_id, source) WHERE status = 'active';
CREATE INDEX imports_history ON imports(client_id, created_at);
CREATE TABLE meta_rows (
  id text PRIMARY KEY, import_id text NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  row_no integer NOT NULL, raw text NOT NULL, ad_set_name text NOT NULL, delivery text NOT NULL,
  results text, result_indicator text NOT NULL, spend text NOT NULL, impressions text NOT NULL,
  reach text, frequency text, unique_link_clicks text, budget text, budget_type text NOT NULL,
  starts text, ends text, UNIQUE(import_id, row_no)
);
CREATE TABLE indeed_rows (
  id text PRIMARY KEY, import_id text NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  row_no integer NOT NULL, raw text NOT NULL, campaign text NOT NULL, premium text NOT NULL,
  impressions text NOT NULL, clicks text NOT NULL, apply_starts text NOT NULL, applies text NOT NULL,
  spend text NOT NULL, job_count text NOT NULL, row_kind text NOT NULL CHECK (row_kind IN ('job','bundle','organic','plan')),
  UNIQUE(import_id, row_no)
);
CREATE TABLE candidate_rows (
  id text PRIMARY KEY, import_id text NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  row_no integer NOT NULL, raw text NOT NULL, first_name text, last_name text, app_created text,
  recruiting_status text, referral_source text, rejection_reason text, app_status text, owner_operator text,
  years_exp text, signed_date text, cdl_exp text, endorsements text, equipment text, start_date text,
  position text, location text, days_in_funnel integer, ambiguous_fields text NOT NULL, "values" text NOT NULL,
  UNIQUE(import_id, row_no)
);
CREATE TABLE audit_log (
  id text PRIMARY KEY, user_id text NOT NULL,
  action text NOT NULL, object text NOT NULL, created_at integer NOT NULL
);
