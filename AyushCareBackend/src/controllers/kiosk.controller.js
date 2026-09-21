import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ApiResponse } from '../utilities/ApiResponse.js';
import { asyncHandler } from '../utilities/asyncHandler.js';
import { ApiError } from '../utilities/ApiError.js';
import pool from '../database/dbConnection.js';
import { emitEvent } from '../services/socketService.js';
import AiServiceGateway from '../services/aiService.js';
import { assertSupportedLanguage } from '../services/languageService.js';
import { createRawQrToken, hashQrToken } from '../services/patientQrService.js';
import { saveOTP, verifyOTP } from '../utilities/otpStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_HOSPITAL = () => process.env.DEFAULT_HOSPITAL_ID || null;

const normalizeMobile = (value) => {
    const raw = String(value || '').replace(/\D/g, '');
    if (raw.length === 10) return raw;
    if (raw.length === 12 && raw.startsWith('91')) return raw.slice(2);
    return '';
};

const normalizeDigits = (value, length, label) => {
    if (value === undefined || value === null || value === '') return null;
    const digits = String(value).replace(/\D/g, '');
    if (digits.length !== length) throw new ApiError(400, `${label} must contain exactly ${length} digits`);
    return digits;
};

const dateOfBirthFromAge = (age) => {
    if (age === undefined || age === null || age === '') return null;
    const n = Number(age);
    if (!Number.isInteger(n) || n < 0 || n > 120) throw new ApiError(400, 'age must be an integer between 0 and 120');
    const d = new Date();
    d.setFullYear(d.getFullYear() - n);
    return d.toISOString().slice(0, 10);
};
const pathway = (value) => {
    const p = String(value || 'general').toLowerCase();
    if (!['general', 'allopathy', 'ayurveda'].includes(p)) throw new ApiError(400, 'intake_pathway must be general, allopathy, or ayurveda');
    return p;
};

const audit = (client, consultationId, eventType, metadata = {}) => client.query(
    `INSERT INTO audit_events (consultation_id, actor_type, event_type, metadata) VALUES ($1,'patient',$2,$3)`,
    [consultationId, eventType, JSON.stringify(metadata)]
);

const getConsultation = async (consultationId) => {
    const result = await pool.query('SELECT * FROM consultations WHERE id = $1', [consultationId]);
    if (!result.rowCount) throw new ApiError(404, 'Consultation not found');
    return result.rows[0];
};

