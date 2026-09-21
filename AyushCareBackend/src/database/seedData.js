import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from './dbConnection.js';
import { initializeSchema } from './initSchema.js';

const departments = [
    { name: 'General Medicine', pathway: 'allopathy' },
    { name: 'Cardiology', pathway: 'allopathy' },
    { name: 'Kayachikitsa', pathway: 'ayurveda' },
    { name: 'Shalya Tantra', pathway: 'ayurveda' },
];

const patients = [
    ['Aarav Sharma', 'Male', '1990-04-12', '919900000001'],
    ['Aditi Verma', 'Female', '1987-08-21', '919900000002'],
    ['Rohan Mehta', 'Male', '1978-02-15', '919900000003'],
    ['Meera Iyer', 'Female', '1994-11-03', '919900000004'],
    ['Kabir Singh', 'Male', '1968-06-27', '919900000005'],
    ['Nisha Patel', 'Female', '1982-01-19', '919900000006'],
    ['Vivek Rao', 'Male', '1975-09-30', '919900000007'],
    ['Ananya Joshi', 'Female', '1999-03-08', '919900000008'],
    ['Sanjay Kumar', 'Male', '1962-12-14', '919900000009'],
    ['Pooja Nair', 'Female', '1991-07-06', '919900000010'],
    ['Aman Khan', 'Male', '1989-05-25', '919900000011'],
    ['Ishita Das', 'Female', '2001-10-18', '919900000012'],
];

const consultationSeeds = [
    { patient: 0, department: 'General Medicine', doctor: 'seed.general', token: 'AL-001', status: 'in_queue', risk: 'routine' },
    { patient: 1, department: 'General Medicine', doctor: 'seed.general', token: 'AL-002', status: 'waiting_triage', risk: 'routine' },
    { patient: 2, department: 'Cardiology', doctor: 'seed.cardiology', token: 'CA-001', status: 'call', risk: 'high_risk' },
    { patient: 3, department: 'Kayachikitsa', doctor: 'seed.kayachikitsa', token: 'KA-001', status: 'in_queue', risk: 'routine' },
    { patient: 4, department: 'Cardiology', doctor: 'seed.cardiology', token: 'CA-002', status: 'complete', risk: 'routine' },
    { patient: 5, department: 'Shalya Tantra', doctor: 'seed.shalya', token: 'ST-001', status: 'waiting_triage', risk: 'routine' },
    { patient: 6, department: 'General Medicine', doctor: 'seed.general', token: 'AL-003', status: 'complete', risk: 'high_risk' },
    { patient: 7, department: 'Kayachikitsa', doctor: 'seed.kayachikitsa', token: 'KA-002', status: 'in_queue', risk: 'routine' },
    { patient: 8, department: 'Cardiology', doctor: 'seed.cardiology', token: 'SOS-101', status: 'in_queue', risk: 'emergency' },
    { patient: 9, department: 'General Medicine', doctor: 'seed.general', token: 'AL-004', status: 'complete', risk: 'routine' },
    { patient: 10, department: 'General Medicine', doctor: 'seed.general', token: 'AL-005', status: 'in_queue', risk: 'emergency' },
    { patient: 11, department: 'Shalya Tantra', doctor: 'seed.shalya', token: 'ST-002', status: 'call', risk: 'high_risk' },
];

const doctorSeeds = [
    { username: 'seed.general', name: 'Dr. Anika Rao', specialization: 'General Medicine', department: 'General Medicine' },
    { username: 'seed.cardiology', name: 'Dr. Vikram Shah', specialization: 'Cardiology', department: 'Cardiology' },
    { username: 'seed.kayachikitsa', name: 'Dr. Kavya Nair', specialization: 'Kayachikitsa', department: 'Kayachikitsa' },
    { username: 'seed.shalya', name: 'Dr. Arjun Menon', specialization: 'Shalya Tantra', department: 'Shalya Tantra' },
];

const getOrCreateHospital = async (client) => {
    const existing = await client.query('SELECT id FROM hospitals ORDER BY created_at ASC LIMIT 1');
    if (existing.rowCount) return existing.rows[0].id;
    const created = await client.query(
        `INSERT INTO hospitals (name, state_code) VALUES ('AyushCare Demo Hospital', 'DL') RETURNING id`,
    );
    return created.rows[0].id;
};

const getOrCreateDepartment = async (client, hospitalId, department) => {
    const existing = await client.query(
        `SELECT id FROM departments WHERE hospital_id = $1 AND name = $2 LIMIT 1`,
        [hospitalId, department.name],
    );
    if (existing.rowCount) {
        await client.query(
            `UPDATE departments SET pathway = $1, is_active = TRUE WHERE id = $2`,
            [department.pathway, existing.rows[0].id],
        );
        return existing.rows[0].id;
    }
    const created = await client.query(
        `INSERT INTO departments (hospital_id, name, pathway, is_active)
         VALUES ($1, $2, $3, TRUE) RETURNING id`,
        [hospitalId, department.name, department.pathway],
    );
    return created.rows[0].id;
};

