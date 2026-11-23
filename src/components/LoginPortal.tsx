import React, { useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Landmark,
  ShieldCheck,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import { api, setAuthToken, type TaxonomyData } from '../lib/api';
import { signInWithGoogleCitizen } from '../lib/firebase';
import type { PortalGroup, UserAccount } from '../lib/types';
import { Logo } from './Logo';

interface LoginPortalProps {
  taxonomy: TaxonomyData;
  initialPortal?: PortalGroup;
  onSuccess: (user: UserAccount, fieldOfficerId: string | null) => void;
  onBackHome: () => void;
}

const PORTALS: Array<{
  id: PortalGroup;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  demoAccounts: Array<{ label: string; email: string; roleTag: string }>;
}> = [
  {
    id: 'citizen',
    title: 'Civilian Portal',
    subtitle: 'Report infrastructure issues, upload evidence, track repairs, and verify completion.',
    icon: <Users className="w-4 h-4" />,
    demoAccounts: [
      { label: 'Ananya Nair (Mulanthuruthy Citizen)', email: 'ananya.citizen@pwdconnect.demo', roleTag: 'Citizen' },
      { label: 'Vikram Pillai (Kochi Citizen)', email: 'vikram.citizen@pwdconnect.demo', roleTag: 'Citizen' },
    ],
  },
  {
    id: 'department',
    title: 'Department & Field Officer',
    subtitle: 'Accept auto-routed complaints, assign field officers, log inspections, and upload repair proof.',
    icon: <Wrench className="w-4 h-4" />,
    demoAccounts: [
      { label: 'PWD Dept Admin (Mulanthuruthy)', email: 'dept.pwd.mlt@pwdconnect.demo', roleTag: 'Dept Admin' },
      { label: 'Field Officer Rajesh (PWD)', email: 'officer.rajesh@pwdconnect.demo', roleTag: 'Field Officer' },
      { label: 'Electricity Dept Admin (Mulanthuruthy)', email: 'dept.elec.mlt@pwdconnect.demo', roleTag: 'Dept Admin' },
      { label: 'Water Authority Admin (Kochi)', email: 'dept.water.kochi@pwdconnect.demo', roleTag: 'Dept Admin' },
    ],
  },
  {
    id: 'municipality',
    title: 'Municipality Administrator',
    subtitle: 'Monitor all local departments within municipal boundaries and escalate overdue SLA cases.',
    icon: <Building2 className="w-4 h-4" />,
    demoAccounts: [
      { label: 'Mulanthuruthy Municipality Admin', email: 'muni.mulanthuruthy@pwdconnect.demo', roleTag: 'Municipality' },
      { label: 'Kochi Corporation Admin', email: 'muni.kochi@pwdconnect.demo', roleTag: 'Corporation' },
    ],
  },
  {
    id: 'government',
    title: 'Government Administrator',
    subtitle: 'State & district-wide monitoring, hotspot mapping, department comparisons, and analytics.',
    icon: <Landmark className="w-4 h-4" />,
    demoAccounts: [
      { label: 'Kerala State Gov Administrator', email: 'state.kerala@pwdconnect.demo', roleTag: 'State Admin' },
      { label: 'Ernakulam District Administrator', email: 'district.ernakulam@pwdconnect.demo', roleTag: 'District Admin' },
    ],
  },
  {
    id: 'company',
    title: 'Company Administrator',
    subtitle: 'Master platform governance: accounts, municipalities, department jurisdictions, categories, and audit logs.',
    icon: <ShieldCheck className="w-4 h-4" />,
    demoAccounts: [
      { label: 'Master Platform Administrator', email: 'admin@pwdconnect.demo', roleTag: 'Platform Admin' },
    ],
  },
];

export const LoginPortal: React.FC<LoginPortalProps> = ({
  taxonomy,
  initialPortal = 'citizen',
  onSuccess,
  onBackHome,
}) => {
  const [activePortal, setActivePortal] = useState<PortalGroup>(initialPortal);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [municipalityId, setMunicipalityId] = useState(taxonomy.municipalities[0]?.id || 'mun-mlt');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const portalMeta = PORTALS.find((p) => p.id === activePortal) || PORTALS[0];

  const handlePortalSwitch = (id: PortalGroup) => {
    setActivePortal(id);
    setMode('login');
    setError('');
    setEmail('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (activePortal === 'citizen' && mode === 'register') {
        const res = await api.registerCitizen({ email, password, fullName, phone, municipalityId });
        setAuthToken(res.token);
        onSuccess(res.user, res.fieldOfficerId);
      } else {
        const res = await api.login({ email, password, expectedPortal: activePortal });
        setAuthToken(res.token);
        onSuccess(res.user, res.fieldOfficerId);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('DemoPass#2026');
    setLoading(true);
    setError('');
    try {
      const res = await api.login({ email: demoEmail, password: 'DemoPass#2026', expectedPortal: activePortal });
      setAuthToken(res.token);
      onSuccess(res.user, res.fieldOfficerId);
    } catch (err: any) {
      setError(err.message || 'Demo login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const profile = await signInWithGoogleCitizen();
      const res = await api.firebaseExchange({
        uid: profile.uid,
        email: profile.email,
        fullName: profile.fullName,
      });
      setAuthToken(res.token);
      onSuccess(res.user, res.fieldOfficerId);
    } catch (err: any) {
      setError(err.message || 'Google sign-in cancelled or unavailable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-6">
        <button type="button" onClick={onBackHome} className="cursor-pointer">
          <Logo />
        </button>
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#0B1F3A] whitespace-nowrap"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Public Portal
        </button>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold text-[#0B1F3A] tracking-tight">
            Unified Five-Portal Access Control
          </h1>
          <p className="text-sm text-slate-600 mt-1.5">
            Select your designated role portal below. Every role enforces strict jurisdictional isolation and audit logging.
          </p>
        </div>

        {/* 5 Separated Portal Selector Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3" role="tablist" aria-label="Login Portals">
          {PORTALS.map((portal) => {
            const selected = portal.id === activePortal;
            return (
              <button
                key={portal.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => handlePortalSwitch(portal.id)}
                className={`p-4 rounded-xl border text-left transition-colors ${
                  selected
                    ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-[#0D9488]'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={selected ? 'text-teal-300' : 'text-[#0D9488]'}>{portal.icon}</span>
                  <span className="text-sm font-bold leading-snug">{portal.title}</span>
                </div>
                <p className={`text-xs leading-relaxed ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                  {portal.subtitle}
                </p>
              </button>
            );
          })}
        </div>

        {/* Active Portal Auth Card + Illustrative Demo Accounts */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-bold text-[#0B1F3A]">{portalMeta.title} Sign In</h2>
                <p className="text-xs text-slate-500 mt-0.5">{portalMeta.subtitle}</p>
              </div>
              {activePortal === 'citizen' && (
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md ${
                      mode === 'login' ? 'bg-white text-[#0B1F3A] shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('register')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md ${
                      mode === 'register' ? 'bg-white text-[#0B1F3A] shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    Register
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {activePortal === 'citizen' && mode === 'register' && (
                <>
                  <div>
                    <label htmlFor="reg-name" className="block text-xs font-semibold text-slate-800 mb-1">
                      Full Name
                    </label>
                    <input
                      id="reg-name"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g., Meenakshi Menon"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="reg-phone" className="block text-xs font-semibold text-slate-800 mb-1">
                        Phone Number
                      </label>
                      <input
                        id="reg-phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98470 00000"
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-muni" className="block text-xs font-semibold text-slate-800 mb-1">
                        Home Municipality
                      </label>
                      <select
                        id="reg-muni"
                        value={municipalityId}
                        onChange={(e) => setMunicipalityId(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
                      >
                        {taxonomy.municipalities.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label htmlFor="portal-email" className="block text-xs font-semibold text-slate-800 mb-1">
                  Portal Email Address
                </label>
                <input
                  id="portal-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter portal email..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="portal-password" className="block text-xs font-semibold text-slate-800 mb-1">
                  Password
                </label>
                <input
                  id="portal-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                {loading
                  ? 'Authenticating...'
                  : activePortal === 'citizen' && mode === 'register'
                    ? 'Create Citizen Account'
                    : `Sign In to ${portalMeta.title}`}
              </button>
            </form>

            {activePortal === 'citizen' && (
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleGoogleSignIn}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-[#0B1F3A] bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Continue with Google (Firebase Auth)
                </button>
              </div>
            )}
          </div>

          {/* Illustrative Hackathon Demo Accounts Panel */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div>
              <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                Illustrative Hackathon Demo Accounts
              </div>
              <h3 className="text-base font-bold text-[#0B1F3A] mt-1">
                One-Click {portalMeta.title} Demo Sign-In
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Mock demonstration accounts seeded for Kerala evaluation (sample data only; not official government accounts).
              </p>
            </div>

            <div className="space-y-2.5">
              {portalMeta.demoAccounts.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  disabled={loading}
                  onClick={() => handleDemoLogin(acc.email)}
                  className="w-full text-left p-3.5 rounded-lg border border-slate-200 hover:border-[#0D9488] hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-[#0B1F3A]">{acc.label}</div>
                    <div className="text-xs font-mono text-slate-500">{acc.email}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0D9488] whitespace-nowrap">
                    <UserCheck className="w-3.5 h-3.5" />
                    Sign In
                  </span>
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 text-xs text-slate-500">
              Demo Password for manual entry: <span className="font-mono font-semibold text-slate-800">DemoPass#2026</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
