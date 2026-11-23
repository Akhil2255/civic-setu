import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  MapPin,
  RotateCcw,
  ShieldAlert,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { DEFAULT_ISSUE_CATEGORIES, type CivicIssue, type DepartmentRecord, type FieldOfficerRecord, type RoadPassport, type UserAccount } from '../lib/types';
import { SeverityLabel, StatusLabel, TimelineStepper } from './StatusComponents';

interface IssueDetailModalProps {
  issueId: string;
  user: UserAccount;
  departments: DepartmentRecord[];
  onClose: () => void;
  onUpdated: () => void;
  onOpenRoadPassport?: (passportId: string) => void;
}

export const IssueDetailModal: React.FC<IssueDetailModalProps> = ({
  issueId,
  user,
  departments,
  onClose,
  onUpdated,
  onOpenRoadPassport,
}) => {
  const [issue, setIssue] = useState<CivicIssue | null>(null);
  const [roadPassport, setRoadPassport] = useState<RoadPassport | null>(null);
  const [officers, setOfficers] = useState<FieldOfficerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  // Action inputs
  const [selectedOfficerId, setSelectedOfficerId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [citizenFeedback, setCitizenFeedback] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [editCat, setEditCat] = useState('');
  const [editSev, setEditSev] = useState('Medium');
  const [editDeptId, setEditDeptId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getIssueDetail(issueId);
      setIssue(res.issue);
      setRoadPassport(res.roadPassport);
      setEditCat(res.issue.category);
      setEditSev(res.issue.severity);
      setEditDeptId(res.issue.departmentId || '');
      if (user.role === 'department_admin') {
        const foRes = await api.getFieldOfficers();
        setOfficers(foRes.fieldOfficers);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load complaint details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [issueId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const runAction = async (fn: () => Promise<void>, successMessage: string) => {
    setActionBusy(true);
    setActionMsg('');
    setError('');
    try {
      await fn();
      setActionMsg(successMessage);
      setPhotoDataUrl('');
      setStatusNote('');
      await load();
      onUpdated();
    } catch (err: any) {
      setError(err.message || 'Action failed.');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Complaint Details and Tracking"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-semibold text-teal-700">
              <span>
                {issue?.complaintCode || 'Loading...'}
                {issue?.isEscalated ? ' · ESCALATED' : ''}
              </span>
              {issue?.channel === 'whatsapp' && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-[#075E54] border border-emerald-200 font-sans font-semibold text-[10px]">
                  WhatsApp Intake{issue.reporterPhone ? ` · ${issue.reporterPhone}` : ''}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-[#0B1F3A]">{issue?.title || 'Complaint Record'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close complaint details"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && <div className="py-12 text-center text-sm text-slate-500">Loading complaint record...</div>}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
          )}

          {actionMsg && (
            <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-sm text-teal-900">{actionMsg}</div>
          )}

          {issue && !loading && (
            <>
              {/* 10-step Tracking Stepper */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <StatusLabel status={issue.status} overdue={issue.isOverdue} />
                  <SeverityLabel severity={issue.severity} />
                </div>
                <TimelineStepper currentStatus={issue.status} />
              </div>

              {/* Metadata & AI Classification */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-[#0B1F3A]">Complaint Summary</h3>
                  <p className="text-sm text-slate-700 leading-relaxed">{issue.description}</p>
                  <div className="text-xs text-slate-600 space-y-1.5 pt-2 border-t border-slate-100">
                    <div>
                      <span className="font-semibold text-slate-800">Category:</span> {issue.category}
                    </div>
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-teal-700 mt-0.5 shrink-0" />
                      <span>
                        {issue.addressText} ({issue.municipalityName}, {issue.districtName})
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      GPS: {issue.latitude.toFixed(5)}, {issue.longitude.toFixed(5)}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">Assigned Department:</span>{' '}
                      {issue.departmentName || 'Manual Review Queue (Pending Assignment)'}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">Field Officer:</span>{' '}
                      {issue.fieldOfficerName || 'Not yet assigned'}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-[#0B1F3A]">AI Classification & Triage Record</h3>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs text-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#0B1F3A]">
                        Suggested: {issue.aiSuggestedCategory || issue.category}
                      </span>
                      <span className="font-mono tabular-nums text-teal-700 font-semibold">
                        {issue.aiConfidence ? `${Math.round(issue.aiConfidence * 100)}% confidence` : 'Rule matched'}
                      </span>
                    </div>
                    <p className="text-slate-600">{issue.aiSummary || issue.title}</p>
                    <p className="text-slate-500">{issue.aiReasoning}</p>
                    {issue.duplicateOfCode && (
                      <div className="pt-1 text-amber-700 font-medium">
                        Duplicate Proximity Notice: Near active ticket {issue.duplicateOfCode}
                      </div>
                    )}
                  </div>

                  {roadPassport && (
                    <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-semibold text-teal-800">
                          ROAD PASSPORT · {roadPassport.passportCode}
                        </span>
                        <span className="text-xs font-semibold text-[#0B1F3A]">{roadPassport.workStatus}</span>
                      </div>
                      <p className="text-xs text-slate-700">{roadPassport.purpose}</p>
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>Repeat Excavations: {roadPassport.repeatDigCount}</span>
                        {onOpenRoadPassport && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenRoadPassport(roadPassport.id);
                            }}
                            className="font-semibold text-teal-700 hover:underline"
                          >
                            View Full Passport &rarr;
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Photographic Evidence */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[#0B1F3A]">Photographic & Field Evidence</h3>
                {issue.evidence && issue.evidence.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {issue.evidence.map((ev) => (
                      <div key={ev.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                        <img
                          src={ev.mediaUrl}
                          alt={ev.caption}
                          referrerPolicy="no-referrer"
                          className="w-full h-40 object-cover bg-slate-100"
                        />
                        <div className="p-3 space-y-1">
                          <div className="text-[11px] font-semibold text-teal-700 uppercase tracking-wide">
                            {ev.evidenceType.replace('_', ' ')}
                          </div>
                          <p className="text-xs text-slate-700">{ev.caption}</p>
                          <div className="text-[11px] text-slate-400">
                            {ev.uploaderName} · {new Date(ev.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No photographic evidence attached yet.</p>
                )}
              </div>

              {/* Role-Specific Actions */}
              <div className="border-t border-slate-200 pt-5 space-y-4">
                <h3 className="text-sm font-semibold text-[#0B1F3A]">Available Actions ({user.role.replace('_', ' ')})</h3>

                {/* Citizen Verification */}
                {user.role === 'citizen' &&
                  user.id === issue.reporterId &&
                  (issue.status === 'Resolved' || issue.status === 'Citizen Verification') && (
                    <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/40 space-y-3">
                      <p className="text-sm font-medium text-[#0B1F3A]">
                        The department marked this repair as resolved. Please inspect the after-repair evidence and confirm or reopen.
                      </p>
                      <textarea
                        value={citizenFeedback}
                        onChange={(e) => setCitizenFeedback(e.target.value)}
                        rows={2}
                        placeholder="Optional verification note or reason if repair is incomplete..."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() =>
                            runAction(
                              async () => {
                                await api.verifyIssue(issue.id, { decision: 'confirmed', feedback: citizenFeedback });
                              },
                              'Complaint verified and closed. Road Passport updated.'
                            )
                          }
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0D9488] rounded-lg hover:bg-teal-700 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Confirm Repair Resolved & Close
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() =>
                            runAction(
                              async () => {
                                await api.verifyIssue(issue.id, {
                                  decision: 'reopened',
                                  feedback: citizenFeedback || 'Repair incomplete; citizen requested re-inspection.',
                                });
                              },
                              'Complaint reopened and department notified.'
                            )
                          }
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Reopen Complaint
                        </button>
                      </div>
                    </div>
                  )}

                {/* Department Admin Actions */}
                {user.role === 'department_admin' && (
                  <div className="space-y-4">
                    {(issue.status === 'Assigned to Department' || issue.status === 'Reopened') && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 border border-slate-200 rounded-xl space-y-2">
                          <div className="text-xs font-semibold text-[#0B1F3A]">Accept Departmental Assignment</div>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() =>
                              runAction(async () => {
                                await api.acceptIssue(issue.id, 'Accepted for execution.');
                              }, 'Assignment accepted.')
                            }
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0D9488] rounded-lg hover:bg-teal-700"
                          >
                            <FileCheck2 className="w-4 h-4" />
                            Accept Assignment
                          </button>
                        </div>
                        <div className="p-4 border border-slate-200 rounded-xl space-y-2">
                          <div className="text-xs font-semibold text-red-800">Reject & Return to Review Queue</div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Reason (e.g., NHAI jurisdiction)"
                              className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                            />
                            <button
                              type="button"
                              disabled={actionBusy || !rejectReason.trim()}
                              onClick={() =>
                                runAction(async () => {
                                  await api.rejectIssue(issue.id, rejectReason);
                                }, 'Assignment returned to Manual Review Queue.')
                              }
                              className="px-3 py-1.5 text-sm font-semibold text-red-700 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Assign Field Officer */}
                    {issue.status !== 'Closed' && (
                      <div className="p-4 border border-slate-200 rounded-xl space-y-3">
                        <div className="text-xs font-semibold text-[#0B1F3A]">Assign to Field Officer</div>
                        <div className="flex flex-wrap gap-3">
                          <select
                            aria-label="Select Field Officer"
                            value={selectedOfficerId}
                            onChange={(e) => setSelectedOfficerId(e.target.value)}
                            className="flex-1 min-w-[220px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                          >
                            <option value="">Select Field Officer...</option>
                            {officers.map((fo) => (
                              <option key={fo.id} value={fo.id}>
                                {fo.fullName} — {fo.designation} ({fo.activeCount ?? 0} active)
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={actionBusy || !selectedOfficerId}
                            onClick={() =>
                              runAction(async () => {
                                await api.assignFieldOfficer(issue.id, selectedOfficerId);
                              }, 'Field officer assigned and notified.')
                            }
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-slate-800 disabled:opacity-50"
                          >
                            <UserCheck className="w-4 h-4" />
                            Assign Officer
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Department Admin OR Field Officer Progress Update */}
                {(user.role === 'department_admin' || user.role === 'field_officer') && issue.status !== 'Closed' && (
                  <div className="p-4 border border-slate-200 rounded-xl space-y-3 bg-slate-50">
                    <div className="text-xs font-semibold text-[#0B1F3A]">Update Inspection / Repair Progress</div>
                    <textarea
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                      rows={2}
                      placeholder="Add inspection findings, repair crew notes, or completion summary..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{photoDataUrl ? 'Photo Attached' : 'Upload Inspection / Repair Photo'}</span>
                        <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                      </label>
                      {!photoDataUrl && (
                        <button
                          type="button"
                          onClick={() => setPhotoDataUrl('/src/assets/images/sample_road_after_1795365318126.jpg')}
                          className="text-xs font-medium text-teal-700 hover:underline"
                        >
                          Attach Sample After-Repair Photo
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2.5 pt-1">
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() =>
                          runAction(async () => {
                            await api.updateIssueStatus(issue.id, {
                              nextStatus: 'Field Inspection',
                              note: statusNote || 'On-site field inspection logged.',
                              photoDataUrl,
                              evidenceType: 'inspection',
                            });
                          }, 'Status updated to Field Inspection.')
                        }
                        className="px-3.5 py-2 text-xs font-semibold text-[#0B1F3A] bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
                      >
                        Log Field Inspection
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() =>
                          runAction(async () => {
                            await api.updateIssueStatus(issue.id, {
                              nextStatus: 'Work in Progress',
                              note: statusNote || 'Repair crew mobilized on site.',
                              photoDataUrl,
                              evidenceType: 'before_repair',
                            });
                          }, 'Status updated to Work in Progress.')
                        }
                        className="px-3.5 py-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100"
                      >
                        Mark Work in Progress
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() =>
                          runAction(async () => {
                            await api.updateIssueStatus(issue.id, {
                              nextStatus: 'Resolved',
                              note: statusNote || 'Repair completed and ready for citizen verification.',
                              photoDataUrl,
                              evidenceType: 'after_repair',
                            });
                          }, 'Marked Resolved and Road Passport updated.')
                        }
                        className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0D9488] rounded-lg hover:bg-teal-700"
                      >
                        Submit Completion (Mark Resolved)
                      </button>
                    </div>
                  </div>
                )}

                {/* Municipality Admin Escalation ONLY (cannot edit/close department repairs) */}
                {user.role === 'municipality_admin' && (
                  <div className="p-4 border border-amber-200 bg-amber-50/40 rounded-xl space-y-3">
                    <div className="flex items-start gap-2 text-xs text-slate-700">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        Municipality Administrators monitor progress and escalate delayed or overdue cases. Department repair records and completion sign-off remain under departmental & citizen authority.
                      </span>
                    </div>
                    {issue.status !== 'Closed' && (
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={escalationReason}
                          onChange={(e) => setEscalationReason(e.target.value)}
                          placeholder="Escalation notice (e.g., SLA exceeded in school corridor)"
                          className="flex-1 min-w-[240px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                        />
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() =>
                            runAction(async () => {
                              await api.escalateIssue(issue.id, escalationReason || 'Escalated by Municipality Administrator.');
                            }, 'Complaint escalated and department notified.')
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700"
                        >
                          <ShieldAlert className="w-4 h-4" />
                          Escalate Complaint
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Company / Gov Admin Classification Override & Manual Queue Routing */}
                {['company_admin', 'state_admin', 'district_admin'].includes(user.role) && (
                  <div className="p-4 border border-slate-200 rounded-xl space-y-3 bg-slate-50">
                    <div className="text-xs font-semibold text-[#0B1F3A]">
                      Admin Classification Override & Jurisdictional Assignment
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <select
                        aria-label="Override Category"
                        value={editCat}
                        onChange={(e) => setEditCat(e.target.value)}
                        className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      >
                        {DEFAULT_ISSUE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Override Severity"
                        value={editSev}
                        onChange={(e) => setEditSev(e.target.value)}
                        className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                      <select
                        aria-label="Assign Department"
                        value={editDeptId}
                        onChange={(e) => setEditDeptId(e.target.value)}
                        className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="">Select Department...</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() =>
                          runAction(async () => {
                            await api.updateClassification(issue.id, {
                              category: editCat,
                              severity: editSev,
                              departmentId: editDeptId,
                            });
                          }, 'Classification and department routing updated.')
                        }
                        className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-slate-800"
                      >
                        Save Routing & Classification
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() =>
                          runAction(async () => {
                            await api.escalateIssue(issue.id, 'Escalated by Government Oversight Administrator.');
                          }, 'Complaint escalated.')
                        }
                        className="px-4 py-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100"
                      >
                        Flag Escalation
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Status History Log */}
              <div className="border-t border-slate-200 pt-5 space-y-3">
                <h3 className="text-sm font-semibold text-[#0B1F3A]">Complete Status History</h3>
                <div className="space-y-2">
                  {issue.history?.map((h) => (
                    <div key={h.id} className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 text-xs">
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-900">
                          {h.fromStatus ? `${h.fromStatus} -> ${h.toStatus}` : h.toStatus}
                        </div>
                        <div className="text-slate-600">{h.note}</div>
                        <div className="text-slate-400">
                          {h.changedByName} ({h.changedByRole.replace('_', ' ')})
                        </div>
                      </div>
                      <span className="font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(h.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
