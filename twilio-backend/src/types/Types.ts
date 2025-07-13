import { Gender, Relationship, CheckInFrequency, Severity, HealthCategory, MedicationCategory } from '../../../generated/prisma'

export interface BasicInfo {
  fullName?: string;
  age?: number;
  phoneNumber?: string;
  gender?: Gender;
  preferredCheckInTime?: string;
  checkInFrequency?: CheckInFrequency;
}

// ElevenLabs webhook types
export interface ElevenLabsWebhookRequest {
  function_name: string;
  parameters: Record<string, any>;
  conversation_id: string;
}

export interface ElevenLabsWebhookResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export interface EmergencyContactData {
  name: string;
  phoneNumber: string;
  relationship: Relationship;
  userId: string;
  email?: string;
  isPrimary?: boolean;
  address?: string;
  notes?: string;
}

export interface HealthConditionData {
  name: string;
  category: HealthCategory;
  description?: string;
}

export interface UserHealthConditionData {
  userId: string;
  healthConditionId: string;
  severity?: Severity;
  diagnosedAt?: Date;
  notes?: string;
  isActive?: boolean;
}

export interface MedicationData {
  name: string;
  genericName?: string;
  category: MedicationCategory;
}

export interface UserMedicationData {
  userId: string;
  medicationId: string;
  dosage: string;
  frequency: string;
  startedAt?: Date;
  endedAt?: Date;
  prescriber?: string;
  notes?: string;
  isActive?: boolean;
}
