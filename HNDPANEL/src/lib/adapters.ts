import {
  Patient,
  PriorityStatus,
  SocratesField,
  MedicalHistoryItem,
  LabResult,
  ExtractedDrug,
  TranscriptItem,
  PrescriptionItem,
  DocumentFile,
  PatientVitals,
  DrugAllergy,
  AyushAttributes,
  SummarySection,
} from '../types/clinical';
import { ClinicalSummary, ConsultationQueueItem, UploadedDocument } from '../types/api';
import { PatientHistoryResponse } from '../services/doctor.service';

export function mapStatusToPriority(status: string, riskLevel: string): PriorityStatus {
  if (status === 'complete') return 'Completed';
  if (riskLevel === 'high_risk' || riskLevel === 'emergency') return 'Urgent';
  if (status === 'waiting_triage') return 'Waiting';
  if (status === 'in_queue' || status === 'call') return 'History Ready';
  return 'Waiting';
}

const formatSocratesField = (
  rawField?: any,
  fallbackConfidence?: 'High' | 'Verify' | 'Critical'
): SocratesField => {
  if (!rawField) {
    return {
      label: 'Not recorded',
      value: 'Not recorded',
      confidence: fallbackConfidence || 'Verify',
    };
  }

  if (typeof rawField === 'object' && rawField !== null) {
    const val = rawField.value || rawField.text || rawField.label || 'Not recorded';
    const conf = rawField.confidence || fallbackConfidence || (val !== 'Not recorded' ? 'High' : 'Verify');
    return {
      label: val,
      value: val,
      confidence: conf,
    };
  }

  const strVal = String(rawField);
  return {
    label: strVal,
    value: strVal,
    confidence: fallbackConfidence || (strVal && strVal !== 'Not recorded' ? 'High' : 'Verify'),
  };
};

const safeParseJson = (data: any) => {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
};

