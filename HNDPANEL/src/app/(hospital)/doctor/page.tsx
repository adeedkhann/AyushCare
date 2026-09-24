'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { doctorService, PatientHistoryResponse } from '../../../services/doctor.service';
import { ConsultationQueueItem, ClinicalSummary, UploadedDocument } from '../../../types/api';
import { Patient, PrescriptionItem } from '../../../types/clinical';
import { mapQueueItemToPatient } from '../../../lib/adapters';
import { subscribeToQueueEvents, subscribeToSosAlerts } from '../../../lib/socket';
import { TopNavbar } from '../../../components/TopNavbar';
import { QueueSidebar } from '../../../components/QueueSidebar';
import { ClinicalWorkspace } from '../../../components/ClinicalWorkspace';
import { EvidenceDrawer } from '../../../components/EvidenceDrawer';
import { Stethoscope, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';

// Clinical Workspace Skeleton for immediate, zero-lag transitions on patient switch
const ClinicalWorkspaceSkeleton = () => (
  <div className="flex-1 flex flex-col bg-[#f8fafc] overflow-y-auto p-3 sm:p-4 md:p-5 space-y-3.5 select-none animate-pulse">
    {/* 1. Header Card Skeleton */}
    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-full bg-slate-200 shrink-0" />
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <div className="h-4 bg-slate-200 rounded w-36" />
              <div className="h-4 bg-slate-100 rounded w-16" />
              <div className="h-4 bg-teal-100/60 rounded w-20" />
            </div>
            <div className="h-3 bg-slate-100 rounded w-48" />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="h-7 bg-slate-100 rounded-lg w-28" />
          <div className="h-7 bg-emerald-100/60 rounded-full w-24" />
        </div>
      </div>
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
        <div className="h-3 bg-slate-100 rounded w-64" />
        <div className="h-3 bg-slate-100 rounded w-32" />
      </div>
    </div>

    {/* 2. Vitals Ribbon Skeleton */}
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
          <div className="h-2.5 bg-slate-200 rounded w-20" />
          <div className="h-5 bg-slate-100 rounded w-14" />
        </div>
      ))}
    </div>

    {/* 3. Sub-Navigation Tabs Skeleton */}
    <div className="flex items-center space-x-4 border-b border-slate-200 pb-2">
      <div className="h-4 bg-teal-800/30 rounded w-28" />
      <div className="h-4 bg-slate-200 rounded w-24" />
      <div className="h-4 bg-slate-200 rounded w-20" />
      <div className="h-4 bg-slate-200 rounded w-28" />
      <div className="h-4 bg-slate-200 rounded w-24" />
    </div>

    {/* 4. AI Clinical Summary & HPI Skeleton Card */}
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-3.5 h-3.5 text-teal-600 animate-spin" />
          <div className="h-3.5 bg-slate-200 rounded w-64" />
        </div>
        <div className="h-6 bg-slate-100 rounded w-20" />
      </div>
      <div className="space-y-2 pt-1">
        <div className="h-3 bg-slate-100 rounded w-full" />
        <div className="h-3 bg-slate-100 rounded w-11/12" />
        <div className="h-3 bg-slate-100 rounded w-4/5" />
      </div>
    </div>

    {/* 5. Quick Rx Builder Skeleton Card */}
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
      <div className="h-3.5 bg-slate-200 rounded w-44" />
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
        <div className="md:col-span-4 h-8 bg-slate-100 rounded-lg" />
        <div className="md:col-span-2 h-8 bg-slate-100 rounded-lg" />
        <div className="md:col-span-3 h-8 bg-slate-100 rounded-lg" />
        <div className="md:col-span-2 h-8 bg-slate-100 rounded-lg" />
        <div className="md:col-span-1 h-8 bg-teal-800/20 rounded-lg" />
      </div>
    </div>
  </div>
);

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const SIGNED_OFF_STORAGE_KEY = 'ayushcare_signed_off_patients';

