# TACHE 01 - Roadmap Implementation Actions Differees

> **Date**: 2026-01-08
> **Statut**: En cours de planification

---

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FLUX ACTUEL                                  │
├─────────────────────────────────────────────────────────────────────┤
│  Agent IA → Safeguard L3 → Technicien Approuve → EXECUTION IMMEDIATE│
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        FLUX CIBLE                                   │
├─────────────────────────────────────────────────────────────────────┤
│  Agent IA → Safeguard L3 → Technicien Approuve → FILE ATTENTE 24h   │
│                                                       ↓             │
│                                              [Fenetre annulation]   │
│                                                       ↓             │
│                                              EXECUTION AUTOMATIQUE  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 : Backend MCP Server (Python/FastAPI)

### 1.1 Schema Base de Donnees

**Fichier**: `02_MCP_SERVER/migrations/003_deferred_actions.sql`

```sql
CREATE TABLE safeguard_deferred_actions (
    id SERIAL PRIMARY KEY,
    deferred_id VARCHAR(50) UNIQUE NOT NULL,  -- DEF-2026-001
    approval_id VARCHAR(50) REFERENCES safeguard_approvals(approval_id),
    tool_name VARCHAR(100) NOT NULL,
    parameters JSONB NOT NULL,
    security_level VARCHAR(10) NOT NULL,

    -- Timing
    delay_hours INTEGER NOT NULL DEFAULT 24,
    scheduled_at TIMESTAMP NOT NULL,

    -- Status: pending, cancelled, executed, failed
    status VARCHAR(20) DEFAULT 'pending',

    -- Approbation originale
    approved_by VARCHAR(100) NOT NULL,
    approved_at TIMESTAMP NOT NULL,
    approval_comment TEXT,

    -- Annulation (si applicable)
    cancelled_by VARCHAR(100),
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,

    -- Execution (si applicable)
    executed_at TIMESTAMP,
    execution_result JSONB,
    execution_error TEXT,

    -- Context
    context JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_deferred_status ON safeguard_deferred_actions(status);
CREATE INDEX idx_deferred_scheduled ON safeguard_deferred_actions(scheduled_at);
```

### 1.2 Modification safeguard_queue.py

**Fichier**: `02_MCP_SERVER/src/mcp/safeguard_queue.py`

**Changements**:
- Nouvelle classe `DeferredActionManager`
- Methode `create_deferred_action(approval_id, delay_hours)`
- Methode `cancel_deferred_action(deferred_id, cancelled_by, reason)`
- Methode `get_pending_deferred_actions()`
- Methode `execute_due_actions()` - appellee par le cron

```python
# Logique cle: apres approbation L3+
async def approve_request(self, approval_id: str, approver: str, level: str):
    request = await self.get_request(approval_id)

    if request.security_level in ['L3', 'L4']:
        delay = 24 if request.security_level == 'L3' else 48
        await self.deferred_manager.create_deferred_action(
            approval_id=approval_id,
            delay_hours=delay,
            approved_by=approver
        )
        return {"status": "scheduled", "scheduled_at": ...}
    else:
        # L1/L2: execution immediate (comportement actuel)
        return await self.execute_action(request)
```

### 1.3 Nouveaux Endpoints API

**Fichier**: `02_MCP_SERVER/src/mcp/server.py`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/safeguard/deferred` | Liste actions programmees |
| GET | `/api/safeguard/deferred/{id}` | Detail action differee |
| POST | `/api/safeguard/deferred/{id}/cancel` | Annuler action |
| GET | `/api/safeguard/deferred/stats` | Stats (count par status) |

---

## Phase 2 : Backend n8n Workflows

### 2.1 Workflow Cron Executor

**Fichier**: `01_WIBOT/wibot-backend/workflows/deferred_executor.json`

```
[Schedule Trigger: */5 * * * *]
    |
[HTTP Request: GET MCP /api/safeguard/deferred?status=pending&due=true]
    |
[Loop: Pour chaque action due]
    |
[HTTP Request: POST MCP /api/tools/execute]
    |
