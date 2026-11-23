import assert from 'node:assert/strict';
import test from 'node:test';
import type { MunicipalityRecord } from './types.ts';
import {
  formatWhatsappConfirmationReply,
  matchMunicipalityFromText,
  matchNearestActiveMunicipality,
  normalizePhoneNumber,
  parseWhatsappIntent,
} from './whatsappBot.ts';

const SAMPLE_MUNICIPALITIES: MunicipalityRecord[] = [
  {
    id: 'mun-mlt',
    stateId: 'st-kl',
    districtId: 'dist-ekm',
    name: 'Mulanthuruthy',
    type: 'Grama Panchayat',
    status: 'Active',
    centerLat: 9.8981,
    centerLng: 76.3854,
  },
  {
    id: 'mun-kochi',
    stateId: 'st-kl',
    districtId: 'dist-ekm',
    name: 'Kochi Corporation',
    type: 'Corporation',
    status: 'Active',
    centerLat: 9.9312,
    centerLng: 76.2673,
  },
  {
    id: 'mun-archived',
    stateId: 'st-kl',
    districtId: 'dist-ekm',
    name: 'Old Fort Zone',
    type: 'Ward / Zone',
    status: 'Archived',
    centerLat: 9.96,
    centerLng: 76.24,
  },
];

test('normalizePhoneNumber normalizes 10-digit Indian and +91 formats consistently', () => {
  assert.equal(normalizePhoneNumber('9847020001'), '+919847020001');
  assert.equal(normalizePhoneNumber('+91 98470 20001'), '+919847020001');
  assert.equal(normalizePhoneNumber('91-98470-20001'), '+919847020001');
});

test('matchMunicipalityFromText matches Active places by name or base town token and skips Archived places', () => {
  assert.equal(matchMunicipalityFromText('Deep pothole in Mulanthuruthy school road', SAMPLE_MUNICIPALITIES)?.id, 'mun-mlt');
  assert.equal(matchMunicipalityFromText('Burst water pipe near Kochi metro pillar', SAMPLE_MUNICIPALITIES)?.id, 'mun-kochi');
  assert.equal(matchMunicipalityFromText('Broken bench at Old Fort Zone', SAMPLE_MUNICIPALITIES), null);
});

test('matchNearestActiveMunicipality picks nearest Active municipality from GPS coordinates', () => {
  assert.equal(matchNearestActiveMunicipality(9.899, 76.384, SAMPLE_MUNICIPALITIES)?.id, 'mun-mlt');
  assert.equal(matchNearestActiveMunicipality(9.958, 76.241, SAMPLE_MUNICIPALITIES)?.id, 'mun-kochi');
});

test('parseWhatsappIntent auto-resolves municipality from GPS coordinates even when town name is omitted', () => {
  const autoLocated = parseWhatsappIntent({
    message: 'Deep pothole blocking left lane near junction',
    municipalities: SAMPLE_MUNICIPALITIES,
    latitude: 9.8981,
    longitude: 76.3854,
  });
  assert.equal(autoLocated.intent, 'report_issue');
  assert.equal(autoLocated.matchedMunicipality?.id, 'mun-mlt');
  assert.deepEqual(autoLocated.missingFields, []);
});

test('parseWhatsappIntent recognizes greeting, track_status, verify_issue, and report_issue', () => {
  const greet = parseWhatsappIntent({ message: 'Hi', municipalities: SAMPLE_MUNICIPALITIES });
  assert.equal(greet.intent, 'greeting_help');

  const track = parseWhatsappIntent({ message: 'Status PWD-2026-00125', municipalities: SAMPLE_MUNICIPALITIES });
  assert.equal(track.intent, 'track_status');
  assert.equal(track.complaintCode, 'PWD-2026-00125');

  const verifyConfirm = parseWhatsappIntent({
    message: 'Verify PWD-2026-00125 confirm looks good',
    municipalities: SAMPLE_MUNICIPALITIES,
  });
  assert.equal(verifyConfirm.intent, 'verify_issue');
  assert.equal(verifyConfirm.verifyDecision, 'confirmed');

  const verifyReopen = parseWhatsappIntent({
    message: 'Reopen PWD-2026-00125 still broken',
    municipalities: SAMPLE_MUNICIPALITIES,
  });
  assert.equal(verifyReopen.intent, 'verify_issue');
  assert.equal(verifyReopen.verifyDecision, 'reopened');
});

test('parseWhatsappIntent supports multi-turn municipality follow-up from draft', () => {
  const turn1 = parseWhatsappIntent({
    message: 'Three streetlights are dead near the main market junction',
    municipalities: SAMPLE_MUNICIPALITIES,
  });
  assert.equal(turn1.intent, 'report_issue');
  assert.equal(turn1.suggestedCategory, 'Broken streetlights');
  assert.deepEqual(turn1.missingFields, ['municipality']);

  const turn2 = parseWhatsappIntent({
    message: 'Mulanthuruthy',
    municipalities: SAMPLE_MUNICIPALITIES,
    draft: {
      title: turn1.title,
      description: turn1.description,
      suggestedCategory: turn1.suggestedCategory,
    },
  });
  assert.equal(turn2.intent, 'report_issue');
  assert.equal(turn2.matchedMunicipality?.id, 'mun-mlt');
  assert.deepEqual(turn2.missingFields, []);
});

test('formatWhatsappConfirmationReply formats structured registration confirmation with GPS', () => {
  const reply = formatWhatsappConfirmationReply({
    complaintCode: 'PWD-2026-00134',
    title: 'Deep pothole near school gate',
    category: 'Potholes',
    severity: 'High',
    municipalityName: 'Mulanthuruthy',
    departmentName: 'Public Works Department (PWD)',
    slaHours: 48,
    hasRoadPassport: true,
    addressText: "St. Mary's Road, Mulanthuruthy",
    latitude: 9.8981,
    longitude: 76.3854,
  });
  assert.match(reply, /PWD-2026-00134/);
  assert.match(reply, /Public Works Department/);
  assert.match(reply, /Road Passport/);
  assert.match(reply, /9\.89810, 76\.38540/);
});