const getOrCreateDoctor = async (client, hospitalId, doctor, departmentId, passwordHash) => {
    const result = await client.query(
        `INSERT INTO users (hospital_id, name, email, password_hash, role, specialization, is_active)
         VALUES ($1, $2, $3, $4, 'doctor', $5, TRUE)
         ON CONFLICT (email) DO UPDATE SET
            hospital_id = EXCLUDED.hospital_id,
            name = EXCLUDED.name,
            specialization = EXCLUDED.specialization,
            is_active = TRUE
         RETURNING id`,
        [hospitalId, doctor.name, `${doctor.username}@demo.ayushcare.local`, passwordHash, doctor.specialization],
    );
    const doctorId = result.rows[0].id;
    await client.query(
        `INSERT INTO doctor_departments (doctor_id, department_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [doctorId, departmentId],
    );
    return doctorId;
};

const getOrCreatePatient = async (client, patient) => {
    const result = await client.query(
        `INSERT INTO patients
            (full_name, gender, date_of_birth, mobile_number, abha_number, registration_type, consent_granted, consent_timestamp)
         VALUES ($1, $2, $3, $4, $5, 'seed', TRUE, CURRENT_TIMESTAMP)
         ON CONFLICT (abha_number) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            gender = EXCLUDED.gender,
            date_of_birth = EXCLUDED.date_of_birth,
            mobile_number = EXCLUDED.mobile_number,
            consent_granted = TRUE,
            consent_timestamp = COALESCE(patients.consent_timestamp, CURRENT_TIMESTAMP)
         RETURNING id`,
        [patient[0], patient[1], patient[2], patient[3], `IN-${patient[3].slice(-12)}`],
    );
    return result.rows[0].id;
};

const seed = async () => {
    await initializeSchema();
    // Older installations may have created risk_level before emergency was introduced.
    // Run this outside the seed transaction so the new enum value is immediately usable.
    await pool.query(`ALTER TYPE risk_level ADD VALUE IF NOT EXISTS 'emergency'`);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const hospitalId = await getOrCreateHospital(client);
        const departmentIds = new Map();
        for (const department of departments) {
            departmentIds.set(department.name, await getOrCreateDepartment(client, hospitalId, department));
        }

        const passwordHash = await bcrypt.hash('SeedDoctor@123', 10);
        const doctorIds = new Map();
        for (const doctor of doctorSeeds) {
            doctorIds.set(
                doctor.username,
                await getOrCreateDoctor(client, hospitalId, doctor, departmentIds.get(doctor.department), passwordHash),
            );
        }

        const patientIds = [];
        for (const patient of patients) {
            patientIds.push(await getOrCreatePatient(client, patient));
        }

        let inserted = 0;
        for (const consultation of consultationSeeds) {
            const doctorId = doctorIds.get(consultation.doctor);
            const departmentId = departmentIds.get(consultation.department);
            const existing = await client.query(
                `SELECT id FROM consultations
                 WHERE hospital_id = $1 AND token_number = $2 AND created_at >= CURRENT_DATE
                 LIMIT 1`,
                [hospitalId, consultation.token],
            );
            if (existing.rowCount) continue;

            const created = await client.query(
                `INSERT INTO consultations
                    (hospital_id, patient_id, department_id, assigned_doctor_id, token_number,
                     status, risk_level, intake_pathway, language, remarks, created_at, updated_at, signed_off_at, prescriptions)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'en', $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
                    CASE WHEN $6::consultation_status = 'complete' THEN CURRENT_TIMESTAMP ELSE NULL END, '[]'::jsonb)
                 RETURNING id`,
                [
                    hospitalId,
                    patientIds[consultation.patient],
                    departmentId,
                    doctorId,
                    consultation.token,
                    consultation.status,
                    consultation.risk,
                    consultation.department === 'Kayachikitsa' || consultation.department === 'Shalya Tantra' ? 'ayurveda' : 'allopathy',
                    consultation.risk === 'emergency' ? 'Seed SOS emergency consultation' : 'Seed consultation for Admin Panel verification',
                ],
            );

            if (consultation.status === 'complete') {
                await client.query(
                    `INSERT INTO clinical_summaries (consultation_id, chief_complaint, history_of_present_illness, medications)
                     VALUES ($1, $2, $3, '[]'::jsonb)
                     ON CONFLICT (consultation_id) DO NOTHING`,
                    [created.rows[0].id, 'Routine follow-up', 'Seeded completed consultation for demo verification'],
                );
            }
            inserted += 1;
        }

        await client.query('COMMIT');
        console.log(`Seed complete: ${departments.length} departments, ${patients.length} patients, ${inserted} new consultations.`);
        console.log('Seed doctor password: SeedDoctor@123');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Seed failed:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
};

seed().catch(() => process.exit(1));
