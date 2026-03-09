import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CaregiverUser } from '@/types/caregiver';
import type { ManagedUser } from '@/types/elderly';

interface ActiveUserState {
    caregiver: CaregiverUser | null;
    selectedElderlyId: string | null;
    setCaregiver: (caregiver: CaregiverUser) => void;
    selectElderly: (elderlyProfileId: string) => void;
    getSelectedElderly: () => ManagedUser | null;
    clear: () => void;
}

export const useActiveUserStore = create<ActiveUserState>()(
    persist(
        (set, get) => ({
            caregiver: null,
            selectedElderlyId: null,

            setCaregiver: (caregiver) =>
                set({
                    caregiver,
                    selectedElderlyId: caregiver.managedUsers[0]?.elderlyProfileId ?? null,
                }),

            selectElderly: (elderlyProfileId) =>
                set({ selectedElderlyId: elderlyProfileId }),

            getSelectedElderly: () => {
                const { caregiver, selectedElderlyId } = get();
                if (!caregiver || !selectedElderlyId) return null;
                return caregiver.managedUsers.find(
                    (u) => u.elderlyProfileId === selectedElderlyId
                ) ?? null;
            },

            clear: () => set({ caregiver: null, selectedElderlyId: null }),
        }),
        {
            name: 'naiber-active-user',
            storage: createJSONStorage(() => localStorage),
        }
    )
);
