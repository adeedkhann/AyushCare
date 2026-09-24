import { ApiResponse } from '../utilities/ApiResponse.js';
import { asyncHandler } from '../utilities/asyncHandler.js';
import { ApiError } from '../utilities/ApiError.js';
import pool from '../database/dbConnection.js';
import { canDoctorAccess } from '../services/privacyService.js';

export const getDoctorQueue = asyncHandler(async (req, res) => {
    try {
        const queue = await pool.query(
            `SELECT
                c.id,
                c.token_number,
                c.status,
                c.risk_level,
                c.created_at,
                COALESCE(c.signed_off_at, c.updated_at) AS signed_off_at,
                COALESCE(c.prescriptions, '[]'::jsonb) AS prescriptions,
                c.remarks,
                p.full_name,
                p.abha_number,
                p.id AS patient_id
             FROM consultations c
             JOIN patients p ON c.patient_id = p.id
             WHERE c.assigned_doctor_id = $1
               AND (
                    c.status != 'complete'
                    OR (
                        c.status = 'complete'
                        AND COALESCE(c.signed_off_at, c.updated_at) >= NOW() - INTERVAL '48 hours'
                    )
               )
             ORDER BY
                CASE WHEN c.status = 'complete' THEN 1 ELSE 0 END,
                c.created_at DESC`,
            [req.user.id]
        );
        return res.status(200).json(new ApiResponse(200, queue.rows, 'Queue active list retrieved'));
    } catch (error) {
        console.error('Doctor Queue Error:', error);
        return res.status(500).json(new ApiResponse(500, [], 'Unable to load doctor queue'));
    }
});

export const getPatientSummary = asyncHandler(async (req, res) => {
    const consultation = await pool.query(
        `SELECT c.*, p.abha_number,
                v.systolic, v.diastolic, v.pulse, v.temperature, v.spo2,
                v.source AS vitals_source, v.recorded_at AS vitals_recorded_at
         FROM consultations c
         JOIN patients p ON p.id=c.patient_id
         LEFT JOIN vitals v ON v.consultation_id=c.id
         WHERE c.id=$1
         LIMIT 1`,
        [req.params.id]
    );
    if (!consultation.rowCount) throw new ApiError(404, 'Consultation not found');
    if (String(consultation.rows[0].assigned_doctor_id) !== String(req.user.id)) throw new ApiError(403, 'This consultation is not assigned to you');
    const allowed = await canDoctorAccess({ patientId: consultation.rows[0].patient_id, hospitalId: consultation.rows[0].hospital_id, consultationId: consultation.rows[0].id, category: 'visits' });
    if (!allowed) return res.status(200).json(new ApiResponse(200, { consultation_id: consultation.rows[0].id, abha_number: consultation.rows[0].abha_number, restricted: true }, 'Patient has restricted this visit from doctor view'));
    const summary = await pool.query('SELECT * FROM clinical_summaries WHERE consultation_id = $1', [req.params.id]);
    const summaryData = summary.rows[0] || {};
    const consultationData = consultation.rows[0];
    return res.status(200).json(new ApiResponse(200, {
        ...summaryData,
        clinical_summary: summaryData.clinical_summary || consultationData.clinical_summary || summaryData.history_of_present_illness || summaryData.ai_payload?.summary_text || '',
        hpi_narrative: summaryData.history_of_present_illness || consultationData.history_of_present_illness || summaryData.clinical_summary || consultationData.clinical_summary || '',
        ai_draft: summaryData.ai_payload?.ai_draft || { summary: summaryData.ai_payload?.summary_text || '' },
        socrates_assessment: summaryData.socrates_assessment || consultationData.socrates_assessment || summaryData.ai_payload?.socrates_assessment || summaryData.ai_payload?.socrates || {},
        intake_mode: consultation.rows[0].intake_mode || 'interview',
        patient_audio_url: consultation.rows[0].patient_audio_url || null,
        patient_transcript: consultation.rows[0].patient_transcript || null,
    }, "AI clinical history loaded"));
});

export const getPatientReports = asyncHandler(async (req, res) => {
    const consultation = await pool.query(`SELECT c.*, p.id AS patient_uuid, p.abha_number FROM consultations c JOIN patients p ON p.id=c.patient_id WHERE c.id=$1 LIMIT 1`, [req.params.id]);
    if (!consultation.rowCount) throw new ApiError(404, 'Consultation not found');
    if (String(consultation.rows[0].assigned_doctor_id) !== String(req.user.id)) throw new ApiError(403, 'This consultation is not assigned to you');
    const reports = await pool.query('SELECT * FROM uploaded_documents WHERE consultation_id = $1 ORDER BY created_at DESC', [req.params.id]);
    const visible = [];
    for (const report of reports.rows) {
        if (await canDoctorAccess({ patientId: consultation.rows[0].patient_uuid, hospitalId: consultation.rows[0].hospital_id, consultationId: consultation.rows[0].id, documentId: report.id, category: 'reports' })) {
            const docUrl = report.document_url || (report.file_path_hash?.startsWith('http') ? report.file_path_hash : null) || report.download_url;
            visible.push({
                ...report,
                download_url: docUrl,
                url: docUrl,
                document_url: docUrl
            });
        }
    }
    return res.status(200).json(new ApiResponse(200, visible, "Chronological medical files loaded"));
});

