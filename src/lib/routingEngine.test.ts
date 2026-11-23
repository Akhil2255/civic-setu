import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyIssueHeuristically,
  detectDuplicateIssues,
  detectRepeatRoadExcavations,
  haversineMeters,
  routeIssueToDepartment,
} from './routingEngine';
import type { DepartmentJurisdiction, IssueCategoryConfig, RoadPassport } from './types';

const jurisdictions: DepartmentJurisdiction[] = [
  {
    id: 'jur-pwd-mlt',
    departmentId: 'dept-pwd',
    departmentName: 'Public Works Department (PWD)',
    municipalityId: 'mun-mulanthuruthy',
    municipalityName: 'Mulanthuruthy',
    handledCategories: ['Potholes', 'Damaged roads', 'Unsafe road excavation'],
    slaHours: 48,
  },
  {
    id: 'jur-kseb-mlt',
    departmentId: 'dept-elec',
    departmentName: 'Electricity Department',
    municipalityId: 'mun-mulanthuruthy',
    municipalityName: 'Mulanthuruthy',
    handledCategories: ['Broken streetlights'],
    slaHours: 24,
  },
];

const categoryConfigs: IssueCategoryConfig[] = [
  {
    id: 'cat-1',
    name: 'Potholes',
    defaultDepartmentCode: 'PWD',
    slaHours: 48,
    description: 'Road surface potholes',
    isActive: true,
  },
];

test('haversineMeters computes accurate short civic distances', () => {
  const dSame = haversineMeters(9.8981, 76.3854, 9.8981, 76.3854);
  assert.equal(dSame, 0);
  const dNearby = haversineMeters(9.8981, 76.3854, 9.899, 76.3854);
  assert.ok(dNearby > 90 && dNearby < 115);
});

test('classifyIssueHeuristically identifies pothole near school as Critical', () => {
  const result = classifyIssueHeuristically({
    title: 'Deep pothole near St. Mary School gate',
    description: 'Waterlogged tarmac crater causing two-wheeler skids',
  });
  assert.equal(result.category, 'Potholes');
  assert.equal(result.severity, 'Critical');
  assert.ok(result.confidence >= 0.9);
});

test('routeIssueToDepartment auto-assigns matched category and jurisdiction', () => {
  const decision = routeIssueToDepartment({
    category: 'Potholes',
    confidence: 0.94,
    municipalityId: 'mun-mulanthuruthy',
    jurisdictions,
    categoryConfigs,
  });
  assert.equal(decision.routingStatus, 'auto_assigned');
  assert.equal(decision.departmentId, 'dept-pwd');
  assert.equal(decision.slaHours, 48);
});

test('routeIssueToDepartment sends low confidence or unmapped categories to manual review queue', () => {
  const lowConf = routeIssueToDepartment({
    category: 'Potholes',
    confidence: 0.4,
    municipalityId: 'mun-mulanthuruthy',
    jurisdictions,
    categoryConfigs,
  });
  assert.equal(lowConf.routingStatus, 'manual_review');
  assert.equal(lowConf.departmentId, null);

  const unmapped = routeIssueToDepartment({
    category: 'Water leakage',
    confidence: 0.92,
    municipalityId: 'mun-mulanthuruthy',
    jurisdictions,
    categoryConfigs,
  });
  assert.equal(unmapped.routingStatus, 'manual_review');
});

test('detectDuplicateIssues flags nearby identical complaints', () => {
  const dupes = detectDuplicateIssues({
    title: 'Pothole near Mulanthuruthy school',
    description: 'Waterlogged pothole near school gate',
    category: 'Potholes',
    latitude: 9.8982,
    longitude: 76.3855,
    existingIssues: [
      {
        id: 'iss-1',
        complaintCode: 'PWD-2026-00125',
        title: 'Deep pothole near school crossing',
        description: 'Large pothole near school gate causing traffic hazard',
        category: 'Potholes',
        status: 'Work in Progress',
        latitude: 9.8981,
        longitude: 76.3854,
      },
    ],
  });
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].complaintCode, 'PWD-2026-00125');
});

test('detectRepeatRoadExcavations detects repeat digging within 180m', () => {
  const passports: RoadPassport[] = [
    {
      id: 'rp-1',
      passportCode: 'RP-KL-ER-001',
      assetId: 'asset-1',
      assetName: 'Mulanthuruthy-Piravom Main Road',
      municipalityId: 'mun-mulanthuruthy',
      municipalityName: 'Mulanthuruthy',
      districtName: 'Ernakulam',
      departmentId: 'dept-pwd',
      departmentName: 'PWD',
      purpose: 'Culvert restoration',
      workStartDate: '2026-10-01',
      expectedCompletionDate: '2026-10-10',
      beforePhotoUrl: '/before.jpg',
      workStatus: 'Completed',
      inspectionResult: 'Passed',
      citizenVerificationStatus: 'Verified',
      repeatDigCount: 2,
      flaggedForInspection: true,
      latitude: 9.8981,
      longitude: 76.3854,
      history: [],
      createdAt: '2026-10-01',
      updatedAt: '2026-10-10',
    },
  ];
  const check = detectRepeatRoadExcavations({
    latitude: 9.8985,
    longitude: 76.3856,
    existingPassports: passports,
  });
  assert.equal(check.isRepeatZone, true);
  assert.equal(check.totalPriorExcavations, 2);
});
