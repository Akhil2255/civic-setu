import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  ClipboardList,
  Download,
  FilePlus2,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  MapPin,
  Menu,
  MessageCircle,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';
import { api, type AnalyticsData, type TaxonomyData } from '../lib/api';
import { ISSUE_STATUSES, type CivicIssue, type NotificationRecord, type RoadPassport, type UserAccount } from '../lib/types';
import { canCreateDistrict, canCreatePlace, canManageFieldOfficers } from '../lib/workflow';
import { CategoryDistributionChart, DepartmentPerformanceChart } from './AnalyticsCharts';
import { CivicMap } from './CivicMap';
import { CompanyAdminConsole } from './CompanyAdminConsole';
import { FieldOfficerManagerPanel } from './FieldOfficerManagerPanel';
import { IssueDetailModal } from './IssueDetailModal';
import { LocationManagerPanel } from './LocationManagerPanel';
import { Logo } from './Logo';
import { ReportIssueView } from './ReportIssueView';
import { RoadPassportTracker } from './RoadPassportTracker';
import { RoadPassportView } from './RoadPassportView';
import { SeverityLabel, StatusLabel } from './StatusComponents';
import { WhatsappBotWidget } from './WhatsappBotWidget';

type WorkspaceTab =
  | 'overview'
  | 'report'
  | 'whatsapp'
  | 'complaints'
  | 'map'
  | 'road_passport'
  | 'analytics'
  | 'locations'
  | 'field_officers'
  | 'notifications'
  | 'admin_accounts'
  | 'admin_jurisdictions'
  | 'admin_audit';

interface DashboardWorkspaceProps {
  user: UserAccount;
  taxonomy: TaxonomyData;
  onLogout: () => void;
  onTaxonomyChanged: () => void;
}

