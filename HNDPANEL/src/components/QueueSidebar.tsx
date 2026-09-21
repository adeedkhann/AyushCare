'use client';

import React, { useState } from 'react';
import { Patient, PriorityStatus } from '../types/clinical';
import { Search, X, Users } from 'lucide-react';

interface QueueSidebarProps {
  patients: Patient[];
  selectedPatientId: string;
  onSelectPatient: (patientId: string) => void;
  isLoading?: boolean;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const QueueSidebar: React.FC<QueueSidebarProps> = ({
  patients,
  selectedPatientId,
  onSelectPatient,
  isLoading = false,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'All' | 'Waiting' | 'Ready' | 'Urgent' | 'Completed'>('All');

  // Metrics
  const urgentCount = patients.filter((p) => p.priority === 'Urgent').length;
  const waitingCount = patients.filter((p) => p.priority === 'Waiting' || p.priority === 'History Ready').length;
  const completedCount = patients.filter((p) => p.priority === 'Completed' || p.status === 'completed').length;

  // Filter logic
  const filteredPatients = patients.filter((patient) => {
    const matchesSearch =
      patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.tokenNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.chiefComplaint.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (patient.patientCode && patient.patientCode.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterTab === 'Urgent') return patient.priority === 'Urgent';
    if (filterTab === 'Waiting') return patient.priority === 'Waiting';
    if (filterTab === 'Ready') return patient.priority === 'History Ready';
    if (filterTab === 'Completed') return patient.priority === 'Completed' || patient.status === 'completed';
    return true;
  });

  const isSignedOff = (patient: Patient) => patient.priority === 'Completed' || patient.status === 'completed';
  const activePatients = filteredPatients.filter((patient) => !isSignedOff(patient));
  const signedOffPatients = filteredPatients.filter(isSignedOff);

  const renderPatient = (patient: Patient) => {
    const isSelected = patient.id === selectedPatientId;
    const snippet = getQueueSnippet(patient);
    const isUrgent = patient.priority === 'Urgent';

    return (
      <div
        key={patient.id}
        onClick={() => handlePatientClick(patient.id)}
        className={`p-3 rounded-xl border transition-all cursor-pointer relative shadow-2xs ${
          isSelected
            ? 'bg-[#f0fdfa] border-teal-500/80 ring-1 ring-teal-500/40'
            : isUrgent
            ? 'bg-red-50/40 border-red-200/80 hover:bg-red-50/70'
            : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80'
        }`}
      >
        <div className="flex items-center justify-between gap-1.5 mb-1.5 min-w-0">
          <div className="flex items-center space-x-1.5 min-w-0 flex-1">
            <span className={`w-2 h-2 rounded-full shrink-0 ${getDotStyle(patient.priority, patient.status)}`} />
            <span className="font-bold text-xs text-slate-900 shrink-0">{patient.tokenNumber}</span>
            <span className="font-semibold text-xs text-slate-900 truncate">{patient.name}</span>
          </div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${getBadgeStyle(patient.priority, patient.status)}`}>
            {isSignedOff(patient) ? 'Signed Off' : patient.priority}
          </span>
        </div>
        <div className="text-xs text-slate-500 font-medium pl-3.5 flex items-center justify-between gap-2 min-w-0">
          <div className="truncate flex-1 min-w-0">
            <span className="text-slate-400">
              {patient.age ? `${patient.age}y · ` : ''}
              {patient.gender !== 'Other' ? `${patient.gender.charAt(0)} · ` : ''}
            </span>
            <span className="text-slate-700 font-medium truncate" title={snippet}>{snippet}</span>
          </div>
          {patient.allergies && patient.allergies.length > 0 && (
            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.2 rounded border border-red-200 shrink-0">
              ⚠️ Allg
            </span>
          )}
        </div>
      </div>
    );
  };

  const getBadgeStyle = (priority: PriorityStatus, status?: string) => {
    if (priority === 'Completed' || status === 'completed') {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    switch (priority) {
      case 'Urgent':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'Waiting':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'History Ready':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getDotStyle = (priority: PriorityStatus, status?: string) => {
    if (priority === 'Completed' || status === 'completed') return 'bg-emerald-500';
    if (priority === 'Urgent') return 'bg-red-500';
    if (priority === 'History Ready') return 'bg-teal-500';
    return 'bg-amber-400';
  };

  const handlePatientClick = (id: string) => {
    onSelectPatient(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  // Dynamic clean snippet for queue card
  const getQueueSnippet = (patient: Patient) => {
    if (patient.priority === 'Completed' || patient.status === 'completed') {
      const rxCount = patient.prescriptions?.length || 0;
      if (patient.signedOffAt) {
        try {
          const diffHours = Math.round((Date.now() - new Date(patient.signedOffAt).getTime()) / (1000 * 60 * 60));
          const timeText = diffHours <= 1 ? 'Just now' : diffHours < 24 ? `${diffHours}h ago` : 'Yesterday';
          return `Signed Off (${timeText}) • ${rxCount} Rx`;
        } catch {
          return `Signed Off • ${rxCount} Rx items`;
        }
      }
      return `Signed Off • ${rxCount} Rx items`;
    }

    const cc = patient.chiefComplaint?.trim();
    const isGenericIntake =
      !cc ||
      cc.toLowerCase() === 'intake recorded at kiosk' ||
      cc.toLowerCase() === 'intake recorded' ||
      cc.toLowerCase() === 'not recorded';

    if (!cc || isGenericIntake) {
      if (patient.alertMessage) {
        return patient.alertMessage;
      }
      if (patient.ayushProfile?.prakriti) {
        return `${patient.department || 'AYUSH'} • ${patient.ayushProfile.prakriti}`;
      }
      if (patient.department) {
        return `${patient.department} • Triage Ready`;
      }
      return 'General OPD • Triage Ready';
    }

    const onset = patient.socrates?.onset?.value;
    const hasValidOnset =
      onset &&
      !onset.toLowerCase().includes('not recorded') &&
      !onset.toLowerCase().includes('not provided');

    return hasValidOnset ? `${cc} • ${onset}` : cc;
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white select-none">
      {/* Header with Queue Metrics */}
      <div className="p-3.5 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#064e4b]" />
            <h2 className="font-bold text-sm text-slate-900 tracking-tight">OPD Queue</h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Counter Pills */}
            <div className="flex items-center space-x-1.5 text-xs">
              {urgentCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200/80">
                  {urgentCount} Urgent
                </span>
              )}
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200/60">
                {waitingCount} Active
              </span>
              {completedCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  {completedCount} Signed Off
                </span>
              )}
            </div>

            {/* Close button on mobile drawer */}
            {onCloseMobile && (
              <button
                onClick={onCloseMobile}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 lg:hidden cursor-pointer"
                title="Close Queue"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative mb-3">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search token / patient name..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#f8fafc] border border-slate-200/90 rounded-md focus:outline-none focus:border-[#064e4b] focus:bg-white transition-all placeholder:text-slate-400 text-slate-800"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center space-x-1 text-xs font-medium overflow-x-auto pb-0.5">
          {(['All', 'Waiting', 'Ready', 'Urgent', 'Completed'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`px-2.5 py-1 rounded-full text-[11px] transition-all cursor-pointer shrink-0 ${
                filterTab === tab
                  ? 'bg-[#064e4b] text-white font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 border border-transparent hover:border-slate-200'
              }`}
            >
              {tab === 'Completed' ? `Signed Off (${completedCount})` : tab}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Token List with Refined Vertical Spacing */}
      <div className="flex-1 overflow-y-auto space-y-2.5 p-3.5 bg-slate-50/50">
        {isLoading ? (
          <div className="space-y-3 p-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 rounded-xl border border-slate-100 bg-white animate-pulse">
                <div className="flex items-center justify-between mb-2">
                  <div className="h-3.5 bg-slate-200 rounded w-24" />
                  <div className="h-3.5 bg-slate-200 rounded w-12" />
                </div>
                <div className="h-3 bg-slate-200 rounded w-36 mt-1.5" />
              </div>
            ))}
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="text-center py-12 px-4 text-slate-400 text-xs">
            <p className="font-medium text-slate-500">
              {searchQuery ? 'No matching tokens found' : 'No patients in OPD queue'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              New intake tokens from the kiosk will automatically appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activePatients.length > 0 && (
              <section className="space-y-2">
                <h3 className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Patients</h3>
                <div className="space-y-2">{activePatients.map(renderPatient)}</div>
              </section>
            )}
            {signedOffPatients.length > 0 && (
              <section className="space-y-2 border-t border-slate-200 pt-3">
                <h3 className="px-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Signed Off (Last 48 Hours)</h3>
                <div className="space-y-2">{signedOffPatients.map(renderPatient)}</div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Column: Docked permanently on lg screens */}
      <aside className="hidden lg:flex w-72 xl:w-80 border-r border-slate-200/90 bg-white flex-col shrink-0 h-full">
        {sidebarContent}
      </aside>

      {/* Mobile/Tablet Off-canvas Drawer */}
      {isOpenMobile && (
        <>
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 top-[54px] z-30 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
          />
          <aside className="fixed inset-y-0 top-[54px] lg:top-0 left-0 z-30 lg:z-auto w-80 max-w-[85vw] bg-white shadow-2xl border-r border-slate-200 flex flex-col h-[calc(100vh-54px)] lg:h-full lg:hidden animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
};