export const getPatientHistory = asyncHandler(async (req, res) => {
    const patientId = req.params.patientId;
    const patient = await pool.query(
        `SELECT id, hospital_id FROM patients WHERE id = $1 LIMIT 1`,
        [patientId]
    );
    if (!patient.rowCount) throw new ApiError(404, 'Patient not found');
    if (String(patient.rows[0].hospital_id) !== String(req.user.hospital_id)) {
        throw new ApiError(403, 'This patient is outside your hospital');
    }

    const visitsResult = await pool.query(
        `SELECT
            c.id AS consultation_id,
            c.token_number,
            c.status,
            c.risk_level,
            c.created_at,
            c.updated_at,
            c.signed_off_at,
            c.remarks,
            c.prescriptions,
            d.name AS department,
            d.pathway,
            u.name AS doctor_name,
            cs.chief_complaint,
            cs.history_of_present_illness,
            COALESCE(cs.ai_payload->>'primary_diagnosis', cs.ai_payload->>'diagnosis') AS diagnosis,
            cs.medications,
            cs.generated_at
         FROM consultations c
         LEFT JOIN departments d ON d.id = c.department_id
         LEFT JOIN users u ON u.id = c.assigned_doctor_id
         LEFT JOIN clinical_summaries cs ON cs.consultation_id = c.id
         WHERE c.patient_id = $1
           AND c.hospital_id = $2
         ORDER BY c.created_at DESC`,
        [patientId, req.user.hospital_id]
    );

    const visits = [];
    const consultationIds = [];
    for (const visit of visitsResult.rows) {
        const allowed = await canDoctorAccess({
            patientId,
            hospitalId: req.user.hospital_id,
            consultationId: visit.consultation_id,
            category: 'visits',
        });
        if (!allowed) continue;
        consultationIds.push(visit.consultation_id);
        visits.push(visit);
    }

    const documents = [];
    if (consultationIds.length > 0) {
        const documentResult = await pool.query(
            `SELECT * FROM uploaded_documents
             WHERE consultation_id = ANY($1::uuid[])
             ORDER BY created_at DESC`,
            [consultationIds]
        );
        for (const document of documentResult.rows) {
            const visit = visits.find((item) => item.consultation_id === document.consultation_id);
            if (!visit) continue;
            const allowed = await canDoctorAccess({
                patientId,
                hospitalId: req.user.hospital_id,
                consultationId: document.consultation_id,
                documentId: document.id,
                category: 'reports',
            });
            if (!allowed) continue;
            documents.push({
                ...document,
                consultation_id: document.consultation_id,
                visit_date: visit.created_at,
                download_url: document.document_url || (document.file_path_hash?.startsWith('http') ? document.file_path_hash : null),
            });
        }
    }

    return res.status(200).json(new ApiResponse(200, { visits, documents }, 'Patient history loaded'));
});

export const updateConsultationStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    await pool.query('UPDATE consultations SET status = $1 WHERE id = $2', [status, req.params.id]);
    return res.status(200).json(new ApiResponse(200, {}, `Token updated to state: ${status}`));
});

export const signOffConsultation = asyncHandler(async (req, res) => {
    const { remarks, prescriptions = [] } = req.body || {};
    if (!Array.isArray(prescriptions)) throw new ApiError(400, 'prescriptions must be an array');
    await pool.query(
        'UPDATE consultations SET status = \'complete\', remarks = $1, prescriptions = $2::jsonb, signed_off_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [remarks, JSON.stringify(prescriptions), req.params.id]
    );
    return res.status(200).json(new ApiResponse(200, {}, "Consultation completed and saved"));
});

export const updateClinicalSummary = asyncHandler(async (req, res) => {
    const { chiefComplaint, clinicalSummary, socratesAssessment } = req.body || {};
    const consultation = await pool.query(
        `SELECT id, patient_id, hospital_id, assigned_doctor_id FROM consultations WHERE id = $1 LIMIT 1`,
        [req.params.id]
    );
    if (!consultation.rowCount) throw new ApiError(404, 'Consultation not found');
    const current = consultation.rows[0];
    if (String(current.assigned_doctor_id) !== String(req.user.id)) throw new ApiError(403, 'This consultation is not assigned to you');
    const allowed = await canDoctorAccess({
        patientId: current.patient_id,
        hospitalId: current.hospital_id,
        consultationId: current.id,
        category: 'visits',
    });
    if (!allowed) throw new ApiError(403, 'Patient has restricted this visit from doctor view');
    if (typeof chiefComplaint !== 'string' || typeof clinicalSummary !== 'string' || !socratesAssessment || typeof socratesAssessment !== 'object') {
        throw new ApiError(400, 'chiefComplaint, clinicalSummary, and socratesAssessment are required');
    }

    const updated = await pool.query(
        `INSERT INTO clinical_summaries
            (consultation_id, chief_complaint, clinical_summary, history_of_present_illness, socrates_assessment, ai_payload, generated_at, updated_at)
         VALUES ($1, $2, $3, $3, $4::jsonb, jsonb_build_object('socrates_assessment', $4::jsonb, 'summary_text', $3), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (consultation_id) DO UPDATE SET
            chief_complaint = EXCLUDED.chief_complaint,
            clinical_summary = EXCLUDED.clinical_summary,
            history_of_present_illness = EXCLUDED.history_of_present_illness,
            socrates_assessment = EXCLUDED.socrates_assessment,
            ai_payload = COALESCE(clinical_summaries.ai_payload, '{}'::jsonb) || EXCLUDED.ai_payload,
            updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [req.params.id, chiefComplaint.trim(), clinicalSummary.trim(), JSON.stringify(socratesAssessment)]
    );
    const summary = updated.rows[0];
    return res.status(200).json(new ApiResponse(200, {
        ...summary,
        hpi_narrative: summary.history_of_present_illness,
        ai_draft: { summary: summary.clinical_summary },
    }, 'Clinical summary updated'));
});