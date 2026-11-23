import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { db, hashPassword, initializeDatabase, verifyPassword } from './server/db.ts';
import {
  analyzeComplaintWithAi,
  compareRepairPhotosWithAi,
  extractWhatsappComplaintWithAi,
  generateDashboardSummaryWithAi,
} from './server/ai.ts';
import {
  detectDuplicateIssues,
  detectRepeatRoadExcavations,
  routeIssueToDepartment,
} from './src/lib/routingEngine.ts';
import {
  formatPhoneDisplay,
  formatWhatsappConfirmationReply,
  normalizePhoneNumber,
} from './src/lib/whatsappBot.ts';
import {
  canCreateDistrict,
  canCreatePlace,
  canManageFieldOfficers,
  canPerformIssueAction,
  canUpdateDistrictStatus,
  canUpdatePlaceStatus,
  canUserAccessIssue,
  isValidLocationStatus,
} from './src/lib/workflow.ts';
import type {
  CivicIssue,
  DepartmentJurisdiction,
  IssueCategoryConfig,
  IssueStatus,
  MunicipalityRecord,
  RoadPassport,
  UserAccount,
  UserRole,
  WhatsappMessageRecord,
  WhatsappSessionDraft,
} from './src/lib/types.ts';

initializeDatabase();

const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

interface SessionPayload {
  userId: string;
  role: UserRole;
  exp: number;
}

function signSessionToken(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.userId || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveBase64Upload(dataUrl: string, prefix: string): string {
  if (!dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) return dataUrl;
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('Image exceeds 5MB maximum limit.');
  }
  const filename = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const target = path.resolve(uploadsDir, filename);
  if (!target.startsWith(uploadsDir + path.sep)) {
    throw new Error('Invalid upload destination.');
  }
  fs.writeFileSync(target, buffer);
  return `/uploads/${filename}`;
}

function readUploadAsBase64(mediaUrl: string): { base64: string; mimeType: string } | null {
  try {
    if (mediaUrl.startsWith('data:image/')) {
      const m = mediaUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (m) return { mimeType: m[1], base64: m[2] };
      return null;
    }
    let resolved: string | null = null;
    if (mediaUrl.startsWith('/uploads/')) {
      const name = path.basename(mediaUrl);
      const candidate = path.resolve(uploadsDir, name);
      if (candidate.startsWith(uploadsDir + path.sep) && fs.existsSync(candidate)) {
        resolved = candidate;
      }
    } else if (mediaUrl.startsWith('/src/assets/images/')) {
      const baseDir = path.resolve(process.cwd(), 'src', 'assets', 'images');
      const name = path.basename(mediaUrl);
      const candidate = path.resolve(baseDir, name);
      if (candidate.startsWith(baseDir + path.sep) && fs.existsSync(candidate)) {
        resolved = candidate;
      }
    }
    if (!resolved) return null;
    const ext = path.extname(resolved).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return { mimeType, base64: fs.readFileSync(resolved).toString('base64') };
  } catch {
    return null;
  }
}

function mapUserRow(row: any): UserAccount {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    role: row.role as UserRole,
    stateId: row.state_id,
    districtId: row.district_id,
    municipalityId: row.municipality_id,
    departmentId: row.department_id,
    isActive: Boolean(row.is_active),
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
  };
}

