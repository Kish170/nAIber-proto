import { Prisma } from '../../../../generated/prisma/index.js';
import { userProfileInclude } from './user-profile.js';

export const caregiverProfileInclude = Prisma.validator<Prisma.CaregiverAccountInclude>()({
    managedUsers: {
        where: { status: 'ACTIVE' },
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    age: true,
                    activationStatus: true,
                    lastCallAt: true,
                    callFrequency: true,
                }
            }
        }
    }
});

export type CaregiverProfileData = Prisma.CaregiverAccountGetPayload<{
    include: typeof caregiverProfileInclude
}>;

export type ManagedUserSummary = CaregiverProfileData['managedUsers'][number]['user'];

export const userWithCaregiversInclude = Prisma.validator<Prisma.UserInclude>()({
    ...userProfileInclude,
    caregiverLinks: {
        where: { status: 'ACTIVE' },
        include: {
            caregiver: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    relationship: true,
                }
            }
        }
    }
});

export type UserWithCaregivers = Prisma.UserGetPayload<{
    include: typeof userWithCaregiversInclude
}>;
