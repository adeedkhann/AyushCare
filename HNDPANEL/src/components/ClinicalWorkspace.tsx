'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Patient, PrescriptionItem, DocumentFile } from '../types/clinical';
import { DocumentViewerModal, resolveDocumentUrl } from './DocumentViewerModal';
import { MarkdownContent } from './MarkdownContent';
import {
  CheckCircle2,
  AlertTriangle,
  Bot,
  Save,
  Check,
  Plus,
  Trash2,
  FlaskConical,
  Lightbulb,
  X,
  FileText,
  Activity,
  Heart,
  Thermometer,
  Wind,
  Phone,
  CreditCard,
  Languages,
  MapPin,
  Eye,
  Download,
  Sparkles,
  Leaf,
  Mic,
  MicOff,
  Search,
  Pill,
  Lock,
  ShieldAlert,
  RefreshCw,
  Play,
  Pause,
  Volume2,
} from 'lucide-react';

interface ClinicalWorkspaceProps {
  patient: Patient;
  onUpdatePatient: (updated: Patient) => void | Promise<void>;
  onConfirmContinue: () => void;
  onToggleEvidence?: () => void;
  isEvidenceOpen?: boolean;
}

// Utility function to check if clinical text is genuine and non-empty
export const hasValue = (val: string | undefined | null): boolean => {
  if (!val) return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  const invalidValues = [
    'not recorded',
    'not provided',
    'not provided.',
    'not provided. socrates assessment unavailable',
    'not provided. socrates assessment unavailable.',
    'socrates assessment unavailable',
    'socrates assessment unavailable.',
    'n/a',
    'none',
    'nil',
    'null',
    'undefined',
  ];
  return !invalidValues.includes(lower);
};

// Bilingual text renderer for cards/headers with Markdown parsing support
export const BilingualBlock: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  if (!text) return null;
  if (text.includes('---')) {
    const parts = text.split(/\s*---\s*/);
    return (
      <div className={`space-y-0.5 ${className}`}>
        <div className="text-slate-900 font-semibold text-xs leading-normal">
          <MarkdownContent content={parts[0].trim()} />
        </div>
        <p className="text-[11px] text-slate-500 font-normal italic leading-normal">{parts.slice(1).join(' - ').trim()}</p>
      </div>
    );
  }
  if (/[*_#`\[\]-]/.test(text)) {
    return <MarkdownContent content={text} className={className} />;
  }
  return <span className={className}>{text}</span>;
};

const SOCRATES_CONFIG = [
  { key: 'site', label: 'SITE' },
  { key: 'onset', label: 'ONSET' },
  { key: 'character', label: 'CHARACTER' },
  { key: 'radiation', label: 'RADIATION' },
  { key: 'associated', label: 'ASSOCIATED SYMPTOMS' },
  { key: 'timing', label: 'TIMING' },
  { key: 'aggravating', label: 'EXACERBATING / RELIEVING' },
  { key: 'severity', label: 'SEVERITY' },
] as const;

// Standard Formulary catalog for quick autocomplete
const STANDARD_MEDICATIONS = [
  { name: 'Tab. Paracetamol', dosage: '650 mg', freq: '1-0-1', dur: '3 Days', instr: 'Take after food' },
  { name: 'Tab. Amoxicillin', dosage: '500 mg', freq: '1-0-1', dur: '5 Days', instr: 'Take after food' },
  { name: 'Tab. Azithromycin', dosage: '500 mg', freq: '1-0-0', dur: '3 Days', instr: 'Take 1 hr before food' },
  { name: 'Cap. Pantoprazole', dosage: '40 mg', freq: '1-0-0', dur: '7 Days', instr: 'Take empty stomach' },
  { name: 'Tab. Cetirizine', dosage: '10 mg', freq: '0-0-1', dur: '5 Days', instr: 'Take at bedtime' },
  { name: 'Tab. Ibuprofen', dosage: '400 mg', freq: '1-0-1', dur: '3 Days', instr: 'Take with meals' },
  { name: 'Tab. Metformin', dosage: '500 mg', freq: '1-0-1', dur: '1 Month', instr: 'Take with meals' },
  { name: 'Tab. Telmisartan', dosage: '40 mg', freq: '1-0-0', dur: '1 Month', instr: 'Take in morning' },
  { name: 'Syp. Cough Relief', dosage: '10 ml', freq: '1-1-1', dur: '5 Days', instr: 'Take with warm water' },
  { name: 'ORS Electrolyte Sachet', dosage: '1 Sachet', freq: 'SOS', dur: '2 Days', instr: 'Mix in 1L clean water' },
  { name: 'Ayush Sudarshan Vati', dosage: '2 Tablets', freq: '1-0-1', dur: '5 Days', instr: 'Take with lukewarm water' },
  { name: 'Ayush Giloy Ghanvati', dosage: '1 Tablet', freq: '1-0-1', dur: '7 Days', instr: 'Take after food' },
  { name: 'Ayush Ashwagandha', dosage: '1 Capsule', freq: '0-0-1', dur: '1 Month', instr: 'Take with warm milk' },
];

const getAiSuggestedMeds = (patient: Patient) => {
  const text = `${patient.chiefComplaint} ${patient.historyOfPresentIllness || ''} ${patient.narrativeSummary || ''}`.toLowerCase();
  const suggestions: typeof STANDARD_MEDICATIONS = [];

  if (text.includes('fever') || text.includes('temperature') || text.includes('pyrexia')) {
    suggestions.push(
      { name: 'Tab. Paracetamol', dosage: '650 mg', freq: '1-0-1', dur: '3 Days', instr: 'Take after food for fever' },
      { name: 'Ayush Sudarshan Vati', dosage: '2 Tablets', freq: '1-0-1', dur: '5 Days', instr: 'Take with lukewarm water' }
    );
  }
  if (text.includes('cough') || text.includes('cold') || text.includes('throat') || text.includes('runny')) {
    suggestions.push(
      { name: 'Tab. Cetirizine', dosage: '10 mg', freq: '0-0-1', dur: '5 Days', instr: 'Take at bedtime' },
      { name: 'Syp. Cough Relief', dosage: '10 ml', freq: '1-1-1', dur: '5 Days', instr: 'Take with warm water' }
    );
  }
  if (text.includes('pain') || text.includes('ache') || text.includes('headache') || text.includes('joint')) {
    suggestions.push(
      { name: 'Tab. Ibuprofen', dosage: '400 mg', freq: '1-0-1', dur: '3 Days', instr: 'Take after food' }
    );
  }
  if (text.includes('acidity') || text.includes('gas') || text.includes('stomach') || text.includes('reflux') || text.includes('gerd')) {
    suggestions.push(
      { name: 'Cap. Pantoprazole', dosage: '40 mg', freq: '1-0-0', dur: '7 Days', instr: 'Take empty stomach' }
    );
  }
  if (text.includes('diarrhea') || text.includes('loose') || text.includes('vomit') || text.includes('dehydration')) {
    suggestions.push(
      { name: 'ORS Electrolyte Sachet', dosage: '1 Sachet', freq: 'SOS', dur: '2 Days', instr: 'Mix in 1L water' }
    );
  }
  if (text.includes('infection') || text.includes('bacterial') || text.includes('tonsil')) {
    suggestions.push(
      { name: 'Tab. Amoxicillin', dosage: '500 mg', freq: '1-0-1', dur: '5 Days', instr: 'Take after food' }
    );
  }

  if (suggestions.length === 0) {
    if (patient.intakePathway === 'ayush' || patient.departmentPathway === 'AYUSH') {
      return [
        { name: 'Ayush Giloy Ghanvati', dosage: '1 Tablet', freq: '1-0-1', dur: '7 Days', instr: 'Take after meals' },
        { name: 'Ayush Sudarshan Vati', dosage: '2 Tablets', freq: '1-0-1', dur: '5 Days', instr: 'Take with warm water' },
      ];
    }
    return [
      { name: 'Tab. Paracetamol', dosage: '650 mg', freq: '1-0-1', dur: '3 Days', instr: 'Take after food (SOS)' },
      { name: 'Cap. Pantoprazole', dosage: '40 mg', freq: '1-0-0', dur: '5 Days', instr: 'Take empty stomach' },
      { name: 'Tab. Cetirizine', dosage: '10 mg', freq: '0-0-1', dur: '3 Days', instr: 'Take at bedtime' },
    ];
  }

  return suggestions;
};

