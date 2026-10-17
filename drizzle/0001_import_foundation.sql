CREATE TABLE users (
  id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('admin','staff')), active boolean NOT NULL DEFAULT true
);
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true, timezone text NOT NULL DEFAULT 'America/New_York', brand_name text NOT NULL DEFAULT 'Wayfind'
);
CREATE TABLE client_settings (
  client_id uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE, settings jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES clients(id),
  source text NOT NULL CHECK (source IN ('meta','indeed','driverhub')),
  file_name text NOT NULL, sha256 text NOT NULL, storage_path text NOT NULL,
  period_start date, period_end date, snapshot_date date,
  status text NOT NULL CHECK (status IN ('preview','active','superseded','failed','cancelled')),
  uploaded_by uuid NOT NULL REFERENCES users(id), row_count integer NOT NULL CHECK (row_count BETWEEN 0 AND 50000),
  summary jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('active','superseded') OR
    (source = 'driverhub' AND snapshot_date IS NOT NULL AND period_start IS NULL AND period_end IS NULL) OR
    (source IN ('meta','indeed') AND snapshot_date IS NULL AND period_start IS NOT NULL AND period_end IS NOT NULL AND period_start <= period_end))
);
CREATE UNIQUE INDEX imports_duplicate ON imports(client_id, source, sha256);
CREATE UNIQUE INDEX imports_one_active ON imports(client_id, source) WHERE status = 'active';
CREATE INDEX imports_history ON imports(client_id, created_at);
CREATE TABLE meta_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), import_id uuid NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  row_no integer NOT NULL, raw jsonb NOT NULL, ad_set_name text NOT NULL, delivery text NOT NULL,
  results numeric, result_indicator text NOT NULL, spend numeric NOT NULL, impressions numeric NOT NULL,
  reach numeric, frequency numeric, unique_link_clicks numeric, budget numeric, budget_type text NOT NULL,
  starts date, ends date, UNIQUE(import_id, row_no)
);
CREATE TABLE indeed_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), import_id uuid NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  row_no integer NOT NULL, raw jsonb NOT NULL, campaign text NOT NULL, premium text NOT NULL,
  impressions numeric NOT NULL, clicks numeric NOT NULL, apply_starts numeric NOT NULL, applies numeric NOT NULL,
  spend numeric NOT NULL, job_count numeric NOT NULL, row_kind text NOT NULL CHECK (row_kind IN ('job','bundle','organic','plan')),
  UNIQUE(import_id, row_no)
);
CREATE TABLE candidate_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), import_id uuid NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  row_no integer NOT NULL, raw jsonb NOT NULL, first_name text, last_name text, app_created date,
  recruiting_status text, referral_source text, rejection_reason text, app_status text, owner_operator text,
  years_exp numeric, signed_date date, cdl_exp date, endorsements text, equipment text, start_date date,
  position text, location text, days_in_funnel integer, ambiguous_fields jsonb NOT NULL, "values" jsonb NOT NULL,
  UNIQUE(import_id, row_no)
);
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL, object text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE indeed_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- No policies: public/anon/authenticated database roles cannot read or write.
-- The server connects using the table owner or a dedicated BYPASSRLS role.