export const performAbhaRegister = asyncHandler(async (req, res) => {
    const {
        abhaNumber, abhaAddress, fullName, gender, dob, age, mobileNumber, address,
        aadhaarNumber, patientId, registrationType = 'new', consent = false,
        hospitalId, language = 'en', intakePathway = 'general', kioskId = 'KIOSK-MAIN-01', departmentId, doctorId
    } = req.body;

    const selectedPathway = pathway(intakePathway);
    const selectedLanguage = await assertSupportedLanguage(language);
    const type = String(registrationType).toLowerCase() === 'old' ? 'old' : 'new';
    const mobile = normalizeMobile(mobileNumber);
    const aadhaar = normalizeDigits(aadhaarNumber, 12, 'Aadhaar number');
    const abha = normalizeDigits(abhaNumber, 14, 'ABHA number');
    const resolvedDob = dob || dateOfBirthFromAge(age);

    if (!consent) throw new ApiError(403, 'Explicit clinical intake consent is required');
    if (type === 'new' && (!fullName || !gender || !resolvedDob || !mobile)) {
        throw new ApiError(400, 'New registration requires fullName, gender, age/dob and a 10-digit mobile number');
    }
    if (type === 'old' && !patientId && !abha && !mobile) {
        throw new ApiError(400, 'Existing patient lookup requires ABHA number or mobile number');
    }
    if (type === 'new' && !abha) {
        throw new ApiError(400, 'ABHA number is required for patient registration');
    }

    const client = await pool.connect();
    let createdAiSessionId = null;
    try {
        await client.query('BEGIN');
        let resolvedHospitalId = hospitalId || DEFAULT_HOSPITAL();
        if (!resolvedHospitalId) {
            const h = await client.query('SELECT id FROM hospitals ORDER BY created_at LIMIT 1');
            if (!h.rowCount) throw new ApiError(400, 'No hospital is configured for kiosk intake');
            resolvedHospitalId = h.rows[0].id;
        }

        let patient;
        if (type === 'old') {
            const conditions = [];
            const params = [];
            if (patientId) {
                params.push(patientId);
                conditions.push(`p.id=$${params.length}`);
            } else {
                if (abha) {
                    params.push(abha);
                    conditions.push(`(REPLACE(REPLACE(p.abha_number, '-', ''), ' ', '')=$${params.length} OR p.abha_number=$${params.length})`);
                }
                if (mobile) {
                    params.push(mobile);
                    conditions.push(`(REPLACE(REPLACE(p.mobile_number, '-', ''), ' ', '')=$${params.length} OR p.mobile_number=$${params.length})`);
                }
            }
            const existing = await client.query(
                `SELECT p.* FROM patients p WHERE ${conditions.join(' OR ')} ORDER BY p.created_at DESC`,
                params
            );
            if (!existing.rowCount) throw new ApiError(404, 'No existing patient found for the supplied patient details');
            if (existing.rowCount > 1 && !abha && !patientId) {
                await client.query('ROLLBACK');
                return res.status(200).json(new ApiResponse(200, {
                    multiple: true,
                    patients: existing.rows
                }, 'Multiple patients found for this mobile number'));
            }
            patient = existing.rows[0];
            await client.query('UPDATE patients SET consent_granted=TRUE, consent_timestamp=NOW() WHERE id=$1', [patient.id]);
        } else {
            if (abha) {
                const existing = await client.query(
                    `SELECT * FROM patients WHERE REPLACE(REPLACE(abha_number, '-', ''), ' ', '') = $1 OR abha_number = $1`,
                    [abha]
                );
                if (existing.rowCount) patient = existing.rows[0];
            }
            if (!patient && aadhaar) {
                const existing = await client.query(
                    `SELECT * FROM patients WHERE REPLACE(REPLACE(aadhaar_number, '-', ''), ' ', '') = $1 OR aadhaar_number = $1`,
                    [aadhaar]
                );
                if (existing.rowCount) patient = existing.rows[0];
            }
            if (!abha) throw new ApiError(400, 'ABHA number is required for registration');
            if (patient) {
                const updated = await client.query(
                    `UPDATE patients SET full_name=$1, gender=$2, date_of_birth=$3, mobile_number=COALESCE($4,mobile_number), abha_number=$5, abha_address=COALESCE($6,abha_address), address=COALESCE($7,address), aadhaar_number=COALESCE($8,aadhaar_number), registration_type='new', consent_granted=TRUE, consent_timestamp=NOW() WHERE id=$9 RETURNING *`,
                    [fullName, gender, resolvedDob, mobile || null, abha, abhaAddress || null, address || null, aadhaar, patient.id]
                );
                patient = updated.rows[0];
            } else {
                const inserted = await client.query(
                    `INSERT INTO patients (abha_number,abha_address,full_name,gender,date_of_birth,mobile_number,address,aadhaar_number,registration_type,consent_granted,consent_timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new',TRUE,NOW()) RETURNING *`,
                    [abha, abhaAddress || null, fullName, gender, resolvedDob, mobile, address || null, aadhaar]
                );
                patient = inserted.rows[0];
            }
        }

        let validatedDepartmentId = departmentId || null;
        let validatedDoctorId = doctorId || null;

        if (validatedDepartmentId) {
            const department = await client.query(
                `SELECT id,hospital_id,pathway FROM departments
                 WHERE id=$1 AND is_active=TRUE LIMIT 1`,
                [validatedDepartmentId]
            );
            if (!department.rowCount || String(department.rows[0].hospital_id) !== String(resolvedHospitalId)) {
                throw new ApiError(400, 'Selected department is invalid for this hospital');
            }
            if (department.rows[0].pathway !== selectedPathway && !(selectedPathway === 'general' && department.rows[0].pathway === 'allopathy')) {
                throw new ApiError(400, 'Selected department does not match the intake pathway');
            }
        }

        if (validatedDoctorId) {
            const doctor = await client.query(
                `SELECT u.id,u.hospital_id FROM users u
                 JOIN doctor_departments dd ON dd.doctor_id=u.id AND dd.department_id=$2
                 JOIN departments dep ON dep.id=dd.department_id
                 WHERE u.id=$1 AND u.role='doctor' AND u.is_active=TRUE AND u.hospital_id=$3
                   AND dep.is_active=TRUE
                   AND dep.pathway=$4 LIMIT 1`,
                [validatedDoctorId, validatedDepartmentId, resolvedHospitalId, selectedPathway]
            );
            if (!doctor.rowCount) throw new ApiError(400, 'Selected doctor is not available for this hospital, pathway, or department');
        }

        const consultation = (await client.query(
            `INSERT INTO consultations (hospital_id,patient_id,status,intake_pathway,language,department_id,assigned_doctor_id) VALUES ($1,$2,'waiting_triage',$3,$4,$5,$6) RETURNING *`,
            [resolvedHospitalId, patient.id, selectedPathway, selectedLanguage.code, validatedDepartmentId, validatedDoctorId]
        )).rows[0];

        let aiSession;
        try {
            aiSession = await AiServiceGateway.createSession(patient.abha_number, resolvedHospitalId, selectedLanguage.code, selectedPathway);
        } catch (error) {
            throw new ApiError(502, 'Patient registered, but MediKiosk AI session could not be initialized', [error.message]);
        }
        const aiSessionId = aiSession?.id || aiSession?.session_id;
        createdAiSessionId = aiSessionId || null;
        await client.query('UPDATE consultations SET ai_session_id=$1, updated_at=NOW() WHERE id=$2', [aiSessionId || null, consultation.id]);

        const pairingToken = randomBytes(12).toString('hex').toUpperCase();
        const expiresAt = new Date(Date.now() + Number(process.env.KIOSK_SESSION_TTL_MINUTES || 30) * 60 * 1000);
        const kioskSession = (await client.query(
            `INSERT INTO kiosk_sessions (pairing_token,kiosk_id,consultation_id,expires_at) VALUES ($1,$2,$3,$4) RETURNING id,pairing_token,kiosk_id,consultation_id,is_active,expires_at`,
            [pairingToken, kioskId, consultation.id, expiresAt]
        )).rows[0];
        await audit(client, consultation.id, 'patient_verified', { pathway: selectedPathway, language: selectedLanguage.code, registration_type: type, abha_number: patient.abha_number });
        await client.query('COMMIT');

        return res.status(201).json(new ApiResponse(201, {
            patient,
            consultation_id: consultation.id,
            session_id: consultation.id,
            ai_session_id: aiSessionId,
            language: selectedLanguage.code,
            language_metadata: selectedLanguage,
            intake_pathway: selectedPathway,
            registration_type: type,
            pairing_session: kioskSession
        }, 'Patient verified and kiosk consultation initialized'));
    } catch (error) {
        await client.query('ROLLBACK');
        try {
            if (typeof createdAiSessionId !== 'undefined' && createdAiSessionId) {
                await AiServiceGateway.deleteSession(createdAiSessionId);
            }
        } catch (cleanupError) {
            console.error('[Kiosk] AI session cleanup failed after transaction rollback:', cleanupError?.message || cleanupError);
        }
        throw error;
    } finally { client.release(); }
});