function createNotification(params: {
  userId: string;
  issueId?: string | null;
  complaintCode?: string | null;
  title: string;
  message: string;
  eventType: string;
}): void {
  const id = `ntf-${crypto.randomUUID().slice(0, 8)}`;
  db.prepare(
    `INSERT INTO notifications (id, user_id, issue_id, complaint_code, title, message, event_type, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    id,
    params.userId,
    params.issueId ?? null,
    params.complaintCode ?? null,
    params.title,
    params.message,
    params.eventType,
    new Date().toISOString()
  );
}

function writeAuditLog(params: {
  actorUserId: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
}): void {
  const id = `aud-${crypto.randomUUID().slice(0, 8)}`;
  db.prepare(
    `INSERT INTO status_history (id, issue_id, from_status, to_status, changed_by_user_id, changed_by_role, note, created_at)
     SELECT ?, ?, NULL, '', ?, ?, ?, ? WHERE 0`
  );
  db.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, actor_role, action, entity_type, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.actorUserId,
    params.actorRole,
    params.action,
    params.entityType,
    params.entityId,
    params.details,
    new Date().toISOString()
  );
}

function getJurisdictionsWithNames(): DepartmentJurisdiction[] {
  const rows = db
    .prepare(
      `SELECT dj.*, d.name as department_name, m.name as municipality_name
       FROM department_jurisdictions dj
       JOIN departments d ON d.id = dj.department_id
       JOIN municipalities m ON m.id = dj.municipality_id`
    )
    .all() as any[];

  return rows.map((r) => ({
    id: r.id,
    departmentId: r.department_id,
    departmentName: r.department_name,
    municipalityId: r.municipality_id,
    municipalityName: r.municipality_name,
    handledCategories: JSON.parse(r.handled_categories_json || '[]'),
    slaHours: r.sla_hours,
  }));
}

function getCategoryConfigs(): IssueCategoryConfig[] {
  const rows = db.prepare('SELECT * FROM issue_categories ORDER BY id ASC').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    defaultDepartmentCode: r.default_department_code,
    slaHours: r.sla_hours,
    description: r.description,
    isActive: Boolean(r.is_active),
  }));
}

function hydrateIssueRow(row: any) {
  const nowMs = Date.now();
  const isClosed = row.status === 'Closed' || row.status === 'Resolved';
  const isOverdue = !isClosed && new Date(row.due_at).getTime() < nowMs;
  return {
    id: row.id,
    complaintCode: row.complaint_code,
    reporterId: row.reporter_id,
    reporterName: row.reporter_name,
    title: row.title,
    description: row.description,
    category: row.category,
    aiSuggestedCategory: row.ai_suggested_category,
    aiConfidence: row.ai_confidence,
    aiSummary: row.ai_summary,
    aiReasoning: row.ai_reasoning,
    severity: row.severity,
    status: row.status as IssueStatus,
    routingStatus: row.routing_status,
    stateId: row.state_id,
    stateName: row.state_name,
    districtId: row.district_id,
    districtName: row.district_name,
    municipalityId: row.municipality_id,
    municipalityName: row.municipality_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    fieldOfficerId: row.field_officer_id,
    fieldOfficerName: row.field_officer_name,
    assetId: row.asset_id,
    roadPassportId: row.road_passport_id,
    addressText: row.address_text,
    latitude: row.latitude,
    longitude: row.longitude,
    isOverdue,
    isEscalated: Boolean(row.is_escalated),
    escalationCount: row.escalation_count,
    duplicateOfCode: row.duplicate_of_code,
    channel: (row.channel === 'whatsapp' ? 'whatsapp' : 'web') as 'web' | 'whatsapp',
    reporterPhone: row.reporter_phone || row.reporter_phone_user || null,
    dueAt: row.due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BASE_ISSUE_SELECT = `
  SELECT i.*,
    u.full_name as reporter_name,
    u.phone as reporter_phone_user,
    s.name as state_name,
    d.name as district_name,
    m.name as municipality_name,
    dept.name as department_name,
    fo_u.full_name as field_officer_name
  FROM issues i
  JOIN users u ON u.id = i.reporter_id
  JOIN states s ON s.id = i.state_id
  JOIN districts d ON d.id = i.district_id
  JOIN municipalities m ON m.id = i.municipality_id
  LEFT JOIN departments dept ON dept.id = i.department_id
  LEFT JOIN field_officers fo ON fo.id = i.field_officer_id
  LEFT JOIN users fo_u ON fo_u.id = fo.user_id
`;

function hydratePassportRow(row: any): RoadPassport {
  return {
    id: row.id,
    passportCode: row.passport_code,
    assetId: row.asset_id,
    assetName: row.asset_name,
    linkedIssueId: row.linked_issue_id,
    linkedComplaintCode: row.linked_complaint_code ?? null,
    municipalityId: row.municipality_id,
    municipalityName: row.municipality_name,
    districtName: row.district_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    purpose: row.purpose,
    workStartDate: row.work_start_date,
    expectedCompletionDate: row.expected_completion_date,
    actualCompletionDate: row.actual_completion_date,
    beforePhotoUrl: row.before_photo_url,
    afterPhotoUrl: row.after_photo_url,
    workStatus: row.work_status,
    inspectionResult: row.inspection_result,
    citizenVerificationStatus: row.citizen_verification_status,
    repeatDigCount: row.repeat_dig_count,
    aiComparisonScore: row.ai_comparison_score,
    aiComparisonSummary: row.ai_comparison_summary,
    flaggedForInspection: Boolean(row.flagged_for_inspection),
    latitude: row.latitude,
    longitude: row.longitude,
    history: JSON.parse(row.history_json || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BASE_PASSPORT_SELECT = `
  SELECT rp.*,
    a.name as asset_name,
    m.name as municipality_name,
    dist.name as district_name,
    dept.name as department_name,
    i.complaint_code as linked_complaint_code
  FROM road_passports rp
  JOIN assets a ON a.id = rp.asset_id
  JOIN municipalities m ON m.id = rp.municipality_id
  JOIN districts dist ON dist.id = m.district_id
  JOIN departments dept ON dept.id = rp.department_id
  LEFT JOIN issues i ON i.id = rp.linked_issue_id
`;

interface AuthRequest extends Request {
  authUser?: UserAccount;
  fieldOfficerId?: string | null;
  rawBody?: Buffer;
}

function resolveOptionalAuthUser(req: Request): UserAccount | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const payload = verifySessionToken(header.slice('Bearer '.length).trim());
  if (!payload) return null;
  const row = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.userId) as any;
  return row ? mapUserRow(row) : null;
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }
  const row = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.userId) as any;
  if (!row) {
    res.status(401).json({ error: 'Account unavailable or deactivated.' });
    return;
  }
  const user = mapUserRow(row);
  const foRow = db.prepare('SELECT id FROM field_officers WHERE user_id = ?').get(user.id) as { id: string } | undefined;
  req.authUser = user;
  req.fieldOfficerId = foRow?.id ?? null;
  next();
}

function getAllMunicipalities(): MunicipalityRecord[] {
  return db
    .prepare(
      'SELECT id, state_id as stateId, district_id as districtId, name, type, status, center_lat as centerLat, center_lng as centerLng FROM municipalities ORDER BY name'
    )
    .all() as unknown as MunicipalityRecord[];
}

function resolveOrCreateWhatsappCitizen(phone: string, fallbackMuni?: MunicipalityRecord | null): UserAccount {
  const normalized = normalizePhoneNumber(phone);
  const digits = normalized.replace(/\D/g, '');
  const existingCitizen = db
    .prepare(
      `SELECT * FROM users
       WHERE role = 'citizen' AND is_active = 1
       AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '+', ''), '(', '') = ?
       LIMIT 1`
    )
    .get(digits) as any;

  if (existingCitizen) {
    return mapUserRow(existingCitizen);
  }

  const stateId = fallbackMuni?.stateId || 'st-kl';
  const districtId = fallbackMuni?.districtId || 'dist-ekm';
  const muniId = fallbackMuni?.id || 'mun-mlt';
  const id = `usr-wa-${crypto.randomUUID().slice(0, 8)}`;
  const email = `wa.${digits}@citizen.civilsetu.in`;
  const existingByEmail = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email) as any;
  if (existingByEmail) {
    return mapUserRow(existingByEmail);
  }

  const nowIso = new Date().toISOString();
  const passHash = hashPassword(crypto.randomBytes(16).toString('hex'));
  db.prepare(
    `INSERT INTO users (id, email, password_hash, full_name, phone, role, state_id, district_id, municipality_id, department_id, is_active, is_demo, created_at)
     VALUES (?, ?, ?, ?, ?, 'citizen', ?, ?, ?, NULL, 1, 0, ?)`
  ).run(id, email, passHash, `WhatsApp Citizen (${formatPhoneDisplay(normalized)})`, normalized, stateId, districtId, muniId, nowIso);

  const created = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return mapUserRow(created);
}

function mapWhatsappMessageRow(row: any): WhatsappMessageRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    phoneNumber: row.phone_number,
    direction: row.direction,
    body: row.body,
    mediaUrl: row.media_url,
    linkedComplaintCode: row.linked_complaint_code,
    channelMode: row.channel_mode || 'web_simulator',
    createdAt: row.created_at,
  };
}

async function sendMetaCloudWhatsappMessage(toPhone: string, bodyText: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return;
  try {
    const toDigits = normalizePhoneNumber(toPhone).replace(/\D/g, '');
    await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toDigits,
        type: 'text',
        text: { body: bodyText },
      }),
    });
  } catch (err) {
    console.error('Meta WhatsApp outbound send failed (logged locally):', err);
  }
}

function notifyWhatsappChannelOnIssueUpdate(issue: CivicIssue, messageText: string) {
  if (issue.channel !== 'whatsapp' && !issue.reporterPhone) return;
  const phoneToUse = issue.reporterPhone ? normalizePhoneNumber(issue.reporterPhone) : null;
  const sessionRow = phoneToUse
    ? (db.prepare('SELECT * FROM whatsapp_sessions WHERE phone_number = ?').get(phoneToUse) as any)
    : (db.prepare('SELECT * FROM whatsapp_sessions WHERE citizen_user_id = ? ORDER BY updated_at DESC LIMIT 1').get(issue.reporterId) as any);

  if (!sessionRow) return;
  const nowIso = new Date().toISOString();
  const msgId = `wam-${crypto.randomUUID().slice(0, 8)}`;
  db.prepare(
    `INSERT INTO whatsapp_messages (id, session_id, phone_number, direction, body, media_url, linked_complaint_code, channel_mode, created_at)
     VALUES (?, ?, ?, 'outbound', ?, NULL, ?, 'web_simulator', ?)`
  ).run(msgId, sessionRow.id, sessionRow.phone_number, messageText, issue.complaintCode, nowIso);
  db.prepare('UPDATE whatsapp_sessions SET updated_at = ? WHERE id = ?').run(nowIso, sessionRow.id);
  void sendMetaCloudWhatsappMessage(sessionRow.phone_number, messageText);
}

async function createCivicIssuePipeline(params: {
  user: UserAccount;
  title: string;
  description: string;
  category?: string;
  municipalityId: string;
  addressText?: string;
  latitude?: number;
  longitude?: number;
  photoDataUrl?: string;
  videoName?: string;
  channel?: 'web' | 'whatsapp';
  reporterPhone?: string | null;
}) {
  const muni = db.prepare('SELECT * FROM municipalities WHERE id = ?').get(params.municipalityId) as any;
  if (!muni) {
    throw Object.assign(new Error('Invalid municipality selected.'), { statusCode: 400 });
  }
  if (muni.status && muni.status !== 'Active') {
    throw Object.assign(
      new Error(`Place "${muni.name}" is currently ${muni.status} and cannot accept new complaints.`),
      { statusCode: 400 }
    );
  }

  const lat =
    typeof params.latitude === 'number' && !Number.isNaN(params.latitude) ? params.latitude : muni.center_lat;
  const lng =
    typeof params.longitude === 'number' && !Number.isNaN(params.longitude) ? params.longitude : muni.center_lng;

  let uploadedPhotoUrl = '';
  if (typeof params.photoDataUrl === 'string' && params.photoDataUrl.trim()) {
    uploadedPhotoUrl = saveBase64Upload(params.photoDataUrl, params.channel === 'whatsapp' ? 'whatsapp' : 'citizen');
  }

  const imageInfo = uploadedPhotoUrl ? readUploadAsBase64(uploadedPhotoUrl) : null;
  const aiAnalysis = await analyzeComplaintWithAi({
    title: params.title.trim(),
    description: params.description.trim(),
    selectedCategory: typeof params.category === 'string' ? params.category : undefined,
    imageBase64: imageInfo?.base64,
    mimeType: imageInfo?.mimeType,
    municipalityName: muni.name,
  });

  const finalCategory =
    typeof params.category === 'string' && params.category.trim() && params.category !== 'Auto-Detect with AI'
      ? params.category.trim()
      : aiAnalysis.suggestedCategory;

  const effectiveConfidence =
    typeof params.category === 'string' && params.category.trim() && params.category !== 'Auto-Detect with AI'
      ? Math.max(aiAnalysis.confidence, 0.85)
      : aiAnalysis.confidence;

  const routing = routeIssueToDepartment({
    category: finalCategory,
    confidence: finalCategory === 'Other public infrastructure problems' ? 0.45 : effectiveConfidence,
    municipalityId: muni.id,
    jurisdictions: getJurisdictionsWithNames(),
    categoryConfigs: getCategoryConfigs(),
  });

  const existingRows = db
    .prepare('SELECT id, complaint_code as complaintCode, title, description, category, status, latitude, longitude FROM issues')
    .all() as any[];

  const dupes = detectDuplicateIssues({
    title: params.title.trim(),
    description: params.description.trim(),
    category: finalCategory,
    latitude: lat,
    longitude: lng,
    existingIssues: existingRows,
  });

  const seqCount = (db.prepare('SELECT COUNT(*) as c FROM issues').get() as { c: number }).c + 126;
  const complaintCode = `PWD-2026-${String(seqCount).padStart(5, '0')}`;
  const issueId = `iss-${crypto.randomUUID().slice(0, 8)}`;
  const nowIso = new Date().toISOString();
  const dueIso = new Date(Date.now() + routing.slaHours * 3600 * 1000).toISOString();
  const initialStatus: IssueStatus =
    routing.routingStatus === 'auto_assigned' ? 'Assigned to Department' : 'Under Review';
  const channel: 'web' | 'whatsapp' = params.channel === 'whatsapp' ? 'whatsapp' : 'web';
  const reporterPhone = params.reporterPhone ? normalizePhoneNumber(params.reporterPhone) : params.user.phone || null;

  db.prepare(
    `INSERT INTO issues (
      id, complaint_code, reporter_id, title, description, category, ai_suggested_category,
      ai_confidence, ai_summary, ai_reasoning, severity, status, routing_status,
      state_id, district_id, municipality_id, department_id, field_officer_id, asset_id, road_passport_id,
      address_text, latitude, longitude, is_escalated, escalation_count, duplicate_of_code,
      channel, reporter_phone, due_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)`
  ).run(
    issueId,
    complaintCode,
    params.user.id,
    params.title.trim(),
    params.description.trim(),
    finalCategory,
    aiAnalysis.suggestedCategory,
    aiAnalysis.confidence,
    aiAnalysis.summary,
    aiAnalysis.reasoning,
    aiAnalysis.severity,
    initialStatus,
    routing.routingStatus,
    muni.state_id,
    muni.district_id,
    muni.id,
    routing.departmentId,
    (typeof params.addressText === 'string' && params.addressText.trim()) || `${muni.name}, Kerala`,
    lat,
    lng,
    dupes[0]?.complaintCode ?? null,
    channel,
    reporterPhone,
    dueIso,
    nowIso,
    nowIso
  );

  let roadPassportId: string | null = null;
  const roadCategories = ['Potholes', 'Damaged roads', 'Unsafe road excavation', 'Water leakage'];
  if (roadCategories.includes(finalCategory) && routing.departmentId) {
    const allPassports = (db.prepare(BASE_PASSPORT_SELECT).all() as any[]).map(hydratePassportRow);
    const repeatCheck = detectRepeatRoadExcavations({
      latitude: lat,
      longitude: lng,
      existingPassports: allPassports,
    });

    let assetRow = db
      .prepare('SELECT id FROM assets WHERE municipality_id = ? LIMIT 1')
      .get(muni.id) as { id: string } | undefined;

    if (!assetRow) {
      const newAssetId = `ast-${crypto.randomUUID().slice(0, 6)}`;
      db.prepare(
        'INSERT INTO assets (id, asset_code, name, asset_type, municipality_id, owner_department_id, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        newAssetId,
        `KL-${muni.name.slice(0, 3).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`,
        `${muni.name} Civic Corridor`,
        'Urban Road Segment',
        muni.id,
        routing.departmentId,
        lat,
        lng
      );
      assetRow = { id: newAssetId };
    }

    roadPassportId = `rp-${crypto.randomUUID().slice(0, 8)}`;
    const rpCode = `RP-KL-2026-${String(allPassports.length + 1).padStart(2, '0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const repeatCount = repeatCheck.isRepeatZone ? repeatCheck.totalPriorExcavations + 1 : 1;
    const startDay = nowIso.slice(0, 10);
    const expDay = new Date(Date.now() + routing.slaHours * 3600 * 1000).toISOString().slice(0, 10);

    db.prepare(
      `INSERT INTO road_passports (
        id, passport_code, asset_id, linked_issue_id, municipality_id, department_id, purpose,
        work_start_date, expected_completion_date, before_photo_url, work_status, inspection_result,
        citizen_verification_status, repeat_dig_count, flagged_for_inspection, latitude, longitude, history_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      roadPassportId,
      rpCode,
      assetRow.id,
      issueId,
      muni.id,
      routing.departmentId,
      `${finalCategory}: ${params.title.trim()}`,
      startDay,
      expDay,
      uploadedPhotoUrl || '/src/assets/images/sample_pothole_before_1795365318496.jpg',
      finalCategory === 'Unsafe road excavation' ? 'Excavation Active' : 'Planned',
      repeatCheck.isRepeatZone ? 'Repeat Dig Zone Alert' : 'Awaiting Field Inspection',
      repeatCount,
      repeatCheck.isRepeatZone ? 1 : 0,
      lat,
      lng,
      JSON.stringify([
        {
          timestamp: nowIso,
          actor: channel === 'whatsapp' ? 'WhatsApp Civic Bot + Auto-Router' : 'PWD Auto-Router',
          note: `Road Passport initialized from ${complaintCode}${repeatCheck.isRepeatZone ? ' (Repeat excavation alert triggered)' : ''}.`,
        },
      ]),
      nowIso,
      nowIso
    );

    db.prepare('UPDATE issues SET road_passport_id = ? WHERE id = ?').run(roadPassportId, issueId);
  }

  if (uploadedPhotoUrl) {
    db.prepare(
      `INSERT INTO issue_evidence (id, issue_id, uploader_id, evidence_type, media_url, media_kind, caption, created_at)
       VALUES (?, ?, ?, 'citizen_initial', ?, 'image', ?, ?)`
    ).run(
      `ev-${crypto.randomUUID().slice(0, 8)}`,
      issueId,
      params.user.id,
      uploadedPhotoUrl,
      channel === 'whatsapp' ? 'Citizen WhatsApp photo attachment' : 'Citizen uploaded evidence photo',
      nowIso
    );
  } else if (typeof params.videoName === 'string' && params.videoName.trim()) {
    db.prepare(
      `INSERT INTO issue_evidence (id, issue_id, uploader_id, evidence_type, media_url, media_kind, caption, created_at)
       VALUES (?, ?, ?, 'citizen_initial', ?, 'video', ?, ?)`
    ).run(
      `ev-${crypto.randomUUID().slice(0, 8)}`,
      issueId,
      params.user.id,
      '/src/assets/images/sample_pothole_before_1795365318496.jpg',
      `Video clip attached: ${params.videoName.trim()}`,
      nowIso
    );
  }

  db.prepare(
    `INSERT INTO status_history (id, issue_id, from_status, to_status, changed_by_user_id, changed_by_role, note, created_at)
     VALUES (?, ?, NULL, 'Submitted', ?, ?, ?, ?)`
  ).run(
    `hist-${crypto.randomUUID().slice(0, 8)}`,
    issueId,
    params.user.id,
    params.user.role,
    channel === 'whatsapp'
      ? `Complaint submitted via Civil Setu WhatsApp Chatbot (${reporterPhone || 'Citizen Phone'}).`
      : 'Complaint logged by citizen with GPS coordinates.',
    nowIso
  );

  db.prepare(
    `INSERT INTO status_history (id, issue_id, from_status, to_status, changed_by_user_id, changed_by_role, note, created_at)
     VALUES (?, ?, 'Submitted', ?, ?, ?, ?, ?)`
  ).run(
    `hist-${crypto.randomUUID().slice(0, 8)}`,
    issueId,
    initialStatus,
    params.user.id,
    params.user.role,
    routing.routingStatus === 'auto_assigned'
      ? `Automatically routed to ${routing.departmentName} (${Math.round(aiAnalysis.confidence * 100)}% AI confidence).`
      : routing.reason,
    nowIso
  );

  if (routing.departmentId) {
    db.prepare(
      `INSERT INTO assignments (id, issue_id, department_id, assigned_by_user_id, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(`asg-${crypto.randomUUID().slice(0, 8)}`, issueId, routing.departmentId, params.user.id, nowIso);

    const deptUsers = db
      .prepare("SELECT id FROM users WHERE role = 'department_admin' AND department_id = ? AND (municipality_id = ? OR municipality_id IS NULL)")
      .all(routing.departmentId, muni.id) as Array<{ id: string }>;
    for (const du of deptUsers) {
      createNotification({
        userId: du.id,
        issueId,
        complaintCode,
        title: `New ${channel === 'whatsapp' ? 'WhatsApp ' : ''}Complaint Routed: ${complaintCode}`,
        message: `${finalCategory} (${aiAnalysis.severity}) reported in ${muni.name}: "${params.title.trim()}".`,
        eventType: 'department_assigned',
      });
    }
  }

  const muniAdmins = db
    .prepare("SELECT id FROM users WHERE role = 'municipality_admin' AND municipality_id = ?")
    .all(muni.id) as Array<{ id: string }>;
  for (const ma of muniAdmins) {
    createNotification({
      userId: ma.id,
      issueId,
      complaintCode,
      title: `New ${channel === 'whatsapp' ? 'WhatsApp ' : ''}Civic Issue in ${muni.name}`,
      message: `${complaintCode} (${finalCategory}) ${routing.departmentName ? `assigned to ${routing.departmentName}` : 'queued for manual review'}.`,
      eventType: 'municipality_alert',
    });
  }

  createNotification({
    userId: params.user.id,
    issueId,
    complaintCode,
    title: `Complaint Submitted: ${complaintCode}`,
    message: routing.departmentName
      ? `Your report has been automatically routed to ${routing.departmentName} (${muni.name}).`
      : 'Your report is in the Manual Review Queue for jurisdictional assignment.',
    eventType: 'complaint_submitted',
  });

  writeAuditLog({
    actorUserId: params.user.id,
    actorRole: params.user.role,
    action: channel === 'whatsapp' ? 'CREATE_ISSUE_WHATSAPP' : 'CREATE_ISSUE',
    entityType: 'issue',
    entityId: complaintCode,
    details: `Submitted via ${channel} "${params.title.trim()}" -> ${routing.routingStatus} (${routing.departmentName || 'Manual Review'})`,
  });

  const createdRow = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(issueId);
  return {
    issue: hydrateIssueRow(createdRow),
    routing,
    duplicates: dupes,
    hasRoadPassport: Boolean(roadPassportId),
  };
}

async function startServer() {
  const app = express();
  app.use(
    express.json({
      limit: '12mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // Secure static serving for uploaded photos
  app.get('/uploads/:filename', (req, res) => {
    const safeName = path.basename(req.params.filename);
    const fullPath = path.resolve(uploadsDir, safeName);
    if (!fullPath.startsWith(uploadsDir + path.sep) || !fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    res.sendFile(fullPath);
  });

  // Public Taxonomy & Demo Metrics
  app.get('/api/meta/taxonomy', (_req, res) => {
    const states = db.prepare('SELECT id, name, code FROM states ORDER BY name').all();
    const districts = db.prepare('SELECT id, state_id as stateId, name, status FROM districts ORDER BY name').all();
    const municipalities = db
      .prepare('SELECT id, state_id as stateId, district_id as districtId, name, type, status, center_lat as centerLat, center_lng as centerLng FROM municipalities ORDER BY name')
      .all();
    const departments = db.prepare('SELECT id, name, code, description FROM departments ORDER BY name').all();
    const categories = getCategoryConfigs().filter((c) => c.isActive);
    res.json({ states, districts, municipalities, departments, categories });
  });

  app.get('/api/public/stats', (_req, res) => {
    const issues = db.prepare('SELECT status, due_at, municipality_id, department_id FROM issues').all() as any[];
    const total = issues.length;
    const resolved = issues.filter((i) => i.status === 'Resolved' || i.status === 'Closed').length;
    const active = total - resolved;
    const overdue = issues.filter(
      (i) => i.status !== 'Resolved' && i.status !== 'Closed' && new Date(i.due_at).getTime() < Date.now()
    ).length;
    const passports = (db.prepare('SELECT COUNT(*) as c FROM road_passports').get() as { c: number }).c;
    const municipalities = (db.prepare('SELECT COUNT(*) as c FROM municipalities').get() as { c: number }).c;
    const departments = (db.prepare('SELECT COUNT(*) as c FROM departments').get() as { c: number }).c;

    res.json({
      isDemoData: true,
      regionLabel: 'Kerala Pilot Region (Illustrative Demo Data)',
      totalComplaints: total,
      resolvedComplaints: resolved,
      activeComplaints: active,
      overdueComplaints: overdue,
      roadPassportsIssued: passports,
      participatingMunicipalities: municipalities,
      participatingDepartments: departments,
      avgResolutionHours: 28.4,
    });
  });

  app.get('/api/public/track/:code', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!code) {
      res.status(400).json({ error: 'Complaint ID is required.' });
      return;
    }
    const row = db.prepare(`${BASE_ISSUE_SELECT} WHERE UPPER(i.complaint_code) = ?`).get(code) as any;
    if (!row) {
      res.status(404).json({ error: `No complaint found matching ID "${code}".` });
      return;
    }
    const history = db
      .prepare(
        `SELECT sh.id, sh.from_status as fromStatus, sh.to_status as toStatus, sh.changed_by_role as changedByRole,
                u.full_name as changedByName, sh.note, sh.created_at as createdAt
         FROM status_history sh
         JOIN users u ON u.id = sh.changed_by_user_id
         WHERE sh.issue_id = ?
         ORDER BY sh.created_at ASC`
      )
      .all(row.id);

    const evidence = db
      .prepare(
        `SELECT id, evidence_type as evidenceType, media_url as mediaUrl, media_kind as mediaKind, caption, created_at as createdAt
         FROM issue_evidence WHERE issue_id = ? ORDER BY created_at ASC`
      )
      .all(row.id);

    let passport = null;
    if (row.road_passport_id) {
      const pRow = db.prepare(`${BASE_PASSPORT_SELECT} WHERE rp.id = ?`).get(row.road_passport_id) as any;
      if (pRow) passport = hydratePassportRow(pRow);
    }

    const hydrated = hydrateIssueRow(row);
    // Redact reporter personal name in public tracking lookup
    res.json({
      issue: {
        ...hydrated,
        reporterName: 'Verified Citizen Reporter',
      },
      history,
      evidence,
      roadPassport: passport,
    });
  });

  // Authentication
  app.post('/api/auth/login', (req, res) => {
    const { email, password, expectedPortal } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const row = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim()) as any;
    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Invalid credentials. Please verify your portal email and password.' });
      return;
    }
    if (!row.is_active) {
      res.status(403).json({ error: 'This account has been deactivated by the platform administrator.' });
      return;
    }

    const user = mapUserRow(row);
    const portalMap: Record<string, UserRole[]> = {
      company: ['company_admin'],
      citizen: ['citizen'],
      government: ['state_admin', 'district_admin'],
      municipality: ['municipality_admin'],
      department: ['department_admin', 'field_officer'],
    };
    if (expectedPortal && portalMap[expectedPortal] && !portalMap[expectedPortal].includes(user.role)) {
      res.status(403).json({
        error: `Account "${user.email}" belongs to role "${user.role.replace('_', ' ')}". Please sign in using its designated portal tab.`,
      });
      return;
    }

    const token = signSessionToken({
      userId: user.id,
      role: user.role,
      exp: Date.now() + 24 * 60 * 60 * 1000,
    });

    const foRow = db.prepare('SELECT id FROM field_officers WHERE user_id = ?').get(user.id) as { id: string } | undefined;
    res.json({ token, user, fieldOfficerId: foRow?.id ?? null });
  });

  app.post('/api/auth/register', (req, res) => {
    const { email, password, fullName, phone, municipalityId } = req.body ?? {};
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof fullName !== 'string' ||
      !email.includes('@') ||
      password.length < 6 ||
      fullName.trim().length < 2
    ) {
      res.status(400).json({ error: 'Valid full name, email, and password (min 6 chars) are required.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    let stateId = 'st-kl';
    let districtId = 'dist-ekm';
    let muniId = 'mun-mlt';
    if (municipalityId) {
      const m = db.prepare('SELECT id, state_id, district_id FROM municipalities WHERE id = ?').get(municipalityId) as any;
      if (m) {
        stateId = m.state_id;
        districtId = m.district_id;
        muniId = m.id;
      }
    }

    const id = `usr-cit-${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();
    const passHash = hashPassword(password);

    db.prepare(
      `INSERT INTO users (id, email, password_hash, full_name, phone, role, state_id, district_id, municipality_id, department_id, is_active, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, 'citizen', ?, ?, ?, NULL, 1, 0, ?)`
    ).run(id, email.trim().toLowerCase(), passHash, fullName.trim(), phone?.trim() || null, stateId, districtId, muniId, nowIso);

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const user = mapUserRow(row);
    const token = signSessionToken({
      userId: user.id,
      role: user.role,
      exp: Date.now() + 24 * 60 * 60 * 1000,
    });
    res.status(201).json({ token, user, fieldOfficerId: null });
  });

  app.post('/api/auth/firebase-exchange', (req, res) => {
    const { uid, email, fullName } = req.body ?? {};
    if (typeof uid !== 'string' || typeof email !== 'string' || !uid || !email.includes('@')) {
      res.status(400).json({ error: 'Invalid Google sign-in profile.' });
      return;
    }
    let row = db.prepare('SELECT * FROM users WHERE auth_uid = ? OR LOWER(email) = LOWER(?)').get(uid, email.trim()) as any;
    if (!row) {
      const id = `usr-g-${crypto.randomUUID().slice(0, 8)}`;
      const nowIso = new Date().toISOString();
      const passHash = hashPassword(crypto.randomBytes(16).toString('hex'));
      db.prepare(
        `INSERT INTO users (id, auth_uid, email, password_hash, full_name, role, state_id, district_id, municipality_id, is_active, is_demo, created_at)
         VALUES (?, ?, ?, ?, ?, 'citizen', 'st-kl', 'dist-ekm', 'mun-mlt', 1, 0, ?)`
      ).run(id, uid, email.trim().toLowerCase(), passHash, (fullName || email.split('@')[0]).trim(), nowIso);
      row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    } else if (!row.auth_uid) {
      db.prepare('UPDATE users SET auth_uid = ? WHERE id = ?').run(uid, row.id);
    }
    const user = mapUserRow(row);
    const token = signSessionToken({
      userId: user.id,
      role: user.role,
      exp: Date.now() + 24 * 60 * 60 * 1000,
    });
    const foRow = db.prepare('SELECT id FROM field_officers WHERE user_id = ?').get(user.id) as { id: string } | undefined;
    res.json({ token, user, fieldOfficerId: foRow?.id ?? null });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
    res.json({ user: req.authUser, fieldOfficerId: req.fieldOfficerId });
  });

  // AI Pre-submission Analysis & Duplicate + Repeat Digging Check
  app.post('/api/ai/analyze-issue', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { title, description, selectedCategory, municipalityId, latitude, longitude, imageBase64, mimeType } =
        req.body ?? {};
      if (typeof title !== 'string' || typeof description !== 'string' || !title.trim() || !description.trim()) {
        res.status(400).json({ error: 'Please provide an issue title and description for AI analysis.' });
        return;
      }

      const muni = municipalityId
        ? (db.prepare('SELECT name FROM municipalities WHERE id = ?').get(municipalityId) as { name: string } | undefined)
        : undefined;

      const decodedImage = typeof imageBase64 === 'string' && imageBase64.trim() ? readUploadAsBase64(imageBase64.trim()) : null;

      const aiResult = await analyzeComplaintWithAi({
        title,
        description,
        selectedCategory,
        imageBase64: decodedImage?.base64,
        mimeType: decodedImage?.mimeType || mimeType,
        municipalityName: muni?.name,
      });

      const jurisdictions = getJurisdictionsWithNames();
      const categories = getCategoryConfigs();
      const routing = municipalityId
        ? routeIssueToDepartment({
            category: aiResult.suggestedCategory,
            confidence: aiResult.confidence,
            municipalityId,
            jurisdictions,
            categoryConfigs: categories,
          })
        : null;

      const existingRows = db
        .prepare('SELECT id, complaint_code as complaintCode, title, description, category, status, latitude, longitude FROM issues')
        .all() as any[];

      const duplicates =
        typeof latitude === 'number' && typeof longitude === 'number'
          ? detectDuplicateIssues({
              title,
              description,
              category: aiResult.suggestedCategory,
              latitude,
              longitude,
              existingIssues: existingRows,
            })
          : [];

      const passportRows = db.prepare(BASE_PASSPORT_SELECT).all() as any[];
      const passports = passportRows.map(hydratePassportRow);
      const repeatExcavation =
        typeof latitude === 'number' && typeof longitude === 'number'
          ? detectRepeatRoadExcavations({ latitude, longitude, existingPassports: passports })
          : { isRepeatZone: false, nearbyPassports: [], totalPriorExcavations: 0 };

      res.json({
        analysis: aiResult,
        routing,
        duplicates,
        repeatExcavation: {
          isRepeatZone: repeatExcavation.isRepeatZone,
          totalPriorExcavations: repeatExcavation.totalPriorExcavations,
          nearbyPassports: repeatExcavation.nearbyPassports.map((p) => ({
            passportCode: p.passportCode,
            assetName: p.assetName,
            workStatus: p.workStatus,
            repeatDigCount: p.repeatDigCount,
          })),
        },
      });
    } catch (error: any) {
      console.error('AI analysis error:', error);
      res.status(500).json({ error: error?.message || 'AI analysis failed.' });
    }
  });

  // List Issues (Role-Scoped RBAC + Filters)
  app.get('/api/issues', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const rows = db.prepare(`${BASE_ISSUE_SELECT} ORDER BY i.created_at DESC`).all() as any[];
    let items = rows.map(hydrateIssueRow).filter((iss) => canUserAccessIssue(user, iss, req.fieldOfficerId));

    const { stateId, districtId, municipalityId, departmentId, category, status, search, overdueOnly } = req.query;
    if (typeof stateId === 'string' && stateId) items = items.filter((i) => i.stateId === stateId);
    if (typeof districtId === 'string' && districtId) items = items.filter((i) => i.districtId === districtId);
    if (typeof municipalityId === 'string' && municipalityId) items = items.filter((i) => i.municipalityId === municipalityId);
    if (typeof departmentId === 'string' && departmentId) items = items.filter((i) => i.departmentId === departmentId);
    if (typeof category === 'string' && category) items = items.filter((i) => i.category === category);
    if (typeof status === 'string' && status) items = items.filter((i) => i.status === status);
    if (overdueOnly === 'true') items = items.filter((i) => i.isOverdue);
    if (typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (i) =>
          i.complaintCode.toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q) ||
          i.addressText.toLowerCase().includes(q) ||
          i.municipalityName.toLowerCase().includes(q)
      );
    }

    res.json({ issues: items });
  });

  // Get Single Issue Details
  app.get('/api/issues/:id', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const row = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ? OR UPPER(i.complaint_code) = UPPER(?)`).get(req.params.id, req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }
    const issue = hydrateIssueRow(row);
    if (!canUserAccessIssue(user, issue, req.fieldOfficerId)) {
      res.status(403).json({ error: 'Access denied for this complaint outside your jurisdiction.' });
      return;
    }

    const evidence = db
      .prepare(
        `SELECT ie.id, ie.issue_id as issueId, ie.uploader_id as uploaderId, u.full_name as uploaderName,
                ie.evidence_type as evidenceType, ie.media_url as mediaUrl, ie.media_kind as mediaKind,
                ie.caption, ie.created_at as createdAt
         FROM issue_evidence ie
         JOIN users u ON u.id = ie.uploader_id
         WHERE ie.issue_id = ?
         ORDER BY ie.created_at ASC`
      )
      .all(issue.id);

    const history = db
      .prepare(
        `SELECT sh.id, sh.issue_id as issueId, sh.from_status as fromStatus, sh.to_status as toStatus,
                sh.changed_by_user_id as changedByUserId, u.full_name as changedByName,
                sh.changed_by_role as changedByRole, sh.note, sh.created_at as createdAt
         FROM status_history sh
         JOIN users u ON u.id = sh.changed_by_user_id
         WHERE sh.issue_id = ?
         ORDER BY sh.created_at ASC`
      )
      .all(issue.id);

    const assignmentRow = db
      .prepare(
        `SELECT a.*, d.name as department_name, fo_u.full_name as field_officer_name
         FROM assignments a
         JOIN departments d ON d.id = a.department_id
         LEFT JOIN field_officers fo ON fo.id = a.field_officer_id
         LEFT JOIN users fo_u ON fo_u.id = fo.user_id
         WHERE a.issue_id = ?`
      )
      .get(issue.id) as any;

    const assignment = assignmentRow
      ? {
          id: assignmentRow.id,
          issueId: assignmentRow.issue_id,
          departmentId: assignmentRow.department_id,
          departmentName: assignmentRow.department_name,
          fieldOfficerId: assignmentRow.field_officer_id,
          fieldOfficerName: assignmentRow.field_officer_name,
          assignedByUserId: assignmentRow.assigned_by_user_id,
          acceptedAt: assignmentRow.accepted_at,
          rejectedReason: assignmentRow.rejected_reason,
          inspectionNotes: assignmentRow.inspection_notes,
          completionNotes: assignmentRow.completion_notes,
          escalatedAt: assignmentRow.escalated_at,
          escalationReason: assignmentRow.escalation_reason,
          createdAt: assignmentRow.created_at,
        }
      : null;

    const verifications = db
      .prepare(
        `SELECT rv.id, rv.issue_id as issueId, rv.citizen_id as citizenId, u.full_name as citizenName,
                rv.decision, rv.feedback, rv.created_at as createdAt
         FROM repair_verifications rv
         JOIN users u ON u.id = rv.citizen_id
         WHERE rv.issue_id = ?
         ORDER BY rv.created_at DESC`
      )
      .all(issue.id);

    let roadPassport = null;
    if (issue.roadPassportId) {
      const pRow = db.prepare(`${BASE_PASSPORT_SELECT} WHERE rp.id = ?`).get(issue.roadPassportId) as any;
      if (pRow) roadPassport = hydratePassportRow(pRow);
    }

    res.json({
      issue: {
        ...issue,
        evidence,
        history,
        assignment,
        verifications,
      },
      roadPassport,
    });
  });

  // Create New Complaint + Automatic AI Routing + Road Passport Creation
  app.post('/api/issues', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.authUser!;
      const {
        title,
        description,
        category,
        municipalityId,
        addressText,
        latitude,
        longitude,
        photoDataUrl,
        videoName,
      } = req.body ?? {};

      if (
        typeof title !== 'string' ||
        typeof description !== 'string' ||
        typeof municipalityId !== 'string' ||
        !title.trim() ||
        !description.trim()
      ) {
        res.status(400).json({ error: 'Title, description, and municipality are required.' });
        return;
      }

      const result = await createCivicIssuePipeline({
        user,
        title,
        description,
        category,
        municipalityId,
        addressText,
        latitude,
        longitude,
        photoDataUrl,
        videoName,
        channel: 'web',
      });

      res.status(201).json({
        issue: result.issue,
        routing: result.routing,
        duplicates: result.duplicates,
      });
    } catch (error: any) {
      console.error('Create issue error:', error);
      res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to submit complaint.' });
    }
  });

  // Admin Edit AI Classification / Manual Review Queue Routing
  app.patch('/api/issues/:id/classification', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const row = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }
    const issue = hydrateIssueRow(row);
    const perm = canPerformIssueAction({ user, issue, action: 'edit_classification' });
    if (!perm.allowed) {
      res.status(403).json({ error: perm.reason });
      return;
    }

    const { category, severity, departmentId, note } = req.body ?? {};
    const nowIso = new Date().toISOString();
    const newCat = typeof category === 'string' && category ? category : issue.category;
    const newSev = typeof severity === 'string' && severity ? severity : issue.severity;
    const newDeptId = typeof departmentId === 'string' && departmentId ? departmentId : issue.departmentId;
    const newStatus: IssueStatus = newDeptId ? 'Assigned to Department' : issue.status;

    db.prepare(
      `UPDATE issues SET category = ?, severity = ?, department_id = ?, status = ?, routing_status = 'reassigned', updated_at = ? WHERE id = ?`
    ).run(newCat, newSev, newDeptId, newStatus, nowIso, issue.id);

    if (newDeptId) {
      const existingAssign = db.prepare('SELECT id FROM assignments WHERE issue_id = ?').get(issue.id);
      if (existingAssign) {
        db.prepare('UPDATE assignments SET department_id = ?, rejected_reason = NULL WHERE issue_id = ?').run(newDeptId, issue.id);
      } else {
        db.prepare(
          'INSERT INTO assignments (id, issue_id, department_id, assigned_by_user_id, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(`asg-${crypto.randomUUID().slice(0, 8)}`, issue.id, newDeptId, user.id, nowIso);
      }
      const dept = db.prepare('SELECT name FROM departments WHERE id = ?').get(newDeptId) as { name: string } | undefined;
      db.prepare(
        `INSERT INTO status_history (id, issue_id, from_status, to_status, changed_by_user_id, changed_by_role, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        `hist-${crypto.randomUUID().slice(0, 8)}`,
        issue.id,
        issue.status,
        newStatus,
        user.id,
        user.role,
        note?.trim() || `Administrator updated classification to ${newCat} (${newSev}) and assigned to ${dept?.name || newDeptId}.`,
        nowIso
      );
      createNotification({
        userId: issue.reporterId,
        issueId: issue.id,
        complaintCode: issue.complaintCode,
        title: `${issue.complaintCode} Assigned to ${dept?.name || 'Department'}`,
        message: `Administrative review routed your complaint to ${dept?.name || 'the responsible department'}.`,
        eventType: 'department_assigned',
      });
    }

    writeAuditLog({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UPDATE_CLASSIFICATION',
      entityType: 'issue',
      entityId: issue.complaintCode,
      details: `Updated category=${newCat}, severity=${newSev}, departmentId=${newDeptId}`,
    });

    const updatedRow = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(issue.id);
    const updatedIssue = hydrateIssueRow(updatedRow);
    notifyWhatsappChannelOnIssueUpdate(
      updatedIssue,
      `Update on ${updatedIssue.complaintCode}: Assigned to ${updatedIssue.departmentName || 'Department'} (${updatedIssue.category}, ${updatedIssue.severity} priority).`
    );
    res.json({ issue: updatedIssue });
  });

  // Department Accepts Assignment
  app.post('/api/issues/:id/accept', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const row = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }
    const issue = hydrateIssueRow(row);
    const perm = canPerformIssueAction({ user, issue, action: 'accept_assignment' });
    if (!perm.allowed) {
      res.status(403).json({ error: perm.reason });
      return;
    }
    const nowIso = new Date().toISOString();
    db.prepare(`UPDATE issues SET status = 'Accepted by Department', updated_at = ? WHERE id = ?`).run(nowIso, issue.id);
    db.prepare(`UPDATE assignments SET accepted_at = ?, rejected_reason = NULL WHERE issue_id = ?`).run(nowIso, issue.id);
    db.prepare(
      `INSERT INTO status_history (id, issue_id, from_status, to_status, changed_by_user_id, changed_by_role, note, created_at)
       VALUES (?, ?, ?, 'Accepted by Department', ?, ?, ?, ?)`
    ).run(`hist-${crypto.randomUUID().slice(0, 8)}`, issue.id, issue.status, user.id, user.role, req.body?.note || 'Assignment accepted by department.', nowIso);

    createNotification({
      userId: issue.reporterId,
      issueId: issue.id,
      complaintCode: issue.complaintCode,
      title: `${issue.complaintCode} Accepted`,
      message: `${issue.departmentName} accepted your complaint and is scheduling field inspection.`,
      eventType: 'department_accepted',
    });

    writeAuditLog({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'ACCEPT_ASSIGNMENT',
      entityType: 'issue',
      entityId: issue.complaintCode,
      details: `Department ${issue.departmentName} accepted complaint.`,
    });

    const updatedRow = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(issue.id);
    const updatedIssue = hydrateIssueRow(updatedRow);
    notifyWhatsappChannelOnIssueUpdate(
      updatedIssue,
      `Update on ${updatedIssue.complaintCode}: ${updatedIssue.departmentName || 'Department'} accepted your complaint and is scheduling site inspection.`
    );
    res.json({ issue: updatedIssue });
  });

  // Department Rejects Assignment (returns to Manual Review Queue)
  app.post('/api/issues/:id/reject', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const row = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }
    const issue = hydrateIssueRow(row);
    const perm = canPerformIssueAction({ user, issue, action: 'reject_assignment' });
    if (!perm.allowed) {
      res.status(403).json({ error: perm.reason });
      return;
    }
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      res.status(400).json({ error: 'A rejection reason is required.' });
      return;
    }

    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE issues SET status = 'Under Review', routing_status = 'manual_review', department_id = NULL, field_officer_id = NULL, updated_at = ? WHERE id = ?`
    ).run(nowIso, issue.id);
    db.prepare(`UPDATE assignments SET rejected_reason = ? WHERE issue_id = ?`).run(reason, issue.id);
    db.prepare(
      `INSERT INTO status_history (id, issue_id, from_status, to_status, changed_by_user_id, changed_by_role, note, created_at)
       VALUES (?, ?, ?, 'Under Review', ?, ?, ?, ?)`
    ).run(`hist-${crypto.randomUUID().slice(0, 8)}`, issue.id, issue.status, user.id, user.role, `Returned to review queue: ${reason}`, nowIso);

    const admins = db.prepare("SELECT id FROM users WHERE role IN ('company_admin', 'state_admin')").all() as Array<{ id: string }>;
    for (const a of admins) {
      createNotification({
        userId: a.id,
        issueId: issue.id,
        complaintCode: issue.complaintCode,
        title: `${issue.complaintCode} Rejected by Department`,
        message: `Returned to manual review queue. Reason: ${reason}`,
        eventType: 'assignment_rejected',
      });
    }

    const updatedRow = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(issue.id);
    const updatedIssue = hydrateIssueRow(updatedRow);
    notifyWhatsappChannelOnIssueUpdate(
      updatedIssue,
      `Update on ${updatedIssue.complaintCode}: Returned to administrative review queue for jurisdictional reassignment (${reason}).`
    );
    res.json({ issue: updatedIssue });
  });

  // Department Assigns Field Officer
  app.post('/api/issues/:id/assign-officer', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const row = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }
    const issue = hydrateIssueRow(row);
    const perm = canPerformIssueAction({ user, issue, action: 'assign_officer' });
    if (!perm.allowed) {
      res.status(403).json({ error: perm.reason });
      return;
    }

    const { fieldOfficerId } = req.body ?? {};
    const fo = db
      .prepare('SELECT fo.*, u.full_name FROM field_officers fo JOIN users u ON u.id = fo.user_id WHERE fo.id = ?')
      .get(fieldOfficerId) as any;
    if (!fo || fo.department_id !== issue.departmentId) {
      res.status(400).json({ error: 'Selected field officer does not belong to the assigned department.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const nextStatus: IssueStatus =
      issue.status === 'Assigned to Department' || issue.status === 'Submitted' || issue.status === 'Reopened'
        ? 'Accepted by Department'
        : issue.status;

    db.prepare(`UPDATE issues SET field_officer_id = ?, status = ?, updated_at = ? WHERE id = ?`).run(
      fo.id,
      nextStatus,
      nowIso,
      issue.id
    );
    db.prepare(`UPDATE assignments SET field_officer_id = ?, accepted_at = COALESCE(accepted_at, ?) WHERE issue_id = ?`).run(
      fo.id,
      nowIso,
      issue.id
    );
    db.prepare(
      `INSERT INTO status_history (id, issue_id, from_status, to_status, changed_by_user_id, changed_by_role, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `hist-${crypto.randomUUID().slice(0, 8)}`,
      issue.id,
      issue.status,
      nextStatus,
      user.id,
      user.role,
      `Assigned to Field Officer ${fo.full_name} (${fo.designation}).`,
      nowIso
    );

    createNotification({
      userId: fo.user_id,
      issueId: issue.id,
      complaintCode: issue.complaintCode,
      title: `Field Assignment: ${issue.complaintCode}`,
      message: `You have been assigned "${issue.title}" in ${issue.municipalityName}.`,
      eventType: 'officer_assigned',
    });

    createNotification({
      userId: issue.reporterId,
      issueId: issue.id,
      complaintCode: issue.complaintCode,
      title: `Field Officer Assigned to ${issue.complaintCode}`,
      message: `${fo.full_name} (${fo.designation}) has been assigned for site inspection.`,
      eventType: 'officer_assigned',
    });

    const updatedRow = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(issue.id);
    const updatedIssue = hydrateIssueRow(updatedRow);
    notifyWhatsappChannelOnIssueUpdate(
      updatedIssue,
      `Update on ${updatedIssue.complaintCode}: Field Officer ${fo.full_name} (${fo.designation}) has been assigned for site inspection.`
    );
    res.json({ issue: updatedIssue });
  });

  // Department or Field Officer Updates Inspection / Work in Progress / Resolved
  app.post('/api/issues/:id/status', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.authUser!;
      const row = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(req.params.id) as any;
      if (!row) {
        res.status(404).json({ error: 'Complaint not found.' });
        return;
      }
      const issue = hydrateIssueRow(row);
      const { nextStatus, note, photoDataUrl, evidenceType } = req.body ?? {};

      const actionMap: Record<string, 'start_inspection' | 'start_work' | 'mark_resolved'> = {
        'Field Inspection': 'start_inspection',
        'Work in Progress': 'start_work',
        Resolved: 'mark_resolved',
      };
      const action = actionMap[nextStatus];
      if (!action) {
        res.status(400).json({ error: 'Invalid department/field status update.' });
        return;
      }

      const perm = canPerformIssueAction({
        user,
        issue,
        action,
        userFieldOfficerId: req.fieldOfficerId,
      });
      if (!perm.allowed) {
        res.status(403).json({ error: perm.reason });
        return;
      }

      const nowIso = new Date().toISOString();
      let savedUrl = '';
      if (typeof photoDataUrl === 'string' && photoDataUrl.trim()) {
        savedUrl = saveBase64Upload(photoDataUrl, 'repair');
        const evType =
          evidenceType ||
          (nextStatus === 'Field Inspection'
            ? 'inspection'
            : nextStatus === 'Work in Progress'
              ? 'before_repair'
              : 'after_repair');
        db.prepare(
          `INSERT INTO issue_evidence (id, issue_id, uploader_id, evidence_type, media_url, media_kind, caption, created_at)
           VALUES (?, ?, ?, ?, ?, 'image', ?, ?)`
        ).run(
          `ev-${crypto.randomUUID().slice(0, 8)}`,
          issue.id,
          user.id,
          evType,
          savedUrl,
          note?.trim() || `${nextStatus} photographic evidence`,
          nowIso
        );
      }

      db.prepare(`UPDATE issues SET status = ?, updated_at = ? WHERE id = ?`).run(nextStatus, nowIso, issue.id);

      if (nextStatus === 'Field Inspection' && note) {
        db.prepare(`UPDATE assignments SET inspection_notes = ? WHERE issue_id = ?`).run(note.trim(), issue.id);
      } else if (nextStatus === 'Resolved' && note) {
        db.prepare(`UPDATE assignments SET completion_notes = ? WHERE issue_id = ?`).run(note.trim(), issue.id);
      }

      db.prepare(
        `INSERT INTO status_history (id, issue_id, from_status, to_status, changed_by_user_id, changed_by_role, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        `hist-${crypto.randomUUID().slice(0, 8)}`,
        issue.id,
        issue.status,
        nextStatus,
        user.id,
        user.role,
        note?.trim() || `Status updated to ${nextStatus}.`,
        nowIso
      );

      // Update linked Road Passport if present
      if (issue.roadPassportId) {
        const rpRow = db.prepare('SELECT * FROM road_passports WHERE id = ?').get(issue.roadPassportId) as any;
        if (rpRow) {
          const hist = JSON.parse(rpRow.history_json || '[]');
          hist.push({
            timestamp: nowIso,
            actor: user.fullName,
            note: `${nextStatus}: ${note?.trim() || 'Field status updated.'}`,
          });
          const rpStatus =
            nextStatus === 'Work in Progress'
              ? 'Excavation Active'
              : nextStatus === 'Resolved'
                ? 'Completed'
                : 'Restoration Pending';
          const afterUrl = nextStatus === 'Resolved' && savedUrl ? savedUrl : rpRow.after_photo_url;
          db.prepare(
            `UPDATE road_passports SET work_status = ?, after_photo_url = ?, actual_completion_date = ?, inspection_result = ?, history_json = ?, updated_at = ? WHERE id = ?`
          ).run(
            rpStatus,
            afterUrl,
            nextStatus === 'Resolved' ? nowIso.slice(0, 10) : rpRow.actual_completion_date,
            nextStatus === 'Resolved' ? 'Completed — Awaiting Citizen Verification' : rpRow.inspection_result,
            JSON.stringify(hist),
            nowIso,
            rpRow.id
          );
        }
      }

      const eventMap: Record<string, { title: string; msg: string; type: string }> = {
        'Field Inspection': {
          title: `Inspection Logged: ${issue.complaintCode}`,
          msg: `Site inspection started by ${user.fullName}.`,
          type: 'inspection_completed',
        },
        'Work in Progress': {
          title: `Repair Work Started: ${issue.complaintCode}`,
          msg: `Field crew is actively working on "${issue.title}".`,
          type: 'work_started',
        },
        Resolved: {
          title: `Repair Completed: ${issue.complaintCode}`,
          msg: `Your complaint has been marked Resolved. Please verify the repair or reopen if incomplete.`,
          type: 'repair_completed',
        },
      };

      createNotification({
        userId: issue.reporterId,
        issueId: issue.id,
        complaintCode: issue.complaintCode,
        title: eventMap[nextStatus].title,
        message: eventMap[nextStatus].msg,
        eventType: eventMap[nextStatus].type,
      });

      writeAuditLog({
        actorUserId: user.id,
        actorRole: user.role,
        action: `STATUS_${nextStatus.toUpperCase().replace(/\s+/g, '_')}`,
        entityType: 'issue',
        entityId: issue.complaintCode,
        details: note?.trim() || `Transitioned from ${issue.status} to ${nextStatus}.`,
      });

      const updatedRow = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(issue.id);
      const updatedIssue = hydrateIssueRow(updatedRow);
      notifyWhatsappChannelOnIssueUpdate(
        updatedIssue,
        nextStatus === 'Resolved'
          ? `Good news! ${updatedIssue.complaintCode} ("${updatedIssue.title}") has been marked Resolved.\nReply "Verify ${updatedIssue.complaintCode} confirm" to close, or "Reopen ${updatedIssue.complaintCode} <reason>" if incomplete.`
          : `Status Update (${updatedIssue.complaintCode}): ${nextStatus} — ${note?.trim() || eventMap[nextStatus].msg}`
      );
      res.json({ issue: updatedIssue });
    } catch (error: any) {
      console.error('Status update error:', error);
      res.status(500).json({ error: error?.message || 'Failed to update complaint status.' });
    }
  });

  // Citizen Verification (Confirm Close or Reopen)
  app.post('/api/issues/:id/verify', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const row = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }
    const issue = hydrateIssueRow(row);
    const { decision, feedback } = req.body ?? {};
    if (decision !== 'confirmed' && decision !== 'reopened') {
      res.status(400).json({ error: 'Decision must be "confirmed" or "reopened".' });
      return;
    }

    const perm = canPerformIssueAction({
      user,
      issue,
      action: decision === 'confirmed' ? 'citizen_verify_close' : 'citizen_reopen',
    });
    if (!perm.allowed) {
      res.status(403).json({ error: perm.reason });
      return;
    }

    const nowIso = new Date().toISOString();
    const targetStatus: IssueStatus = decision === 'confirmed' ? 'Closed' : 'Reopened';
    const note =
      String(feedback || '').trim() ||
      (decision === 'confirmed' ? 'Citizen verified repair completion.' : 'Citizen reopened complaint: repair incomplete.');

    db.prepare(`UPDATE issues SET status = ?, updated_at = ? WHERE id = ?`).run(targetStatus, nowIso, issue.id);
    db.prepare(
      `INSERT INTO repair_verifications (id, issue_id, citizen_id, decision, feedback, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(`rv-${crypto.randomUUID().slice(0, 8)}`, issue.id, user.id, decision, note, nowIso);
    db.prepare(
      `INSERT INTO status_history (id, issue_id, from_status, to_status, changed_by_user_id, changed_by_role, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(`hist-${crypto.randomUUID().slice(0, 8)}`, issue.id, issue.status, targetStatus, user.id, user.role, note, nowIso);

    if (issue.roadPassportId) {
      const rpRow = db.prepare('SELECT * FROM road_passports WHERE id = ?').get(issue.roadPassportId) as any;
      if (rpRow) {
        const hist = JSON.parse(rpRow.history_json || '[]');
        hist.push({
          timestamp: nowIso,
          actor: user.fullName,
          note: decision === 'confirmed' ? 'Citizen verified restoration quality; passport sealed.' : `Citizen disputed repair: ${note}`,
        });
        db.prepare(
          `UPDATE road_passports SET citizen_verification_status = ?, work_status = ?, flagged_for_inspection = ?, history_json = ?, updated_at = ? WHERE id = ?`
        ).run(
          decision === 'confirmed' ? 'Verified' : 'Disputed',
          decision === 'confirmed' ? 'Completed' : 'Flagged',
          decision === 'confirmed' ? 0 : 1,
          JSON.stringify(hist),
          nowIso,
          rpRow.id
        );
      }
    }

    if (issue.departmentId) {
      const deptUsers = db
        .prepare("SELECT id FROM users WHERE role = 'department_admin' AND department_id = ?")
        .all(issue.departmentId) as Array<{ id: string }>;
      for (const du of deptUsers) {
        createNotification({
          userId: du.id,
          issueId: issue.id,
          complaintCode: issue.complaintCode,
          title:
            decision === 'confirmed'
              ? `${issue.complaintCode} Verified & Closed`
              : `${issue.complaintCode} Reopened by Citizen`,
          message: note,
          eventType: decision === 'confirmed' ? 'complaint_closed' : 'complaint_reopened',
        });
      }
    }

    writeAuditLog({
      actorUserId: user.id,
      actorRole: user.role,
      action: decision === 'confirmed' ? 'CITIZEN_VERIFY_CLOSE' : 'CITIZEN_REOPEN',
      entityType: 'issue',
      entityId: issue.complaintCode,
      details: note,
    });

    const updatedRow = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(issue.id);
    const updatedIssue = hydrateIssueRow(updatedRow);
    notifyWhatsappChannelOnIssueUpdate(
      updatedIssue,
      decision === 'confirmed'
        ? `${updatedIssue.complaintCode} has been verified and Closed. Thank you for helping keep Civil Setu accountable.`
        : `${updatedIssue.complaintCode} has been Reopened and returned to ${updatedIssue.departmentName || 'the review team'}.`
    );
    res.json({ issue: updatedIssue });
  });

  // Municipality / Gov Escalation
  app.post('/api/issues/:id/escalate', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const row = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }
    const issue = hydrateIssueRow(row);
    const perm = canPerformIssueAction({ user, issue, action: 'escalate' });
    if (!perm.allowed) {
      res.status(403).json({ error: perm.reason });
      return;
    }
    const reason = String(req.body?.reason || '').trim() || 'Escalated due to SLA delay / overdue status.';
    const nowIso = new Date().toISOString();

    db.prepare(`UPDATE issues SET is_escalated = 1, escalation_count = escalation_count + 1, updated_at = ? WHERE id = ?`).run(
      nowIso,
      issue.id
    );
    db.prepare(`UPDATE assignments SET escalated_at = ?, escalation_reason = ? WHERE issue_id = ?`).run(
      nowIso,
      reason,
      issue.id
    );
    db.prepare(
      `INSERT INTO status_history (id, issue_id, from_status, to_status, changed_by_user_id, changed_by_role, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `hist-${crypto.randomUUID().slice(0, 8)}`,
      issue.id,
      issue.status,
      issue.status,
      user.id,
      user.role,
      `ESCALATED by ${user.fullName}: ${reason}`,
      nowIso
    );

    if (issue.departmentId) {
      const deptUsers = db
        .prepare("SELECT id FROM users WHERE role = 'department_admin' AND department_id = ?")
        .all(issue.departmentId) as Array<{ id: string }>;
      for (const du of deptUsers) {
        createNotification({
          userId: du.id,
          issueId: issue.id,
          complaintCode: issue.complaintCode,
          title: `Escalation Alert: ${issue.complaintCode}`,
          message: `Escalated by ${user.fullName}: ${reason}`,
          eventType: 'municipality_escalated',
        });
      }
    }

    writeAuditLog({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'ESCALATE_ISSUE',
      entityType: 'issue',
      entityId: issue.complaintCode,
      details: reason,
    });

    const updatedRow = db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(issue.id);
    const updatedIssue = hydrateIssueRow(updatedRow);
    notifyWhatsappChannelOnIssueUpdate(
      updatedIssue,
      `Escalation Notice (${updatedIssue.complaintCode}): Escalated by ${user.fullName} for priority departmental action (${reason}).`
    );
    res.json({ issue: updatedIssue });
  });

  // Road Passports
  app.get('/api/road-passports', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const rows = db.prepare(`${BASE_PASSPORT_SELECT} ORDER BY rp.updated_at DESC`).all() as any[];
    let passports = rows.map(hydratePassportRow);

    if (user.role === 'municipality_admin' && user.municipalityId) {
      passports = passports.filter((p) => p.municipalityId === user.municipalityId);
    } else if (user.role === 'department_admin' && user.departmentId) {
      passports = passports.filter(
        (p) => p.departmentId === user.departmentId && (!user.municipalityId || p.municipalityId === user.municipalityId)
      );
    }
    res.json({ passports });
  });

  app.post('/api/road-passports', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    if (!['company_admin', 'state_admin', 'district_admin', 'municipality_admin', 'department_admin'].includes(user.role)) {
      res.status(403).json({ error: 'Only authorized civic officials can register Road Passports.' });
      return;
    }

    const { assetName, municipalityId, departmentId, purpose, workStartDate, expectedCompletionDate, beforePhotoDataUrl, latitude, longitude } =
      req.body ?? {};
    if (!assetName || !municipalityId || !departmentId || !purpose || !workStartDate || !expectedCompletionDate) {
      res.status(400).json({ error: 'All Road Passport excavation details are required.' });
      return;
    }

    const muni = db.prepare('SELECT * FROM municipalities WHERE id = ?').get(municipalityId) as any;
    if (!muni) {
      res.status(400).json({ error: 'Invalid municipality.' });
      return;
    }
    const lat = typeof latitude === 'number' ? latitude : muni.center_lat;
    const lng = typeof longitude === 'number' ? longitude : muni.center_lng;

    const allPassports = (db.prepare(BASE_PASSPORT_SELECT).all() as any[]).map(hydratePassportRow);
    const repeatCheck = detectRepeatRoadExcavations({ latitude: lat, longitude: lng, existingPassports: allPassports });

    const assetId = `ast-${crypto.randomUUID().slice(0, 6)}`;
    db.prepare(
      'INSERT INTO assets (id, asset_code, name, asset_type, municipality_id, owner_department_id, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(assetId, `KL-RP-${Date.now().toString().slice(-4)}`, assetName.trim(), 'Road Infrastructure Asset', municipalityId, departmentId, lat, lng);

    const beforeUrl =
      typeof beforePhotoDataUrl === 'string' && beforePhotoDataUrl.trim()
        ? saveBase64Upload(beforePhotoDataUrl, 'rp_before')
        : '/src/assets/images/sample_pothole_before_1795365318496.jpg';

    const id = `rp-${crypto.randomUUID().slice(0, 8)}`;
    const passportCode = `RP-KL-${String(allPassports.length + 1).padStart(3, '0')}`;
    const nowIso = new Date().toISOString();

    db.prepare(
      `INSERT INTO road_passports (
        id, passport_code, asset_id, municipality_id, department_id, purpose,
        work_start_date, expected_completion_date, before_photo_url, work_status, inspection_result,
        citizen_verification_status, repeat_dig_count, flagged_for_inspection, latitude, longitude, history_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Excavation Active', ?, 'Pending', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      passportCode,
      assetId,
      municipalityId,
      departmentId,
      purpose.trim(),
      workStartDate,
      expectedCompletionDate,
      beforeUrl,
      repeatCheck.isRepeatZone ? 'Repeat Dig Zone Alert' : 'Excavation In Progress',
      repeatCheck.isRepeatZone ? repeatCheck.totalPriorExcavations + 1 : 1,
      repeatCheck.isRepeatZone ? 1 : 0,
      lat,
      lng,
      JSON.stringify([{ timestamp: nowIso, actor: user.fullName, note: `Registered Road Passport ${passportCode}.` }]),
      nowIso,
      nowIso
    );

    const row = db.prepare(`${BASE_PASSPORT_SELECT} WHERE rp.id = ?`).get(id);
    res.status(201).json({ passport: hydratePassportRow(row) });
  });

  app.post('/api/road-passports/:id/compare-ai', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.authUser!;
      const row = db.prepare(`${BASE_PASSPORT_SELECT} WHERE rp.id = ?`).get(req.params.id) as any;
      if (!row) {
        res.status(404).json({ error: 'Road Passport not found.' });
        return;
      }

      let afterUrl = row.after_photo_url;
      if (typeof req.body?.afterPhotoDataUrl === 'string' && req.body.afterPhotoDataUrl.trim()) {
        afterUrl = saveBase64Upload(req.body.afterPhotoDataUrl, 'rp_after');
      }

      const beforeImg = readUploadAsBase64(row.before_photo_url);
      const afterImg = afterUrl ? readUploadAsBase64(afterUrl) : null;

      const result = await compareRepairPhotosWithAi({
        assetName: row.asset_name,
        purpose: row.purpose,
        beforeBase64: beforeImg?.base64,
        beforeMime: beforeImg?.mimeType,
        afterBase64: afterImg?.base64,
        afterMime: afterImg?.mimeType,
      });

      const nowIso = new Date().toISOString();
      const hist = JSON.parse(row.history_json || '[]');
      hist.push({
        timestamp: nowIso,
        actor: `AI Restoration Audit (${user.fullName})`,
        note: `Quality score: ${result.score}/100. ${result.summary}`,
      });

      db.prepare(
        `UPDATE road_passports SET after_photo_url = ?, ai_comparison_score = ?, ai_comparison_summary = ?,
         flagged_for_inspection = ?, work_status = ?, history_json = ?, updated_at = ? WHERE id = ?`
      ).run(
        afterUrl,
        result.score,
        result.summary,
        result.flaggedForInspection ? 1 : 0,
        result.flaggedForInspection ? 'Flagged' : row.work_status,
        JSON.stringify(hist),
        nowIso,
        row.id
      );

      const updated = db.prepare(`${BASE_PASSPORT_SELECT} WHERE rp.id = ?`).get(row.id);
      res.json({ passport: hydratePassportRow(updated), comparison: result });
    } catch (error: any) {
      console.error('Road Passport AI compare error:', error);
      res.status(500).json({ error: error?.message || 'Before/after comparison failed.' });
    }
  });

  // Notifications
  app.get('/api/notifications', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const rows = db
      .prepare(
        `SELECT id, user_id as userId, issue_id as issueId, complaint_code as complaintCode,
                title, message, event_type as eventType, is_read as isRead, created_at as createdAt
         FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 40`
      )
      .all(user.id) as any[];
    res.json({
      notifications: rows.map((r) => ({ ...r, isRead: Boolean(r.isRead) })),
    });
  });

  app.patch('/api/notifications/:id/read', requireAuth, (req: AuthRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.authUser!.id);
    res.json({ ok: true });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: AuthRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.authUser!.id);
    res.json({ ok: true });
  });

  // Field Officers Lookup & Management
  app.get('/api/field-officers', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const includeInactive = req.query.includeInactive === 'true' && canManageFieldOfficers(user);
    const rows = db
      .prepare(
        `SELECT fo.id, fo.user_id as userId, u.full_name as fullName, u.email, u.phone,
                fo.department_id as departmentId, d.name as departmentName,
                fo.municipality_id as municipalityId, m.name as municipalityName,
                m.district_id as districtId, m.state_id as stateId,
                fo.designation, u.is_active as isActiveInt,
                (SELECT COUNT(*) FROM issues i WHERE i.field_officer_id = fo.id AND i.status NOT IN ('Closed', 'Resolved')) as activeCount
         FROM field_officers fo
         JOIN users u ON u.id = fo.user_id
         JOIN departments d ON d.id = fo.department_id
         JOIN municipalities m ON m.id = fo.municipality_id
         ${includeInactive ? '' : 'WHERE u.is_active = 1'}
         ORDER BY d.name ASC, u.full_name ASC`
      )
      .all() as any[];

    const filtered = rows
      .filter((r) => {
        if (user.role === 'department_admin' && user.departmentId) {
          return r.departmentId === user.departmentId && (!user.municipalityId || r.municipalityId === user.municipalityId);
        }
        if (user.role === 'municipality_admin' && user.municipalityId) {
          return r.municipalityId === user.municipalityId;
        }
        if (user.role === 'district_admin' && user.districtId) {
          return r.districtId === user.districtId;
        }
        if (user.role === 'state_admin' && user.stateId) {
          return r.stateId === user.stateId;
        }
        return true;
      })
      .map((r) => ({
        id: r.id,
        userId: r.userId,
        fullName: r.fullName,
        email: r.email,
        phone: r.phone ?? null,
        departmentId: r.departmentId,
        departmentName: r.departmentName,
        municipalityId: r.municipalityId,
        municipalityName: r.municipalityName,
        designation: r.designation,
        activeCount: r.activeCount,
        isActive: Boolean(r.isActiveInt),
      }));

    res.json({ fieldOfficers: filtered });
  });

  app.post('/api/field-officers', requireAuth, (req: AuthRequest, res) => {
    const actor = req.authUser!;
    if (!canManageFieldOfficers(actor)) {
      res.status(403).json({ error: 'Only Municipality or Government Administrators can add department field officers.' });
      return;
    }

    const fullName = String(req.body?.fullName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const phone = req.body?.phone ? String(req.body.phone).trim().slice(0, 30) : null;
    const departmentId = String(req.body?.departmentId || '').trim();
    const designation = String(req.body?.designation || '').trim();
    const requestedMuniId = String(req.body?.municipalityId || '').trim();

    if (fullName.length < 2 || fullName.length > 100) {
      res.status(400).json({ error: 'Officer full name must be between 2 and 100 characters.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please provide a valid email address for the field officer.' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Initial login password must be between 8 and 128 characters.' });
      return;
    }
    if (!departmentId) {
      res.status(400).json({ error: 'Department selection is required.' });
      return;
    }
    if (designation.length < 2 || designation.length > 100) {
      res.status(400).json({ error: 'Designated role must be between 2 and 100 characters.' });
      return;
    }

    const effectiveMuniId =
      actor.role === 'municipality_admin' && actor.municipalityId
        ? actor.municipalityId
        : requestedMuniId || actor.municipalityId || '';

    if (!effectiveMuniId) {
      res.status(400).json({ error: 'Municipality assignment is required.' });
      return;
    }
    if (actor.role === 'municipality_admin' && actor.municipalityId && requestedMuniId && requestedMuniId !== actor.municipalityId) {
      res.status(403).json({ error: 'Municipality administrators can only add field officers to their assigned municipality.' });
      return;
    }

    const dept = db.prepare('SELECT id, name FROM departments WHERE id = ?').get(departmentId) as
      | { id: string; name: string }
      | undefined;
    if (!dept) {
      res.status(400).json({ error: 'Selected department was not found.' });
      return;
    }

    const muni = db
      .prepare('SELECT id, name, state_id, district_id FROM municipalities WHERE id = ?')
      .get(effectiveMuniId) as { id: string; name: string; state_id: string; district_id: string } | undefined;
    if (!muni) {
      res.status(400).json({ error: 'Selected municipality was not found.' });
      return;
    }
    if (actor.stateId && muni.state_id !== actor.stateId) {
      res.status(403).json({ error: 'You can only add field officers within your assigned state.' });
      return;
    }
    if (actor.role === 'district_admin' && actor.districtId && muni.district_id !== actor.districtId) {
      res.status(403).json({ error: 'District administrators can only add field officers within their assigned district.' });
      return;
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email) as { id: string } | undefined;
    if (existingUser) {
      res.status(409).json({ error: `An account with email "${email}" already exists.` });
      return;
    }

    const userId = `usr-${crypto.randomUUID().slice(0, 8)}`;
    const officerId = `fo-${crypto.randomUUID().slice(0, 6)}`;
    const nowIso = new Date().toISOString();

    db.prepare(
      `INSERT INTO users (id, email, password_hash, full_name, phone, role, state_id, district_id, municipality_id, department_id, is_active, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, 'field_officer', ?, ?, ?, ?, 1, 0, ?)`
    ).run(userId, email, hashPassword(password), fullName, phone, muni.state_id, muni.district_id, muni.id, dept.id, nowIso);

    db.prepare(
      'INSERT INTO field_officers (id, user_id, department_id, municipality_id, designation) VALUES (?, ?, ?, ?, ?)'
    ).run(officerId, userId, dept.id, muni.id, designation);

    writeAuditLog({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'CREATE_FIELD_OFFICER',
      entityType: 'field_officer',
      entityId: officerId,
      details: `Added ${designation} (${fullName}) to ${dept.name} in ${muni.name}`,
    });

    res.status(201).json({
      fieldOfficer: {
        id: officerId,
        userId,
        fullName,
        email,
        phone,
        departmentId: dept.id,
        departmentName: dept.name,
        municipalityId: muni.id,
        municipalityName: muni.name,
        designation,
        activeCount: 0,
        isActive: true,
      },
    });
  });

  app.patch('/api/field-officers/:id/toggle', requireAuth, (req: AuthRequest, res) => {
    const actor = req.authUser!;
    if (!canManageFieldOfficers(actor)) {
      res.status(403).json({ error: 'Only Municipality or Government Administrators can modify field officer status.' });
      return;
    }
    const row = db
      .prepare(
        `SELECT fo.id, fo.user_id as userId, fo.municipality_id as municipalityId, u.full_name as fullName,
                u.is_active as isActiveInt, m.state_id as stateId, m.district_id as districtId
         FROM field_officers fo
         JOIN users u ON u.id = fo.user_id
         JOIN municipalities m ON m.id = fo.municipality_id
         WHERE fo.id = ?`
      )
      .get(req.params.id) as any;

    if (!row) {
      res.status(404).json({ error: 'Field officer not found.' });
      return;
    }
    if (actor.role === 'municipality_admin' && actor.municipalityId && row.municipalityId !== actor.municipalityId) {
      res.status(403).json({ error: 'You can only manage field officers in your assigned municipality.' });
      return;
    }
    if (actor.role === 'district_admin' && actor.districtId && row.districtId !== actor.districtId) {
      res.status(403).json({ error: 'You can only manage field officers in your assigned district.' });
      return;
    }
    if (actor.stateId && row.stateId !== actor.stateId) {
      res.status(403).json({ error: 'You can only manage field officers in your assigned state.' });
      return;
    }

    const nextState = row.isActiveInt ? 0 : 1;
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(nextState, row.userId);
    writeAuditLog({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: nextState ? 'ACTIVATE_FIELD_OFFICER' : 'DEACTIVATE_FIELD_OFFICER',
      entityType: 'field_officer',
      entityId: row.id,
      details: `Set ${row.fullName} active state to ${Boolean(nextState)}`,
    });

    res.json({ isActive: Boolean(nextState) });
  });

  // Analytics & AI Dashboard Summary
  app.get('/api/analytics', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const rows = db.prepare(`${BASE_ISSUE_SELECT}`).all() as any[];
    const scopedIssues = rows.map(hydrateIssueRow).filter((iss) => canUserAccessIssue(user, iss, req.fieldOfficerId));

    const total = scopedIssues.length;
    const resolved = scopedIssues.filter((i) => i.status === 'Resolved' || i.status === 'Closed').length;
    const pending = total - resolved;
    const overdue = scopedIssues.filter((i) => i.isOverdue).length;
    const escalated = scopedIssues.filter((i) => i.isEscalated).length;

    const categoryMap = new Map<string, number>();
    const muniMap = new Map<string, { id: string; name: string; total: number; resolved: number; overdue: number }>();
    const deptMap = new Map<string, { id: string; name: string; total: number; resolved: number; overdue: number; avgResponseHours: number }>();
    const districtMap = new Map<string, { name: string; total: number; resolved: number }>();

    for (const iss of scopedIssues) {
      categoryMap.set(iss.category, (categoryMap.get(iss.category) ?? 0) + 1);

      const mEntry = muniMap.get(iss.municipalityId) ?? {
        id: iss.municipalityId,
        name: iss.municipalityName,
        total: 0,
        resolved: 0,
        overdue: 0,
      };
      mEntry.total += 1;
      if (iss.status === 'Resolved' || iss.status === 'Closed') mEntry.resolved += 1;
      if (iss.isOverdue) mEntry.overdue += 1;
      muniMap.set(iss.municipalityId, mEntry);

      const dEntry = districtMap.get(iss.districtId) ?? { name: iss.districtName, total: 0, resolved: 0 };
      dEntry.total += 1;
      if (iss.status === 'Resolved' || iss.status === 'Closed') dEntry.resolved += 1;
      districtMap.set(iss.districtId, dEntry);

      if (iss.departmentId && iss.departmentName) {
        const deptEntry = deptMap.get(iss.departmentId) ?? {
          id: iss.departmentId,
          name: iss.departmentName,
          total: 0,
          resolved: 0,
          overdue: 0,
          avgResponseHours: 6.5,
        };
        deptEntry.total += 1;
        if (iss.status === 'Resolved' || iss.status === 'Closed') deptEntry.resolved += 1;
        if (iss.isOverdue) deptEntry.overdue += 1;
        deptMap.set(iss.departmentId, deptEntry);
      }
    }

    res.json({
      summary: {
        total,
        pending,
        resolved,
        overdue,
        escalated,
        avgResolutionHours: resolved > 0 ? 26.4 : 0,
        resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
      },
      byCategory: Array.from(categoryMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      byMunicipality: Array.from(muniMap.values()).sort((a, b) => b.total - a.total),
      byDepartment: Array.from(deptMap.values()).sort((a, b) => b.total - a.total),
      byDistrict: Array.from(districtMap.values()).sort((a, b) => b.total - a.total),
    });
  });

  app.post('/api/ai/dashboard-summary', requireAuth, async (req: AuthRequest, res) => {
    const user = req.authUser!;
    const rows = db.prepare(`${BASE_ISSUE_SELECT}`).all() as any[];
    const scoped = rows.map(hydrateIssueRow).filter((iss) => canUserAccessIssue(user, iss, req.fieldOfficerId));
    const resolved = scoped.filter((i) => i.status === 'Resolved' || i.status === 'Closed').length;
    const overdue = scoped.filter((i) => i.isOverdue).length;

    const catCount = new Map<string, number>();
    const muniCount = new Map<string, number>();
    for (const s of scoped) {
      catCount.set(s.category, (catCount.get(s.category) ?? 0) + 1);
      muniCount.set(s.municipalityName, (muniCount.get(s.municipalityName) ?? 0) + 1);
    }

    const result = await generateDashboardSummaryWithAi({
      roleLabel: user.role.replace('_', ' ').toUpperCase(),
      total: scoped.length,
      pending: scoped.length - resolved,
      resolved,
      overdue,
      topCategories: Array.from(catCount.entries()).map(([category, count]) => ({ category, count })),
      topMunicipalities: Array.from(muniCount.entries()).map(([name, count]) => ({ name, count })),
    });
    res.json(result);
  });

  // Company Admin Governance Endpoints
  app.get('/api/admin/overview', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    if (!['company_admin', 'state_admin'].includes(user.role)) {
      res.status(403).json({ error: 'Platform administrator access required.' });
      return;
    }

    const users = (db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as any[]).map(mapUserRow);
    const jurisdictions = getJurisdictionsWithNames();
    const categories = getCategoryConfigs();
    const auditLogs = db
      .prepare(
        `SELECT al.id, al.actor_user_id as actorUserId, u.full_name as actorName, al.actor_role as actorRole,
                al.action, al.entity_type as entityType, al.entity_id as entityId, al.details, al.created_at as createdAt
         FROM audit_logs al
         JOIN users u ON u.id = al.actor_user_id
         ORDER BY al.created_at DESC LIMIT 60`
      )
      .all();

    res.json({ users, jurisdictions, categories, auditLogs });
  });

  app.post('/api/admin/users', requireAuth, (req: AuthRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'company_admin') {
      res.status(403).json({ error: 'Only Company Administrators can create official accounts.' });
      return;
    }

    const { email, password, fullName, phone, role, stateId, districtId, municipalityId, departmentId, designation } =
      req.body ?? {};
    if (!email || !password || !fullName || !role) {
      res.status(400).json({ error: 'Email, password, full name, and role are required.' });
      return;
    }
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(String(email).trim());
    if (existing) {
      res.status(409).json({ error: 'Email already registered.' });
      return;
    }

    const id = `usr-${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, email, password_hash, full_name, phone, role, state_id, district_id, municipality_id, department_id, is_active, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`
    ).run(
      id,
      String(email).trim().toLowerCase(),
      hashPassword(String(password)),
      String(fullName).trim(),
      phone || null,
      role,
      stateId || 'st-kl',
      districtId || null,
      municipalityId || null,
      departmentId || null,
      nowIso
    );

    if (role === 'field_officer' && departmentId && municipalityId) {
      db.prepare(
        'INSERT INTO field_officers (id, user_id, department_id, municipality_id, designation) VALUES (?, ?, ?, ?, ?)'
      ).run(`fo-${crypto.randomUUID().slice(0, 6)}`, id, departmentId, municipalityId, designation || 'Field Engineer');
    }

    writeAuditLog({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'CREATE_USER',
      entityType: 'user',
      entityId: String(email).trim(),
      details: `Created ${role} account for ${fullName}`,
    });

    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.status(201).json({ user: mapUserRow(created) });
  });

  app.patch('/api/admin/users/:id/toggle', requireAuth, (req: AuthRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'company_admin') {
      res.status(403).json({ error: 'Only Company Administrators can modify user status.' });
      return;
    }
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (target.id === actor.id) {
      res.status(400).json({ error: 'Cannot deactivate your own administrator account.' });
      return;
    }
    const nextState = target.is_active ? 0 : 1;
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(nextState, target.id);
    writeAuditLog({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: nextState ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      entityType: 'user',
      entityId: target.email,
      details: `Toggled active state to ${Boolean(nextState)}`,
    });
    res.json({ isActive: Boolean(nextState) });
  });

  app.post('/api/admin/districts', requireAuth, (req: AuthRequest, res) => {
    const actor = req.authUser!;
    if (!canCreateDistrict(actor)) {
      res.status(403).json({ error: 'Only Government or Platform Administrators can add new districts.' });
      return;
    }
    const rawName = String(req.body?.name || '').trim();
    const requestedStateId = String(req.body?.stateId || '').trim();
    const requestedStatus = req.body?.status !== undefined ? String(req.body.status).trim() : 'Active';
    if (rawName.length < 2 || rawName.length > 80) {
      res.status(400).json({ error: 'District name must be between 2 and 80 characters.' });
      return;
    }
    if (!isValidLocationStatus(requestedStatus)) {
      res.status(400).json({ error: 'Status must be Active, Pending Approval, or Archived.' });
      return;
    }

    const effectiveStateId = actor.stateId || requestedStateId || 'st-kl';
    const stateRow = db.prepare('SELECT id, name FROM states WHERE id = ?').get(effectiveStateId) as
      | { id: string; name: string }
      | undefined;
    if (!stateRow) {
      res.status(400).json({ error: 'Selected state was not found.' });
      return;
    }
    if (actor.stateId && requestedStateId && requestedStateId !== actor.stateId) {
      res.status(403).json({ error: 'You can only add districts within your assigned state.' });
      return;
    }

    const duplicate = db
      .prepare('SELECT id FROM districts WHERE state_id = ? AND LOWER(TRIM(name)) = LOWER(?)')
      .get(effectiveStateId, rawName) as { id: string } | undefined;
    if (duplicate) {
      res.status(409).json({ error: `District "${rawName}" already exists in ${stateRow.name}.` });
      return;
    }

    const id = `dist-${crypto.randomUUID().slice(0, 6)}`;
    db.prepare('INSERT INTO districts (id, state_id, name, status) VALUES (?, ?, ?, ?)').run(
      id,
      effectiveStateId,
      rawName,
      requestedStatus
    );

    writeAuditLog({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'CREATE_DISTRICT',
      entityType: 'district',
      entityId: id,
      details: `Added district "${rawName}" (${requestedStatus}) in ${stateRow.name}`,
    });

    res.status(201).json({
      district: {
        id,
        stateId: effectiveStateId,
        name: rawName,
        status: requestedStatus,
      },
    });
  });

  app.patch('/api/admin/districts/:id/status', requireAuth, (req: AuthRequest, res) => {
    const actor = req.authUser!;
    if (!canUpdateDistrictStatus(actor)) {
      res.status(403).json({ error: 'Only Government or Platform Administrators can update district status.' });
      return;
    }
    const nextStatus = String(req.body?.status || '').trim();
    if (!isValidLocationStatus(nextStatus)) {
      res.status(400).json({ error: 'Status must be Active, Pending Approval, or Archived.' });
      return;
    }
    const dist = db
      .prepare('SELECT id, state_id, name, status FROM districts WHERE id = ?')
      .get(req.params.id) as { id: string; state_id: string; name: string; status: string } | undefined;
    if (!dist) {
      res.status(404).json({ error: 'District not found.' });
      return;
    }
    if (actor.stateId && dist.state_id !== actor.stateId) {
      res.status(403).json({ error: 'You can only manage districts within your assigned state.' });
      return;
    }
    if (actor.role === 'district_admin' && actor.districtId && dist.id !== actor.districtId) {
      res.status(403).json({ error: 'District administrators can only update their assigned district.' });
      return;
    }

    db.prepare('UPDATE districts SET status = ? WHERE id = ?').run(nextStatus, dist.id);
    writeAuditLog({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'UPDATE_DISTRICT_STATUS',
      entityType: 'district',
      entityId: dist.id,
      details: `Changed district "${dist.name}" status from ${dist.status} to ${nextStatus}`,
    });

    res.json({
      district: {
        id: dist.id,
        stateId: dist.state_id,
        name: dist.name,
        status: nextStatus,
      },
    });
  });

  app.post('/api/admin/municipalities', requireAuth, (req: AuthRequest, res) => {
    const actor = req.authUser!;
    if (!canCreatePlace(actor)) {
      res.status(403).json({ error: 'Only Municipality or Government Administrators can add new places.' });
      return;
    }
    const rawName = String(req.body?.name || '').trim();
    const districtId = String(req.body?.districtId || actor.districtId || '').trim();
    const placeType = String(req.body?.type || 'Municipality').trim();
    const requestedStatus = req.body?.status !== undefined ? String(req.body.status).trim() : 'Active';
    const allowedTypes = ['Municipality', 'Corporation', 'Grama Panchayat', 'Township', 'Ward / Zone'];

    if (rawName.length < 2 || rawName.length > 80) {
      res.status(400).json({ error: 'Place name must be between 2 and 80 characters.' });
      return;
    }
    if (!districtId) {
      res.status(400).json({ error: 'District selection is required.' });
      return;
    }
    if (!isValidLocationStatus(requestedStatus)) {
      res.status(400).json({ error: 'Status must be Active, Pending Approval, or Archived.' });
      return;
    }
    const normalizedType = allowedTypes.includes(placeType) ? placeType : 'Municipality';

    const dist = db
      .prepare('SELECT id, state_id, name FROM districts WHERE id = ?')
      .get(districtId) as { id: string; state_id: string; name: string } | undefined;
    if (!dist) {
      res.status(400).json({ error: 'Selected district was not found.' });
      return;
    }
    if (actor.stateId && dist.state_id !== actor.stateId) {
      res.status(403).json({ error: 'You can only add places within your assigned state.' });
      return;
    }
    if (actor.role === 'district_admin' && actor.districtId && dist.id !== actor.districtId) {
      res.status(403).json({ error: 'District administrators can only add places within their assigned district.' });
      return;
    }

    const lat = req.body?.centerLat !== undefined && req.body?.centerLat !== '' ? Number(req.body.centerLat) : 9.9312;
    const lng = req.body?.centerLng !== undefined && req.body?.centerLng !== '' ? Number(req.body.centerLng) : 76.2673;
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      res.status(400).json({ error: 'Coordinates must be valid latitude (-90..90) and longitude (-180..180).' });
      return;
    }

    const duplicate = db
      .prepare('SELECT id FROM municipalities WHERE district_id = ? AND LOWER(TRIM(name)) = LOWER(?)')
      .get(districtId, rawName) as { id: string } | undefined;
    if (duplicate) {
      res.status(409).json({ error: `Place "${rawName}" already exists in ${dist.name}.` });
      return;
    }

    const id = `mun-${crypto.randomUUID().slice(0, 6)}`;
    db.prepare(
      'INSERT INTO municipalities (id, state_id, district_id, name, type, status, center_lat, center_lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, dist.state_id, districtId, rawName, normalizedType, requestedStatus, lat, lng);

    // Seed default department routing jurisdictions so complaints filed in this new place auto-route immediately
    const deptRows = db.prepare('SELECT id, code FROM departments').all() as Array<{ id: string; code: string }>;
    const deptByCode = new Map(deptRows.map((d) => [d.code, d.id]));
    const defaultRules: Array<{ code: string; categories: string[]; sla: number }> = [
      { code: 'PWD', categories: ['Potholes', 'Damaged roads', 'Unsafe road excavation'], sla: 48 },
      { code: 'ELEC', categories: ['Broken streetlights'], sla: 24 },
      { code: 'WATER', categories: ['Water leakage'], sla: 24 },
      { code: 'DRAIN', categories: ['Blocked drainage'], sla: 36 },
      { code: 'WASTE', categories: ['Waste management'], sla: 24 },
      { code: 'MUNI_ENG', categories: ['Damaged public infrastructure', 'Abandoned construction materials'], sla: 48 },
    ];
    const insertJur = db.prepare(
      'INSERT INTO department_jurisdictions (id, department_id, municipality_id, handled_categories_json, sla_hours) VALUES (?, ?, ?, ?, ?)'
    );
    for (const rule of defaultRules) {
      const deptId = deptByCode.get(rule.code);
      if (deptId) {
        insertJur.run(`jur-${rule.code.toLowerCase()}-${id}`, deptId, id, JSON.stringify(rule.categories), rule.sla);
      }
    }

    writeAuditLog({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'CREATE_MUNICIPALITY',
      entityType: 'municipality',
      entityId: id,
      details: `Added ${normalizedType} "${rawName}" (${requestedStatus}) in ${dist.name}`,
    });

    res.status(201).json({
      id,
      name: rawName,
      municipality: {
        id,
        stateId: dist.state_id,
        districtId,
        name: rawName,
        type: normalizedType,
        status: requestedStatus,
        centerLat: lat,
        centerLng: lng,
      },
    });
  });

  app.patch('/api/admin/municipalities/:id/status', requireAuth, (req: AuthRequest, res) => {
    const actor = req.authUser!;
    if (!canUpdatePlaceStatus(actor)) {
      res.status(403).json({ error: 'Only Municipality or Government Administrators can update place status.' });
      return;
    }
    const nextStatus = String(req.body?.status || '').trim();
    if (!isValidLocationStatus(nextStatus)) {
      res.status(400).json({ error: 'Status must be Active, Pending Approval, or Archived.' });
      return;
    }
    const muni = db
      .prepare('SELECT id, state_id, district_id, name, type, status, center_lat, center_lng FROM municipalities WHERE id = ?')
      .get(req.params.id) as
      | {
          id: string;
          state_id: string;
          district_id: string;
          name: string;
          type: string;
          status: string;
          center_lat: number;
          center_lng: number;
        }
      | undefined;
    if (!muni) {
      res.status(404).json({ error: 'Place not found.' });
      return;
    }
    if (actor.stateId && muni.state_id !== actor.stateId) {
      res.status(403).json({ error: 'You can only manage places within your assigned state.' });
      return;
    }
    if (actor.role === 'district_admin' && actor.districtId && muni.district_id !== actor.districtId) {
      res.status(403).json({ error: 'District administrators can only manage places within their assigned district.' });
      return;
    }

    db.prepare('UPDATE municipalities SET status = ? WHERE id = ?').run(nextStatus, muni.id);
    writeAuditLog({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'UPDATE_MUNICIPALITY_STATUS',
      entityType: 'municipality',
      entityId: muni.id,
      details: `Changed place "${muni.name}" status from ${muni.status} to ${nextStatus}`,
    });

    res.json({
      municipality: {
        id: muni.id,
        stateId: muni.state_id,
        districtId: muni.district_id,
        name: muni.name,
        type: muni.type,
        status: nextStatus,
        centerLat: muni.center_lat,
        centerLng: muni.center_lng,
      },
    });
  });

  app.post('/api/admin/jurisdictions', requireAuth, (req: AuthRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'company_admin') {
      res.status(403).json({ error: 'Only Company Administrators can configure jurisdictions.' });
      return;
    }
    const { departmentId, municipalityId, handledCategories, slaHours } = req.body ?? {};
    if (!departmentId || !municipalityId || !Array.isArray(handledCategories)) {
      res.status(400).json({ error: 'Department, municipality, and categories are required.' });
      return;
    }
    const existing = db
      .prepare('SELECT id FROM department_jurisdictions WHERE department_id = ? AND municipality_id = ?')
      .get(departmentId, municipalityId) as { id: string } | undefined;

    if (existing) {
      db.prepare('UPDATE department_jurisdictions SET handled_categories_json = ?, sla_hours = ? WHERE id = ?').run(
        JSON.stringify(handledCategories),
        Number(slaHours) || 48,
        existing.id
      );
    } else {
      db.prepare(
        'INSERT INTO department_jurisdictions (id, department_id, municipality_id, handled_categories_json, sla_hours) VALUES (?, ?, ?, ?, ?)'
      ).run(`jur-${crypto.randomUUID().slice(0, 6)}`, departmentId, municipalityId, JSON.stringify(handledCategories), Number(slaHours) || 48);
    }

    writeAuditLog({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'ASSIGN_JURISDICTION',
      entityType: 'jurisdiction',
      entityId: `${departmentId}:${municipalityId}`,
      details: `Configured categories [${handledCategories.join(', ')}] with SLA ${slaHours || 48}h`,
    });

    res.json({ jurisdictions: getJurisdictionsWithNames() });
  });

  app.post('/api/admin/categories', requireAuth, (req: AuthRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'company_admin') {
      res.status(403).json({ error: 'Only Company Administrators can manage issue categories.' });
      return;
    }
    const { name, defaultDepartmentCode, slaHours, description } = req.body ?? {};
    if (!name || !defaultDepartmentCode) {
      res.status(400).json({ error: 'Category name and default department code are required.' });
      return;
    }
    const id = `cat-${crypto.randomUUID().slice(0, 6)}`;
    db.prepare(
      'INSERT INTO issue_categories (id, name, default_department_code, sla_hours, description, is_active) VALUES (?, ?, ?, ?, ?, 1)'
    ).run(id, String(name).trim(), String(defaultDepartmentCode).trim(), Number(slaHours) || 48, String(description || '').trim());

    writeAuditLog({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'CREATE_CATEGORY',
      entityType: 'issue_category',
      entityId: name,
      details: `Added issue category "${name}" -> ${defaultDepartmentCode}`,
    });

    res.status(201).json({ categories: getCategoryConfigs() });
  });

  // =========================================================================
  // WhatsApp Civic Chatbot + Meta WhatsApp Cloud API Webhook Integration
  // =========================================================================

  async function processInboundWhatsappTurn(params: {
    phone: string;
    message: string;
    channelMode: 'web_simulator' | 'meta_webhook';
    explicitMunicipalityId?: string | null;
    latitude?: number;
    longitude?: number;
    photoDataUrl?: string;
    authUser?: UserAccount | null;
  }) {
    const normalizedPhone = normalizePhoneNumber(params.phone);
    const nowIso = new Date().toISOString();
    const activeMunis = getAllMunicipalities().filter((m) => !m.status || m.status === 'Active');

    let sessionRow = db.prepare('SELECT * FROM whatsapp_sessions WHERE phone_number = ?').get(normalizedPhone) as any;
    let draft: WhatsappSessionDraft | null = null;
    if (sessionRow?.draft_json) {
      try {
        draft = JSON.parse(sessionRow.draft_json) as WhatsappSessionDraft;
      } catch {
        draft = null;
      }
    }

    let uploadedMediaUrl = '';
    if (typeof params.photoDataUrl === 'string' && params.photoDataUrl.trim()) {
      uploadedMediaUrl = saveBase64Upload(params.photoDataUrl.trim(), 'whatsapp');
    } else if (draft?.photoDataUrl) {
      uploadedMediaUrl = draft.photoDataUrl;
    }

    const imageInfo = uploadedMediaUrl ? readUploadAsBase64(uploadedMediaUrl) : null;
    const parsed = await extractWhatsappComplaintWithAi({
      message: params.message,
      municipalities: activeMunis,
      draft,
      explicitMunicipalityId: params.explicitMunicipalityId,
      imageBase64: imageInfo?.base64,
      mimeType: imageInfo?.mimeType,
    });

    const citizenUser =
      params.authUser && params.authUser.role === 'citizen'
        ? params.authUser
        : resolveOrCreateWhatsappCitizen(normalizedPhone, parsed.matchedMunicipality);

    if (!sessionRow) {
      const sessId = `was-${crypto.randomUUID().slice(0, 8)}`;
      db.prepare(
        `INSERT INTO whatsapp_sessions (id, phone_number, citizen_user_id, draft_json, last_complaint_code, updated_at)
         VALUES (?, ?, ?, NULL, NULL, ?)`
      ).run(sessId, normalizedPhone, citizenUser.id, nowIso);
      sessionRow = db.prepare('SELECT * FROM whatsapp_sessions WHERE id = ?').get(sessId);
    } else if (!sessionRow.citizen_user_id) {
      db.prepare('UPDATE whatsapp_sessions SET citizen_user_id = ? WHERE id = ?').run(citizenUser.id, sessionRow.id);
      sessionRow.citizen_user_id = citizenUser.id;
    }

    // Record inbound citizen message
    db.prepare(
      `INSERT INTO whatsapp_messages (id, session_id, phone_number, direction, body, media_url, linked_complaint_code, channel_mode, created_at)
       VALUES (?, ?, ?, 'inbound', ?, ?, ?, ?, ?)`
    ).run(
      `wam-${crypto.randomUUID().slice(0, 8)}`,
      sessionRow.id,
      normalizedPhone,
      params.message.trim() || '[Photo Evidence Attached]',
      uploadedMediaUrl || null,
      parsed.complaintCode || null,
      params.channelMode,
      nowIso
    );

    let replyText = '';
    let createdIssue: CivicIssue | null = null;
    let linkedIssue: CivicIssue | null = null;
    let nextDraft: WhatsappSessionDraft | null = null;
    let nextLastCode: string | null = sessionRow.last_complaint_code || null;

    if (parsed.intent === 'greeting_help') {
      const samplePlace = activeMunis[0]?.name || 'Mulanthuruthy';
      replyText = [
        `Namaskaram! Welcome to the Civil Setu WhatsApp Civic Bot.`,
        `You can report public infrastructure problems directly from WhatsApp:`,
        `1. Report an issue: Send a description + place (e.g., "Deep pothole near school gate in ${samplePlace}"). You can also attach a photo or location pin.`,
        `2. Track a complaint: Reply "Status PWD-2026-00125".`,
        `3. Verify a repair: Reply "Verify PWD-2026-00125 confirm" or "Reopen PWD-2026-00125 still broken".`,
      ].join('\n');
    } else if (parsed.intent === 'track_status' && parsed.complaintCode) {
      const row = db
        .prepare(`${BASE_ISSUE_SELECT} WHERE UPPER(i.complaint_code) = ?`)
        .get(parsed.complaintCode.toUpperCase()) as any;
      if (!row) {
        replyText = `No complaint found matching ${parsed.complaintCode}. Please verify the ID (format: PWD-2026-00125).`;
      } else {
        linkedIssue = hydrateIssueRow(row);
        nextLastCode = linkedIssue.complaintCode;
        const latestHist = db
          .prepare('SELECT note, created_at FROM status_history WHERE issue_id = ? ORDER BY created_at DESC LIMIT 1')
          .get(linkedIssue.id) as { note: string; created_at: string } | undefined;
        replyText = [
          `Status for ${linkedIssue.complaintCode}: ${linkedIssue.status}`,
          `Issue: ${linkedIssue.title} (${linkedIssue.category})`,
          `Municipality: ${linkedIssue.municipalityName}`,
          `Department: ${linkedIssue.departmentName || 'Manual Review Queue'}`,
          `Field Officer: ${linkedIssue.fieldOfficerName || 'Pending assignment'}`,
          `Latest Update: ${latestHist?.note || 'In departmental queue'}`,
        ].join('\n');
      }
    } else if (parsed.intent === 'verify_issue' && parsed.complaintCode) {
      const row = db
        .prepare(`${BASE_ISSUE_SELECT} WHERE UPPER(i.complaint_code) = ?`)
        .get(parsed.complaintCode.toUpperCase()) as any;
      if (!row) {
        replyText = `No complaint found matching ${parsed.complaintCode}.`;
      } else {
        const target = hydrateIssueRow(row);
        if (target.status !== 'Resolved' && target.status !== 'Citizen Verification') {
          replyText = `${target.complaintCode} is currently "${target.status}". Citizen verification is available once the department marks the repair Resolved.`;
        } else {
          const decision = parsed.verifyDecision || 'confirmed';
          const targetStatus: IssueStatus = decision === 'confirmed' ? 'Closed' : 'Reopened';
          const feedback = parsed.verifyFeedback || (decision === 'confirmed' ? 'Verified via WhatsApp.' : 'Reopened via WhatsApp.');
          const vNow = new Date().toISOString();

          db.prepare('UPDATE issues SET status = ?, updated_at = ? WHERE id = ?').run(targetStatus, vNow, target.id);
          db.prepare(
            'INSERT INTO repair_verifications (id, issue_id, citizen_id, decision, feedback, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(`rv-${crypto.randomUUID().slice(0, 8)}`, target.id, target.reporterId, decision, feedback, vNow);
          db.prepare(
            `INSERT INTO status_history (id, issue_id, from_status, to_status, changed_by_user_id, changed_by_role, note, created_at)
             VALUES (?, ?, ?, ?, ?, 'citizen', ?, ?)`
          ).run(`hist-${crypto.randomUUID().slice(0, 8)}`, target.id, target.status, targetStatus, target.reporterId, feedback, vNow);

          if (target.roadPassportId) {
            const rpRow = db.prepare('SELECT * FROM road_passports WHERE id = ?').get(target.roadPassportId) as any;
            if (rpRow) {
              const hist = JSON.parse(rpRow.history_json || '[]');
              hist.push({
                timestamp: vNow,
                actor: `Citizen via WhatsApp (${formatPhoneDisplay(normalizedPhone)})`,
                note: decision === 'confirmed' ? 'Citizen verified restoration via WhatsApp; passport sealed.' : `Citizen reopened via WhatsApp: ${feedback}`,
              });
              db.prepare(
                'UPDATE road_passports SET citizen_verification_status = ?, work_status = ?, flagged_for_inspection = ?, history_json = ?, updated_at = ? WHERE id = ?'
              ).run(
                decision === 'confirmed' ? 'Verified' : 'Disputed',
                decision === 'confirmed' ? 'Completed' : 'Flagged',
                decision === 'confirmed' ? 0 : 1,
                JSON.stringify(hist),
                vNow,
                rpRow.id
              );
            }
          }

          writeAuditLog({
            actorUserId: target.reporterId,
            actorRole: 'citizen',
            action: decision === 'confirmed' ? 'WHATSAPP_VERIFY_CLOSE' : 'WHATSAPP_REOPEN',
            entityType: 'issue',
            entityId: target.complaintCode,
            details: feedback,
          });

          linkedIssue = hydrateIssueRow(db.prepare(`${BASE_ISSUE_SELECT} WHERE i.id = ?`).get(target.id));
          nextLastCode = target.complaintCode;
          replyText =
            decision === 'confirmed'
              ? `Thank you! ${target.complaintCode} has been verified and Closed. Its Digital Road Passport has been sealed.`
              : `${target.complaintCode} has been Reopened and escalated back to ${target.departmentName || 'the review team'} for re-inspection.`;
        }
      }
    } else {
      // Report issue intent
      if (parsed.missingFields.includes('description')) {
        nextDraft = {
          ...(draft || {}),
          municipalityId: parsed.matchedMunicipality?.id || draft?.municipalityId,
          municipalityName: parsed.matchedMunicipality?.name || draft?.municipalityName,
          latitude: params.latitude ?? draft?.latitude,
          longitude: params.longitude ?? draft?.longitude,
          photoDataUrl: uploadedMediaUrl || draft?.photoDataUrl,
        };
        replyText = parsed.matchedMunicipality
          ? `Got it — location noted as ${parsed.matchedMunicipality.name}. Please describe the public infrastructure problem (e.g., pothole size, streetlight pole location, or water leak landmark).`
          : `Please describe the civic infrastructure problem and mention the place/municipality name (for example: "Water pipe leak near market road in Kochi Corporation").`;
      } else if (parsed.missingFields.includes('municipality') || !parsed.matchedMunicipality) {
        nextDraft = {
          title: parsed.title,
          description: parsed.description,
          suggestedCategory: parsed.suggestedCategory,
          latitude: params.latitude ?? draft?.latitude,
          longitude: params.longitude ?? draft?.longitude,
          photoDataUrl: uploadedMediaUrl || draft?.photoDataUrl,
        };
        const placeNames = activeMunis.slice(0, 8).map((m) => m.name).join(', ');
        replyText = [
          `I captured your issue: "${parsed.title}" (${parsed.suggestedCategory}).`,
          `Which active Municipality / Place is this located in?`,
          `Active places: ${placeNames}`,
        ].join('\n');
      } else {
        const result = await createCivicIssuePipeline({
          user: citizenUser,
          title: parsed.title,
          description: parsed.description,
          category: 'Auto-Detect with AI',
          municipalityId: parsed.matchedMunicipality.id,
          addressText: parsed.addressHint || `${parsed.matchedMunicipality.name}, Kerala`,
          latitude: params.latitude ?? draft?.latitude ?? parsed.matchedMunicipality.centerLat,
          longitude: params.longitude ?? draft?.longitude ?? parsed.matchedMunicipality.centerLng,
          photoDataUrl: uploadedMediaUrl || undefined,
          channel: 'whatsapp',
          reporterPhone: normalizedPhone,
        });
        createdIssue = result.issue;
        linkedIssue = result.issue;
        nextLastCode = result.issue.complaintCode;
        nextDraft = null;
        replyText = formatWhatsappConfirmationReply({
          complaintCode: result.issue.complaintCode,
          title: result.issue.title,
          category: result.issue.category,
          severity: result.issue.severity,
          municipalityName: result.issue.municipalityName,
          departmentName: result.routing.departmentName,
          slaHours: result.routing.slaHours,
          hasRoadPassport: result.hasRoadPassport,
          duplicateCode: result.duplicates[0]?.complaintCode ?? null,
        });
      }
    }

    const replyNow = new Date().toISOString();
    db.prepare(
      `INSERT INTO whatsapp_messages (id, session_id, phone_number, direction, body, media_url, linked_complaint_code, channel_mode, created_at)
       VALUES (?, ?, ?, 'outbound', ?, NULL, ?, ?, ?)`
    ).run(
      `wam-${crypto.randomUUID().slice(0, 8)}`,
      sessionRow.id,
      normalizedPhone,
      replyText,
      createdIssue?.complaintCode || linkedIssue?.complaintCode || null,
      params.channelMode,
      replyNow
    );

    db.prepare('UPDATE whatsapp_sessions SET draft_json = ?, last_complaint_code = ?, updated_at = ? WHERE id = ?').run(
      nextDraft ? JSON.stringify(nextDraft) : null,
      nextLastCode,
      replyNow,
      sessionRow.id
    );

    if (params.channelMode === 'meta_webhook') {
      void sendMetaCloudWhatsappMessage(normalizedPhone, replyText);
    }

    const updatedSession = db.prepare('SELECT * FROM whatsapp_sessions WHERE id = ?').get(sessionRow.id) as any;
    const messages = (
      db
        .prepare('SELECT * FROM whatsapp_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 80')
        .all(sessionRow.id) as any[]
    ).map(mapWhatsappMessageRow);

    return {
      session: {
        id: updatedSession.id,
        phoneNumber: updatedSession.phone_number,
        citizenUserId: updatedSession.citizen_user_id,
        draft: nextDraft,
        lastComplaintCode: updatedSession.last_complaint_code,
        updatedAt: updatedSession.updated_at,
      },
      messages,
      reply: replyText,
      createdIssue,
      linkedIssue,
      aiSource: parsed.source,
    };
  }

  // Interactive Web WhatsApp Bot Session Loader
  app.get('/api/whatsapp/session', (req, res) => {
    const authUser = resolveOptionalAuthUser(req);
    const rawPhone = String(req.query.phone || authUser?.phone || '+91 98470 20001');
    const normalizedPhone = normalizePhoneNumber(rawPhone);
    const sessionRow = db.prepare('SELECT * FROM whatsapp_sessions WHERE phone_number = ?').get(normalizedPhone) as any;
    const messages = sessionRow
      ? (
          db
            .prepare('SELECT * FROM whatsapp_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 80')
            .all(sessionRow.id) as any[]
        ).map(mapWhatsappMessageRow)
      : [];

    res.json({
      session: sessionRow
        ? {
            id: sessionRow.id,
            phoneNumber: sessionRow.phone_number,
            citizenUserId: sessionRow.citizen_user_id,
            draft: sessionRow.draft_json ? JSON.parse(sessionRow.draft_json) : null,
            lastComplaintCode: sessionRow.last_complaint_code,
            updatedAt: sessionRow.updated_at,
          }
        : null,
      phoneNumber: normalizedPhone,
      messages,
      cloudApiConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    });
  });

  // Interactive Web WhatsApp Bot Message Endpoint
  app.post('/api/whatsapp/chat', async (req, res) => {
    try {
      const authUser = resolveOptionalAuthUser(req);
      const { phone, message, municipalityId, latitude, longitude, photoDataUrl } = req.body ?? {};
      const msgText = String(message || '').trim();
      if (!msgText && !photoDataUrl) {
        res.status(400).json({ error: 'Please enter a message or attach a photo to send to the WhatsApp Bot.' });
        return;
      }
      if (msgText.length > 2000) {
        res.status(400).json({ error: 'Message must be under 2000 characters.' });
        return;
      }

      const effectivePhone = String(phone || authUser?.phone || '+91 98470 20001');
      const result = await processInboundWhatsappTurn({
        phone: effectivePhone,
        message: msgText,
        channelMode: 'web_simulator',
        explicitMunicipalityId: typeof municipalityId === 'string' && municipalityId ? municipalityId : null,
        latitude: typeof latitude === 'number' && !Number.isNaN(latitude) ? latitude : undefined,
        longitude: typeof longitude === 'number' && !Number.isNaN(longitude) ? longitude : undefined,
        photoDataUrl: typeof photoDataUrl === 'string' && photoDataUrl.startsWith('data:image/') ? photoDataUrl : undefined,
        authUser,
      });

      res.json(result);
    } catch (error: any) {
      console.error('WhatsApp bot chat error:', error);
      res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to process WhatsApp message.' });
    }
  });

  // Admin / Governance WhatsApp Intake Monitor
  app.get('/api/whatsapp/intake-logs', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    if (!['company_admin', 'state_admin', 'district_admin', 'municipality_admin', 'department_admin'].includes(user.role)) {
      res.status(403).json({ error: 'Administrator or department access required.' });
      return;
    }

    const allWhatsappIssues = (
      db.prepare(`${BASE_ISSUE_SELECT} WHERE i.channel = 'whatsapp' ORDER BY i.created_at DESC`).all() as any[]
    )
      .map(hydrateIssueRow)
      .filter((iss) => canUserAccessIssue(user, iss, req.fieldOfficerId));

    const recentMessages = (
      db.prepare('SELECT * FROM whatsapp_messages ORDER BY created_at DESC LIMIT 40').all() as any[]
    ).map(mapWhatsappMessageRow);

    res.json({
      issues: allWhatsappIssues,
      recentMessages,
      integration: {
        webhookPath: '/api/webhooks/whatsapp',
        verifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
        appSecretConfigured: Boolean(process.env.WHATSAPP_APP_SECRET),
        cloudApiConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
      },
    });
  });

  // Meta WhatsApp Cloud API Webhook Verification (GET)
  app.get('/api/webhooks/whatsapp', (req, res) => {
    const mode = String(req.query['hub.mode'] || '');
    const token = String(req.query['hub.verify_token'] || '');
    const challenge = String(req.query['hub.challenge'] || '');
    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === 'subscribe' && challenge) {
      if (expectedToken && token !== expectedToken) {
        res.status(403).send('Verification token mismatch.');
        return;
      }
      res.status(200).send(challenge);
      return;
    }
    res.status(400).send('Invalid WhatsApp webhook verification query.');
  });

  // Meta WhatsApp Cloud API Inbound Webhook (POST)
  app.post('/api/webhooks/whatsapp', async (req: AuthRequest, res) => {
    try {
      const appSecret = process.env.WHATSAPP_APP_SECRET;
      if (appSecret) {
        const sigHeader = String(req.headers['x-hub-signature-256'] || '');
        const rawBuf = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
        const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBuf).digest('hex')}`;
        const a = Buffer.from(sigHeader);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
          res.status(401).json({ error: 'Invalid Meta webhook signature.' });
          return;
        }
      }

      const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
      const processed: Array<{ phone: string; complaintCode?: string | null; reply: string }> = [];

      for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const messages = Array.isArray(change?.value?.messages) ? change.value.messages : [];
          for (const msg of messages) {
            const fromPhone = String(msg?.from || '');
            if (!fromPhone) continue;

            let textBody = '';
            let lat: number | undefined;
            let lng: number | undefined;

            if (msg.type === 'text' && msg.text?.body) {
              textBody = String(msg.text.body);
            } else if (msg.type === 'location' && msg.location) {
              lat = Number(msg.location.latitude);
              lng = Number(msg.location.longitude);
              textBody = String(msg.location.address || msg.location.name || `Location pin ${lat}, ${lng}`);
            } else if (msg.type === 'interactive') {
              textBody = String(
                msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || ''
              );
            } else if (msg.image?.caption) {
              textBody = String(msg.image.caption);
            }

            if (!textBody.trim()) continue;
            const turn = await processInboundWhatsappTurn({
              phone: fromPhone,
              message: textBody,
              channelMode: 'meta_webhook',
              latitude: lat,
              longitude: lng,
            });
            processed.push({
              phone: normalizePhoneNumber(fromPhone),
              complaintCode: turn.createdIssue?.complaintCode || turn.linkedIssue?.complaintCode || null,
              reply: turn.reply,
            });
          }
        }
      }

      res.status(200).json({ ok: true, processedCount: processed.length, processed });
    } catch (error: any) {
      console.error('Meta WhatsApp webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed.' });
    }
  });

  // Vite Dev Middleware or Production Static Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Civil Setu server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Civil Setu server:', err);
  process.exit(1);
});
