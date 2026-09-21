import { Router } from 'express';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { verifyAdmin } from '../middleware/role.middleware.js';
import {
	getDoctorsList,
	getVisitAnalytics,
	getDepartmentStats,
	getLiveTokenQueue,
	overrideQueue,
	assignDoctorToDepartment,
	getDoctorDepartments
} from '../controllers/admin.controller.js';

const router = Router();

router.use(verifyJWT, verifyAdmin);

router.route("/doctors").get(getDoctorsList);
router.route("/doctors/departments").get(getDoctorDepartments).post(assignDoctorToDepartment);
router.route("/analytics/visits").get(getVisitAnalytics);
router.route("/analytics/department-stats").get(getDepartmentStats);
router.route("/tokens/live-queue").get(getLiveTokenQueue);
router.route("/queue/override").post(overrideQueue);

export default router;