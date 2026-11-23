import { classifyIssueHeuristically, haversineMeters } from './routingEngine.ts';
import type { IssueSeverity, MunicipalityRecord, WhatsappSessionDraft } from './types.ts';

export type WhatsappBotIntent =
  | 'greeting_help'
  | 'track_status'
  | 'verify_issue'
  | 'report_issue';

export interface WhatsappParsedTurn {
  intent: WhatsappBotIntent;
  complaintCode: string | null;
  verifyDecision?: 'confirmed' | 'reopened';
  verifyFeedback?: string;
  title: string;
  description: string;
  suggestedCategory: string;
  severity: IssueSeverity;
  confidence: number;
  matchedMunicipality: MunicipalityRecord | null;
  addressHint: string;
  missingFields: Array<'municipality' | 'description'>;
}

const COMPLAINT_CODE_REGEX = /\b(PWD-\d{4}-\d{4,6})\b/i;

export function normalizePhoneNumber(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '+919847020001';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (digits.length >= 7 && digits.length <= 15) {
    return `+${digits}`;
  }
  return '+919847020001';
}

export function formatPhoneDisplay(normalized: string): string {
  if (normalized.startsWith('+91') && normalized.length === 13) {
    return `+91 ${normalized.slice(3, 8)} ${normalized.slice(8)}`;
  }
  return normalized;
}

