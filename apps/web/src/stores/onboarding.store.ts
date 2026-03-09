import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { OnboardingData } from '@/types/onboarding';

interface OnboardingState {
    data: OnboardingData;
    currentStep: number;
    updateStep: (step: number, stepData: Partial<OnboardingData>) => void;
    setCurrentStep: (step: number) => void;
    reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
    persist(
        (set) => ({
            data: {},
            currentStep: 0,

            updateStep: (step, stepData) =>
                set((state) => ({
                    data: { ...state.data, ...stepData },
                    currentStep: step,
                })),

            setCurrentStep: (step) => set({ currentStep: step }),

            reset: () => set({ data: {}, currentStep: 0 }),
        }),
        {
            name: 'naiber-onboarding',
            storage: createJSONStorage(() => sessionStorage),
        }
    )
);