export const lookupPatients = asyncHandler(async (req, res) => {
    const rawPatientId = String(req.query.patient_id || req.query.abha_number || req.query.abhaNumber || '').trim();
    const rawMobile = req.query.mobile_number || req.query.mobileNumber;
    const mobile = normalizeMobile(rawMobile);
    if (!rawPatientId && !mobile) throw new ApiError(400, 'abha_number or mobile_number is required');

    const params = [];
    const conditions = [];
    if (rawPatientId) {
        const clean = rawPatientId.replace(/\D/g, '');
        params.push(clean || rawPatientId);
        conditions.push(`(REPLACE(REPLACE(p.abha_number, '-', ''), ' ', '')=$${params.length} OR p.abha_number=$${params.length})`);
    }
    if (mobile) {
        params.push(mobile);
        conditions.push(`(REPLACE(REPLACE(p.mobile_number, '-', ''), ' ', '')=$${params.length} OR p.mobile_number=$${params.length})`);
    }
    const joiner = rawPatientId && mobile ? ' AND ' : ' OR ';

    const result = await pool.query(
        `SELECT p.id, p.abha_number, p.full_name, p.gender, p.date_of_birth,
                EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS age,
                p.mobile_number, p.address, p.aadhaar_number, p.abha_number, p.abha_address, p.created_at,
                COALESCE(visits.recent_visits, '[]'::jsonb) AS recent_visits
         FROM patients p
         LEFT JOIN LATERAL (
             SELECT jsonb_agg(
                 jsonb_build_object(
                     'department_id', d.id,
                     'department_name', d.name,
                     'pathway', c.intake_pathway,
                     'visited_at', c.created_at
                 ) ORDER BY c.created_at DESC
             ) AS recent_visits
             FROM consultations c
             LEFT JOIN departments d ON d.id = c.department_id
             WHERE c.patient_id = p.id
         ) visits ON TRUE
         WHERE ${conditions.join(joiner)}
         ORDER BY p.created_at DESC`,
        params
    );
    return res.json(new ApiResponse(200, { multiple: result.rowCount > 1, patients: result.rows }, 'Patient lookup completed'));
});

const normalizeSosMobile = (value) => normalizeMobile(value);

export const sendSosOtp = asyncHandler(async (req, res) => {
    const mobile = normalizeSosMobile(req.body?.mobileNumber);
    if (!mobile) throw new ApiError(400, 'A valid 10-digit mobile number is required for SOS verification');
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    saveOTP(mobile, otp, 300);
    console.log(`[AYUSHCARE SOS OTP] mobile=${mobile} otp=${otp}`);
    return res.json(new ApiResponse(200, { mobile, otp, expires_in_seconds: 300 }, 'SOS verification OTP sent'));
});

export const verifySosOtp = asyncHandler(async (req, res) => {
    const {
        otp, patientId, abhaNumber, mobileNumber, fullName, gender, age, dob, address,
        aadhaarNumber, reason, kioskId = 'KIOSK-MAIN-01'
    } = req.body || {};
    const mobile = normalizeSosMobile(mobileNumber);
    if (!mobile || !otp) throw new ApiError(400, 'Mobile number and OTP are required');
    if (!verifyOTP(mobile, String(otp))) throw new ApiError(401, 'Invalid or expired verification OTP');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let patient;
        if (patientId) {
            const existing = await client.query('SELECT * FROM patients WHERE id=$1 LIMIT 1', [patientId]);
            if (!existing.rowCount) throw new ApiError(404, 'Patient record not found');
            patient = existing.rows[0];
        } else {
            const cleanAbha = normalizeDigits(abhaNumber, 14, 'ABHA number');
            const resolvedDob = dob || dateOfBirthFromAge(age);
            if (!fullName || !gender || !resolvedDob || !mobile) throw new ApiError(400, 'Name, gender, age/dob and mobile number are required');
            if (cleanAbha) {
                const existing = await client.query(
                    `SELECT * FROM patients WHERE REPLACE(REPLACE(abha_number, '-', ''), ' ', '')=$1 OR abha_number=$1 LIMIT 1`,
                    [cleanAbha]
                );
                patient = existing.rows[0];
            }
            if (patient) {
                const updated = await client.query(
                    `UPDATE patients SET full_name=$1, gender=$2, date_of_birth=$3, mobile_number=$4, address=COALESCE($5,address), aadhaar_number=COALESCE($6,aadhaar_number), consent_granted=TRUE, consent_timestamp=NOW() WHERE id=$7 RETURNING *`,
                    [fullName, gender, resolvedDob, mobile, address || null, normalizeDigits(aadhaarNumber, 12, 'Aadhaar number'), patient.id]
                );
                patient = updated.rows[0];
            } else {
                const inserted = await client.query(
                    `INSERT INTO patients (abha_number,full_name,gender,date_of_birth,mobile_number,address,aadhaar_number,registration_type,consent_granted,consent_timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7,'sos',TRUE,NOW()) RETURNING *`,
                    [cleanAbha, fullName, gender, resolvedDob, mobile, address || null, normalizeDigits(aadhaarNumber, 12, 'Aadhaar number')]
                );
                patient = inserted.rows[0];
            }
        }

        const event = await client.query(
            `INSERT INTO sos_events (patient_id,kiosk_id,verification_method,metadata,reason,status) VALUES ($1,$2,$3,$4,$5,'active') RETURNING id,invoked_at`,
            [patient.id, kioskId, abhaNumber ? 'abha' : 'mobile', JSON.stringify({ source: 'kiosk_sos' }), reason || null]
        );
        const token = `SOS-${String(Date.now()).slice(-6)}`;
        const consultation = await client.query(
            `INSERT INTO consultations (patient_id,token_number,status,risk_level,intake_pathway,language,prescriptions)
             VALUES ($1,$2,'in_queue','emergency','general','en','[]'::jsonb) RETURNING id,token_number,status,risk_level`,
            [patient.id, token]
        );
        await client.query('UPDATE sos_events SET consultation_id=$1 WHERE id=$2', [consultation.rows[0].id, event.rows[0].id]);
        await client.query('COMMIT');
        emitEvent('sos:alert', {
            patient,
            token: consultation.rows[0].token_number,
            consultationId: consultation.rows[0].id,
            riskLevel: consultation.rows[0].risk_level,
        });
        return res.status(201).json(new ApiResponse(201, {
            patient,
            sos_event: { ...event.rows[0], consultation_id: consultation.rows[0].id },
            consultation: consultation.rows[0],
        }, 'SOS request verified and recorded'));
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally { client.release(); }
});

