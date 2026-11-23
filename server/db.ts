import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pwd_connect.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS states (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS districts (
      id TEXT PRIMARY KEY,
      state_id TEXT NOT NULL REFERENCES states(id),
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active'
    );

    CREATE TABLE IF NOT EXISTS municipalities (
      id TEXT PRIMARY KEY,
      state_id TEXT NOT NULL REFERENCES states(id),
      district_id TEXT NOT NULL REFERENCES districts(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      center_lat REAL NOT NULL,
      center_lng REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      auth_uid TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL,
      state_id TEXT REFERENCES states(id),
      district_id TEXT REFERENCES districts(id),
      municipality_id TEXT REFERENCES municipalities(id),
      department_id TEXT REFERENCES departments(id),
      is_active INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS issue_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      default_department_code TEXT NOT NULL,
      sla_hours INTEGER NOT NULL DEFAULT 48,
      description TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS department_jurisdictions (
      id TEXT PRIMARY KEY,
      department_id TEXT NOT NULL REFERENCES departments(id),
      municipality_id TEXT NOT NULL REFERENCES municipalities(id),
      handled_categories_json TEXT NOT NULL,
      sla_hours INTEGER NOT NULL DEFAULT 48,
      UNIQUE (department_id, municipality_id)
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      asset_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      municipality_id TEXT NOT NULL REFERENCES municipalities(id),
      owner_department_id TEXT NOT NULL REFERENCES departments(id),
      latitude REAL NOT NULL,
      longitude REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS field_officers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
      department_id TEXT NOT NULL REFERENCES departments(id),
      municipality_id TEXT NOT NULL REFERENCES municipalities(id),
      designation TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      complaint_code TEXT NOT NULL UNIQUE,
      reporter_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      ai_suggested_category TEXT,
      ai_confidence REAL,
      ai_summary TEXT,
      ai_reasoning TEXT,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      routing_status TEXT NOT NULL,
      state_id TEXT NOT NULL REFERENCES states(id),
      district_id TEXT NOT NULL REFERENCES districts(id),
      municipality_id TEXT NOT NULL REFERENCES municipalities(id),
      department_id TEXT REFERENCES departments(id),
      field_officer_id TEXT REFERENCES field_officers(id),
      asset_id TEXT REFERENCES assets(id),
      road_passport_id TEXT,
      address_text TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      is_escalated INTEGER NOT NULL DEFAULT 0,
      escalation_count INTEGER NOT NULL DEFAULT 0,
      duplicate_of_code TEXT,
      due_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS issue_evidence (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL REFERENCES issues(id),
      uploader_id TEXT NOT NULL REFERENCES users(id),
      evidence_type TEXT NOT NULL,
      media_url TEXT NOT NULL,
      media_kind TEXT NOT NULL,
      caption TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL UNIQUE REFERENCES issues(id),
      department_id TEXT NOT NULL REFERENCES departments(id),
      field_officer_id TEXT REFERENCES field_officers(id),
      assigned_by_user_id TEXT NOT NULL REFERENCES users(id),
      accepted_at TEXT,
      rejected_reason TEXT,
      inspection_notes TEXT,
      completion_notes TEXT,
      escalated_at TEXT,
      escalation_reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS status_history (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL REFERENCES issues(id),
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_by_user_id TEXT NOT NULL REFERENCES users(id),
      changed_by_role TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      issue_id TEXT REFERENCES issues(id),
      complaint_code TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      event_type TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repair_verifications (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL REFERENCES issues(id),
      citizen_id TEXT NOT NULL REFERENCES users(id),
      decision TEXT NOT NULL,
      feedback TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS road_passports (
      id TEXT PRIMARY KEY,
      passport_code TEXT NOT NULL UNIQUE,
      asset_id TEXT NOT NULL REFERENCES assets(id),
      linked_issue_id TEXT REFERENCES issues(id),
      municipality_id TEXT NOT NULL REFERENCES municipalities(id),
      department_id TEXT NOT NULL REFERENCES departments(id),
      purpose TEXT NOT NULL,
      work_start_date TEXT NOT NULL,
      expected_completion_date TEXT NOT NULL,
      actual_completion_date TEXT,
      before_photo_url TEXT NOT NULL,
      after_photo_url TEXT,
      work_status TEXT NOT NULL,
      inspection_result TEXT NOT NULL,
      citizen_verification_status TEXT NOT NULL,
      repeat_dig_count INTEGER NOT NULL DEFAULT 1,
      ai_comparison_score INTEGER,
      ai_comparison_summary TEXT,
      flagged_for_inspection INTEGER NOT NULL DEFAULT 0,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      history_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL REFERENCES users(id),
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS whatsapp_sessions (
      id TEXT PRIMARY KEY,
      phone_number TEXT NOT NULL UNIQUE,
      citizen_user_id TEXT REFERENCES users(id),
      draft_json TEXT,
      last_complaint_code TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES whatsapp_sessions(id),
      phone_number TEXT NOT NULL,
      direction TEXT NOT NULL,
      body TEXT NOT NULL,
      media_url TEXT,
      linked_complaint_code TEXT,
      channel_mode TEXT NOT NULL DEFAULT 'web_simulator',
      created_at TEXT NOT NULL
    );
  `);

  const districtCols = db.prepare('PRAGMA table_info(districts)').all() as Array<{ name: string }>;
  if (!districtCols.some((c) => c.name === 'status')) {
    db.exec("ALTER TABLE districts ADD COLUMN status TEXT NOT NULL DEFAULT 'Active';");
  }
  const muniCols = db.prepare('PRAGMA table_info(municipalities)').all() as Array<{ name: string }>;
  if (!muniCols.some((c) => c.name === 'status')) {
    db.exec("ALTER TABLE municipalities ADD COLUMN status TEXT NOT NULL DEFAULT 'Active';");
  }
  const issueCols = db.prepare('PRAGMA table_info(issues)').all() as Array<{ name: string }>;
  if (!issueCols.some((c) => c.name === 'channel')) {
    db.exec("ALTER TABLE issues ADD COLUMN channel TEXT NOT NULL DEFAULT 'web';");
  }
  if (!issueCols.some((c) => c.name === 'reporter_phone')) {
    db.exec('ALTER TABLE issues ADD COLUMN reporter_phone TEXT;');
  }

  const countRow = db.prepare('SELECT COUNT(*) as count FROM states').get() as { count: number };
  if (countRow.count === 0) {
    seedDemoData();
  }
}

function seedDemoData(): void {
  const demoPassHash = hashPassword('DemoPass#2026');
  const now = new Date('2026-11-22T09:00:00.000Z');
  const isoAgo = (hours: number) => new Date(now.getTime() - hours * 3600 * 1000).toISOString();
  const isoAhead = (hours: number) => new Date(now.getTime() + hours * 3600 * 1000).toISOString();

  // 1. States
  db.prepare('INSERT INTO states (id, name, code) VALUES (?, ?, ?)').run('st-kl', 'Kerala', 'KL');
  db.prepare('INSERT INTO states (id, name, code) VALUES (?, ?, ?)').run('st-ka', 'Karnataka (Expansion Ready)', 'KA');

  // 2. Districts
  const insertDist = db.prepare('INSERT INTO districts (id, state_id, name) VALUES (?, ?, ?)');
  insertDist.run('dist-ekm', 'st-kl', 'Ernakulam');
  insertDist.run('dist-tvm', 'st-kl', 'Thiruvananthapuram');
  insertDist.run('dist-kzd', 'st-kl', 'Kozhikode');

  // 3. Municipalities
  const insertMuni = db.prepare(
    'INSERT INTO municipalities (id, state_id, district_id, name, type, center_lat, center_lng) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  insertMuni.run('mun-mlt', 'st-kl', 'dist-ekm', 'Mulanthuruthy', 'Grama Panchayat', 9.8981, 76.3854);
  insertMuni.run('mun-kochi', 'st-kl', 'dist-ekm', 'Kochi Corporation', 'Corporation', 9.9312, 76.2673);
  insertMuni.run('mun-aluva', 'st-kl', 'dist-ekm', 'Aluva', 'Municipality', 10.1004, 76.357);
  insertMuni.run('mun-kzk', 'st-kl', 'dist-tvm', 'Kazhakkoottam', 'Municipality', 8.5686, 76.8731);
  insertMuni.run('mun-kzd', 'st-kl', 'dist-kzd', 'Kozhikode Corporation', 'Corporation', 11.2588, 75.7804);

  // 4. Departments
  const insertDept = db.prepare('INSERT INTO departments (id, name, code, description) VALUES (?, ?, ?, ?)');
  insertDept.run('dept-pwd', 'Public Works Department (PWD)', 'PWD', 'State & arterial road construction, potholes, culverts, and resurfacing.');
  insertDept.run('dept-elec', 'Electricity Department', 'ELEC', 'Streetlights, distribution poles, and road illumination safety.');
  insertDept.run('dept-water', 'Water Authority', 'WATER', 'Potable water distribution mains, valves, and leak restoration.');
  insertDept.run('dept-muni-eng', 'Municipality Engineering Department', 'MUNI_ENG', 'Local footpaths, bus shelters, public buildings, and minor roads.');
  insertDept.run('dept-drain', 'Drainage Department', 'DRAIN', 'Stormwater drains, roadside culverts, and flood clearance.');
  insertDept.run('dept-waste', 'Waste Management Department', 'WASTE', 'Municipal solid waste collection, bins, and civic sanitation.');

  // 5. Issue Categories
  const insertCat = db.prepare(
    'INSERT INTO issue_categories (id, name, default_department_code, sla_hours, description) VALUES (?, ?, ?, ?, ?)'
  );
  insertCat.run('cat-1', 'Potholes', 'PWD', 48, 'Tarmac craters and carriageway potholes posing vehicle hazards.');
  insertCat.run('cat-2', 'Damaged roads', 'PWD', 72, 'Severe surface cracking, shoulder erosion, or pavement collapse.');
  insertCat.run('cat-3', 'Broken streetlights', 'ELEC', 24, 'Non-functional streetlamps, fallen poles, or exposed wiring.');
  insertCat.run('cat-4', 'Water leakage', 'WATER', 24, 'Burst supply mains, leaking valves, or road flooding from water lines.');
  insertCat.run('cat-5', 'Blocked drainage', 'DRAIN', 36, 'Clogged stormwater drains or choked roadside culverts.');
  insertCat.run('cat-6', 'Waste management', 'WASTE', 24, 'Uncollected garbage heaps or overflowing municipal waste bins.');
  insertCat.run('cat-7', 'Damaged public infrastructure', 'MUNI_ENG', 72, 'Broken footpaths, bus shelters, railings, or civic structures.');
  insertCat.run('cat-8', 'Unsafe road excavation', 'PWD', 24, 'Unbarricaded trenches or unpermitted road cutting.');
  insertCat.run('cat-9', 'Abandoned construction materials', 'MUNI_ENG', 48, 'Gravel, debris, or concrete blocks obstructing traffic.');
  insertCat.run('cat-10', 'Other public infrastructure problems', 'MANUAL', 72, 'Multi-agency or uncategorized civic infrastructure reports.');

  // 6. Department Jurisdictions
  const insertJur = db.prepare(
    'INSERT INTO department_jurisdictions (id, department_id, municipality_id, handled_categories_json, sla_hours) VALUES (?, ?, ?, ?, ?)'
  );
  const muniIds = ['mun-mlt', 'mun-kochi', 'mun-aluva', 'mun-kzk', 'mun-kzd'];
  for (const mId of muniIds) {
    insertJur.run(`jur-pwd-${mId}`, 'dept-pwd', mId, JSON.stringify(['Potholes', 'Damaged roads', 'Unsafe road excavation']), 48);
    insertJur.run(`jur-elec-${mId}`, 'dept-elec', mId, JSON.stringify(['Broken streetlights']), 24);
    insertJur.run(`jur-water-${mId}`, 'dept-water', mId, JSON.stringify(['Water leakage']), 24);
    insertJur.run(`jur-drain-${mId}`, 'dept-drain', mId, JSON.stringify(['Blocked drainage']), 36);
    insertJur.run(`jur-waste-${mId}`, 'dept-waste', mId, JSON.stringify(['Waste management']), 24);
    insertJur.run(`jur-meng-${mId}`, 'dept-muni-eng', mId, JSON.stringify(['Damaged public infrastructure', 'Abandoned construction materials']), 48);
  }

  // 7. Users (Demo Accounts across all 5 portals + Field Officers)
  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, phone, role, state_id, district_id, municipality_id, department_id, is_active, is_demo, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)
  `);
  insertUser.run('usr-comp-1', 'admin@pwdconnect.demo', demoPassHash, 'Arjun Menon (Platform Admin)', '+91 98470 10001', 'company_admin', null, null, null, null, isoAgo(720));
  insertUser.run('usr-cit-1', 'ananya.citizen@pwdconnect.demo', demoPassHash, 'Ananya Nair', '+91 98470 20001', 'citizen', 'st-kl', 'dist-ekm', 'mun-mlt', null, isoAgo(500));
  insertUser.run('usr-cit-2', 'vikram.citizen@pwdconnect.demo', demoPassHash, 'Vikram Pillai', '+91 98470 20002', 'citizen', 'st-kl', 'dist-ekm', 'mun-kochi', null, isoAgo(420));
  insertUser.run('usr-state-1', 'state.kerala@pwdconnect.demo', demoPassHash, 'Dr. Kavitha Krishnan IAS', '+91 98470 30001', 'state_admin', 'st-kl', null, null, null, isoAgo(700));
  insertUser.run('usr-dist-1', 'district.ernakulam@pwdconnect.demo', demoPassHash, 'Suresh Babu (District Nodal)', '+91 98470 30002', 'district_admin', 'st-kl', 'dist-ekm', null, null, isoAgo(650));
  insertUser.run('usr-muni-mlt', 'muni.mulanthuruthy@pwdconnect.demo', demoPassHash, 'Lakshmi Devi (Mulanthuruthy Admin)', '+91 98470 40001', 'municipality_admin', 'st-kl', 'dist-ekm', 'mun-mlt', null, isoAgo(600));
  insertUser.run('usr-muni-kochi', 'muni.kochi@pwdconnect.demo', demoPassHash, 'Rohan Varghese (Kochi Admin)', '+91 98470 40002', 'municipality_admin', 'st-kl', 'dist-ekm', 'mun-kochi', null, isoAgo(600));
  insertUser.run('usr-dept-pwd-mlt', 'dept.pwd.mlt@pwdconnect.demo', demoPassHash, 'Er. Thomas Kurian (PWD Exec)', '+91 98470 50001', 'department_admin', 'st-kl', 'dist-ekm', 'mun-mlt', 'dept-pwd', isoAgo(580));
  insertUser.run('usr-dept-elec-mlt', 'dept.elec.mlt@pwdconnect.demo', demoPassHash, 'Er. Deepa Mathew (Electricity)', '+91 98470 50002', 'department_admin', 'st-kl', 'dist-ekm', 'mun-mlt', 'dept-elec', isoAgo(580));
  insertUser.run('usr-dept-water-kochi', 'dept.water.kochi@pwdconnect.demo', demoPassHash, 'Er. Manoj George (Water Auth)', '+91 98470 50003', 'department_admin', 'st-kl', 'dist-ekm', 'mun-kochi', 'dept-water', isoAgo(580));
  insertUser.run('usr-fo-1', 'officer.rajesh@pwdconnect.demo', demoPassHash, 'Rajesh Kumar (PWD Field Eng)', '+91 98470 60001', 'field_officer', 'st-kl', 'dist-ekm', 'mun-mlt', 'dept-pwd', isoAgo(560));
  insertUser.run('usr-fo-2', 'officer.meera@pwdconnect.demo', demoPassHash, 'Meera Jose (Elec Field Tech)', '+91 98470 60002', 'field_officer', 'st-kl', 'dist-ekm', 'mun-mlt', 'dept-elec', isoAgo(560));
  insertUser.run('usr-fo-3', 'officer.arun@pwdconnect.demo', demoPassHash, 'Arun Das (Water Field Eng)', '+91 98470 60003', 'field_officer', 'st-kl', 'dist-ekm', 'mun-kochi', 'dept-water', isoAgo(560));

  // 8. Field Officers
  const insertFO = db.prepare(
    'INSERT INTO field_officers (id, user_id, department_id, municipality_id, designation) VALUES (?, ?, ?, ?, ?)'
  );
  insertFO.run('fo-1', 'usr-fo-1', 'dept-pwd', 'mun-mlt', 'Assistant Engineer (Roads)');
  insertFO.run('fo-2', 'usr-fo-2', 'dept-elec', 'mun-mlt', 'Sub-Engineer (Street Lighting)');
  insertFO.run('fo-3', 'usr-fo-3', 'dept-water', 'mun-kochi', 'Pipeline Inspection Officer');

  // 9. Civic Assets
  const insertAsset = db.prepare(
    'INSERT INTO assets (id, asset_code, name, asset_type, municipality_id, owner_department_id, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertAsset.run('ast-1', 'KL-EKM-MLT-RD-04', 'Mulanthuruthy–Piravom School Zone Road', 'State Highway Segment', 'mun-mlt', 'dept-pwd', 9.8981, 76.3854);
  insertAsset.run('ast-2', 'KL-EKM-KCH-RD-19', 'MG Road Metro Corridor North', 'Arterial Urban Road', 'mun-kochi', 'dept-pwd', 9.9698, 76.2869);
  insertAsset.run('ast-3', 'KL-EKM-MLT-EL-11', 'Pallithazham Junction High-Mast Cluster', 'Streetlight Network', 'mun-mlt', 'dept-elec', 9.9012, 76.3811);
  insertAsset.run('ast-4', 'KL-EKM-KCH-WT-08', 'Kaloor–Kadavanthra 300mm Supply Main', 'Water Distribution Line', 'mun-kochi', 'dept-water', 9.9852, 76.2995);
  insertAsset.run('ast-5', 'KL-EKM-ALV-DR-02', 'Aluva Market East Stormwater Culvert', 'Stormwater Drain', 'mun-aluva', 'dept-drain', 10.1051, 76.3522);

  // 10. Issues (Flagship PWD-2026-00125 + Realistic Kerala Demo Dataset)
  const insertIssue = db.prepare(`
    INSERT INTO issues (
      id, complaint_code, reporter_id, title, description, category, ai_suggested_category,
      ai_confidence, ai_summary, ai_reasoning, severity, status, routing_status,
      state_id, district_id, municipality_id, department_id, field_officer_id, asset_id, road_passport_id,
      address_text, latitude, longitude, is_escalated, escalation_count, duplicate_of_code,
      due_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Flagship Demo Complaint: PWD-2026-00125 (Currently at 'Resolved' awaiting Citizen Verification so Citizen can verify & close OR inspect!)
  insertIssue.run(
    'iss-125',
    'PWD-2026-00125',
    'usr-cit-1',
    "Deep pothole near St. Mary's School crossing",
    'Waterlogged tarmac crater 1.2m wide right beside the school pedestrian curb on Mulanthuruthy–Piravom Road, causing two-wheelers to swerve during morning school hours.',
    'Potholes',
    'Potholes',
    0.96,
    "Critical pothole hazard near St. Mary's School zone causing waterlogging and two-wheeler risk.",
    'Visual asphalt failure and school-zone proximity matched PWD road maintenance ownership.',
    'Critical',
    'Resolved',
    'auto_assigned',
    'st-kl',
    'dist-ekm',
    'mun-mlt',
    'dept-pwd',
    'fo-1',
    'ast-1',
    'rp-1',
    "Opposite St. Mary's HS School Gate, Mulanthuruthy, Ernakulam, Kerala 682314",
    9.8981,
    76.3854,
    0,
    0,
    null,
    isoAhead(12),
    isoAgo(38),
    isoAgo(2)
  );

  // Issue 2: Overdue + Escalated streetlight failure in Mulanthuruthy
  insertIssue.run(
    'iss-126',
    'PWD-2026-00126',
    'usr-cit-1',
    'Three consecutive streetlights dead at Pallithazham Junction',
    'Complete darkness along the bus stop stretch after 6:30 PM due to faulty feeder relay on pole KL-MLT-44.',
    'Broken streetlights',
    'Broken streetlights',
    0.94,
    'Dark junction at Pallithazham bus stop impacting pedestrian night safety.',
    'Matched Electricity Department streetlight maintenance jurisdiction.',
    'High',
    'Accepted by Department',
    'auto_assigned',
    'st-kl',
    'dist-ekm',
    'mun-mlt',
    'dept-elec',
    'fo-2',
    'ast-3',
    null,
    'Pallithazham Bus Stand Junction, Mulanthuruthy, Ernakulam',
    9.9012,
    76.3811,
    1,
    1,
    null,
    isoAgo(14), // Overdue!
    isoAgo(62),
    isoAgo(8)
  );

  // Issue 3: Work in Progress Water Leakage in Kochi Corporation
  insertIssue.run(
    'iss-127',
    'PWD-2026-00127',
    'usr-cit-2',
    'Pressurized drinking water pipe leak near Kaloor Stadium',
    'Continuous treated water gushing from roadside valve chamber flooding the left lane near Kaloor Metro pillar 542.',
    'Water leakage',
    'Water leakage',
    0.95,
    'Major potable water main leak wasting supply and undermining road shoulder.',
    'Water Authority pipeline asset match in Kochi Corporation.',
    'Critical',
    'Work in Progress',
    'auto_assigned',
    'st-kl',
    'dist-ekm',
    'mun-kochi',
    'dept-water',
    'fo-3',
    'ast-4',
    'rp-2',
    'Kaloor–Kadavanthra Road, Pillar 542, Kochi, Ernakulam',
    9.9852,
    76.2995,
    0,
    0,
    null,
    isoAhead(6),
    isoAgo(18),
    isoAgo(3)
  );

  // Issue 4: Assigned to PWD Mulanthuruthy (New incoming complaint for Dept Admin to accept/assign!)
  insertIssue.run(
    'iss-128',
    'PWD-2026-00128',
    'usr-cit-1',
    'Unbarricaded cable trench excavation near Vettickal Curve',
    'Deep 1.5m trench left open along the outer curve without reflective cones or warning boards.',
    'Unsafe road excavation',
    'Unsafe road excavation',
    0.91,
    'Unbarricaded road excavation hazard on blind curve.',
    'Road cutting safety compliance routed to PWD Mulanthuruthy.',
    'Critical',
    'Assigned to Department',
    'auto_assigned',
    'st-kl',
    'dist-ekm',
    'mun-mlt',
    'dept-pwd',
    null,
    'ast-1',
    'rp-3',
    'Vettickal Church Curve, Mulanthuruthy, Ernakulam',
    9.8935,
    76.3912,
    0,
    0,
    null,
    isoAhead(18),
    isoAgo(6),
    isoAgo(6)
  );

  // Issue 5: Manual Review Queue (Low confidence / multi-department)
  insertIssue.run(
    'iss-129',
    'PWD-2026-00129',
    'usr-cit-2',
    'Collapsed retaining slab and mixed debris near canal bridge',
    'Unidentified concrete slab damage adjacent to boundary fence where both irrigation drain and municipal footpath meet.',
    'Other public infrastructure problems',
    'Damaged public infrastructure',
    0.49,
    'Boundary retaining wall and debris obstruction requiring jurisdictional verification.',
    'Confidence below 55% auto-routing threshold; placed in manual review queue.',
    'High',
    'Under Review',
    'manual_review',
    'st-kl',
    'dist-ekm',
    'mun-kochi',
    null,
    null,
    null,
    null,
    'Edappally Canal Footbridge East, Kochi',
    10.0238,
    76.3089,
    0,
    0,
    null,
    isoAhead(48),
    isoAgo(12),
    isoAgo(12)
  );

  // Issue 6: Blocked Drainage in Aluva (Overdue)
  insertIssue.run(
    'iss-130',
    'PWD-2026-00130',
    'usr-cit-2',
    'Choked stormwater culvert flooding Aluva Market Lane',
    'Silt and plastic accumulation blocking culvert grate causing ankle-deep stagnation.',
    'Blocked drainage',
    'Blocked drainage',
    0.92,
    'Blocked stormwater culvert creating market sanitation hazard.',
    'Matched Drainage Department in Aluva Municipality.',
    'High',
    'Field Inspection',
    'auto_assigned',
    'st-kl',
    'dist-ekm',
    'mun-aluva',
    'dept-drain',
    null,
    'ast-5',
    null,
    'Aluva Market East Road, Ernakulam',
    10.1051,
    76.3522,
    1,
    1,
    null,
    isoAgo(8),
    isoAgo(52),
    isoAgo(20)
  );

  // Issue 7: Closed verified complaint in Kozhikode
  insertIssue.run(
    'iss-131',
    'PWD-2026-00131',
    'usr-cit-2',
    'Damaged tarmac shoulder at Beach Road roundabout',
    'Edge erosion along heavily used coastal corridor restored and verified.',
    'Damaged roads',
    'Damaged roads',
    0.93,
    'Coastal roundabout tarmac shoulder erosion repaired.',
    'Matched PWD Kozhikode Corporation.',
    'Medium',
    'Closed',
    'auto_assigned',
    'st-kl',
    'dist-kzd',
    'mun-kzd',
    'dept-pwd',
    null,
    null,
    'rp-4',
    'Beach Road South Junction, Kozhikode',
    11.2588,
    75.774,
    0,
    0,
    null,
    isoAgo(24),
    isoAgo(120),
    isoAgo(16)
  );

  // Issue 8: Waste management in Kazhakkoottam
  insertIssue.run(
    'iss-132',
    'PWD-2026-00132',
    'usr-cit-1',
    'Overflowing public waste transfer bin near Technopark Phase 1',
    'Unsorted waste spilling onto service lane footpath for 2 days.',
    'Waste management',
    'Waste management',
    0.91,
    'Overflowing sanitation bin blocking service lane pedestrian path.',
    'Matched Waste Management Department in Kazhakkoottam.',
    'Medium',
    'Work in Progress',
    'auto_assigned',
    'st-kl',
    'dist-tvm',
    'mun-kzk',
    'dept-waste',
    null,
    null,
    null,
    'Technopark Service Lane, Kazhakkoottam, Thiruvananthapuram',
    8.5686,
    76.8731,
    0,
    0,
    null,
    isoAhead(10),
    isoAgo(16),
    isoAgo(4)
  );

  // 11. Issue Evidence (using our generated local images!)
  const insertEv = db.prepare(
    'INSERT INTO issue_evidence (id, issue_id, uploader_id, evidence_type, media_url, media_kind, caption, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertEv.run(
    'ev-1',
    'iss-125',
    'usr-cit-1',
    'citizen_initial',
    '/src/assets/images/sample_pothole_before_1795365318496.jpg',
    'image',
    'Citizen geo-tagged photo of deep waterlogged pothole near school gate.',
    isoAgo(38)
  );
  insertEv.run(
    'ev-2',
    'iss-125',
    'usr-fo-1',
    'inspection',
    '/src/assets/images/road_passport_inspection_1795365318556.jpg',
    'image',
    'Field Engineer Rajesh Kumar conducting subgrade depth and drainage check.',
    isoAgo(22)
  );
  insertEv.run(
    'ev-3',
    'iss-125',
    'usr-fo-1',
    'after_repair',
    '/src/assets/images/sample_road_after_1795365318126.jpg',
    'image',
    'Hot-mix asphalt resurfacing and white edge thermoplastic marking completed.',
    isoAgo(2)
  );

  // 12. Assignments
  const insertAssign = db.prepare(`
    INSERT INTO assignments (id, issue_id, department_id, field_officer_id, assigned_by_user_id, accepted_at, inspection_notes, completion_notes, escalated_at, escalation_reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAssign.run(
    'asg-1',
    'iss-125',
    'dept-pwd',
    'fo-1',
    'usr-comp-1',
    isoAgo(35),
    'Sub-base moisture drained; 40mm bituminous macadam patch required.',
    'Resurfaced 6m x 2.5m section and repainted school crossing edge line.',
    null,
    null,
    isoAgo(38)
  );
  insertAssign.run(
    'asg-2',
    'iss-126',
    'dept-elec',
    'fo-2',
    'usr-comp-1',
    isoAgo(55),
    'Feeder contactor burnt out; replacement unit requisitioned.',
    null,
    isoAgo(8),
    'Exceeded 24h SLA at high-footfall bus junction.',
    isoAgo(62)
  );
  insertAssign.run(
    'asg-3',
    'iss-127',
    'dept-water',
    'fo-3',
    'usr-comp-1',
    isoAgo(16),
    '300mm CI collar gasket ruptured; pressure isolated on Zone B.',
    null,
    null,
    null,
    isoAgo(18)
  );
  insertAssign.run(
    'asg-4',
    'iss-128',
    'dept-pwd',
    null,
    'usr-comp-1',
    null,
    null,
    null,
    null,
    null,
    isoAgo(6)
  );

  // 13. Status History
  const insertHist = db.prepare(
    'INSERT INTO status_history (id, issue_id, from_status, to_status, changed_by_user_id, changed_by_role, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertHist.run('hist-1', 'iss-125', null, 'Submitted', 'usr-cit-1', 'citizen', 'Complaint submitted with GPS coordinates & school-zone photo.', isoAgo(38));
  insertHist.run('hist-2', 'iss-125', 'Submitted', 'Assigned to Department', 'usr-comp-1', 'company_admin', 'AI + Jurisdiction Engine auto-assigned to PWD Mulanthuruthy (96% confidence).', isoAgo(38));
  insertHist.run('hist-3', 'iss-125', 'Assigned to Department', 'Accepted by Department', 'usr-dept-pwd-mlt', 'department_admin', 'Accepted by Er. Thomas Kurian and assigned to Field Engineer Rajesh Kumar.', isoAgo(35));
  insertHist.run('hist-4', 'iss-125', 'Accepted by Department', 'Field Inspection', 'usr-fo-1', 'field_officer', 'Site inspected; drainage check & tarmac measurement logged.', isoAgo(22));
  insertHist.run('hist-5', 'iss-125', 'Field Inspection', 'Work in Progress', 'usr-fo-1', 'field_officer', 'Hot-mix resurfacing crew deployed with safety barricades.', isoAgo(12));
  insertHist.run('hist-6', 'iss-125', 'Work in Progress', 'Resolved', 'usr-fo-1', 'field_officer', 'Repair completed and Road Passport RP-KL-EKM-2026-01 updated. Ready for citizen verification.', isoAgo(2));

  insertHist.run('hist-7', 'iss-126', null, 'Submitted', 'usr-cit-1', 'citizen', 'Streetlight outage reported.', isoAgo(62));
  insertHist.run('hist-8', 'iss-126', 'Submitted', 'Assigned to Department', 'usr-comp-1', 'company_admin', 'Auto-assigned to Electricity Department Mulanthuruthy.', isoAgo(62));
  insertHist.run('hist-9', 'iss-126', 'Assigned to Department', 'Accepted by Department', 'usr-dept-elec-mlt', 'department_admin', 'Accepted and assigned to Field Tech Meera Jose.', isoAgo(55));

  insertHist.run('hist-10', 'iss-128', null, 'Submitted', 'usr-cit-1', 'citizen', 'Unsafe road excavation reported at Vettickal Curve.', isoAgo(6));
  insertHist.run('hist-11', 'iss-128', 'Submitted', 'Assigned to Department', 'usr-comp-1', 'company_admin', 'Auto-assigned to PWD Mulanthuruthy.', isoAgo(6));

  // 14. Road Passports
  const insertRP = db.prepare(`
    INSERT INTO road_passports (
      id, passport_code, asset_id, linked_issue_id, municipality_id, department_id, purpose,
      work_start_date, expected_completion_date, actual_completion_date,
      before_photo_url, after_photo_url, work_status, inspection_result,
      citizen_verification_status, repeat_dig_count, ai_comparison_score, ai_comparison_summary,
      flagged_for_inspection, latitude, longitude, history_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertRP.run(
    'rp-1',
    'RP-KL-EKM-2026-01',
    'ast-1',
    'iss-125',
    'mun-mlt',
    'dept-pwd',
    'School-zone pothole resurfacing & shoulder compaction',
    '2026-11-20',
    '2026-11-22',
    '2026-11-22',
    '/src/assets/images/sample_pothole_before_1795365318496.jpg',
    '/src/assets/images/sample_road_after_1795365318126.jpg',
    'Completed',
    'Passed Field Inspection',
    'Pending',
    1,
    94,
    'Surface smoothness restored, edge thermoplastic line applied, and standing water eliminated.',
    0,
    9.8981,
    76.3854,
    JSON.stringify([
      { timestamp: isoAgo(38), actor: 'PWD Auto-Router', note: 'Digital Road Passport initialized from complaint PWD-2026-00125.' },
      { timestamp: isoAgo(22), actor: 'Rajesh Kumar (Field Eng)', note: 'Pre-repair subgrade inspection photo attached.' },
      { timestamp: isoAgo(2), actor: 'Rajesh Kumar (Field Eng)', note: 'Post-restoration photo uploaded; AI quality score 94/100.' },
    ]),
    isoAgo(38),
    isoAgo(2)
  );

  insertRP.run(
    'rp-2',
    'RP-KL-EKM-2026-02',
    'ast-4',
    'iss-127',
    'mun-kochi',
    'dept-water',
    '300mm water main joint excavation & road trench backfilling',
    '2026-11-21',
    '2026-11-23',
    null,
    '/src/assets/images/sample_pothole_before_1795365318496.jpg',
    null,
    'Excavation Active',
    'Pending Restoration',
    'Pending',
    3, // Repeat dig alert!
    null,
    'Repeat excavation zone: 3rd road cut at this junction in 12 months.',
    1,
    9.9852,
    76.2995,
    JSON.stringify([
      { timestamp: isoAgo(18), actor: 'Water Authority Kochi', note: 'Emergency trench permit linked to PWD-2026-00127 (3rd excavation in 12 months).' },
    ]),
    isoAgo(18),
    isoAgo(3)
  );

  insertRP.run(
    'rp-3',
    'RP-KL-EKM-2026-03',
    'ast-1',
    'iss-128',
    'mun-mlt',
    'dept-pwd',
    'Utility duct trenching near Vettickal Curve (Overdue Restoration)',
    '2026-11-12',
    '2026-11-18',
    null,
    '/src/assets/images/sample_pothole_before_1795365318496.jpg',
    null,
    'Overdue',
    'Flagged — Unbarricaded Trench',
    'Disputed',
    2,
    42,
    'Restoration overdue by 4 days; surface remains unpaved with exposed trench.',
    1,
    9.8935,
    76.3912,
    JSON.stringify([
      { timestamp: isoAgo(240), actor: 'Mulanthuruthy Municipality', note: 'Excavation permit issued for utility ducting.' },
      { timestamp: isoAgo(6), actor: 'PWD-2026-00128 Alert', note: 'Flagged as overdue restoration & repeat excavation corridor.' },
    ]),
    isoAgo(240),
    isoAgo(6)
  );

  insertRP.run(
    'rp-4',
    'RP-KL-KZD-2026-04',
    'ast-2',
    'iss-131',
    'mun-kzd',
    'dept-pwd',
    'Coastal roundabout shoulder restoration',
    '2026-11-15',
    '2026-11-20',
    '2026-11-19',
    '/src/assets/images/sample_pothole_before_1795365318496.jpg',
    '/src/assets/images/sample_road_after_1795365318126.jpg',
    'Completed',
    'Verified Clean',
    'Verified',
    1,
    97,
    'Full compaction and kerb alignment verified by citizen and field officer.',
    0,
    11.2588,
    75.774,
    JSON.stringify([
      { timestamp: isoAgo(120), actor: 'PWD Kozhikode', note: 'Shoulder repair initiated.' },
      { timestamp: isoAgo(16), actor: 'Citizen Verification', note: 'Citizen confirmed repair; passport closed.' },
    ]),
    isoAgo(120),
    isoAgo(16)
  );

  // 15. Notifications
  const insertNotif = db.prepare(
    'INSERT INTO notifications (id, user_id, issue_id, complaint_code, title, message, event_type, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)'
  );
  insertNotif.run(
    'ntf-1',
    'usr-cit-1',
    'iss-125',
    'PWD-2026-00125',
    'Repair Marked Resolved — Verify Now',
    "PWD Mulanthuruthy completed the pothole repair near St. Mary's School. Please inspect the after-repair photo and confirm or reopen.",
    'repair_completed',
    isoAgo(2)
  );
  insertNotif.run(
    'ntf-2',
    'usr-dept-pwd-mlt',
    'iss-128',
    'PWD-2026-00128',
    'New Auto-Routed Complaint Assigned',
    'PWD-2026-00128 (Unsafe road excavation at Vettickal Curve) has been routed to PWD Mulanthuruthy.',
    'department_assigned',
    isoAgo(6)
  );
  insertNotif.run(
    'ntf-3',
    'usr-muni-mlt',
    'iss-126',
    'PWD-2026-00126',
    'Overdue Escalation Alert',
    'PWD-2026-00126 (Broken streetlights at Pallithazham Junction) exceeded its 24h SLA.',
    'overdue_alert',
    isoAgo(8)
  );
  insertNotif.run(
    'ntf-4',
    'usr-fo-1',
    'iss-125',
    'PWD-2026-00125',
    'Completion Report Submitted',
    'Your restoration evidence for PWD-2026-00125 is awaiting citizen verification.',
    'field_update',
    isoAgo(2)
  );

  // 16. Audit Logs
  const insertAudit = db.prepare(
    'INSERT INTO audit_logs (id, actor_user_id, actor_role, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertAudit.run('aud-1', 'usr-comp-1', 'company_admin', 'SYSTEM_SEED', 'platform', 'kerala-demo', 'Initialized Kerala civic jurisdictions, 6 departments, and illustrative demo dataset.', isoAgo(700));
  insertAudit.run('aud-2', 'usr-muni-mlt', 'municipality_admin', 'ESCALATE_ISSUE', 'issue', 'PWD-2026-00126', 'Escalated overdue streetlight complaint at Pallithazham Junction to Electricity Department.', isoAgo(8));
  insertAudit.run('aud-3', 'usr-fo-1', 'field_officer', 'UPDATE_REPAIR_EVIDENCE', 'road_passport', 'RP-KL-EKM-2026-01', 'Uploaded after-repair photograph and marked PWD-2026-00125 Resolved.', isoAgo(2));
}
