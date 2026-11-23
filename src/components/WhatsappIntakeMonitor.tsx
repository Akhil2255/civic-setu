import React, { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, MessageCircle, RefreshCw, Webhook } from 'lucide-react';
import { api, type TaxonomyData } from '../lib/api';
import type { CivicIssue, UserAccount, WhatsappMessageRecord } from '../lib/types';
import { SeverityLabel, StatusLabel } from './StatusComponents';
import { WhatsappBotWidget } from './WhatsappBotWidget';

interface WhatsappIntakeMonitorProps {
  user: UserAccount;
  taxonomy: TaxonomyData;
  onOpenIssue: (issueId: string) => void;
  onRefreshWorkspace: () => void;
}

export const WhatsappIntakeMonitor: React.FC<WhatsappIntakeMonitorProps> = ({
  user,
  taxonomy,
  onOpenIssue,
  onRefreshWorkspace,
}) => {
  const [whatsappIssues, setWhatsappIssues] = useState<CivicIssue[]>([]);
  const [recentMessages, setRecentMessages] = useState<WhatsappMessageRecord[]>([]);
  const [integration, setIntegration] = useState<{
    webhookPath: string;
    verifyTokenConfigured: boolean;
    appSecretConfigured: boolean;
    cloudApiConfigured: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadIntake = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getWhatsappIntakeLogs();
      setWhatsappIssues(res.issues);
      setRecentMessages(res.recentMessages);
      setIntegration(res.integration);
    } catch (err: any) {
      setError(err.message || 'Unable to load WhatsApp intake records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIntake();
  }, [user.id]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">
            WhatsApp Civic Intake & Bot Controls
          </h1>
          <p className="text-sm text-slate-600">
            Citizen complaints sent via WhatsApp enter the main Complaints Queue with full AI triage, auto-routing, Road Passports, and departmental controls.
          </p>
        </div>
        <button
          type="button"
          onClick={loadIntake}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0B1F3A] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh WhatsApp Queue
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
      )}

      {/* Webhook & Cloud Integration Status */}
      {integration && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div className="md:col-span-2 space-y-1">
            <div className="text-xs font-semibold text-[#075E54] flex items-center gap-1.5">
              <Webhook className="w-4 h-4" />
              Meta WhatsApp Cloud API Webhook Endpoint
            </div>
            <div className="text-xs font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 inline-block">
              GET / POST {integration.webhookPath}
            </div>
          </div>
          <div className="text-xs space-y-1">
            <div className="text-slate-500">Webhook Verification</div>
            <div className="font-semibold text-[#0B1F3A] flex items-center gap-1.5">
              <CheckCircle2 className={`w-3.5 h-3.5 ${integration.verifyTokenConfigured ? 'text-[#0D9488]' : 'text-amber-600'}`} />
              {integration.verifyTokenConfigured ? 'Token Configured' : 'Open Sandbox Mode'}
            </div>
          </div>
          <div className="text-xs space-y-1">
            <div className="text-slate-500">WhatsApp Complaints Logged</div>
            <div className="text-lg font-bold font-mono tabular-nums text-[#0B1F3A]">
              {whatsappIssues.length}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: WhatsApp-Submitted Complaints with Full Controls */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-[#075E54]" />
              <h2 className="text-base font-bold text-[#0B1F3A]">
                WhatsApp Complaints Queue ({whatsappIssues.length})
              </h2>
            </div>
            <span className="text-xs text-slate-500">Click any row for full controls</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Loading WhatsApp complaints...</div>
          ) : whatsappIssues.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No WhatsApp-submitted complaints in your jurisdiction yet. Send a test report using the WhatsApp Bot panel on the right.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {whatsappIssues.map((iss) => (
                <button
                  key={iss.id}
                  type="button"
                  onClick={() => onOpenIssue(iss.id)}
                  className="w-full text-left p-4 hover:bg-slate-50 transition-colors flex flex-wrap items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-[#0D9488]">{iss.complaintCode}</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-[#075E54] border border-emerald-200 font-semibold text-[10px]">
                        WhatsApp
                      </span>
                      {iss.reporterPhone && (
                        <span className="font-mono text-[11px] text-slate-500">{iss.reporterPhone}</span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-[#0B1F3A] truncate">{iss.title}</div>
                    <div className="text-xs text-slate-500">
                      {iss.municipalityName} · {iss.departmentName || 'Manual Review Queue'}
                    </div>
                  </div>
                  <div className="text-right space-y-1 shrink-0">
                    <StatusLabel status={iss.status} overdue={iss.isOverdue} />
                    <div className="flex items-center justify-end gap-2">
                      <SeverityLabel severity={iss.severity} />
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0D9488]">
                        Controls <ExternalLink className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {recentMessages.length > 0 && (
            <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="text-xs font-semibold text-[#0B1F3A]">Recent WhatsApp Activity Feed</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {recentMessages.slice(0, 8).map((msg) => (
                  <div key={msg.id} className="text-[11px] text-slate-600 flex items-start justify-between gap-2">
                    <span className="truncate">
                      <span className="font-mono font-semibold text-slate-800">{msg.phoneNumber}</span>{' '}
                      ({msg.direction}): {msg.body}
                    </span>
                    <span className="font-mono text-slate-400 shrink-0">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Interactive Bot Tester / Citizen Simulator */}
        <div className="lg:col-span-5">
          <WhatsappBotWidget
            taxonomy={taxonomy}
            defaultPhone="+91 98470 20001"
            onIssueCreated={() => {
              loadIntake();
              onRefreshWorkspace();
            }}
            onOpenComplaint={(code) => {
              const matched = whatsappIssues.find((i) => i.complaintCode === code);
              onOpenIssue(matched ? matched.id : code);
            }}
          />
        </div>
      </div>
    </div>
  );
};
