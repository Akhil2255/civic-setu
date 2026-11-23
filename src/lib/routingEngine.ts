import type {
  DepartmentJurisdiction,
  IssueCategoryConfig,
  IssueSeverity,
  RoadPassport,
} from './types';

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'near', 'in', 'on', 'at', 'of', 'to', 'and', 'is', 'are', 'for', 'with', 'this', 'that', 'road',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

export function textSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : Number((intersection / union).toFixed(2));
}

export function classifyIssueHeuristically(input: {
  title: string;
  description: string;
  selectedCategory?: string;
}): {
  category: string;
  severity: IssueSeverity;
  confidence: number;
  summary: string;
  reasoning: string;
} {
  const text = `${input.title} ${input.description}`.toLowerCase();

  let category = input.selectedCategory?.trim() || 'Other public infrastructure problems';
  let confidence = input.selectedCategory ? 0.82 : 0.45;
  let reasoning = 'Matched via configurable issue keyword rules.';

  const keywordRules: Array<{ match: RegExp; category: string; conf: number; note: string }> = [
    { match: /pothole|crater|tarmac hole|road crater/i, category: 'Potholes', conf: 0.94, note: 'Detected pothole and pavement failure indicators.' },
    { match: /streetlight|street light|lamp post|dark street|bulb/i, category: 'Broken streetlights', conf: 0.93, note: 'Detected street illumination / electrical fixture fault.' },
    { match: /water leak|pipe burst|water main|drinking water|pipeline leak/i, category: 'Water leakage', conf: 0.92, note: 'Detected potable water pipeline leakage terminology.' },
    { match: /drain|drainage|culvert|clogged|waterlog|sewer|stormwater/i, category: 'Blocked drainage', conf: 0.9, note: 'Detected stormwater / culvert obstruction indicators.' },
    { match: /garbage|waste|trash|dump|sanitation|bin overflow/i, category: 'Waste management', conf: 0.91, note: 'Detected solid waste accumulation terminology.' },
    { match: /excavat|trench|dug up|barricade|digging/i, category: 'Unsafe road excavation', conf: 0.89, note: 'Detected unbarricaded or active road excavation hazards.' },
    { match: /debris|sand pile|gravel|abandoned material|construction material/i, category: 'Abandoned construction materials', conf: 0.87, note: 'Detected leftover construction material obstruction.' },
    { match: /damaged road|resurfacing|crack|asphalt|cave-in|collapsed road/i, category: 'Damaged roads', conf: 0.86, note: 'Detected structural road surface degradation.' },
    { match: /bus shelter|footpath|railing|public building|park bench|bridge/i, category: 'Damaged public infrastructure', conf: 0.84, note: 'Detected civic structure / footpath damage.' },
  ];

  for (const rule of keywordRules) {
    if (rule.match.test(text)) {
      category = rule.category;
      confidence = rule.conf;
      reasoning = rule.note;
      break;
    }
  }

  let severity: IssueSeverity = 'Medium';
  if (/school|hospital|accident|live wire|collapse|critical|emergency|deep|flood/i.test(text)) {
    severity = 'Critical';
  } else if (/major|urgent|blocked|burst|unsafe|broken|heavy traffic/i.test(text)) {
    severity = 'High';
  } else if (/minor|small|cosmetic|paint/i.test(text)) {
    severity = 'Low';
  }

  const summary = input.title.trim()
    ? `${category} reported: ${input.title.trim()} (${severity} priority).`
    : `${category} issue requiring civic field verification.`;

  return { category, severity, confidence, summary, reasoning };
}

export interface RoutingDecision {
  routingStatus: 'auto_assigned' | 'manual_review';
  departmentId: string | null;
  departmentName: string | null;
  slaHours: number;
  reason: string;
}

export function routeIssueToDepartment(params: {
  category: string;
  confidence: number;
  municipalityId: string;
  jurisdictions: DepartmentJurisdiction[];
  categoryConfigs: IssueCategoryConfig[];
}): RoutingDecision {
  const { category, confidence, municipalityId, jurisdictions, categoryConfigs } = params;

  if (confidence < 0.55 || category === 'Other public infrastructure problems') {
    return {
      routingStatus: 'manual_review',
      departmentId: null,
      departmentName: null,
      slaHours: 72,
      reason:
        confidence < 0.55
          ? 'Classification confidence below 55% threshold; queued for manual review.'
          : 'Unclassified general category; queued for manual jurisdictional review.',
    };
  }

  const matchedJurisdiction = jurisdictions.find(
    (j) =>
      j.municipalityId === municipalityId &&
      j.handledCategories.some((c) => c.toLowerCase() === category.toLowerCase())
  );

  if (!matchedJurisdiction) {
    return {
      routingStatus: 'manual_review',
      departmentId: null,
      departmentName: null,
      slaHours: 72,
      reason: `No active department jurisdiction configured for "${category}" in selected municipality.`,
    };
  }

  const catConfig = categoryConfigs.find(
    (c) => c.name.toLowerCase() === category.toLowerCase()
  );

  return {
    routingStatus: 'auto_assigned',
    departmentId: matchedJurisdiction.departmentId,
    departmentName: matchedJurisdiction.departmentName ?? null,
    slaHours: matchedJurisdiction.slaHours || catConfig?.slaHours || 48,
    reason: `Matched "${category}" ownership rule in municipality jurisdiction.`,
  };
}

export interface DuplicateCandidate {
  id: string;
  complaintCode: string;
  title: string;
  category: string;
  status: string;
  distanceMeters: number;
  similarityScore: number;
}

export function detectDuplicateIssues(params: {
  title: string;
  description: string;
  category: string;
  latitude: number;
  longitude: number;
  existingIssues: Array<{
    id: string;
    complaintCode: string;
    title: string;
    description: string;
    category: string;
    status: string;
    latitude: number;
    longitude: number;
  }>;
}): DuplicateCandidate[] {
  const sourceText = `${params.title} ${params.description}`;
  const matches: DuplicateCandidate[] = [];

  for (const issue of params.existingIssues) {
    if (issue.status === 'Closed') continue;
    const distance = haversineMeters(params.latitude, params.longitude, issue.latitude, issue.longitude);
    if (distance > 300) continue;

    const similarity = textSimilarity(sourceText, `${issue.title} ${issue.description}`);
    const sameCategory = issue.category.toLowerCase() === params.category.toLowerCase();

    if ((sameCategory && distance <= 150) || (distance <= 250 && similarity >= 0.25)) {
      matches.push({
        id: issue.id,
        complaintCode: issue.complaintCode,
        title: issue.title,
        category: issue.category,
        status: issue.status,
        distanceMeters: distance,
        similarityScore: similarity,
      });
    }
  }

  return matches.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

export function detectRepeatRoadExcavations(params: {
  latitude: number;
  longitude: number;
  existingPassports: RoadPassport[];
}): { isRepeatZone: boolean; nearbyPassports: RoadPassport[]; totalPriorExcavations: number } {
  const nearby = params.existingPassports.filter(
    (p) => haversineMeters(params.latitude, params.longitude, p.latitude, p.longitude) <= 180
  );
  const totalPriorExcavations = nearby.reduce((acc, p) => acc + Math.max(1, p.repeatDigCount), 0);
  return {
    isRepeatZone: nearby.length > 0,
    nearbyPassports: nearby,
    totalPriorExcavations,
  };
}
