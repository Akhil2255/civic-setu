export type UserRole =
  | 'company_admin'
  | 'citizen'
  | 'state_admin'
  | 'district_admin'
  | 'municipality_admin'
  | 'department_admin'
  | 'field_officer';

export type PortalGroup =
  | 'company'
  | 'citizen'
  | 'government'
  | 'municipality'
  | 'department';

export const ISSUE_STATUSES = [
  'Submitted',
  'Under Review',
  'Assigned to Department',
  'Accepted by Department',
  'Field Inspection',
  'Work in Progress',
  'Resolved',
  'Citizen Verification',
  'Closed',
  'Reopened',
] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export type IssueSeverity = 'Low' | 'Medium' | 'High' | 'Critical';

export const DEFAULT_ISSUE_CATEGORIES = [
  'Potholes',
  'Damaged roads',
  'Broken streetlights',
  'Water leakage',
  'Blocked drainage',
  'Waste management',
  'Damaged public infrastructure',
  'Unsafe road excavation',
  'Abandoned construction materials',
  'Other public infrastructure problems',
] as const;

export type RoadPassportStatus =
  | 'Planned'
  | 'Excavation Active'
  | 'Restoration Pending'
  | 'Completed'
  | 'Overdue'
  | 'Flagged';

export interface UserAccount {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: UserRole;
  stateId?: string | null;
  districtId?: string | null;
  municipalityId?: string | null;
  departmentId?: string | null;
  isActive: boolean;
  isDemo: boolean;
  createdAt: string;
}

export const LOCATION_STATUSES = ['Active', 'Pending Approval', 'Archived'] as const;

export type LocationStatus = (typeof LOCATION_STATUSES)[number];

export interface StateRecord {
  id: string;
  name: string;
  code: string;
}

export interface DistrictRecord {
  id: string;
  stateId: string;
  name: string;
  status: LocationStatus;
}

export interface MunicipalityRecord {
  id: string;
  districtId: string;
  stateId: string;
  name: string;
  type: 'Municipality' | 'Corporation' | 'Grama Panchayat' | 'Township' | 'Ward / Zone';
  status: LocationStatus;
  centerLat: number;
  centerLng: number;
}

export interface DepartmentRecord {
  id: string;
  name: string;
  code: string;
  description: string;
}

export interface DepartmentJurisdiction {
  id: string;
  departmentId: string;
  departmentName?: string;
  municipalityId: string;
  municipalityName?: string;
  handledCategories: string[];
  slaHours: number;
}

export interface IssueCategoryConfig {
  id: string;
  name: string;
  defaultDepartmentCode: string;
  slaHours: number;
  description: string;
  isActive: boolean;
}

export const DESIGNATED_FIELD_ROLES: Array<{ departmentCode: string; roles: string[] }> = [
  {
    departmentCode: 'PWD',
    roles: [
      'Assistant Engineer (Roads)',
      'Junior Engineer (Civil & Highways)',
      'Road Safety & Asphalt Inspector',
    ],
  },
  {
    departmentCode: 'ELEC',
    roles: [
      'Sub-Engineer (Street Lighting)',
      'Line Inspector (Electrical Safety)',
      'High-Mast & Feeder Technician',
    ],
  },
  {
    departmentCode: 'WATER',
    roles: [
      'Pipeline Inspection Officer',
      'Water Distribution Technician',
      'Valve & Main Maintenance Engineer',
    ],
  },
  {
    departmentCode: 'DRAIN',
    roles: [
      'Drainage Maintenance Supervisor',
      'Stormwater Culvert Inspector',
      'Flood Desilting Field Officer',
    ],
  },
  {
    departmentCode: 'WASTE',
    roles: [
      'Sanitation Field Inspector',
      'Waste Collection Supervisor',
      'Solid Waste Compliance Officer',
    ],
  },
  {
    departmentCode: 'MUNI_ENG',
    roles: [
      'Municipal Works Supervisor',
      'Civic Infrastructure Inspector',
      'Footpath & Public Asset Engineer',
    ],
  },
];

export interface FieldOfficerRecord {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  departmentId: string;
  departmentName: string;
  municipalityId: string;
  municipalityName: string;
  designation: string;
  activeCount?: number;
  isActive?: boolean;
}

export interface IssueEvidence {
  id: string;
  issueId: string;
  uploaderId: string;
  uploaderName?: string;
  evidenceType: 'citizen_initial' | 'inspection' | 'before_repair' | 'after_repair' | 'reopen_proof';
  mediaUrl: string;
  mediaKind: 'image' | 'video';
  caption: string;
  createdAt: string;
}

