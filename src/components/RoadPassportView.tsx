import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, ScanEye, ShieldAlert } from 'lucide-react';
import { api, type TaxonomyData } from '../lib/api';
import type { RoadPassport, UserAccount } from '../lib/types';
import { CivicMap } from './CivicMap';

interface RoadPassportViewProps {
  user: UserAccount;
  taxonomy: TaxonomyData;
  initialSelectedId?: string | null;
}

export const RoadPassportView: React.FC<RoadPassportViewProps> = ({ user, taxonomy, initialSelectedId }) => {
  const [passports, setPassports] = useState<RoadPassport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [loading, setLoading] = useState(true);
  const [filterFlagged, setFilterFlagged] = useState<'all' | 'flagged' | 'repeat'>('all');
  const [aiBusy, setAiBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [municipalityId, setMunicipalityId] = useState(user.municipalityId || taxonomy.municipalities[0]?.id || 'mun-mlt');
  const [departmentId, setDepartmentId] = useState(user.departmentId || taxonomy.departments[0]?.id || 'dept-pwd');
  const [purpose, setPurpose] = useState('');
  const [workStartDate, setWorkStartDate] = useState('2026-11-22');
  const [expectedCompletionDate, setExpectedCompletionDate] = useState('2026-11-26');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getRoadPassports();
      setPassports(res.passports);
      if (!selectedId && res.passports.length > 0) {
        setSelectedId(initialSelectedId || res.passports[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Road Passports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = passports.filter((p) => {
    if (filterFlagged === 'flagged') return p.flaggedForInspection || p.workStatus === 'Overdue' || p.workStatus === 'Flagged';
    if (filterFlagged === 'repeat') return p.repeatDigCount > 1;
    return true;
  });

  const active = passports.find((p) => p.id === selectedId) || filtered[0] || null;
  const canCreate = ['company_admin', 'state_admin', 'district_admin', 'municipality_admin', 'department_admin'].includes(
    user.role
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.createRoadPassport({
        assetName,
        municipalityId,
        departmentId,
        purpose,
        workStartDate,
        expectedCompletionDate,
      });
      setShowCreate(false);
      setAssetName('');
      setPurpose('');
      setFeedback(`Registered Road Passport ${res.passport.passportCode}.`);
      await load();
      setSelectedId(res.passport.id);
    } catch (err: any) {
      setError(err.message || 'Unable to register Road Passport.');
    }
  };

  const handleAiCompare = async (passportId: string) => {
    setAiBusy(true);
    setError('');
    setFeedback('');
    try {
      const res = await api.compareRoadPassportAi(passportId);
      setPassports((prev) => prev.map((p) => (p.id === passportId ? res.passport : p)));
      setFeedback(
        `AI Restoration Audit Score: ${res.comparison.score}/100 (${res.comparison.flaggedForInspection ? 'Flagged for inspection' : 'Verification passed'}).`
      );
    } catch (err: any) {
      setError(err.message || 'AI photo comparison failed.');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">Road Passport Digital Registry</h1>
          <p className="text-sm text-slate-600">
            Track road excavations, detect repeated digging corridors, monitor overdue restoration, and audit before-and-after surface quality.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-slate-800 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Register Road Passport
          </button>
        )}
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>}
      {feedback && <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-sm text-teal-900">{feedback}</div>}

      {showCreate && (
        <form onSubmit={handleCreate} className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
          <h2 className="text-base font-bold text-[#0B1F3A]">New Excavation & Restoration Passport</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Road / Asset Name</label>
              <input
                type="text"
                required
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="e.g., Mulanthuruthy Market Junction"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Municipality</label>
              <select
                value={municipalityId}
                onChange={(e) => setMunicipalityId(e.target.value)}
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Responsible Department</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {taxonomy.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Purpose of Excavation / Repair</label>
              <input
                type="text"
                required
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g., Underground fiber duct & stormwater culvert tie-in"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                <input
                  type="date"
                  required
                  value={workStartDate}
                  onChange={(e) => setWorkStartDate(e.target.value)}
                  className="w-full px-2 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Expected End</label>
                <input
                  type="date"
                  required
                  value={expectedCompletionDate}
                  onChange={(e) => setExpectedCompletionDate(e.target.value)}
                  className="w-full px-2 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              className="px-4 py-2 text-sm font-semibold text-white bg-[#0D9488] rounded-lg hover:bg-teal-700"
            >
              Issue Digital Road Passport
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar + Summary Counts */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setFilterFlagged('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              filterFlagged === 'all' ? 'bg-white text-[#0B1F3A] shadow-sm' : 'text-slate-600'
            }`}
          >
            All Passports ({passports.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterFlagged('flagged')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              filterFlagged === 'flagged' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-600'
            }`}
          >
            Overdue / Flagged ({passports.filter((p) => p.flaggedForInspection || p.workStatus === 'Overdue').length})
          </button>
          <button
            type="button"
            onClick={() => setFilterFlagged('repeat')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              filterFlagged === 'repeat' ? 'bg-white text-amber-800 shadow-sm' : 'text-slate-600'
            }`}
          >
            Repeat Dig Zones ({passports.filter((p) => p.repeatDigCount > 1).length})
          </button>
        </div>
        <div className="text-xs text-slate-500">
          Linked to Complaint Workflow · GPS-indexed infrastructure asset history
        </div>
      </div>

      {/* Main Split: Passport List + Detailed Inspection Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-3">
          {loading ? (
            <div className="p-8 bg-white border border-slate-200 rounded-xl text-center text-sm text-slate-500">
              Loading Road Passports...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 bg-white border border-slate-200 rounded-xl text-center text-sm text-slate-500">
              No Road Passports match this filter.
            </div>
          ) : (
            filtered.map((rp) => {
              const isSelected = active?.id === rp.id;
              return (
                <button
                  key={rp.id}
                  type="button"
                  onClick={() => setSelectedId(rp.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    isSelected
                      ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                      : 'bg-white text-slate-900 border-slate-200 hover:border-teal-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`font-mono text-xs font-semibold ${isSelected ? 'text-teal-300' : 'text-teal-700'}`}>
                      {rp.passportCode}
                      {rp.linkedComplaintCode ? ` · ${rp.linkedComplaintCode}` : ''}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        rp.workStatus === 'Overdue' || rp.flaggedForInspection
                          ? isSelected
                            ? 'text-amber-300'
                            : 'text-red-700'
                          : isSelected
                            ? 'text-slate-200'
                            : 'text-slate-600'
                      }`}
                    >
                      {rp.workStatus}
                    </span>
                  </div>
                  <div className="font-semibold text-sm">{rp.assetName}</div>
                  <div className={`text-xs mt-1 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                    {rp.municipalityName} · {rp.departmentName} · Repeat Digs: {rp.repeatDigCount}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="lg:col-span-7 space-y-6">
          {active && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="text-xs font-mono font-semibold text-teal-700">
                    {active.passportCode} · Asset {active.assetId}
                  </div>
                  <h2 className="text-xl font-bold text-[#0B1F3A] mt-0.5">{active.assetName}</h2>
                  <p className="text-sm text-slate-600 mt-1">{active.purpose}</p>
                </div>
                <div className="text-right text-xs space-y-1">
                  <div className="font-semibold text-[#0B1F3A]">{active.workStatus}</div>
                  <div className="font-mono tabular-nums text-slate-500">
                    {active.workStartDate} &rarr; {active.expectedCompletionDate}
                  </div>
                </div>
              </div>

              {/* Repeat Dig & Flagged Warnings */}
              {(active.repeatDigCount > 1 || active.flaggedForInspection) && (
                <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
                  <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Repeat Excavation / Inspection Alert: </span>
                    Logged {active.repeatDigCount} excavation events at this coordinate corridor.{' '}
                    {active.inspectionResult}
                  </div>
                </div>
              )}

              {/* Before vs After Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-700">Original / Before Condition</div>
                  <img
                    src={active.beforePhotoUrl}
                    alt={`Before condition for ${active.assetName}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-44 object-cover rounded-lg border border-slate-200 bg-slate-100"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-700">Post-Restoration Condition</div>
                  {active.afterPhotoUrl ? (
                    <img
                      src={active.afterPhotoUrl}
                      alt={`After restoration for ${active.assetName}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-44 object-cover rounded-lg border border-slate-200 bg-slate-100"
                    />
                  ) : (
                    <div className="w-full h-44 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-xs text-slate-500 p-4 text-center">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mb-1.5" />
                      Restoration photograph pending department completion upload.
                    </div>
                  )}
                </div>
              </div>

              {/* AI Before-and-After Restoration Audit */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-[#0B1F3A]">AI Before-and-After Restoration Audit</div>
                    <div className="text-xs text-slate-600">
                      {active.aiComparisonSummary || 'Run multimodal comparison to verify surface quality and flag incomplete patches.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={aiBusy}
                    onClick={() => handleAiCompare(active.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0D9488] rounded-lg hover:bg-teal-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    <ScanEye className="w-4 h-4" />
                    {aiBusy ? 'Comparing Photos...' : 'Run AI Comparison'}
                  </button>
                </div>
                {typeof active.aiComparisonScore === 'number' && (
                  <div className="flex items-center gap-4 pt-2 border-t border-slate-200 text-xs">
                    <span className="font-mono tabular-nums font-semibold text-[#0B1F3A]">
                      Quality Score: {active.aiComparisonScore}/100
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                      {active.flaggedForInspection ? (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> Flagged for Human Inspection
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" /> Surface Restoration Acceptable
                        </>
                      )}
                    </span>
                    <span>Citizen Verification: {active.citizenVerificationStatus}</span>
                  </div>
                )}
              </div>

              {/* Digital History Log */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Digital Asset History</h3>
                <div className="space-y-2">
                  {active.history.map((entry, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-4 text-xs py-1.5 border-b border-slate-100">
                      <div>
                        <span className="font-semibold text-[#0B1F3A]">{entry.actor}:</span>{' '}
                        <span className="text-slate-700">{entry.note}</span>
                      </div>
                      <span className="font-mono tabular-nums text-[11px] text-slate-400 whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Road Passport Map */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-[#0B1F3A]">Road Passport Geospatial Corridor Map</h3>
            <CivicMap passports={filtered} heightClass="h-[280px]" />
          </div>
        </div>
      </div>
    </div>
  );
};
