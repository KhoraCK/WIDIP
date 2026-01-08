import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { useAuthStore } from '../store';
import { useSafeguardStore } from '../store/safeguardStore';
import { useToastStore } from '../store/toastStore';
import {
  RequestList,
  RequestDetail,
  RequestDetailEmpty,
  DeferredActionList,
  DeferredActionDetail,
  DeferredActionDetailEmpty,
  TabSelector,
} from '../components/safeguard';
import type { SafeguardRequest, DeferredAction } from '../components/safeguard';
import { Spinner } from '../components/ui';

// =============================================================================
// Mock Data - Demandes en attente de validation
// =============================================================================
function generateMockRequests(): SafeguardRequest[] {
  return [
    {
      approval_id: 'APR-2026-001',
      tool_name: 'ad_reset_password',
      arguments: { username: 'jdupont', domain: 'widip.local' },
      security_level: 'L3',
      status: 'pending',
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      time_remaining_seconds: 45 * 60,
      context: {
        ticket_id: 1234,
        client_name: 'EHPAD Les Music Art',
        description: 'Reset mot de passe demande par Mme Martin (secretariat)',
      },
    },
    {
      approval_id: 'APR-2026-002',
      tool_name: 'glpi_close_ticket',
      arguments: { ticket_id: 5678 },
      security_level: 'L3',
      status: 'pending',
      created_at: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 32 * 60 * 1000).toISOString(),
      time_remaining_seconds: 32 * 60,
      context: {
        ticket_id: 5678,
        client_name: 'Clinique Saint Joseph',
        description: 'Fermeture ticket apres resolution probleme imprimante',
      },
    },
  ];
}

// =============================================================================
// Mock Data - Actions differees (24-48h)
// =============================================================================
function generateMockDeferredActions(): DeferredAction[] {
  return [
    {
      deferred_id: 'DEF-2026-001',
      approval_id: 'APR-2026-010',
      tool_name: 'ad_reset_password',
      parameters: { username: 'mmartin', domain: 'widip.local' },
      security_level: 'L3',
      delay_hours: 24,
      scheduled_at: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
      time_until_execution: 18 * 60 * 60, // 18h restantes
      status: 'pending',
      approved_by: 'tech.dupont',
      approved_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      context: {
        ticket_id: 4521,
        client_name: 'EHPAD Les Music Art',
        description: 'Reset MDP suite demande RH - collaborateur de retour lundi',
      },
    },
    {
      deferred_id: 'DEF-2026-002',
      approval_id: 'APR-2026-011',
      tool_name: 'ad_disable_account',
      parameters: { username: 'ancien.employe', domain: 'widip.local' },
      security_level: 'L3',
      delay_hours: 24,
      scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      time_until_execution: 2 * 60 * 60, // 2h restantes (urgent!)
      status: 'pending',
      approved_by: 'admin.jean',
      approved_at: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
      approval_comment: 'Depart confirme par RH - effectif vendredi',
      context: {
        ticket_id: 4498,
        client_name: 'Clinique Saint Joseph',
        description: 'Desactivation compte suite depart salarie M. Durand',
      },
    },
  ];
}