export function mapQueueItemToPatient(
  item: ConsultationQueueItem,
  summary?: ClinicalSummary | null,
  reports: UploadedDocument[] = [],
  sessionDocs: any[] = [],
  history?: PatientHistoryResponse | null
): Patient {
  const fullName = summary?.full_name || item.full_name || 'Anonymous Patient';
  const initials = fullName
    ? fullName
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'PT';

  // Safely parse JSON structures
  const aiPayload = safeParseJson(summary?.ai_payload) || {};
  const ayushAttrs = safeParseJson(summary?.ayush_attributes) || {};

  const isVisitRestricted = Boolean(summary?.restricted);

  // Merge sessionDocs (from kiosk session) with reports (permitted visible reports)
  const permittedReportIds = new Set(reports.map((r) => String(r.id)));
  const allRawDocs: any[] = [];
  const seenDocIds = new Set<string>();

  // Add permitted reports first
  const historicalReports = history?.documents || [];
  [...historicalReports, ...reports].forEach((doc) => {
    if (doc?.id && !seenDocIds.has(String(doc.id))) {
      seenDocIds.add(String(doc.id));
      allRawDocs.push({
        ...doc,
        __isLocked: isVisitRestricted || Boolean(doc.is_locked),
      });
    }
  });

  // Add any session docs that might be locked by privacy policy
  sessionDocs.forEach((doc) => {
    if (doc?.id && !seenDocIds.has(String(doc.id))) {
      seenDocIds.add(String(doc.id));
      const isLocked = isVisitRestricted || !permittedReportIds.has(String(doc.id));
      allRawDocs.push({
        ...doc,
        __isLocked: isLocked,
      });
    }
  });

  const mappedDocuments: DocumentFile[] = allRawDocs.map((doc) => {
    const rawPath = doc.file_path_hash || '';
    const finalUrl = doc.download_url || doc.url || rawPath;
    const fileName =
      rawPath.split('/').pop() ||
      doc.document_type ||
      `Document-${String(doc.id).slice(0, 6)}`;

    const isImg =
      rawPath.endsWith('.png') ||
      rawPath.endsWith('.jpg') ||
      rawPath.endsWith('.jpeg') ||
      rawPath.endsWith('.webp') ||
      (doc.source_mime_type && doc.source_mime_type.startsWith('image/'));

    const isPdf =
      rawPath.endsWith('.pdf') ||
      (doc.source_mime_type && doc.source_mime_type.includes('pdf'));

    const extracted = safeParseJson(doc.extracted_data) || {};
    const isLocked = Boolean(doc.__isLocked || doc.is_locked);

    return {
      id: doc.id,
      name: fileName,
      date: doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Recorded',
      type: isImg ? 'image' : isPdf ? 'pdf' : 'other',
      documentType: doc.document_type || 'Clinical Document',
      size: extracted?.file_size || (doc.page_number ? `Page ${doc.page_number}` : 'Attached Report'),
      url: finalUrl,
      downloadUrl: doc.download_url || finalUrl,
      filePath: rawPath,
      status: doc.status,
      mimeType: doc.source_mime_type,
      extractedData: extracted,
      processingError: (doc as any).processing_error,
      consultationId: doc.consultation_id,
      visitDate: (doc as any).visit_date,
      isLocked,
      lockReason: isLocked
        ? 'Restricted by patient via AyushCare Mobile (Consent Required)'
        : undefined,
    };
  });

  // Extract Summary Sections from AI Payload
  let parsedSummarySections: SummarySection[] = [];
  if (Array.isArray(aiPayload?.sections)) {
    parsedSummarySections = aiPayload.sections.map((s: any) => ({
      heading: s.heading_en || s.heading || s.title || 'Clinical Finding',
      body: s.body || (Array.isArray(s.bullet_points) ? s.bullet_points.join('\n• ') : String(s)),
    }));
  }

  // Extract Chief Complaint
  const chiefComplaint =
    summary?.chief_complaint ||
    aiPayload?.chief_complaint ||
    parsedSummarySections.find((s) => /complaint/i.test(s.heading))?.body ||
    item.chief_complaint ||
    'Intake recorded at kiosk';

  // Extract History of Present Illness (HPI)
  const historyOfPresentIllness =
    summary?.history_of_present_illness ||
    aiPayload?.history_of_present_illness ||
    aiPayload?.hpi ||
    parsedSummarySections.find((s) => /history|present illness|hpi/i.test(s.heading))?.body ||
    '';

  // Narrative Summary
  const narrativeSummary =
    aiPayload?.summary_text ||
    aiPayload?.narrative_summary ||
    aiPayload?.summary ||
    (parsedSummarySections.length > 0
      ? parsedSummarySections.map((s) => `### ${s.heading}\n${s.body}`).join('\n\n')
      : historyOfPresentIllness);

  // Red Flags from AI
  const redFlags: string[] =
    aiPayload?.red_flags ||
    aiPayload?.critical_findings ||
    [];

  // Extract SOCRATES from any available AI summary structure
  const rawSocrates =
    summary?.socrates ||
    aiPayload?.socrates ||
    ayushAttrs?.socrates ||
    {};

  const socratesGrid = {
    site: formatSocratesField(rawSocrates.site, rawSocrates.site_confidence),
    onset: formatSocratesField(rawSocrates.onset, rawSocrates.onset_confidence),
    character: formatSocratesField(rawSocrates.character, rawSocrates.character_confidence),
    radiation: formatSocratesField(rawSocrates.radiation, rawSocrates.radiation_confidence),
    associated: formatSocratesField(
      rawSocrates.associated || historyOfPresentIllness,
      rawSocrates.associated_confidence
    ),
    timing: formatSocratesField(rawSocrates.timing, rawSocrates.timing_confidence),
    aggravating: formatSocratesField(
      rawSocrates.aggravating || rawSocrates.exacerbating,
      rawSocrates.aggravating_confidence
    ),
    relieving: formatSocratesField(rawSocrates.relieving, rawSocrates.relieving_confidence),
    severity: formatSocratesField(rawSocrates.severity, rawSocrates.severity_confidence),
  };

  // Parse Medical History
  let parsedHistory: MedicalHistoryItem[] = [];
  const rawHistory = safeParseJson(summary?.past_medical_history) || aiPayload?.medical_history;
  if (Array.isArray(rawHistory)) {
    parsedHistory = rawHistory.map((m: any) => ({
      category: m.category || 'General',
      condition: m.condition || m.title || String(m),
      since: m.since || m.year || 'Recorded',
      status: m.status || 'Active',
      notes: m.notes || '',
    }));
  } else if (rawHistory && typeof rawHistory === 'object') {
    parsedHistory = Object.entries(rawHistory).map(([key, val]: [string, any]) => ({
      category: key,
      condition: typeof val === 'string' ? val : val?.condition || key,
      since: val?.since || 'Recorded',
      status: val?.status || 'Active',
      notes: val?.notes || '',
    }));
  }

  // Parse Lab Results from summary or reports
  let parsedLabs: LabResult[] = [];
  const rawLabs =
    aiPayload?.labs ||
    ayushAttrs?.labs ||
    reports.flatMap((r) => {
      const ext = safeParseJson(r.extracted_data);
      return Array.isArray(ext?.labs) ? ext.labs : [];
    });

  if (Array.isArray(rawLabs)) {
    parsedLabs = rawLabs.map((l: any) => ({
      investigation: l.investigation || l.test_name || l.name || 'Laboratory Test',
      result: String(l.result || l.value || 'Normal'),
      reference: l.reference || l.reference_range || l.normal_range || 'Normal Range',
      status: (l.status as any) || 'Normal',
      date: l.date || (summary?.generated_at ? new Date(summary.generated_at).toLocaleDateString() : 'Current Visit'),
    }));
  }

  // Parse AI Extractions
  let parsedExtractions: ExtractedDrug[] = [];
  const rawExtractions =
    aiPayload?.medications ||
    aiPayload?.prescriptions ||
    aiPayload?.extracted_medications ||
    ayushAttrs?.extractions ||
    reports.flatMap((r) => {
      const ext = safeParseJson(r.extracted_data);
      return ext?.medications || ext?.prescriptions || ext?.drugs || ext?.extracted_medications || [];
    });

  if (Array.isArray(rawExtractions)) {
    parsedExtractions = rawExtractions.map((e: any) => ({
      drug: e.drug || e.name || e.drugName || 'Medication',
      dosage: e.dosage || 'Standard Dosage',
      frequency: e.frequency || 'Once daily',
      confidence: typeof e.confidence === 'number' ? e.confidence : 90,
      status: e.status || (e.confidence && e.confidence > 80 ? 'Verified' : 'Verify'),
    }));
  }

  // Parse Transcripts
  let parsedTranscripts: TranscriptItem[] = [];
  const rawTranscripts =
    aiPayload?.transcripts ||
    ayushAttrs?.transcripts ||
    aiPayload?.dialogue ||
    aiPayload?.conversation_history;

  if (Array.isArray(rawTranscripts) && rawTranscripts.length > 0) {
    parsedTranscripts = rawTranscripts.map((t: any, idx: number) => ({
      id: t.id || `transcript-${item.id}-${idx}`,
      speaker: t.speaker === 'user' || t.speaker === 'patient' || t.role === 'user' ? 'patient' : 'bot',
      text: t.text || t.message || t.content || '',
      audioUrl: t.audioUrl || t.audio_url,
      audioDuration: t.audioDuration || t.duration,
    }));
  }

  const resolvedAudioUrl =
    summary?.patient_audio_url ||
    (summary as any)?.patientAudioUrl ||
    aiPayload?.patient_audio_url ||
    (item as any)?.patient_audio_url ||
    undefined;

  if (resolvedAudioUrl && parsedTranscripts.length > 0) {
    const patientItem = parsedTranscripts.find((t) => t.speaker === 'patient');
    if (patientItem && !patientItem.audioUrl) {
      patientItem.audioUrl = resolvedAudioUrl;
      patientItem.audioDuration = '30s';
    }
  } else if (parsedTranscripts.length === 0 && chiefComplaint && chiefComplaint !== 'Intake recorded at kiosk') {
    parsedTranscripts = [
      {
        id: `t-intro-${item.id}`,
        speaker: 'bot',
        text: 'Namaste! Please describe the symptoms or health concerns you are experiencing today.',
      },
      {
        id: `t-resp-${item.id}`,
        speaker: 'patient',
        text: chiefComplaint,
        audioUrl: resolvedAudioUrl,
        audioDuration: '30s',
      },
    ];
  }

  // Parse Prescriptions
  let parsedPrescriptions: PrescriptionItem[] = [];
  const rawPrescriptions =
    (item as any)?.prescriptions ||
    safeParseJson(summary?.medications) ||
    aiPayload?.prescriptions ||
    ayushAttrs?.prescriptions;

  if (Array.isArray(rawPrescriptions)) {
    parsedPrescriptions = rawPrescriptions.map((rx: any, idx: number) => ({
      id: rx.id || `rx-${item.id}-${idx}`,
      drugName: rx.drugName || rx.name || 'Prescription Drug',
      dosage: rx.dosage || 'As directed',
      frequency: rx.frequency || '1-0-1',
      duration: rx.duration || '5 Days',
      instructions: rx.instructions || 'Take as advised by physician',
    }));
  }

  // Parse Drug Allergies
  let parsedAllergies: DrugAllergy[] = [];
  const rawAllergies =
    safeParseJson(summary?.drug_allergies) ||
    aiPayload?.drug_allergies ||
    ayushAttrs?.drug_allergies;

  if (Array.isArray(rawAllergies)) {
    parsedAllergies = rawAllergies.map((a: any) => {
      if (typeof a === 'string') {
        return { drug: a, reaction: 'Hypersensitivity reaction', severity: 'Severe' };
      }
      return {
        drug: a.drug || a.name || 'Allergen',
        reaction: a.reaction || 'Allergic reaction',
        severity: a.severity || 'Moderate',
      };
    });
  }

  // Parse AYUSH Attributes
  const parsedAyushProfile: AyushAttributes =
    ayushAttrs ||
    aiPayload?.ayush_profile ||
    {};

  // Vitals: ONLY assign if genuinely recorded (no hardcoding)
  const normalizedVitals = normalizeVitals(summary, item, sessionDocs);
  const hasRecordedVitals = [
    normalizedVitals.systolic,
    normalizedVitals.diastolic,
    normalizedVitals.pulse,
    normalizedVitals.spo2,
    normalizedVitals.temperature,
    normalizedVitals.weight,
  ].some(
    (value) => value !== undefined && value !== null && value !== 0
  );
  const vitalsObj: PatientVitals | undefined = hasRecordedVitals ? normalizedVitals : undefined;

  const patientAge =
    summary?.age ??
    item.age ??
    aiPayload?.age ??
    ayushAttrs?.age ??
    0;

  const patientGender =
    summary?.gender ||
    item.gender ||
    aiPayload?.gender ||
    ayushAttrs?.gender ||
    'Other';

  const uhidVal =
    item.patient_code ||
    summary?.patient_code ||
    (item.id ? `UHID-${item.id.slice(0, 8).toUpperCase()}` : 'Not Assigned');

  const deptVal =
    summary?.department ||
    item.department ||
    aiPayload?.department ||
    'General Medicine / OPD';

  return {
    id: item.id,
    tokenNumber: item.token_number,
    name: fullName,
    initials,
    age: Number(patientAge) || 0,
    gender: patientGender,
    uhid: uhidVal,
    department: deptVal,
    departmentPathway: summary?.department_pathway || item.department_pathway || 'Allopathy',
    intakePathway: summary?.intake_pathway || item.intake_pathway || 'General',
    language: summary?.language || item.language || 'English',
    mobileNumber: summary?.mobile_number || item.mobile_number,
    patientCode: summary?.patient_code || item.patient_code,
    aadhaarNumber: summary?.aadhaar_number || item.aadhaar_number,
    address: summary?.address || item.address,
    abhaNumber: summary?.abha_number || item.abha_number,
    abhaAddress: summary?.abha_address || item.abha_address,
    registrationType: summary?.registration_type || item.registration_type || 'New Patient',
    consentGranted: item.consent_granted ?? true,
    chiefComplaint,
    historyOfPresentIllness,
    narrativeSummary,
    summarySections: parsedSummarySections,
    redFlags,
    complaintConfidence:
      item.risk_level === 'high_risk' || item.risk_level === 'emergency'
        ? 'Critical'
        : 'High',
    priority: mapStatusToPriority(item.status, item.risk_level),
    abhaLinked: Boolean(
      item.abha_number ||
      summary?.abha_number ||
      aiPayload?.abha_number ||
      ayushAttrs?.abha_number
    ),
    alertMessage:
      item.risk_level === 'emergency'
        ? 'Emergency Triage Flagged by AyushCare Intake'
        : item.risk_level === 'high_risk'
        ? 'High Risk Triage Flagged by AyushCare Intake'
        : undefined,
    isVisitRestricted,
    createdAt: item.created_at || summary?.generated_at,
    vitals: vitalsObj,
    allergies: parsedAllergies,
    ayushProfile: parsedAyushProfile,
    socrates: socratesGrid,
    labs: parsedLabs,
    documents: mappedDocuments,
    extractions: parsedExtractions,
    transcripts: parsedTranscripts,
    medicalHistory: parsedHistory,
    prescriptions: parsedPrescriptions,
    status: item.status,
    signedOffAt: item.signed_off_at,
    patientAudioUrl:
      summary?.patient_audio_url ||
      (summary as any)?.patientAudioUrl ||
      aiPayload?.patient_audio_url ||
      (item as any)?.patient_audio_url,
    patientTranscript:
      summary?.patient_transcript ||
      (summary as any)?.patientTranscript ||
      (item as any)?.patient_transcript,
    intakeMode:
      summary?.intake_mode ||
      (summary as any)?.intakeMode ||
      (item as any)?.intake_mode ||
      'interview',
    pastVisits: (history?.visits || []).map((visit: any) => ({
      consultationId: visit.consultation_id,
      tokenNumber: visit.token_number,
      status: visit.status,
      riskLevel: visit.risk_level,
      createdAt: visit.created_at,
      signedOffAt: visit.signed_off_at,
      department: visit.department,
      pathway: visit.pathway,
      doctorName: visit.doctor_name,
      chiefComplaint: visit.chief_complaint,
      diagnosis: visit.diagnosis,
      historyOfPresentIllness: visit.history_of_present_illness,
      remarks: visit.remarks,
      prescriptions: parsePrescriptionItems(visit.prescriptions, visit.consultation_id),
    })),
  };
}

