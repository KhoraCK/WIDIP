import { Clock, Timer } from 'lucide-react';
import type { DeferredAction } from './types';
import {
  formatToolName,
  formatTimeUntilExecution,
  getExecutionTimeColor,
  DEFERRED_STATUS_COLORS,
  DEFERRED_STATUS_LABELS,
} from './types';

interface DeferredActionCardProps {
  action: DeferredAction;
  isSelected: boolean;
  onClick: () => void;
}

export function DeferredActionCard({ action, isSelected, onClick }: DeferredActionCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        isSelected
          ? 'bg-accent/20 border-accent'
          : 'bg-bg-primary border-border hover:border-accent/50'
      }`}
    >
      {/* Header avec ID et status */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-text-secondary">
          {action.deferred_id}
        </span>
        <span className={`px-2 py-0.5 text-xs rounded-full ${DEFERRED_STATUS_COLORS[action.status]}`}>
          {DEFERRED_STATUS_LABELS[action.status]}
        </span>
      </div>

      {/* Nom de l'action */}
      <p className="font-medium text-text-primary text-sm mb-1">
        {formatToolName(action.tool_name)}
      </p>

      {/* Context */}
      {action.context?.client_name && (
        <p className="text-xs text-text-secondary truncate mb-2">
          {action.context.client_name}
        </p>
      )}

      {/* Timer execution */}
      {action.status === 'pending' && (
        <div className={`flex items-center gap-1.5 ${getExecutionTimeColor(action.time_until_execution)}`}>
          <Timer className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">
            Execution dans {formatTimeUntilExecution(action.time_until_execution)}
          </span>
        </div>
      )}

      {/* Approuve par */}
      <div className="flex items-center gap-1.5 mt-2 text-text-secondary">
        <Clock className="w-3 h-3" />
        <span className="text-xs">
          Approuve par {action.approved_by}
        </span>
      </div>
    </button>
  );
}
