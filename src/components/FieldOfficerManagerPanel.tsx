import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Search,
  UserCheck,
  UserPlus,
  UserX,
  Wrench,
} from 'lucide-react';
import { api, type TaxonomyData } from '../lib/api';
import {
  DESIGNATED_FIELD_ROLES,
  type FieldOfficerRecord,
  type UserAccount,
} from '../lib/types';
import { canManageFieldOfficers } from '../lib/workflow';

interface FieldOfficerManagerPanelProps {
  user: UserAccount;
  taxonomy: TaxonomyData;
}

const CUSTOM_ROLE_VALUE = '__custom__';

export const FieldOfficerManagerPanel: React.FC<FieldOfficerManagerPanelProps> = ({
  user,
  taxonomy,
}) => {
  const allowed = canManageFieldOfficers(user);

  const scopedMunicipalities = useMemo(() => {
    return taxonomy.municipalities.filter((m) => {
      if (user.role === 'municipality_admin' && user.municipalityId) {
        return m.id === user.municipalityId;
      }
      if (user.role === 'district_admin' && user.districtId) {
        return m.districtId === user.districtId;
      }
      if (user.stateId) {
        return m.stateId === user.stateId;
      }
      return true;
    });
  }, [taxonomy.municipalities, user.role, user.municipalityId, user.districtId, user.stateId]);

  const defaultDept = taxonomy.departments[0];
  const getDefaultRoleForDeptCode = (code?: string) => {
    const match = DESIGNATED_FIELD_ROLES.find((g) => g.departmentCode === code);
    return match?.roles[0] || DESIGNATED_FIELD_ROLES[0].roles[0];
  };

  const [officers, setOfficers] = useState<FieldOfficerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('Officer#2026');
  const [showPassword, setShowPassword] = useState(false);
  const [departmentId, setDepartmentId] = useState(defaultDept?.id || 'dept-pwd');
  const [municipalityId, setMunicipalityId] = useState(
    user.municipalityId || scopedMunicipalities[0]?.id || 'mun-mlt'
  );
  const [selectedRole, setSelectedRole] = useState(getDefaultRoleForDeptCode(defaultDept?.code));
  const [customRole, setCustomRole] = useState('');

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDeptId, setFilterDeptId] = useState('');

  const loadOfficers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getFieldOfficers(true);
      setOfficers(res.fieldOfficers);
    } catch (err: any) {
      setError(err.message || 'Failed to load field officers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) {
      loadOfficers();
    }
  }, [user.id, allowed]);

  useEffect(() => {
    if (!departmentId && taxonomy.departments[0]) {
      setDepartmentId(taxonomy.departments[0].id);
      setSelectedRole(getDefaultRoleForDeptCode(taxonomy.departments[0].code));
    }
  }, [taxonomy.departments, departmentId]);

  useEffect(() => {
    if (
      scopedMunicipalities.length > 0 &&
      (!municipalityId || !scopedMunicipalities.some((m) => m.id === municipalityId))
    ) {
      setMunicipalityId(user.municipalityId || scopedMunicipalities[0].id);
    }
  }, [scopedMunicipalities, municipalityId, user.municipalityId]);

  const activeDepartment = useMemo(
    () => taxonomy.departments.find((d) => d.id === departmentId),
    [taxonomy.departments, departmentId]
  );

  const handleDepartmentChange = (nextDeptId: string) => {
    setDepartmentId(nextDeptId);
    const dept = taxonomy.departments.find((d) => d.id === nextDeptId);
    if (dept && selectedRole !== CUSTOM_ROLE_VALUE) {
      setSelectedRole(getDefaultRoleForDeptCode(dept.code));
    }
  };

  const handleCreateOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');

    const effectiveDesignation =
      selectedRole === CUSTOM_ROLE_VALUE ? customRole.trim() : selectedRole.trim();

    if (effectiveDesignation.length < 2) {
      setError('Please enter a designated role title for this field officer.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.createFieldOfficer({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
        departmentId,
        municipalityId: user.role === 'municipality_admin' && user.municipalityId ? user.municipalityId : municipalityId,
        designation: effectiveDesignation,
      });

      setFullName('');
      setEmail('');
      setPhone('');
      setCustomRole('');
      setFeedback(
        `Added ${res.fieldOfficer.fullName} as "${res.fieldOfficer.designation}" under ${res.fieldOfficer.departmentName}. They can now be assigned to repairs and sign in via the Department & Field Officer portal.`
      );
      await loadOfficers();
    } catch (err: any) {
      setError(err.message || 'Unable to add field officer.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (officer: FieldOfficerRecord) => {
    setError('');
    setFeedback('');
    setTogglingId(officer.id);
    try {
      const res = await api.toggleFieldOfficerActive(officer.id);
      setOfficers((prev) =>
        prev.map((o) => (o.id === officer.id ? { ...o, isActive: res.isActive } : o))
      );
      setFeedback(
        `${officer.fullName} is now ${res.isActive ? 'Active' : 'Inactive'}.`
      );
    } catch (err: any) {
      setError(err.message || 'Unable to update field officer status.');
    } finally {
      setTogglingId(null);
    }
  };

  const filteredOfficers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return officers.filter((o) => {
      if (filterDeptId && o.departmentId !== filterDeptId) return false;
      if (!q) return true;
      return (
        o.fullName.toLowerCase().includes(q) ||
        o.email.toLowerCase().includes(q) ||
        o.designation.toLowerCase().includes(q) ||
        o.departmentName.toLowerCase().includes(q)
      );
    });
  }, [officers, filterDeptId, searchQuery]);

  if (!allowed) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
        Your role does not have permission to manage department field officers.
      </div>
    );
  }

  const departmentRoleGroup = DESIGNATED_FIELD_ROLES.find(
    (g) => g.departmentCode === activeDepartment?.code
  );
  const otherRoleGroups = DESIGNATED_FIELD_ROLES.filter(
    (g) => g.departmentCode !== activeDepartment?.code
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">
            Department Field Officers & Designated Roles
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Add field engineers, inspectors, and technical supervisors to designated department roles within your
            jurisdiction.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-600">
          Active Roster:{' '}
          <span className="font-mono tabular-nums font-bold text-[#0B1F3A]">
            {officers.filter((o) => o.isActive !== false).length}
          </span>{' '}
          / <span className="font-mono tabular-nums">{officers.length}</span> officers
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
      )}
      {feedback && (
        <div className="p-3.5 rounded-lg bg-teal-50 border border-teal-200 text-sm text-teal-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#0D9488] shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Add Field Officer Form */}
      <form
        onSubmit={handleCreateOfficer}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <UserPlus className="w-4 h-4 text-[#0D9488]" />
          <h2 className="text-base font-bold text-[#0B1F3A]">Add Department Field Officer</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label htmlFor="fo-department" className="block text-xs font-semibold text-slate-700 mb-1">
              Department
            </label>
            <select
              id="fo-department"
              value={departmentId}
              onChange={(e) => handleDepartmentChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {taxonomy.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="fo-designation" className="block text-xs font-semibold text-slate-700 mb-1">
              Designated Role
            </label>
            <select
              id="fo-designation"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {departmentRoleGroup && (
                <optgroup label={`Recommended for ${activeDepartment?.name || departmentRoleGroup.departmentCode}`}>
                  {departmentRoleGroup.roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherRoleGroups.map((group) => (
                <optgroup key={group.departmentCode} label={`${group.departmentCode} Roles`}>
                  {group.roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value={CUSTOM_ROLE_VALUE}>Custom Designated Role...</option>
            </select>
          </div>

          <div>
            <label htmlFor="fo-municipality" className="block text-xs font-semibold text-slate-700 mb-1">
              Assigned Municipality / Place
            </label>
            <select
              id="fo-municipality"
              value={municipalityId}
              disabled={user.role === 'municipality_admin' && Boolean(user.municipalityId)}
              onChange={(e) => setMunicipalityId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-50 disabled:text-slate-600"
            >
              {scopedMunicipalities.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.type})
                </option>
              ))}
            </select>
          </div>

          {selectedRole === CUSTOM_ROLE_VALUE && (
            <div className="sm:col-span-2 lg:col-span-3">
              <label htmlFor="fo-custom-designation" className="block text-xs font-semibold text-slate-700 mb-1">
                Custom Designated Role Title
              </label>
              <input
                id="fo-custom-designation"
                type="text"
                required
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                placeholder="e.g., Senior Culvert & Bridge Inspector"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          )}

          <div>
            <label htmlFor="fo-full-name" className="block text-xs font-semibold text-slate-700 mb-1">
              Officer Full Name
            </label>
            <input
              id="fo-full-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g., Er. Vineeth Menon"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="fo-email" className="block text-xs font-semibold text-slate-700 mb-1">
              Official Email
            </label>
            <input
              id="fo-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="officer.name@pwdconnect.demo"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="fo-phone" className="block text-xs font-semibold text-slate-700 mb-1">
              Phone Number (Optional)
            </label>
            <input
              id="fo-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98470 60010"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="fo-password" className="block text-xs font-semibold text-slate-700 mb-1">
              Initial Portal Password (min 8 chars)
            </label>
            <div className="relative">
              <input
                id="fo-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-3 pr-9 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-xs text-slate-500">
            New officers are immediately selectable by department admins during field dispatch and can sign in under the
            Department & Field Officer portal.
          </span>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0D9488] rounded-lg hover:bg-teal-700 disabled:opacity-60 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            {submitting ? 'Adding Field Officer...' : 'Add Field Officer'}
          </button>
        </div>
      </form>

      {/* Roster Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-2">
            <Wrench className="w-4 h-4 text-[#0D9488]" />
            Department Field Officers Roster
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                aria-label="Search field officers"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search officer or role..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <select
              aria-label="Filter officers by department"
              value={filterDeptId}
              onChange={(e) => setFilterDeptId(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">All Departments</option>
              {taxonomy.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading field officers...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Officer</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Designated Role</th>
                  <th className="py-3 px-4">Municipality</th>
                  <th className="py-3 px-4 text-right">Active Tasks</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredOfficers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                      No field officers found matching your filter.
                    </td>
                  </tr>
                ) : (
                  filteredOfficers.map((officer) => {
                    const active = officer.isActive !== false;
                    return (
                      <tr key={officer.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#0B1F3A]">{officer.fullName}</div>
                          <div className="text-xs font-mono text-slate-500">{officer.email}</div>
                          {officer.phone && <div className="text-xs text-slate-500">{officer.phone}</div>}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700 font-medium">
                          {officer.departmentName}
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold text-[#0B1F3A]">
                          {officer.designation}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                          {officer.municipalityName}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                          {officer.activeCount ?? 0}
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold whitespace-nowrap">
                          {active ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800">
                              <UserCheck className="w-3 h-3 text-emerald-600" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-300 bg-slate-100 text-slate-600">
                              <UserX className="w-3 h-3 text-slate-500" />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            disabled={togglingId === officer.id}
                            aria-label={`${active ? 'Deactivate' : 'Activate'} ${officer.fullName}`}
                            onClick={() => handleToggleActive(officer)}
                            className="text-xs font-semibold text-[#0B1F3A] hover:underline disabled:opacity-50 cursor-pointer"
                          >
                            {active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
