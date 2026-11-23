-- PWD CONNECT — PostgreSQL + PostGIS Reference Schema (16 Core Tables + RLS)
-- Designed for Supabase / PostgreSQL 15+ with PostGIS enabled.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 1. states
CREATE TABLE states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. districts
CREATE TABLE districts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (state_id, name)
);

-- 3. municipalities
CREATE TABLE municipalities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  district_id UUID NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  municipality_type TEXT NOT NULL CHECK (municipality_type IN ('Municipality', 'Corporation', 'Grama Panchayat')),
  center_location GEOGRAPHY(POINT, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (district_id, name)
);

-- 4. departments
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN (
    'company_admin',
    'citizen',
    'state_admin',
    'district_admin',
    'municipality_admin',
    'department_admin',
    'field_officer'
  )),
  state_id UUID REFERENCES states(id),
  district_id UUID REFERENCES districts(id),
  municipality_id UUID REFERENCES municipalities(id),
  department_id UUID REFERENCES departments(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. department_jurisdictions
CREATE TABLE department_jurisdictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  municipality_id UUID NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  handled_categories TEXT[] NOT NULL DEFAULT '{}',
  sla_hours INTEGER NOT NULL DEFAULT 48,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, municipality_id)
);

-- 7. assets
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  municipality_id UUID NOT NULL REFERENCES municipalities(id),
  owner_department_id UUID NOT NULL REFERENCES departments(id),
  location GEOGRAPHY(POINT, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. field_officers
CREATE TABLE field_officers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  municipality_id UUID NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  designation TEXT NOT NULL DEFAULT 'Junior Engineer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. issues
CREATE TABLE issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_code TEXT NOT NULL UNIQUE,
  reporter_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  ai_suggested_category TEXT,
  ai_confidence NUMERIC(4,2),
  ai_summary TEXT,
  ai_reasoning TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  status TEXT NOT NULL CHECK (status IN (
    'Submitted',
    'Under Review',
    'Assigned to Department',
    'Accepted by Department',
    'Field Inspection',
    'Work in Progress',
    'Resolved',
    'Citizen Verification',
    'Closed',
    'Reopened'
  )),
  routing_status TEXT NOT NULL CHECK (routing_status IN ('auto_assigned', 'manual_review', 'reassigned')),
  state_id UUID NOT NULL REFERENCES states(id),
  district_id UUID NOT NULL REFERENCES districts(id),
  municipality_id UUID NOT NULL REFERENCES municipalities(id),
  department_id UUID REFERENCES departments(id),
  field_officer_id UUID REFERENCES field_officers(id),
  asset_id UUID REFERENCES assets(id),
  address_text TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED,
  is_escalated BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_count INTEGER NOT NULL DEFAULT 0,
  duplicate_of_code TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. issue_evidence
CREATE TABLE issue_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES users(id),
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('citizen_initial', 'inspection', 'before_repair', 'after_repair', 'reopen_proof')),
  media_url TEXT NOT NULL,
  media_kind TEXT NOT NULL CHECK (media_kind IN ('image', 'video')),
  caption TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. assignments
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL UNIQUE REFERENCES issues(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id),
  field_officer_id UUID REFERENCES field_officers(id),
  assigned_by_user_id UUID NOT NULL REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  rejected_reason TEXT,
  inspection_notes TEXT,
  completion_notes TEXT,
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. status_history
CREATE TABLE status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by_user_id UUID NOT NULL REFERENCES users(id),
  changed_by_role TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
  complaint_code TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  event_type TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. repair_verifications
CREATE TABLE repair_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  citizen_id UUID NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK (decision IN ('confirmed', 'reopened')),
  feedback TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. road_passports
CREATE TABLE road_passports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_code TEXT NOT NULL UNIQUE,
  asset_id UUID NOT NULL REFERENCES assets(id),
  linked_issue_id UUID REFERENCES issues(id),
  municipality_id UUID NOT NULL REFERENCES municipalities(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  purpose TEXT NOT NULL,
  work_start_date DATE NOT NULL,
  expected_completion_date DATE NOT NULL,
  actual_completion_date DATE,
  before_photo_url TEXT NOT NULL,
  after_photo_url TEXT,
  work_status TEXT NOT NULL CHECK (work_status IN ('Planned', 'Excavation Active', 'Restoration Pending', 'Completed', 'Overdue', 'Flagged')),
  inspection_result TEXT NOT NULL DEFAULT 'Pending',
  citizen_verification_status TEXT NOT NULL DEFAULT 'Pending' CHECK (citizen_verification_status IN ('Pending', 'Verified', 'Disputed')),
  repeat_dig_count INTEGER NOT NULL DEFAULT 1,
  ai_comparison_score INTEGER,
  ai_comparison_summary TEXT,
  flagged_for_inspection BOOLEAN NOT NULL DEFAULT FALSE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. audit_logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES users(id),
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Geospatial Index for PostGIS hotspot & duplicate queries
CREATE INDEX idx_issues_geom ON issues USING GIST (geom);
CREATE INDEX idx_issues_municipality ON issues (municipality_id, status);
CREATE INDEX idx_issues_department ON issues (department_id, status);
CREATE INDEX idx_notifications_user ON notifications (user_id, is_read, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE road_passports ENABLE ROW LEVEL SECURITY;

-- Example RLS Policies for Citizen, Municipality, Department & Field Officer Isolation
CREATE POLICY citizen_own_issues ON issues
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_uid = auth.uid()::text
        AND (
          u.role IN ('company_admin', 'state_admin')
          OR (u.role = 'district_admin' AND u.district_id = issues.district_id)
          OR (u.role = 'municipality_admin' AND u.municipality_id = issues.municipality_id)
          OR (u.role = 'department_admin' AND u.department_id = issues.department_id AND (u.municipality_id IS NULL OR u.municipality_id = issues.municipality_id))
          OR (u.role = 'citizen' AND u.id = issues.reporter_id)
        )
    )
  );
