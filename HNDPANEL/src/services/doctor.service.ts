import apiClient from '../lib/axios';
import {
  ApiResponse,
  ClinicalSummary,
  ConsultationQueueItem,
  ConsultationStatus,
  UploadedDocument,
} from '../types/api';
import { PrescriptionItem } from '../types/clinical';

export interface PatientHistoryResponse {
  visits: any[];
  documents: UploadedDocument[];
}

export interface ClinicalSummaryUpdate {
  chiefComplaint: string;
  clinicalSummary: string;
  socratesAssessment: Record<string, any>;
}

export const doctorService = {
  getQueue: async (): Promise<ConsultationQueueItem[]> => {
    const response = await apiClient.get<ApiResponse<ConsultationQueueItem[]>>('/doctor/queue');
    return response.data.data;
  },

  getPatientSummary: async (consultationId: string): Promise<ClinicalSummary> => {
    const response = await apiClient.get<ApiResponse<ClinicalSummary>>(`/doctor/patients/${consultationId}/summary`);
    return response.data.data;
  },

  updateClinicalSummary: async (consultationId: string, update: ClinicalSummaryUpdate): Promise<ClinicalSummary> => {
    const response = await apiClient.patch<ApiResponse<ClinicalSummary>>(
      `/doctor/consultations/${consultationId}/clinical-summary`,
      update
    );
    return response.data.data;
  },

  getPatientReports: async (consultationId: string): Promise<UploadedDocument[]> => {
    const response = await apiClient.get<ApiResponse<UploadedDocument[]>>(`/doctor/patients/${consultationId}/reports`);
    return response.data.data;
  },

  getPatientHistory: async (patientId: string): Promise<PatientHistoryResponse> => {
    const response = await apiClient.get<ApiResponse<PatientHistoryResponse>>(`/doctor/patients/${patientId}/history`);
    return response.data.data || { visits: [], documents: [] };
  },

  getConsultationSession: async (consultationId: string): Promise<any> => {
    try {
      const response = await apiClient.get<ApiResponse<any>>(`/intake/session/${consultationId}`);
      return response.data.data;
    } catch {
      try {
        const fallback = await apiClient.get<ApiResponse<any>>(`/kiosk/session/${consultationId}`);
        return fallback.data.data;
      } catch {
        return null;
      }
    }
  },

  updateConsultationStatus: async (consultationId: string, status: ConsultationStatus): Promise<void> => {
    await apiClient.patch<ApiResponse<any>>(`/doctor/consultations/${consultationId}/status`, { status });
  },

  signOffConsultation: async (
    consultationId: string,
    remarks: string,
    prescriptions: PrescriptionItem[] = []
  ): Promise<void> => {
    await apiClient.post<ApiResponse<any>>(`/doctor/consultations/${consultationId}/sign-off`, {
      remarks,
      prescriptions,
    });
  },
};
