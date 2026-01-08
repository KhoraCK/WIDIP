import api from './api';
import type { SafeguardRequest, ApprovalStatus, DeferredAction, DeferredStatus } from '../components/safeguard/types';

// ============================================
// SAFEGUARD API TYPES
// ============================================

export interface SafeguardListResponse {
  success: boolean;
  requests: SafeguardRequest[];
  total: number;
}

export interface SafeguardDetailResponse {
  success: boolean;
  request: SafeguardRequest;
}

export interface SafeguardActionResponse {
  success: boolean;
  approval_id: string;
  status: ApprovalStatus;
  message: string;
}

export interface SafeguardApproveRequest {
  approval_id: string;
  comment?: string;
}

export interface SafeguardRejectRequest {
  approval_id: string;
  comment?: string;
}

// ============================================
// SAFEGUARD API FUNCTIONS
// ============================================

/**
 * Récupère la liste des demandes Safeguard en attente
 */
export async function getSafeguardRequests(
  status: ApprovalStatus = 'pending'
): Promise<SafeguardListResponse> {
  const response = await api.get<SafeguardListResponse>('/webhook/wibot/safeguard/requests', {
    params: { status }
  });
  return response.data;
}

/**
 * Récupère les détails d'une demande spécifique
 */
export async function getSafeguardRequestDetail(
  approvalId: string
): Promise<SafeguardDetailResponse> {
  const response = await api.get<SafeguardDetailResponse>(
    `/webhook/wibot/safeguard/request/${approvalId}`
  );
  return response.data;
}

/**
 * Approuve une demande Safeguard
 */
export async function approveSafeguardRequest(
  data: SafeguardApproveRequest
): Promise<SafeguardActionResponse> {
  const response = await api.post<SafeguardActionResponse>(
    '/webhook/wibot/safeguard/approve',
    data
  );
  return response.data;
}

/**
 * Rejette une demande Safeguard
 */
export async function rejectSafeguardRequest(
  data: SafeguardRejectRequest
): Promise<SafeguardActionResponse> {
  const response = await api.post<SafeguardActionResponse>(
    '/webhook/wibot/safeguard/reject',
    data
  );
  return response.data;
}

/**
 * Récupère l'historique des demandes traitées
 */
export async function getSafeguardHistory(
  limit: number = 50
): Promise<SafeguardListResponse> {
  const response = await api.get<SafeguardListResponse>('/webhook/wibot/safeguard/history', {
    params: { limit }
  });
  return response.data;
}

// ============================================
// DEFERRED ACTIONS API TYPES
// ============================================

export interface DeferredListResponse {
  success: boolean;
  actions: DeferredAction[];
  count: number;
  stats?: {
    pending: number;
    cancelled: number;
    executed: number;
    failed: number;
    total: number;
  };
}

export interface DeferredDetailResponse {
  success: boolean;
  action: DeferredAction;
}

export interface DeferredCancelRequest {
  cancelled_by: string;
  reason?: string;
}

export interface DeferredCancelResponse {
  success: boolean;
  deferred_id: string;
  status: DeferredStatus;
  message: string;
}

// ============================================
// DEFERRED ACTIONS API FUNCTIONS
// ============================================

/**
 * Récupère la liste des actions différées en attente
 */
export async function getDeferredActions(
  limit: number = 50
): Promise<DeferredListResponse> {
  const response = await api.get<DeferredListResponse>('/webhook/wibot/safeguard/deferred', {
    params: { limit }
  });
  return response.data;
}

/**
 * Récupère les détails d'une action différée
 */
export async function getDeferredActionDetail(
  deferredId: string
): Promise<DeferredDetailResponse> {
  const response = await api.get<DeferredDetailResponse>(
    `/webhook/wibot/safeguard/deferred/${deferredId}`
  );
  return response.data;
}

/**
 * Annule une action différée avant son exécution
 */
export async function cancelDeferredAction(
  data: DeferredCancelRequest & { deferred_id: string }
): Promise<DeferredCancelResponse> {
  const response = await api.post<DeferredCancelResponse>(
    `/webhook/wibot/safeguard/deferred/${data.deferred_id}/cancel`,
    {
      cancelled_by: data.cancelled_by,
      reason: data.reason,
    }
  );
  return response.data;
}

/**
 * Récupère les statistiques des actions différées
 */
export async function getDeferredStats(): Promise<{
  delay_config: Record<string, number>;
  stats: {
    pending: number;
    cancelled: number;
    executed: number;
    failed: number;
    total: number;
  };
}> {
  const response = await api.get('/webhook/wibot/safeguard/deferred/stats');
  return response.data;
}
