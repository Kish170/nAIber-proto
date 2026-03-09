import { create } from 'zustand';

interface UIState {
    sidebarOpen: boolean;
    notificationPanelOpen: boolean;
    activeModal: string | null;
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;
    toggleNotificationPanel: () => void;
    openModal: (modalId: string) => void;
    closeModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    sidebarOpen: true,
    notificationPanelOpen: false,
    activeModal: null,

    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    toggleNotificationPanel: () =>
        set((s) => ({ notificationPanelOpen: !s.notificationPanelOpen })),
    openModal: (modalId) => set({ activeModal: modalId }),
    closeModal: () => set({ activeModal: null }),
}));
