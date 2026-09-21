import { Router } from 'express';
import { performAbhaRegister, lookupPatients, sendSosOtp, verifySosOtp, createKioskSession, createPatientUploadQr, getSession, updateSessionLanguage, startDialogue, getDialogueState, answerDialogue, speechDialogue, ttsDialogue, saveVitals, listDepartments, listDepartmentDoctors, generateSummary, getSummary, editSummarySection, grantConsent, getConsent, getConsentScopes, getConsentReceipt, withdrawConsent, updateConsultationRouting, generateToken, completeSession, cancelSession, deleteAiSession, listAiDocuments, verifyAiDocumentEntity, fhirPreview, integrationHealth, audioIntake, speakModeSubmit } from '../controllers/kiosk.controller.js';
import { rawAudio } from '../middleware/rawAudio.middleware.js';

const router = Router();
router.post('/auth/abha', performAbhaRegister);
router.get('/patients/lookup', lookupPatients);
router.post('/sos/send-otp', sendSosOtp);
router.post('/sos/verify-otp', verifySosOtp);
router.get('/system/health', integrationHealth);
router.post('/session', createKioskSession);
router.get('/session/:session_id', getSession);
router.put('/session/:session_id/language', updateSessionLanguage);
router.put('/session/:session_id/routing', updateConsultationRouting);
router.post('/session/:session_id/dialogue/start', startDialogue);
router.get('/session/:session_id/dialogue/state', getDialogueState);
router.delete('/session/:session_id', deleteAiSession);
router.post('/session/:session_id/dialogue/answer', answerDialogue);
router.post('/session/:session_id/dialogue/speech', rawAudio, speechDialogue);
router.post('/session/:session_id/audio-intake', rawAudio, audioIntake);
router.post('/session/:session_id/speak-mode-submit', speakModeSubmit);
router.post('/session/:session_id/dialogue/tts', ttsDialogue);
router.get('/session/:session_id/dialogue/tts', ttsDialogue);
router.post('/session/:session_id/vitals', saveVitals);
router.get('/session/:session_id/documents', listAiDocuments);
router.put('/session/:session_id/documents/:document_id/entities/:entity_id/verify', verifyAiDocumentEntity);
router.get('/departments', listDepartments);
router.get('/departments/:department_id/doctors', listDepartmentDoctors);
router.post('/session/:session_id/summary/generate', generateSummary);
router.get('/session/:session_id/summary', getSummary);
router.put('/session/:session_id/summary/sections/:section_id', editSummarySection);
router.post('/session/:session_id/consent', grantConsent);
router.get('/session/:session_id/consent', getConsent);
router.get('/session/:session_id/consent/scopes', getConsentScopes);
router.get('/session/:session_id/consent/receipt', getConsentReceipt);
router.post('/session/:session_id/consent/withdraw', withdrawConsent);
router.post('/session/:session_id/token', generateToken);
router.post('/session/:session_id/complete', completeSession);
router.post('/session/:session_id/cancel', cancelSession);
router.get('/session/:session_id/fhir/preview', fhirPreview);
router.post('/session/:session_id/patient-upload-qr', createPatientUploadQr);

// Backward-compatible endpoint used by the first kiosk prototype.
router.post('/dialogue/next', async (req, res, next) => {
    try {
        const { consultationId, answerText, questionId = 'current' } = req.body;
        if (!consultationId) return res.status(400).json({ success: false, message: 'consultationId is required' });
        req.params.session_id = consultationId;
        if (answerText !== undefined) {
            req.body = { question_id: questionId, answer: answerText, input_mode: 'text', confidence: 1 };
            return answerDialogue(req, res, next);
        }
        return getDialogueState(req, res, next);
    } catch (e) { next(e); }
});
export default router;