const parsePrescriptionItems = (raw: any, consultationId: string): PrescriptionItem[] => {
  const parsed = safeParseJson(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((rx: any, index: number) => ({
    id: rx.id || `rx-${consultationId}-${index}`,
    drugName: rx.drugName || rx.name || 'Prescription Drug',
    dosage: rx.dosage || 'As directed',
    frequency: rx.frequency || 'As directed',
    duration: rx.duration || 'As directed',
    instructions: rx.instructions || 'Take as advised by physician',
  }));
};

const normalizeVitals = (summary: any, item: any, sessionData: any[] = []): PatientVitals => {
  const candidates = [
    item?.vitals,
    item?.vitals_data,
    item?.vitalsData,
    item?.kiosk_vitals,
    summary?.vitals,
    summary?.vitals_data,
    summary?.vitalsData,
    summary?.kiosk_vitals,
    summary?.clinicalSummary?.vitals,
    summary?.intakeData?.vitals,
    sessionData?.find((entry) => entry?.vitals || entry?.vitals_data)?.vitals,
  ].filter(Boolean);
  const raw = candidates[0] || {};
  const read = (...keys: string[]) => keys.map((key) => raw?.[key]).find((value) => value !== undefined && value !== null && value !== '')
    ?? keys.map((key) => summary?.[key] ?? item?.[key]).find((value) => value !== undefined && value !== null && value !== '');
  const bloodPressure = raw.blood_pressure || raw.bloodPressure || raw.bp;
  const [systolic, diastolic] = bloodPressure ? String(bloodPressure).split(/[/-]/).map(Number) : [];
  return {
    systolic: Number(read('systolic', 'systolic_bp', 'blood_pressure_systolic') ?? systolic) || undefined,
    diastolic: Number(read('diastolic', 'diastolic_bp', 'blood_pressure_diastolic') ?? diastolic) || undefined,
    pulse: Number(read('pulse', 'heart_rate', 'pulse_rate')) || undefined,
    spo2: Number(read('spo2', 'spO2', 'oxygen_saturation', 'oxygenSaturation')) || undefined,
    temperature: Number(read('temperature', 'temp', 'body_temperature')) || undefined,
    weight: Number(read('weight', 'weight_kg', 'weightKg')) || undefined,
    source: read('source', 'recorded_by') || summary?.vitals_source || item?.vitals_source,
    recordedAt: read('recorded_at', 'recordedAt', 'timestamp') || summary?.vitals_recorded_at || item?.vitals_recorded_at,
  };
};
