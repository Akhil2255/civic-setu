import type {
  AiIssueAnalysis,
  AuditLogEntry,
  CivicIssue,
  DepartmentJurisdiction,
  DepartmentRecord,
  DistrictRecord,
  FieldOfficerRecord,
  IssueCategoryConfig,
  LocationStatus,
  MunicipalityRecord,
  NotificationRecord,
  RoadPassport,
  StateRecord,
  UserAccount,
} from './types';

// In-memory session token (never persisted in localStorage/sessionStorage)
let sessionToken: string | null = null;

export function setAuthToken(token: string | null) {
  sessionToken = token;
}

export function getAuthToken(): string | null {
  return sessionToken;
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'PWDConnect',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface TaxonomyData {
  states: StateRecord[];
  districts: DistrictRecord[];
  municipalities: MunicipalityRecord[];
  departments: DepartmentRecord[];
  categories: IssueCategoryConfig[];
}

export interface PublicStats {
  isDemoData: boolean;
  regionLabel: string;
  totalComplaints: number;
  resolvedComplaints: number;
  activeComplaints: number;
  overdueComplaints: number;
  roadPassportsIssued: number;
  participatingMunicipalities: number;
  participatingDepartments: number;
  avgResolutionHours: number;
}

export interface AnalyticsData {
  summary: {
    total: number;
    pending: number;
    resolved: number;
    overdue: number;
    escalated: number;
    avgResolutionHours: number;
    resolutionRate: number;
  };
  byCategory: Array<{ category: string; count: number }>;
  byMunicipality: Array<{ id: string; name: string; total: number; resolved: number; overdue: number }>;
  byDepartment: Array<{ id: string; name: string; total: number; resolved: number; overdue: number; avgResponseHours: number }>;
  byDistrict: Array<{ name: string; total: number; resolved: number }>;
}

export const api = {
  getTaxonomy: () => apiFetch<TaxonomyData>('/api/meta/taxonomy'),
  getPublicStats: () => apiFetch<PublicStats>('/api/public/stats'),
  trackComplaint: (code: string) =>
    apiFetch<{ issue: CivicIssue; history: any[]; evidence: any[]; roadPassport: RoadPassport | null }>(
      `/api/public/track/${encodeURIComponent(code)}`
    ),

  login: (payload: { email: string; password: string; expectedPortal?: string }) =>
    apiFetch<{ token: string; user: UserAccount; fieldOfficerId: string | null }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  registerCitizen: (payload: { email: string; password: string; fullName: string; phone?: string; municipalityId?: string }) =>
    apiFetch<{ token: string; user: UserAccount; fieldOfficerId: string | null }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  firebaseExchange: (payload: { uid: string; email: string; fullName: string }) =>
    apiFetch<{ token: string; user: UserAccount; fieldOfficerId: string | null }>('/api/auth/firebase-exchange', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  analyzeIssue: (payload: {
    title: string;
    description: string;
    selectedCategory?: string;
    municipalityId?: string;
    latitude?: number;
    longitude?: number;
    imageBase64?: string;
    mimeType?: string;
  }) =>
    apiFetch<{
      analysis: AiIssueAnalysis;
      routing: { routingStatus: string; departmentId: string | null; departmentName: string | null; slaHours: number; reason: string } | null;
      duplicates: Array<{ id: string; complaintCode: string; title: string; category: string; status: string; distanceMeters: number }>;
      repeatExcavation: {
        isRepeatZone: boolean;
        totalPriorExcavations: number;
        nearbyPassports: Array<{ passportCode: string; assetName: string; workStatus: string; repeatDigCount: number }>;
      };
    }>('/api/ai/analyze-issue', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getIssues: (filters?: Record<string, string>) => {
    const params = new URLSearchParams();
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        if (v) params.set(k, v);
      }
    }
    const qs = params.toString();
    return apiFetch<{ issues: CivicIssue[] }>(`/api/issues${qs ? `?${qs}` : ''}`);
  },

  getIssueDetail: (id: string) =>
    apiFetch<{ issue: CivicIssue; roadPassport: RoadPassport | null }>(`/api/issues/${encodeURIComponent(id)}`),

  createIssue: (payload: {
    title: string;
    description: string;
    category?: string;
    municipalityId: string;
    addressText: string;
    latitude: number;
    longitude: number;
    photoDataUrl?: string;
    videoName?: string;
  }) =>
    apiFetch<{ issue: CivicIssue; routing: any; duplicates: any[] }>('/api/issues', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateClassification: (id: string, payload: { category: string; severity: string; departmentId: string; note?: string }) =>
    apiFetch<{ issue: CivicIssue }>(`/api/issues/${id}/classification`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  acceptIssue: (id: string, note?: string) =>
    apiFetch<{ issue: CivicIssue }>(`/api/issues/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  rejectIssue: (id: string, reason: string) =>
    apiFetch<{ issue: CivicIssue }>(`/api/issues/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  assignFieldOfficer: (id: string, fieldOfficerId: string) =>
    apiFetch<{ issue: CivicIssue }>(`/api/issues/${id}/assign-officer`, {
      method: 'POST',
      body: JSON.stringify({ fieldOfficerId }),
    }),

  updateIssueStatus: (id: string, payload: { nextStatus: string; note: string; photoDataUrl?: string; evidenceType?: string }) =>
    apiFetch<{ issue: CivicIssue }>(`/api/issues/${id}/status`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyIssue: (id: string, payload: { decision: 'confirmed' | 'reopened'; feedback: string }) =>
    apiFetch<{ issue: CivicIssue }>(`/api/issues/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  escalateIssue: (id: string, reason: string) =>
    apiFetch<{ issue: CivicIssue }>(`/api/issues/${id}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  getRoadPassports: () => apiFetch<{ passports: RoadPassport[] }>('/api/road-passports'),

  createRoadPassport: (payload: {
    assetName: string;
    municipalityId: string;
    departmentId: string;
    purpose: string;
    workStartDate: string;
    expectedCompletionDate: string;
    beforePhotoDataUrl?: string;
    latitude?: number;
    longitude?: number;
  }) =>
    apiFetch<{ passport: RoadPassport }>('/api/road-passports', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  compareRoadPassportAi: (id: string, afterPhotoDataUrl?: string) =>
    apiFetch<{ passport: RoadPassport; comparison: { score: number; flaggedForInspection: boolean; summary: string; source: string } }>(
      `/api/road-passports/${id}/compare-ai`,
      {
        method: 'POST',
        body: JSON.stringify({ afterPhotoDataUrl }),
      }
    ),

  getNotifications: () => apiFetch<{ notifications: NotificationRecord[] }>('/api/notifications'),
  markNotificationRead: (id: string) => apiFetch<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => apiFetch<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' }),

  getFieldOfficers: (includeInactive = false) =>
    apiFetch<{ fieldOfficers: FieldOfficerRecord[] }>(
      `/api/field-officers${includeInactive ? '?includeInactive=true' : ''}`
    ),
  createFieldOfficer: (payload: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
    departmentId: string;
    municipalityId: string;
    designation: string;
  }) =>
    apiFetch<{ fieldOfficer: FieldOfficerRecord }>('/api/field-officers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  toggleFieldOfficerActive: (id: string) =>
    apiFetch<{ isActive: boolean }>(`/api/field-officers/${encodeURIComponent(id)}/toggle`, {
      method: 'PATCH',
    }),
  getAnalytics: () => apiFetch<AnalyticsData>('/api/analytics'),
  getAiDashboardSummary: () =>
    apiFetch<{ briefing: string; source: 'gemini' | 'heuristic' }>('/api/ai/dashboard-summary', { method: 'POST' }),

  getAdminOverview: () =>
    apiFetch<{
      users: UserAccount[];
      jurisdictions: DepartmentJurisdiction[];
      categories: IssueCategoryConfig[];
      auditLogs: AuditLogEntry[];
    }>('/api/admin/overview'),

  createAdminUser: (payload: any) =>
    apiFetch<{ user: UserAccount }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  toggleUserActive: (id: string) =>
    apiFetch<{ isActive: boolean }>(`/api/admin/users/${id}/toggle`, { method: 'PATCH' }),

  createDistrict: (payload: { name: string; stateId: string; status?: LocationStatus }) =>
    apiFetch<{ district: DistrictRecord }>('/api/admin/districts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateDistrictStatus: (id: string, status: LocationStatus) =>
    apiFetch<{ district: DistrictRecord }>(`/api/admin/districts/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  createMunicipality: (payload: {
    name: string;
    districtId: string;
    type: string;
    centerLat: number;
    centerLng: number;
    status?: LocationStatus;
  }) =>
    apiFetch<{ id: string; name: string; municipality: MunicipalityRecord }>('/api/admin/municipalities', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMunicipalityStatus: (id: string, status: LocationStatus) =>
    apiFetch<{ municipality: MunicipalityRecord }>(`/api/admin/municipalities/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  assignJurisdiction: (payload: { departmentId: string; municipalityId: string; handledCategories: string[]; slaHours: number }) =>
    apiFetch<{ jurisdictions: DepartmentJurisdiction[] }>('/api/admin/jurisdictions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createCategory: (payload: { name: string; defaultDepartmentCode: string; slaHours: number; description: string }) =>
    apiFetch<{ categories: IssueCategoryConfig[] }>('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getWhatsappSession: (phone?: string) => {
    const qs = phone ? `?phone=${encodeURIComponent(phone)}` : '';
    return apiFetch<{
      session: import('./types').WhatsappSessionRecord | null;
      phoneNumber: string;
      messages: import('./types').WhatsappMessageRecord[];
      cloudApiConfigured: boolean;
    }>(`/api/whatsapp/session${qs}`);
  },

  sendWhatsappMessage: (payload: {
    phone: string;
    message: string;
    municipalityId?: string;
    latitude?: number;
    longitude?: number;
    photoDataUrl?: string;
  }) =>
    apiFetch<{
      session: import('./types').WhatsappSessionRecord;
      messages: import('./types').WhatsappMessageRecord[];
      reply: string;
      createdIssue: CivicIssue | null;
      linkedIssue: CivicIssue | null;
      aiSource: 'gemini' | 'heuristic';
    }>('/api/whatsapp/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getWhatsappIntakeLogs: () =>
    apiFetch<{
      issues: CivicIssue[];
      recentMessages: import('./types').WhatsappMessageRecord[];
      integration: {
        webhookPath: string;
        verifyTokenConfigured: boolean;
        appSecretConfigured: boolean;
        cloudApiConfigured: boolean;
      };
    }>('/api/whatsapp/intake-logs'),
};
