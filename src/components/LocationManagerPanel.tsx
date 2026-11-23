import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Globe2, MapPin, Plus, Search } from 'lucide-react';
import { api, type TaxonomyData } from '../lib/api';
import { LOCATION_STATUSES, type LocationStatus, type UserAccount } from '../lib/types';
import {
  canCreateDistrict,
  canCreatePlace,
  canUpdateDistrictStatus,
  canUpdatePlaceStatus,
} from '../lib/workflow';
import { CivicMap } from './CivicMap';
import { LocationStatusBadge } from './StatusComponents';

interface LocationManagerPanelProps {
  user: UserAccount;
  taxonomy: TaxonomyData;
  onTaxonomyChanged: () => Promise<void> | void;
}

const PLACE_TYPES = [
  'Municipality',
  'Grama Panchayat',
  'Corporation',
  'Township',
  'Ward / Zone',
] as const;

export const LocationManagerPanel: React.FC<LocationManagerPanelProps> = ({
  user,
  taxonomy,
  onTaxonomyChanged,
}) => {
  const allowDistrictCreate = canCreateDistrict(user);
  const allowPlaceCreate = canCreatePlace(user);
  const allowDistrictStatusEdit = canUpdateDistrictStatus(user);
  const allowPlaceStatusEdit = canUpdatePlaceStatus(user);

  const availableStates = useMemo(() => {
    if (user.stateId) {
      return taxonomy.states.filter((s) => s.id === user.stateId);
    }
    return taxonomy.states;
  }, [taxonomy.states, user.stateId]);

  const [distStateId, setDistStateId] = useState(user.stateId || taxonomy.states[0]?.id || 'st-kl');
  const [distName, setDistName] = useState('');
  const [distStatus, setDistStatus] = useState<LocationStatus>('Active');
  const [distBusy, setDistBusy] = useState(false);

  const availableDistricts = useMemo(() => {
    return taxonomy.districts.filter((d) => {
      if (user.role === 'district_admin' && user.districtId) {
        return d.id === user.districtId;
      }
      if (user.stateId) {
        return d.stateId === user.stateId;
      }
      return true;
    });
  }, [taxonomy.districts, user.role, user.districtId, user.stateId]);

  const [placeDistrictId, setPlaceDistrictId] = useState(
    user.districtId || availableDistricts[0]?.id || ''
  );
  const [placeName, setPlaceName] = useState('');
  const [placeType, setPlaceType] = useState<string>('Municipality');
  const [placeStatus, setPlaceStatus] = useState<LocationStatus>('Active');
  const [centerLat, setCenterLat] = useState<number>(9.9312);
  const [centerLng, setCenterLng] = useState<number>(76.2673);
  const [placeBusy, setPlaceBusy] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [directoryDistrictFilter, setDirectoryDistrictFilter] = useState('');
  const [directoryStatusFilter, setDirectoryStatusFilter] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!distStateId && availableStates[0]?.id) {
      setDistStateId(availableStates[0].id);
    }
  }, [availableStates, distStateId]);

  useEffect(() => {
    if (
      availableDistricts.length > 0 &&
      (!placeDistrictId || !availableDistricts.some((d) => d.id === placeDistrictId))
    ) {
      setPlaceDistrictId(user.districtId || availableDistricts[0].id);
    }
  }, [availableDistricts, placeDistrictId, user.districtId]);

  const stateNameById = useMemo(
    () => new Map(taxonomy.states.map((s) => [s.id, s.name])),
    [taxonomy.states]
  );

  const districtNameById = useMemo(
    () => new Map(taxonomy.districts.map((d) => [d.id, d.name])),
    [taxonomy.districts]
  );

  const placeCountByDistrict = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of taxonomy.municipalities) {
      counts.set(m.districtId, (counts.get(m.districtId) || 0) + 1);
    }
    return counts;
  }, [taxonomy.municipalities]);

  const scopedPlaces = useMemo(() => {
    return taxonomy.municipalities.filter((m) => !user.stateId || m.stateId === user.stateId);
  }, [taxonomy.municipalities, user.stateId]);

  const filteredDistricts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return availableDistricts.filter((d) => {
      const status = d.status || 'Active';
      if (directoryStatusFilter && status !== directoryStatusFilter) return false;
      if (!q) return true;
      return d.name.toLowerCase().includes(q);
    });
  }, [availableDistricts, directoryStatusFilter, searchQuery]);

  const filteredPlaces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedPlaces.filter((m) => {
      const status = m.status || 'Active';
      if (directoryDistrictFilter && m.districtId !== directoryDistrictFilter) return false;
      if (directoryStatusFilter && status !== directoryStatusFilter) return false;
      if (!q) return true;
      const dName = (districtNameById.get(m.districtId) || '').toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        m.type.toLowerCase().includes(q) ||
        dName.includes(q)
      );
    });
  }, [scopedPlaces, directoryDistrictFilter, directoryStatusFilter, searchQuery, districtNameById]);

  const statusCounts = useMemo(() => {
    const entries = [...availableDistricts, ...scopedPlaces];
    return {
      active: entries.filter((item) => (item.status || 'Active') === 'Active').length,
      pending: entries.filter((item) => item.status === 'Pending Approval').length,
      archived: entries.filter((item) => item.status === 'Archived').length,
    };
  }, [availableDistricts, scopedPlaces]);

  const handleAddDistrict = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');
    const trimmed = distName.trim();
    if (trimmed.length < 2) {
      setError('Please enter a district name of at least 2 characters.');
      return;
    }
    setDistBusy(true);
    try {
      const res = await api.createDistrict({
        name: trimmed,
        stateId: user.stateId || distStateId || 'st-kl',
        status: distStatus,
      });
      await onTaxonomyChanged();
      setPlaceDistrictId(res.district.id);
      setDistName('');
      setDistStatus('Active');
      setFeedback(
        `District "${res.district.name}" added with status "${res.district.status}".`
      );
    } catch (err: any) {
      setError(err.message || 'Unable to add district.');
    } finally {
      setDistBusy(false);
    }
  };

  const handleAddPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');
    const trimmed = placeName.trim();
    if (trimmed.length < 2) {
      setError('Please enter a place or local body name of at least 2 characters.');
      return;
    }
    if (!placeDistrictId) {
      setError('Please select a district for this place.');
      return;
    }
    setPlaceBusy(true);
    try {
      const res = await api.createMunicipality({
        name: trimmed,
        districtId: placeDistrictId,
        type: placeType,
        centerLat: Number(centerLat),
        centerLng: Number(centerLng),
        status: placeStatus,
      });
      await onTaxonomyChanged();
      setPlaceName('');
      setPlaceStatus('Active');
      setFeedback(
        `Place "${res.name}" (${placeType}) added as "${res.municipality.status}" with coordinates ${Number(
          centerLat
        ).toFixed(4)}, ${Number(centerLng).toFixed(4)}.`
      );
    } catch (err: any) {
      setError(err.message || 'Unable to add place.');
    } finally {
      setPlaceBusy(false);
    }
  };

  const handleDistrictStatusChange = async (districtId: string, name: string, nextStatus: LocationStatus) => {
    setError('');
    setFeedback('');
    setUpdatingId(districtId);
    try {
      await api.updateDistrictStatus(districtId, nextStatus);
      await onTaxonomyChanged();
      setFeedback(`Updated district "${name}" status to "${nextStatus}".`);
    } catch (err: any) {
      setError(err.message || 'Failed to update district status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePlaceStatusChange = async (placeId: string, name: string, nextStatus: LocationStatus) => {
    setError('');
    setFeedback('');
    setUpdatingId(placeId);
    try {
      await api.updateMunicipalityStatus(placeId, nextStatus);
      await onTaxonomyChanged();
      setFeedback(`Updated place "${name}" status to "${nextStatus}".`);
    } catch (err: any) {
      setError(err.message || 'Failed to update place status.');
    } finally {
      setUpdatingId(null);
    }
  };

  if (!allowPlaceCreate && !allowDistrictCreate) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
        Your role does not have permission to manage districts or places.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">
            {allowDistrictCreate ? 'Districts & Places Management' : 'Places & Local Bodies Management'}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {allowDistrictCreate
              ? 'Register districts and places, review approval states, and archive retired local bodies.'
              : 'Register places, municipalities, or wards and track their approval or archive status.'}
          </p>
        </div>

        {/* Status Summary Legend */}
        <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs">
          <div className="flex items-center gap-1.5">
            <LocationStatusBadge status="Active" />
            <span className="font-mono tabular-nums font-semibold text-slate-700">{statusCounts.active}</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5">
            <LocationStatusBadge status="Pending Approval" />
            <span className="font-mono tabular-nums font-semibold text-slate-700">{statusCounts.pending}</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5">
            <LocationStatusBadge status="Archived" />
            <span className="font-mono tabular-nums font-semibold text-slate-700">{statusCounts.archived}</span>
          </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Government / Platform Admin Only: Add District */}
        {allowDistrictCreate && (
          <form
            onSubmit={handleAddDistrict}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4 self-start"
          >
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Globe2 className="w-4 h-4 text-[#0D9488]" />
              <h2 className="text-base font-bold text-[#0B1F3A]">Add New District</h2>
            </div>
            <p className="text-xs text-slate-600">
              Government administrators can expand platform coverage by adding new districts in their state.
            </p>

            <div>
              <label htmlFor="new-district-state" className="block text-xs font-semibold text-slate-700 mb-1">
                State
              </label>
              <select
                id="new-district-state"
                value={user.stateId || distStateId}
                disabled={Boolean(user.stateId)}
                onChange={(e) => setDistStateId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-50 disabled:text-slate-600"
              >
                {availableStates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="new-district-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  District Name
                </label>
                <input
                  id="new-district-name"
                  type="text"
                  required
                  value={distName}
                  onChange={(e) => setDistName(e.target.value)}
                  placeholder="e.g., Palakkad"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="new-district-status" className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Status
                </label>
                <select
                  id="new-district-status"
                  value={distStatus}
                  onChange={(e) => setDistStatus(e.target.value as LocationStatus)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {LOCATION_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={distBusy}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {distBusy ? 'Adding District...' : 'Add District'}
            </button>
          </form>
        )}

        {/* Municipality & Government Admins: Add Place / Local Body */}
        {allowPlaceCreate && (
          <form
            onSubmit={handleAddPlace}
            className={`${
              allowDistrictCreate ? 'lg:col-span-7' : 'lg:col-span-12'
            } bg-white border border-slate-200 rounded-xl p-6 space-y-4`}
          >
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <MapPin className="w-4 h-4 text-[#0D9488]" />
              <h2 className="text-base font-bold text-[#0B1F3A]">Add New Place / Local Body</h2>
            </div>
            <p className="text-xs text-slate-600">
              Active places automatically configure default routing rules for PWD, Electricity, Water, Drainage, Waste,
              and Municipal Engineering departments.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label htmlFor="new-place-district" className="block text-xs font-semibold text-slate-700 mb-1">
                  District
                </label>
                <select
                  id="new-place-district"
                  value={placeDistrictId}
                  onChange={(e) => setPlaceDistrictId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {availableDistricts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="new-place-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Place / Local Body Name
                </label>
                <input
                  id="new-place-name"
                  type="text"
                  required
                  value={placeName}
                  onChange={(e) => setPlaceName(e.target.value)}
                  placeholder="e.g., Piravom"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="new-place-type" className="block text-xs font-semibold text-slate-700 mb-1">
                  Administrative Type
                </label>
                <select
                  id="new-place-type"
                  value={placeType}
                  onChange={(e) => setPlaceType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {PLACE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="new-place-status" className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Status
                </label>
                <select
                  id="new-place-status"
                  value={placeStatus}
                  onChange={(e) => setPlaceStatus(e.target.value as LocationStatus)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {LOCATION_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="new-place-lat" className="block text-xs font-semibold text-slate-700 mb-1">
                  Center Latitude
                </label>
                <input
                  id="new-place-lat"
                  type="number"
                  step="0.0001"
                  required
                  value={centerLat}
                  onChange={(e) => setCenterLat(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="new-place-lng" className="block text-xs font-semibold text-slate-700 mb-1">
                  Center Longitude
                </label>
                <input
                  id="new-place-lng"
                  type="number"
                  step="0.0001"
                  required
                  value={centerLng}
                  onChange={(e) => setCenterLng(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-600">
                Optional: click anywhere on the map to pin the center coordinates for this place.
              </div>
              <CivicMap
                selectable
                selectedLat={centerLat}
                selectedLng={centerLng}
                heightClass="h-[220px]"
                onSelectLocation={(lat, lng) => {
                  setCenterLat(lat);
                  setCenterLng(lng);
                }}
              />
            </div>

            <button
              type="submit"
              disabled={placeBusy}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0D9488] rounded-lg hover:bg-teal-700 disabled:opacity-60 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {placeBusy ? 'Adding Place...' : 'Add Place'}
            </button>
          </form>
        )}
      </div>

      {/* Directory Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-bold text-[#0B1F3A]">Registered Jurisdictions Directory</div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              aria-label="Search registered districts and places"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search districts or places..."
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <select
            aria-label="Filter directory by status"
            value={directoryStatusFilter}
            onChange={(e) => setDirectoryStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Statuses</option>
            {LOCATION_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter places by district"
            value={directoryDistrictFilter}
            onChange={(e) => setDirectoryDistrictFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Districts</option>
            {availableDistricts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Directory of Registered Districts and Places */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden self-start">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#0D9488]" />
              Registered Districts
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {filteredDistricts.length} shown
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredDistricts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">No districts match your active filters.</div>
            ) : (
              filteredDistricts.map((d) => {
                const status = d.status || 'Active';
                return (
                  <div key={d.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[#0B1F3A]">{d.name}</span>
                        <LocationStatusBadge status={status} />
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span>{stateNameById.get(d.stateId) || d.stateId}</span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">
                          {(() => {
                            const count = placeCountByDistrict.get(d.id) || 0;
                            return count === 1 ? '1 place' : `${count} places`;
                          })()}
                        </span>
                      </div>
                    </div>

                    {allowDistrictStatusEdit && (
                      <select
                        aria-label={`Status for district ${d.name}`}
                        disabled={updatingId === d.id}
                        value={status}
                        onChange={(e) => handleDistrictStatusChange(d.id, d.name, e.target.value as LocationStatus)}
                        className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 disabled:opacity-50"
                      >
                        {LOCATION_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0B1F3A]">Registered Places & Local Bodies</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {filteredPlaces.length} shown
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Place & Status</th>
                  <th className="py-3 px-4">District</th>
                  <th className="py-3 px-4">Coordinates</th>
                  {allowPlaceStatusEdit && <th className="py-3 px-4 text-right">Update Status</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredPlaces.length === 0 ? (
                  <tr>
                    <td colSpan={allowPlaceStatusEdit ? 4 : 3} className="py-8 text-center text-xs text-slate-500">
                      No places match your filter.
                    </td>
                  </tr>
                ) : (
                  filteredPlaces.map((m) => {
                    const status = m.status || 'Active';
                    return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[#0B1F3A]">{m.name}</span>
                            <LocationStatusBadge status={status} />
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{m.type}</div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                          {districtNameById.get(m.districtId) || m.districtId}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                          {m.centerLat.toFixed(4)}, {m.centerLng.toFixed(4)}
                        </td>
                        {allowPlaceStatusEdit && (
                          <td className="py-3 px-4 text-right">
                            <select
                              aria-label={`Status for place ${m.name}`}
                              disabled={updatingId === m.id}
                              value={status}
                              onChange={(e) =>
                                handlePlaceStatusChange(m.id, m.name, e.target.value as LocationStatus)
                              }
                              className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 disabled:opacity-50"
                            >
                              {LOCATION_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
