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

export interface OpenAIResponse {
  success: boolean;
  message: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: string;
}

export interface Question {
  id: string; 
  text: string; 
  category?: string; 
  isAnswered?: boolean;
}

export interface UserResponse {
  questionId: string;
  response: string | boolean | number;
  timestamp: Date;
}
