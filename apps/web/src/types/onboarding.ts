export enum Gender {
    FEMALE = 'female',
    MALE = 'male',
    NON_BINARY = 'nonbinary',
    PREFER_NOT_TO_SAY = 'prefer_not',
}

export enum CallTime {
    MORNING = 'morning',
    AFTERNOON = 'afternoon',
    EVENING = 'evening',
}

export enum CallFrequency {
    DAILY = 'daily',
    WEEKLY = 'weekly',
}

export enum EducationLevel {
    NO_FORMAL = 'No formal education',
    PRIMARY = 'Primary school',
    SOME_HIGH_SCHOOL = 'Some high school',
    HIGH_SCHOOL = 'High school diploma',
    COLLEGE_TRADE = 'Some college / trade school',
    BACHELORS = "Bachelor's degree",
    GRADUATE = 'Graduate degree',
}

export enum MemoryConcern {
    YES = 'yes',
    NO = 'no',
    UNSURE = 'unsure',
}

export enum MedicationFrequency {
    ONCE_DAILY = 'Once daily',
    TWICE_DAILY = 'Twice daily',
    THREE_TIMES_DAILY = 'Three times daily',
    AS_NEEDED = 'As needed',
    WEEKLY = 'Weekly',
}

export interface Medication {
    name: string;
    dosage: string;
    frequency: string;
}

export interface EmergencyContact {
    name: string;
    phone: string;
    email?: string;
    relationship?: string;
    notifyOnMissedCall: boolean;
}

export interface OnboardingData {
    // Step 1: Profile
    fullName?: string;
    dateOfBirth?: string;
    gender?: string;
    phone?: string;
    language?: string;
    email?: string;

    // Step 2: Preferences
    callTime?: string;
    callFrequency?: string;
    interests?: string;
    dislikes?: string;

    // Step 3: Health
    conditions?: string[];
    medications?: Medication[];

    // Step 4: Cognitive
    educationLevel?: string;
    memoryConcerns?: string;
    cognitiveChecksEnabled?: boolean;
    communicationStyle?: string;

    // Step 5: Observations
    observations?: ObservationAnswers;

    // Step 6: Emergency
    emergencyContact?: EmergencyContact;

    // Step 7: Activation
    grantDashboardAccess?: 'yes' | 'no';
    elderlyEmail?: string;
}

export interface ObservationAnswers {
    q1?: string;
    q2?: string;
    q3?: string;
    q4?: string;
    q5?: string;
    q6?: string;
    q7?: string;
    otherNotes?: string;
    changeOnset?: string;
}

export enum ChangeLevel {
    NO_CHANGE = 'no_change',
    SLIGHT = 'slight_change',
    NOTICEABLE = 'noticeable_change',
    BIG = 'big_change',
}

export const CHANGE_LEVEL_LABELS: Record<ChangeLevel, string> = {
    [ChangeLevel.NO_CHANGE]: 'No change',
    [ChangeLevel.SLIGHT]: 'Slight',
    [ChangeLevel.NOTICEABLE]: 'Noticeable',
    [ChangeLevel.BIG]: 'Big change',
};

export const OBSERVATION_QUESTIONS = [
    { key: 'q1', label: 'Remembering things about family and friends' },
    { key: 'q2', label: 'Remembering things that happened recently' },
    { key: 'q3', label: 'Recalling conversations a few days later' },
    { key: 'q4', label: 'Knowing what day and month it is' },
    { key: 'q5', label: 'Finding their way around familiar places' },
    { key: 'q6', label: 'Using familiar everyday items (phone, appliances)' },
    { key: 'q7', label: 'Managing everyday tasks independently' },
] as const;

export const INTEREST_SUGGESTIONS = [
    'Family', 'Gardening', 'Music', 'Sports', 'Cooking', 'Travel',
    'Books', 'History', 'Nature', 'Faith',
];

export const SUGGESTED_CONDITIONS = [
    'Diabetes', 'Hypertension', 'Arthritis', 'Heart disease',
    'Dementia', 'Depression', 'Osteoporosis', 'COPD',
];

export const EMERGENCY_RELATIONSHIPS = [
    'Spouse / Partner', 'Son', 'Daughter', 'Sibling',
    'Friend', 'Neighbour', 'Other family member', 'Professional carer',
];

export const CALL_TIME_OPTIONS = [
    { value: CallTime.MORNING, label: 'Morning', sub: '8 am – 12 pm' },
    { value: CallTime.AFTERNOON, label: 'Afternoon', sub: '12 pm – 5 pm' },
    { value: CallTime.EVENING, label: 'Evening', sub: '5 pm – 8 pm' },
] as const;
