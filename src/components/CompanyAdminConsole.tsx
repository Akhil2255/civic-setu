import React, { useEffect, useState } from 'react';
import { Plus, Shield, UserCheck, UserX } from 'lucide-react';
import { api, type TaxonomyData } from '../lib/api';
import {
  DEFAULT_ISSUE_CATEGORIES,
  type AuditLogEntry,
  type DepartmentJurisdiction,
  type IssueCategoryConfig,
  type UserAccount,
  type UserRole,
} from '../lib/types';

interface CompanyAdminConsoleProps {
  taxonomy: TaxonomyData;
  initialSection?: 'accounts' | 'jurisdictions' | 'categories' | 'audit';
  onTaxonomyChanged: () => void;
}

export const CompanyAdminConsole: React.FC<CompanyAdminConsoleProps> = ({
  taxonomy,
  initialSection = 'accounts',
  onTaxonomyChanged,
}) => {
  const [section, setSection] = useState(initialSection);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [jurisdictions, setJurisdictions] = useState<DepartmentJurisdiction[]>([]);
  const [categories, setCategories] = useState<IssueCategoryConfig[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Create Account state
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('DemoPass#2026');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('municipality_admin');
  const [newDistId, setNewDistId] = useState(taxonomy.districts[0]?.id || 'dist-ekm');
  const [newMuniId, setNewMuniId] = useState(taxonomy.municipalities[0]?.id || 'mun-mlt');
  const [newDeptId, setNewDeptId] = useState(taxonomy.departments[0]?.id || 'dept-pwd');

  // Assign Jurisdiction state
  const [jurDeptId, setJurDeptId] = useState(taxonomy.departments[0]?.id || 'dept-pwd');
  const [jurMuniId, setJurMuniId] = useState(taxonomy.municipalities[0]?.id || 'mun-mlt');
  const [jurSla, setJurSla] = useState(48);
  const [jurCategories, setJurCategories] = useState<string[]>(['Potholes', 'Damaged roads']);

  // New Category state
  const [catName, setCatName] = useState('');
  const [catDeptCode, setCatDeptCode] = useState('PWD');
  const [catSla, setCatSla] = useState(48);
  const [catDesc, setCatDesc] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminOverview();
      setUsers(res.users);
      setJurisdictions(res.jurisdictions);
      setCategories(res.categories);
      setAuditLogs(res.auditLogs);
    } catch (err: any) {
      setError(err.message || 'Failed to load admin overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.createAdminUser({
        email: newEmail,
        password: newPassword,
        fullName: newName,
        role: newRole,
        stateId: 'st-kl',
        districtId: newDistId,
        municipalityId: newMuniId,
        departmentId: newRole === 'department_admin' || newRole === 'field_officer' ? newDeptId : null,
      });
      setNewEmail('');
      setNewName('');
      setMessage(`Created ${newRole.replace('_', ' ')} account successfully.`);
      await load();
    } catch (err: any) {
      setError(err.message || 'Unable to create user.');
    }
  };

  const handleToggleUser = async (userId: string) => {
    setError('');
    try {
      await api.toggleUserActive(userId);
      await load();
    } catch (err: any) {
      setError(err.message || 'Unable to toggle account status.');
    }
  };

  const handleSaveJurisdiction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.assignJurisdiction({
        departmentId: jurDeptId,
        municipalityId: jurMuniId,
        handledCategories: jurCategories,
        slaHours: jurSla,
      });
      setMessage('Department jurisdiction & category routing rules updated.');
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to update jurisdiction.');
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.createCategory({
        name: catName,
        defaultDepartmentCode: catDeptCode,
        slaHours: catSla,
        description: catDesc,
      });
      setCatName('');
      setCatDesc('');
      setMessage('Issue category added.');
      await load();
      onTaxonomyChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to add category.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">Platform Governance & Administration</h1>
          <p className="text-sm text-slate-600">
            Manage official accounts, municipal jurisdictions, issue categories, and inspect platform-wide audit logs.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          {(
            [
              ['accounts', 'Accounts'],
              ['jurisdictions', 'Jurisdictions'],
              ['categories', 'Categories'],
              ['audit', 'Audit Logs'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                section === id ? 'bg-white text-[#0B1F3A] shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>}
      {message && <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-sm text-teal-900">{message}</div>}

      {loading ? (
        <div className="p-10 bg-white border border-slate-200 rounded-xl text-center text-sm text-slate-500">
          Loading governance data...
        </div>
      ) : (
        <>
          {section === 'accounts' && (
            <div className="space-y-6">
              <form onSubmit={handleCreateUser} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="text-base font-bold text-[#0B1F3A] flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#0D9488]" />
                  Provision Official / Field Account
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g., Er. Sreejith Varma"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="officer@pwdconnect.demo"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as UserRole)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="state_admin">State Government Admin</option>
                      <option value="district_admin">District Government Admin</option>
                      <option value="municipality_admin">Municipality Administrator</option>
                      <option value="department_admin">Department Administrator</option>
                      <option value="field_officer">Field Officer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">District</label>
                    <select
                      value={newDistId}
                      onChange={(e) => setNewDistId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {taxonomy.districts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Municipality</label>
                    <select
                      value={newMuniId}
                      onChange={(e) => setNewMuniId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {taxonomy.municipalities.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Department (if applicable)</label>
                    <select
                      value={newDeptId}
                      onChange={(e) => setNewDeptId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {taxonomy.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-slate-800"
                  >
                    Create Official Account
                  </button>
                  <span className="text-xs text-slate-500">Initial demo password: {newPassword}</span>
                </div>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4">User</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Email</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-semibold text-[#0B1F3A]">{u.fullName}</td>
                          <td className="py-3 px-4 text-xs font-mono text-slate-700">{u.role}</td>
                          <td className="py-3 px-4 text-xs font-mono text-slate-600">{u.email}</td>
                          <td className="py-3 px-4 text-xs font-semibold">
                            {u.isActive ? (
                              <span className="text-teal-700 inline-flex items-center gap-1">
                                <UserCheck className="w-3.5 h-3.5" /> Active
                              </span>
                            ) : (
                              <span className="text-red-700 inline-flex items-center gap-1">
                                <UserX className="w-3.5 h-3.5" /> Inactive
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleToggleUser(u.id)}
                              className="text-xs font-semibold text-[#0B1F3A] hover:underline"
                            >
                              {u.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {section === 'jurisdictions' && (
            <div className="space-y-6">
              <form onSubmit={handleSaveJurisdiction} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-[#0B1F3A]">Configure Department Jurisdiction & SLA Rules</h2>
                  <span className="text-xs text-slate-500">
                    To add new districts or places, use the Districts & Places tab in the sidebar.
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Municipality</label>
                    <select
                      value={jurMuniId}
                      onChange={(e) => setJurMuniId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {taxonomy.municipalities.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                    <select
                      value={jurDeptId}
                      onChange={(e) => setJurDeptId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {taxonomy.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">SLA Target (Hours)</label>
                    <input
                      type="number"
                      min={6}
                      max={240}
                      value={jurSla}
                      onChange={(e) => setJurSla(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">Handled Issue Categories</div>
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_ISSUE_CATEGORIES.map((cat) => {
                      const checked = jurCategories.includes(cat);
                      return (
                        <label
                          key={cat}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${
                            checked
                              ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setJurCategories((prev) =>
                                prev.includes(cat) ? prev.filter((x) => x !== cat) : [...prev, cat]
                              )
                            }
                            className="hidden"
                          />
                          {cat}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#0D9488] rounded-lg hover:bg-teal-700"
                >
                  Save Jurisdiction Mapping
                </button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4">Municipality</th>
                        <th className="py-3 px-4">Department</th>
                        <th className="py-3 px-4">Routed Categories</th>
                        <th className="py-3 px-4 text-right">SLA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {jurisdictions.map((j) => (
                        <tr key={j.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-semibold text-[#0B1F3A]">{j.municipalityName}</td>
                          <td className="py-3 px-4 text-slate-700">{j.departmentName}</td>
                          <td className="py-3 px-4 text-slate-600">{j.handledCategories.join(' · ')}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-teal-700 font-semibold">
                            {j.slaHours}h
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {section === 'categories' && (
            <div className="space-y-6">
              <form onSubmit={handleCreateCategory} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="text-base font-bold text-[#0B1F3A]">Add Issue Category</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Category Name</label>
                    <input
                      type="text"
                      required
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      placeholder="e.g., Traffic Signal Outage"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Default Department Code</label>
                    <select
                      value={catDeptCode}
                      onChange={(e) => setCatDeptCode(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {taxonomy.departments.map((d) => (
                        <option key={d.id} value={d.code}>
                          {d.code} — {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Default SLA (Hours)</label>
                    <input
                      type="number"
                      min={4}
                      max={240}
                      value={catSla}
                      onChange={(e) => setCatSla(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                  <input
                    type="text"
                    required
                    value={catDesc}
                    onChange={(e) => setCatDesc(e.target.value)}
                    placeholder="Scope and routing criteria..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-slate-800"
                >
                  Save Category
                </button>
              </form>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categories.map((c) => (
                  <div key={c.id} className="p-4 bg-white border border-slate-200 rounded-xl flex justify-between gap-4">
                    <div>
                      <div className="font-bold text-sm text-[#0B1F3A]">{c.name}</div>
                      <p className="text-xs text-slate-600 mt-0.5">{c.description}</p>
                    </div>
                    <div className="text-right text-xs font-mono shrink-0">
                      <div className="text-teal-700 font-semibold">{c.defaultDepartmentCode}</div>
                      <div className="text-slate-500 tabular-nums">{c.slaHours}h</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === 'audit' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#0D9488]" />
                <h2 className="text-base font-bold text-[#0B1F3A]">Immutable Platform Audit Log</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <div key={log.id} className="px-6 py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-mono font-semibold text-[#0B1F3A]">
                        {log.action} · {log.entityType} ({log.entityId})
                      </div>
                      <div className="text-slate-600">{log.details}</div>
                      <div className="text-slate-400">
                        Actor: {log.actorName} ({log.actorRole})
                      </div>
                    </div>
                    <span className="font-mono tabular-nums text-slate-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
