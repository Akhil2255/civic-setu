import React from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock,
  Eye,
  Hammer,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { ISSUE_STATUSES, type IssueSeverity, type IssueStatus, type LocationStatus } from '../lib/types';

export const StatusLabel: React.FC<{ status: IssueStatus; overdue?: boolean }> = ({ status, overdue }) => {
  const config: Record<IssueStatus, { text: string; color: string; icon: React.ReactNode }> = {
    Submitted: { text: 'Submitted', color: 'text-slate-700', icon: <Clock className="w-3.5 h-3.5 text-slate-500" /> },
    'Under Review': { text: 'Under Review', color: 'text-amber-700', icon: <Eye className="w-3.5 h-3.5 text-amber-600" /> },
    'Assigned to Department': {
      text: 'Assigned to Dept',
      color: 'text-[#0B1F3A]',
      icon: <UserCheck className="w-3.5 h-3.5 text-[#0B1F3A]" />,
    },
    'Accepted by Department': {
      text: 'Accepted',
      color: 'text-teal-700',
      icon: <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />,
    },
    'Field Inspection': {
      text: 'Field Inspection',
      color: 'text-sky-700',
      icon: <Eye className="w-3.5 h-3.5 text-sky-600" />,
    },
    'Work in Progress': {
      text: 'Work in Progress',
      color: 'text-amber-700',
      icon: <Hammer className="w-3.5 h-3.5 text-amber-600" />,
    },
    Resolved: {
      text: 'Resolved',
      color: 'text-emerald-700',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
    },
    'Citizen Verification': {
      text: 'Citizen Verification',
      color: 'text-teal-700',
      icon: <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />,
    },
    Closed: {
      text: 'Closed',
      color: 'text-slate-700',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />,
    },
    Reopened: {
      text: 'Reopened',
      color: 'text-red-700',
      icon: <RotateCcw className="w-3.5 h-3.5 text-red-600" />,
    },
  };

  const c = config[status] ?? config.Submitted;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
      {c.icon}
      <span className={c.color}>{c.text}</span>
      {overdue && (
        <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
          <AlertTriangle className="w-3 h-3 text-red-600" />
          Overdue
        </span>
      )}
    </span>
  );
};

export const SeverityLabel: React.FC<{ severity: IssueSeverity }> = ({ severity }) => {
  const styles: Record<IssueSeverity, { cls: string; icon: React.ReactNode }> = {
    Critical: { cls: 'text-red-700 font-semibold', icon: <ShieldAlert className="w-3.5 h-3.5 text-red-600" /> },
    High: { cls: 'text-amber-700 font-semibold', icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> },
    Medium: { cls: 'text-[#0B1F3A] font-medium', icon: <Wrench className="w-3.5 h-3.5 text-teal-600" /> },
    Low: { cls: 'text-slate-600 font-medium', icon: <Clock className="w-3.5 h-3.5 text-slate-400" /> },
  };
  const s = styles[severity] || styles.Medium;
  return (
    <span className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${s.cls}`}>
      {s.icon}
      {severity}
    </span>
  );
};

export const LocationStatusBadge: React.FC<{ status?: LocationStatus }> = ({ status = 'Active' }) => {
  const config: Record<
    LocationStatus,
    { label: string; badgeCls: string; icon: React.ReactNode }
  > = {
    Active: {
      label: 'Active',
      badgeCls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      icon: <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />,
    },
    'Pending Approval': {
      label: 'Pending Approval',
      badgeCls: 'bg-amber-50 text-amber-800 border-amber-200',
      icon: <Clock className="w-3 h-3 text-amber-600 shrink-0" />,
    },
    Archived: {
      label: 'Archived',
      badgeCls: 'bg-slate-100 text-slate-600 border-slate-300',
      icon: <Archive className="w-3 h-3 text-slate-500 shrink-0" />,
    },
  };

  const c = config[status] || config.Active;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap shrink-0 ${c.badgeCls}`}
      title={`Status: ${c.label}`}
    >
      {c.icon}
      <span>{c.label}</span>
    </span>
  );
};

export const TimelineStepper: React.FC<{ currentStatus: IssueStatus }> = ({ currentStatus }) => {
  const currentIdx = ISSUE_STATUSES.indexOf(currentStatus);

  return (
    <div className="w-full overflow-x-auto pb-2">
      <ol className="flex items-start justify-between gap-2 min-w-[740px]">
        {ISSUE_STATUSES.map((step, idx) => {
          const isCurrent = step === currentStatus;
          const isCompleted =
            currentStatus === 'Reopened'
              ? idx <= 2
              : idx < currentIdx || (currentStatus === 'Closed' && idx <= 8);

          return (
            <li key={step} className="flex-1 flex flex-col items-center text-center relative">
              <div className="flex items-center w-full justify-center mb-1.5">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono tabular-nums font-semibold border transition-colors ${
                    isCurrent
                      ? 'bg-[#0D9488] text-white border-[#0D9488]'
                      : isCompleted
                        ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                        : 'bg-white text-slate-400 border-slate-300'
                  }`}
                >
                  {idx + 1}
                </span>
              </div>
              <span
                className={`text-[11px] leading-tight ${
                  isCurrent
                    ? 'font-semibold text-[#0D9488]'
                    : isCompleted
                      ? 'font-medium text-slate-800'
                      : 'text-slate-400'
                }`}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'An unexpected rendering error occurred.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#0B1F3A]">Something went wrong</h2>
            <p className="text-sm text-slate-600">{this.state.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-slate-800"
            >
              Reload View
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
