export type OnboardingInfo = {
  name?: string;
  age?: number;
  location?: string;
  caregiverName?: string;
  medicationSchedule?: string;
  emergencyContact?: string;
};

export interface TwilioMediaMessage {
  event: string;
  media?: { payload: string };
  mark?: any;
  streamSid?: string;
}
