'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { adminService, DepartmentReport, DepartmentTimeRange } from '../../../../services/admin.service';
import {
  Building2,
  Clock,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Activity,
} from 'lucide-react';

export default function AdminDepartmentsPage() {
  const [reports, setReports] = useState<DepartmentReport[]>([]);
  const [summary, setSummary] = useState({ totalPatientIntake: 0, completedConsults: 0, avgWaitMinutes: 0, emergencyTriage: 0 });
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<DepartmentTimeRange>('today');
  const [pathwayFilter, setPathwayFilter] = useState<'all' | 'allopathy' | 'ayurveda'>('all');
  const [search, setSearch] = useState('');

  const fetchReports = useCallback(async (range: DepartmentTimeRange) => {
    setLoading(true);
    try {
      const data = await adminService.getDepartmentAnalytics(range);
      setReports(data.departments);
      setSummary(data.summary);
    } catch {
      setReports([]);
      setSummary({ totalPatientIntake: 0, completedConsults: 0, avgWaitMinutes: 0, emergencyTriage: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports(timeRange);
  }, [fetchReports, timeRange]);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const matchesPathway = pathwayFilter === 'all' || r.pathway === pathwayFilter;
      const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase());
      return matchesPathway && matchesSearch;
    });
  }, [reports, pathwayFilter, search]);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-slate-200/90 p-4 sm:p-5 rounded-2xl shadow-xs">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#044e42]" />
            <span>Department Reports & Operational Analytics</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Departmental patient throughput, AYUSH vs Allopathy intake metrics, clinician coverage, and queue wait times.
          </p>
        </div>

        {/* Time Filter Buttons & Refresh */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="grid grid-cols-4 p-1 bg-slate-100 rounded-xl border border-slate-200 w-full sm:w-auto text-xs">
            {(['today', 'yesterday', '7d', '30d'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setTimeRange(range)}
                className={`py-1.5 px-3 rounded-lg font-bold transition-all capitalize cursor-pointer text-center ${
                  timeRange === range
                    ? 'bg-[#044e42] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                  {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : range}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchReports(timeRange)}
            className="p-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl transition-all cursor-pointer shrink-0"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Aggregate KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Total Patient Intake</span>
            <div className="p-1.5 bg-teal-50 text-teal-800 rounded-lg">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
            {loading ? '...' : summary.totalPatientIntake}
          </div>
          <p className="text-[10px] text-teal-700 font-semibold mt-1">
            Across {filteredReports.length} Active Departments
          </p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Completed Consults</span>
            <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
            {loading ? '...' : summary.completedConsults}
          </div>
          <p className="text-[10px] text-emerald-700 font-semibold mt-1">
            {summary.totalPatientIntake > 0
              ? `${Math.round((summary.completedConsults / summary.totalPatientIntake) * 100)}% clearance rate`
              : '0% clearance'}
          </p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Avg Wait Time</span>
            <div className="p-1.5 bg-amber-50 text-amber-700 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
            {loading ? '...' : `${summary.avgWaitMinutes}m`}
          </div>
          <p className="text-[10px] text-amber-700 font-semibold mt-1">
            Kiosk token to OPD consultation
          </p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Emergency Triage</span>
            <div className="p-1.5 bg-rose-50 text-rose-700 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
            {loading ? '...' : summary.emergencyTriage}
          </div>
          <p className="text-[10px] text-rose-700 font-semibold mt-1">
            Red flag biosensor priorities
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-3 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-[#044e42]"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {(['all', 'allopathy', 'ayurveda'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPathwayFilter(p)}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all capitalize whitespace-nowrap cursor-pointer ${
                pathwayFilter === p
                  ? 'bg-[#044e42] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p === 'all' ? 'All Pathways' : p === 'ayurveda' ? 'AYUSH / Ayurveda' : 'Allopathy'}
            </button>
          ))}
        </div>
      </div>

      {/* Department Cards Grid (Responsive 1 col mobile, 2 col tablet, 3 col desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          [1, 2, 3].map((item) => (
            <div key={item} className="h-56 rounded-2xl border border-slate-200 bg-white animate-pulse" />
          ))
        ) : filteredReports.length === 0 ? (
          <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-sm font-semibold text-slate-700">No department visits recorded today</p>
            <p className="mt-1 text-xs text-slate-500">Live department cards will appear when consultations are registered.</p>
          </div>
        ) : filteredReports.map((dept) => {
          const isAyush = dept.pathway === 'ayurveda';
          const completionPct =
            dept.totalVisits > 0 ? Math.round((dept.completedVisits / dept.totalVisits) * 100) : 0;

          return (
            <div
              key={dept.id}
              className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-teal-500/50 hover:shadow-sm transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs font-bold text-xs ${
                        isAyush ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-teal-100 text-[#044e42] border border-teal-300'
                      }`}
                    >
                      {dept.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-tight">{dept.name}</h3>
                      <span
                        className={`inline-block text-[10px] font-bold px-2 py-0.2 rounded-full border mt-0.5 ${
                          isAyush
                            ? 'bg-amber-50 text-amber-900 border-amber-200'
                            : 'bg-teal-50 text-teal-900 border-teal-200'
                        }`}
                      >
                        {isAyush ? 'AYUSH · Ayurveda' : 'Modern Allopathy'}
                      </span>
                    </div>
                  </div>

                  <span className="text-xs font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 shrink-0">
                    {dept.totalVisits} Visits
                  </span>
                </div>

                {/* Metrics Matrix */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50/80 rounded-xl border border-slate-100 text-center my-3 text-xs">
                  <div>
                    <span className="text-[10px] font-medium text-slate-400 block">Cleared</span>
                    <strong className="text-emerald-700 font-bold text-sm">{dept.completedVisits}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-medium text-slate-400 block">Waiting</span>
                    <strong className="text-amber-700 font-bold text-sm">{dept.waitingQueue}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-medium text-slate-400 block">Avg Wait</span>
                    <strong className="text-slate-800 font-bold text-sm">{dept.avgWaitMinutes}m</strong>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1 my-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                    <span>OPD Clearance Progress</span>
                    <span className="font-bold text-slate-700">{completionPct}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        isAyush ? 'bg-amber-600' : 'bg-[#044e42]'
                      }`}
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 mt-2">
                <span className="flex items-center gap-1 font-medium">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>{dept.activeDoctors} Clinicians on duty</span>
                </span>

                {dept.emergencyCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{dept.emergencyCount} Urgent</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
