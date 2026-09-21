import { ApiResponse } from '../utilities/ApiResponse.js';
import { asyncHandler } from '../utilities/asyncHandler.js';
import pool from '../database/dbConnection.js';
import { ApiError } from '../utilities/ApiError.js';

export const getDoctorsList = asyncHandler(async (req, res) => {
    const doctors = await pool.query(
        'SELECT id, name, email, specialization, is_active FROM users WHERE hospital_id = $1 AND role = \'doctor\'',
        [req.user.hospital_id]
    );
    return res.status(200).json(new ApiResponse(200, doctors.rows, "Doctors retrieved successfully"));
});

export const assignDoctorToDepartment = asyncHandler(async (req, res) => {
    const { doctorId, departmentId } = req.body || {};
    if (!doctorId || !departmentId) throw new ApiError(400, 'doctorId and departmentId are required');
    const doctor = await pool.query(`SELECT id FROM users WHERE id=$1 AND hospital_id=$2 AND role='doctor' AND is_active=TRUE`, [doctorId, req.user.hospital_id]);
    if (!doctor.rowCount) throw new ApiError(404, 'Doctor not found in this hospital');
    const department = await pool.query(`SELECT id FROM departments WHERE id=$1 AND hospital_id=$2 AND is_active=TRUE`, [departmentId, req.user.hospital_id]);
    if (!department.rowCount) throw new ApiError(404, 'Department not found in this hospital');
    const result = await pool.query(`INSERT INTO doctor_departments(doctor_id,department_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING *`, [doctorId, departmentId]);
    return res.status(201).json(new ApiResponse(201, result.rows[0] || { doctor_id: doctorId, department_id: departmentId }, 'Doctor assigned to department'));
});

export const getDoctorDepartments = asyncHandler(async (req, res) => {
    const result = await pool.query(`SELECT dd.doctor_id, d.id AS department_id, d.name, d.pathway FROM doctor_departments dd JOIN departments d ON d.id=dd.department_id JOIN users u ON u.id=dd.doctor_id WHERE u.hospital_id=$1 ORDER BY d.name,u.name`, [req.user.hospital_id]);
    return res.json(new ApiResponse(200, result.rows, 'Doctor department assignments loaded'));
});

