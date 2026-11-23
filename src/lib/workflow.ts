import {
  ISSUE_STATUSES,
  LOCATION_STATUSES,
  type IssueStatus,
  type LocationStatus,
  type UserAccount,
  type UserRole,
} from './types';

export type IssueAction =
  | 'view'
  | 'manual_route'
  | 'accept_assignment'
  | 'reject_assignment'
  | 'assign_officer'
  | 'start_inspection'
  | 'start_work'
  | 'mark_resolved'
  | 'citizen_verify_close'
  | 'citizen_reopen'
  | 'escalate'
  | 'edit_classification';

const VALID_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  Submitted: ['Under Review', 'Assigned to Department'],
  'Under Review': ['Assigned to Department'],
  'Assigned to Department': ['Accepted by Department', 'Under Review'],
  'Accepted by Department': ['Field Inspection', 'Work in Progress'],
  'Field Inspection': ['Work in Progress', 'Resolved'],
  'Work in Progress': ['Resolved'],
  Resolved: ['Citizen Verification', 'Closed', 'Reopened'],
  'Citizen Verification': ['Closed', 'Reopened'],
  Closed: [],
  Reopened: ['Assigned to Department', 'Accepted by Department', 'Field Inspection', 'Work in Progress'],
};

export function isValidStatusTransition(from: IssueStatus, to: IssueStatus): boolean {
  if (!ISSUE_STATUSES.includes(from) || !ISSUE_STATUSES.includes(to)) return false;
  return VALID_TRANSITIONS[from].includes(to);
}

export function canUserAccessIssue(
  user: Pick<UserAccount, 'id' | 'role' | 'stateId' | 'districtId' | 'municipalityId' | 'departmentId'>,
  issue: {
    reporterId: string;
    stateId: string;
    districtId: string;
    municipalityId: string;
    departmentId?: string | null;
    fieldOfficerId?: string | null;
  },
  userFieldOfficerId?: string | null
): boolean {
  switch (user.role) {
    case 'company_admin':
    case 'state_admin':
      return !user.stateId || issue.stateId === user.stateId;
    case 'district_admin':
      return !!user.districtId && issue.districtId === user.districtId;
    case 'municipality_admin':
      return !!user.municipalityId && issue.municipalityId === user.municipalityId;
    case 'department_admin':
      return (
        !!user.departmentId &&
        issue.departmentId === user.departmentId &&
        (!user.municipalityId || issue.municipalityId === user.municipalityId)
      );
    case 'field_officer':
      return !!userFieldOfficerId && issue.fieldOfficerId === userFieldOfficerId;
    case 'citizen':
      return issue.reporterId === user.id;
    default:
      return false;
  }
}

export function canPerformIssueAction(params: {
  user: Pick<UserAccount, 'id' | 'role' | 'municipalityId' | 'departmentId' | 'districtId' | 'stateId'>;
  issue: {
    reporterId: string;
    stateId: string;
    districtId: string;
    municipalityId: string;
    departmentId?: string | null;
    fieldOfficerId?: string | null;
    status: IssueStatus;
  };
  action: IssueAction;
  userFieldOfficerId?: string | null;
}): { allowed: boolean; reason?: string } {
  const { user, issue, action, userFieldOfficerId } = params;

  if (!canUserAccessIssue(user, issue, userFieldOfficerId)) {
    return { allowed: false, reason: 'Outside user jurisdiction or record ownership.' };
  }

  // Municipality admins can monitor and escalate, but CANNOT mutate or close department repair records
  if (user.role === 'municipality_admin') {
    if (action === 'view' || action === 'escalate') {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: 'Municipality administrators can monitor and escalate complaints, but cannot alter or close department repair records.',
    };
  }

  const rolePermissions: Record<UserRole, IssueAction[]> = {
    company_admin: ['view', 'manual_route', 'edit_classification', 'escalate'],
    state_admin: ['view', 'manual_route', 'edit_classification', 'escalate'],
    district_admin: ['view', 'manual_route', 'edit_classification', 'escalate'],
    municipality_admin: ['view', 'escalate'],
    department_admin: [
      'view',
      'accept_assignment',
      'reject_assignment',
      'assign_officer',
      'start_inspection',
      'start_work',
      'mark_resolved',
    ],
    field_officer: ['view', 'start_inspection', 'start_work', 'mark_resolved'],
    citizen: ['view', 'citizen_verify_close', 'citizen_reopen'],
  };

  if (!rolePermissions[user.role].includes(action)) {
    return { allowed: false, reason: `Role "${user.role}" is not permitted to perform "${action}".` };
  }

  if (action === 'citizen_verify_close' || action === 'citizen_reopen') {
    if (issue.status !== 'Resolved' && issue.status !== 'Citizen Verification') {
      return { allowed: false, reason: 'Citizen verification is only available after the department marks the issue Resolved.' };
    }
  }

  return { allowed: true };
}

export function canCreateDistrict(user: Pick<UserAccount, 'role'>): boolean {
  return ['company_admin', 'state_admin', 'district_admin'].includes(user.role);
}

export function canCreatePlace(user: Pick<UserAccount, 'role'>): boolean {
  return ['company_admin', 'state_admin', 'district_admin', 'municipality_admin'].includes(user.role);
}

export function isValidLocationStatus(status: string): status is LocationStatus {
  return (LOCATION_STATUSES as readonly string[]).includes(status);
}

export function canUpdateDistrictStatus(user: Pick<UserAccount, 'role'>): boolean {
  return canCreateDistrict(user);
}

export function canUpdatePlaceStatus(user: Pick<UserAccount, 'role'>): boolean {
  return canCreatePlace(user);
}

export function canManageFieldOfficers(user: Pick<UserAccount, 'role'>): boolean {
  return ['company_admin', 'state_admin', 'district_admin', 'municipality_admin'].includes(user.role);
}