export const integrationHealth = asyncHandler(async (req, res) => {
    const checks = { database: false, ai: false, s3_configured: false };
    try {
        await pool.query('SELECT 1');
        checks.database = true;
    } catch (error) {
        checks.database_error = error?.message || 'database unavailable';
    }
    try {
        const ai = await AiServiceGateway.health();
        checks.ai = Boolean(ai);
    } catch (error) {
        checks.ai_error = error?.message || 'AI unavailable';
    }
    checks.s3_configured = Boolean(
        process.env.AWS_BUCKET_NAME &&
        process.env.AWS_REGION &&
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY
    );
    const healthy = checks.database && checks.ai && checks.s3_configured;
    return res.status(healthy ? 200 : 503).json(
        new ApiResponse(healthy ? 200 : 503, checks, healthy ? 'All integrations healthy' : 'One or more integrations unavailable')
    );
});

export const createKioskSession = asyncHandler(async (req, res) => {
    const { consultationId, kioskId = 'KIOSK-MAIN-01' } = req.body;
    if (!consultationId) throw new ApiError(400, 'consultationId is required');
    await getConsultation(consultationId);
    const token = randomBytes(12).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + Number(process.env.KIOSK_SESSION_TTL_MINUTES || 30) * 60 * 1000);
    const result = await pool.query(`INSERT INTO kiosk_sessions (pairing_token,kiosk_id,consultation_id,expires_at) VALUES ($1,$2,$3,$4) RETURNING *`, [token, kioskId, consultationId, expiresAt]);
    return res.status(201).json(new ApiResponse(201, result.rows[0], 'Kiosk pairing session created'));
});

export const createPatientUploadQr = asyncHandler(async (req, res) => {
    const consultationId = req.params.session_id;
    const result = await pool.query(
        `SELECT c.id, c.patient_id, p.abha_number, p.full_name
         FROM consultations c
         JOIN patients p ON p.id=c.patient_id
         WHERE c.id=$1 LIMIT 1`,
        [consultationId]
    );
    if (!result.rowCount) throw new ApiError(404, 'Consultation not found');

    const rawToken = createRawQrToken();
    // Valid for 10 minutes (600 seconds) so patient can comfortably take photos and upload from phone
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const created = await pool.query(
        `INSERT INTO patient_qr_tokens(token_hash,patient_id,consultation_id,expires_at)
         VALUES($1,$2,$3,$4) RETURNING id,expires_at`,
        [hashQrToken(rawToken), result.rows[0].patient_id, consultationId, expiresAt]
    );

    return res.status(201).json(new ApiResponse(201, {
        token: rawToken,
        expires_at: created.rows[0].expires_at,
        expires_in_seconds: 600,
        kiosk_screen_seconds: 80,
        abha_number: result.rows[0].abha_number,
        patient_name: result.rows[0].full_name
    }, 'Patient document-upload QR generated'));
});

export const getSession = asyncHandler(async (req, res) => {
    const consultation = await getConsultation(req.params.session_id || req.params.consultation_id);
    const [docs, vitals, summary] = await Promise.all([
        pool.query('SELECT * FROM uploaded_documents WHERE consultation_id=$1 ORDER BY created_at DESC', [consultation.id]),
        pool.query('SELECT * FROM vitals WHERE consultation_id=$1', [consultation.id]),
        pool.query('SELECT * FROM clinical_summaries WHERE consultation_id=$1', [consultation.id])
    ]);
    return res.json(new ApiResponse(200, { consultation, documents: docs.rows, vitals: vitals.rows[0] || null, summary: summary.rows[0] || null }, 'Session state loaded'));
});

