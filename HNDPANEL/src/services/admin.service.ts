import apiClient from '../lib/axios';
import { ApiResponse, ConsultationQueueItem, ConsultationStatus, Doctor, VisitAnalytics } from '../types/api';

export interface AdminQueueItem extends ConsultationQueueItem {
  consultation_id?: string;
  patient_name?: string;
  department?: string;
  department_name?: string;
  doctor_name?: string;
  signed_off_at?: string;
}

export interface DoctorDepartmentAssignment {
  doctor_id: string;
  department_id: string;
  name: string;
  pathway: string;
}

export interface DepartmentItem {
  id: string;
  hospital_id?: string;
  name: string;
  pathway: 'allopathy' | 'ayurveda' | string;
  is_active?: boolean;
}

export type WeekDay = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export interface DayRosterShift {
  day: WeekDay;
  shift: 'Morning (08:00 - 14:00)' | 'Evening (14:00 - 20:00)' | 'Full Day (09:00 - 17:00)' | 'Night (20:00 - 08:00)' | 'Off Duty';
  room: string;
  isActive: boolean;
}

export interface ExtendedDoctor extends Doctor {
  phone?: string;
  room?: string;
  roster?: DayRosterShift[];
  departmentIds?: string[];
  departments?: string[];
}

export interface DepartmentReport {
  id: string;
  name: string;
  pathway: 'allopathy' | 'ayurveda' | string;
  totalVisits: number;
  completedVisits: number;
  waitingQueue: number;
  inConsultation: number;
  activeDoctors: number;
  avgWaitMinutes: number;
  emergencyCount: number;
  highRiskCount: number;
}

export interface DepartmentAnalyticsResponse {
  summary: {
    totalPatientIntake: number;
    completedConsults: number;
    avgWaitMinutes: number;
    emergencyTriage: number;
  };
  departments: DepartmentReport[];
  timeRange?: 'today' | 'yesterday' | '7d' | '30d';
}

export type DepartmentTimeRange = 'today' | 'yesterday' | '7d' | '30d';

export interface HistoricalVisitRecord {
  id: string;
  tokenNumber: string;
  patientName: string;
  age?: number;
  gender?: string;
  department: string;
  pathway: string;
  doctorName: string;
  riskLevel: 'routine' | 'high_risk' | 'emergency';
  status: ConsultationStatus;
  date: string;
  vitals?: {
    bp?: string;
    pulse?: number;
    spo2?: number;
    temperature?: number;
  };
}

export const CANONICAL_DEPARTMENTS: DepartmentItem[] = [
  { id: 'bb85602e-32bc-4c38-aebd-b1764d1dee4f', name: 'General Medicine', pathway: 'allopathy', is_active: true },
  { id: '0276f34f-9d34-4957-86c9-041d9c6a0ea3', name: 'Cardiology', pathway: 'allopathy', is_active: true },
  { id: '091c7dc2-0d22-41f1-95d2-639765f6c160', name: 'Kayachikitsa', pathway: 'ayurveda', is_active: true },
  { id: '3997db90-64e7-447b-a460-28e80c522fa3', name: 'Panchakarma', pathway: 'ayurveda', is_active: true },
  { id: '79883294-5072-42a6-af2e-9e7f8fe62718', name: 'Shalya Tantra', pathway: 'ayurveda', is_active: true },
  { id: '91a388e4-f7c1-431b-87e5-9d2cfc876323', name: 'Orthopaedics', pathway: 'allopathy', is_active: true },
  { id: 'b0e97895-da0f-40e1-877d-d2e13369ef08', name: 'Pediatrics', pathway: 'allopathy', is_active: true },
  { id: 'b009e956-6d3b-47c5-b56d-b07c0e1c7c9b', name: 'Pulmonology', pathway: 'allopathy', is_active: true },
  { id: 'c2a77472-0d0e-474f-ae8f-661ce07b65f1', name: 'Dermatology', pathway: 'allopathy', is_active: true },
  { id: '2d41e0b7-ff5e-42ce-95b4-987878030e4f', name: 'ENT', pathway: 'allopathy', is_active: true },
];

export const DEFAULT_WEEK_ROSTER: DayRosterShift[] = [
  { day: 'Monday', shift: 'Morning (08:00 - 14:00)', room: 'OPD Room 101', isActive: true },
  { day: 'Tuesday', shift: 'Morning (08:00 - 14:00)', room: 'OPD Room 101', isActive: true },
  { day: 'Wednesday', shift: 'Evening (14:00 - 20:00)', room: 'OPD Room 101', isActive: true },
  { day: 'Thursday', shift: 'Morning (08:00 - 14:00)', room: 'OPD Room 101', isActive: true },
  { day: 'Friday', shift: 'Morning (08:00 - 14:00)', room: 'OPD Room 101', isActive: true },
  { day: 'Saturday', shift: 'Full Day (09:00 - 17:00)', room: 'OPD Room 101', isActive: true },
  { day: 'Sunday', shift: 'Off Duty', room: 'OPD Room 101', isActive: false },
];

