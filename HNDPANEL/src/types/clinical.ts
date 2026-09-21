export type PriorityStatus = 'Urgent' | 'Waiting' | 'History Ready' | 'Completed';

export interface SocratesField {
  label: string;
  value: string;
  confidence: 'High' | 'Verify' | 'Critical';
}

export interface LabResult {
  investigation: string;
  result: string;
  reference: string;
  status: 'High' | 'Normal' | 'Critical' | 'Low';
  date: string;
}

export interface DocumentFile {
  id: string;
  name: string;
  date: string;
  type: 'pdf' | 'image' | 'other';
  documentType?: string;
  size: string;
  url?: string;
  downloadUrl?: string;
  filePath?: string;
  status?: string;
  mimeType?: string;
  extractedData?: Record<string, any>;
  processingError?: string;
  isLocked?: boolean;
  lockReason?: string;
  consultationId?: string;
  visitDate?: string;
}

export interface ExtractedDrug {
  drug: string;
  dosage: string;
  frequency: string;
  confidence: number;
  status: 'Verified' | 'Verify' | 'Critical';
}

export interface TranscriptItem {
  id: string;
  speaker: 'bot' | 'patient';
  text: string;
  audioUrl?: string;
  audioDuration?: string;
}

export interface MedicalHistoryItem {
  category: string;
  condition: string;
  since: string;
  status: 'Active' | 'Resolved' | 'Chronic';
  notes?: string;
}

export interface PrescriptionItem {
  id: string;
  drugName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface PatientVitals {
  systolic?: number;
  diastolic?: number;
  pulse?: number;
  temperature?: number;
  spo2?: number;
  source?: string;
  recordedAt?: string;
  weight?: number;
}

export interface PastVisit {
  consultationId: string;
  tokenNumber?: string;
  status?: string;
  riskLevel?: string;
  createdAt?: string;
  signedOffAt?: string;
  department?: string;
  pathway?: string;
  doctorName?: string;
  chiefComplaint?: string;
  diagnosis?: string;
  historyOfPresentIllness?: string;
  remarks?: string;
  prescriptions?: PrescriptionItem[];
}

export interface DrugAllergy {
  drug: string;
  reaction?: string;
  severity?: 'Mild' | 'Moderate' | 'Severe' | 'Critical' | string;
}

export interface AyushAttributes {
  prakriti?: string;
  doshaDominance?: string;
  agni?: string;
  kostha?: string;
  pulseExamination?: string;
  tongueExamination?: string;
  recommendations?: string[];
  [key: string]: any;
}

export interface SummarySection {
  heading: string;
  body: string;
}

export interface Patient {
  id: string;
  tokenNumber: string;
  name: string;
  initials: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other' | string;
  uhid: string;
  department: string;
  departmentPathway?: string;
  intakePathway?: string;
  language?: string;
  mobileNumber?: string;
  patientCode?: string;
  aadhaarNumber?: string;
  address?: string;
  abhaNumber?: string;
  abhaAddress?: string;
  registrationType?: string;
  consentGranted?: boolean;
  chiefComplaint: string;
  historyOfPresentIllness?: string;
  narrativeSummary?: string;
  summarySections?: SummarySection[];
  redFlags?: string[];
  complaintConfidence: 'High' | 'Verify' | 'Critical';
  priority: PriorityStatus;
  abhaLinked: boolean;
  alertMessage?: string;
  isVisitRestricted?: boolean;
  createdAt?: string;
  vitals?: PatientVitals;
  allergies?: DrugAllergy[];
  ayushProfile?: AyushAttributes;
  socrates: {
    site: SocratesField;
    onset: SocratesField;
    character: SocratesField;
    radiation: SocratesField;
    associated: SocratesField;
    timing: SocratesField;
    aggravating: SocratesField;
    relieving: SocratesField;
    severity: SocratesField;
  };
  labs: LabResult[];
  documents: DocumentFile[];
  extractions: ExtractedDrug[];
  transcripts: TranscriptItem[];
  medicalHistory: MedicalHistoryItem[];
  prescriptions: PrescriptionItem[];
  status?: string;
  signedOffAt?: string;
  intakeMode?: 'interview' | 'speak' | string;
  patientAudioUrl?: string;
  patientTranscript?: string;
  pastVisits?: PastVisit[];
}