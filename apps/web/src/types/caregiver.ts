import type { ManagedUser } from './elderly';

export interface CaregiverUser {
    caregiverProfileId: string;
    name: string;
    managedUsers: ManagedUser[];
}