function getStoredSignedOffPatients(): Patient[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SIGNED_OFF_STORAGE_KEY);
    if (!raw) return [];
    const parsed: Patient[] = JSON.parse(raw);
    const now = Date.now();
    const valid = parsed.filter((p) => {
      if (!p.signedOffAt) return false;
      const signedTime = new Date(p.signedOffAt).getTime();
      return now - signedTime <= FORTY_EIGHT_HOURS_MS;
    });
    if (valid.length !== parsed.length) {
      localStorage.setItem(SIGNED_OFF_STORAGE_KEY, JSON.stringify(valid));
    }
    return valid;
  } catch {
    return [];
  }
}

function saveSignedOffPatientToStorage(patient: Patient): Patient[] {
  if (typeof window === 'undefined') return [patient];
  try {
    const existing = getStoredSignedOffPatients().filter((p) => p.id !== patient.id);
    const updated = [patient, ...existing];
    localStorage.setItem(SIGNED_OFF_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [patient];
  }
}

export default function DoctorWorkspacePage() {
  const [rawQueue, setRawQueue] = useState<ConsultationQueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  const [selectedConsultationId, setSelectedConsultationId] = useState<string | null>(null);
  const [activeSummary, setActiveSummary] = useState<ClinicalSummary | null>(null);
  const [activeReports, setActiveReports] = useState<UploadedDocument[]>([]);
  const [activeSessionDocs, setActiveSessionDocs] = useState<any[]>([]);
  const [activePatientHistory, setActivePatientHistory] = useState<PatientHistoryResponse | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [liveConsentNotification, setLiveConsentNotification] = useState<string | null>(null);
  const [sosAlert, setSosAlert] = useState<any | null>(null);

  // Responsive Drawer States
  const [isEvidenceDrawerOpen, setIsEvidenceDrawerOpen] = useState(true);
  const [isQueueSidebarOpen, setIsQueueSidebarOpen] = useState(false);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [signedOffPatients, setSignedOffPatients] = useState<Patient[]>([]);
  const isMountedRef = useRef(true);

  // Persistent decoupled refs to prevent background polling from resetting doctor's active drafts
  const rxDraftsRef = useRef<Record<string, PrescriptionItem[]>>({});
  const customEditsRef = useRef<Record<string, Partial<Patient>>>({});

  useEffect(() => {
    isMountedRef.current = true;
    setSignedOffPatients(getStoredSignedOffPatients());
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 1. Fetch initial queue from backend
  const fetchQueue = useCallback(async (selectFirst = true) => {
    if (!isMountedRef.current) return;
    setLoadingQueue(true);
    setQueueError(null);
    try {
      const queueItems = await doctorService.getQueue();
      const validItems = Array.isArray(queueItems) ? queueItems : [];
      if (!isMountedRef.current) return;

      setRawQueue(validItems);

      if (validItems.length > 0) {
        setSelectedConsultationId((prev) => {
          if (prev && validItems.some((item) => item.id === prev)) {
            return prev;
          }
          return selectFirst ? validItems[0].id : null;
        });
      } else {
        setSelectedConsultationId(null);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setQueueError(err.message || 'Failed to load OPD queue. Please check server connectivity.');
      setRawQueue([]);
      setSelectedConsultationId(null);
    } finally {
      if (isMountedRef.current) {
        setLoadingQueue(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchQueue(true);

    // 2. Real-time socket updates for queue arrival & triage red flags
    const unsubscribe = subscribeToQueueEvents(
      () => fetchQueue(false),
      () => fetchQueue(false),
      () => fetchQueue(false),
      () => fetchQueue(false)
    );
    const unsubscribeSos = subscribeToSosAlerts((alert) => {
      setSosAlert(alert);
      fetchQueue(false);
      if (typeof window !== 'undefined') {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const context = new AudioContextClass();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = 880;
          gain.gain.value = 0.08;
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.35);
        }
      }
    });

    return () => {
      unsubscribe();
      unsubscribeSos();
    };
  }, [fetchQueue]);

  // Synchronous, instant patient selection handler to eliminate stale state lag
  const handleSelectPatient = useCallback(
    (id: string) => {
      if (id === selectedConsultationId) return;
      // 1. Immediately purge stale active summary and reports
      setActiveSummary(null);
      setActiveReports([]);
      setActiveSessionDocs([]);
      setActivePatientHistory(null);
      // 2. Activate skeleton loader synchronously
      setLoadingDetails(true);
      // 3. Switch active ID
      setSelectedConsultationId(id);
    },
    [selectedConsultationId]
  );

  // 3. Load active patient clinical summary and reports whenever selected ID changes
  useEffect(() => {
    if (!selectedConsultationId) {
      setActiveSummary(null);
      setActiveReports([]);
      setActiveSessionDocs([]);
      setLoadingDetails(false);
      return;
    }

    let isEffectActive = true;
    setLoadingDetails(true);

    const loadDetails = async () => {
      try {
        const [summary, reports, session, history] = await Promise.all([
          doctorService.getPatientSummary(selectedConsultationId).catch(() => null),
          doctorService.getPatientReports(selectedConsultationId).catch(() => []),
          doctorService.getConsultationSession(selectedConsultationId).catch(() => null),
          doctorService.getPatientHistory(
            rawQueue.find((item) => item.id === selectedConsultationId)?.patient_id || selectedConsultationId
          ).catch(() => ({ visits: [], documents: [] })),
        ]);

        if (isEffectActive && isMountedRef.current) {
          setActiveSummary(summary);
          setActiveReports(Array.isArray(reports) ? reports : []);
          setActiveSessionDocs(session?.documents || []);
          setActivePatientHistory(history);
        }
      } catch {
        if (isEffectActive && isMountedRef.current) {
          setActiveSummary(null);
          setActiveReports([]);
          setActiveSessionDocs([]);
        }
      } finally {
        if (isEffectActive && isMountedRef.current) {
          setLoadingDetails(false);
        }
      }
    };

    loadDetails();

    // Live Real-Time Sync Polling: Synchronize with Mobile privacy toggles every 4s
    const pollTimer = setInterval(async () => {
      if (!isEffectActive || !isMountedRef.current || document.hidden) return;

      try {
        const [summary, reports, session, history] = await Promise.all([
          doctorService.getPatientSummary(selectedConsultationId).catch(() => null),
          doctorService.getPatientReports(selectedConsultationId).catch(() => []),
          doctorService.getConsultationSession(selectedConsultationId).catch(() => null),
          doctorService.getPatientHistory(
            rawQueue.find((item) => item.id === selectedConsultationId)?.patient_id || selectedConsultationId
          ).catch(() => ({ visits: [], documents: [] })),
        ]);

        if (!isEffectActive || !isMountedRef.current) return;

        const validReports = Array.isArray(reports) ? reports : [];
        const sessionDocs = session?.documents || [];

        setActiveReports((prev) => {
          if (validReports.length > prev.length) {
            setLiveConsentNotification('🔓 Patient granted access via AyushCare Mobile! Document unlocked in real-time.');
            setTimeout(() => {
              if (isMountedRef.current) setLiveConsentNotification(null);
            }, 4500);
          } else if (validReports.length < prev.length) {
            setLiveConsentNotification('🔒 Patient locked report access via AyushCare Mobile privacy controls.');
            setTimeout(() => {
              if (isMountedRef.current) setLiveConsentNotification(null);
            }, 4500);
          }
          return validReports;
        });

        setActiveSummary((prev) => {
          if (prev?.restricted && !summary?.restricted) {
            setLiveConsentNotification('🔓 Patient unlocked visit sharing via AyushCare Mobile!');
            setTimeout(() => {
              if (isMountedRef.current) setLiveConsentNotification(null);
            }, 4500);
          }
          return summary || prev;
        });

        if (sessionDocs.length > 0) {
          setActiveSessionDocs(sessionDocs);
        }
        setActivePatientHistory(history);
      } catch {
        // Silent sync catch
      }
    }, 4000);

    return () => {
      isEffectActive = false;
      clearInterval(pollTimer);
    };
  }, [selectedConsultationId]);

  // 4. Map raw queue items to frontend Patient UI models with decoupled draft preservation & 48h signed-off retention
  useEffect(() => {
    const now = Date.now();

    // Map active queue items
    const activeMapped: Patient[] = rawQueue.map((item) => {
      const p =
        item.id === selectedConsultationId
          ? mapQueueItemToPatient(item, activeSummary, activeReports, activeSessionDocs, activePatientHistory)
          : mapQueueItemToPatient(item, null, [], [], activePatientHistory);

      // Decouple & preserve local prescription drafts
      if (rxDraftsRef.current[item.id]) {
        p.prescriptions = rxDraftsRef.current[item.id];
      }
      if (customEditsRef.current[item.id]) {
        Object.assign(p, customEditsRef.current[item.id]);
      }
      return p;
    });

    // Exclude any active queue item that has already been signed off locally
    const signedOffIds = new Set(signedOffPatients.map((sp) => sp.id));
    const activeFiltered = activeMapped.filter((p) => !signedOffIds.has(p.id));

    // Filter signed-off patients ensuring strict 48-hour retention window
    const validSignedOff = signedOffPatients.filter((sp) => {
      if (!sp.signedOffAt) return true;
      return now - new Date(sp.signedOffAt).getTime() <= FORTY_EIGHT_HOURS_MS;
    });

    // Combine active patients + 48h completed patients
    const combined = [...activeFiltered, ...validSignedOff];
    setPatients(combined);
  }, [rawQueue, selectedConsultationId, activeSummary, activeReports, activeSessionDocs, activePatientHistory, signedOffPatients]);

  // Active selected patient
  const selectedPatient = useMemo(() => {
    if (!selectedConsultationId || patients.length === 0) return null;
    return patients.find((p) => p.id === selectedConsultationId) || patients[0] || null;
  }, [patients, selectedConsultationId]);

  // Auto-collapse right evidence drawer if there are zero documents and zero transcripts
  useEffect(() => {
    if (selectedPatient) {
      const hasDocs = selectedPatient.documents && selectedPatient.documents.length > 0;
      const hasTranscripts = selectedPatient.transcripts && selectedPatient.transcripts.length > 0;
      const hasTimeline = selectedPatient.pastVisits && selectedPatient.pastVisits.length > 0;
      if (!hasDocs && !hasTranscripts && !hasTimeline) {
        setIsEvidenceDrawerOpen(false);
      } else {
        setIsEvidenceDrawerOpen(true);
      }
    }
  }, [selectedPatient?.id, selectedPatient?.documents?.length, selectedPatient?.transcripts?.length]);

  // Update patient status & clinical notes in backend, while preserving local draft state
  const handleUpdatePatient = async (updated: Patient) => {
    // 1. Preserve local prescription list & edits in persistent refs
    rxDraftsRef.current[updated.id] = updated.prescriptions || [];
    customEditsRef.current[updated.id] = {
      chiefComplaint: updated.chiefComplaint,
      historyOfPresentIllness: updated.historyOfPresentIllness,
      socrates: updated.socrates,
    };

    const savedSummary = await doctorService.updateClinicalSummary(updated.id, {
      chiefComplaint: updated.chiefComplaint,
      clinicalSummary: updated.historyOfPresentIllness || updated.narrativeSummary || '',
      socratesAssessment: updated.socrates,
    });
    setPatients((prev) => prev.map((p) => (p.id === updated.id ? {
      ...updated,
      chiefComplaint: savedSummary.chief_complaint || updated.chiefComplaint,
      historyOfPresentIllness: savedSummary.clinical_summary || savedSummary.hpi_narrative || savedSummary.history_of_present_illness || updated.historyOfPresentIllness,
      narrativeSummary: savedSummary.clinical_summary || savedSummary.hpi_narrative || updated.narrativeSummary,
    } : p)));
    try {
      await doctorService.updateConsultationStatus(updated.id, 'in_queue');
    } catch {
      // Retain optimistic local state
    }
  };

  // Sign off & confirm consultation: marks completed & retains patient in queue for 48 hours
  const handleConfirmContinue = async () => {
    if (!selectedConsultationId || !selectedPatient) return;

    try {
      const remarksText = selectedPatient.prescriptions?.length
        ? `Prescribed: ${selectedPatient.prescriptions.map((p) => `${p.drugName} (${p.dosage}, ${p.frequency})`).join('; ')}`
        : 'Consultation completed and prescription sign-off verified.';

      await doctorService.signOffConsultation(selectedConsultationId, remarksText, selectedPatient.prescriptions || []);
    } catch {
      // Local state fallback
    }

    // Mark as completed & retain for 48 hours in queue
    const now = new Date().toISOString();
    const finalizedPatient: Patient = {
      ...selectedPatient,
      priority: 'Completed',
      status: 'completed',
      signedOffAt: now,
    };

    const updatedStored = saveSignedOffPatientToStorage(finalizedPatient);
    setSignedOffPatients(updatedStored);

    delete rxDraftsRef.current[selectedConsultationId];
    delete customEditsRef.current[selectedConsultationId];

    // Refresh queue from server without immediately deselecting
    await fetchQueue(false);
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[url('/KioskScreenBg.png')] bg-center bg-cover bg-no-repeat bg-[#f1f8f7] flex flex-col font-sans text-slate-900 antialiased select-none">
      {/* 1. Top Navbar with Responsive Drawer Toggles & Doctor Profile Dropdown */}
      <TopNavbar
        onToggleQueue={() => setIsQueueSidebarOpen((prev) => !prev)}
        onToggleEvidence={() => setIsEvidenceDrawerOpen((prev) => !prev)}
        queueCount={patients.length}
        evidenceCount={selectedPatient?.documents?.length || 0}
        isEvidenceOpen={isEvidenceDrawerOpen}
      />

      {/* Error Notification Banner */}
      {sosAlert && (
        <div className="bg-red-700 text-white px-4 py-3 flex items-center justify-between gap-3 shadow-lg animate-pulse">
          <div className="flex items-center gap-2 text-sm font-bold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>SOS EMERGENCY: {sosAlert.patient?.full_name || 'Patient'} - Token {sosAlert.token}</span>
          </div>
          <button onClick={() => setSosAlert(null)} className="text-xs font-semibold underline">Dismiss</button>
        </div>
      )}

      {queueError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between text-xs text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{queueError}</span>
          </div>
          <button
            onClick={() => fetchQueue(true)}
            className="flex items-center gap-1 font-semibold text-red-800 hover:underline cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Live Mobile Consent Notification Toast */}
      {liveConsentNotification && (
        <div className="bg-teal-50 border-b border-teal-200 px-4 py-2 flex items-center justify-between text-xs text-teal-900 shadow-xs animate-in slide-in-from-top-1">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-2 h-2 rounded-full bg-teal-500 animate-ping shrink-0" />
            <span>{liveConsentNotification}</span>
          </div>
          <span className="text-[10px] text-teal-700 font-mono bg-teal-100/70 px-2 py-0.5 rounded-full border border-teal-200">
            Real-time Mobile Sync
          </span>
        </div>
      )}

      {/* 2. Main 3-Column Split Workspace with Responsive Drawers */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Column: Live OPD Queue (Docked on lg, Drawer on tablet/mobile) */}
        <QueueSidebar
          patients={patients}
          selectedPatientId={selectedConsultationId || ''}
          onSelectPatient={handleSelectPatient}
          isLoading={loadingQueue}
          isOpenMobile={isQueueSidebarOpen}
          onCloseMobile={() => setIsQueueSidebarOpen(false)}
        />

        {/* Middle Column: Clinical Workspace with Immediate Skeleton on Switch */}
        {loadingDetails ? (
          <ClinicalWorkspaceSkeleton />
        ) : selectedPatient ? (
          <ClinicalWorkspace
            key={`workspace-${selectedPatient.id}`}
            patient={selectedPatient}
            onUpdatePatient={handleUpdatePatient}
            onConfirmContinue={handleConfirmContinue}
            onToggleEvidence={() => setIsEvidenceDrawerOpen((prev) => !prev)}
            isEvidenceOpen={isEvidenceDrawerOpen}
          />
        ) : (
          <div className="flex-1 bg-[#f8fafc] flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <Stethoscope className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-700">No Active Consultation Selected</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Select an OPD token from the queue to inspect patient chief complaint, AI history draft, and medical investigations.
            </p>
          </div>
        )}

        {/* Right Column: Collapsible Evidence Drawer */}
        {selectedPatient && (
          <EvidenceDrawer
            key={`drawer-${selectedPatient.id}`}
            patient={selectedPatient}
            isOpen={isEvidenceDrawerOpen}
            onToggle={() => setIsEvidenceDrawerOpen((prev) => !prev)}
            onClose={() => setIsEvidenceDrawerOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