export interface StatusHistoryEntry {
  id: string;
  issueId: string;
  fromStatus: IssueStatus | null;
  toStatus: IssueStatus;
  changedByUserId: string;
  changedByName: string;
  changedByRole: UserRole;
  note: string;
  createdAt: string;
}

export interface AssignmentRecord {
  id: string;
  issueId: string;
  departmentId: string;
  departmentName: string;
  fieldOfficerId?: string | null;
  fieldOfficerName?: string | null;
  assignedByUserId: string;
  acceptedAt?: string | null;
  rejectedReason?: string | null;
  inspectionNotes?: string | null;
  completionNotes?: string | null;
  escalatedAt?: string | null;
  escalationReason?: string | null;
  createdAt: string;
}

export interface RepairVerification {
  id: string;
  issueId: string;
  citizenId: string;
  citizenName?: string;
  decision: 'confirmed' | 'reopened';
  feedback: string;
  createdAt: string;
}

export interface CivicIssue {
  id: string;
  complaintCode: string;
  reporterId: string;
  reporterName: string;
  title: string;
  description: string;
  category: string;
  aiSuggestedCategory?: string | null;
  aiConfidence?: number | null;
  aiSummary?: string | null;
  aiReasoning?: string | null;
  severity: IssueSeverity;
  status: IssueStatus;
  routingStatus: 'auto_assigned' | 'manual_review' | 'reassigned';
  stateId: string;
  stateName: string;
  districtId: string;
  districtName: string;
  municipalityId: string;
  municipalityName: string;
  departmentId?: string | null;
  departmentName?: string | null;
  fieldOfficerId?: string | null;
  fieldOfficerName?: string | null;
  assetId?: string | null;
  roadPassportId?: string | null;
  addressText: string;
  latitude: number;
  longitude: number;
  isOverdue: boolean;
  isEscalated: boolean;
  escalationCount: number;
  duplicateOfCode?: string | null;
  channel?: 'web' | 'whatsapp';
  reporterPhone?: string | null;
  dueAt: string;
  createdAt: string;
  updatedAt: string;
  evidence?: IssueEvidence[];
  history?: StatusHistoryEntry[];
  assignment?: AssignmentRecord | null;
  verifications?: RepairVerification[];
}

export interface WhatsappMessageRecord {
  id: string;
  sessionId: string;
  phoneNumber: string;
  direction: 'inbound' | 'outbound';
  body: string;
  mediaUrl?: string | null;
  linkedComplaintCode?: string | null;
  channelMode: 'web_simulator' | 'meta_webhook';
  createdAt: string;
}

export interface WhatsappSessionDraft {
  title?: string;
  description?: string;
  suggestedCategory?: string;
  municipalityId?: string;
  municipalityName?: string;
  addressText?: string;
  latitude?: number;
  longitude?: number;
  photoDataUrl?: string;
}

export interface WhatsappSessionRecord {
  id: string;
  phoneNumber: string;
  citizenUserId?: string | null;
  draft: WhatsappSessionDraft | null;
  lastComplaintCode?: string | null;
  updatedAt: string;
}

export interface RoadPassport {
  id: string;
  passportCode: string;
  assetId: string;
  assetName: string;
  linkedIssueId?: string | null;
  linkedComplaintCode?: string | null;
  municipalityId: string;
  municipalityName: string;
  districtName: string;
  departmentId: string;
  departmentName: string;
  purpose: string;
  workStartDate: string;
  expectedCompletionDate: string;
  actualCompletionDate?: string | null;
  beforePhotoUrl: string;
  afterPhotoUrl?: string | null;
  workStatus: RoadPassportStatus;
  inspectionResult: string;
  citizenVerificationStatus: 'Pending' | 'Verified' | 'Disputed';
  repeatDigCount: number;
  aiComparisonScore?: number | null;
  aiComparisonSummary?: string | null;
  flaggedForInspection: boolean;
  latitude: number;
  longitude: number;
  history: Array<{ timestamp: string; actor: string; note: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  issueId?: string | null;
  complaintCode?: string | null;
  title: string;
  message: string;
  eventType: string;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}

export interface AiIssueAnalysis {
  suggestedCategory: string;
  severity: IssueSeverity;
  confidence: number;
  summary: string;
  reasoning: string;
  source: 'gemini' | 'heuristic';
}
