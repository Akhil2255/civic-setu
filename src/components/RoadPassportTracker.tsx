import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  FileCheck2,
  Hammer,
  MapPin,
  RotateCcw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { api } from '../lib/api';
import type { CivicIssue, IssueStatus, RoadPassport, StatusHistoryEntry } from '../lib/types';
import { StatusLabel } from './StatusComponents';

export const ROAD_PASSPORT_LIFECYCLE_STAGES: Array<{
  status: IssueStatus;
  shortLabel: string;
  subtitle: string;
  icon: React.ReactNode;
}> = [
  {
    status: 'Submitted',
    shortLabel: 'Submitted',
    subtitle: 'Report & GPS logged',
    icon: <FileCheck2 className="w-3.5 h-3.5" />,
  },
  {
    status: 'Under Review',
    shortLabel: 'Under Review',
    subtitle: 'AI triage & check',
    icon: <Eye className="w-3.5 h-3.5" />,
  },
  {
    status: 'Assigned to Department',
    shortLabel: 'Assigned',
    subtitle: 'Department routed',
    icon: <UserCheck className="w-3.5 h-3.5" />,
  },
  {
    status: 'Accepted by Department',
    shortLabel: 'Accepted',
    subtitle: 'SLA confirmed',
    icon: <ClipboardCheck className="w-3.5 h-3.5" />,
  },
  {
    status: 'Field Inspection',
    shortLabel: 'Inspection',
    subtitle: 'On-site engineer check',
    icon: <MapPin className="w-3.5 h-3.5" />,
  },
  {
    status: 'Work in Progress',
    shortLabel: 'Work in Progress',
    subtitle: 'Active restoration',
    icon: <Hammer className="w-3.5 h-3.5" />,
  },
  {
    status: 'Resolved',
    shortLabel: 'Resolved',
    subtitle: 'Repair completed',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
];

export function computeLifecycleProgress(status: IssueStatus): {
  activeStageIndex: number;
  completedCount: number;
  percent: number;
  isPostResolved: boolean;
  isReopened: boolean;
} {
  if (status === 'Citizen Verification' || status === 'Closed') {
    return {
      activeStageIndex: ROAD_PASSPORT_LIFECYCLE_STAGES.length - 1,
      completedCount: ROAD_PASSPORT_LIFECYCLE_STAGES.length,
      percent: 100,
      isPostResolved: true,
      isReopened: false,
    };
  }
  if (status === 'Reopened') {
    return {
      activeStageIndex: 2,
      completedCount: 3,
      percent: Math.round((3 / ROAD_PASSPORT_LIFECYCLE_STAGES.length) * 100),
      isPostResolved: false,
      isReopened: true,
    };
  }
  const idx = ROAD_PASSPORT_LIFECYCLE_STAGES.findIndex((s) => s.status === status);
  const safeIdx = idx >= 0 ? idx : 0;
  const completedCount = safeIdx + 1;
  return {
    activeStageIndex: safeIdx,
    completedCount,
    percent: Math.round((completedCount / ROAD_PASSPORT_LIFECYCLE_STAGES.length) * 100),
    isPostResolved: false,
    isReopened: false,
  };
}

interface RoadPassportTrackerProps {
  issues: CivicIssue[];
  passports: RoadPassport[];
  onOpenIssue: (issueId: string) => void;
  onOpenRoadPassport: (passportId: string) => void;
  onReportNew?: () => void;
}

export const RoadPassportTracker: React.FC<RoadPassportTrackerProps> = ({
  issues,
  passports,
  onOpenIssue,
  onOpenRoadPassport,
  onReportNew,
}) => {
  const orderedIssues = useMemo(() => {
    const withPassport = issues.filter(
      (iss) => iss.roadPassportId || passports.some((p) => p.linkedIssueId === iss.id)
    );
    const others = issues.filter(
      (iss) => !iss.roadPassportId && !passports.some((p) => p.linkedIssueId === iss.id)
    );
    return [...withPassport, ...others];
  }, [issues, passports]);

  const [selectedIssueId, setSelectedIssueId] = useState<string>(orderedIssues[0]?.id || '');
  const [historyEntries, setHistoryEntries] = useState<StatusHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!orderedIssues.some((i) => i.id === selectedIssueId)) {
      setSelectedIssueId(orderedIssues[0]?.id || '');
    }
  }, [orderedIssues, selectedIssueId]);

  const activeIssue = useMemo(
    () => orderedIssues.find((i) => i.id === selectedIssueId) || orderedIssues[0] || null,
    [orderedIssues, selectedIssueId]
  );

  const linkedPassport = useMemo(() => {
    if (!activeIssue) return null;
    return (
      passports.find(
        (p) => p.id === activeIssue.roadPassportId || p.linkedIssueId === activeIssue.id
      ) || null
    );
  }, [activeIssue, passports]);

  useEffect(() => {
    let cancelled = false;
    if (!activeIssue?.id) {
      setHistoryEntries([]);
      return;
    }
    setLoadingHistory(true);
    api
      .getIssueDetail(activeIssue.id)
      .then((res) => {
        if (!cancelled) {
          setHistoryEntries(res.issue.history || []);
        }
      })
      .catch(() => {
        if (!cancelled) setHistoryEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeIssue?.id, activeIssue?.status]);

  if (!activeIssue) {
    return (
      <section
        aria-label="Road Passport Status Tracker"
        className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D9488] uppercase tracking-wide">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Road Passport Status Tracker</span>
          </div>
          <h2 className="text-base font-bold text-[#0B1F3A]">No Active Complaints to Track Yet</h2>
          <p className="text-xs text-slate-600">
            Submit a public infrastructure report to track its live lifecycle from Submitted to Resolved.
          </p>
        </div>
        {onReportNew && (
          <button
            type="button"
            onClick={onReportNew}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0D9488] rounded-lg hover:bg-teal-700 cursor-pointer"
          >
            + Report First Issue
          </button>
        )}
      </section>
    );
  }

  const progress = computeLifecycleProgress(activeIssue.status);
  const latestMilestone = historyEntries[historyEntries.length - 1] || null;

  const findStageTimestamp = (stageStatus: IssueStatus) => {
    const match = [...historyEntries].reverse().find((h) => h.toStatus === stageStatus);
    return match ? match.createdAt : null;
  };

  return (
    <section
      aria-label="Road Passport Status Tracker"
      className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5"
    >
      {/* Top Header & Complaint Selector */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D9488] uppercase tracking-wide">
              <BookOpen className="w-3.5 h-3.5" />
              Road Passport Lifecycle Tracker
            </span>
            {linkedPassport && (
              <span className="px-2 py-0.5 rounded-md bg-[#0B1F3A] text-teal-300 font-mono text-[11px] font-semibold">
                {linkedPassport.passportCode}
              </span>
            )}
            {progress.isReopened && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-[11px] font-semibold">
                <RotateCcw className="w-3 h-3" />
                Reopened for Re-Inspection
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold text-[#0B1F3A] truncate">{activeIssue.title}</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span className="font-mono font-semibold text-[#0B1F3A]">{activeIssue.complaintCode}</span>
            <span>·</span>
            <span>{activeIssue.category}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3 text-[#0D9488]" />
              {activeIssue.municipalityName}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {orderedIssues.length > 1 && (
            <select
              aria-label="Select complaint to track"
              value={activeIssue.id}
              onChange={(e) => setSelectedIssueId(e.target.value)}
              className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-slate-50 text-[#0B1F3A] max-w-[260px]"
            >
              {orderedIssues.map((iss) => {
                const rp = passports.find(
                  (p) => p.id === iss.roadPassportId || p.linkedIssueId === iss.id
                );
                return (
                  <option key={iss.id} value={iss.id}>
                    {iss.complaintCode}
                    {rp ? ` (${rp.passportCode})` : ''} — {iss.status}
                  </option>
                );
              })}
            </select>
          )}
          <StatusLabel status={activeIssue.status} overdue={activeIssue.isOverdue} />
        </div>
      </div>

      {/* Overall Progress Meter */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-700">
            <span className="font-semibold text-[#0B1F3A]">
              Lifecycle Progress: Stage {progress.completedCount} of {ROAD_PASSPORT_LIFECYCLE_STAGES.length}
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">
              {progress.isPostResolved
                ? `Completed through Resolved · Currently in ${activeIssue.status}`
                : activeIssue.status === 'Resolved'
                  ? 'Repair completed — awaiting your Citizen Verification'
                  : `Current stage: ${ROAD_PASSPORT_LIFECYCLE_STAGES[progress.activeStageIndex]?.shortLabel}`}
            </span>
          </div>
          <span className="font-mono tabular-nums font-bold text-[#0D9488] text-sm">
            {progress.percent}%
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Complaint lifecycle progress from Submitted to Resolved"
          className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200"
        >
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              progress.isReopened
                ? 'bg-amber-500'
                : progress.percent === 100
                  ? 'bg-emerald-600'
                  : 'bg-[#0D9488]'
            }`}
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      {/* Visual 7-Stage Stepper: Submitted -> Resolved */}
      <div className="pt-2">
        {/* Desktop Horizontal Connected Stepper */}
        <ol className="hidden md:grid grid-cols-7 gap-2 relative">
          {ROAD_PASSPORT_LIFECYCLE_STAGES.map((stage, idx) => {
            const isPast =
              progress.isPostResolved ||
              (activeIssue.status === 'Resolved' && idx <= progress.activeStageIndex) ||
              idx < progress.activeStageIndex;
            const isCurrent =
              !progress.isPostResolved &&
              activeIssue.status !== 'Resolved' &&
              idx === progress.activeStageIndex;
            const stageTime = findStageTimestamp(stage.status);

            return (
              <li key={stage.status} className="flex flex-col items-center text-center relative px-1">
                {/* Connecting Track Line */}
                {idx < ROAD_PASSPORT_LIFECYCLE_STAGES.length - 1 && (
                  <div
                    aria-hidden="true"
                    className={`absolute top-4 left-1/2 w-full h-0.5 -z-0 ${
                      idx < progress.activeStageIndex || progress.isPostResolved
                        ? 'bg-[#0D9488]'
                        : 'bg-slate-200'
                    }`}
                  />
                )}

                <div
                  className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                    isCurrent
                      ? 'bg-[#0D9488] border-[#0D9488] text-white ring-4 ring-teal-100'
                      : isPast
                        ? 'bg-[#0B1F3A] border-[#0B1F3A] text-white'
                        : 'bg-white border-slate-300 text-slate-400'
                  }`}
                >
                  {isPast && !isCurrent ? <Check className="w-4 h-4" /> : stage.icon}
                </div>

                <div
                  className={`mt-2 text-xs leading-tight ${
                    isCurrent
                      ? 'font-bold text-[#0D9488]'
                      : isPast
                        ? 'font-semibold text-[#0B1F3A]'
                        : 'font-medium text-slate-400'
                  }`}
                >
                  {stage.shortLabel}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  {stageTime
                    ? new Date(stageTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    : stage.subtitle}
                </div>
              </li>
            );
          })}
        </ol>

        {/* Mobile Vertical Connected Stepper */}
        <ol className="md:hidden space-y-3">
          {ROAD_PASSPORT_LIFECYCLE_STAGES.map((stage, idx) => {
            const isPast =
              progress.isPostResolved ||
              (activeIssue.status === 'Resolved' && idx <= progress.activeStageIndex) ||
              idx < progress.activeStageIndex;
            const isCurrent =
              !progress.isPostResolved &&
              activeIssue.status !== 'Resolved' &&
              idx === progress.activeStageIndex;
            const stageTime = findStageTimestamp(stage.status);

            return (
              <li key={stage.status} className="flex items-start gap-3">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center border-2 shrink-0 ${
                    isCurrent
                      ? 'bg-[#0D9488] border-[#0D9488] text-white ring-2 ring-teal-100'
                      : isPast
                        ? 'bg-[#0B1F3A] border-[#0B1F3A] text-white'
                        : 'bg-white border-slate-300 text-slate-400'
                  }`}
                >
                  {isPast && !isCurrent ? <Check className="w-3.5 h-3.5" /> : stage.icon}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs ${
                        isCurrent
                          ? 'font-bold text-[#0D9488]'
                          : isPast
                            ? 'font-semibold text-[#0B1F3A]'
                            : 'text-slate-400'
                      }`}
                    >
                      {stage.status}
                    </span>
                    {stageTime && (
                      <span className="font-mono text-[10px] text-slate-400">
                        {new Date(stageTime).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">{stage.subtitle}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Road Passport Details + Latest Update + Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-3 border-t border-slate-100">
        <div className="lg:col-span-7 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-[#0B1F3A] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#0D9488]" />
              Latest Lifecycle Update
            </span>
            {latestMilestone && (
              <span className="font-mono tabular-nums text-[11px] text-slate-500">
                {new Date(latestMilestone.createdAt).toLocaleString()}
              </span>
            )}
          </div>
          {loadingHistory ? (
            <p className="text-xs text-slate-500">Syncing milestone log...</p>
          ) : latestMilestone ? (
            <p className="text-xs text-slate-700 leading-relaxed">
              <span className="font-semibold text-[#0B1F3A]">{latestMilestone.toStatus}:</span>{' '}
              {latestMilestone.note}
            </p>
          ) : (
            <p className="text-xs text-slate-600">
              Assigned to {activeIssue.departmentName || 'Manual Review Queue'} · Due{' '}
              {new Date(activeIssue.dueAt).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="lg:col-span-5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
          {linkedPassport ? (
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[#0B1F3A] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0D9488]" />
                  Road Passport: {linkedPassport.workStatus}
                </span>
                {linkedPassport.repeatDigCount > 1 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    {linkedPassport.repeatDigCount} Repeat Digs
                  </span>
                )}
              </div>
              <div className="text-slate-600 truncate">{linkedPassport.assetName}</div>
              <div className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500">
                <Calendar className="w-3 h-3" />
                {linkedPassport.workStartDate} &rarr; {linkedPassport.expectedCompletionDate}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-600">
              <div className="font-semibold text-[#0B1F3A]">Assigned Authority</div>
              <div>{activeIssue.departmentName || 'Pending Department Routing'}</div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenIssue(activeIssue.id)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              <span>
                {activeIssue.status === 'Resolved' ? 'Verify Repair' : 'View Full Details'}
              </span>
              <ArrowRight className="w-3 h-3" />
            </button>
            {linkedPassport && (
              <button
                type="button"
                onClick={() => onOpenRoadPassport(linkedPassport.id)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#0D9488] bg-white border border-teal-200 rounded-lg hover:bg-teal-50 cursor-pointer"
              >
                <BookOpen className="w-3 h-3" />
                Inspect Road Passport
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