[IF success]
    |-- [Update status: executed]
    |-- [Notify: "Action executee"]
    |
[ELSE]
    |-- [Update status: failed]
    |-- [Alert technicien]
```

### 2.2 Workflows API WIBOT

**Fichier**: `01_WIBOT/wibot-backend/workflows/safeguard_deferred.json`

- `GET /wibot/safeguard/deferred` → Proxy vers MCP
- `POST /wibot/safeguard/deferred/:id/cancel` → Proxy vers MCP

### 2.3 Modification Workflow Approve

**Fichier**: `01_WIBOT/wibot-backend/workflows/safeguard_actions.json`

Modifier le flux POST `/approve`:
- Ajouter branche conditionnelle sur `security_level`
- L3/L4 → Retourner `{"status": "scheduled", ...}`
- L1/L2 → Comportement actuel (execution immediate)

---

## Phase 3 : Frontend WIBOT (React/TypeScript)

### 3.1 Types TypeScript

**Fichier**: `01_WIBOT/wibot-frontend/src/components/safeguard/types.ts`

```typescript
// Nouveau statut
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
                           | 'expired' | 'executed' | 'scheduled';

// Nouveau type pour actions differees
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
  status: 'pending' | 'cancelled' | 'executed' | 'failed';

  // Approbation
  approved_by: string;
  approved_at: string;
  approval_comment?: string;

  // Context
  context?: {
    ticket_id?: number;
    client_name?: string;
    description?: string;
  };
}

// Helpers
export function formatTimeUntilExecution(seconds: number): string;
export function canCancelAction(action: DeferredAction): boolean;
```

### 3.2 Service API

**Fichier**: `01_WIBOT/wibot-frontend/src/services/safeguard.ts`

```typescript
// Nouveaux types response
export interface DeferredListResponse {
  success: boolean;
  actions: DeferredAction[];
  total: number;
}

export interface DeferredCancelResponse {
  success: boolean;
  deferred_id: string;
  message: string;
}

// Nouvelles fonctions
export async function getDeferredActions(): Promise<DeferredListResponse>;
export async function cancelDeferredAction(
  deferredId: string,
  reason?: string
): Promise<DeferredCancelResponse>;
```

### 3.3 Store Zustand

**Fichier**: `01_WIBOT/wibot-frontend/src/store/safeguardStore.ts`

```typescript
interface SafeguardState {
  // ... existant ...

  // Nouveau: Actions differees
  deferredActions: DeferredAction[];
  selectedDeferred: DeferredAction | null;
  deferredCount: number;

  // Nouvelles actions
  fetchDeferredActions: () => Promise<void>;
  cancelDeferred: (deferredId: string, reason?: string) => Promise<boolean>;
  setSelectedDeferred: (action: DeferredAction | null) => void;
}
```

### 3.4 Nouveaux Composants

**Dossier**: `01_WIBOT/wibot-frontend/src/components/safeguard/`

| Composant | Description |
|-----------|-------------|
| `DeferredActionList.tsx` | Liste sidebar des actions programmees |
| `DeferredActionCard.tsx` | Carte avec countdown + indicateur |
| `DeferredActionDetail.tsx` | Detail + bouton Annuler |
| `TabSelector.tsx` | Onglets "En attente" / "Programmees" |

### 3.5 Page Safeguard Modifiee

**Fichier**: `01_WIBOT/wibot-frontend/src/pages/Safeguard.tsx`

```
┌─────────────────────────────────────────────────────────────┐
│  [Header]                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌──────────────────────────────────┐ │
│  │ [Tab: Attente]  │  │                                  │ │
│  │ [Tab: Program.] │  │   RequestDetail                  │ │
│  │                 │  │   ou                             │ │
│  │ RequestList     │  │   DeferredActionDetail           │ │
│  │ ou              │  │                                  │ │
│  │ DeferredList    │  │   (selon onglet actif)           │ │
│  │                 │  │                                  │ │
│  └─────────────────┘  └──────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.6 Mock Data

**Fichier**: `01_WIBOT/wibot-frontend/src/pages/Safeguard.tsx`

