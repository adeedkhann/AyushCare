import { Router } from 'express';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { getDoctorQueue, getPatientSummary, getPatientReports, getPatientHistory, updateConsultationStatus, updateClinicalSummary, signOffConsultation } from '../controllers/doctor.controller.js';

const router = Router();

router.use(verifyJWT);

router.route("/queue").get(getDoctorQueue);
router.route("/patients/:id/summary").get(getPatientSummary);
router.route("/patients/:id/reports").get(getPatientReports);
router.route("/patients/:patientId/history").get(getPatientHistory);
router.route("/consultations/:id/status").patch(updateConsultationStatus);
router.route("/consultations/:id/clinical-summary").patch(updateClinicalSummary);
router.route("/consultations/:id/sign-off").post(signOffConsultation);

export default router;