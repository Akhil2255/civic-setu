import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Crosshair,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Upload,
  Video,
} from 'lucide-react';
import { api, type TaxonomyData } from '../lib/api';
import { syncIssueToFirestore } from '../lib/firebase';
import { DEFAULT_ISSUE_CATEGORIES, type CivicIssue, type UserAccount } from '../lib/types';
import { CivicMap } from './CivicMap';

interface ReportIssueViewProps {
  user: UserAccount;
  taxonomy: TaxonomyData;
  onSubmitted: (issue: CivicIssue) => void;
}

export const ReportIssueView: React.FC<ReportIssueViewProps> = ({ user, taxonomy, onSubmitted }) => {
  const defaultMuni =
    taxonomy.municipalities.find((m) => m.id === user.municipalityId && (!m.status || m.status === 'Active')) ||
    taxonomy.municipalities.find((m) => m.id === 'mun-mlt' && (!m.status || m.status === 'Active')) ||
    taxonomy.municipalities.find((m) => !m.status || m.status === 'Active') ||
    taxonomy.municipalities[0];

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('Auto-Detect with AI');
  const [stateId, setStateId] = useState(defaultMuni?.stateId || 'st-kl');
  const [districtId, setDistrictId] = useState(defaultMuni?.districtId || 'dist-ekm');
  const [municipalityId, setMunicipalityId] = useState(defaultMuni?.id || 'mun-mlt');
  const [addressText, setAddressText] = useState('');
  const [latitude, setLatitude] = useState(defaultMuni?.centerLat || 9.8981);
  const [longitude, setLongitude] = useState(defaultMuni?.centerLng || 76.3854);
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [videoName, setVideoName] = useState('');

  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [locatingAddress, setLocatingAddress] = useState(false);
  const [geoStatus, setGeoStatus] = useState('');
  const [identifyingPhoto, setIdentifyingPhoto] = useState(false);
  const [photoAiStatus, setPhotoAiStatus] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [aiPreview, setAiPreview] = useState<Awaited<ReturnType<typeof api.analyzeIssue>> | null>(null);

  const addressEditedByUser = useRef(false);

  const districtsInState = useMemo(
    () => taxonomy.districts.filter((d) => d.stateId === stateId && (!d.status || d.status === 'Active')),
    [taxonomy.districts, stateId]
  );

  const munisInDistrict = useMemo(
    () => taxonomy.municipalities.filter((m) => m.districtId === districtId && (!m.status || m.status === 'Active')),
    [taxonomy.municipalities, districtId]
  );

  const applyCoordinatesAndAddress = async (
    lat: number,
    lng: number,
    options?: { forceAddress?: boolean; sourceLabel?: string }
  ) => {
    const cleanLat = Number(lat.toFixed(6));
    const cleanLng = Number(lng.toFixed(6));
    setLatitude(cleanLat);
    setLongitude(cleanLng);
    setLocatingAddress(true);
    try {
      const res = await api.reverseGeocode(cleanLat, cleanLng);
      if (res.addressText && (options?.forceAddress || !addressEditedByUser.current)) {
        setAddressText(res.addressText);
        if (options?.forceAddress) {
          addressEditedByUser.current = false;
        }
      }
      if (res.nearestMunicipality) {
        setStateId(res.nearestMunicipality.stateId);
        setDistrictId(res.nearestMunicipality.districtId);
        setMunicipalityId(res.nearestMunicipality.id);
      }
      setGeoStatus(
        options?.sourceLabel
          ? `Street address auto-filled from ${options.sourceLabel}.`
          : 'Street address auto-filled from your location.'
      );
    } catch {
      const m = taxonomy.municipalities.find((item) => item.id === municipalityId) || defaultMuni;
      if (m && (options?.forceAddress || !addressEditedByUser.current)) {
        setAddressText(`${m.name} Main Road, Kerala`);
      }
    } finally {
      setLocatingAddress(false);
    }
  };

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyCoordinatesAndAddress(pos.coords.latitude, pos.coords.longitude, {
            sourceLabel: 'device GPS',
          });
        },
        () => {
          if (defaultMuni) {
            applyCoordinatesAndAddress(defaultMuni.centerLat, defaultMuni.centerLng, {
              sourceLabel: 'local area coordinates',
            });
          }
        },
        { timeout: 5000, enableHighAccuracy: true }
      );
    } else if (defaultMuni) {
      applyCoordinatesAndAddress(defaultMuni.centerLat, defaultMuni.centerLng, {
        sourceLabel: 'local area coordinates',
      });
    }
  }, []);

  const handleDistrictChange = (newDistrictId: string) => {
    setDistrictId(newDistrictId);
    const firstMuni = taxonomy.municipalities.find(
      (m) => m.districtId === newDistrictId && (!m.status || m.status === 'Active')
    );
    if (firstMuni) {
      setMunicipalityId(firstMuni.id);
      applyCoordinatesAndAddress(firstMuni.centerLat, firstMuni.centerLng, {
        forceAddress: !addressEditedByUser.current,
        sourceLabel: `${firstMuni.name} boundary`,
      });
    } else {
      setMunicipalityId('');
    }
  };

  const handleMunicipalityChange = (newMuniId: string) => {
    setMunicipalityId(newMuniId);
    const m = taxonomy.municipalities.find((item) => item.id === newMuniId);
    if (m) {
      applyCoordinatesAndAddress(m.centerLat, m.centerLng, {
        forceAddress: !addressEditedByUser.current,
        sourceLabel: `${m.name} boundary`,
      });
    }
  };

  const identifyAndAutofillFromPhoto = async (dataUrl: string, filename?: string) => {
    setPhotoDataUrl(dataUrl);
    setIdentifyingPhoto(true);
    setPhotoAiStatus('AI is analyzing your uploaded photo to identify the issue...');
    setError('');
    try {
      const res = await api.identifyPhoto({
        imageBase64: dataUrl,
        mimeType: dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
        filename,
        municipalityId,
        addressText: addressText || undefined,
        latitude,
        longitude,
      });

      setTitle(res.identified.title);
      setDescription(res.identified.description);
      const validCategories = new Set([
        ...DEFAULT_ISSUE_CATEGORIES,
        ...taxonomy.categories.map((c) => c.name),
      ]);
      if (validCategories.has(res.identified.suggestedCategory)) {
        setCategory(res.identified.suggestedCategory);
      }
      setAiPreview({
        analysis: res.analysis,
        routing: res.routing,
        duplicates: res.duplicates,
        repeatExcavation: res.repeatExcavation,
      });
      setPhotoAiStatus(
        `AI (${res.identified.source === 'gemini' ? 'Gemini Vision' : 'Vision Triage'}) auto-filled Issue Title, Description & Category (${Math.round(res.identified.confidence * 100)}% confidence).`
      );
    } catch (err: any) {
      setPhotoAiStatus('Photo attached. You can enter or refine title and description below.');
    } finally {
      setIdentifyingPhoto(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const resultUrl = String(reader.result || '');
      if (resultUrl) {
        identifyAndAutofillFromPhoto(resultUrl, file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      applyCoordinatesAndAddress(latitude, longitude, {
        forceAddress: true,
        sourceLabel: 'pinned map coordinates',
      });
      return;
    }
    setLocatingAddress(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyCoordinatesAndAddress(pos.coords.latitude, pos.coords.longitude, {
          forceAddress: true,
          sourceLabel: 'live device GPS',
        });
        setError('');
      },
      () => {
        applyCoordinatesAndAddress(latitude, longitude, {
          forceAddress: true,
          sourceLabel: 'pinned map coordinates',
        });
      },
      { timeout: 6000, enableHighAccuracy: true }
    );
  };

  const handleVoiceInput = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setVoiceStatus('Voice recognition is not supported in this browser; please type your description.');
      return;
    }
    const recognition = new SpeechRec();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    setListening(true);
    setVoiceStatus('Listening... speak your complaint details clearly.');
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        setDescription((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
      setVoiceStatus('Voice transcription added to description.');
      setListening(false);
    };
    recognition.onerror = () => {
      setVoiceStatus('Could not capture voice audio. Please type your description.');
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
  };

  const handleRunAiPreview = async () => {
    if (!title.trim() || !description.trim()) {
      setError('Enter both an issue title and description (or upload a photo) to run AI analysis.');
      return;
    }
    setAnalyzing(true);
    setError('');
    try {
      const result = await api.analyzeIssue({
        title,
        description,
        selectedCategory: category === 'Auto-Detect with AI' ? undefined : category,
        municipalityId,
        latitude,
        longitude,
        imageBase64: photoDataUrl || undefined,
        mimeType: photoDataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
      });
      setAiPreview(result);
    } catch (err: any) {
      setError(err.message || 'AI preview failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Issue title and description are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await api.createIssue({
        title,
        description,
        category,
        municipalityId,
        addressText: addressText || `${taxonomy.municipalities.find((m) => m.id === municipalityId)?.name || 'Kerala'}`,
        latitude,
        longitude,
        photoDataUrl: photoDataUrl || undefined,
        videoName: videoName || undefined,
      });
      // Sync to Firestore silently if user signed in via Google Auth
      syncIssueToFirestore(res.issue).catch(() => {});
      onSubmitted(res.issue);
    } catch (err: any) {
      setError(err.message || 'Failed to submit complaint.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">Report a Public Infrastructure Issue</h1>
        <p className="text-sm text-slate-600">
          Upload a photo and AI will automatically identify the issue title, description, and category, while your GPS pin auto-fills the exact street address.
        </p>
      </div>

      {error && <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Issue Form */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          {/* Photo & Video Upload placed prominently so photo upload auto-fills form */}
          <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-[#0B1F3A] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#0D9488]" />
                <span>Upload Issue Photo (AI Auto-Identifies Issue Details)</span>
              </div>
              {identifyingPhoto && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0D9488]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Identifying...
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3A] rounded-lg cursor-pointer hover:bg-slate-800">
                <Upload className="w-4 h-4 text-teal-300" />
                <span>{photoDataUrl ? 'Change Photo' : 'Upload Photo'}</span>
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>

              <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#0B1F3A] bg-white border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100">
                <Video className="w-4 h-4 text-slate-600" />
                <span>{videoName ? `Video: ${videoName}` : 'Attach Video Clip'}</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setVideoName(e.target.files?.[0]?.name || '')}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                disabled={identifyingPhoto}
                onClick={() =>
                  identifyAndAutofillFromPhoto(
                    '/src/assets/images/sample_pothole_before_1795365318496.jpg',
                    'sample_pothole_before.jpg'
                  )
                }
                className="text-xs font-semibold text-[#0D9488] hover:underline cursor-pointer disabled:opacity-50"
              >
                Use Sample Kerala Pothole Photo
              </button>
            </div>

            {photoAiStatus && (
              <div className="text-xs font-medium text-[#075E54] bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                {photoAiStatus}
              </div>
            )}

            {photoDataUrl && (
              <div className="flex items-center gap-4 p-3 rounded-lg border border-slate-200 bg-white">
                <img
                  src={photoDataUrl}
                  alt="Issue evidence preview"
                  className="w-24 h-18 object-cover rounded border border-slate-200"
                />
                <div className="text-xs text-slate-600 space-y-1">
                  <div className="font-semibold text-[#0B1F3A]">Evidence attached</div>
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoDataUrl('');
                      setPhotoAiStatus('');
                    }}
                    className="text-red-700 hover:underline cursor-pointer"
                  >
                    Remove photo
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="issue-title" className="block text-xs font-semibold text-slate-800 mb-1.5">
              Issue Title
            </label>
            <input
              id="issue-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Upload a photo to auto-fill, or type title (e.g., Deep pothole near school gate)"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="issue-desc" className="block text-xs font-semibold text-slate-800">
                Issue Description
              </label>
              <button
                type="button"
                onClick={handleVoiceInput}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0D9488] hover:underline"
              >
                {listening ? <MicOff className="w-3.5 h-3.5 text-red-600" /> : <Mic className="w-3.5 h-3.5" />}
                {listening ? 'Listening...' : 'Voice Input'}
              </button>
            </div>
            <textarea
              id="issue-desc"
              rows={4}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Upload a photo to auto-fill, or describe exact landmark, safety risk, traffic impact..."
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
            />
            {voiceStatus && <p className="text-xs text-slate-500 mt-1">{voiceStatus}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="issue-category" className="block text-xs font-semibold text-slate-800 mb-1.5">
                Issue Category
              </label>
              <select
                id="issue-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Auto-Detect with AI">Auto-Detect with AI</option>
                {DEFAULT_ISSUE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="issue-state" className="block text-xs font-semibold text-slate-800 mb-1.5">
                State
              </label>
              <select
                id="issue-state"
                value={stateId}
                onChange={(e) => setStateId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {taxonomy.states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="issue-district" className="block text-xs font-semibold text-slate-800 mb-1.5">
                District
              </label>
              <select
                id="issue-district"
                value={districtId}
                onChange={(e) => handleDistrictChange(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {districtsInState.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="issue-muni" className="block text-xs font-semibold text-slate-800 mb-1.5">
                Municipality / Local Body
              </label>
              <select
                id="issue-muni"
                required
                value={municipalityId}
                onChange={(e) => handleMunicipalityChange(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {munisInDistrict.length === 0 ? (
                  <option value="">No places registered in this district yet</option>
                ) : (
                  munisInDistrict.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.type})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor="issue-address" className="block text-xs font-semibold text-slate-800">
                Street Address / Landmark
              </label>
              <span className="inline-flex items-center gap-1 text-[11px] text-[#0D9488] font-medium">
                {locatingAddress ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Detecting street address...
                  </>
                ) : (
                  geoStatus && (
                    <>
                      <MapPin className="w-3 h-3" />
                      {geoStatus}
                    </>
                  )
                )}
              </span>
            </div>
            <input
              id="issue-address"
              type="text"
              value={addressText}
              onChange={(e) => {
                addressEditedByUser.current = true;
                setAddressText(e.target.value);
              }}
              placeholder="Detecting street address from your GPS location..."
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              disabled={analyzing}
              onClick={handleRunAiPreview}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#0B1F3A] bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-[#0D9488]" />
              {analyzing ? 'Analyzing Issue...' : 'AI Analyze & Preview Routing'}
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0D9488] rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Submitting Complaint...' : 'Submit Complaint'}
            </button>
          </div>
        </div>

        {/* Right Column: Interactive Map Pin Picker + Live AI Triage Card */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#0B1F3A]">Pin Exact Location on Map</h2>
                <p className="text-xs text-slate-500">Auto-detects your address; click map or Capture GPS to update.</p>
              </div>
              <button
                type="button"
                onClick={handleCaptureGps}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer"
              >
                <Crosshair className="w-3.5 h-3.5 text-[#0D9488]" />
                Capture GPS & Address
              </button>
            </div>

            <CivicMap
              selectable
              selectedLat={latitude}
              selectedLng={longitude}
              center={[latitude, longitude]}
              zoom={13}
              heightClass="h-[290px]"
              onSelectLocation={(lat, lng) => {
                applyCoordinatesAndAddress(lat, lng, {
                  forceAddress: true,
                  sourceLabel: 'pinned map location',
                });
              }}
            />

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-500 block">Latitude</span>
                <span className="font-mono tabular-nums font-semibold text-[#0B1F3A]">{latitude.toFixed(6)}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-500 block">Longitude</span>
                <span className="font-mono tabular-nums font-semibold text-[#0B1F3A]">{longitude.toFixed(6)}</span>
              </div>
            </div>
          </div>

          {aiPreview && (
            <div className="bg-white border border-teal-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#0B1F3A]">AI Routing & Triage Preview</h3>
                <span className="text-[11px] font-mono font-semibold text-[#0D9488] uppercase">
                  {aiPreview.analysis.source === 'gemini' ? 'Gemini Vision' : 'Rule Engine'}
                </span>
              </div>
              <div className="text-xs space-y-1.5 text-slate-700">
                <div>
                  <span className="font-semibold">Predicted Category:</span> {aiPreview.analysis.suggestedCategory} (
                  {Math.round(aiPreview.analysis.confidence * 100)}%)
                </div>
                <div>
                  <span className="font-semibold">Estimated Severity:</span> {aiPreview.analysis.severity}
                </div>
                <div>
                  <span className="font-semibold">Target Department:</span>{' '}
                  {aiPreview.routing?.departmentName || 'Manual Review Queue'}
                </div>
                <p className="text-slate-600 pt-1">{aiPreview.analysis.reasoning}</p>
              </div>

              {aiPreview.duplicates.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                    Possible Duplicate Nearby
                  </div>
                  {aiPreview.duplicates.map((d) => (
                    <div key={d.id}>
                      {d.complaintCode}: {d.title} ({d.distanceMeters}m away · {d.status})
                    </div>
                  ))}
                </div>
              )}

              {aiPreview.repeatExcavation.isRepeatZone && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900">
                  <span className="font-semibold">Road Passport Repeat-Dig Alert:</span>{' '}
                  {aiPreview.repeatExcavation.totalPriorExcavations} prior excavations logged within 180m.
                </div>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
};