// =============================================================================
// Composant Page Safeguard
// =============================================================================
export function Safeguard() {
  const { user } = useAuthStore();
  const toast = useToastStore();
  const {
    // Demandes
    requests,
    selectedRequest,
    pendingCount,
    isLoading,
    isActionLoading,
    error,
    pollingInterval,
    isPollingEnabled,
    setSelectedRequest,
    setRequests,
    setLoading,
    fetchRequests,
    approveRequest,
    rejectRequest,
    // Actions differees
    deferredActions,
    selectedDeferred,
    deferredCount,
    isDeferredLoading,
    setDeferredActions,
    setSelectedDeferred,
    fetchDeferredActions,
    cancelDeferred,
    // UI
    activeTab,
    setActiveTab,
  } = useSafeguardStore();

  const [comment, setComment] = useState('');
  const [useMockData, setUseMockData] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const pollingRef = useRef<number | null>(null);

  // =========================================================================
  // Chargement initial
  // =========================================================================
  useEffect(() => {
    if (user?.role !== 'admin') return;
    if (initialized) return;

    setInitialized(true);

    const loadData = async () => {
      try {
        // Tenter les appels API
        await Promise.all([
          fetchRequests(),
          fetchDeferredActions(),
        ]);
        console.log('Safeguard: Donnees chargees depuis l\'API');
      } catch (err) {
        // Si l'API echoue, utiliser les mock data
        console.warn('API Safeguard non disponible, utilisation des donnees de test', err);
        setUseMockData(true);
        setRequests(generateMockRequests());
        setDeferredActions(generateMockDeferredActions());
        setLoading(false);
      }
    };

    loadData();
  }, [user?.role, initialized, fetchRequests, fetchDeferredActions, setRequests, setDeferredActions, setLoading]);

  // =========================================================================
  // Polling automatique
  // =========================================================================
  useEffect(() => {
    if (isPollingEnabled && pollingInterval > 0 && !useMockData && initialized) {
      pollingRef.current = window.setInterval(() => {
        fetchRequests(false).catch(() => {});
        fetchDeferredActions(false).catch(() => {});
      }, pollingInterval);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [isPollingEnabled, pollingInterval, useMockData, initialized, fetchRequests, fetchDeferredActions]);

  // =========================================================================
  // Mise a jour countdown pour mock data
  // =========================================================================
  useEffect(() => {
    if (!useMockData) return;

    const interval = setInterval(() => {
      // Mettre a jour les demandes
      setRequests(
        requests.map(req => ({
          ...req,
          time_remaining_seconds: Math.max(0, req.time_remaining_seconds - 30),
        }))
      );
      // Mettre a jour les actions differees
      setDeferredActions(
        deferredActions.map(action => ({
          ...action,
          time_until_execution: Math.max(0, action.time_until_execution - 30),
        }))
      );
    }, 30000);

    return () => clearInterval(interval);
  }, [useMockData, requests, deferredActions, setRequests, setDeferredActions]);

  // =========================================================================
  // Selection automatique de la premiere demande/action
  // =========================================================================
  useEffect(() => {
    if (activeTab === 'pending' && requests.length > 0 && !selectedRequest) {
      const pending = requests.filter(r => r.status === 'pending');
      if (pending.length > 0) {
        setSelectedRequest(pending[0]);
      }
    }
  }, [activeTab, requests, selectedRequest, setSelectedRequest]);

  useEffect(() => {
    if (activeTab === 'deferred' && deferredActions.length > 0 && !selectedDeferred) {
      const pending = deferredActions.filter(a => a.status === 'pending');
      if (pending.length > 0) {
        setSelectedDeferred(pending[0]);
      }
    }
  }, [activeTab, deferredActions, selectedDeferred, setSelectedDeferred]);

  // =========================================================================
  // Handlers - Demandes
  // =========================================================================
  const handleApprove = useCallback(async () => {
    if (!selectedRequest) return;

    if (useMockData) {
      setRequests(requests.filter(r => r.approval_id !== selectedRequest.approval_id));
      setSelectedRequest(null);
      setComment('');
      toast.success('Demande approuvee - Action programmee pour J+1');
      return;
    }

    const success = await approveRequest(selectedRequest.approval_id, comment);
    if (success) {
      setComment('');
      toast.success('Demande approuvee - Action programmee');
    } else {
      toast.error(error || 'Erreur lors de l\'approbation');
    }
  }, [selectedRequest, useMockData, requests, comment, approveRequest, error, toast, setRequests, setSelectedRequest]);

  const handleReject = useCallback(async () => {
    if (!selectedRequest) return;

    if (useMockData) {
      setRequests(requests.filter(r => r.approval_id !== selectedRequest.approval_id));
      setSelectedRequest(null);
      setComment('');
      toast.warning('Demande refusee');
      return;
    }

    const success = await rejectRequest(selectedRequest.approval_id, comment);
    if (success) {
      setComment('');
      toast.warning('Demande refusee');
    } else {
      toast.error(error || 'Erreur lors du refus');
    }
  }, [selectedRequest, useMockData, requests, comment, rejectRequest, error, toast, setRequests, setSelectedRequest]);

  const handleRefreshPending = useCallback(() => {
    if (useMockData) {
      setRequests(generateMockRequests());
      toast.success('Donnees actualisees');
      return;
    }
    fetchRequests().catch(() => {});
  }, [useMockData, fetchRequests, setRequests, toast]);

  // =========================================================================
  // Handlers - Actions differees
  // =========================================================================
  const handleCancelDeferred = useCallback(async (reason?: string) => {
    if (!selectedDeferred) return;

    if (useMockData) {
      setDeferredActions(deferredActions.filter(a => a.deferred_id !== selectedDeferred.deferred_id));
      setSelectedDeferred(null);
      toast.success('Action annulee avec succes');
      return;
    }

    const success = await cancelDeferred(
      selectedDeferred.deferred_id,
      user?.email || 'unknown',
      reason
    );
    if (success) {
      toast.success('Action annulee avec succes');
    } else {
      toast.error(error || 'Erreur lors de l\'annulation');
    }
  }, [selectedDeferred, useMockData, deferredActions, user?.email, cancelDeferred, error, toast, setDeferredActions, setSelectedDeferred]);

  const handleRefreshDeferred = useCallback(() => {
    if (useMockData) {
      setDeferredActions(generateMockDeferredActions());
      toast.success('Donnees actualisees');
      return;
    }
    fetchDeferredActions().catch(() => {});
  }, [useMockData, fetchDeferredActions, setDeferredActions, toast]);

  // =========================================================================
  // Verification role admin
  // =========================================================================
  if (user?.role !== 'admin') {
    return <Navigate to="/chat" replace />;
  }

  // =========================================================================
  // Loading initial
  // =========================================================================
  if ((isLoading || isDeferredLoading) && requests.length === 0 && deferredActions.length === 0) {
    return (
      <div className="min-h-screen bg-bg-primary flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Spinner size="lg" />
            <p className="text-text-secondary mt-4">Chargement des demandes...</p>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Rendu
  // =========================================================================
  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <Header />

      {/* Banniere mode demo */}
      {useMockData && (
        <div className="bg-orange-500/20 border-b border-orange-500/30 px-4 py-2">
          <p className="text-sm text-orange-400 text-center">
            Mode demonstration - API Safeguard non connectee
          </p>
        </div>
      )}

      {/* Onglets */}
      <TabSelector
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pendingCount={pendingCount}
        deferredCount={deferredCount}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar + Detail selon l'onglet actif */}
        {activeTab === 'pending' ? (
          <>
            {/* Sidebar - Liste des demandes */}
            <RequestList
              requests={requests}
              selectedRequest={selectedRequest}
              onSelectRequest={setSelectedRequest}
              onRefresh={handleRefreshPending}
            />

            {/* Main content - Detail de la demande */}
            <main className="flex-1 flex flex-col overflow-hidden">
              {selectedRequest ? (
                <RequestDetail
                  request={selectedRequest}
                  comment={comment}
                  onCommentChange={setComment}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  isLoading={isActionLoading}
                />
              ) : (
                <RequestDetailEmpty />
              )}
            </main>
          </>
        ) : (
          <>
            {/* Sidebar - Liste des actions differees */}
            <DeferredActionList
              actions={deferredActions}
              selectedAction={selectedDeferred}
              onSelectAction={setSelectedDeferred}
              onRefresh={handleRefreshDeferred}
            />

            {/* Main content - Detail de l'action differee */}
            <main className="flex-1 flex flex-col overflow-hidden">
              {selectedDeferred ? (
                <DeferredActionDetail
                  action={selectedDeferred}
                  onCancel={handleCancelDeferred}
                  isLoading={isActionLoading}
                />
              ) : (
                <DeferredActionDetailEmpty />
              )}
            </main>
          </>
        )}
      </div>
    </div>
  );
}
