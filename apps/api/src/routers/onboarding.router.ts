import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { caregiverProcedure, router } from '../trpc/init.js';
import { UserRepository, TrustedContactRepository } from '@naiber/shared-data';

const medicationScheduleSchema = z.object({
    timesPerDay: z.number().int().positive().optional(),
    perWeek: z.number().int().min(1).max(7).optional(),
    intervalDays: z.number().int().positive().optional(),
    prn: z.boolean().optional(),
});

const medicationSchema = z.object({
    name: z.string().min(1),
    dosage: z.string().min(1),
    frequency: medicationScheduleSchema,
});

const emergencyContactSchema = z.object({
    name: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email().optional(),
    relationship: z.string().min(1),
    notifyOnMissedCalls: z.boolean().default(true),
});

const observationSchema = z.object({
    q1: z.string().optional(),
    q2: z.string().optional(),
    q3: z.string().optional(),
    q4: z.string().optional(),
    q5: z.string().optional(),
    q6: z.string().optional(),
    q7: z.string().optional(),
    otherNotes: z.string().optional(),
    changeOnset: z.string().optional(),
});

const submitSchema = z.object({
    fullName: z.string().min(1),
    dateOfBirth: z.string().optional(),
    gender: z.enum(['female', 'male', 'nonbinary', 'prefer_not']).optional(),
    phone: z.string().min(1),
    language: z.string().optional(),
    email: z.string().email().optional(),

    callTime: z.enum(['morning', 'afternoon', 'evening']),
    callFrequency: z.enum(['daily', 'weekly']),
    interests: z.string().optional(),
    dislikes: z.string().optional(),

    conditions: z.array(z.string()).optional(),
    medications: z.array(medicationSchema).optional(),

    educationLevel: z.string().optional(),
    memoryConcerns: z.enum(['yes', 'no', 'unsure']).optional(),
    cognitiveChecksEnabled: z.boolean().optional(),
    communicationStyle: z.string().optional(),

    observations: observationSchema.optional(),

    emergencyContact: emergencyContactSchema.optional(),

    grantDashboardAccess: z.enum(['yes', 'no']).optional(),
    elderlyEmail: z.string().email().optional(),
});

const GENDER_MAP: Record<string, 'MALE' | 'FEMALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY'> = {
    female: 'FEMALE',
    male: 'MALE',
    nonbinary: 'NON_BINARY',
    prefer_not: 'PREFER_NOT_TO_SAY',
};

const EDUCATION_MAP: Record<string, string> = {
    'No formal education': 'NO_FORMAL_EDUCATION',
    'Primary school': 'PRIMARY_OR_ELEMENTARY',
    'Some high school': 'SECONDARY_OR_HIGH_SCHOOL',
    'High school diploma': 'SECONDARY_OR_HIGH_SCHOOL',
    'Some college / trade school': 'COLLEGE_OR_TRADE',
    "Bachelor's degree": 'BACHELORS_OR_EQUIVALENT',
    'Graduate degree': 'GRADUATE_OR_POSTGRADUATE',
};

const CALL_TIME_MAP: Record<string, string> = {
    morning: '10:00:00',
    afternoon: '14:00:00',
    evening: '18:00:00',
};

function calculateAge(dateOfBirth: string): number | undefined {
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) return undefined;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
    }
    return age;
}

export const onboardingRouter = router({
    submit: caregiverProcedure
        .input(submitSchema)
        .mutation(async ({ ctx, input }) => {
            const caregiverProfileId = ctx.session.caregiverProfileId!;

            const interestsArray = input.interests
                ? input.interests.split(',').map((s) => s.trim()).filter(Boolean)
                : [];
            const dislikesArray = input.dislikes
                ? input.dislikes.split(',').map((s) => s.trim()).filter(Boolean)
                : [];

            const profile = await UserRepository.create(
                {
                    name: input.fullName,
                    phone: input.phone,
                    age: input.dateOfBirth ? calculateAge(input.dateOfBirth) : undefined,
                    email: input.grantDashboardAccess === 'yes' ? input.elderlyEmail : input.email,
                    gender: input.gender ? GENDER_MAP[input.gender] as any : undefined,
                    educationLevel: input.educationLevel
                        ? EDUCATION_MAP[input.educationLevel] as any
                        : undefined,
                    interests: interestsArray,
                    dislikes: dislikesArray,
                    callFrequency: input.callFrequency === 'daily' ? 'DAILY' : 'WEEKLY',
                    preferredCallTime: new Date(`1970-01-01T${CALL_TIME_MAP[input.callTime]}Z`),
                    enableHealthCheckIns: false,
                    hasWebAccess: input.grantDashboardAccess === 'yes',
                    emergencyContact: input.emergencyContact,
                    healthConditions: input.conditions?.map((c) => ({ condition: c })),
                    medications: input.medications,
                },
                caregiverProfileId
            );

            return { elderlyProfileId: profile.id };
        }),
});