export function matchNearestActiveMunicipality(
  latitude: number,
  longitude: number,
  municipalities: MunicipalityRecord[]
): MunicipalityRecord | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const active = municipalities.filter((m) => !m.status || m.status === 'Active');
  if (active.length === 0) return null;

  let best = active[0];
  let bestDist = haversineMeters(latitude, longitude, best.centerLat, best.centerLng);
  for (let i = 1; i < active.length; i += 1) {
    const candidate = active[i];
    const dist = haversineMeters(latitude, longitude, candidate.centerLat, candidate.centerLng);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

export function matchMunicipalityFromText(
  text: string,
  municipalities: MunicipalityRecord[]
): MunicipalityRecord | null {
  const active = municipalities.filter((m) => !m.status || m.status === 'Active');
  if (!text.trim() || active.length === 0) return null;

  const lower = text.toLowerCase();

  // 1. Exact full name match (longest names first to avoid partial shadowing)
  const sorted = [...active].sort((a, b) => b.name.length - a.name.length);
  for (const m of sorted) {
    if (lower.includes(m.name.toLowerCase())) {
      return m;
    }
  }

  // 2. Match base town token (e.g., "Kochi Corporation" -> "kochi", "Kozhikode Corporation" -> "kozhikode")
  const stopWords = new Set(['municipality', 'corporation', 'grama', 'panchayat', 'township', 'ward', 'zone']);
  for (const m of sorted) {
    const tokens = m.name
      .toLowerCase()
      .split(/[\s,/()-]+/)
      .filter((t) => t.length >= 4 && !stopWords.has(t));
    for (const token of tokens) {
      const tokenPattern = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (tokenPattern.test(lower)) {
        return m;
      }
    }
  }

  return null;
}

function buildCleanIssueTitle(text: string, category: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return `${category} reported via WhatsApp`;
  const firstClause = cleaned.split(/[.!?\n]/)[0].trim();
  if (firstClause.length >= 8 && firstClause.length <= 85) {
    return firstClause.charAt(0).toUpperCase() + firstClause.slice(1);
  }
  if (firstClause.length > 85) {
    return `${firstClause.slice(0, 82).trim()}...`;
  }
  return `${category}: ${cleaned.slice(0, 72)}`;
}

export function parseWhatsappIntent(params: {
  message: string;
  municipalities: MunicipalityRecord[];
  draft?: WhatsappSessionDraft | null;
  explicitMunicipalityId?: string | null;
  latitude?: number;
  longitude?: number;
}): WhatsappParsedTurn {
  const raw = String(params.message || '').trim();
  const lower = raw.toLowerCase();
  const codeMatch = raw.match(COMPLAINT_CODE_REGEX);
  const complaintCode = codeMatch ? codeMatch[1].toUpperCase() : null;

  const explicitMuni = params.explicitMunicipalityId
    ? params.municipalities.find(
        (m) => m.id === params.explicitMunicipalityId && (!m.status || m.status === 'Active')
      ) || null
    : null;
  const textMuni = matchMunicipalityFromText(raw, params.municipalities);
  const draftMuni = params.draft?.municipalityId
    ? params.municipalities.find(
        (m) => m.id === params.draft!.municipalityId && (!m.status || m.status === 'Active')
      ) || null
    : null;
  const geoMuni =
    typeof params.latitude === 'number' && typeof params.longitude === 'number'
      ? matchNearestActiveMunicipality(params.latitude, params.longitude, params.municipalities)
      : null;
  const matchedMunicipality = explicitMuni || textMuni || draftMuni || geoMuni;

  // 1. Greeting / Help menu
  if (
    !complaintCode &&
    !params.draft?.description &&
    /^(hi|hello|hey|namaste|help|menu|start|commands|\?)[!.\s]*$/i.test(raw)
  ) {
    return {
      intent: 'greeting_help',
      complaintCode: null,
      title: '',
      description: '',
      suggestedCategory: 'Other public infrastructure problems',
      severity: 'Low',
      confidence: 1,
      matchedMunicipality,
      addressHint: '',
      missingFields: [],
    };
  }

  // 2. Citizen verification / reopen via WhatsApp
  if (
    complaintCode &&
    (/\b(verify|confirm|closed?|fixed|done|ok|reopen|incomplete|still\s+broken|not\s+fixed|dispute)\b/i.test(lower))
  ) {
    const isReopen = /\b(reopen|incomplete|still\s+broken|not\s+fixed|dispute|bad|failed)\b/i.test(lower);
    const cleanedFeedback = raw
      .replace(COMPLAINT_CODE_REGEX, '')
      .replace(/\b(verify|confirm|reopen)\b/gi, '')
      .trim();
    return {
      intent: 'verify_issue',
      complaintCode,
      verifyDecision: isReopen ? 'reopened' : 'confirmed',
      verifyFeedback:
        cleanedFeedback ||
        (isReopen
          ? 'Citizen reopened complaint via WhatsApp bot: issue still unresolved.'
          : 'Citizen confirmed repair resolution via WhatsApp bot.'),
      title: '',
      description: raw,
      suggestedCategory: 'Other public infrastructure problems',
      severity: 'Medium',
      confidence: 1,
      matchedMunicipality,
      addressHint: '',
      missingFields: [],
    };
  }

  // 3. Track complaint status via WhatsApp
  if (
    complaintCode &&
    (raw.length < 48 || /\b(track|status|check|update|where|progress)\b/i.test(lower))
  ) {
    return {
      intent: 'track_status',
      complaintCode,
      title: '',
      description: raw,
      suggestedCategory: 'Other public infrastructure problems',
      severity: 'Low',
      confidence: 1,
      matchedMunicipality,
      addressHint: '',
      missingFields: [],
    };
  }

  // 4. Report civic issue (new or continuing multi-turn draft)
  const combinedDescription =
    params.draft?.description && textMuni && raw.length <= 45
      ? `${params.draft.description} (Location: ${raw})`
      : params.draft?.description && raw && params.draft.description !== raw
        ? `${params.draft.description}. ${raw}`
        : raw || params.draft?.description || '';

  const heuristic = classifyIssueHeuristically({
    title: combinedDescription,
    description: combinedDescription,
  });

  const missingFields: Array<'municipality' | 'description'> = [];
  if (!combinedDescription || combinedDescription.trim().length < 8 || (textMuni && raw.trim().toLowerCase() === textMuni.name.toLowerCase() && !params.draft?.description)) {
    missingFields.push('description');
  }
  if (!matchedMunicipality) {
    missingFields.push('municipality');
  }

  const title =
    params.draft?.title && textMuni && raw.length <= 45
      ? params.draft.title
      : buildCleanIssueTitle(combinedDescription, heuristic.category);

  const addressHint = matchedMunicipality
    ? `${combinedDescription.slice(0, 70)} — ${matchedMunicipality.name}`
    : combinedDescription.slice(0, 90);

  return {
    intent: 'report_issue',
    complaintCode: null,
    title,
    description: combinedDescription,
    suggestedCategory: heuristic.category,
    severity: heuristic.severity,
    confidence: heuristic.confidence,
    matchedMunicipality,
    addressHint,
    missingFields,
  };
}

export function formatWhatsappConfirmationReply(params: {
  complaintCode: string;
  title: string;
  category: string;
  severity: string;
  municipalityName: string;
  departmentName: string | null;
  slaHours: number;
  hasRoadPassport: boolean;
  duplicateCode?: string | null;
  addressText?: string | null;
  latitude?: number;
  longitude?: number;
}): string {
  const lines = [
    `Complaint Registered on Civil Setu`,
    `ID: ${params.complaintCode}`,
    `Issue: ${params.title}`,
    `Category: ${params.category} (${params.severity} priority)`,
    `Location: ${params.addressText || params.municipalityName}`,
    `Municipality: ${params.municipalityName}`,
    `Routed To Authority: ${params.departmentName || 'Manual Review Queue'} (SLA: ${params.slaHours}h)`,
  ];
  if (typeof params.latitude === 'number' && typeof params.longitude === 'number') {
    lines.push(
      `GPS Coordinates Automatically Sent: ${params.latitude.toFixed(5)}, ${params.longitude.toFixed(5)}`
    );
  }
  if (params.hasRoadPassport) {
    lines.push(`Road Passport: Digital road work record created & linked.`);
  }
  if (params.duplicateCode) {
    lines.push(`Nearby Alert: Similar active ticket ${params.duplicateCode} detected nearby.`);
  }
  lines.push(
    `Reply "Status ${params.complaintCode}" anytime for live updates, or "Verify ${params.complaintCode} confirm" once fixed.`
  );
  return lines.join('\n');
}
