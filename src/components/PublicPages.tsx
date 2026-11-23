import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  FileCheck2,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api, type PublicStats, type TaxonomyData } from '../lib/api';
import type { CivicIssue, PortalGroup, RoadPassport } from '../lib/types';
import { CivicMap } from './CivicMap';
import { Logo } from './Logo';
import { StatusLabel, TimelineStepper } from './StatusComponents';
import { WhatsappBotWidget } from './WhatsappBotWidget';

type PublicPageTab = 'home' | 'about' | 'how-it-works' | 'categories' | 'contact' | 'track';

interface PublicPagesProps {
  stats: PublicStats | null;
  taxonomy: TaxonomyData;
  onNavigateLogin: (portal?: PortalGroup) => void;
}

export const PublicPages: React.FC<PublicPagesProps> = ({ stats, taxonomy, onNavigateLogin }) => {
  const [activeTab, setActiveTab] = useState<PublicPageTab>('home');
  const [trackCode, setTrackCode] = useState('PWD-2026-00125');
  const [trackResult, setTrackResult] = useState<{
    issue: CivicIssue;
    history: any[];
    evidence: any[];
    roadPassport: RoadPassport | null;
  } | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState('');

  // Contact form
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);

  const handleTrackLookup = async (codeOverride?: string) => {
    const query = (codeOverride ?? trackCode).trim();
    if (!query) return;
    setTrackLoading(true);
    setTrackError('');
    try {
      const res = await api.trackComplaint(query);
      setTrackResult(res);
      setActiveTab('track');
    } catch (err: any) {
      setTrackError(err.message || 'Complaint ID not found.');
      setTrackResult(null);
      setActiveTab('track');
    } finally {
      setTrackLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: 3 exact zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element brand */}
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Logo />
          </button>

          {/* Zone 2: 4-5 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setActiveTab('about')}
              className={`hover:text-[#0B1F3A] whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'about' ? 'text-[#0B1F3A] font-semibold underline underline-offset-4' : ''
              }`}
            >
              About
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('how-it-works')}
              className={`hover:text-[#0B1F3A] whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'how-it-works' ? 'text-[#0B1F3A] font-semibold underline underline-offset-4' : ''
              }`}
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`hover:text-[#0B1F3A] whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'categories' ? 'text-[#0B1F3A] font-semibold underline underline-offset-4' : ''
              }`}
            >
              Issue Categories
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('track')}
              className={`hover:text-[#0B1F3A] whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'track' ? 'text-[#0B1F3A] font-semibold underline underline-offset-4' : ''
              }`}
            >
              Track Complaint
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('contact')}
              className={`hover:text-[#0B1F3A] whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'contact' ? 'text-[#0B1F3A] font-semibold underline underline-offset-4' : ''
              }`}
            >
              Contact
            </button>
          </nav>

          {/* Zone 3: 1 primary CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => onNavigateLogin('citizen')}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Portal Login
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {activeTab === 'home' && (
          <div className="space-y-16 pb-16">
            {/* Hero Section */}
            <section className="bg-white border-b border-slate-200">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
                  <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
                    <div className="text-xs font-semibold text-[#0D9488] tracking-wide">
                      Perfect India Initiative · Kerala Demonstration Region
                    </div>
                    <h1
                      className="text-4xl sm:text-5xl font-extrabold text-[#0B1F3A] tracking-tight leading-[1.1]"
                      style={{ textWrap: 'balance' }}
                    >
                      Your Voice. Our Responsibility. A Better India.
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                      Report public infrastructure problems, connect directly with responsible government departments and track every repair until resolution.
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => onNavigateLogin('citizen')}
                        className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#0D9488] rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Report an Issue
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTrackLookup('PWD-2026-00125')}
                        className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-[#0B1F3A] bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Search className="w-4 h-4" />
                        Track My Complaint
                      </button>
                      <button
                        type="button"
                        onClick={() => setWhatsappOpen(true)}
                        className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#075E54] rounded-lg hover:bg-emerald-900 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4" />
                        WhatsApp Bot
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateLogin('government')}
                        className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-[#0B1F3A] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Government Login
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">
                      Connecting Citizens. Empowering Departments. Building a Better India.
                    </p>
                  </div>

                  <div className="lg:col-span-6">
                    <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                      <img
                        src="/src/assets/images/hero_civic_infrastructure_1795365319105.jpg"
                        alt="Engineered modern urban road and flyover infrastructure in Kerala"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>

                {/* Full-width 4-Column Demo KPI Strip below Hero */}
                <div className="mt-12 pt-8 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold text-slate-500">
                      {stats?.regionLabel || 'Kerala Pilot Region (Illustrative Demo Data)'}
                    </span>
                    <span className="text-xs text-slate-400">Live Demo Database Metrics</span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="text-xs text-slate-500">Total Demo Complaints</div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-[#0B1F3A] mt-1">
                        {stats?.totalComplaints ?? 8}
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="text-xs text-slate-500">Resolved & Verified</div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-[#0D9488] mt-1">
                        {stats?.resolvedComplaints ?? 2}
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="text-xs text-slate-500">Road Passports Issued</div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-[#0B1F3A] mt-1">
                        {stats?.roadPassportsIssued ?? 4}
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="text-xs text-slate-500">Active Municipalities</div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-[#D97706] mt-1">
                        {stats?.participatingMunicipalities ?? 5}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Quick Public Complaint Lookup */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6">
              <div className="bg-[#0B1F3A] text-white rounded-xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">Instant Complaint Status Lookup</h2>
                  <p className="text-sm text-slate-300">
                    Enter any complaint ID (try demo ID <span className="font-mono text-teal-300">PWD-2026-00125</span>) to view real-time repair milestones.
                  </p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleTrackLookup();
                  }}
                  className="flex w-full md:w-auto gap-2"
                >
                  <input
                    type="text"
                    aria-label="Complaint ID"
                    value={trackCode}
                    onChange={(e) => setTrackCode(e.target.value)}
                    placeholder="PWD-2026-00125"
                    className="flex-1 md:w-56 px-3.5 py-2.5 text-sm font-mono bg-white text-slate-900 rounded-lg"
                  />
                  <button
                    type="submit"
                    disabled={trackLoading}
                    className="px-4 py-2.5 text-sm font-semibold bg-[#0D9488] text-white rounded-lg hover:bg-teal-600 whitespace-nowrap cursor-pointer"
                  >
                    {trackLoading ? 'Checking...' : 'Track Status'}
                  </button>
                </form>
              </div>
            </section>

            {/* 5-Step Complaint Workflow */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
              <div className="max-w-2xl">
                <h2 className="text-2xl sm:text-3xl font-bold text-[#0B1F3A] tracking-tight">
                  Five-Step Civic Resolution Pipeline
                </h2>
                <p className="text-sm text-slate-600 mt-2">
                  From citizen evidence capture to municipal oversight and citizen verification, every step is timestamped and auditable.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {[
                  {
                    num: '01.',
                    title: 'Geo-Tagged Report',
                    desc: 'Citizen logs issue with photo, voice note, and GPS pin on OpenStreetMap.',
                  },
                  {
                    num: '02.',
                    title: 'AI Vision Triage',
                    desc: 'Gemini analyzes image & text to identify category, severity, and nearby duplicates.',
                  },
                  {
                    num: '03.',
                    title: 'Jurisdiction Routing',
                    desc: 'Rules engine routes to PWD, Electricity, Water, Drainage, or Manual Review Queue.',
                  },
                  {
                    num: '04.',
                    title: 'Field Execution',
                    desc: 'Department assigns a field engineer to inspect, repair, and upload proof photos.',
                  },
                  {
                    num: '05.',
                    title: 'Citizen & Road Passport',
                    desc: 'Citizen confirms repair before closing; Road Passport seals asset history.',
                  },
                ].map((step) => (
                  <div key={step.num} className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                    <div className="text-sm font-mono font-bold text-[#0D9488]">{step.num}</div>
                    <h3 className="text-base font-bold text-[#0B1F3A]">{step.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{step.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Road Passport Innovation + AI Accountability Showcase */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
                <div className="lg:col-span-6 p-8 sm:p-10 space-y-5 flex flex-col justify-center">
                  <div className="text-xs font-semibold text-[#D97706]">Flagship Innovation · ROAD PASSPORT</div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#0B1F3A] tracking-tight">
                    Every Road Excavation & Repair Holds a Permanent Digital History
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Stop repeated uncoordinated road digging. Road Passport links every excavation permit and citizen complaint to a GPS-indexed infrastructure record, detecting repeat cuts and auditing before-and-after surface restoration with Gemini Vision.
                  </p>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-slate-700">Before Repair (Mulanthuruthy)</div>
                      <img
                        src="/src/assets/images/sample_pothole_before_1795365318496.jpg"
                        alt="Sample pothole before repair"
                        referrerPolicy="no-referrer"
                        className="w-full h-32 object-cover rounded-lg border border-slate-200"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-[#0D9488]">After Restoration (Verified)</div>
                      <img
                        src="/src/assets/images/sample_road_after_1795365318126.jpg"
                        alt="Sample road after repair"
                        referrerPolicy="no-referrer"
                        className="w-full h-32 object-cover rounded-lg border border-slate-200"
                      />
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-6 bg-slate-100 min-h-[300px]">
                  <img
                    src="/src/assets/images/road_passport_inspection_1795365318556.jpg"
                    alt="Field engineer inspecting road and stormwater drain using digital tablet"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </section>

            {/* Five Role Portals Overview */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">
                    Five Dedicated Governance & Citizen Portals
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Strict role-based access control ensures municipalities monitor without tampering, and citizens verify closure.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateLogin('citizen')}
                  className="text-sm font-semibold text-[#0D9488] hover:underline"
                >
                  Explore Demo Logins &rarr;
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { portal: 'citizen' as PortalGroup, title: 'Civilian Portal', desc: 'Report issues, track 10-step progress, confirm or reopen repairs.' },
                  { portal: 'department' as PortalGroup, title: 'Department & Field', desc: 'Accept routed cases, assign field engineers, upload repair photos.' },
                  { portal: 'municipality' as PortalGroup, title: 'Municipality Admin', desc: 'Monitor local department SLAs and escalate overdue complaints.' },
                  { portal: 'government' as PortalGroup, title: 'Government Admin', desc: 'State & district hotspot maps, comparisons, and compliance exports.' },
                  { portal: 'company' as PortalGroup, title: 'Company Admin', desc: 'Manage accounts, jurisdictions, categories, and full audit logs.' },
                ].map((card) => (
                  <button
                    key={card.portal}
                    type="button"
                    onClick={() => onNavigateLogin(card.portal)}
                    className="text-left p-5 bg-white border border-slate-200 rounded-xl hover:border-[#0D9488] transition-colors flex flex-col justify-between gap-4 cursor-pointer"
                  >
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-[#0B1F3A]">{card.title}</h3>
                      <p className="text-xs text-slate-600 leading-relaxed">{card.desc}</p>
                    </div>
                    <span className="text-xs font-semibold text-[#0D9488]">Open Portal &rarr;</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'about' && (
          <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-6">
            <h1 className="text-3xl font-bold text-[#0B1F3A]">About Civil Setu</h1>
            <p className="text-base text-slate-700 leading-relaxed">
              Civil Setu is an AI-powered civic infrastructure complaint management and asset accountability platform built under the Perfect India vision. Starting with Kerala (Ernakulam, Thiruvananthapuram, and Kozhikode pilot municipalities), the platform bridges citizens, local bodies, and specialized engineering departments on one auditable ledger.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-2">
                <Sparkles className="w-5 h-5 text-[#0D9488]" />
                <h2 className="font-bold text-[#0B1F3A]">Automated AI Routing</h2>
                <p className="text-xs text-slate-600">
                  Combines multimodal photo/text classification with configurable municipal asset ownership rules and a manual review safety queue.
                </p>
              </div>
              <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-2">
                <Building2 className="w-5 h-5 text-[#0B1F3A]" />
                <h2 className="font-bold text-[#0B1F3A]">Municipal Accountability</h2>
                <p className="text-xs text-slate-600">
                  Municipalities track response times across PWD, Water, Electricity, Drainage, and Waste teams and escalate overdue SLAs without altering repair records.
                </p>
              </div>
              <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-2">
                <ShieldCheck className="w-5 h-5 text-[#D97706]" />
                <h2 className="font-bold text-[#0B1F3A]">Citizen-Verified Closure</h2>
                <p className="text-xs text-slate-600">
                  No repair is closed silently. Citizens review after-repair photographs and verify quality or reopen the case.
                </p>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'how-it-works' && (
          <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-8">
            <div>
              <h1 className="text-3xl font-bold text-[#0B1F3A]">How Civil Setu Works</h1>
              <p className="text-sm text-slate-600 mt-1">
                End-to-end 10-stage complaint tracking from submission to Road Passport sealing.
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-[#0B1F3A]">10-Stage Status Tracking Lifecycle</h2>
              <TimelineStepper currentStatus="Resolved" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-2">
                <h3 className="font-bold text-[#0B1F3A]">Configurable Jurisdictions + Manual Review Queue</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Every complaint passes through AI vision/text classification and duplicate proximity checks. High-confidence matches route immediately to the mapped municipal department; ambiguous cases enter the Manual Review Queue for human assignment.
                </p>
              </div>
              <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-2">
                <h3 className="font-bold text-[#0B1F3A]">Road Passport Digital Asset History</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Road and pipeline excavations automatically generate or update a Road Passport linked to GPS coordinates, preventing repeat digging on newly paved roads and auditing before/after restoration photographs.
                </p>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'categories' && (
          <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-[#0B1F3A]">Supported Civic Infrastructure Categories</h1>
              <p className="text-sm text-slate-600 mt-1">
                Configured issue taxonomy, default department routing, and SLA target windows.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {taxonomy.categories.map((cat) => (
                <div key={cat.id} className="p-5 bg-white border border-slate-200 rounded-xl flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-base font-bold text-[#0B1F3A]">{cat.name}</h2>
                    <p className="text-xs text-slate-600">{cat.description}</p>
                  </div>
                  <div className="text-right shrink-0 text-xs">
                    <div className="font-mono font-semibold text-[#0D9488]">{cat.defaultDepartmentCode}</div>
                    <div className="font-mono tabular-nums text-slate-500">{cat.slaHours}h SLA</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'track' && (
          <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h1 className="text-2xl font-bold text-[#0B1F3A]">Track Public Complaint</h1>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleTrackLookup();
                }}
                className="flex flex-wrap gap-3"
              >
                <input
                  type="text"
                  value={trackCode}
                  onChange={(e) => setTrackCode(e.target.value)}
                  placeholder="Enter Complaint ID (e.g., PWD-2026-00125)"
                  className="flex-1 min-w-[240px] px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  disabled={trackLoading}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-slate-800"
                >
                  {trackLoading ? 'Searching...' : 'Look Up Complaint'}
                </button>
              </form>
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span>Sample Demo IDs:</span>
                {['PWD-2026-00125', 'PWD-2026-00126', 'PWD-2026-00127', 'PWD-2026-00129'].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => {
                      setTrackCode(sample);
                      handleTrackLookup(sample);
                    }}
                    className="font-mono text-[#0D9488] hover:underline cursor-pointer"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            {trackError && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">{trackError}</div>
            )}

            {trackResult && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="text-xs font-mono font-semibold text-[#0D9488]">
                      {trackResult.issue.complaintCode} · {trackResult.issue.category}
                    </div>
                    <h2 className="text-xl font-bold text-[#0B1F3A] mt-0.5">{trackResult.issue.title}</h2>
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-[#0D9488]" />
                      {trackResult.issue.addressText} ({trackResult.issue.municipalityName}, {trackResult.issue.districtName})
                    </div>
                  </div>
                  <StatusLabel status={trackResult.issue.status} overdue={trackResult.issue.isOverdue} />
                </div>

                <TimelineStepper currentStatus={trackResult.issue.status} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-[#0B1F3A]">Status Milestones</h3>
                    <div className="space-y-2">
                      {trackResult.history.map((h) => (
                        <div key={h.id} className="text-xs py-2 border-b border-slate-100 flex justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">{h.toStatus}</div>
                            <div className="text-slate-600">{h.note}</div>
                          </div>
                          <span className="font-mono tabular-nums text-[11px] text-slate-400 whitespace-nowrap">
                            {new Date(h.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-[#0B1F3A]">Location Map</h3>
                    <CivicMap issues={[trackResult.issue]} heightClass="h-[240px]" />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === 'contact' && (
          <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-[#0B1F3A]">Contact Civic Operations Desk</h1>
              <p className="text-sm text-slate-600 mt-1">
                Reach out to onboard a new municipality, configure department jurisdictions, or report platform feedback.
              </p>
            </div>
            {contactSubmitted ? (
              <div className="p-6 bg-white border border-teal-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-teal-800 font-bold">
                  <CheckCircle2 className="w-5 h-5" />
                  Inquiry Logged
                </div>
                <p className="text-sm text-slate-600">
                  Thank you, {contactName}. Our civic onboarding team will review your message shortly.
                </p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setContactSubmitted(true);
                }}
                className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
              >
                <div>
                  <label htmlFor="c-name" className="block text-xs font-semibold text-slate-800 mb-1">
                    Name / Municipality Name
                  </label>
                  <input
                    id="c-name"
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="c-email" className="block text-xs font-semibold text-slate-800 mb-1">
                    Email Address
                  </label>
                  <input
                    id="c-email"
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="c-msg" className="block text-xs font-semibold text-slate-800 mb-1">
                    Message
                  </label>
                  <textarea
                    id="c-msg"
                    rows={4}
                    required
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-slate-800"
                >
                  Send Message
                </button>
              </form>
            )}
          </section>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-8 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <Logo />
            <span>· Perfect India Civic Infrastructure Platform (Kerala Pilot Demo Data)</span>
          </div>
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => setActiveTab('about')} className="hover:text-slate-900">
              About
            </button>
            <button type="button" onClick={() => setActiveTab('categories')} className="hover:text-slate-900">
              Categories
            </button>
            <button type="button" onClick={() => setActiveTab('track')} className="hover:text-slate-900">
              Track Complaint
            </button>
            <button type="button" onClick={() => onNavigateLogin('company')} className="hover:text-slate-900">
              Admin Login
            </button>
          </div>
        </div>
      </footer>

      {whatsappOpen && (
        <WhatsappBotWidget
          taxonomy={taxonomy}
          mode="drawer"
          onClose={() => setWhatsappOpen(false)}
          onOpenComplaint={(code) => {
            setWhatsappOpen(false);
            setTrackCode(code);
            handleTrackLookup(code);
          }}
        />
      )}
    </div>
  );
};
