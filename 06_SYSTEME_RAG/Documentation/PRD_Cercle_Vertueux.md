# PRD : Cercle Vertueux WIDIP
## Product Requirements Document - Système d'Apprentissage Continu

> **Version** : 1.0 | **Statut** : Draft | **Date** : Janvier 2026

---

## 1. Résumé Exécutif

### Objectif

Permettre à l'IA WIDIP d'apprendre de nouvelles procédures de manière contrôlée, en transformant les tickets GLPI résolus en procédures réutilisables validées par un humain N3.

### Proposition de Valeur

| Avant | Après |
|-------|-------|
| IA limitée aux tâches codées en dur | IA apprend continuellement |
| Procédures créées manuellement | Procédures suggérées par IA |
| Pas de contrôle qualité | Validation humaine obligatoire |
| Autonomie stagne à ~50% | Autonomie croissante → 85% |

### Flux Principal

```
Ticket GLPI résolu → IA analyse → Suggestion créée → N3 valide → Fichier .md créé → RAG ingestion → IA peut exécuter
```

---

## 2. Contexte et Problème

### Situation Actuelle

Les workflows assistant ticket (WIDIP_Assist_ticket) se limitent aux tâches simples :
- Reset de mot de passe
- Déblocage de compte AD
- Vérifications basiques

**Cause racine** : L'IA ne connaît que les procédures explicitement codées. Elle ne peut pas apprendre de nouvelles compétences automatiquement.

### Impact Business

- Tickets complexes toujours traités manuellement
- Temps technicien non optimisé
- Connaissances perdues quand un technicien part
- Pas de capitalisation sur l'expérience collective

---

## 3. Solution Proposée

### Architecture Cercle Vertueux

```
┌─────────────────────────────────────────────────────────────────┐
│                    CERCLE VERTUEUX WIDIP                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Cron 19h00 - IA analyse tickets du jour]                      │
│           ↓                                                     │
│  [IA fait le TRI]                                               │
│    • Ticket déjà couvert par procédure existante ? → SKIP       │
│    • Ticket mérite documentation ? → SUGGÈRE                    │
│    • Génère procédure structurée depuis le ticket               │
│           ↓                                                     │
│  [INSERT table pending_procedures]                              │
│    • ticket_id, problem, solution_proposed                      │
│    • procedure_markdown (généré par IA)                         │
│    • status: "pending_review"                                   │
│           ↓                                                     │
│  [Frontend WIBOT - Vue N3]                                      │
│    • Liste des suggestions avec score confiance                 │
│    • Détail complet : ticket source + procédure générée         │
│    • Actions : Valider / Modifier / Rejeter                     │
│           ↓                                                     │
│  [Validation N3]                                                │
│    • ✅ → Créé fichier /procedures/proc_xxx.md                  │
│    • ❌ → Archivé (rejected)                                    │
│           ↓                                                     │
│  [RAG Ingestion - Cron nuit]                                    │
│           ↓                                                     │
│  [DEMAIN - IA sait faire cette procédure]                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Relation avec l'Enrichisseur Existant

**Verdict : GARDER les deux systèmes**

| Enrichisseur (existant) | Cercle Vertueux (nouveau) |
|-------------------------|---------------------------|
| **But** : Base de recherche similarité | **But** : Procédures exécutables par IA |
| **Table** : `widip_knowledge_base` | **Table** : `n8n_vectors` (via `/procedures/`) |
| **Contrôle** : Automatique (quality_score) | **Contrôle** : Validation humaine N3 |
| **Output** : Solutions brutes | **Output** : Procédures structurées |
| **Usage** : "Trouve-moi des cas similaires" | **Usage** : "Exécute cette procédure" |
| **Trigger** : Cron 18h00 | **Trigger** : Cron 19h00 |

**Synergie** : L'IA peut trouver un cas similaire (Enrichisseur) ET une procédure à exécuter (Cercle Vertueux).

```
┌─────────────────────────────────────────────────────────────────┐
│                    TICKETS GLPI RÉSOLUS                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
┌───────────────────────┐       ┌───────────────────────────────┐
│  ENRICHISSEUR (18h)   │       │  CERCLE VERTUEUX (19h)        │
│  Automatique          │       │  Suggestions → Validation N3  │
├───────────────────────┤       ├───────────────────────────────┤
│ • Tous les tickets    │       │ • Tickets "intéressants"      │
│ • Quality score ≥0.4  │       │ • Non couverts par RAG        │
│ • Solutions brutes    │       │ • Procédures structurées      │
└───────────┬───────────┘       └───────────────┬───────────────┘
            │                                   │
            ▼                                   ▼
