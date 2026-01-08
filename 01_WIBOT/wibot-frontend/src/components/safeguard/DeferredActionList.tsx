import { Timer, RefreshCw, CheckCircle } from 'lucide-react';
import type { DeferredAction } from './types';
import { DeferredActionCard } from './DeferredActionCard';

interface DeferredActionListProps {
  actions: DeferredAction[];
  selectedAction: DeferredAction | null;
  onSelectAction: (action: DeferredAction) => void;
  onRefresh: () => void;
}

export function DeferredActionList({
  actions,
  selectedAction,
  onSelectAction,
  onRefresh,
}: DeferredActionListProps) {
  const pendingActions = actions.filter(a => a.status === 'pending');

  return (
    <aside className="w-80 bg-bg-secondary border-r border-border flex flex-col">
      {/* Header sidebar */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5 text-blue-400" />
            <h2 className="font-semibold text-text-primary">Programmees</h2>
            {pendingActions.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-blue-500 text-white rounded-full">
                {pendingActions.length}
              </span>
            )}
          </div>
          <button
            onClick={onRefresh}
            className="p-2 hover:bg-bg-primary rounded-lg transition-colors"
            title="Rafraichir"
          >
            <RefreshCw className="w-4 h-4 text-text-secondary" />
          </button>
        </div>
        <p className="text-sm text-text-secondary mt-1">
          Actions en attente d'execution
        </p>
      </div>

      {/* Liste des actions */}
      <div className="flex-1 overflow-y-auto">
        {pendingActions.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-text-primary font-medium">Aucune action programmee</p>
            <p className="text-sm text-text-secondary mt-1">
              Toutes les actions ont ete executees
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {pendingActions.map(action => (
              <DeferredActionCard
                key={action.deferred_id}
                action={action}
                isSelected={selectedAction?.deferred_id === action.deferred_id}
                onClick={() => onSelectAction(action)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
