'use client';

import React, { useState } from 'react';
import { Patient, DocumentFile, PastVisit } from '../types/clinical';
import { DocumentViewerModal, resolveDocumentUrl } from './DocumentViewerModal';
import {
  FileText,
  Clock,
  FileCheck,
  ExternalLink,
  ArrowRight,
  FileSpreadsheet,
  PanelRightClose,
  PanelRightOpen,
  X,
  Eye,
  Sparkles,
  Lock,
  Pill,
} from 'lucide-react';

interface EvidenceDrawerProps {
  patient: Patient;
  isOpen: boolean;
  onToggle: () => void;
  onClose?: () => void;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  patient,
  isOpen,
  onToggle,
  onClose,
}) => {
  const [activeDrawerTab, setActiveDrawerTab] = useState<'Docs' | 'Timeline'>('Docs');
  const [selectedDocForViewer, setSelectedDocForViewer] = useState<DocumentFile | null>(null);

  const historicalVisits = Array.isArray(patient.pastVisits) ? patient.pastVisits : [];
  const currentVisit: PastVisit = {
    consultationId: patient.id,
    tokenNumber: patient.tokenNumber,
    createdAt: patient.createdAt,
    department: patient.department,
    pathway: patient.departmentPathway,
    chiefComplaint: patient.chiefComplaint,
    prescriptions: patient.prescriptions,
    documents: patient.documents.filter((document) => document.consultationId === patient.id),
  };
  const timelineVisits = [
    currentVisit,
    ...historicalVisits.filter((visit) => visit.consultationId !== patient.id),
  ].sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    return rightTime - leftTime;
  });
  const timelineDocuments = patient.documents.filter(
    (document) => !document.consultationId || !timelineVisits.some((visit) => visit.documents?.some((item) => item.id === document.id))
  );

  const handleOpenDoc = (doc: DocumentFile) => {
    setSelectedDocForViewer(doc);
  };

  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.jpg') || fileName.endsWith('.png') || fileName.endsWith('.jpeg') || fileName.endsWith('.webp')) {
      return <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />;
    }
    if (fileName.toLowerCase().includes('prescription') || fileName.toLowerCase().includes('rx')) {
      return <FileCheck className="w-4 h-4 text-teal-600 shrink-0" />;
    }
    return <FileText className="w-4 h-4 text-slate-500 shrink-0" />;
  };

  // If collapsed on desktop, render a compact vertical rail
  if (!isOpen) {
    return (
      <>
        <aside className="hidden lg:flex w-12 border-l border-slate-200/90 bg-white flex-col items-center py-3 select-none shrink-0 transition-all duration-300">
          <button
            onClick={onToggle}
            className="p-2 rounded-lg text-slate-500 hover:text-[#064e4b] hover:bg-slate-100 transition-colors cursor-pointer mb-4"
            title="Expand Evidence Drawer"
          >
            <PanelRightOpen className="w-4 h-4" />
          </button>

          <div className="flex flex-col items-center space-y-4 text-slate-400">
            <button
              onClick={() => {
                setActiveDrawerTab('Docs');
                onToggle();
              }}
              className="p-2 rounded-lg hover:text-[#064e4b] hover:bg-slate-100 transition-colors cursor-pointer relative"
              title="Uploaded Documents & AI Extractions"
            >
              <FileText className="w-4 h-4" />
              {patient.documents.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#054444] text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                  {patient.documents.length}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setActiveDrawerTab('Timeline');
                onToggle();
              }}
              className="p-2 rounded-lg hover:text-[#064e4b] hover:bg-slate-100 transition-colors cursor-pointer"
              title="Clinical Timeline"
            >
              <Clock className="w-4 h-4" />
            </button>

          </div>
        </aside>

        {/* In-App Document Viewer Modal */}
        <DocumentViewerModal
          document={selectedDocForViewer}
          isOpen={Boolean(selectedDocForViewer)}
          onClose={() => setSelectedDocForViewer(null)}
        />
      </>
    );
  }

  // Expanded Drawer (Desktop dock + Mobile/Tablet slide-over)
  return (
    <>
      {/* Mobile/Tablet Backdrop Overlay */}
      <div
        onClick={onClose || onToggle}
        className="fixed inset-0 top-[54px] z-30 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
      />

      <aside className="fixed inset-y-0 top-[54px] lg:top-0 right-0 z-30 lg:z-auto w-80 sm:w-88 max-w-[90vw] bg-white border-l border-slate-200/90 shadow-2xl lg:shadow-none lg:static lg:w-80 xl:w-88 flex flex-col shrink-0 h-[calc(100vh-54px)] lg:h-full select-none transition-transform duration-300">
        {/* Header with Tabs and Collapse Toggle Button */}
        <div className="flex items-center justify-between border-b border-slate-200/90 bg-[#f8fafc] p-2 gap-1.5 shrink-0">
          <div className="flex items-center flex-1 gap-1">
            {[
              { id: 'Docs', label: 'Docs', icon: FileText, count: patient.documents.length },
              { id: 'Timeline', label: 'Timeline', icon: Clock },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeDrawerTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveDrawerTab(tab.id as any)}
                  className={`flex-1 flex items-center justify-center space-x-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-[#064e4b] shadow-2xs border border-slate-200/80'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#064e4b]' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 bg-teal-100 text-[#064e4b] rounded-full text-[10px] font-bold">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Collapse Button */}
          <button
            onClick={onClose || onToggle}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer shrink-0"
            title="Collapse Drawer"
          >
            <PanelRightClose className="w-4 h-4 hidden lg:block" />
            <X className="w-4 h-4 lg:hidden" />
          </button>
        </div>

        {/* Drawer Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* TAB 1: DOCS & AI EXTRACTIONS */}
          {activeDrawerTab === 'Docs' && (
            <>
              {/* Section 1: Uploaded Documents */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">
                    UPLOADED DOCUMENTS ({patient.documents.length})
                  </span>
                  {patient.documents.length > 0 && (
                    <span className="text-[10px] text-teal-700 font-semibold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200/60">
                      Verified
                    </span>
                  )}
                </div>

                {patient.documents.length === 0 ? (
                  <div className="p-4 border border-dashed border-slate-200 rounded-lg text-center text-xs text-slate-400">
                    No uploaded physical documents or scanned reports for this patient.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {patient.documents.map((doc, idx) => {
                      if (doc.isLocked) {
                        return (
                          <div
                            key={`doc-${doc.id || idx}-${idx}`}
                            className="p-2.5 rounded-lg border border-amber-300/80 bg-amber-50/40 relative overflow-hidden flex items-center justify-between cursor-not-allowed select-none shadow-2xs"
                            title="Restricted by patient via AyushCare Mobile (Consent Required)"
                          >
                            <div className="flex items-center space-x-2.5 min-w-0 filter blur-[2px] opacity-40">
                              {getFileIcon(doc.name)}
                              <div className="truncate">
                                <p className="text-xs font-bold text-slate-800 truncate">
                                  {doc.name}
                                </p>
                                <p className="text-[10px] text-slate-400 font-medium">
                                  {doc.visitDate ? `${doc.visitDate} · ` : ''}{doc.date} · {doc.size}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded text-[10px] font-bold">
                              <Lock className="w-3 h-3 text-amber-800" />
                              <span>Locked</span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={`doc-${doc.id || idx}-${idx}`}
                          onClick={() => handleOpenDoc(doc)}
                          className="p-2.5 rounded-lg border border-slate-200/90 bg-[#f8fafc]/60 hover:bg-teal-50/40 hover:border-teal-300 transition-all flex items-center justify-between group cursor-pointer shadow-2xs"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            {getFileIcon(doc.name)}
                            <div className="truncate">
                              <p className="text-xs font-bold text-slate-900 truncate group-hover:text-[#064e4b]">
                                {doc.name}
                              </p>
                              <p className="text-[10px] text-slate-400 font-medium">
                                {doc.visitDate ? `${doc.visitDate} · ` : ''}{doc.date} · {doc.size}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#064e4b] shrink-0" />
                            <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#064e4b] shrink-0" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 2: AI Extraction - Prescription */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">
                    AI EXTRACTION - MEDICATIONS
                  </span>
                  <Sparkles className="w-3 h-3 text-teal-600" />
                </div>

                {patient.extractions.length === 0 ? (
                  <div className="p-4 bg-slate-50/80 border border-slate-200/90 rounded-xl text-center space-y-2">
                    <div className="w-8 h-8 rounded-full bg-teal-50 border border-teal-200/70 text-teal-700 flex items-center justify-center mx-auto">
                      <Pill className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">No Physical Rx Extracted</p>
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5 max-w-xs mx-auto">
                        Prescription photos uploaded at Kiosk or via Mobile are parsed by Doc-Intelligence OCR to surface historical medications.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {patient.extractions.map((item, idx) => (
                      <div
                        key={`extraction-${item.drug || idx}-${idx}`}
                        className="p-3 rounded-xl border border-slate-200/90 bg-white shadow-2xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">{item.drug}</span>
                          {item.status === 'Verified' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
                              {item.confidence}%
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1" />
                              Verify
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {item.dosage} · {item.frequency}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer Link */}
              {patient.documents.length > 0 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleOpenDoc(patient.documents[0])}
                    className="text-xs font-semibold text-[#064e4b] hover:underline inline-flex items-center space-x-1 cursor-pointer"
                  >
                    <span>View Primary Document in Fullscreen</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          )}

          {/* TAB 2: TIMELINE */}
          {activeDrawerTab === 'Timeline' && (
            <div className="space-y-4">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">
                PATIENT CLINICAL TIMELINE
              </span>

              <div className="relative pl-4 border-l-2 border-slate-200 space-y-5">
                {timelineVisits.map((visit, idx) => (
                  <div key={`timeline-visit-${visit.consultationId}-${idx}`} className="relative">
                    <div className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-white ${visit.consultationId === patient.id ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <div className="text-[10px] font-bold text-slate-400">
                      {visit.createdAt && !Number.isNaN(new Date(visit.createdAt).getTime()) ? new Date(visit.createdAt).toLocaleDateString().toUpperCase() : 'VISIT'}
                    </div>
                    <div className="text-xs font-bold text-slate-900 mt-0.5">
                      {visit.consultationId === patient.id ? 'Current Visit · ' : ''}{visit.department || 'AyushCare OPD'} · {visit.tokenNumber || 'Consultation'}
                    </div>
                    {visit.doctorName && <div className="text-[10px] text-slate-500 mt-0.5">Attending: {visit.doctorName}</div>}
                    <p className="text-[11px] text-slate-600 mt-1">
                      {visit.diagnosis ? `Diagnosis: ${visit.diagnosis}` : visit.chiefComplaint ? `Chief complaint: ${visit.chiefComplaint}` : visit.remarks || 'Consultation recorded.'}
                    </p>
                    {(visit.diagnosisCode || visit.diagnosisCodes?.length) && (
                      <p className="text-[10px] text-slate-500 mt-1">ICD: {[visit.diagnosisCode, ...(visit.diagnosisCodes || [])].filter(Boolean).join(', ')}</p>
                    )}
                    {visit.historyOfPresentIllness && <p className="text-[10px] text-slate-500 mt-1">Notes: {visit.historyOfPresentIllness}</p>}
                    {visit.prescriptions && visit.prescriptions.length > 0 && (
                      <div className="text-[10px] text-teal-700 mt-1 font-medium">
                        Prescription: {visit.prescriptions.map((rx) => rx.drugName).join(', ')}
                      </div>
                    )}
                    {visit.documents && visit.documents.length > 0 && (
                      <div className="text-[10px] text-slate-500 mt-1">
                        <span>Reports: </span>
                        {visit.documents.map((document, documentIndex) => (
                          <React.Fragment key={`timeline-report-${document.id || documentIndex}`}>
                            {documentIndex > 0 && ', '}
                            <button type="button" onClick={() => handleOpenDoc(document)} className="text-teal-700 hover:underline cursor-pointer">
                              {document.name}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Event 2: Documents uploaded if any */}
                {timelineDocuments.map((doc, idx) => (
                  <div key={`timeline-doc-${doc.id || idx}-${idx}`} className="relative">
                    <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-300 ring-4 ring-white" />
                    <div className="text-[10px] font-bold text-slate-400">{doc.date}</div>
                    <div className="text-xs font-bold text-slate-800 mt-0.5">Uploaded {doc.name}</div>
                    <p className="text-[11px] text-slate-600 mt-1">Medical document captured and attached to consultation.</p>
                  </div>
                ))}

                {/* Event 3: Prior medical history */}
                {patient.medicalHistory.slice(0, 3).map((item, idx) => (
                  <div key={`timeline-hist-${item.condition || idx}-${idx}`} className="relative">
                    <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-300 ring-4 ring-white" />
                    <div className="text-[10px] font-bold text-slate-400">{item.since}</div>
                    <div className="text-xs font-bold text-slate-800 mt-0.5">{item.condition}</div>
                    <p className="text-[11px] text-slate-600 mt-1">{item.notes || `Diagnosed condition (${item.status}).`}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </aside>

      {/* In-App Document Viewer Modal */}
      <DocumentViewerModal
        document={selectedDocForViewer}
        isOpen={Boolean(selectedDocForViewer)}
        onClose={() => setSelectedDocForViewer(null)}
      />
    </>
  );
};