┌───────────────────────┐       ┌───────────────────────────────┐
│ widip_knowledge_base  │       │ /procedures/*.md → n8n_vectors│
│ (recherche similarité)│       │ (procédures exécutables)      │
└───────────────────────┘       └───────────────────────────────┘
            │                                   │
            └───────────────┬───────────────────┘
                            │
                            ▼
              ┌──────────────────────────────┐
              │        AGENTS IA WIDIP       │
              │  • Similarité (Enrichisseur) │
              │  • Exécution (Cercle Vert.)  │
              └──────────────────────────────┘
```

---

## 4. Utilisateurs et Rôles

| Rôle | Persona | Actions |
|------|---------|---------|
| **IA WIDIP** | Système | Analyse tickets, génère suggestions, exécute procédures |
| **Technicien N3** | Jean, 35 ans, Expert IT | Valide/rejette les suggestions sur WIBOT |
| **Technicien N1-N2** | Marie, 28 ans, Support | Bénéficie des nouvelles procédures IA |

### User Stories

**US1 - Suggestion automatique**
> En tant qu'IA WIDIP, je veux analyser les tickets résolus du jour pour suggérer de nouvelles procédures à apprendre.

**US2 - Validation N3**
> En tant que technicien N3, je veux voir les procédures suggérées avec leur contexte complet pour valider celles qui sont pertinentes.

**US3 - Exécution nouvelle procédure**
> En tant qu'IA WIDIP, je veux exécuter une procédure validée hier pour résoudre un ticket similaire aujourd'hui.

---

## 5. Spécifications Fonctionnelles

### 5.1 Workflow Suggester (Backend)

**Trigger** : Cron quotidien 19h00

**Logique** :
```
1. Récupérer tickets résolus des 24h (GLPI)
2. Pour chaque ticket :
   a. Recherche RAG similarité ≥ 0.75 → SKIP si trouvé
   b. Calcul quality score < 0.5 → SKIP si trop bas
   c. Vérifier pas déjà suggéré → SKIP si existe
   d. Générer procédure via LLM (prompt structuré)
   e. Calculer score de confiance
   f. INSERT pending_procedures
3. Notification Teams si nouvelles suggestions
```

**Score de Confiance** :
| Critère | Points |
|---------|--------|
| Solution ≥ 200 chars | +0.40 |
| Étapes numérotées | +0.20 |
| Description ≥ 50 chars | +0.15 |
| Catégorie identifiée | +0.10 |
| Pas de mots vides | +0.15 |

Affichage : 🟢 >80% | 🟡 50-80% | 🔴 <50%

### 5.2 Interface Frontend WIBOT

**Nouvelle section** : "Cercle Vertueux" (accessible N3+)

**Page Liste** :
- Filtres : Statut, Confiance, Catégorie
- Cards avec : Titre, Ticket source, Score confiance, Date
- Badge similarité si proche d'une procédure existante

**Page Détail** :
- Section "Ticket Source" : ID GLPI (lien), titre, description, solution
- Section "Procédure Suggérée" : Markdown preview, score confiance
- Actions : Valider / Modifier / Rejeter (avec commentaire)

**Dashboard Stats** :
- Suggestions ce mois : X suggérées, Y validées, Z rejetées
- Procédures actives : Total dans RAG
- Impact : Tickets résolus par IA ce mois
- Alertes : Procédures avec échecs, jamais utilisées

### 5.3 MCP Tools

| Tool | SAFEGUARD | Description |
|------|-----------|-------------|
| `procedure_get_pending` | L0 | Liste suggestions en attente |
| `procedure_get_details` | L0 | Détail d'une suggestion |
| `procedure_approve` | L2 | Valider → crée fichier .md |
| `procedure_reject` | L1 | Rejeter avec raison |
| `procedure_modify` | L2 | Modifier avant validation |
| `procedure_get_stats` | L0 | Stats du cercle vertueux |

---

## 6. Spécifications Techniques

### 6.1 Base de Données

**Nouvelle table : `pending_procedures`**

```sql
CREATE TABLE pending_procedures (
    id SERIAL PRIMARY KEY,

    -- Source
    ticket_id VARCHAR(50) NOT NULL,
    ticket_title TEXT NOT NULL,
    ticket_description TEXT,
    ticket_solution TEXT,
    ticket_category VARCHAR(100),
    ticket_resolved_at TIMESTAMP,
    ticket_resolved_by VARCHAR(100),

    -- Procédure suggérée
    procedure_title VARCHAR(255) NOT NULL,
    procedure_markdown TEXT NOT NULL,
    procedure_category VARCHAR(100),
    procedure_tags TEXT[],
    procedure_safeguard_level VARCHAR(10),
    procedure_prerequisites TEXT[],
    procedure_estimated_time INTEGER,

    -- Scoring
    confidence_score FLOAT NOT NULL,
    similarity_to_existing FLOAT,
    similar_procedure_id VARCHAR(100),

    -- Workflow
    status VARCHAR(50) DEFAULT 'pending_review',
    suggested_at TIMESTAMP DEFAULT NOW(),
    reviewed_at TIMESTAMP,
    reviewed_by VARCHAR(100),
    review_comment TEXT,

    -- Fichier généré
    generated_filename VARCHAR(255),
    generated_at TIMESTAMP,

    -- Tracking
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### 6.2 Structure Frontend

Basé sur le pattern existant (`GUIDE_FRONTEND.md`) :

```
src/
├── store/
│   └── procedureStore.ts       # Nouveau (pattern safeguardStore)
│
├── services/
│   └── procedure.ts            # Nouveau (pattern safeguard.ts)
│
├── pages/
│   └── CercleVertueux/         # Nouveau
│       ├── index.tsx           # Layout principal
│       ├── PendingList.tsx     # Liste des suggestions
│       ├── ProcedureDetail.tsx # Validation/Rejet
│       └── Dashboard.tsx       # Stats cercle vertueux
│
├── components/
│   └── cercleVertueux/         # Nouveau
│       ├── ProcedureCard.tsx
│       ├── ProcedurePreview.tsx
│       ├── ConfidenceBadge.tsx
│       └── StatsCards.tsx
│
└── types/
    └── procedure.ts            # Interface PendingProcedure
```

**Route à ajouter** :
```tsx
// App.tsx
<Route path="/cercle-vertueux" element={
  <AdminRoute requiredLevel="N3">
    <CercleVertueux />
  </AdminRoute>
} />
```

**Store Zustand** :
```typescript
// procedureStore.ts
interface ProcedureStore {
  // State
  procedures: PendingProcedure[];
  selectedId: string | null;
  pendingCount: number;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchPending: () => Promise<void>;
  selectProcedure: (id: string) => void;
  approveProcedure: (id: string) => Promise<void>;
  rejectProcedure: (id: string, reason: string) => Promise<void>;
  fetchStats: () => Promise<ProcedureStats>;
}
```

### 6.3 Workflow n8n

**Fichier** : `WIDIP_Procedure_Suggester.json`

```
[Cron 19h00]
      ↓
[MCP: glpi_get_resolved_tickets] hours_since=24
      ↓
[Loop: Pour chaque ticket]
      ├─→ [MCP: memory_search_similar] → Skip si sim ≥ 0.75
      ├─→ [Code: Calculate quality] → Skip si < 0.5
      ├─→ [Postgres: Check exists] → Skip si déjà suggéré
      ├─→ [AI: Generate procedure] → Prompt structuré
      ├─→ [Code: Calculate confidence]
      └─→ [Postgres: INSERT pending_procedures]
      ↓
[Code: Count new suggestions]
      ↓
[If count > 0]
      └─→ [MCP: notify_teams] "X nouvelles procédures à valider"
```

---

## 7. Plan d'Implémentation

### Phase 1 : Fondations (Semaine 1)

| Tâche | Effort | Owner |
|-------|--------|-------|
| Migration SQL `pending_procedures` | S | Backend |
| MCP Tools `procedure_*.py` | M | Backend |
| Tests unitaires tools | S | Backend |

**Livrable** : API fonctionnelle pour CRUD procédures

### Phase 2 : Workflow Suggester (Semaine 2)

| Tâche | Effort | Owner |
|-------|--------|-------|
| Workflow n8n `Procedure_Suggester` | M | Backend |
| Prompt LLM génération procédure | S | Backend |
| Tests end-to-end | M | Backend |

**Livrable** : Suggestions générées automatiquement chaque soir

### Phase 3 : Frontend Validation (Semaine 3-4)

| Tâche | Effort | Owner |
|-------|--------|-------|
| Store + Service procedure | S | Frontend |
| Page PendingList | M | Frontend |
| Page ProcedureDetail | M | Frontend |
| Intégration routing | S | Frontend |

**Livrable** : N3 peut valider/rejeter sur WIBOT

### Phase 4 : Dashboard & Polish (Semaine 5)

| Tâche | Effort | Owner |
|-------|--------|-------|
| Dashboard stats | M | Frontend |
| Notifications Teams | S | Backend |
| Documentation utilisateur | S | Tous |

**Livrable** : Système complet en production

### Phase 5 : Feedback Loop (Semaine 6+)

| Tâche | Effort | Owner |
|-------|--------|-------|
| Tracking usage procédures | M | Backend |
| Alertes échecs | S | Backend |
| Archivage auto obsolètes | S | Backend |

**Livrable** : Système auto-améliorant

---

## 8. Critères de Succès

### KPIs Quantitatifs

| KPI | Baseline | M+3 | M+6 | M+12 |
|-----|----------|-----|-----|------|
| Procédures dans RAG | 0 | 50 | 150 | 350 |
| Suggestions/semaine | - | 15 | 20 | 25 |
| Taux validation N3 | - | >70% | >75% | >80% |
| Délai review moyen | - | <24h | <12h | <8h |
| Autonomie IA (tickets) | 50% | 65% | 75% | 85% |

### KPIs Qualitatifs

- [ ] N3 trouve l'interface intuitive
- [ ] Procédures générées sont pertinentes
- [ ] Pas de procédure dangereuse validée par erreur
- [ ] Feedback loop détecte les procédures défaillantes

---

## 9. Risques et Mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Fatigue validateur (trop de suggestions) | Moyenne | Haut | Limiter à 10/jour, prioriser par confiance |
| Procédures obsolètes | Moyenne | Moyen | Tracking usage, archivage auto 90j |
| Doublons sémantiques | Faible | Faible | Anti-doublon RAG sim ≥ 0.75 |
| Qualité procédures générées | Moyenne | Moyen | Score confiance, review N3 obligatoire |
| Adoption N3 faible | Faible | Haut | Notifications, dashboard impact visible |

---

## 10. Dépendances

### Systèmes Existants Requis

- [x] GLPI API (tickets résolus)
- [x] MCP Server (tools infrastructure)
- [x] PostgreSQL + pgvector (stockage)
- [x] n8n (workflows)
- [x] Frontend WIBOT (interface validation)
- [x] RAG Ingestion (intégration procédures)

### Nouvelles Dépendances

- [ ] LLM pour génération procédures (Claude/GPT via MCP)
- [ ] Webhook RAG ingestion déclenché à validation

---

## 11. Hors Scope (v1.0)

- Modification de procédures existantes
- Versioning des procédures
- Multi-langue
- Import/Export bulk
- Approbation multi-niveau (un seul N3 suffit)

---

## 12. Annexes

### A. Fichiers à Créer

```
06_SYSTEME_RAG/
├── Workflows/
│   └── WIDIP_Procedure_Suggester.json    # Nouveau

02_MCP_SERVER/
├── src/tools/
│   └── procedure_tools.py                 # Nouveau
├── migrations/
│   └── 002_add_pending_procedures.sql     # Nouveau

01_WIBOT/wibot-frontend/
└── src/
    ├── store/procedureStore.ts            # Nouveau
    ├── services/procedure.ts              # Nouveau
    ├── pages/CercleVertueux/              # Nouveau
    └── components/cercleVertueux/         # Nouveau
```

### B. Documents Liés

- `WIDIP_Cercle_Vertueux.md` - Spécification technique détaillée
- `Systeme_RAG.md` - Architecture RAG globale
- `WIDIP_Enrichisseur_v1.md` - Workflow enrichisseur existant
- `GUIDE_FRONTEND.md` - Guide technique frontend WIBOT

---

**Auteur** : WIDIP Team
**Dernière MAJ** : Janvier 2026
**Version** : 1.0
