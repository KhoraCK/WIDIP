import { create } from 'zustand';
import type { SafeguardRequest, DeferredAction } from '../components/safeguard/types';
import {
  getSafeguardRequests,
  approveSafeguardRequest,
  rejectSafeguardRequest,
  getDeferredActions,
  cancelDeferredAction,
} from '../services/safeguard';

interface SafeguardState {
  // Data - Demandes en attente
  requests: SafeguardRequest[];
  selectedRequest: SafeguardRequest | null;
  pendingCount: number;

  // Data - Actions differees
  deferredActions: DeferredAction[];
  selectedDeferred: DeferredAction | null;
  deferredCount: number;

  // UI State
  activeTab: 'pending' | 'deferred';

  // Loading states
  isLoading: boolean;
  isActionLoading: boolean;
  isDeferredLoading: boolean;
  error: string | null;

  // Polling
  pollingInterval: number;
  isPollingEnabled: boolean;

  // Actions - Demandes
  setRequests: (requests: SafeguardRequest[]) => void;
  setSelectedRequest: (request: SafeguardRequest | null) => void;
  setLoading: (loading: boolean) => void;
  setActionLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setPollingInterval: (interval: number) => void;
  setPollingEnabled: (enabled: boolean) => void;

  // Actions - Differees
  setDeferredActions: (actions: DeferredAction[]) => void;
  setSelectedDeferred: (action: DeferredAction | null) => void;
  setActiveTab: (tab: 'pending' | 'deferred') => void;

  // Async actions - Demandes
  fetchRequests: (showLoading?: boolean) => Promise<void>;
  approveRequest: (approvalId: string, comment?: string) => Promise<boolean>;
  rejectRequest: (approvalId: string, comment?: string) => Promise<boolean>;

  // Async actions - Differees
  fetchDeferredActions: (showLoading?: boolean) => Promise<void>;
  cancelDeferred: (deferredId: string, cancelledBy: string, reason?: string) => Promise<boolean>;
}