const LOCAL_CUSTOM_DOCTORS_KEY = 'ayushcare_admin_custom_doctors';
const LOCAL_ROSTER_KEY = 'ayushcare_admin_rosters';

export const adminService = {
  getDoctors: async (): Promise<ExtendedDoctor[]> => {
    let apiDoctors: Doctor[] = [];
    try {
      const response = await apiClient.get<ApiResponse<Doctor[]>>('/admin/doctors');
      apiDoctors = response.data.data || [];
    } catch {
      apiDoctors = [];
    }

    // Load any locally created doctors or overrides
    let customDoctors: ExtendedDoctor[] = [];
    let rostersMap: Record<string, DayRosterShift[]> = {};
    if (typeof window !== 'undefined') {
      try {
        customDoctors = JSON.parse(localStorage.getItem(LOCAL_CUSTOM_DOCTORS_KEY) || '[]');
        rostersMap = JSON.parse(localStorage.getItem(LOCAL_ROSTER_KEY) || '{}');
      } catch {
        // ignore
      }
    }

    const merged: ExtendedDoctor[] = [...apiDoctors];
    customDoctors.forEach((cd) => {
      const idx = merged.findIndex((d) => d.id === cd.id);
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], ...cd };
      } else {
        merged.push(cd);
      }
    });

    return merged.map((doc: ExtendedDoctor) => ({
      ...doc,
      roster: rostersMap[doc.id] || doc.roster || DEFAULT_WEEK_ROSTER,
      room: doc.room || 'OPD Room 101',
    }));
  },

  createDoctor: async (newDoc: Omit<ExtendedDoctor, 'id'>): Promise<ExtendedDoctor> => {
    const createdDoc: ExtendedDoctor = {
      ...newDoc,
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      is_active: newDoc.is_active ?? true,
      roster: newDoc.roster || DEFAULT_WEEK_ROSTER,
      room: newDoc.room || 'OPD Room 101',
    };

    if (typeof window !== 'undefined') {
      try {
        const existing: ExtendedDoctor[] = JSON.parse(localStorage.getItem(LOCAL_CUSTOM_DOCTORS_KEY) || '[]');
        existing.push(createdDoc);
        localStorage.setItem(LOCAL_CUSTOM_DOCTORS_KEY, JSON.stringify(existing));

        // Save roster
        const rosters = JSON.parse(localStorage.getItem(LOCAL_ROSTER_KEY) || '{}');
        rosters[createdDoc.id] = createdDoc.roster;
        localStorage.setItem(LOCAL_ROSTER_KEY, JSON.stringify(rosters));
      } catch {
        // ignore
      }
    }

    return createdDoc;
  },

  updateDoctorDetails: async (doctorId: string, updates: Partial<ExtendedDoctor>): Promise<void> => {
    if (typeof window !== 'undefined') {
      try {
        const existing: ExtendedDoctor[] = JSON.parse(localStorage.getItem(LOCAL_CUSTOM_DOCTORS_KEY) || '[]');
        const idx = existing.findIndex((d) => d.id === doctorId);
        if (idx >= 0) {
          existing[idx] = { ...existing[idx], ...updates };
        } else {
          existing.push({ id: doctorId, name: updates.name || '', email: updates.email || '', is_active: true, ...updates });
        }
        localStorage.setItem(LOCAL_CUSTOM_DOCTORS_KEY, JSON.stringify(existing));

        if (updates.roster) {
          const rosters = JSON.parse(localStorage.getItem(LOCAL_ROSTER_KEY) || '{}');
          rosters[doctorId] = updates.roster;
          localStorage.setItem(LOCAL_ROSTER_KEY, JSON.stringify(rosters));
        }
      } catch {
        // ignore
      }
    }
  },

  saveDoctorRoster: async (doctorId: string, roster: DayRosterShift[]): Promise<void> => {
    if (typeof window !== 'undefined') {
      try {
        const rosters = JSON.parse(localStorage.getItem(LOCAL_ROSTER_KEY) || '{}');
        rosters[doctorId] = roster;
        localStorage.setItem(LOCAL_ROSTER_KEY, JSON.stringify(rosters));
      } catch {
        // ignore
      }
    }
  },

  getDoctorDepartments: async (): Promise<DoctorDepartmentAssignment[]> => {
    try {
      const response = await apiClient.get<ApiResponse<DoctorDepartmentAssignment[]>>('/admin/doctors/departments');
      return response.data.data || [];
    } catch {
      return [];
    }
  },

  assignDoctorToDepartment: async (doctorId: string, departmentId: string): Promise<any> => {
    const response = await apiClient.post<ApiResponse<any>>('/admin/doctors/departments', {
      doctorId,
      departmentId,
    });
    return response.data.data;
  },

  getDepartments: async (): Promise<DepartmentItem[]> => {
    try {
      // Backend routes kioskRouter under /api/v1/intake
      const response = await apiClient.get<ApiResponse<DepartmentItem[]>>('/intake/departments');
      if (Array.isArray(response.data.data) && response.data.data.length > 0) {
        return response.data.data;
      }
    } catch {
      try {
        const fallback = await apiClient.get<ApiResponse<DepartmentItem[]>>('/kiosk/departments');
        if (Array.isArray(fallback.data.data) && fallback.data.data.length > 0) {
          return fallback.data.data;
        }
      } catch {
        // Fallback to canonical catalog
      }
    }

    return CANONICAL_DEPARTMENTS;
  },

  getVisitAnalytics: async (timeRange: 'today' | 'yesterday' | 'week' | 'month' = 'today'): Promise<VisitAnalytics> => {
    void timeRange;
    const response = await apiClient.get<ApiResponse<VisitAnalytics>>('/admin/analytics/visits');
    return response.data.data || { kiosk_visits: 0, token_conversions: 0, consultations_completed: 0 };
  },

  getDepartmentAnalytics: async (timeRange: DepartmentTimeRange = 'today'): Promise<DepartmentAnalyticsResponse> => {
    const response = await apiClient.get<ApiResponse<DepartmentAnalyticsResponse>>('/admin/analytics/department-stats', {
      params: { timeRange },
    });
    return response.data.data || { summary: { totalPatientIntake: 0, completedConsults: 0, avgWaitMinutes: 0, emergencyTriage: 0 }, departments: [], timeRange };
  },

  getDepartmentReports: async (timeRange: DepartmentTimeRange = 'today'): Promise<DepartmentReport[]> => {
    const response = await adminService.getDepartmentAnalytics(timeRange);
    return response.departments;
  },

  getHistoricalVisits: async (timeRange: 'today' | 'yesterday' | 'week' | 'month' = 'yesterday'): Promise<HistoricalVisitRecord[]> => {
    const now = new Date();
    const targetDate = new Date();
    if (timeRange === 'yesterday') {
      targetDate.setDate(now.getDate() - 1);
    }

    const dateStr = targetDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    const samplePatients = [
      { name: 'Ramesh Kumar', age: 48, gender: 'Male', dept: 'General Medicine', pathway: 'allopathy', doctor: 'Dr. Neha Verma', risk: 'routine', status: 'complete', bp: '128/82', pulse: 74, spo2: 98, temp: 98.4 },
      { name: 'Sunita Devi', age: 54, gender: 'Female', dept: 'Kayachikitsa', pathway: 'ayurveda', doctor: 'Dr. Anand Joshi', risk: 'routine', status: 'complete', bp: '135/86', pulse: 78, spo2: 97, temp: 98.6 },
      { name: 'Vikram Singh', age: 62, gender: 'Male', dept: 'Cardiology', pathway: 'allopathy', doctor: 'Dr. Rajesh Rao', risk: 'high_risk', status: 'complete', bp: '158/98', pulse: 92, spo2: 94, temp: 98.2 },
      { name: 'Priya Sharma', age: 31, gender: 'Female', dept: 'Panchakarma', pathway: 'ayurveda', doctor: 'Dr. Sneha Patel', risk: 'routine', status: 'complete', bp: '118/76', pulse: 72, spo2: 99, temp: 98.5 },
      { name: 'Amit Patel', age: 39, gender: 'Male', dept: 'Orthopaedics', pathway: 'allopathy', doctor: 'Dr. Manoj Sharma', risk: 'routine', status: 'complete', bp: '122/80', pulse: 76, spo2: 98, temp: 98.3 },
      { name: 'Mohammad Tariq', age: 45, gender: 'Male', dept: 'Pulmonology', pathway: 'allopathy', doctor: 'Dr. Neha Verma', risk: 'emergency', status: 'complete', bp: '144/92', pulse: 104, spo2: 89, temp: 100.2 },
      { name: 'Kavita Joshi', age: 29, gender: 'Female', dept: 'Dermatology', pathway: 'allopathy', doctor: 'Dr. Rajesh Rao', risk: 'routine', status: 'complete', bp: '115/75', pulse: 70, spo2: 99, temp: 98.4 },
      { name: 'Harpreet Kaur', age: 52, gender: 'Female', dept: 'Shalya Tantra', pathway: 'ayurveda', doctor: 'Dr. Anand Joshi', risk: 'high_risk', status: 'complete', bp: '140/88', pulse: 82, spo2: 96, temp: 99.1 },
    ];

    return samplePatients.map((p, idx) => ({
      id: `hist-${timeRange}-${idx + 1}`,
      tokenNumber: `OPD-${100 + idx + 1}`,
      patientName: p.name,
      age: p.age,
      gender: p.gender,
      department: p.dept,
      pathway: p.pathway,
      doctorName: p.doctor,
      riskLevel: p.risk as any,
      status: p.status as any,
      date: dateStr,
      vitals: {
        bp: p.bp,
        pulse: p.pulse,
        spo2: p.spo2,
        temperature: p.temp,
      },
    }));
  },

  getQueue: async (): Promise<AdminQueueItem[]> => {
    const response = await apiClient.get<ApiResponse<AdminQueueItem[]>>('/admin/tokens/live-queue');
    return response.data.data || [];
  },

  overrideQueue: async (consultationId: string, newStatus: ConsultationStatus): Promise<void> => {
    await apiClient.post<ApiResponse<any>>('/admin/queue/override', { consultationId, newStatus });
  },
};
