import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCheck,
  Crosshair,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { api, type TaxonomyData } from '../lib/api';
import type { CivicIssue, WhatsappMessageRecord } from '../lib/types';

interface WhatsappBotWidgetProps {
  taxonomy: TaxonomyData;
  defaultPhone?: string | null;
  mode?: 'embedded' | 'drawer';
  onClose?: () => void;
  onIssueCreated?: (issue: CivicIssue) => void;
  onOpenComplaint?: (issueIdOrCode: string) => void;
}

export const WhatsappBotWidget: React.FC<WhatsappBotWidgetProps> = ({
  taxonomy,
  defaultPhone,
  mode = 'embedded',
  onClose,
  onIssueCreated,
  onOpenComplaint,
}) => {
  const activeMunicipalities = taxonomy.municipalities.filter((m) => !m.status || m.status === 'Active');
  const defaultMuni = activeMunicipalities.find((m) => m.id === 'mun-mlt') || activeMunicipalities[0];

  const [phone, setPhone] = useState(defaultPhone || '+91 98470 20001');
  const [message, setMessage] = useState('');
  const [municipalityId, setMunicipalityId] = useState(defaultMuni?.id || '');
  const [geoLat, setGeoLat] = useState<number>(defaultMuni?.centerLat ?? 9.8981);
  const [geoLng, setGeoLng] = useState<number>(defaultMuni?.centerLng ?? 76.3854);
  const [detectedAddress, setDetectedAddress] = useState('');
  const [geoMode, setGeoMode] = useState<'detecting' | 'device' | 'area'>('detecting');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [messages, setMessages] = useState<WhatsappMessageRecord[]>([]);
  const [lastAiSource, setLastAiSource] = useState<'gemini' | 'heuristic' | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadSession = async (targetPhone: string) => {
    setLoadingSession(true);
    setError('');
    try {
      const res = await api.getWhatsappSession(targetPhone);
      setMessages(res.messages);
    } catch (err: any) {
      setError(err.message || 'Unable to load WhatsApp session.');
    } finally {
      setLoadingSession(false);
    }
  };

  const resolveLocationAndAddress = async (lat: number, lng: number, modeTag: 'device' | 'area') => {
    setGeoLat(Number(lat.toFixed(6)));
    setGeoLng(Number(lng.toFixed(6)));
    setGeoMode(modeTag);
    try {
      const res = await api.reverseGeocode(lat, lng);
      if (res.addressText) {
        setDetectedAddress(res.addressText);
      }
      if (res.nearestMunicipality?.id) {
        setMunicipalityId(res.nearestMunicipality.id);
      }
    } catch {
      const matched = activeMunicipalities.find((m) => m.id === municipalityId) || defaultMuni;
      if (matched) {
        setDetectedAddress(`${matched.name}, Kerala`);
      }
    }
  };

  const detectDeviceGps = () => {
    setGeoMode('detecting');
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolveLocationAndAddress(pos.coords.latitude, pos.coords.longitude, 'device');
        },
        () => {
          const fallback = activeMunicipalities.find((m) => m.id === municipalityId) || defaultMuni;
          if (fallback) {
            resolveLocationAndAddress(fallback.centerLat, fallback.centerLng, 'area');
          }
        },
        { timeout: 5000, enableHighAccuracy: true }
      );
    } else if (defaultMuni) {
      resolveLocationAndAddress(defaultMuni.centerLat, defaultMuni.centerLng, 'area');
    }
  };

  useEffect(() => {
    loadSession(phone);
    detectDeviceGps();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleMunicipalityOverride = (newMuniId: string) => {
    setMunicipalityId(newMuniId);
    const m = activeMunicipalities.find((item) => item.id === newMuniId);
    if (m) {
      resolveLocationAndAddress(m.centerLat, m.centerLng, 'area');
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleSend = async (overrideMessage?: string) => {
    const textToSend = (overrideMessage ?? message).trim();
    if (!textToSend && !photoDataUrl) return;
    setSending(true);
    setError('');
    try {
      const res = await api.sendWhatsappMessage({
        phone,
        message: textToSend || 'Attached civic issue photograph for immediate inspection',
        municipalityId: municipalityId || undefined,
        latitude: geoLat,
        longitude: geoLng,
        addressText: detectedAddress || undefined,
        photoDataUrl: photoDataUrl || undefined,
      });
      setMessages(res.messages);
      setLastAiSource(res.aiSource);
      if (!overrideMessage) setMessage('');
      setPhotoDataUrl('');
      if (res.createdIssue) {
        onIssueCreated?.(res.createdIssue);
      } else if (res.linkedIssue) {
        onIssueCreated?.(res.linkedIssue);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send WhatsApp message.');
    } finally {
      setSending(false);
    }
  };

  const quickPrompts = [
    'Hi',
    'Large pothole flooding the main road near school',
    'Two streetlights dead near metro junction',
    'Status PWD-2026-00125',
  ];

  const selectedMuniObj = activeMunicipalities.find((m) => m.id === municipalityId);

  const shellContent = (
    <div
      className={`flex flex-col bg-white border border-slate-200 overflow-hidden ${
        mode === 'drawer' ? 'h-full w-full' : 'rounded-xl h-[640px]'
      }`}
    >
      {/* WhatsApp Civic Header */}
      <div className="bg-[#075E54] text-white px-4 py-3.5 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5 text-emerald-200" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">Civil Setu WhatsApp Civic Bot</div>
            <div className="text-[11px] text-emerald-100 flex items-center gap-1.5">
              <span>Civilian Reporting · Auto-GPS Dispatch</span>
              <span>·</span>
              <span>Direct Authority Queue Sync</span>
            </div>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close WhatsApp Bot"
            className="p-1.5 rounded-lg text-emerald-100 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Citizen Phone & Auto-Location Status Bar */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 space-y-2 shrink-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-[#075E54] shrink-0" />
            <input
              type="text"
              aria-label="Citizen WhatsApp Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => loadSession(phone)}
              placeholder="+91 98470 20001"
              className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
            />
            <button
              type="button"
              onClick={() => loadSession(phone)}
              className="px-2.5 py-1.5 text-[11px] font-semibold text-[#075E54] bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              Load
            </button>
          </div>

          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
            <select
              aria-label="WhatsApp Detected Place"
              value={municipalityId}
              onChange={(e) => handleMunicipalityOverride(e.target.value)}
              className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              {activeMunicipalities.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.type})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={detectDeviceGps}
              title="Re-detect live device GPS location"
              className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold text-[#0B1F3A] bg-white border border-slate-300 rounded-lg hover:bg-slate-100 shrink-0 cursor-pointer"
            >
              <Crosshair className="w-3 h-3 text-[#0D9488]" />
              GPS
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-50/80 border border-emerald-200 text-[11px] text-[#075E54]">
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="font-semibold shrink-0">
              {geoMode === 'detecting' ? 'Detecting location...' : 'Auto-Location Ready:'}
            </span>
            <span className="truncate">
              {detectedAddress || `${selectedMuniObj?.name || 'Kerala'} (${geoLat.toFixed(4)}, ${geoLng.toFixed(4)})`}
            </span>
          </div>
          <span className="font-mono text-[10px] shrink-0">
            GPS {geoLat.toFixed(4)}, {geoLng.toFixed(4)}
          </span>
        </div>
      </div>

      {/* Chat Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#EFEAE2]">
        {loadingSession ? (
          <div className="text-center py-8 text-xs text-slate-600">Loading WhatsApp conversation...</div>
        ) : messages.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-4 max-w-md text-xs text-slate-700 space-y-2 shadow-xs">
            <div className="font-bold text-[#075E54] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Civil Setu Civilian WhatsApp Assistant
            </div>
            <p className="leading-relaxed">
              Send any road, streetlight, water leak, drainage, or waste issue right here. Your live location and GPS coordinates are captured automatically and transmitted straight to the responsible authority's complaint queue.
            </p>
            <p className="text-[11px] text-slate-500">
              Try clicking a quick prompt below, attach a photo, or describe the issue in your own words.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isInbound = m.direction === 'inbound';
            return (
              <div key={m.id} className={`flex ${isInbound ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs shadow-xs space-y-1.5 ${
                    isInbound
                      ? 'bg-[#D9FDD3] text-slate-900 border border-emerald-200'
                      : 'bg-white text-slate-800 border border-slate-200'
                  }`}
                >
                  {m.mediaUrl && (
                    <img
                      src={m.mediaUrl}
                      alt="WhatsApp complaint evidence"
                      className="w-full max-h-40 object-cover rounded-lg border border-slate-200"
                    />
                  )}
                  <div className="whitespace-pre-line leading-relaxed">{m.body}</div>
                  <div className="flex items-center justify-between gap-3 pt-0.5 text-[10px] text-slate-500">
                    <span className="font-mono">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="flex items-center gap-2">
                      {m.linkedComplaintCode && onOpenComplaint && (
                        <button
                          type="button"
                          onClick={() => onOpenComplaint(m.linkedComplaintCode!)}
                          className="inline-flex items-center gap-1 font-mono font-semibold text-[#075E54] hover:underline cursor-pointer"
                        >
                          Track {m.linkedComplaintCode}
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                      {isInbound && <CheckCheck className="w-3.5 h-3.5 text-sky-600" />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Quick Prompts + Error */}
      <div className="bg-slate-50 border-t border-slate-200 px-3 py-2 space-y-2 shrink-0">
        {error && <div className="px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-800">{error}</div>}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {quickPrompts.map((qp) => (
            <button
              key={qp}
              type="button"
              disabled={sending}
              onClick={() => handleSend(qp)}
              className="px-2.5 py-1 text-[11px] font-medium text-[#075E54] bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              {qp}
            </button>
          ))}
        </div>

        {/* Attachment & Auto-GPS Status Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-slate-300 rounded-md cursor-pointer hover:bg-slate-100">
              <Camera className="w-3 h-3 text-[#075E54]" />
              <span>{photoDataUrl ? 'Photo Attached' : 'Attach Photo'}</span>
              <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </label>
            {photoDataUrl ? (
              <button
                type="button"
                onClick={() => setPhotoDataUrl('')}
                className="text-red-700 hover:underline cursor-pointer"
              >
                Remove
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPhotoDataUrl('/src/assets/images/sample_pothole_before_1795365318496.jpg')}
                className="text-[#0D9488] hover:underline cursor-pointer"
              >
                + Sample Pothole Photo
              </button>
            )}
          </div>
          <span className="text-[10px] font-medium text-[#075E54]">
            Location & GPS sent automatically to authority
            {lastAiSource && (
              <span className="ml-1 font-mono uppercase text-slate-400">({lastAiSource})</span>
            )}
          </span>
        </div>

        {/* Message Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            aria-label="WhatsApp message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe the civic issue or upload a photo..."
            className="flex-1 px-3.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          />
          <button
            type="submit"
            disabled={sending || (!message.trim() && !photoDataUrl)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#075E54] rounded-lg hover:bg-emerald-900 disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            {sending ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );

  if (mode === 'drawer') {
    return (
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex justify-end"
        role="dialog"
        aria-modal="true"
        aria-label="Civil Setu WhatsApp Civic Chatbot"
      >
        <div className="w-full max-w-lg h-full shadow-2xl">{shellContent}</div>
      </div>
    );
  }

  return shellContent;
};