export const useSafeguardStore = create<SafeguardState>((set, get) => ({
  // Initial state - Demandes
  requests: [],
  selectedRequest: null,
  pendingCount: 0,

  // Initial state - Actions differees
  deferredActions: [],
  selectedDeferred: null,
  deferredCount: 0,

  // UI State
  activeTab: 'pending',

  // Loading states
  isLoading: false,
  isActionLoading: false,
  isDeferredLoading: false,
  error: null,
  pollingInterval: 30000, // 30 secondes par défaut
  isPollingEnabled: true,

  // Setters
  setRequests: (requests) => {
    const pendingCount = requests.filter(r => r.status === 'pending').length;
    set({ requests, pendingCount });
  },

  setSelectedRequest: (request) => set({ selectedRequest: request }),

  setLoading: (loading) => set({ isLoading: loading }),

  setActionLoading: (loading) => set({ isActionLoading: loading }),

  setError: (error) => set({ error }),

  setPollingInterval: (interval) => set({ pollingInterval: interval }),

  setPollingEnabled: (enabled) => set({ isPollingEnabled: enabled }),

  // Setters - Actions differees
  setDeferredActions: (actions) => {
    const deferredCount = actions.filter(a => a.status === 'pending').length;
    set({ deferredActions: actions, deferredCount });
  },

  setSelectedDeferred: (action) => set({ selectedDeferred: action }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  // Async: Fetch requests
  fetchRequests: async (showLoading = true) => {
    const state = get();
    if (showLoading) set({ isLoading: true });
    set({ error: null });

    try {
      const response = await getSafeguardRequests('pending');
      if (response.success) {
        const pendingCount = response.requests.filter(r => r.status === 'pending').length;

        // Mettre à jour la demande sélectionnée si elle existe encore
        let selectedRequest = state.selectedRequest;
        if (selectedRequest) {
          const updated = response.requests.find(
            r => r.approval_id === selectedRequest!.approval_id
          );
          selectedRequest = updated || null;
        }

        set({
          requests: response.requests,
          pendingCount,
          selectedRequest,
          isLoading: false,
        });
      } else {
        set({
          error: 'Erreur lors du chargement des demandes',
          isLoading: false,
        });
        throw new Error('API returned success: false');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      let displayError = 'Erreur lors du chargement des demandes';

      if (errorMessage.includes('401')) {
        displayError = 'Accès non autorisé';
      } else if (errorMessage.includes('403')) {
        displayError = "Niveau d'accréditation insuffisant";
      }

      set({
        error: displayError,
        isLoading: false,
      });
      console.error('Safeguard fetch error:', err);
      // Re-throw pour que le composant puisse utiliser le fallback mock data
      throw err;
    }
  },

  // Async: Approve request
  approveRequest: async (approvalId, comment) => {
    set({ isActionLoading: true, error: null });

    try {
      const response = await approveSafeguardRequest({
        approval_id: approvalId,
        comment,
      });

      if (response.success) {
        // Rafraîchir et désélectionner
        await get().fetchRequests(false);
        set({ selectedRequest: null, isActionLoading: false });
        return true;
      } else {
        set({
          error: response.message || "Erreur lors de l'approbation",
          isActionLoading: false,
        });
        return false;
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      set({
        error: `Erreur: ${errorMessage}`,
        isActionLoading: false,
      });
      console.error('Approve error:', err);
      return false;
    }
  },

  // Async: Reject request
  rejectRequest: async (approvalId, comment) => {
    set({ isActionLoading: true, error: null });

    try {
      const response = await rejectSafeguardRequest({
        approval_id: approvalId,
        comment,
      });

      if (response.success) {
        // Rafraîchir et désélectionner
        await get().fetchRequests(false);
        set({ selectedRequest: null, isActionLoading: false });
        return true;
      } else {
        set({
          error: response.message || 'Erreur lors du refus',
          isActionLoading: false,
        });
        return false;
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      set({
        error: `Erreur: ${errorMessage}`,
        isActionLoading: false,
      });
      console.error('Reject error:', err);
      return false;
    }
  },

  // Async: Fetch deferred actions
  fetchDeferredActions: async (showLoading = true) => {
    const state = get();
    if (showLoading) set({ isDeferredLoading: true });
    set({ error: null });

    try {
      const response = await getDeferredActions();
      if (response.actions) {
        const deferredCount = response.actions.filter(a => a.status === 'pending').length;

        // Mettre à jour l'action sélectionnée si elle existe encore
        let selectedDeferred = state.selectedDeferred;
        if (selectedDeferred) {
          const updated = response.actions.find(
            a => a.deferred_id === selectedDeferred!.deferred_id
          );
          selectedDeferred = updated || null;
        }

        set({
          deferredActions: response.actions,
          deferredCount,
          selectedDeferred,
          isDeferredLoading: false,
        });
      } else {
        set({
          error: 'Erreur lors du chargement des actions differees',
          isDeferredLoading: false,
        });
        throw new Error('API returned no actions');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      let displayError = 'Erreur lors du chargement des actions differees';

      if (errorMessage.includes('401')) {
        displayError = 'Acces non autorise';
      } else if (errorMessage.includes('403')) {
        displayError = "Niveau d'accreditation insuffisant";
      }

      set({
        error: displayError,
        isDeferredLoading: false,
      });
      console.error('Deferred fetch error:', err);
      throw err;
    }
  },

  // Async: Cancel deferred action
  cancelDeferred: async (deferredId, cancelledBy, reason) => {
    set({ isActionLoading: true, error: null });

    try {
      const response = await cancelDeferredAction({
        deferred_id: deferredId,
        cancelled_by: cancelledBy,
        reason,
      });

      if (response.success) {
        // Rafraîchir et désélectionner
        await get().fetchDeferredActions(false);
        set({ selectedDeferred: null, isActionLoading: false });
        return true;
      } else {
        set({
          error: response.message || "Erreur lors de l'annulation",
          isActionLoading: false,
        });
        return false;
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      set({
        error: `Erreur: ${errorMessage}`,
        isActionLoading: false,
      });
      console.error('Cancel deferred error:', err);
      return false;
    }
  },
}));
