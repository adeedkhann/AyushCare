import pool from './dbConnection.js';

const addColumn = async (client, table, column, definition) => {
    await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
};

export const initializeSchema = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
        await client.query(`DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN CREATE TYPE user_role AS ENUM ('hospital_admin','doctor'); END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consultation_status') THEN CREATE TYPE consultation_status AS ENUM ('waiting_triage','in_queue','call','hold','complete','cancelled'); END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_level') THEN CREATE TYPE risk_level AS ENUM ('routine','high_risk','emergency'); END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_status') THEN CREATE TYPE document_status AS ENUM ('pending','processing','completed','failed','deleted'); END IF;
        END $$;`);

        await client.query(`CREATE TABLE IF NOT EXISTS hospitals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, state_code VARCHAR(10) NOT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id UUID REFERENCES hospitals(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL, email VARCHAR(255) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL,
            role user_role NOT NULL, specialization VARCHAR(100), is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS patients (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), abha_number VARCHAR(17) UNIQUE, abha_address VARCHAR(100) UNIQUE,
            full_name VARCHAR(255) NOT NULL, gender VARCHAR(20) NOT NULL, date_of_birth DATE NOT NULL, mobile_number VARCHAR(15), address TEXT, aadhaar_number VARCHAR(12), registration_type VARCHAR(20) DEFAULT 'new',
            consent_granted BOOLEAN DEFAULT FALSE, consent_timestamp TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS sos_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            kiosk_id VARCHAR(100) NOT NULL DEFAULT 'KIOSK-MAIN-01', invoked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            verification_method VARCHAR(20) NOT NULL, metadata JSONB DEFAULT '{}'
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS departments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id UUID REFERENCES hospitals(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL, pathway VARCHAR(30) NOT NULL DEFAULT 'allopathy', is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, UNIQUE(hospital_id,name)
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS doctor_departments (
            doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (doctor_id, department_id)
        );`);

        await client.query(`CREATE TABLE IF NOT EXISTS consultations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id UUID REFERENCES hospitals(id) ON DELETE CASCADE,
            patient_id UUID REFERENCES patients(id) ON DELETE CASCADE, department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
            assigned_doctor_id UUID REFERENCES users(id) ON DELETE SET NULL, token_number VARCHAR(20), status consultation_status DEFAULT 'waiting_triage',
            risk_level risk_level DEFAULT 'routine', intake_pathway VARCHAR(30) NOT NULL DEFAULT 'general', language VARCHAR(20) DEFAULT 'en', speech_language VARCHAR(20),
            ai_session_id VARCHAR(100), remarks TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS clinical_summaries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), consultation_id UUID UNIQUE REFERENCES consultations(id) ON DELETE CASCADE,
            chief_complaint TEXT, history_of_present_illness TEXT, past_medical_history JSONB DEFAULT '[]', drug_allergies JSONB DEFAULT '[]',
            medications JSONB DEFAULT '[]', ayush_attributes JSONB DEFAULT '{}', ai_payload JSONB DEFAULT '{}', generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS uploaded_documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), consultation_id UUID REFERENCES consultations(id) ON DELETE CASCADE,
            file_path_hash VARCHAR(512) NOT NULL, document_type VARCHAR(100), page_number INT, total_pages INT,
            extracted_data JSONB DEFAULT '{}', status document_status DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS kiosk_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), pairing_token VARCHAR(255) UNIQUE NOT NULL, kiosk_id VARCHAR(100) NOT NULL,
            consultation_id UUID REFERENCES consultations(id) ON DELETE CASCADE, is_active BOOLEAN DEFAULT TRUE,
            expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS patient_qr_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_hash VARCHAR(64) UNIQUE NOT NULL,
            patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            consultation_id UUID REFERENCES consultations(id) ON DELETE CASCADE,
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_patient_qr_token_active ON patient_qr_tokens(token_hash, expires_at) WHERE used_at IS NULL;`);

        await client.query(`CREATE TABLE IF NOT EXISTS vitals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), consultation_id UUID UNIQUE REFERENCES consultations(id) ON DELETE CASCADE,
            systolic INT, diastolic INT, pulse NUMERIC(6,2), temperature NUMERIC(5,2), spo2 NUMERIC(5,2), source VARCHAR(50) DEFAULT 'manual', recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS consent_records (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), consultation_id UUID REFERENCES consultations(id) ON DELETE CASCADE,
            scope_id VARCHAR(100) NOT NULL, title TEXT NOT NULL, purpose TEXT, required BOOLEAN DEFAULT FALSE,
            status VARCHAR(30) NOT NULL DEFAULT 'granted', granted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, withdrawn_at TIMESTAMPTZ
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS patient_privacy_rules (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            scope_type VARCHAR(20) NOT NULL CHECK (scope_type IN ('hospital','visit','document')),
            hospital_id UUID REFERENCES hospitals(id) ON DELETE CASCADE,
            consultation_id UUID REFERENCES consultations(id) ON DELETE CASCADE,
            document_id UUID REFERENCES uploaded_documents(id) ON DELETE CASCADE,
            allow_doctor_access BOOLEAN NOT NULL DEFAULT TRUE,
            reason TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT patient_privacy_scope_target CHECK (
                (scope_type='hospital' AND hospital_id IS NOT NULL AND consultation_id IS NULL AND document_id IS NULL) OR
                (scope_type='visit' AND consultation_id IS NOT NULL AND document_id IS NULL) OR
                (scope_type='document' AND document_id IS NOT NULL)
            )
        );`);

        await client.query(`CREATE TABLE IF NOT EXISTS audit_events (
            id BIGSERIAL PRIMARY KEY, consultation_id UUID REFERENCES consultations(id) ON DELETE SET NULL, actor_type VARCHAR(30) NOT NULL,
            actor_id UUID, event_type VARCHAR(100) NOT NULL, metadata JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS privacy_settings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), patient_id UUID UNIQUE REFERENCES patients(id) ON DELETE CASCADE,
            isolate_past_history BOOLEAN DEFAULT FALSE, consent_voice_processing BOOLEAN DEFAULT TRUE, lock_diagnosis BOOLEAN DEFAULT FALSE, lock_visits BOOLEAN DEFAULT FALSE, lock_reports BOOLEAN DEFAULT FALSE, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`);

        await addColumn(client, 'privacy_settings', 'lock_diagnosis', 'BOOLEAN DEFAULT FALSE');
        await addColumn(client, 'privacy_settings', 'lock_visits', 'BOOLEAN DEFAULT FALSE');
        await addColumn(client, 'privacy_settings', 'lock_reports', 'BOOLEAN DEFAULT FALSE');
        await addColumn(client, 'privacy_settings', 'share_previous_departments', 'BOOLEAN DEFAULT TRUE');
        await addColumn(client, 'privacy_settings', 'share_previous_reports', 'BOOLEAN DEFAULT TRUE');
        await addColumn(client, 'privacy_settings', 'share_previous_appointments', 'BOOLEAN DEFAULT TRUE');
        await client.query(`DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='consent_records' AND column_name='granted') THEN
                ALTER TABLE consent_records ALTER COLUMN granted SET DEFAULT TRUE;
            END IF;
        END $$;`);



        // Safe upgrades for databases created by previous backend versions.
        // CREATE TABLE IF NOT EXISTS does not upgrade an existing table, so every
        // column used by current controllers is explicitly added below.
        await addColumn(client, 'consent_records', 'title', 'TEXT');
        await addColumn(client, 'consent_records', 'purpose', 'TEXT');
        await addColumn(client, 'consent_records', 'required', 'BOOLEAN DEFAULT FALSE');
        await addColumn(client, 'consent_records', 'status', "VARCHAR(30) DEFAULT 'granted'");
        await client.query(`UPDATE consent_records SET title=COALESCE(title, scope_id), purpose=COALESCE(purpose,'AyushCare consent'), required=COALESCE(required,FALSE), status=COALESCE(status,CASE WHEN granted THEN 'granted' ELSE 'withdrawn' END) WHERE title IS NULL OR purpose IS NULL OR required IS NULL OR status IS NULL;`);
        await client.query(`ALTER TABLE consent_records ALTER COLUMN title SET DEFAULT 'Consent';`);
        await client.query(`ALTER TABLE consent_records ALTER COLUMN status SET DEFAULT 'granted';`);
        await client.query(`ALTER TABLE consent_records ALTER COLUMN title SET NOT NULL;`);
        await client.query(`ALTER TABLE consent_records ALTER COLUMN status SET NOT NULL;`);
        await addColumn(client, 'consultations', 'assigned_doctor_id', 'UUID REFERENCES users(id) ON DELETE SET NULL');
        await addColumn(client, 'uploaded_documents', 'file_path_hash', 'VARCHAR(512)');
        await addColumn(client, 'uploaded_documents', 'document_type', 'VARCHAR(100)');
        await addColumn(client, 'uploaded_documents', 'extracted_data', "JSONB DEFAULT '{}'");
        await addColumn(client, 'uploaded_documents', 'status', "VARCHAR(30) DEFAULT 'pending'");
        await addColumn(client, 'uploaded_documents', 'created_at', 'TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP');
        await client.query(`UPDATE uploaded_documents SET file_path_hash=COALESCE(file_path_hash,'legacy/unknown') WHERE file_path_hash IS NULL;`);
        await client.query(`ALTER TABLE uploaded_documents ALTER COLUMN file_path_hash SET NOT NULL;`);
        await addColumn(client, 'kiosk_sessions', 'pairing_token', 'VARCHAR(255)');
        await addColumn(client, 'kiosk_sessions', 'kiosk_id', "VARCHAR(100) DEFAULT 'KIOSK-MAIN-01'");
        await addColumn(client, 'kiosk_sessions', 'consultation_id', 'UUID REFERENCES consultations(id) ON DELETE CASCADE');
        await addColumn(client, 'kiosk_sessions', 'is_active', 'BOOLEAN DEFAULT TRUE');
        await addColumn(client, 'kiosk_sessions', 'expires_at', 'TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP');

        await addColumn(client, 'patients', 'address', 'TEXT');
        await addColumn(client, 'patients', 'aadhaar_number', 'VARCHAR(12)');
        await addColumn(client, 'patients', 'registration_type', "VARCHAR(20) DEFAULT 'new'");
        await client.query(`CREATE INDEX IF NOT EXISTS idx_patients_mobile ON patients(mobile_number);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_patients_aadhaar ON patients(aadhaar_number);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_sos_events_patient_time ON sos_events(patient_id, invoked_at DESC);`);

        await addColumn(client, 'consultations', 'department_id', 'UUID REFERENCES departments(id) ON DELETE SET NULL');
        await addColumn(client, 'consultations', 'intake_pathway', "VARCHAR(30) NOT NULL DEFAULT 'general'");
        await addColumn(client, 'consultations', 'intake_mode', "VARCHAR(30) DEFAULT 'interview'");
        await addColumn(client, 'consultations', 'patient_audio_url', 'TEXT');
        await addColumn(client, 'consultations', 'patient_transcript', 'TEXT');
        await addColumn(client, 'consultations', 'language', "VARCHAR(20) DEFAULT 'en'");
        await addColumn(client, 'consultations', 'speech_language', 'VARCHAR(20)');
        await addColumn(client, 'consultations', 'ai_session_id', 'VARCHAR(100)');
        await addColumn(client, 'consultations', 'updated_at', 'TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP');
        await addColumn(client, 'consultations', 'token_number', 'VARCHAR(20)');
        // These upgrades run in the startup transaction and are safe for both
        // existing installations and databases created by older backend versions.
        await addColumn(client, 'consultations', 'prescriptions', "JSONB DEFAULT '[]'::jsonb");
        await addColumn(client, 'consultations', 'signed_off_at', 'TIMESTAMPTZ');
        await addColumn(client, 'sos_events', 'consultation_id', 'UUID REFERENCES consultations(id) ON DELETE SET NULL');
        await addColumn(client, 'sos_events', 'reason', 'VARCHAR(255)');
        await addColumn(client, 'sos_events', 'status', "VARCHAR(50) DEFAULT 'active'");
        await client.query(`ALTER TABLE consultations ALTER COLUMN token_number DROP NOT NULL`);
        await client.query(`ALTER TABLE clinical_summaries ALTER COLUMN chief_complaint DROP NOT NULL`);
        await addColumn(client, 'uploaded_documents', 'page_number', 'INT');
        await addColumn(client, 'uploaded_documents', 'processing_error', 'TEXT');
        await addColumn(client, 'uploaded_documents', 'source_mime_type', 'VARCHAR(100)');
        await addColumn(client, 'uploaded_documents', 'total_pages', 'INT');
        await addColumn(client, 'uploaded_documents', 'document_url', 'TEXT');
        await addColumn(client, 'uploaded_documents', 'updated_at', 'TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP');
        await addColumn(client, 'clinical_summaries', 'medications', "JSONB DEFAULT '[]'");
        await addColumn(client, 'clinical_summaries', 'ai_payload', "JSONB DEFAULT '{}'");
        await addColumn(client, 'clinical_summaries', 'updated_at', 'TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP');

        await client.query(`CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations(patient_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_consultations_queue ON consultations(hospital_id,status,created_at);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_consultations_signed_off ON consultations(assigned_doctor_id,status,signed_off_at);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_documents_consultation ON uploaded_documents(consultation_id,created_at);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_kiosk_pairing ON kiosk_sessions(pairing_token) WHERE is_active = TRUE;`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_privacy_patient ON privacy_settings(patient_id);`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_abha_number ON patients(abha_number) WHERE abha_number IS NOT NULL;`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_doctor_departments_department ON doctor_departments(department_id,doctor_id);`);
        // Preserve sensible legacy routing by auto-linking doctors to departments whose names match their specialization.
        await client.query(`INSERT INTO doctor_departments(doctor_id,department_id)
            SELECT u.id,d.id FROM users u JOIN departments d ON d.hospital_id=u.hospital_id
            WHERE u.role='doctor' AND u.is_active=TRUE AND d.is_active=TRUE AND u.specialization IS NOT NULL
              AND (LOWER(d.name)=LOWER(u.specialization) OR LOWER(d.name) LIKE '%'||LOWER(u.specialization)||'%' OR LOWER(u.specialization) LIKE '%'||LOWER(d.name)||'%')
            ON CONFLICT DO NOTHING`);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_patient_privacy_rules_patient ON patient_privacy_rules(patient_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_patient_privacy_rules_hospital ON patient_privacy_rules(patient_id,hospital_id) WHERE scope_type='hospital';`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_patient_privacy_rules_visit ON patient_privacy_rules(patient_id,consultation_id) WHERE scope_type='visit';`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_patient_privacy_rules_document ON patient_privacy_rules(patient_id,document_id) WHERE scope_type='document';`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_summaries_consultation ON clinical_summaries(consultation_id);`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vitals_consultation ON vitals(consultation_id);`);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error initializing schema:', error);
        throw error;
    } finally { client.release(); }
};
