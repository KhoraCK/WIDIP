// Types pour le module Safeguard

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'executed' | 'scheduled';

// Statuts pour les actions differees
export type DeferredStatus = 'pending' | 'cancelled' | 'executed' | 'failed';

export interface SafeguardRequest {
  approval_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  security_level: string;
  status: ApprovalStatus;
  created_at: string;
  expires_at: string;
  time_remaining_seconds: number;
  requester_ip?: string;
  context?: {
    ticket_id?: number;
    client_name?: string;
    description?: string;
  };
  approver?: string;
  approval_comment?: string;
}

// Labels pour les outils
export const TOOL_LABELS: Record<string, string> = {
  ad_reset_password: 'Reset mot de passe AD',
  ad_unlock_account: 'Déverrouillage compte AD',
  ad_disable_account: 'Désactivation compte AD',
  ad_enable_account: 'Réactivation compte AD',
  glpi_close_ticket: 'Fermeture ticket GLPI',
  glpi_assign_ticket: 'Assignation ticket',
  glpi_update_ticket_status: 'Changement statut ticket',
};

// Helpers
export function formatToolName(toolName: string): string {
  return TOOL_LABELS[toolName] || toolName;
}

export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Expiré';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}min`;
}

export function getTimeColor(seconds: number): string {
  if (seconds <= 0) return 'text-red-500';
  if (seconds < 10 * 60) return 'text-red-400';
  if (seconds < 20 * 60) return 'text-orange-400';
  return 'text-text-secondary';
}

// =============================================================================
// Types pour les actions differees (24-48h)
// =============================================================================

export interface DeferredAction {
  deferred_id: string;           // DEF-2026-001
  approval_id: string;           // Reference approbation originale
  tool_name: string;
  parameters: Record<string, unknown>;
  security_level: string;

  // Timing
  delay_hours: number;
  scheduled_at: string;          // ISO timestamp
  time_until_execution: number;  // Secondes restantes

  // Status
  status: DeferredStatus;

  // Approbation
  approved_by: string;
  approved_at: string;
  approval_comment?: string;

  // Annulation (si applicable)
  cancelled_by?: string;
  cancelled_at?: string;
  cancellation_reason?: string;

  // Execution (si applicable)
  executed_at?: string;
  execution_result?: Record<string, unknown>;
  execution_error?: string;

  // Context
  context?: {
    ticket_id?: number;
    client_name?: string;
    description?: string;
  };

  created_at?: string;
}

// Labels pour les statuts d'actions differees
export const DEFERRED_STATUS_LABELS: Record<DeferredStatus, string> = {
  pending: 'En attente',
  cancelled: 'Annulee',
  executed: 'Executee',
  failed: 'Echouee',
};

// Couleurs pour les statuts
export const DEFERRED_STATUS_COLORS: Record<DeferredStatus, string> = {
  pending: 'bg-blue-500/20 text-blue-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
  executed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
};

// Helpers pour les actions differees
export function formatTimeUntilExecution(seconds: number): string {
  if (seconds <= 0) return 'Imminent';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}j ${remainingHours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }

  return `${minutes} min`;
}

export function getExecutionTimeColor(seconds: number): string {
  if (seconds <= 0) return 'text-red-500';
  if (seconds < 2 * 3600) return 'text-orange-400';  // < 2h
  if (seconds < 6 * 3600) return 'text-yellow-400';  // < 6h
  return 'text-text-secondary';
}

export function canCancelAction(action: DeferredAction): boolean {
  return action.status === 'pending' && action.time_until_execution > 0;
}