```typescript
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
        description: 'Reset MDP suite demande RH'
      }
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
      approval_comment: 'Depart confirme par RH',
      context: {
        ticket_id: 4498,
        client_name: 'Clinique Saint Joseph',
        description: 'Desactivation compte suite depart salarie'
      }
    }
  ];
}
```

---

## Phase 4 : Notifications

### 4.1 Notification lors de l'approbation

```
[Teams] Nouvelle action programmee
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Action: Reset mot de passe AD
Utilisateur: mmartin
Approuve par: tech.dupont

⏰ Execution prevue: 09/01/2026 a 14h30
📍 Annulation possible jusqu'a cette date

[Voir dans le Dashboard]
```

### 4.2 Rappel 1h avant execution

```
[Teams] ⚠️ Rappel - Action dans 1 heure
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Action: Reset mot de passe AD (DEF-2026-001)
Execution dans: 1 heure

[Annuler] [Voir details]
```

### 4.3 Confirmation execution

```
[Teams] ✅ Action executee
━━━━━━━━━━━━━━━━━━━━━━━━
Action: Reset mot de passe AD
Resultat: Succes
Nouveau MDP envoye a l'utilisateur

[Voir le log complet]
```

---

## Ordre d'Implementation Recommande

```
Semaine 1: Backend Core
├── 1.1 Table PostgreSQL
├── 1.2 DeferredActionManager (safeguard_queue.py)
└── 1.3 Endpoints API MCP

Semaine 2: Backend Integration
├── 2.1 Workflow cron n8n
├── 2.2 Modification workflow approve
└── 2.3 Workflows API deferred

Semaine 3: Frontend Core
├── 3.1 Types TypeScript
├── 3.2 Service API
├── 3.3 Store Zustand
└── 3.6 Mock data (pour tests)

Semaine 4: Frontend UI
├── 3.4 Composants (List, Card, Detail)
├── 3.5 Integration page Safeguard
└── 4.x Notifications Teams

Semaine 5: Tests et Documentation
├── Tests integration
├── Tests UI
└── Documentation mise a jour
```

---

## Fichiers a Modifier/Creer

### Backend MCP (02_MCP_SERVER)
| Action | Fichier |
|--------|---------|
| CREER | `migrations/003_deferred_actions.sql` |
| MODIFIER | `src/mcp/safeguard_queue.py` |
| MODIFIER | `src/mcp/server.py` |
| MODIFIER | `src/config.py` (delais par niveau) |

### Backend n8n (01_WIBOT/wibot-backend)
| Action | Fichier |
|--------|---------|
| CREER | `workflows/deferred_executor.json` |
| CREER | `workflows/safeguard_deferred.json` |
| MODIFIER | `workflows/safeguard_actions.json` |

### Frontend (01_WIBOT/wibot-frontend)
| Action | Fichier |
|--------|---------|
| MODIFIER | `src/components/safeguard/types.ts` |
| MODIFIER | `src/services/safeguard.ts` |
| MODIFIER | `src/store/safeguardStore.ts` |
| CREER | `src/components/safeguard/DeferredActionList.tsx` |
| CREER | `src/components/safeguard/DeferredActionCard.tsx` |
| CREER | `src/components/safeguard/DeferredActionDetail.tsx` |
| CREER | `src/components/safeguard/TabSelector.tsx` |
| MODIFIER | `src/pages/Safeguard.tsx` |
| MODIFIER | `src/components/safeguard/index.ts` |

---

## Criteres de Validation

- [ ] Table PostgreSQL creee et fonctionnelle
- [ ] Approbation L3 cree une action differee (pas d'execution immediate)
- [ ] Liste des actions differees visible dans le Dashboard
- [ ] Bouton "Annuler" fonctionnel pendant la periode d'attente
- [ ] Countdown affiche correctement le temps restant
- [ ] Cron execute les actions a l'heure prevue
- [ ] Notifications Teams envoyees (approbation, rappel, execution)
- [ ] Mock data avec 2 exemples fonctionnels
- [ ] L1/L2 conservent le comportement immediat