export const DashboardWorkspace: React.FC<DashboardWorkspaceProps> = ({
  user,
  taxonomy,
  onLogout,
  onTaxonomyChanged,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [issues, setIssues] = useState<CivicIssue[]>([]);
  const [passports, setPassports] = useState<RoadPassport[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [aiBriefing, setAiBriefing] = useState<{ text: string; source: string } | null>(null);
  const [briefingBusy, setBriefingBusy] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedPassportId, setSelectedPassportId] = useState<string | null>(null);

  // Filters
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterMuni, setFilterMuni] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const refreshWorkspace = async () => {
    setLoading(true);
    setError('');
    try {
      const [issRes, anRes, ntfRes, rpRes] = await Promise.all([
        api.getIssues(),
        api.getAnalytics(),
        api.getNotifications(),
        api.getRoadPassports(),
      ]);
      setIssues(issRes.issues);
      setAnalytics(anRes);
      setNotifications(ntfRes.notifications);
      setPassports(rpRes.passports);
    } catch (err: any) {
      setError(err.message || 'Failed to load workspace data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshWorkspace();
  }, [user.id]);

  const filteredIssues = useMemo(() => {
    return issues.filter((i) => {
      if (filterDistrict && i.districtId !== filterDistrict) return false;
      if (filterMuni && i.municipalityId !== filterMuni) return false;
      if (filterDept && i.departmentId !== filterDept) return false;
      if (filterCategory && i.category !== filterCategory) return false;
      if (filterStatus && i.status !== filterStatus) return false;
      if (overdueOnly && !i.isOverdue) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (
          !i.complaintCode.toLowerCase().includes(q) &&
          !i.title.toLowerCase().includes(q) &&
          !i.addressText.toLowerCase().includes(q) &&
          !i.municipalityName.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [issues, filterDistrict, filterMuni, filterDept, filterCategory, filterStatus, overdueOnly, searchQuery]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleGenerateBriefing = async () => {
    setBriefingBusy(true);
    try {
      const res = await api.getAiDashboardSummary();
      setAiBriefing({ text: res.briefing, source: res.source });
    } catch (err: any) {
      setError(err.message || 'Failed to generate AI briefing.');
    } finally {
      setBriefingBusy(false);
    }
  };

  const handleExportCsv = () => {
    const headers = ['Complaint ID', 'Title', 'Category', 'Severity', 'Status', 'Municipality', 'Department', 'Overdue', 'Created At'];
    const rows = filteredIssues.map((i) => [
      i.complaintCode,
      `"${i.title.replace(/"/g, '""')}"`,
      i.category,
      i.severity,
      i.status,
      i.municipalityName,
      i.departmentName || 'Manual Review',
      i.isOverdue ? 'Yes' : 'No',
      i.createdAt,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pwd-connect-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const navItems: Array<{ id: WorkspaceTab; label: string; icon: React.ReactNode; show: boolean }> = [
    { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, show: true },
    { id: 'report', label: 'Report an Issue', icon: <FilePlus2 className="w-4 h-4" />, show: user.role === 'citizen' },
    {
      id: 'whatsapp',
      label: 'WhatsApp Bot',
      icon: <MessageCircle className="w-4 h-4" />,
      show: user.role === 'citizen',
    },
    {
      id: 'complaints',
      label: user.role === 'citizen' ? 'My Complaints' : user.role === 'field_officer' ? 'Assigned Tasks' : 'Complaints Queue',
      icon: <ClipboardList className="w-4 h-4" />,
      show: true,
    },
    { id: 'map', label: 'Interactive Map', icon: <MapIcon className="w-4 h-4" />, show: true },
    { id: 'road_passport', label: 'Road Passport', icon: <BookOpen className="w-4 h-4" />, show: true },
    {
      id: 'analytics',
      label: 'Analytics & Reports',
      icon: <BarChart3 className="w-4 h-4" />,
      show: user.role !== 'citizen' && user.role !== 'field_officer',
    },
    {
      id: 'locations',
      label: canCreateDistrict(user) ? 'Districts & Places' : 'Places & Local Bodies',
      icon: <MapPin className="w-4 h-4" />,
      show: canCreateDistrict(user) || canCreatePlace(user),
    },
    {
      id: 'field_officers',
      label: 'Field Officers',
      icon: <UserPlus className="w-4 h-4" />,
      show: canManageFieldOfficers(user),
    },
    { id: 'notifications', label: `Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`, icon: <Bell className="w-4 h-4" />, show: true },
    {
      id: 'admin_accounts',
      label: 'User Management',
      icon: <Settings className="w-4 h-4" />,
      show: user.role === 'company_admin',
    },
    {
      id: 'admin_jurisdictions',
      label: 'Jurisdictions & Categories',
      icon: <Building2 className="w-4 h-4" />,
      show: user.role === 'company_admin',
    },
    {
      id: 'admin_audit',
      label: 'Audit Logs',
      icon: <ShieldCheck className="w-4 h-4" />,
      show: user.role === 'company_admin' || user.role === 'state_admin',
    },
  ];

  const roleHeadingMap: Record<string, string> = {
    company_admin: 'Company Administrator Console',
    citizen: 'Citizen Civic Portal',
    state_admin: 'State Government Administrator Portal',
    district_admin: 'District Administrator Portal',
    municipality_admin: 'Municipality Administrator Portal',
    department_admin: 'Department Operations Portal',
    field_officer: 'Field Officer Dispatch Portal',
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0B1F3A] text-white flex flex-col transition-transform lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 border-b border-slate-800 flex items-center justify-between">
          <Logo dark />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
            className="lg:hidden p-1.5 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-slate-800 space-y-1">
          <div className="text-xs font-semibold text-teal-300">{roleHeadingMap[user.role]}</div>
          <div className="text-sm font-bold text-white truncate">{user.fullName}</div>
          <div className="text-xs font-mono text-slate-400 truncate">{user.email}</div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Dashboard Navigation">
          {navItems
            .filter((item) => item.show)
            .map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active ? 'bg-[#0D9488] text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800/80 hover:bg-slate-700 rounded-lg cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-semibold text-[#0B1F3A] truncate">
              {roleHeadingMap[user.role]} / <span className="text-slate-500 font-normal capitalize">{activeTab.replace('_', ' ')}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {user.role === 'citizen' && activeTab !== 'whatsapp' && (
              <button
                type="button"
                onClick={() => setActiveTab('whatsapp')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#075E54] rounded-lg hover:bg-emerald-900 whitespace-nowrap cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp Bot
              </button>
            )}
            {user.role === 'citizen' && activeTab !== 'report' && (
              <button
                type="button"
                onClick={() => setActiveTab('report')}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0D9488] rounded-lg hover:bg-teal-700 whitespace-nowrap cursor-pointer"
              >
                + Report Issue
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              aria-label="Open notifications"
              className="relative p-2 rounded-lg border border-slate-200 text-slate-600 hover:text-[#0B1F3A] hover:bg-slate-50"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-mono flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {error && <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>}

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">
                    Welcome, {user.fullName}
                  </h1>
                  <p className="text-sm text-slate-600">
                    Real-time civic infrastructure oversight and status tracking across your authorized jurisdiction.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(canCreateDistrict(user) || canCreatePlace(user)) && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('locations')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0D9488] rounded-lg hover:bg-teal-700 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      {canCreateDistrict(user) ? '+ Add District / Place' : '+ Add Place'}
                    </button>
                  )}
                  {canManageFieldOfficers(user) && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('field_officers')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0B1F3A] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-[#0D9488]" />
                      + Add Field Officer
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={briefingBusy}
                    onClick={handleGenerateBriefing}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0B1F3A] bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#0D9488]" />
                    {briefingBusy ? 'Generating Briefing...' : 'AI Operational Summary'}
                  </button>
                  {user.role !== 'citizen' && (
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-slate-800"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export CSV Report
                    </button>
                  )}
                </div>
              </div>

              {aiBriefing && (
                <div className="p-4 bg-white border border-teal-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#0D9488]">
                    <span>AI Executive Summary</span>
                    <span className="font-mono uppercase">{aiBriefing.source}</span>
                  </div>
                  <p className="text-sm text-slate-800 leading-relaxed">{aiBriefing.text}</p>
                </div>
              )}

              {/* KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs text-slate-500">Total Scoped Complaints</div>
                  <div className="text-3xl font-bold font-mono tabular-nums text-[#0B1F3A] mt-1">
                    {analytics?.summary.total ?? issues.length}
                  </div>
                </div>
                <div className="p-5 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs text-slate-500">Active / Pending</div>
                  <div className="text-3xl font-bold font-mono tabular-nums text-[#D97706] mt-1">
                    {analytics?.summary.pending ?? 0}
                  </div>
                </div>
                <div className="p-5 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs text-slate-500">Resolved & Closed</div>
                  <div className="text-3xl font-bold font-mono tabular-nums text-[#0D9488] mt-1">
                    {analytics?.summary.resolved ?? 0}
                  </div>
                </div>
                <div className="p-5 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs text-slate-500">Overdue SLA</div>
                  <div className="text-3xl font-bold font-mono tabular-nums text-red-700 mt-1">
                    {analytics?.summary.overdue ?? 0}
                  </div>
                </div>
              </div>

              {/* Road Passport Complaint Lifecycle Status Tracker (Citizen Dashboard) */}
              {user.role === 'citizen' && (
                <RoadPassportTracker
                  issues={issues}
                  passports={passports}
                  onOpenIssue={(issueId) => setSelectedIssueId(issueId)}
                  onOpenRoadPassport={(rpId) => {
                    setSelectedPassportId(rpId);
                    setActiveTab('road_passport');
                  }}
                  onReportNew={() => setActiveTab('report')}
                />
              )}

              {/* Manual Review Queue Alert for Company/Gov Admins */}
              {['company_admin', 'state_admin', 'district_admin'].includes(user.role) &&
                issues.some((i) => i.routingStatus === 'manual_review') && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-amber-950">
                      <span className="font-bold">Manual Review Queue: </span>
                      {issues.filter((i) => i.routingStatus === 'manual_review').length} complaint(s) had ambiguous category or jurisdiction confidence and require human department assignment.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFilterStatus('Under Review');
                        setActiveTab('complaints');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-white border border-amber-300 rounded-lg hover:bg-amber-100"
                    >
                      Inspect Review Queue
                    </button>
                  </div>
                )}

              {/* Split: Recent Complaints + Map/Notifications */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-[#0B1F3A]">
                      {user.role === 'citizen' ? 'My Submitted Complaints' : 'Priority Infrastructure Queue'}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('complaints')}
                      className="text-xs font-semibold text-[#0D9488] hover:underline"
                    >
                      View All ({issues.length}) &rarr;
                    </button>
                  </div>

                  {loading ? (
                    <div className="py-8 text-center text-sm text-slate-500">Loading complaints...</div>
                  ) : issues.length === 0 ? (
                    <div className="py-10 text-center space-y-3">
                      <p className="text-sm text-slate-500">No complaints found in your portal yet.</p>
                      {user.role === 'citizen' && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('report')}
                          className="px-4 py-2 text-xs font-semibold text-white bg-[#0D9488] rounded-lg"
                        >
                          Submit First Issue
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {issues.slice(0, 6).map((iss) => (
                        <button
                          key={iss.id}
                          type="button"
                          onClick={() => setSelectedIssueId(iss.id)}
                          className="w-full text-left py-3.5 hover:bg-slate-50 px-2 rounded-lg transition-colors flex flex-wrap items-center justify-between gap-3 cursor-pointer"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono font-semibold text-[#0D9488]">
                              <span>
                                {iss.complaintCode} · {iss.category} · {iss.municipalityName}
                              </span>
                              {iss.channel === 'whatsapp' && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-[#075E54] border border-emerald-200 font-sans text-[10px]">
                                  WhatsApp
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-semibold text-[#0B1F3A] truncate">{iss.title}</div>
                            <div className="text-xs text-slate-500">
                              {iss.departmentName || 'Manual Review Queue'}
                            </div>
                          </div>
                          <div className="text-right space-y-1 shrink-0">
                            <StatusLabel status={iss.status} overdue={iss.isOverdue} />
                            <div>
                              <SeverityLabel severity={iss.severity} />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-[#0B1F3A]">Live Jurisdiction Map</h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab('map')}
                        className="text-xs font-semibold text-[#0D9488] hover:underline"
                      >
                        Expand Map
                      </button>
                    </div>
                    <CivicMap
                      issues={issues}
                      passports={passports}
                      heightClass="h-[240px]"
                      onOpenIssue={(id) => setSelectedIssueId(id)}
                    />
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-[#0B1F3A]">Recent Notifications</h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab('notifications')}
                        className="text-xs font-semibold text-[#0D9488] hover:underline"
                      >
                        All ({notifications.length})
                      </button>
                    </div>
                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-500">No recent alerts.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {notifications.slice(0, 4).map((n) => (
                          <div key={n.id} className="text-xs py-2 border-b border-slate-100 last:border-0">
                            <div className="font-semibold text-[#0B1F3A]">{n.title}</div>
                            <div className="text-slate-600 mt-0.5">{n.message}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Department Performance Table for Oversight Portals */}
              {analytics && analytics.byDepartment.length > 0 && user.role !== 'citizen' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <h2 className="text-base font-bold text-[#0B1F3A]">Department Performance & SLA Accountability</h2>
                  <DepartmentPerformanceChart data={analytics.byDepartment} />
                </div>
              )}
            </div>
          )}

          {/* REPORT AN ISSUE TAB */}
          {activeTab === 'report' && (
            <ReportIssueView
              user={user}
              taxonomy={taxonomy}
              onSubmitted={async (created) => {
                await refreshWorkspace();
                setSelectedIssueId(created.id);
                setActiveTab('complaints');
              }}
            />
          )}

          {/* WHATSAPP BOT TAB (CIVILIAN ONLY) */}
          {activeTab === 'whatsapp' && user.role === 'citizen' && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">
                  WhatsApp Civic Chatbot
                </h1>
                <p className="text-sm text-slate-600">
                  Report potholes, broken streetlights, water leaks, or drainage issues via chat. Your location and GPS coordinates are automatically sent to the responsible authority queue with full controls.
                </p>
              </div>
              <WhatsappBotWidget
                taxonomy={taxonomy}
                defaultPhone={user.phone || '+91 98470 20001'}
                onIssueCreated={async () => {
                  await refreshWorkspace();
                }}
                onOpenComplaint={(code) => {
                  const matched = issues.find((i) => i.complaintCode === code);
                  setSelectedIssueId(matched ? matched.id : code);
                }}
              />
            </div>
          )}

          {/* COMPLAINTS TABLE + FILTERS TAB */}
          {activeTab === 'complaints' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">
                    {user.role === 'citizen' ? 'My Complaints & Verification' : 'Complaints Management Queue'}
                  </h1>
                  <p className="text-sm text-slate-600">
                    Click any complaint row to inspect evidence, timeline, Road Passport, or execute role actions.
                  </p>
                </div>
              </div>

              {/* Multi-Filter Toolbar */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="relative lg:col-span-2">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search ID (PWD-2026-...), street, title..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <select
                  aria-label="Filter by District"
                  value={filterDistrict}
                  onChange={(e) => setFilterDistrict(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">All Districts</option>
                  {taxonomy.districts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by Municipality"
                  value={filterMuni}
                  onChange={(e) => setFilterMuni(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">All Municipalities</option>
                  {taxonomy.municipalities.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by Department"
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">All Departments</option>
                  {taxonomy.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by Status"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">All Statuses</option>
                  {ISSUE_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <select
                    aria-label="Filter by Category"
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">All Categories</option>
                    {taxonomy.categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <label className="inline-flex items-center gap-1.5 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overdueOnly}
                      onChange={(e) => setOverdueOnly(e.target.checked)}
                    />
                    Overdue Only
                  </label>
                </div>
                <span className="text-slate-500 font-mono tabular-nums">
                  Showing {filteredIssues.length} of {issues.length} records
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {filteredIssues.length === 0 ? (
                  <div className="p-10 text-center text-sm text-slate-500">
                    No complaints match your active filters.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                          <th className="py-3 px-4">Complaint ID</th>
                          <th className="py-3 px-4">Issue & Location</th>
                          <th className="py-3 px-4">Category</th>
                          <th className="py-3 px-4">Department</th>
                          <th className="py-3 px-4">Severity</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Filed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {filteredIssues.map((iss) => (
                          <tr
                            key={iss.id}
                            onClick={() => setSelectedIssueId(iss.id)}
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                          >
                            <td className="py-3 px-4 font-mono text-xs font-semibold text-[#0D9488] whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span>{iss.complaintCode}</span>
                                {iss.channel === 'whatsapp' && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-[#075E54] border border-emerald-200 font-sans text-[10px]">
                                    WhatsApp
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-[#0B1F3A]">{iss.title}</div>
                              <div className="text-xs text-slate-500">
                                {iss.municipalityName}, {iss.districtName}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">{iss.category}</td>
                            <td className="py-3 px-4 text-xs text-slate-700">
                              {iss.departmentName || <span className="text-amber-700 font-semibold">Manual Review</span>}
                            </td>
                            <td className="py-3 px-4">
                              <SeverityLabel severity={iss.severity} />
                            </td>
                            <td className="py-3 px-4">
                              <StatusLabel status={iss.status} overdue={iss.isOverdue} />
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                              {new Date(iss.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* INTERACTIVE MAP TAB */}
          {activeTab === 'map' && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">Interactive Civic Issue & Hotspot Map</h1>
                <p className="text-sm text-slate-600">
                  OpenStreetMap view of active complaints, high-priority hotspots, and Road Passport excavation segments. Click any marker to open its record.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <CivicMap
                  issues={filteredIssues}
                  passports={passports}
                  heightClass="h-[520px]"
                  onOpenIssue={(id) => setSelectedIssueId(id)}
                />
              </div>
            </div>
          )}

          {/* ROAD PASSPORT TAB */}
          {activeTab === 'road_passport' && (
            <RoadPassportView user={user} taxonomy={taxonomy} initialSelectedId={selectedPassportId} />
          )}

          {/* ANALYTICS & REPORTS TAB */}
          {activeTab === 'analytics' && analytics && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">Analytics & Governance Reports</h1>
                  <p className="text-sm text-slate-600">
                    Statewide, district, municipality, and department resolution benchmarks.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-slate-800"
                >
                  <Download className="w-4 h-4" />
                  Download CSV Report
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <h2 className="text-base font-bold text-[#0B1F3A]">Complaints by Issue Category</h2>
                  <CategoryDistributionChart data={analytics.byCategory} />
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <h2 className="text-base font-bold text-[#0B1F3A]">Municipality-Wise Breakdown</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                          <th className="py-2 pr-3">Municipality</th>
                          <th className="py-2 px-3 text-right">Total</th>
                          <th className="py-2 px-3 text-right">Resolved</th>
                          <th className="py-2 pl-3 text-right">Overdue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {analytics.byMunicipality.map((m) => (
                          <tr key={m.id}>
                            <td className="py-2.5 pr-3 font-medium text-[#0B1F3A]">{m.name}</td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">{m.total}</td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-teal-700">{m.resolved}</td>
                            <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-red-700">{m.overdue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="text-base font-bold text-[#0B1F3A]">Department Comparison</h2>
                <DepartmentPerformanceChart data={analytics.byDepartment} />
              </div>
            </div>
          )}

          {/* DISTRICTS & PLACES MANAGEMENT TAB */}
          {activeTab === 'locations' && (
            <LocationManagerPanel
              user={user}
              taxonomy={taxonomy}
              onTaxonomyChanged={onTaxonomyChanged}
            />
          )}

          {/* FIELD OFFICERS MANAGEMENT TAB */}
          {activeTab === 'field_officers' && (
            <FieldOfficerManagerPanel user={user} taxonomy={taxonomy} />
          )}

          {/* NOTIFICATIONS TAB */}
          {activeTab === 'notifications' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">Notifications Center</h1>
                  <p className="text-sm text-slate-600">Real-time updates for complaint routing, inspections, repairs, and escalations.</p>
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      await api.markAllNotificationsRead();
                      await refreshWorkspace();
                    }}
                    className="px-3.5 py-2 text-xs font-semibold text-[#0B1F3A] bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    Mark All Read
                  </button>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">No notifications yet.</div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-4 flex flex-wrap items-start justify-between gap-4 ${
                        n.isRead ? 'bg-white' : 'bg-teal-50/40'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-[#0B1F3A]">
                          {n.title}
                          {!n.isRead && <span className="ml-2 text-[11px] font-semibold text-[#0D9488]">New</span>}
                        </div>
                        <p className="text-xs text-slate-600">{n.message}</p>
                        <div className="text-[11px] font-mono text-slate-400">
                          {new Date(n.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {n.complaintCode && (
                          <button
                            type="button"
                            onClick={() => setSelectedIssueId(n.issueId || n.complaintCode!)}
                            className="text-xs font-semibold text-[#0D9488] hover:underline"
                          >
                            Open {n.complaintCode}
                          </button>
                        )}
                        {!n.isRead && (
                          <button
                            type="button"
                            onClick={async () => {
                              await api.markNotificationRead(n.id);
                              await refreshWorkspace();
                            }}
                            className="text-xs text-slate-500 hover:text-slate-800"
                          >
                            Mark Read
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* COMPANY ADMIN GOVERNANCE TABS */}
          {(activeTab === 'admin_accounts' || activeTab === 'admin_jurisdictions' || activeTab === 'admin_audit') && (
            <CompanyAdminConsole
              taxonomy={taxonomy}
              initialSection={
                activeTab === 'admin_accounts'
                  ? 'accounts'
                  : activeTab === 'admin_jurisdictions'
                    ? 'jurisdictions'
                    : 'audit'
              }
              onTaxonomyChanged={onTaxonomyChanged}
            />
          )}
        </main>
      </div>

      {/* Complaint Detail & Action Modal */}
      {selectedIssueId && (
        <IssueDetailModal
          issueId={selectedIssueId}
          user={user}
          departments={taxonomy.departments}
          onClose={() => setSelectedIssueId(null)}
          onUpdated={refreshWorkspace}
          onOpenRoadPassport={(rpId) => {
            setSelectedPassportId(rpId);
            setActiveTab('road_passport');
          }}
        />
      )}
    </div>
  );
};
