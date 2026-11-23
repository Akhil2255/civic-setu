import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCreateDistrict,
  canCreatePlace,
  canManageFieldOfficers,
  canPerformIssueAction,
  canUpdateDistrictStatus,
  canUpdatePlaceStatus,
  canUserAccessIssue,
  isValidLocationStatus,
  isValidStatusTransition,
} from './workflow';

const baseIssue = {
  reporterId: 'cit-1',
  stateId: 'st-kl',
  districtId: 'dist-ekm',
  municipalityId: 'mun-mlt',
  departmentId: 'dept-pwd',
  fieldOfficerId: 'fo-1',
  status: 'Work in Progress' as const,
};

test('10-step workflow validates allowed transitions and blocks illegal jumps', () => {
  assert.equal(isValidStatusTransition('Submitted', 'Assigned to Department'), true);
  assert.equal(isValidStatusTransition('Work in Progress', 'Resolved'), true);
  assert.equal(isValidStatusTransition('Closed', 'Work in Progress'), false);
  assert.equal(isValidStatusTransition('Submitted', 'Closed'), false);
});

test('Citizen access is strictly scoped to own complaints', () => {
  assert.equal(
    canUserAccessIssue({ id: 'cit-1', role: 'citizen' }, baseIssue),
    true
  );
  assert.equal(
    canUserAccessIssue({ id: 'cit-2', role: 'citizen' }, baseIssue),
    false
  );
});

test('Municipality Admin can monitor and escalate, but CANNOT close or modify department repairs', () => {
  const muniAdmin = {
    id: 'muni-1',
    role: 'municipality_admin' as const,
    municipalityId: 'mun-mlt',
  };
  assert.equal(
    canPerformIssueAction({ user: muniAdmin, issue: baseIssue, action: 'escalate' }).allowed,
    true
  );
  assert.equal(
    canPerformIssueAction({ user: muniAdmin, issue: baseIssue, action: 'mark_resolved' }).allowed,
    false
  );
  assert.equal(
    canPerformIssueAction({ user: muniAdmin, issue: baseIssue, action: 'accept_assignment' }).allowed,
    false
  );
});

test('Citizen can verify or reopen only when issue is Resolved or Citizen Verification', () => {
  const citizen = { id: 'cit-1', role: 'citizen' as const };
  assert.equal(
    canPerformIssueAction({ user: citizen, issue: baseIssue, action: 'citizen_verify_close' }).allowed,
    false
  );
  assert.equal(
    canPerformIssueAction({
      user: citizen,
      issue: { ...baseIssue, status: 'Resolved' },
      action: 'citizen_verify_close',
    }).allowed,
    true
  );
  assert.equal(
    canPerformIssueAction({
      user: citizen,
      issue: { ...baseIssue, status: 'Resolved' },
      action: 'citizen_reopen',
    }).allowed,
    true
  );
});

test('Field officer only accesses complaints assigned to them', () => {
  const officer = { id: 'u-fo-1', role: 'field_officer' as const, departmentId: 'dept-pwd' };
  assert.equal(
    canUserAccessIssue(officer, baseIssue, 'fo-1'),
    true
  );
  assert.equal(
    canUserAccessIssue(officer, baseIssue, 'fo-2'),
    false
  );
});

test('Government Admin can create districts; Municipality Admin can create places but not districts', () => {
  assert.equal(canCreateDistrict({ role: 'state_admin' }), true);
  assert.equal(canCreateDistrict({ role: 'district_admin' }), true);
  assert.equal(canCreateDistrict({ role: 'company_admin' }), true);
  assert.equal(canCreateDistrict({ role: 'municipality_admin' }), false);
  assert.equal(canCreateDistrict({ role: 'citizen' }), false);

  assert.equal(canCreatePlace({ role: 'municipality_admin' }), true);
  assert.equal(canCreatePlace({ role: 'state_admin' }), true);
  assert.equal(canCreatePlace({ role: 'district_admin' }), true);
  assert.equal(canCreatePlace({ role: 'company_admin' }), true);
  assert.equal(canCreatePlace({ role: 'department_admin' }), false);
  assert.equal(canCreatePlace({ role: 'citizen' }), false);
});

test('Location status validation and update permissions enforce role boundaries', () => {
  assert.equal(isValidLocationStatus('Active'), true);
  assert.equal(isValidLocationStatus('Pending Approval'), true);
  assert.equal(isValidLocationStatus('Archived'), true);
  assert.equal(isValidLocationStatus('Deleted'), false);

  assert.equal(canUpdateDistrictStatus({ role: 'state_admin' }), true);
  assert.equal(canUpdateDistrictStatus({ role: 'municipality_admin' }), false);
  assert.equal(canUpdatePlaceStatus({ role: 'municipality_admin' }), true);
  assert.equal(canUpdatePlaceStatus({ role: 'field_officer' }), false);

  assert.equal(canManageFieldOfficers({ role: 'municipality_admin' }), true);
  assert.equal(canManageFieldOfficers({ role: 'company_admin' }), true);
  assert.equal(canManageFieldOfficers({ role: 'state_admin' }), true);
  assert.equal(canManageFieldOfficers({ role: 'district_admin' }), true);
  assert.equal(canManageFieldOfficers({ role: 'department_admin' }), false);
  assert.equal(canManageFieldOfficers({ role: 'field_officer' }), false);
  assert.equal(canManageFieldOfficers({ role: 'citizen' }), false);
});

