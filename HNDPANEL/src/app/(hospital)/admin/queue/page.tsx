'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { adminService, AdminQueueItem } from '../../../../services/admin.service';
import { ConsultationStatus, VisitAnalytics } from '../../../../types/api';
import {
  Layers,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  SlidersHorizontal,
  TrendingUp,
  UserCheck,
  AlertCircle,
  Building2,
  Stethoscope,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { subscribeToSosAlerts } from '../../../../lib/socket';

interface HospitalToken {
  id: string;
  tokenNumber: string;
  patientName: string;
  department: string;
  doctorName: string;
  status: ConsultationStatus;
  riskLevel: 'routine' | 'high_risk' | 'emergency';
  time: string;
  signedOffAt?: string;
}

const statusLabel = (status: ConsultationStatus) => {
  if (status === 'complete') return 'Completed';
  if (status === 'call') return 'In Consultation';
  if (status === 'waiting_triage') return 'Waiting Triage';
  if (status === 'in_queue') return 'Waiting';
  return status.replace('_', ' ');
};

export default function AdminQueuePage() {
  const [analytics, setAnalytics] = useState<VisitAnalytics>({
    kiosk_visits: 0,
    token_conversions: 0,
    consultations_completed: 0,
  });

  const [tokens, setTokens] = useState<HospitalToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sosAlert, setSosAlert] = useState<any | null>(null);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsData, rawQueue] = await Promise.all([
        adminService.getVisitAnalytics().catch(() => ({
          kiosk_visits: 0,
          token_conversions: 0,
          consultations_completed: 0,
        })),
        adminService.getQueue().catch(() => [] as AdminQueueItem[]),
      ]);

      setAnalytics(analyticsData);

      const mappedTokens: HospitalToken[] = (rawQueue || []).map((item: AdminQueueItem) => ({
        id: item.id,
        tokenNumber: item.token_number,
        patientName: item.patient_name || item.full_name,
        department: item.department_name || item.department || 'Unassigned Department',
        doctorName: item.doctor_name || 'Unassigned Clinician',
        status: item.status,
        riskLevel: item.risk_level,
        time: item.created_at
          ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'Active in Queue',
        signedOffAt: item.signed_off_at,
      }));

      setTokens(mappedTokens);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch hospital telemetry data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const unsubscribeSos = subscribeToSosAlerts((alert) => {
      setSosAlert(alert);
      fetchDashboardData();
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('AyushCare SOS Emergency', { body: `${alert.patient?.full_name || 'Patient'} - ${alert.token}` });
      }
    });
    return unsubscribeSos;
  }, [fetchDashboardData]);

  const handleStatusOverride = async (tokenId: string, newStatus: ConsultationStatus) => {
    // Optimistic local update
    setTokens((prev) =>
      prev.map((t) => (t.id === tokenId ? { ...t, status: newStatus } : t))
    );

    try {
      await adminService.overrideQueue(tokenId, newStatus);
    } catch {
      // Revert if API fails
      await fetchDashboardData();
    }
  };

  const conversionRate =
    analytics.kiosk_visits > 0
      ? ((analytics.token_conversions / analytics.kiosk_visits) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto pb-12">
      {sosAlert && (
        <div className="bg-red-700 text-white px-4 py-3 rounded-xl flex items-center justify-between gap-3 shadow-lg animate-pulse">
          <div className="flex items-center gap-2 text-sm font-bold">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>SOS EMERGENCY: {sosAlert.patient?.full_name || 'Patient'} - Token {sosAlert.token}</span>
          </div>
          <button onClick={() => setSosAlert(null)} className="text-xs font-semibold underline">Dismiss</button>
        </div>
      )}

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-slate-200/90 p-4 sm:p-5 rounded-2xl shadow-xs">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-[#044e42]" />
            <span>Hospital Token Desk & Live Queue Overview</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time OPD token progression, kiosk conversion metrics, and queue overrides.
          </p>
        </div>

        <button
          onClick={fetchDashboardData}
          className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Live Feed</span>
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-700">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Analytics Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-semibold">Kiosk Intake Visits</span>
            <div className="p-2 bg-teal-50 text-[#044e42] rounded-xl">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2 sm:mt-3">
            {loading ? <span className="inline-block h-7 sm:h-8 w-16 bg-slate-100 rounded animate-pulse" /> : analytics.kiosk_visits}
          </div>
          <div className="text-[11px] text-[#044e42] font-medium mt-1.5 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Active Today Across Kiosks</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-semibold">OPD Tokens Generated</span>
            <div className="p-2 bg-sky-50 text-sky-700 rounded-xl">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2 sm:mt-3">
            {loading ? <span className="inline-block h-7 sm:h-8 w-16 bg-slate-100 rounded animate-pulse" /> : analytics.token_conversions}
          </div>
          <div className="text-[11px] text-sky-700 font-medium mt-1.5 flex items-center gap-1">
            <span>{conversionRate}% Conversion Rate</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-semibold">Consultations Completed</span>
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2 sm:mt-3">
            {loading ? <span className="inline-block h-7 sm:h-8 w-16 bg-slate-100 rounded animate-pulse" /> : analytics.consultations_completed}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1.5 flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5" />
            <span>Signed Off & Archived</span>
          </div>
        </div>
      </div>

      {/* Live Hospital Queue Section */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#044e42]" />
            Active Tokens & Live Queue Progression
          </h3>
          <span className="bg-slate-100 text-slate-600 border border-slate-200 text-xs px-2.5 py-0.5 rounded-full font-semibold">
            Total: {tokens.length}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#044e42]" />
            <span>Loading active hospital queue tokens...</span>
          </div>
        ) : tokens.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <p className="font-semibold text-slate-600">No Active Tokens in Queue</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Patients registering at the AyushCare intake terminal will automatically appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Cards (Visible on screens < md) */}
            <div className="md:hidden divide-y divide-slate-100">
              {tokens.map((token) => (
                <div key={token.id} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-[#044e42] text-sm font-mono bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-200">
                        {token.tokenNumber}
                      </span>
                      <h4 className="font-bold text-slate-900 text-xs">{token.patientName}</h4>
                    </div>

                    {token.riskLevel === 'high_risk' || token.riskLevel === 'emergency' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-full text-[10px] font-bold">
                        <AlertTriangle className="w-2.5 h-2.5 text-rose-600" /> High Risk
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-full text-[10px] font-medium">
                        Routine
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="text-slate-500">
                      <span className="block text-[10px] text-slate-400">Department</span>
                      <span className="font-semibold text-slate-800">{token.department}</span>
                    </div>
                    <div className="text-slate-500">
                      <span className="block text-[10px] text-slate-400">Doctor</span>
                      <span className="font-semibold text-slate-800">{token.doctorName}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      Status: {statusLabel(token.status)}
                    </span>
                    <span className="text-[10px] text-slate-400">{token.time}</span>

                    <select
                      value={token.status}
                      onChange={(e) => handleStatusOverride(token.id, e.target.value as ConsultationStatus)}
                      className="bg-white border border-slate-300 text-slate-800 rounded-lg text-xs py-1 px-2.5 focus:outline-none focus:border-[#044e42] cursor-pointer"
                    >
                      <option value="waiting_triage">Waiting Triage</option>
                      <option value="in_queue">In Queue</option>
                      <option value="call">Call Patient</option>
                      <option value="hold">Hold</option>
                      <option value="complete">Mark Complete</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (Visible on screens >= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">TOKEN NO</th>
                    <th className="px-4 py-3">PATIENT NAME</th>
                    <th className="px-4 py-3">DEPARTMENT</th>
                    <th className="px-4 py-3">ASSIGNED CLINICIAN</th>
                    <th className="px-4 py-3">RISK LEVEL</th>
                    <th className="px-4 py-3">CURRENT STATUS</th>
                    <th className="px-4 py-3">TIME GENERATED</th>
                    <th className="px-4 py-3 text-right">QUEUE ACTION OVERRIDE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tokens.map((token) => (
                    <tr key={token.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3.5 font-bold text-[#044e42] text-xs font-mono">
                        {token.tokenNumber}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-900">{token.patientName}</td>
                      <td className="px-4 py-3.5 text-slate-500 font-medium">{token.department}</td>
                      <td className="px-4 py-3.5 text-slate-800 font-medium">{token.doctorName}</td>
                      <td className="px-4 py-3.5">
                        {token.riskLevel === 'high_risk' || token.riskLevel === 'emergency' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-full text-[11px] font-semibold">
                            <AlertTriangle className="w-3 h-3 text-rose-600" /> High Risk
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-full text-[11px] font-medium">
                            Routine
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
                          {statusLabel(token.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">{token.time}</td>
                      <td className="px-4 py-3.5 text-right">
                        <select
                          value={token.status}
                          onChange={(e) => handleStatusOverride(token.id, e.target.value as ConsultationStatus)}
                          className="bg-white border border-slate-300 text-slate-800 rounded-lg text-xs py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-[#044e42] focus:border-[#044e42] cursor-pointer"
                        >
                          <option value="waiting_triage">Waiting Triage</option>
                          <option value="in_queue">In Queue</option>
                          <option value="call">Call Patient</option>
                          <option value="hold">Hold</option>
                          <option value="complete">Mark Complete</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
