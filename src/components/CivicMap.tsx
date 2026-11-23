import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { CivicIssue, RoadPassport } from '../lib/types';

interface CivicMapProps {
  issues?: CivicIssue[];
  passports?: RoadPassport[];
  center?: [number, number];
  zoom?: number;
  heightClass?: string;
  selectable?: boolean;
  selectedLat?: number;
  selectedLng?: number;
  onSelectLocation?: (lat: number, lng: number) => void;
  onOpenIssue?: (issueId: string) => void;
  showHotspots?: boolean;
}

function getMarkerColor(issue: CivicIssue): string {
  if (issue.isOverdue || issue.severity === 'Critical') return '#DC2626';
  if (issue.status === 'Closed' || issue.status === 'Resolved') return '#0D9488';
  if (issue.status === 'Work in Progress' || issue.status === 'Field Inspection') return '#D97706';
  return '#0B1F3A';
}

export const CivicMap: React.FC<CivicMapProps> = ({
  issues = [],
  passports = [],
  center = [9.95, 76.33],
  zoom = 10,
  heightClass = 'h-[400px]',
  selectable = false,
  selectedLat,
  selectedLng,
  onSelectLocation,
  onOpenIssue,
  showHotspots = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const pickerMarkerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      scrollWheelZoom: true,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    const ro = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.invalidateSize({ animate: false });
    });
    ro.observe(containerRef.current);
    const t = window.setTimeout(() => {
      if (mapRef.current) mapRef.current.invalidateSize({ animate: false });
    }, 150);

    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      pickerMarkerRef.current = null;
    };
  }, []);

  // Re-center when center changes explicitly in picker mode
  useEffect(() => {
    if (mapRef.current && selectable && typeof selectedLat === 'number' && typeof selectedLng === 'number') {
      mapRef.current.setView([selectedLat, selectedLng], Math.max(mapRef.current.getZoom(), 13), { animate: false });
    }
  }, [selectable, selectedLat, selectedLng]);

  // Handle selectable map clicks
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectable || !onSelectLocation) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      onSelectLocation(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    };
    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [selectable, onSelectLocation]);

  // Render markers and hotspots
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (selectable && typeof selectedLat === 'number' && typeof selectedLng === 'number') {
      const marker = L.circleMarker([selectedLat, selectedLng], {
        radius: 10,
        color: '#FFFFFF',
        weight: 3,
        fillColor: '#0D9488',
        fillOpacity: 1,
      });
      marker.bindTooltip('Selected Complaint Pin', { permanent: false, direction: 'top' });
      marker.addTo(group);
      pickerMarkerRef.current = marker;
    }

    // Issue markers
    for (const issue of issues) {
      const color = getMarkerColor(issue);

      if (showHotspots && (issue.severity === 'Critical' || issue.isOverdue || issue.isEscalated)) {
        L.circle([issue.latitude, issue.longitude], {
          radius: 450,
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.12,
        }).addTo(group);
      }

      const marker = L.circleMarker([issue.latitude, issue.longitude], {
        radius: 8,
        color: '#FFFFFF',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.95,
      });

      const popupRoot = document.createElement('div');
      popupRoot.className = 'space-y-1.5 min-w-[210px]';

      const codeEl = document.createElement('div');
      codeEl.className = 'text-xs font-mono font-semibold text-teal-700';
      codeEl.textContent = `${issue.complaintCode} · ${issue.severity}`;
      popupRoot.appendChild(codeEl);

      const titleEl = document.createElement('div');
      titleEl.className = 'text-sm font-semibold text-slate-900';
      titleEl.textContent = issue.title;
      popupRoot.appendChild(titleEl);

      const metaEl = document.createElement('div');
      metaEl.className = 'text-xs text-slate-600';
      metaEl.textContent = `${issue.category} · ${issue.municipalityName} · ${issue.status}`;
      popupRoot.appendChild(metaEl);

      if (onOpenIssue) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          'mt-2 w-full px-2.5 py-1.5 text-xs font-semibold text-white bg-[#0B1F3A] rounded hover:bg-slate-800 cursor-pointer';
        btn.textContent = 'Open Complaint Record';
        btn.addEventListener('click', () => onOpenIssue(issue.id));
        popupRoot.appendChild(btn);
      }

      marker.bindPopup(popupRoot);
      marker.addTo(group);
    }

    // Road Passport markers
    for (const rp of passports) {
      const rpColor = rp.flaggedForInspection || rp.workStatus === 'Overdue' ? '#EA580C' : '#0284C7';
      const marker = L.circleMarker([rp.latitude, rp.longitude], {
        radius: 6,
        color: '#0B1F3A',
        weight: 2,
        fillColor: rpColor,
        fillOpacity: 0.9,
      });
      const popupRoot = document.createElement('div');
      popupRoot.className = 'space-y-1 min-w-[200px]';
      const code = document.createElement('div');
      code.className = 'text-xs font-mono font-semibold text-sky-700';
      code.textContent = `ROAD PASSPORT · ${rp.passportCode}`;
      popupRoot.appendChild(code);

      const name = document.createElement('div');
      name.className = 'text-sm font-semibold text-slate-900';
      name.textContent = rp.assetName;
      popupRoot.appendChild(name);

      const info = document.createElement('div');
      info.className = 'text-xs text-slate-600';
      info.textContent = `${rp.workStatus} · Repeat Digs: ${rp.repeatDigCount}`;
      popupRoot.appendChild(info);

      marker.bindPopup(popupRoot);
      marker.addTo(group);
    }

    if (!selectable && (issues.length > 0 || passports.length > 0)) {
      const pts: Array<[number, number]> = [
        ...issues.map((i) => [i.latitude, i.longitude] as [number, number]),
        ...passports.map((p) => [p.latitude, p.longitude] as [number, number]),
      ];
      map.invalidateSize({ animate: false });
      if (pts.length > 1) {
        map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 13, animate: false });
      } else if (pts.length === 1) {
        map.setView(pts[0], 13, { animate: false });
      }
    }
  }, [issues, passports, selectable, selectedLat, selectedLng, showHotspots, onOpenIssue]);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        data-testid="civic-leaflet-map"
        className={`w-full ${heightClass} rounded-xl border border-slate-200 overflow-hidden bg-slate-100`}
      />
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" aria-hidden="true" /> Critical / Overdue Hotspot
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]" aria-hidden="true" /> In Progress / Inspection
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0B1F3A]" aria-hidden="true" /> Assigned / Review
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0D9488]" aria-hidden="true" /> Resolved / Closed
        </span>
        {passports.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C] border border-[#0B1F3A]" aria-hidden="true" /> Road Passport Segment
          </span>
        )}
      </div>
    </div>
  );
};