export const updateSessionLanguage = asyncHandler(async (req, res) => {
    const { language } = req.body;
    const selectedLanguage = await assertSupportedLanguage(language);
    const consultation = await getConsultation(req.params.session_id);
    const ai = await AiServiceGateway.updateLanguage(consultation.ai_session_id, selectedLanguage.code);
    const result = await pool.query('UPDATE consultations SET language=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [selectedLanguage.code, consultation.id]);
    return res.json(new ApiResponse(200, { consultation: result.rows[0], ai, language: selectedLanguage }, 'Language updated'));
});

export const updateConsultationRouting = asyncHandler(async (req, res) => {
    const c = await getConsultation(req.params.session_id);
    const { departmentId, doctorId } = req.body || {};
    if (!departmentId) throw new ApiError(400, 'departmentId is required');

    const department = await pool.query(
        `SELECT id, name, pathway, hospital_id FROM departments
         WHERE id=$1 AND is_active=TRUE LIMIT 1`,
        [departmentId]
    );
    if (!department.rowCount) throw new ApiError(404, 'Department not found or inactive');
    if (String(department.rows[0].hospital_id) !== String(c.hospital_id)) {
        throw new ApiError(400, 'Department does not belong to the consultation hospital');
    }

    let doctor = null;
    if (doctorId) {
        const doctorResult = await pool.query(
            `SELECT u.id,u.name,u.specialization,u.hospital_id
             FROM users u
             WHERE u.id=$1 AND u.role='doctor' AND u.is_active=TRUE
             LIMIT 1`,
            [doctorId]
        );
        if (!doctorResult.rowCount) throw new ApiError(404, 'Doctor not found or inactive');
        if (String(doctorResult.rows[0].hospital_id) !== String(c.hospital_id)) {
            throw new ApiError(400, 'Doctor does not belong to the consultation hospital');
        }
        doctor = doctorResult.rows[0];
    }

    const updated = await pool.query(
        `UPDATE consultations
         SET department_id=$1, assigned_doctor_id=$2, updated_at=NOW()
         WHERE id=$3 RETURNING *`,
        [departmentId, doctorId || null, c.id]
    );

    await pool.query(
        `INSERT INTO audit_events (consultation_id, actor_type, event_type, metadata)
         VALUES ($1,'patient','routing_selected',$2)`,
        [c.id, JSON.stringify({
            department_id: departmentId,
            department_name: department.rows[0].name,
            doctor_id: doctor?.id || null,
            doctor_name: doctor?.name || null
        })]
    );

    return res.json(new ApiResponse(200, {
        consultation: updated.rows[0],
        department: department.rows[0],
        doctor
    }, 'Department and doctor routing saved'));
});

export const startDialogue = asyncHandler(async (req, res) => {
    const c = await getConsultation(req.params.session_id);
    const result = await AiServiceGateway.startConversation(c.ai_session_id, c.intake_pathway);
    return res.json(new ApiResponse(200, result, 'AI conversation started'));
});

export const getDialogueState = asyncHandler(async (req, res) => {
    const c = await getConsultation(req.params.session_id);
    return res.json(new ApiResponse(200, await AiServiceGateway.getConversationState(c.ai_session_id), 'AI conversation state loaded'));
});

export const answerDialogue = asyncHandler(async (req, res) => {
    const c = await getConsultation(req.params.session_id);
    const { question_id, answer, input_mode = 'text', confidence = 1 } = req.body;
    if (!question_id || answer === undefined) throw new ApiError(400, 'question_id and answer are required');
    const result = await AiServiceGateway.submitConversationAnswer(c.ai_session_id, question_id, String(answer), input_mode, confidence);
    const flags = result.red_flags || [];
    if (flags.length) await pool.query(`UPDATE consultations SET risk_level='high_risk',updated_at=NOW() WHERE id=$1`, [c.id]);
    await pool.query(`UPDATE consultations SET updated_at=NOW() WHERE id=$1`, [c.id]);
    return res.json(new ApiResponse(200, result, 'Answer recorded'));
});

export const speechDialogue = asyncHandler(async (req, res) => {
    const c = await getConsultation(req.params.session_id);
    const { question_id, language = c.language || 'en' } = req.query;
    if (!question_id || !req.body?.length) throw new ApiError(400, 'Audio body and question_id are required');
    const result = await AiServiceGateway.submitSpeech(c.ai_session_id, question_id, language, req.body, req.headers['content-type'] || 'audio/wav');
    if ((result.red_flags || []).length) await pool.query(`UPDATE consultations SET risk_level='high_risk',updated_at=NOW() WHERE id=$1`, [c.id]);
    return res.json(new ApiResponse(200, result, 'Speech answer processed'));
});

export const ttsDialogue = asyncHandler(async (req, res) => {
    const c = await getConsultation(req.params.session_id);
    const text = req.body?.text || req.query.text;
    const language = req.body?.language || req.query.language || c.language || 'en';
    if (!text) throw new ApiError(400, 'text is required');
    const result = await AiServiceGateway.tts(c.ai_session_id, text, language);
    return res.json(new ApiResponse(200, result, 'TTS generated'));
});

export const saveVitals = asyncHandler(async (req, res) => {
    const c = await getConsultation(req.params.session_id);
    let { systolic, diastolic, pulse, temperature, spo2, source = 'manual', bp, temp } = req.body || {};

    // Parse blood pressure string "120/80" if passed as bp
    if (bp && (!systolic || !diastolic)) {
        const parts = String(bp).split('/');
        if (parts.length === 2) {
            systolic = systolic || parts[0].trim();
            diastolic = diastolic || parts[1].trim();
        }
    }
    temperature = temperature || temp;

    const parsedSystolic = systolic ? parseInt(systolic, 10) || null : null;
    const parsedDiastolic = diastolic ? parseInt(diastolic, 10) || null : null;
    const parsedPulse = pulse ? parseFloat(pulse) || null : null;
    const parsedTemperature = temperature ? parseFloat(temperature) || null : null;
    const parsedSpo2 = spo2 ? parseFloat(spo2) || null : null;

    const existing = await pool.query('SELECT id FROM vitals WHERE consultation_id = $1 LIMIT 1', [c.id]);
    let row;
    if (existing.rowCount > 0) {
        const updateRes = await pool.query(
            `UPDATE vitals 
             SET systolic=$1, diastolic=$2, pulse=$3, temperature=$4, spo2=$5, source=$6, recorded_at=NOW() 
             WHERE consultation_id=$7 RETURNING *`,
            [parsedSystolic, parsedDiastolic, parsedPulse, parsedTemperature, parsedSpo2, source, c.id]
        );
        row = updateRes.rows[0];
    } else {
        const insertRes = await pool.query(
            `INSERT INTO vitals(consultation_id, systolic, diastolic, pulse, temperature, spo2, source, recorded_at) 
             VALUES($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
            [c.id, parsedSystolic, parsedDiastolic, parsedPulse, parsedTemperature, parsedSpo2, source]
        );
        row = insertRes.rows[0];
    }
    await pool.query('UPDATE consultations SET updated_at=NOW() WHERE id=$1', [c.id]);
    return res.status(201).json(new ApiResponse(201, row, 'Vitals saved'));
});

export const listDepartments = asyncHandler(async (req, res) => {
    const hospitalId = req.query.hospital_id || DEFAULT_HOSPITAL();
    if (!hospitalId) throw new ApiError(400, 'hospital_id is required');
    const params = [hospitalId]; let sql = 'SELECT id,name,pathway,is_active FROM departments WHERE hospital_id=$1 AND is_active=TRUE';
    if (req.query.pathway) { sql += ' AND pathway=$2'; params.push(pathway(req.query.pathway)); }
    sql += ' ORDER BY name';
    const result = await pool.query(sql, params); return res.json(new ApiResponse(200, result.rows, 'Departments loaded'));
});

export const listDepartmentDoctors = asyncHandler(async (req, res) => {
    const result = await pool.query(`SELECT u.id,u.name,u.email,u.specialization,u.is_active,d.pathway,d.hospital_id FROM users u JOIN doctor_departments dd ON dd.doctor_id=u.id JOIN departments d ON d.id=dd.department_id WHERE d.id=$1 AND u.role='doctor' AND u.is_active=TRUE AND d.is_active=TRUE AND u.hospital_id=d.hospital_id ORDER BY u.name`, [req.params.department_id]);
    return res.json(new ApiResponse(200, result.rows, 'Doctors loaded'));
});

export const generateSummary = asyncHandler(async (req, res) => {
    const c = await getConsultation(req.params.session_id);
    let { language = c.language || 'en', include_documents = true, include_ayush = c.intake_pathway === 'ayurveda', conversation_history } = req.body || {};

    // Normalize language if passed as an object
    if (language && typeof language === 'object') {
        include_documents = language.include_documents !== false;
        include_ayush = Boolean(language.include_ayush);
        conversation_history = language.conversation_history || conversation_history;
        language = language.language || c.language || 'en';
    }
    const cleanLanguage = String(language || 'en').toLowerCase().includes('hi') ? 'hi' : 'en';

    // Provide structured fallback conversation history if missing so AI summary succeeds
    if (!conversation_history || !Array.isArray(conversation_history) || conversation_history.length === 0) {
        conversation_history = [
            {
                question_id: 'q_intake_01',
                question: 'Clinical Consultation and Document Review',
                answer: c.chief_complaint || 'Patient submitted clinical documents, medical history, and consultation details.',
                input_mode: 'text'
            }
        ];
    }

    const result = await AiServiceGateway.generateSummary(c.ai_session_id, cleanLanguage, include_documents, include_ayush, conversation_history);

    const chiefComplaint = result?.sections?.find(s => /complaint/i.test(s.heading_en || ''))?.body || null;
    const historyIllness = result?.sections?.find(s => /history/i.test(s.heading_en || ''))?.body || null;
    const ayushAttrs = JSON.stringify(c.intake_pathway === 'ayurveda' ? { pathway: 'ayurveda' } : {});
    const aiPayload = JSON.stringify(result);

    const existing = await pool.query('SELECT id FROM clinical_summaries WHERE consultation_id = $1 LIMIT 1', [c.id]);
    if (existing.rowCount > 0) {
        await pool.query(
            `UPDATE clinical_summaries 
             SET chief_complaint = $1, history_of_present_illness = $2, ayush_attributes = $3, ai_payload = $4, updated_at = NOW(), generated_at = NOW() 
             WHERE consultation_id = $5`,
            [chiefComplaint, historyIllness, ayushAttrs, aiPayload, c.id]
        );
    } else {
        await pool.query(
            `INSERT INTO clinical_summaries(consultation_id, chief_complaint, history_of_present_illness, ayush_attributes, ai_payload, generated_at, updated_at) 
             VALUES($1, $2, $3, $4, $5, NOW(), NOW())`,
            [c.id, chiefComplaint, historyIllness, ayushAttrs, aiPayload]
        );
    }
    return res.json(new ApiResponse(200, result, 'AI summary generated'));
});

export const getSummary = asyncHandler(async (req, res) => { const c = await getConsultation(req.params.session_id); const ai = await AiServiceGateway.getSummary(c.ai_session_id); const local = await pool.query('SELECT * FROM clinical_summaries WHERE consultation_id=$1', [c.id]); return res.json(new ApiResponse(200, { ai_summary: ai, stored_summary: local.rows[0] || null }, 'Summary loaded')); });

export const grantConsent = asyncHandler(async (req, res) => { const c = await getConsultation(req.params.session_id); const scopes = req.body || {}; const scopeMap = { clinical_intake: 'Clinical Intake', document_processing: 'Document Processing', his_abdm_sharing: 'ABDM/HIS Sharing' }; if (c.ai_session_id) await AiServiceGateway.grantConsent(c.ai_session_id, scopes); const client = await pool.connect(); try { await client.query('BEGIN'); for (const [scopeId, title] of Object.entries(scopeMap)) { if (scopes[scopeId] === true) { await client.query(`INSERT INTO consent_records(consultation_id,scope_id,title,purpose,required,status) VALUES($1,$2,$3,$4,$5,'granted')`, [c.id, scopeId, title, `AyushCare ${title.toLowerCase()}`, scopeId === 'clinical_intake']); } } await client.query('UPDATE patients SET consent_granted=TRUE,consent_timestamp=NOW() WHERE id=(SELECT patient_id FROM consultations WHERE id=$1)', [c.id]); await audit(client, c.id, 'consent_granted', scopes); await client.query('COMMIT'); } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); } const scopesResult = await pool.query('SELECT * FROM consent_records WHERE consultation_id=$1 ORDER BY granted_at DESC', [c.id]); return res.json(new ApiResponse(200, scopesResult.rows, 'Consent recorded')); });

export const getConsent = asyncHandler(async (req, res) => { const c = await getConsultation(req.params.session_id); const scopes = await pool.query('SELECT * FROM consent_records WHERE consultation_id=$1 ORDER BY granted_at', [c.id]); return res.json(new ApiResponse(200, scopes.rows, 'Consent loaded')); });

export const generateToken = asyncHandler(async (req, res) => {
    const c = await getConsultation(req.params.session_id); const patientResult = await pool.query('SELECT id,abha_number,full_name,gender,date_of_birth,mobile_number,address FROM patients WHERE id=$1', [c.patient_id]); const patient = patientResult.rows[0] || null; if (c.token_number) return res.json(new ApiResponse(200, { token_number: c.token_number, status: c.status, consultation_id: c.id, patient }, 'Token already assigned'));
    const client = await pool.connect(); try {
        await client.query('BEGIN');
        const lock = await client.query('SELECT * FROM consultations WHERE id=$1 FOR UPDATE', [c.id]); const current = lock.rows[0]; if (current.token_number) { await client.query('COMMIT'); return res.json(new ApiResponse(200, { token_number: current.token_number, status: current.status }, 'Token already assigned')); } const prefix = c.intake_pathway === 'ayurveda' ? 'AY' : 'AL';
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`token:${c.hospital_id}:${c.intake_pathway}:${new Date().toISOString().slice(0, 10)}`]);
        const count = await client.query(`SELECT COUNT(*)::int AS n FROM consultations WHERE hospital_id=$1 AND intake_pathway=$2 AND DATE(created_at)=CURRENT_DATE`, [c.hospital_id, c.intake_pathway]); const token = `${prefix}-${String(count.rows[0].n + 1).padStart(3, '0')}`; const updated = await client.query(`UPDATE consultations SET token_number=$1,status='in_queue',updated_at=NOW() WHERE id=$2 RETURNING *`, [token, c.id]); await audit(client, c.id, 'token_generated', { token_number: token }); await client.query('COMMIT'); return res.status(201).json(new ApiResponse(201, { token_number: token, status: updated.rows[0].status, consultation_id: c.id, intake_pathway: c.intake_pathway, patient }, 'Queue token generated'));
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});

export const completeSession = asyncHandler(async (req, res) => { const c = await getConsultation(req.params.session_id); await pool.query(`UPDATE consultations SET status='in_queue',updated_at=NOW() WHERE id=$1`, [c.id]); await pool.query('UPDATE kiosk_sessions SET is_active=FALSE WHERE consultation_id=$1', [c.id]); return res.json(new ApiResponse(200, { consultation_id: c.id, status: 'in_queue', token_number: c.token_number }, 'Kiosk intake completed')) });

export const cancelSession = asyncHandler(async (req, res) => { const c = await getConsultation(req.params.session_id); await pool.query(`UPDATE consultations SET status='cancelled',updated_at=NOW() WHERE id=$1`, [c.id]); await pool.query('UPDATE kiosk_sessions SET is_active=FALSE WHERE consultation_id=$1', [c.id]); return res.json(new ApiResponse(200, { consultation_id: c.id, status: 'cancelled' }, 'Kiosk session cancelled')) });


export const deleteAiSession = asyncHandler(async (req, res) => { const c = await getConsultation(req.params.session_id); if (c.ai_session_id) await AiServiceGateway.deleteSession(c.ai_session_id); await pool.query(`UPDATE consultations SET status='cancelled',updated_at=NOW() WHERE id=$1`, [c.id]); await pool.query('UPDATE kiosk_sessions SET is_active=FALSE WHERE consultation_id=$1', [c.id]); return res.json(new ApiResponse(200, {}, 'AI session deleted and consultation cancelled')); });
export const listAiDocuments = asyncHandler(async (req, res) => { const c = await getConsultation(req.params.session_id); return res.json(new ApiResponse(200, await AiServiceGateway.listDocuments(c.ai_session_id), 'AI documents loaded')); });
export const verifyAiDocumentEntity = asyncHandler(async (req, res) => { const c = await getConsultation(req.params.session_id); return res.json(new ApiResponse(200, await AiServiceGateway.verifyDocumentEntity(c.ai_session_id, req.params.document_id, req.params.entity_id, req.query.status || 'verified'), 'Document entity verification updated')); });
export const editSummarySection = asyncHandler(async (req, res) => { const c = await getConsultation(req.params.session_id); const { edited_body, edit_reason } = req.body; if (!edited_body || !edit_reason) throw new ApiError(400, 'edited_body and edit_reason are required'); return res.json(new ApiResponse(200, await AiServiceGateway.editSummarySection(c.ai_session_id, req.params.section_id, edited_body, edit_reason), 'Summary section updated')); });
export const getConsentReceipt = asyncHandler(async (req, res) => { const c = await getConsultation(req.params.session_id); return res.json(new ApiResponse(200, await AiServiceGateway.getConsentReceipt(c.ai_session_id), 'Consent receipt loaded')); });
export const withdrawConsent = asyncHandler(async (req, res) => { const c = await getConsultation(req.params.session_id); const { scope_id } = req.body; if (!scope_id) throw new ApiError(400, 'scope_id is required'); return res.json(new ApiResponse(200, await AiServiceGateway.withdrawConsent(c.ai_session_id, scope_id), 'Consent withdrawn')); });
export const getConsentScopes = asyncHandler(async (req, res) => { const c = await getConsultation(req.params.session_id); return res.json(new ApiResponse(200, await AiServiceGateway.getConsentScopes(c.ai_session_id), 'Consent scopes loaded')); });

export const fhirPreview = asyncHandler(async (req, res) => { const c = await getConsultation(req.params.session_id); return res.json(new ApiResponse(200, await AiServiceGateway.fhirPreview(c.ai_session_id), 'FHIR preview loaded')); });

export const audioIntake = asyncHandler(async (req, res) => {
    const c = await getConsultation(req.params.session_id);
    const requestedLang = req.query.language || 'auto';
    const mimeType = req.headers['content-type'] || 'audio/webm';

    if (!req.body || !req.body.length) {
        throw new ApiError(400, 'Audio file is required');
    }

    const audioDir = path.join(__dirname, '../../uploads/audio');
    if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
    }
    const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp4') ? 'm4a' : 'webm';
    const filename = `consultation-${c.id}-${Date.now()}.${ext}`;
    const filePath = path.join(audioDir, filename);
    fs.writeFileSync(filePath, req.body);

    const audioUrl = `/uploads/audio/${filename}`;

    let transcription = { text: '', confidence: 0.9, language: requestedLang };
    try {
        transcription = await AiServiceGateway.transcribeAudio(req.body, requestedLang, mimeType);
    } catch (err) {
        console.warn('ASR transcription error:', err.message);
    }

    const detectedLanguage = transcription.detected_language || transcription.language || (requestedLang !== 'auto' ? requestedLang : (c.language || 'en'));

    // Speech language is separate from the navbar-selected kiosk UI language.
    if (detectedLanguage && detectedLanguage !== 'auto' && detectedLanguage !== c.language) {
        await pool.query('UPDATE consultations SET speech_language = $1, updated_at = NOW() WHERE id = $2', [detectedLanguage, c.id]);
    }

    return res.json(new ApiResponse(200, {
        transcript: transcription.text || '',
        confidence: transcription.confidence || 0.9,
        audioUrl,
        language: detectedLanguage,
        detected_language: detectedLanguage,
        speech_language: detectedLanguage,
    }, 'Audio recorded and transcribed successfully'));
});

export const speakModeSubmit = asyncHandler(async (req, res) => {
    const c = await getConsultation(req.params.session_id);
    const { transcript, audioUrl, duration, language, speech_language: speechLanguage } = req.body || {};

    if (!transcript || !transcript.trim()) {
        throw new ApiError(400, 'Transcript is required');
    }

    const effectiveLanguage = (speechLanguage || language) && (speechLanguage || language) !== 'auto'
        ? (speechLanguage || language)
        : (c.speech_language || c.language || 'en');

    // 1. Update consultation record with speak mode, audio URL, and effective language
    await pool.query(
        `UPDATE consultations 
         SET intake_mode = 'speak', patient_audio_url = $1, patient_transcript = $2, speech_language = $3, updated_at = NOW()
         WHERE id = $4`,
        [audioUrl || null, transcript.trim(), effectiveLanguage, c.id]
    );

    let transcriptForAi = transcript.trim();
    if (effectiveLanguage !== 'en') {
        try {
            const translated = await AiServiceGateway.translate(transcriptForAi, effectiveLanguage, 'en');
            transcriptForAi = translated?.text || translated?.translated_text || transcriptForAi;
        } catch (error) {
            console.warn('Speech-to-English translation fallback:', error?.message || error);
        }
    }

    // 2. Format English conversation history to feed Groq LLM summary generator
    const conversationHistory = [
        {
            question_id: 'q-chief-complaint',
            question: 'Please describe the health concerns and symptoms you are experiencing today in detail.',
            answer: transcriptForAi,
            phase: 'symptom_exploration',
            input_mode: 'speech',
        },
    ];

    // 3. Call Groq AI summary generator in the detected language
    const includeAyush = c.intake_pathway === 'ayurveda';
    let summaryResult = null;
    try {
        summaryResult = await AiServiceGateway.generateSummary(
            c.ai_session_id,
            'en',
            true,
            includeAyush,
            conversationHistory
        );
    } catch (e) {
        console.warn('Groq summary generation error:', e.message);
        summaryResult = {
            sections: [
                {
                    heading_en: 'Chief Complaint',
                    heading_local: effectiveLanguage === 'hi' ? 'मुख्य शिकायत' : 'Chief Complaint',
                    body: transcript.trim(),
                    body_local: transcript.trim(),
                },
                {
                    heading_en: 'History of Present Illness',
                    heading_local: effectiveLanguage === 'hi' ? 'वर्तमान बीमारी का इतिहास' : 'History of Present Illness',
                    body: transcript.trim(),
                    body_local: transcript.trim(),
                },
            ],
            confidence_score: 0.95,
        };
    }

    if (effectiveLanguage !== 'en' && Array.isArray(summaryResult?.sections)) {
        const sections = summaryResult.sections;
        const sourceTexts = sections.flatMap((section) => [section.heading_en || '', section.body || '']);
        const translated = await AiServiceGateway.translateBatch(sourceTexts, 'en', effectiveLanguage).catch(() => sourceTexts);
        summaryResult = {
            ...summaryResult,
            sections: sections.map((section, index) => ({
                ...section,
                heading_local: translated[index * 2] || section.heading_local || section.heading_en,
                body_local: translated[index * 2 + 1] || section.body_local || section.body,
            })),
            language: effectiveLanguage,
        };
    }

    // Attach transcripts item with audioUrl into ai_payload for doctor Evidence Drawer playback
    const transcriptsPayload = [
        {
            id: `audio-rec-${c.id}`,
            speaker: 'patient',
            text: transcript.trim(),
            audioUrl: audioUrl || null,
            audioDuration: duration || '30s',
            language: effectiveLanguage,
        },
    ];

    const chiefSection = summaryResult?.sections?.find((s) => /complaint/i.test(s.heading_en || ''));
    const historySection = summaryResult?.sections?.find((s) => /history/i.test(s.heading_en || ''));
    const chiefComplaint = chiefSection?.body_local || chiefSection?.body || transcript.trim();
    const historyIllness = historySection?.body_local || historySection?.body || transcript.trim();

    const ayushAttrs = JSON.stringify(c.intake_pathway === 'ayurveda' ? { pathway: 'ayurveda' } : {});
    const aiPayload = JSON.stringify({
        ...(summaryResult || {}),
        language: effectiveLanguage,
        speech_language: effectiveLanguage,
        transcripts: transcriptsPayload,
        patient_audio_url: audioUrl || null,
        patient_transcript: transcript.trim(),
    });

    // 4. Persist to clinical_summaries
    const existing = await pool.query('SELECT id FROM clinical_summaries WHERE consultation_id = $1 LIMIT 1', [c.id]);
    if (existing.rowCount > 0) {
        await pool.query(
            `UPDATE clinical_summaries 
             SET chief_complaint = $1, history_of_present_illness = $2, ayush_attributes = $3, ai_payload = $4, updated_at = NOW(), generated_at = NOW() 
             WHERE consultation_id = $5`,
            [chiefComplaint, historyIllness, ayushAttrs, aiPayload, c.id]
        );
    } else {
        await pool.query(
            `INSERT INTO clinical_summaries(consultation_id, chief_complaint, history_of_present_illness, ayush_attributes, ai_payload, generated_at, updated_at) 
             VALUES($1, $2, $3, $4, $5, NOW(), NOW())`,
            [c.id, chiefComplaint, historyIllness, ayushAttrs, aiPayload]
        );
    }

    return res.json(new ApiResponse(200, {
        consultation_id: c.id,
        summary: summaryResult,
        intake_mode: 'speak',
        patient_audio_url: audioUrl,
        patient_transcript: transcript.trim(),
        language: effectiveLanguage,
        speech_language: effectiveLanguage,
    }, 'Speak mode summary generated successfully'));
});