export const getVisitAnalytics = asyncHandler(async (req, res) => {
    const result = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE c.created_at >= CURRENT_DATE) AS kiosk_visits,
            COUNT(*) FILTER (WHERE c.token_number IS NOT NULL AND c.created_at >= CURRENT_DATE) AS token_conversions,
            COUNT(*) FILTER (WHERE c.status = 'complete' AND c.created_at >= CURRENT_DATE) AS consultations_completed
         FROM consultations c
         WHERE c.hospital_id = $1`,
        [req.user.hospital_id]
    );
    const row = result.rows[0] || {};
    const stats = {
        kiosk_visits: Number(row.kiosk_visits || 0),
        token_conversions: Number(row.token_conversions || 0),
        consultations_completed: Number(row.consultations_completed || 0),
    };
    return res.status(200).json(new ApiResponse(200, stats, "Analytics data retrieved"));
});

export const getDepartmentStats = asyncHandler(async (req, res) => {
    const requestedRange = String(req.query.timeRange || 'today').toLowerCase();
    const timeRange = ['today', 'yesterday', '7d', '30d'].includes(requestedRange)
        ? requestedRange
        : 'today';

    const rangePredicate = `
        c.created_at >= CASE
            WHEN $1 = 'yesterday' THEN CURRENT_DATE - INTERVAL '1 day'
            WHEN $1 = '7d' THEN NOW() - INTERVAL '7 days'
            WHEN $1 = '30d' THEN NOW() - INTERVAL '30 days'
            ELSE CURRENT_DATE
        END
        AND c.created_at < CASE
            WHEN $1 = 'yesterday' THEN CURRENT_DATE
            ELSE NOW()
        END`;

    const [summaryResult, departmentsResult] = await Promise.all([
        pool.query(
            `SELECT
                COUNT(*) AS total_patient_intake,
                COUNT(*) FILTER (WHERE c.status = 'complete') AS completed_consults,
                COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (
                    COALESCE(c.signed_off_at, c.updated_at, CURRENT_TIMESTAMP) - c.created_at
                )) / 60), 0), 0)::int AS avg_wait_minutes,
                COUNT(*) FILTER (WHERE c.risk_level = 'emergency') AS emergency_triage
             FROM consultations c
             WHERE c.hospital_id = $2
               AND ${rangePredicate}`,
            [timeRange, req.user.hospital_id]
        ),
        pool.query(
            `WITH department_visits AS (
                SELECT
                    c.department_id,
                    COUNT(*) AS total_visits,
                    COUNT(*) FILTER (WHERE c.status = 'complete') AS completed_visits,
                    COUNT(*) FILTER (WHERE c.status IN ('waiting_triage', 'in_queue', 'hold')) AS waiting_queue,
                    COUNT(*) FILTER (WHERE c.status = 'call') AS in_consultation,
                    COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (
                        COALESCE(c.signed_off_at, c.updated_at, CURRENT_TIMESTAMP) - c.created_at
                    )) / 60), 0), 0)::int AS avg_wait_minutes,
                    COUNT(*) FILTER (WHERE c.risk_level = 'emergency') AS emergency_count,
                    COUNT(*) FILTER (WHERE c.risk_level = 'high_risk') AS high_risk_count
                FROM consultations c
                WHERE c.hospital_id = $2
                  AND ${rangePredicate}
                GROUP BY c.department_id
            ), active_clinicians AS (
                SELECT
                    dd.department_id,
                    COUNT(DISTINCT u.id) AS active_doctors
                FROM doctor_departments dd
                JOIN users u ON u.id = dd.doctor_id
                WHERE u.hospital_id = $2
                  AND u.role = 'doctor'
                  AND u.is_active = TRUE
                GROUP BY dd.department_id
            )
            SELECT
                d.id,
                d.name,
                d.pathway,
                COALESCE(d.pathway, 'general') AS category,
                COALESCE(v.total_visits, 0) AS total_visits,
                COALESCE(v.completed_visits, 0) AS completed_visits,
                COALESCE(v.waiting_queue, 0) AS waiting_queue,
                COALESCE(v.in_consultation, 0) AS in_consultation,
                COALESCE(ac.active_doctors, 0) AS active_doctors,
                COALESCE(v.avg_wait_minutes, 0) AS avg_wait_minutes,
                COALESCE(v.emergency_count, 0) AS emergency_count,
                COALESCE(v.high_risk_count, 0) AS high_risk_count
            FROM departments d
            LEFT JOIN department_visits v ON v.department_id = d.id
            LEFT JOIN active_clinicians ac ON ac.department_id = d.id
            WHERE d.hospital_id = $2
              AND d.is_active = TRUE
            ORDER BY total_visits DESC, d.name`,
            [timeRange, req.user.hospital_id]
        ),
    ]);

    const summaryRow = summaryResult.rows[0] || {};
    const toNumber = (value) => Number(value || 0);
    const departments = departmentsResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        pathway: row.category || row.pathway || 'general',
        totalVisits: toNumber(row.total_visits),
        completedVisits: toNumber(row.completed_visits),
        waitingQueue: toNumber(row.waiting_queue),
        inConsultation: toNumber(row.in_consultation),
        activeDoctors: toNumber(row.active_doctors),
        avgWaitMinutes: toNumber(row.avg_wait_minutes),
        emergencyCount: toNumber(row.emergency_count),
        highRiskCount: toNumber(row.high_risk_count),
    }));

    return res.status(200).json(new ApiResponse(200, {
        summary: {
            totalPatientIntake: toNumber(summaryRow.total_patient_intake),
            completedConsults: toNumber(summaryRow.completed_consults),
            avgWaitMinutes: toNumber(summaryRow.avg_wait_minutes),
            emergencyTriage: toNumber(summaryRow.emergency_triage),
        },
        departments,
        timeRange,
    }, 'Department analytics retrieved'));
});

export const getLiveTokenQueue = asyncHandler(async (req, res) => {
    const queue = await pool.query(
        `SELECT
            c.id AS consultation_id,
            c.id,
            c.token_number,
            c.status,
            c.risk_level,
            c.created_at,
            COALESCE(c.signed_off_at, c.updated_at) AS signed_off_at,
            p.id AS patient_id,
            p.full_name,
            p.full_name AS patient_name,
            p.abha_number,
            d.id AS department_id,
            d.name AS department_name,
            u.id AS doctor_id,
            u.name AS doctor_name
         FROM consultations c
         JOIN patients p ON p.id = c.patient_id
         LEFT JOIN departments d ON d.id = c.department_id
         LEFT JOIN users u ON u.id = c.assigned_doctor_id
            WHERE c.hospital_id = $1
             AND c.status <> 'cancelled'
             AND c.created_at >= CURRENT_DATE - INTERVAL '1 day'
         ORDER BY
              CASE WHEN c.risk_level = 'emergency' THEN 0 ELSE 1 END,
            c.created_at DESC`,
        [req.user.hospital_id]
    );
    return res.status(200).json(new ApiResponse(200, queue.rows, 'Live token queue retrieved'));
});

export const overrideQueue = asyncHandler(async (req, res) => {
    const { consultationId, newStatus } = req.body;
    await pool.query('UPDATE consultations SET status = $1 WHERE id = $2', [newStatus, consultationId]);
    return res.status(200).json(new ApiResponse(200, {}, "Queue order overridden successfully"));
});