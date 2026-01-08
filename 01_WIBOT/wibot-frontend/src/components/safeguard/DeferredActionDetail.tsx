import { useState } from 'react';
import { Timer, Clock, XCircle, AlertTriangle, User, Calendar } from 'lucide-react';
import type { DeferredAction } from './types';
import {
  formatToolName,
  formatTimeUntilExecution,
  getExecutionTimeColor,
  canCancelAction,
  DEFERRED_STATUS_COLORS,
  DEFERRED_STATUS_LABELS,
} from './types';
import { Button } from '../ui';

interface DeferredActionDetailProps {
  action: DeferredAction;
  onCancel: (reason?: string) => void;
  isLoading: boolean;
}

export function DeferredActionDetail({
  action,
  onCancel,
  isLoading,
}: DeferredActionDetailProps) {
  const [reason, setReason] = useState('');

  const handleCancel = () => {
    onCancel(reason || undefined);
    setReason('');
  };

  // Formater la date d'execution prevue
  const scheduledDate = new Date(action.scheduled_at);
  const formattedDate = scheduledDate.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="bg-bg-secondary rounded-xl p-6 border border-border">
        {/* En-tete */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <Timer className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">
                Action #{action.deferred_id}
              </h1>
              <p className="text-text-secondary">
                Niveau: <span className="font-medium text-orange-400">{action.security_level}</span>
              </p>
            </div>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${DEFERRED_STATUS_COLORS[action.status]}`}>
            {DEFERRED_STATUS_LABELS[action.status]}
          </span>
        </div>

        {/* Countdown execution */}
        {action.status === 'pending' && (
          <div className={`mb-6 p-4 rounded-lg border ${
            action.time_until_execution < 2 * 3600
              ? 'bg-orange-500/10 border-orange-500/30'
              : 'bg-blue-500/10 border-blue-500/30'
          }`}>
            <div className="flex items-center gap-3">
              <Clock className={`w-5 h-5 ${getExecutionTimeColor(action.time_until_execution)}`} />
              <div>
                <p className={`font-semibold ${getExecutionTimeColor(action.time_until_execution)}`}>
                  Execution dans {formatTimeUntilExecution(action.time_until_execution)}
                </p>
                <p className="text-sm text-text-secondary">
                  Prevue le {formattedDate}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action demandee */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-text-secondary mb-2">Action programmee</h3>
          <div className="bg-bg-primary rounded-lg p-4">
            <p className="text-lg font-semibold text-text-primary">
              {formatToolName(action.tool_name)}
            </p>
            <div className="mt-2 space-y-1">
              {Object.entries(action.parameters).map(([key, value]) => (
                <p key={key} className="text-sm text-text-secondary">
                  <span className="text-text-primary font-medium">{key}:</span>{' '}
                  {String(value)}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Contexte */}
        {action.context && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-text-secondary mb-2">Contexte</h3>
            <div className="bg-bg-primary rounded-lg p-4 space-y-2">
              {action.context.ticket_id && (
                <p className="text-sm">
                  <span className="text-text-secondary">Ticket GLPI:</span>{' '}
                  <span className="text-accent font-medium">#{action.context.ticket_id}</span>
                </p>
              )}
              {action.context.client_name && (
                <p className="text-sm">
                  <span className="text-text-secondary">Client:</span>{' '}
                  <span className="text-text-primary">{action.context.client_name}</span>
                </p>
              )}
              {action.context.description && (
                <p className="text-sm">
                  <span className="text-text-secondary">Description:</span>{' '}
                  <span className="text-text-primary">{action.context.description}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Info approbation */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-text-secondary mb-2">Approbation</h3>
          <div className="bg-bg-primary rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-text-secondary" />
              <span className="text-sm">
                <span className="text-text-secondary">Approuve par:</span>{' '}
                <span className="text-text-primary font-medium">{action.approved_by}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-text-secondary" />
              <span className="text-sm">
                <span className="text-text-secondary">Le:</span>{' '}
                <span className="text-text-primary">
                  {new Date(action.approved_at).toLocaleString('fr-FR')}
                </span>
              </span>
            </div>
            {action.approval_comment && (
              <p className="text-sm mt-2 italic text-text-secondary">
                "{action.approval_comment}"
              </p>
            )}
          </div>
        </div>

        {/* Zone d'annulation (si action pending) */}
        {canCancelAction(action) && (
          <>
            <div className="mb-6">
              <h3 className="text-sm font-medium text-text-secondary mb-2">
                Raison de l'annulation (optionnel)
              </h3>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Le client a change d'avis..."
                className="w-full px-4 py-3 bg-bg-primary border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                rows={2}
              />
            </div>

            {/* Bouton annuler */}
            <Button
              onClick={handleCancel}
              disabled={isLoading}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              <XCircle className="w-5 h-5 mr-2" />
              Annuler cette action
            </Button>
          </>
        )}

        {/* Avertissement */}
        <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-400">Action differee</p>
            <p className="text-sm text-text-secondary mt-1">
              Cette action a ete approuvee mais son execution est differee de {action.delay_hours}h
              pour permettre une eventuelle annulation. L'execution sera automatique a la date prevue.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Composant pour l'etat vide
export function DeferredActionDetailEmpty() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <Timer className="w-16 h-16 text-text-secondary mx-auto mb-4" />
        <p className="text-lg text-text-primary font-medium">Selectionnez une action</p>
        <p className="text-text-secondary mt-1">
          Choisissez une action programmee pour voir les details
        </p>
      </div>
    </div>
  );
}