type SocratesKey = keyof Patient['socrates'];

interface AiClinicalSummaryCardProps {
  narrative: string;
  isEditing: boolean;
  isListening: boolean;
  editedHpi: string;
  onEditToggle: () => void;
  onNarrativeChange: (value: string) => void;
  onDictate: () => void;
}

export const AiClinicalSummaryCard: React.FC<AiClinicalSummaryCardProps> = ({
  narrative,
  isEditing,
  isListening,
  editedHpi,
  onEditToggle,
  onNarrativeChange,
  onDictate,
}) => (
  <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5">
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-teal-700" />
        <span>AI Clinical Summary & History of Present Illness (HPI)</span>
      </h3>
      <div className="flex items-center space-x-2">
        <button
          type="button"
          onClick={onDictate}
          className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            isListening
              ? 'bg-rose-500 text-white animate-pulse shadow-xs'
              : 'bg-teal-50 hover:bg-teal-100 text-[#054444] border border-teal-200'
          }`}
          title={isListening ? 'Stop voice dictation' : 'Dictate clinical memo via speech-to-text'}
        >
          {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          <span>{isListening ? 'Listening...' : 'Dictate'}</span>
        </button>
        <button onClick={onEditToggle} className="text-[#064e4b] hover:underline font-semibold text-xs cursor-pointer">
          {isEditing ? 'Cancel' : 'Edit'}
        </button>
      </div>
    </div>

    {isEditing ? (
      <div className="space-y-1.5">
        <textarea
          rows={6}
          value={editedHpi}
          onChange={(event) => onNarrativeChange(event.target.value)}
          placeholder="Enter detailed history of present illness or speak using Dictate button..."
          className="w-full text-xs font-medium text-slate-800 p-3 bg-[#f8fafc] border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#064e4b] leading-relaxed"
        />
        {isListening && (
          <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping inline-block" />
            Speech transcription active. Speaking into microphone will append clinical notes.
          </p>
        )}
      </div>
    ) : hasValue(narrative) ? (
      <div className="p-3.5 bg-[#f8fafc] rounded-xl border border-slate-200/90 shadow-2xs">
        <MarkdownContent content={narrative} />
      </div>
    ) : (
      <div className="py-2.5 px-3.5 bg-slate-50 border border-slate-200/80 rounded-lg flex items-center justify-between text-xs text-slate-500">
        <span className="font-medium">No extended clinical narrative recorded for this consultation.</span>
        <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
          Summary Unavailable
        </span>
      </div>
    )}
  </div>
);

interface SocratesAssessmentCardProps {
  assessment: Patient['socrates'];
  isEditing: boolean;
  onEditToggle: () => void;
  onFieldChange: (key: SocratesKey, value: string) => void;
  renderConfidenceDot: (confidence: 'High' | 'Verify' | 'Critical') => React.ReactNode;
}

export const SocratesAssessmentCard: React.FC<SocratesAssessmentCardProps> = ({
  assessment,
  isEditing,
  onEditToggle,
  onFieldChange,
  renderConfidenceDot,
}) => {
  const getFieldValue = (key: SocratesKey) => {
    if (key === 'aggravating') {
      return [assessment?.aggravating?.value, assessment?.relieving?.value].filter((value) => hasValue(value)).join(' / ');
    }
    return assessment?.[key]?.value || '';
  };
  const validFields = SOCRATES_CONFIG.filter(({ key }) => hasValue(getFieldValue(key)));

  return (
    <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-teal-100 text-[#064e4b] flex items-center justify-center font-bold text-[11px]">S</div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              History of Present Illness • SOCRATES Assessment
            </h3>
            <p className="text-[11px] text-slate-400">Structured symptom assessment from the AI clinical intake.</p>
          </div>
        </div>
        <button onClick={onEditToggle} className="text-[#064e4b] hover:underline font-semibold text-xs cursor-pointer">
          {isEditing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {isEditing ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SOCRATES_CONFIG.map(({ key, label }) => (
            <label key={`soc-edit-${key}`} className="p-3 bg-[#f8fafc] rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-bold text-slate-500 block tracking-wider uppercase mb-1">{label}</span>
              {key === 'aggravating' ? (
                <div className="space-y-1.5">
                  <input type="text" value={assessment.aggravating?.value || ''} onChange={(event) => onFieldChange('aggravating', event.target.value)} placeholder="Exacerbating" className="text-xs font-semibold text-slate-900 bg-white border border-slate-300 px-2 py-1 rounded-lg w-full focus:ring-1 focus:ring-teal-700" />
                  <input type="text" value={assessment.relieving?.value || ''} onChange={(event) => onFieldChange('relieving', event.target.value)} placeholder="Relieving" className="text-xs font-semibold text-slate-900 bg-white border border-slate-300 px-2 py-1 rounded-lg w-full focus:ring-1 focus:ring-teal-700" />
                </div>
              ) : (
                <input type="text" value={assessment[key]?.value || ''} onChange={(event) => onFieldChange(key, event.target.value)} className="text-xs font-semibold text-slate-900 bg-white border border-slate-300 px-2 py-1 rounded-lg w-full focus:ring-1 focus:ring-teal-700" />
              )}
            </label>
          ))}
        </div>
      ) : validFields.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-slate-500 text-xs text-center font-medium">
          No detailed SOCRATES symptoms logged for this consultation.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {validFields.map(({ key, label }) => (
            <div key={`soc-view-${key}`} className="p-3.5 bg-[#f8fafc] rounded-xl border border-slate-200/90 flex items-start justify-between gap-2 shadow-2xs">
              <div className="flex-1 min-w-0">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider bg-teal-50 text-teal-900 border border-teal-200/80 shadow-2xs">
                  {label}
                </span>
                <div className="text-xs font-medium text-slate-800 leading-relaxed mt-1.5">
                  <BilingualBlock text={getFieldValue(key)} />
                </div>
              </div>
              <div className="shrink-0 pt-0.5">{renderConfidenceDot(assessment[key].confidence)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const ClinicalWorkspace: React.FC<ClinicalWorkspaceProps> = ({
  patient,
  onUpdatePatient,
  onConfirmContinue,
  onToggleEvidence,
  isEvidenceOpen = false,
}) => {
  const [activeTab, setActiveTab] = useState<'Summary' | 'History' | 'Labs' | 'Reports' | 'Prescription'>('Summary');
  const [isEditing, setIsEditing] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  // Slim Alert Dismiss States to conserve vertical space
  const [isPriorityAlertDismissed, setIsPriorityAlertDismissed] = useState(false);
  const [isAiDraftDismissed, setIsAiDraftDismissed] = useState(false);

  // Selected document for full-screen in-app viewer modal
  const [selectedDocForViewer, setSelectedDocForViewer] = useState<DocumentFile | null>(null);

  // Editable local state for summary/SOCRATES/HPI
  const [editedChiefComplaint, setEditedChiefComplaint] = useState(patient.chiefComplaint);
  const [editedHpi, setEditedHpi] = useState(patient.historyOfPresentIllness || patient.narrativeSummary || '');
  const [editedSocrates, setEditedSocrates] = useState(patient.socrates);

  const startEditing = () => {
    setEditedChiefComplaint(patient.chiefComplaint || '');
    setEditedHpi(patient.historyOfPresentIllness || patient.narrativeSummary || '');
    setEditedSocrates(patient.socrates);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEditedChiefComplaint(patient.chiefComplaint || '');
    setEditedHpi(patient.historyOfPresentIllness || patient.narrativeSummary || '');
    setEditedSocrates(patient.socrates);
    setIsEditing(false);
  };

  // Quick Rx Builder State
  const [rxQuery, setRxQuery] = useState('');
  const [showRxDropdown, setShowRxDropdown] = useState(false);
  const [rxDosage, setRxDosage] = useState('500 mg');
  const [rxFreq, setRxFreq] = useState('1-0-1');
  const [rxDuration, setRxDuration] = useState('5 Days');
  const [rxInstructions, setRxInstructions] = useState('Take after food');

  // Modal State for adding prescription
  const [isRxModalOpen, setIsRxModalOpen] = useState(false);
  const [newRxName, setNewRxName] = useState('');
  const [newRxDosage, setNewRxDosage] = useState('500 mg');
  const [newRxFreq, setNewRxFreq] = useState('1-0-1');
  const [newRxDuration, setNewRxDuration] = useState('5 Days');
  const [newRxInstructions, setNewRxInstructions] = useState('Take after food');

  // Voice Dictation (Speech-to-Text)
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Patient Voice Playback State (Speak Mode Kiosk Audio)
  const [isPlayingPatientAudio, setIsPlayingPatientAudio] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const patientAudioRef = useRef<HTMLAudioElement | null>(null);

  // Stop and clean up audio when active patient or audio URL changes
  useEffect(() => {
    if (patientAudioRef.current) {
      patientAudioRef.current.pause();
      patientAudioRef.current = null;
    }
    setIsPlayingPatientAudio(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
  }, [patient.id, patient.patientAudioUrl]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (patientAudioRef.current) {
        patientAudioRef.current.pause();
        patientAudioRef.current = null;
      }
    };
  }, []);

  const togglePatientAudio = () => {
    if (!patient.patientAudioUrl) return;

    if (isPlayingPatientAudio) {
      if (patientAudioRef.current) {
        patientAudioRef.current.pause();
      }
      setIsPlayingPatientAudio(false);
    } else {
      if (!patientAudioRef.current) {
        const resolved = resolveDocumentUrl(patient.patientAudioUrl);
        const audio = new Audio(resolved);
        patientAudioRef.current = audio;

        audio.ontimeupdate = () => {
          setAudioCurrentTime(audio.currentTime);
        };
        audio.onloadedmetadata = () => {
          setAudioDuration(audio.duration || 0);
        };
        audio.onended = () => {
          setIsPlayingPatientAudio(false);
          setAudioCurrentTime(0);
        };
        audio.onerror = () => {
          setIsPlayingPatientAudio(false);
        };
      }
      patientAudioRef.current
        .play()
        .then(() => {
          setIsPlayingPatientAudio(true);
        })
        .catch((e) => {
          console.warn('Audio playback failed', e);
          setIsPlayingPatientAudio(false);
        });
    }
  };

  // Sync state if active patient changes
  useEffect(() => {
    if (isEditing) return;
    setEditedChiefComplaint(patient.chiefComplaint);
    setEditedHpi(patient.historyOfPresentIllness || patient.narrativeSummary || '');
    setEditedSocrates(patient.socrates);
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [patient.id, patient.chiefComplaint, patient.historyOfPresentIllness, patient.narrativeSummary, patient.socrates, isEditing]);

  // Voice Dictation Toggle Handler
  const toggleVoiceDictation = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use Google Chrome, Edge, or Safari.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-IN';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let transcriptText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcriptText += event.results[i][0].transcript + ' ';
          }
        }
        if (transcriptText.trim()) {
          setEditedHpi((prev) => (prev ? `${prev}\n• ${transcriptText.trim()}` : transcriptText.trim()));
          if (!isEditing) setIsEditing(true);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('[SpeechRecognition] Error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('[SpeechRecognition] Exception:', err);
      setIsListening(false);
    }
  };

  const handleSaveSummary = async () => {
    const updatedPatient: Patient = {
      ...patient,
      chiefComplaint: editedChiefComplaint,
      historyOfPresentIllness: editedHpi,
      narrativeSummary: editedHpi,
      socrates: editedSocrates,
    };
    try {
      await onUpdatePatient(updatedPatient);
      setIsEditing(false);
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 3000);
    } catch {
      setSaveToast(false);
    }
  };

  const updateSocratesField = (key: keyof Patient['socrates'], val: string) => {
    setEditedSocrates((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        value: val,
      },
    }));
  };

  const handleAddQuickRx = (med: { name: string; dosage: string; freq: string; dur: string; instr: string }) => {
    const newRx: PrescriptionItem = {
      id: `rx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      drugName: med.name,
      dosage: med.dosage,
      frequency: med.freq,
      duration: med.dur,
      instructions: med.instr,
    };

    onUpdatePatient({
      ...patient,
      prescriptions: [...patient.prescriptions, newRx],
    });

    setRxQuery('');
    setShowRxDropdown(false);
  };

  const handleAddMedication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRxName.trim()) return;

    const newRx: PrescriptionItem = {
      id: `rx-${Date.now()}`,
      drugName: newRxName.trim(),
      dosage: newRxDosage,
      frequency: newRxFreq,
      duration: newRxDuration,
      instructions: newRxInstructions,
    };

    onUpdatePatient({
      ...patient,
      prescriptions: [...patient.prescriptions, newRx],
    });

    setNewRxName('');
    setIsRxModalOpen(false);
  };

  // Helper function to render confidence dot
  const renderConfidenceDot = (confidence: 'High' | 'Verify' | 'Critical') => {
    if (confidence === 'High') {
      return <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" title="High Confidence" />;
    }
    if (confidence === 'Verify') {
      return <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" title="Requires Verification" />;
    }
    return <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" title="Critical Review" />;
  };

  // Lab status pill styling
  const getLabStatusBadge = (status: 'High' | 'Normal' | 'Critical' | 'Low') => {
    switch (status) {
      case 'High':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Critical':
        return 'bg-red-50 text-red-800 border-red-200 font-semibold';
      case 'Low':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'Normal':
      default:
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
  };

  // Dynamic Vitals Evaluation
  const vitals = patient.vitals;
  const hasSystolic = vitals?.systolic !== undefined && vitals?.systolic !== null && vitals?.systolic !== 0;
  const hasPulse = vitals?.pulse !== undefined && vitals?.pulse !== null && vitals?.pulse !== 0;
  const hasSpo2 = vitals?.spo2 !== undefined && vitals?.spo2 !== null && vitals?.spo2 !== 0;
  const hasTemp = vitals?.temperature !== undefined && vitals?.temperature !== null && vitals?.temperature !== 0;
  const hasAnyValidVitals = Boolean(hasSystolic || hasPulse || hasSpo2 || hasTemp);

  const aiSuggestedMeds = getAiSuggestedMeds(patient);

  const filteredCatalog = STANDARD_MEDICATIONS.filter((m) =>
    m.name.toLowerCase().includes(rxQuery.toLowerCase())
  );

  return (
    <main className="flex-1 flex flex-col bg-[#f8fafc] overflow-y-auto p-3 sm:p-4 select-none relative pb-16">
      {/* Save Notification Toast */}
      {saveToast && (
        <div className="absolute top-3 right-4 sm:right-5 z-50 bg-[#054444] text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2 text-xs border border-teal-700 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Clinical changes saved successfully to patient chart.</span>
        </div>
      )}

      {/* 1. Patient Primary Header Card with Clean Lucide Icon-Badges */}
      <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs flex flex-col gap-2.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            {/* Avatar */}
            <div className="w-11 h-11 rounded-full bg-[#064e4b] text-white font-bold text-sm flex items-center justify-center border border-teal-700 shrink-0 shadow-2xs">
              {patient.initials}
            </div>

            <div className="min-w-0">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h2 className="text-base font-bold text-slate-900 truncate">{patient.name}</h2>
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                  {patient.age ? `${patient.age}y · ` : ''}{patient.gender}
                </span>

                {patient.patientCode && (
                  <span className="text-xs font-mono font-bold text-teal-800 bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded-md">
                    {patient.patientCode}
                  </span>
                )}

                {patient.abhaLinked && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#e0f2fe] text-[#0369a1] border border-sky-200/80">
                    ABHA Linked <Check className="w-3 h-3 text-[#0369a1] ml-0.5" />
                  </span>
                )}
              </div>

              {/* Patient Identifiers */}
              <div className="flex items-center space-x-2 text-xs text-slate-500 mt-1 flex-wrap gap-y-0.5">
                <span>Token: <strong className="text-slate-800 font-bold">{patient.tokenNumber}</strong></span>
                <span>·</span>
                <span>UHID: <strong className="text-slate-700 font-medium">{patient.uhid}</strong></span>
                <span>·</span>
                <span>Dept: <strong className="text-slate-700 font-medium">{patient.department}</strong></span>
                {patient.intakePathway && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200">
                      <Leaf className="w-3 h-3 text-teal-600" />
                      {patient.intakePathway.toUpperCase()}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right Header Badges: Permanent Allergy Risk Badge + Priority & Rail Controls */}
          <div className="flex items-center space-x-2 self-start md:self-center flex-wrap gap-y-1.5">
            {/* Top Permanent Critical Risk / Allergy Badge */}
            {patient.allergies && patient.allergies.length > 0 ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-900 border border-red-300 shadow-2xs">
                <span className="mr-1">⚠️</span>
                <span>Allergies: {patient.allergies.map((a) => a.drug).join(', ')}</span>
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                <span>Allergies: None Reported</span>
              </span>
            )}

            {onToggleEvidence && (
              <button
                onClick={onToggleEvidence}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 border border-teal-200 text-[#054444] rounded-lg text-xs font-semibold hover:bg-teal-100 transition-colors cursor-pointer"
                title="Toggle Reports & Evidence Drawer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{isEvidenceOpen ? 'Hide Reports Rail' : `Reports Rail (${patient.documents.length})`}</span>
              </button>
            )}

            {patient.priority === 'Urgent' && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                <span className="w-2 h-2 rounded-full bg-red-600 mr-1.5 animate-pulse" />
                Urgent Priority
              </span>
            )}
            {patient.priority === 'Waiting' && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                Waiting
              </span>
            )}
            {patient.priority === 'History Ready' && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                History Ready
              </span>
            )}
            {patient.priority === 'Completed' && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Completed
              </span>
            )}
          </div>
        </div>

        {/* Demographics Redesigned Icon-Badges Strip */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs text-slate-600">
          <div className="flex items-center gap-2 flex-wrap">
            {patient.mobileNumber && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200/80 text-slate-700 font-medium">
                <Phone className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span>{patient.mobileNumber}</span>
              </span>
            )}

            {patient.aadhaarNumber && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200/80 text-slate-700 font-medium">
                <CreditCard className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span>Aadhaar: •••• {patient.aadhaarNumber.slice(-4)}</span>
              </span>
            )}

            {patient.abhaAddress && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-50 border border-sky-200/80 text-sky-800 font-mono text-[11px] font-medium">
                <span>{patient.abhaAddress}</span>
              </span>
            )}

            {patient.language && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200/80 text-slate-700 font-medium capitalize">
                <Languages className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span>{patient.language}</span>
              </span>
            )}

            {patient.address && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200/80 text-slate-600 font-medium max-w-xs truncate" title={patient.address}>
                <MapPin className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span className="truncate">{patient.address}</span>
              </span>
            )}

            {/* Compact "No Vitals Captured" status tag */}
            {!hasAnyValidVitals && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-500 border border-slate-200/80 text-[11px] font-medium">
                <Activity className="w-3 h-3 text-slate-400" />
                <span>No Vitals Captured at Kiosk</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Dynamic Vitals Ribbon (Rendered ONLY if genuine metrics exist) */}
      {hasAnyValidVitals && vitals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 my-2">
          {/* Blood Pressure */}
          {hasSystolic && (
            <div className="p-3 rounded-xl border bg-white border-slate-200/90 text-slate-800 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">BLOOD PRESSURE</span>
                <Activity className="w-4 h-4 text-teal-600" />
              </div>
              <div className="mt-1">
                <span className="text-base font-bold">
                  {vitals.diastolic ? `${vitals.systolic}/${vitals.diastolic}` : vitals.systolic}
                </span>
                <span className="text-[10px] text-slate-400 ml-1">mmHg</span>
              </div>
            </div>
          )}

          {/* Pulse / Heart Rate */}
          {hasPulse && (
            <div className="p-3 rounded-xl border bg-white border-slate-200/90 text-slate-800 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">HEART RATE</span>
                <Heart className="w-4 h-4 text-rose-600" />
              </div>
              <div className="mt-1">
                <span className="text-base font-bold">{vitals.pulse}</span>
                <span className="text-[10px] text-slate-400 ml-1">bpm</span>
              </div>
            </div>
          )}

          {/* Oxygen SpO2 */}
          {hasSpo2 && (
            <div className="p-3 rounded-xl border bg-white border-slate-200/90 text-slate-800 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">OXYGEN (SPO2)</span>
                <Wind className="w-4 h-4 text-sky-600" />
              </div>
              <div className="mt-1">
                <span className="text-base font-bold">{vitals.spo2}%</span>
              </div>
            </div>
          )}

          {/* Temperature */}
          {hasTemp && (
            <div className="p-3 rounded-xl border bg-white border-slate-200/90 text-slate-800 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">TEMPERATURE</span>
                <Thermometer className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-1">
                <span className="text-base font-bold">{vitals.temperature}°F</span>
              </div>
            </div>
          )}

          {/* Source & Timestamp */}
          <div className="p-3 rounded-xl border border-slate-200/90 bg-white text-slate-800 hidden lg:flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">SOURCE</span>
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            </div>
            <p className="text-xs font-bold text-slate-800 truncate">
              {vitals.source || 'AyushCare Biosensors'}
            </p>
            <span className="text-[10px] text-slate-400">
              {vitals.recordedAt ? new Date(vitals.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recorded'}
            </span>
          </div>
        </div>
      )}

      {/* 3. Compact & Slim Dismissible Alerts */}
      {!isPriorityAlertDismissed && (patient.alertMessage || patient.priority === 'Urgent') && (
        <div className="bg-red-50/90 border border-red-200 text-red-900 rounded-lg px-3 py-1.5 my-1.5 flex items-center justify-between text-xs animate-in fade-in shadow-2xs">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span className="font-bold uppercase tracking-wider text-red-950 text-[10px] bg-red-100 px-1.5 py-0.2 rounded border border-red-200 shrink-0">
              PRIORITY REVIEW
            </span>
            <span className="truncate font-medium text-red-800">
              {patient.alertMessage || `${patient.chiefComplaint} — priority clinical review recommended.`}
            </span>
          </div>
          <button
            onClick={() => setIsPriorityAlertDismissed(true)}
            className="p-1 hover:bg-red-100 rounded text-red-600 cursor-pointer shrink-0 ml-2"
            title="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4. Sub-Navigation Tabs */}
      <div className="flex items-center space-x-4 sm:space-x-6 border-b border-slate-200/90 my-2 px-1 overflow-x-auto scrollbar-none">
        {[
          { id: 'Summary', label: 'Clinical Summary' },
          { id: 'History', label: 'Medical History' },
          { id: 'Labs', label: 'Lab Results' },
          { id: 'Reports', label: `Reports & Scans (${patient.documents.length})` },
          { id: 'Prescription', label: `Prescription (${patient.prescriptions.length})` },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-2 text-xs font-medium transition-all cursor-pointer shrink-0 ${
                isActive
                  ? 'border-b-2 border-[#064e4b] text-[#064e4b] font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT 1: CLINICAL SUMMARY */}
      {activeTab === 'Summary' && (
        <div className="space-y-3 my-1">
          {/* Patient Privacy Lock Banner if Visit is Restricted */}
          {patient.isVisitRestricted && (
            <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-4 text-amber-950 mb-3 shadow-2xs flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 text-amber-800 shadow-xs">
                <Lock className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-slate-900">Visit Summary Restricted by Patient</h3>
                  <span className="text-[10px] font-semibold bg-amber-200/60 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300">
                    Mobile Privacy Lock
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  The patient has opted out of sharing this visit summary in their AyushCare mobile app. As soon as the patient toggles access ON in mobile settings, this summary will automatically populate in real-time.
                </p>
                <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-amber-800 font-semibold bg-amber-100/70 px-2.5 py-1 rounded-lg border border-amber-200">
                  <RefreshCw className="w-3 h-3 animate-spin text-amber-700" />
                  <span>Listening for real-time mobile permission changes...</span>
                </div>
              </div>
            </div>
          )}

          {/* Slim AI Draft Notice Bar */}
          {!isAiDraftDismissed && (
            <div className="bg-emerald-50/80 border border-emerald-200/80 text-emerald-900 rounded-lg px-3 py-1.5 flex items-center justify-between text-xs animate-in fade-in shadow-2xs">
              <div className="flex items-center space-x-2 min-w-0">
                <Bot className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span className="font-medium text-emerald-800 truncate">
                  AI-generated draft from Kiosk dialogue & EHR — Physician verification required
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {isEditing ? (
                  <button
                    onClick={handleSaveSummary}
                    className="text-[#064e4b] hover:underline font-bold text-xs flex items-center space-x-1 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                ) : (
                  <button
                    onClick={startEditing}
                    className="text-[#064e4b] hover:underline font-semibold text-xs cursor-pointer"
                  >
                    Edit All
                  </button>
                )}
                <button
                  onClick={() => setIsAiDraftDismissed(true)}
                  className="p-1 hover:bg-emerald-100 rounded text-emerald-700 cursor-pointer"
                  title="Dismiss notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Patient Voice Intake Audio Player (Speak Mode Kiosk Audio) */}
          {(patient.patientAudioUrl || patient.intakeMode === 'speak') && (
            <div className="bg-linear-to-r from-teal-50/90 via-emerald-50/70 to-slate-50 border border-teal-200 rounded-xl p-3.5 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={togglePatientAudio}
                    disabled={!patient.patientAudioUrl}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0 ${
                      !patient.patientAudioUrl
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : isPlayingPatientAudio
                        ? 'bg-amber-500 text-white animate-pulse ring-4 ring-amber-100'
                        : 'bg-[#064e4b] hover:bg-[#043634] text-white hover:scale-105'
                    }`}
                    title={isPlayingPatientAudio ? 'Pause recording' : 'Play patient voice recording'}
                  >
                    {isPlayingPatientAudio ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                  </button>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        Patient Original Voice Description
                      </span>
                      <span className="text-[10px] font-semibold bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full border border-teal-200">
                        Speak Mode
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {patient.patientAudioUrl
                        ? isPlayingPatientAudio
                          ? `Playing audio intake... ${audioDuration ? `${Math.floor(audioCurrentTime)}s / ${Math.floor(audioDuration)}s` : ''}`
                          : 'Recorded at Kiosk in patient\'s own voice. Click play to listen.'
                        : 'Intake completed in Speak Mode.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onToggleEvidence && (
                    <button
                      type="button"
                      onClick={onToggleEvidence}
                      className="text-xs font-semibold text-[#064e4b] hover:bg-teal-100/60 px-2.5 py-1.5 rounded-lg border border-teal-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>View Transcript & Evidence</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Live Audio Progress Bar */}
              {isPlayingPatientAudio && audioDuration > 0 && (
                <div className="mt-2.5 pt-2 border-t border-teal-200/60 flex items-center gap-3">
                  <div className="flex-1 bg-teal-200/60 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-[#064e4b] h-full transition-all duration-200"
                      style={{ width: `${(audioCurrentTime / audioDuration) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono font-medium text-teal-900">
                    {Math.floor(audioCurrentTime)}s / {Math.floor(audioDuration)}s
                  </span>
                </div>
              )}

              {/* Patient Voice Transcript Preview */}
              {patient.patientTranscript && (
                <div className="mt-2.5 p-2 bg-white/80 rounded-lg border border-teal-100 text-xs text-slate-700">
                  <span className="font-semibold text-teal-900 mr-1.5">Transcript:</span>
                  <span className="italic text-slate-600">"{patient.patientTranscript}"</span>
                </div>
              )}
            </div>
          )}

          {/* Chief Complaint Card with Bilingual Formatting Support */}
          <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-900">
                Chief Complaint
              </span>
              <button
                onClick={isEditing ? cancelEditing : startEditing}
                className="text-[#064e4b] hover:underline font-semibold text-xs cursor-pointer"
              >
                {isEditing ? 'Cancel' : 'Edit'}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              {isEditing ? (
                <input
                  type="text"
                  value={editedChiefComplaint}
                  onChange={(e) => setEditedChiefComplaint(e.target.value)}
                  className="w-full text-xs font-medium text-slate-900 p-2 bg-[#f8fafc] border border-slate-300 rounded focus:ring-1 focus:ring-[#064e4b]"
                />
              ) : (
                <div className="text-xs font-medium text-slate-800">
                  <BilingualBlock text={patient.chiefComplaint} />
                </div>
              )}

              {!isEditing && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0 self-start sm:self-auto">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
                  High Confidence
                </span>
              )}
            </div>
          </div>

          <AiClinicalSummaryCard
            narrative={patient.historyOfPresentIllness || patient.narrativeSummary || ''}
            isEditing={isEditing}
            isListening={isListening}
            editedHpi={editedHpi}
            onEditToggle={isEditing ? cancelEditing : startEditing}
            onNarrativeChange={setEditedHpi}
            onDictate={toggleVoiceDictation}
          />

          {/* PRESCRIPTION BUILDER DESK */}
          <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-teal-100 text-[#064e4b] flex items-center justify-center">
                  <Pill className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Prescription Builder Desk
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Quick-add formulary medications with dosage pills & AI clinical suggestions.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsRxModalOpen(true)}
                className="text-xs font-semibold text-[#064e4b] hover:underline cursor-pointer"
              >
                + Custom Rx
              </button>
            </div>

            {/* AI Suggested Medicines Chip Bar */}
            {aiSuggestedMeds.length > 0 && (
              <div className="p-2 bg-teal-50/60 border border-teal-200/70 rounded-lg space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-teal-900 uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 text-teal-700" />
                  <span>AI Suggested Medicines (Click to Add):</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {aiSuggestedMeds.map((med, idx) => (
                    <button
                      key={`ai-med-${idx}`}
                      type="button"
                      onClick={() => handleAddQuickRx(med)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-white hover:bg-teal-100/80 text-[#064e4b] border border-teal-300 shadow-2xs transition-colors cursor-pointer group"
                      title={`Add ${med.name} (${med.dosage}, ${med.freq})`}
                    >
                      <Plus className="w-3 h-3 text-teal-600 group-hover:rotate-90 transition-transform" />
                      <span>{med.name}</span>
                      <span className="text-[10px] text-slate-400 font-normal">({med.dosage})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Fast Search & Configurator Bar */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 text-xs">
              {/* Medicine Autocomplete */}
              <div className="relative md:col-span-4">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={rxQuery}
                    onChange={(e) => {
                      setRxQuery(e.target.value);
                      setShowRxDropdown(true);
                    }}
                    onFocus={() => setShowRxDropdown(true)}
                    placeholder="Search medicine catalog..."
                    className="w-full pl-8 pr-3 py-2 bg-[#f8fafc] border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#064e4b]"
                  />
                </div>

                {/* Dropdown suggestions */}
                {showRxDropdown && rxQuery.trim().length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredCatalog.length === 0 ? (
                      <div className="p-2.5 text-xs text-slate-400 text-center">
                        No catalog match. Click &apos;+ Custom Rx&apos; to add custom medication.
                      </div>
                    ) : (
                      filteredCatalog.map((med, idx) => (
                        <div
                          key={`cat-${idx}`}
                          onClick={() => {
                            setRxQuery(med.name);
                            setRxDosage(med.dosage);
                            setRxFreq(med.freq);
                            setRxDuration(med.dur);
                            setRxInstructions(med.instr);
                            setShowRxDropdown(false);
                          }}
                          className="p-2 hover:bg-teal-50 cursor-pointer border-b border-slate-50 last:border-0 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900">{med.name}</span>
                            <span className="text-[11px] text-slate-500 ml-1.5">({med.dosage})</span>
                          </div>
                          <span className="text-[10px] text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                            {med.freq}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Dosage Select */}
              <div className="md:col-span-2">
                <input
                  type="text"
                  value={rxDosage}
                  onChange={(e) => setRxDosage(e.target.value)}
                  placeholder="Dosage (500 mg)"
                  className="w-full py-2 px-2.5 bg-[#f8fafc] border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#064e4b]"
                />
              </div>

              {/* Frequency Pills */}
              <div className="md:col-span-3 flex items-center gap-1 overflow-x-auto">
                {['1-0-1', '1-1-1', '1-0-0', '0-0-1', 'SOS'].map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setRxFreq(freq)}
                    className={`px-2 py-1.5 rounded text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                      rxFreq === freq
                        ? 'bg-[#064e4b] text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {freq}
                  </button>
                ))}
              </div>

              {/* Duration Select */}
              <div className="md:col-span-2">
                <select
                  value={rxDuration}
                  onChange={(e) => setRxDuration(e.target.value)}
                  className="w-full py-2 px-2 bg-[#f8fafc] border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#064e4b]"
                >
                  <option value="3 Days">3 Days</option>
                  <option value="5 Days">5 Days</option>
                  <option value="7 Days">7 Days</option>
                  <option value="10 Days">10 Days</option>
                  <option value="14 Days">14 Days</option>
                  <option value="1 Month">1 Month</option>
                </select>
              </div>

              {/* Add Button */}
              <div className="md:col-span-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!rxQuery.trim()) return;
                    handleAddQuickRx({
                      name: rxQuery.trim(),
                      dosage: rxDosage,
                      freq: rxFreq,
                      dur: rxDuration,
                      instr: rxInstructions,
                    });
                  }}
                  className="w-full h-full py-2 bg-[#054444] hover:bg-[#064e4b] text-white rounded-lg font-semibold flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                  title="Add to Prescription"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Currently Prescribed Table Preview */}
            {patient.prescriptions.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden mt-2">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <th className="p-2">Medication</th>
                      <th className="p-2">Dosage</th>
                      <th className="p-2">Frequency</th>
                      <th className="p-2">Duration</th>
                      <th className="p-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {patient.prescriptions.map((rx, idx) => (
                      <tr key={`rx-tbl-${rx.id || idx}-${idx}`} className="hover:bg-slate-50/60">
                        <td className="p-2 font-bold text-[#064e4b]">{rx.drugName}</td>
                        <td className="p-2 text-slate-700">{rx.dosage}</td>
                        <td className="p-2">
                          <span className="bg-teal-50 text-[#064e4b] px-1.5 py-0.5 rounded font-mono font-semibold text-[11px] border border-teal-200">
                            {rx.frequency}
                          </span>
                        </td>
                        <td className="p-2 text-slate-700">{rx.duration}</td>
                        <td className="p-2 text-right">
                          <button
                            onClick={() => {
                              const filtered = patient.prescriptions.filter((p) => p.id !== rx.id);
                              onUpdatePatient({ ...patient, prescriptions: filtered });
                            }}
                            className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* AYUSH Attributes Card (Prakriti & Dosha Analysis) if present */}
          {patient.ayushProfile && Object.keys(patient.ayushProfile).length > 0 && (
            <div className="bg-teal-50/70 border border-teal-200/80 rounded-xl p-4 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-teal-950 flex items-center gap-1.5 uppercase tracking-wider">
                  <Leaf className="w-4 h-4 text-teal-700" />
                  <span>AYUSH Clinical Profile & Dosha Assessment</span>
                </h3>
                <span className="text-[10px] font-semibold text-teal-800 bg-white px-2 py-0.5 rounded border border-teal-200">
                  AyushCare Integration
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {patient.ayushProfile.prakriti && (
                  <div className="bg-white p-2.5 rounded-lg border border-teal-100">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">PRAKRITI</span>
                    <span className="font-bold text-teal-900">{patient.ayushProfile.prakriti}</span>
                  </div>
                )}
                {patient.ayushProfile.doshaDominance && (
                  <div className="bg-white p-2.5 rounded-lg border border-teal-100">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">DOSHA DOMINANCE</span>
                    <span className="font-bold text-teal-900">{patient.ayushProfile.doshaDominance}</span>
                  </div>
                )}
                {patient.ayushProfile.agni && (
                  <div className="bg-white p-2.5 rounded-lg border border-teal-100">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">AGNI</span>
                    <span className="font-bold text-teal-900">{patient.ayushProfile.agni}</span>
                  </div>
                )}
                {patient.ayushProfile.kostha && (
                  <div className="bg-white p-2.5 rounded-lg border border-teal-100">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">KOSTHA</span>
                    <span className="font-bold text-teal-900">{patient.ayushProfile.kostha}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <SocratesAssessmentCard
            assessment={isEditing ? editedSocrates : patient.socrates}
            isEditing={isEditing}
            onEditToggle={isEditing ? cancelEditing : startEditing}
            onFieldChange={updateSocratesField}
            renderConfidenceDot={renderConfidenceDot}
          />
        </div>
      )}

      {/* TAB CONTENT 2: MEDICAL HISTORY */}
      {activeTab === 'History' && (
        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs space-y-4 my-1">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Patient Medical History & Conditions
          </h3>
          {patient.medicalHistory.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No previous chronic medical history or allergies recorded for this patient.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                    <th className="p-2.5">Category</th>
                    <th className="p-2.5">Condition / Event</th>
                    <th className="p-2.5">Diagnosis Year</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Clinical Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {patient.medicalHistory.map((item, idx) => (
                    <tr key={`med-hist-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-2.5 font-medium text-slate-500">{item.category}</td>
                      <td className="p-2.5 font-semibold text-slate-900">{item.condition}</td>
                      <td className="p-2.5">{item.since}</td>
                      <td className="p-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            item.status === 'Active'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : item.status === 'Chronic'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-600">{item.notes || 'Recorded in patient profile'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 3: LAB RESULTS */}
      {activeTab === 'Labs' && (
        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs space-y-3 my-1">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
              <FlaskConical className="w-4 h-4 text-[#064e4b]" />
              <span>Laboratory & Diagnostic Panel</span>
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              Last updated: {patient.createdAt ? new Date(patient.createdAt).toLocaleDateString() : 'Current Visit'}
            </span>
          </div>

          {patient.labs.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No laboratory or diagnostic panel investigations recorded.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                    <th className="p-2.5">Investigation</th>
                    <th className="p-2.5">Result</th>
                    <th className="p-2.5">Reference Range</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {patient.labs.map((lab, idx) => (
                    <tr key={`lab-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-2.5 font-semibold text-slate-900">{lab.investigation}</td>
                      <td className="p-2.5 font-bold text-slate-800">{lab.result}</td>
                      <td className="p-2.5 text-slate-500">{lab.reference}</td>
                      <td className="p-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${getLabStatusBadge(
                            lab.status
                          )}`}
                        >
                          {lab.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-500">{lab.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 4: REPORTS & SCANS */}
      {activeTab === 'Reports' && (
        <div className="space-y-4 my-1">
          <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#064e4b]" />
                  <span>Uploaded Medical Documents & Diagnostic Scans ({patient.documents.length})</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Direct EHR attachments, scanned previous prescriptions, lab reports, and AI OCR analyses.
                </p>
              </div>

              {patient.documents.length > 0 && (
                <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                  {patient.documents.length} Files Available
                </span>
              )}
            </div>

            {patient.documents.length === 0 ? (
              <div className="py-12 border-2 border-dashed border-slate-200 rounded-xl text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <FileText className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-slate-700">No Attached Scans or Documents</h4>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Physical reports scanned or uploaded at the AyushCare Kiosk by the patient will automatically populate here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {patient.documents.map((doc, idx) => {
                  const rawUrl = doc.downloadUrl || doc.url || doc.filePath;
                  const resolvedUrl = resolveDocumentUrl(rawUrl);

                  if (doc.isLocked) {
                    return (
                      <div
                        key={`doc-card-${doc.id || idx}-${idx}`}
                        className="bg-amber-50/20 border border-amber-300/80 rounded-xl p-3.5 flex flex-col justify-between relative overflow-hidden shadow-2xs"
                      >
                        {/* Centered Lock Overlay */}
                        <div className="absolute inset-0 bg-white/85 backdrop-blur-[3px] flex flex-col items-center justify-center p-3 text-center z-10 select-none">
                          <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 mb-1.5 shadow-xs">
                            <Lock className="w-4 h-4" />
                          </div>
                          <p className="text-xs font-bold text-slate-900 leading-tight">Document Locked by Patient</p>
                          <p className="text-[10px] text-slate-500 font-medium max-w-[190px] leading-tight mt-1">
                            Restricted via AyushCare Mobile. Unlocks automatically in real-time when toggled ON.
                          </p>
                          <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <RefreshCw className="w-2.5 h-2.5 animate-spin text-amber-700" />
                            <span>Real-time sync active</span>
                          </div>
                        </div>

                        {/* Blurred Background Card Content */}
                        <div className="space-y-2 filter blur-[3.5px] select-none pointer-events-none opacity-40">
                          <div className="flex items-start justify-between gap-2">
                            <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-full text-slate-600 truncate">
                              {doc.documentType || 'Clinical Scan'}
                            </span>
                          </div>

                          <div>
                            <h4 className="text-xs font-bold text-slate-900 truncate">
                              {doc.name}
                            </h4>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {doc.date} · {doc.size}
                            </p>
                          </div>
                        </div>

                        {/* Disabled Action Bar */}
                        <div className="pt-3 mt-3 border-t border-slate-200 flex items-center justify-between gap-2 filter blur-[3.5px] select-none pointer-events-none opacity-40">
                          <button
                            type="button"
                            disabled
                            className="flex-1 py-1.5 px-2.5 bg-slate-200 text-slate-500 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-not-allowed"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Locked by Patient</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`doc-card-${doc.id || idx}-${idx}`}
                      className="bg-[#f8fafc] border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between hover:shadow-md hover:border-teal-500/50 transition-all group"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="w-8 h-8 rounded-lg bg-teal-100 text-[#064e4b] flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-0.5 bg-white border border-slate-200 rounded-full text-slate-700 truncate">
                            {doc.documentType || 'Clinical Scan'}
                          </span>
                        </div>

                        <div>
                          <h4 className="text-xs font-bold text-slate-900 truncate group-hover:text-[#064e4b]" title={doc.name}>
                            {doc.name}
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {doc.date} · {doc.size}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="pt-3 mt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedDocForViewer(doc)}
                          className="flex-1 py-1.5 px-2.5 bg-[#054444] hover:bg-[#064e4b] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Report</span>
                        </button>

                        {resolvedUrl && (
                          <a
                            href={resolvedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="Open in new tab"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 5: PRESCRIPTION */}
      {activeTab === 'Prescription' && (
        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs space-y-4 my-1">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Doctor e-Prescription (Rx) Order Sheet
              </h3>
              <p className="text-[11px] text-slate-400">
                Official ABDM compliant e-Prescription with dosage, duration, and clinical instructions.
              </p>
            </div>
            <button
              onClick={() => setIsRxModalOpen(true)}
              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-[#054444] hover:bg-[#064e4b] text-white text-xs rounded-md font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Medication</span>
            </button>
          </div>

          {patient.prescriptions.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No medications prescribed yet. Click &apos;Add Medication&apos; to add a prescription.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[550px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                    <th className="p-2.5">Medication Name</th>
                    <th className="p-2.5">Dosage</th>
                    <th className="p-2.5">Frequency</th>
                    <th className="p-2.5">Duration</th>
                    <th className="p-2.5">Instructions</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {patient.prescriptions.map((rx, idx) => (
                    <tr key={`full-rx-${rx.id || idx}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-2.5 font-bold text-[#064e4b]">{rx.drugName}</td>
                      <td className="p-2.5 font-medium">{rx.dosage}</td>
                      <td className="p-2.5">
                        <span className="bg-teal-50 text-[#064e4b] px-2 py-0.5 rounded font-mono font-semibold text-xs border border-teal-200">
                          {rx.frequency}
                        </span>
                      </td>
                      <td className="p-2.5">{rx.duration}</td>
                      <td className="p-2.5 text-slate-600">{rx.instructions}</td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => {
                            const filtered = patient.prescriptions.filter((p) => p.id !== rx.id);
                            onUpdatePatient({ ...patient, prescriptions: filtered });
                          }}
                          className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Confidence Legend Box */}
      <div className="bg-[#f8fafc] border border-slate-200/90 rounded-lg p-2.5 text-xs text-slate-600 flex items-center flex-wrap gap-x-3 gap-y-1 mt-4 mb-3">
        <div className="flex items-center space-x-1 font-semibold text-slate-700">
          <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>Confidence Key:</span>
        </div>

        <div className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          <span><strong className="font-semibold text-slate-800">High</strong> — extracted clearly.</span>
        </div>

        <div className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
          <span><strong className="font-semibold text-slate-800">Verify</strong> — patient description was vague.</span>
        </div>

        <div className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
          <span><strong className="font-semibold text-slate-800">Critical</strong> — requires immediate clinical attention.</span>
        </div>
      </div>

      {/* 4. Fixed Sticky Bottom Action Bar with Backdrop Blur & Prominent Sign-Off CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-lg px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Left Controls: Voice Memo Dictation & Save Changes */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={toggleVoiceDictation}
              className={`px-3.5 py-2 rounded-lg font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                isListening
                  ? 'bg-rose-600 text-white animate-pulse shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
              }`}
              title="Dictate consultation notes via Speech-to-Text"
            >
              {isListening ? (
                <>
                  <MicOff className="w-3.5 h-3.5 text-white" />
                  <span>Dictating...</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-teal-700" />
                  <span>Voice Memo</span>
                </>
              )}
            </button>

            <button
              onClick={handleSaveSummary}
              className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <Save className="w-3.5 h-3.5 text-slate-500" />
              <span>Save Changes</span>
            </button>
          </div>

          {/* Right Primary Action: Prominent Emerald Sign-Off Button */}
          {patient.priority === 'Completed' || patient.status === 'completed' ? (
            <div className="flex-1 sm:flex-initial sm:min-w-[220px] px-5 py-2.5 bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-xs rounded-lg shadow-2xs text-center flex items-center justify-center gap-2 select-none">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Signed Off & Finalized</span>
            </div>
          ) : (
            <button
              onClick={onConfirmContinue}
              className="flex-1 sm:flex-initial sm:min-w-[220px] px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-lg shadow-sm hover:shadow transition-all text-center cursor-pointer flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4 text-white" />
              <span>Confirm & Sign Off Rx</span>
            </button>
          )}
        </div>
      </div>

      {/* In-App Document Viewer Modal */}
      <DocumentViewerModal
        document={selectedDocForViewer}
        isOpen={Boolean(selectedDocForViewer)}
        onClose={() => setSelectedDocForViewer(null)}
      />

      {/* Modal for Adding Medication dynamically */}
      {isRxModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl p-5 text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="text-sm font-bold text-slate-900">Add e-Prescription Medication</h4>
              <button
                onClick={() => setIsRxModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddMedication} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Medication Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tab. Paracetamol / Syp. Amoxicillin"
                  value={newRxName}
                  onChange={(e) => setNewRxName(e.target.value)}
                  className="w-full bg-[#f8fafc] border border-slate-300 rounded-lg py-2 px-3 text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#054444]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Dosage</label>
                  <input
                    type="text"
                    required
                    value={newRxDosage}
                    onChange={(e) => setNewRxDosage(e.target.value)}
                    className="w-full bg-[#f8fafc] border border-slate-300 rounded-lg py-2 px-3 text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#054444]"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Frequency</label>
                  <select
                    value={newRxFreq}
                    onChange={(e) => setNewRxFreq(e.target.value)}
                    className="w-full bg-[#f8fafc] border border-slate-300 rounded-lg py-2 px-3 text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#054444]"
                  >
                    <option value="1-0-1">1-0-1 (Twice Daily)</option>
                    <option value="1-1-1">1-1-1 (Thrice Daily)</option>
                    <option value="1-0-0">1-0-0 (Morning)</option>
                    <option value="0-0-1">0-0-1 (Bedtime)</option>
                    <option value="SOS">SOS (As needed)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Duration</label>
                  <input
                    type="text"
                    required
                    value={newRxDuration}
                    onChange={(e) => setNewRxDuration(e.target.value)}
                    className="w-full bg-[#f8fafc] border border-slate-300 rounded-lg py-2 px-3 text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#054444]"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Instructions</label>
                  <input
                    type="text"
                    value={newRxInstructions}
                    onChange={(e) => setNewRxInstructions(e.target.value)}
                    className="w-full bg-[#f8fafc] border border-slate-300 rounded-lg py-2 px-3 text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#054444]"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRxModalOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#054444] hover:bg-[#064e4b] text-white rounded-lg font-medium shadow-2xs cursor-pointer"
                >
                  Add to Prescription
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};

// Aliased export for DoctorPatientView
export const DoctorPatientView = ClinicalWorkspace;
