import { Prisma } from '../../../../generated/prisma/index.js';
import { elderlyProfileInclude } from './user-profile.js';

export const caregiverProfileInclude = Prisma.validator<Prisma.CaregiverProfileInclude>()({
    managedUsers: {
        where: { status: 'ACTIVE' },
        include: {
            elderlyProfile: {
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

export type CaregiverProfileData = Prisma.CaregiverProfileGetPayload<{
    include: typeof caregiverProfileInclude
}>;

export type ManagedElderlyUser = CaregiverProfileData['managedUsers'][number]['elderlyProfile'];

export const elderlyWithCaregiversInclude = Prisma.validator<Prisma.ElderlyProfileInclude>()({
    ...elderlyProfileInclude,
    caregiverLinks: {
        where: { status: 'ACTIVE' },
        include: {
            caregiverProfile: {
                select: {
                    id: true,
                    name: true,
                    relationship: true,
                }
            }
        }
    }
});

export type ElderlyWithCaregivers = Prisma.ElderlyProfileGetPayload<{
    include: typeof elderlyWithCaregiversInclude
}>;