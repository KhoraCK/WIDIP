import { Shield, Timer } from 'lucide-react';

interface TabSelectorProps {
  activeTab: 'pending' | 'deferred';
  onTabChange: (tab: 'pending' | 'deferred') => void;
  pendingCount: number;
  deferredCount: number;
}

export function TabSelector({
  activeTab,
  onTabChange,
  pendingCount,
  deferredCount,
}: TabSelectorProps) {
  return (
    <div className="flex border-b border-border">
      {/* Tab: En attente de validation */}
      <button
        onClick={() => onTabChange('pending')}
        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
          activeTab === 'pending'
            ? 'text-accent border-b-2 border-accent bg-accent/5'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-primary'
        }`}
      >
        <Shield className="w-4 h-4" />
        <span>En attente</span>
        {pendingCount > 0 && (
          <span className={`px-2 py-0.5 text-xs rounded-full ${
            activeTab === 'pending'
              ? 'bg-accent text-white'
              : 'bg-bg-primary text-text-secondary'
          }`}>
            {pendingCount}
          </span>
        )}
      </button>

      {/* Tab: Actions programmees */}
      <button
        onClick={() => onTabChange('deferred')}
        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
          activeTab === 'deferred'
            ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-primary'
        }`}
      >
        <Timer className="w-4 h-4" />
        <span>Programmees</span>
        {deferredCount > 0 && (
          <span className={`px-2 py-0.5 text-xs rounded-full ${
            activeTab === 'deferred'
              ? 'bg-blue-500 text-white'
              : 'bg-bg-primary text-text-secondary'
          }`}>
            {deferredCount}
          </span>
        )}
      </button>
    </div>
  );
}
