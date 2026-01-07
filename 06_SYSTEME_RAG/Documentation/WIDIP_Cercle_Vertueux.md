# WIDIP - Cercle Vertueux
## Système d'Apprentissage Continu sous Contrôle Humain

> **Version** : 1.0 | **Statut** : Spécification | **Dernière MAJ** : Janvier 2026

---

## 1. Vision

### Le Problème

Actuellement, les workflows assistant ticket (WIDIP_Assist_ticket) se limitent aux tâches simples :
- Reset de mot de passe
- Déblocage de compte AD
- Vérifications basiques

**Pourquoi ?** L'IA ne connaît que les procédures qu'on lui a explicitement données. Elle ne peut pas apprendre de nouvelles compétences automatiquement.

### La Solution : Le Cercle Vertueux

Un système où **l'IA propose** et **l'humain valide** les nouvelles procédures à apprendre.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│    AUJOURD'HUI                         DEMAIN                   │
│    ───────────                         ──────                   │
│                                                                 │
│    Technicien résout                   IA reçoit ticket         │
│    ticket complexe                     similaire                │
│         ↓                                   ↓                   │
│    IA analyse et                       IA trouve procédure      │
│    suggère procédure                   dans RAG                 │
│         ↓                                   ↓                   │
│    N3 valide sur                       IA exécute sous          │
│    Frontend WIBOT                      contrôle SAFEGUARD       │
│         ↓                                   ↓                   │
│    Procédure ajoutée                   Ticket résolu            │
│    au RAG                              automatiquement          │
│                                                                 │
│    ════════════════════════════════════════════════════════    │
│                    APPRENTISSAGE PERMANENT                      │
└─────────────────────────────────────────────────────────────────┘
```

### Principes Fondamentaux

| Principe | Description |
|----------|-------------|
| **Human-in-the-loop** | Aucune procédure n'entre dans le RAG sans validation humaine |
| **Qualité > Quantité** | Mieux vaut 5 bonnes procédures/semaine que 50 médiocres |
| **Traçabilité** | Chaque procédure est liée à son ticket source GLPI |
| **Progressivité** | L'IA monte en compétence organiquement au fil du temps |

---

## 2. Architecture Globale

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOURCES DE DONNÉES                           │
│                                                                 │
│    [GLPI - Tickets résolus du jour]                             │
│              │                                                  │
│              ▼                                                  │
├─────────────────────────────────────────────────────────────────┤
│                    PHASE 1 : ANALYSE IA                         │
│                                                                 │
│    [Workflow: WIDIP_Procedure_Suggester]                        │
│              │                                                  │
│              ├─→ Ticket déjà couvert ? ──→ SKIP                 │
│              │   (recherche RAG similarité >= 0.75)             │
│              │                                                  │
│              ├─→ Ticket trop pauvre ? ──→ SKIP                  │
│              │   (quality_score < 0.5)                          │
│              │                                                  │
│              └─→ Ticket intéressant ? ──→ SUGGÈRE               │
│                  │                                              │
│                  ▼                                              │
│    [Génération procédure structurée par IA]                     │
│              │                                                  │
│              ▼                                                  │
│    [INSERT pending_procedures]                                  │
│    status: "pending_review"                                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                    PHASE 2 : VALIDATION HUMAINE                 │
│                                                                 │
│    [Frontend WIBOT - Interface N3]                              │
│              │                                                  │
│              ├─→ ✅ Valider ──→ Créé fichier .md                │
│              │                  dans /procedures/               │
│              │                                                  │
│              ├─→ ✏️ Modifier ──→ Édition puis validation        │
│              │                                                  │
│              └─→ ❌ Rejeter ──→ Archivé (status: rejected)      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                    PHASE 3 : INTÉGRATION RAG                    │
│                                                                 │
│    [Webhook déclenché à validation]                             │
│              │                                                  │
│              ▼                                                  │
│    [WIDIP_rag_ingestion]                                        │
│    path: /procedures/                                           │
│              │                                                  │
│              ▼                                                  │
│    [PostgreSQL n8n_vectors]                                     │
│    Procédure disponible pour l'IA                               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                    PHASE 4 : UTILISATION                        │
│                                                                 │
│    [Ticket similaire arrive]                                    │
│              │                                                  │
│              ▼                                                  │
│    [WIDIP_Assist_ticket]                                        │
│    memory_search_similar_cases()                                │
│              │                                                  │
│              ▼                                                  │
│    [Procédure trouvée dans RAG]                                 │
│              │                                                  │
│              ▼                                                  │
│    [Exécution sous contrôle SAFEGUARD]                          │
│    L1-L2: Auto | L3+: Validation humaine                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Composants Techniques

### 3.1 Table `pending_procedures`

Nouvelle table pour stocker les suggestions en attente de validation.

```sql
CREATE TABLE pending_procedures (
    id SERIAL PRIMARY KEY,

    -- Source
    ticket_id VARCHAR(50) NOT NULL,          -- ID ticket GLPI source
    ticket_title TEXT NOT NULL,               -- Titre du ticket
    ticket_description TEXT,                  -- Description complète
    ticket_solution TEXT,                     -- Solution appliquée par technicien
    ticket_category VARCHAR(100),             -- Catégorie GLPI
    ticket_resolved_at TIMESTAMP,             -- Date résolution
    ticket_resolved_by VARCHAR(100),          -- Technicien qui a résolu

    -- Procédure suggérée par IA
    procedure_title VARCHAR(255) NOT NULL,    -- Titre procédure suggérée
    procedure_markdown TEXT NOT NULL,         -- Contenu complet en Markdown
    procedure_category VARCHAR(100),          -- Catégorie suggérée
    procedure_tags TEXT[],                    -- Tags suggérés
    procedure_safeguard_level VARCHAR(10),    -- Niveau SAFEGUARD requis (L1-L4)
    procedure_prerequisites TEXT[],           -- Prérequis (accès, droits, etc.)
    procedure_estimated_time INTEGER,         -- Temps estimé en minutes

    -- Scoring IA
    confidence_score FLOAT NOT NULL,          -- Score confiance IA (0.0-1.0)
    similarity_to_existing FLOAT,             -- Similarité max avec procédures existantes
    similar_procedure_id VARCHAR(100),        -- ID procédure similaire si trouvée

    -- Workflow
    status VARCHAR(50) DEFAULT 'pending_review',
    -- pending_review | approved | rejected | modified

    suggested_at TIMESTAMP DEFAULT NOW(),     -- Date suggestion IA
    reviewed_at TIMESTAMP,                    -- Date review humain
    reviewed_by VARCHAR(100),                 -- Qui a validé/rejeté
    review_comment TEXT,                      -- Commentaire du reviewer

    -- Fichier généré (si approuvé)
    generated_filename VARCHAR(255),          -- proc_xxx.md
    generated_at TIMESTAMP,                   -- Date création fichier

    -- Tracking utilisation (post-création)
    usage_count INTEGER DEFAULT 0,            -- Nombre de fois utilisée par IA
    last_used_at TIMESTAMP,                   -- Dernière utilisation
    success_count INTEGER DEFAULT 0,          -- Utilisations réussies
    failure_count INTEGER DEFAULT 0,          -- Utilisations échouées

    -- Métadonnées
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour recherche rapide
CREATE INDEX idx_pending_status ON pending_procedures(status);
CREATE INDEX idx_pending_ticket ON pending_procedures(ticket_id);
CREATE INDEX idx_pending_confidence ON pending_procedures(confidence_score DESC);
CREATE INDEX idx_pending_suggested ON pending_procedures(suggested_at DESC);
```

### 3.2 Workflow `WIDIP_Procedure_Suggester`

Workflow n8n qui analyse les tickets du jour et génère des suggestions.

```
Trigger: Cron quotidien (ex: 19h00, après l'enrichisseur de 18h00)

Étapes:
1. [MCP: glpi_get_resolved_tickets]
   hours_since: 24
   limit: 100

2. [Pour chaque ticket]

   2a. [Vérifier si procédure similaire existe]
       MCP: memory_search_similar_cases(ticket.title + ticket.solution)
       Si similarité >= 0.75 → SKIP (déjà couvert)

   2b. [Calculer qualité du ticket source]
       - Solution >= 50 chars ?
       - Description présente ?
       - Pas une solution vide ("fait", "ok") ?
       Si quality < 0.5 → SKIP (ticket trop pauvre)

   2c. [Vérifier si pas déjà suggéré]
       SELECT FROM pending_procedures WHERE ticket_id = ?
       Si existe → SKIP

   2d. [Générer procédure via LLM]
       Prompt structuré → Markdown formaté
       (Voir section 3.3)

   2e. [Calculer score de confiance]
       Basé sur qualité ticket + clarté solution

   2f. [INSERT pending_procedures]
       status: pending_review

3. [Notification si nouvelles suggestions]
   Si count > 0 → Teams "X nouvelles procédures à valider"
```

### 3.3 Génération de Procédure (Prompt LLM)

Template de prompt pour générer une procédure structurée :

```
Tu es un expert en documentation technique IT.
À partir du ticket GLPI suivant, génère une procédure réutilisable.

## Ticket Source
- ID: {ticket_id}
- Titre: {ticket_title}
- Description: {ticket_description}
- Solution appliquée: {ticket_solution}
- Catégorie: {ticket_category}

## Instructions
Génère une procédure au format Markdown avec:
1. Un titre clair et concis
2. Une section "Symptômes" (quand appliquer cette procédure)
3. Une section "Prérequis" (accès nécessaires, outils)
4. Une section "Procédure" avec étapes numérotées
5. Une section "Vérification" (comment confirmer le succès)
6. Une section "Rollback" si applicable (comment annuler)

## Contraintes
- Rester factuel, basé uniquement sur le ticket
- Étapes claires et actionnables
- Inclure les commandes/chemins exacts si mentionnés
- Ne pas inventer d'informations non présentes dans le ticket

## Format de sortie
```markdown
# {Titre de la procédure}

## Métadonnées
- Catégorie: {catégorie}
- Niveau SAFEGUARD: {L1|L2|L3|L4}
- Temps estimé: {X} minutes
- Prérequis: {liste}

## Symptômes
{Quand appliquer cette procédure}

## Procédure
1. {Étape 1}
2. {Étape 2}
...

## Vérification
{Comment confirmer le succès}

## Rollback
{Comment annuler si nécessaire}

## Source
- Ticket GLPI: #{ticket_id}
- Date: {date}
```
```

### 3.4 MCP Tools

Nouveaux tools à créer dans `enrichisseur_tools.py` ou nouveau fichier `procedure_tools.py` :

| Tool | SAFEGUARD | Description |
|------|-----------|-------------|
| `procedure_get_pending` | L0 | Liste les procédures en attente de validation |
| `procedure_get_details` | L0 | Détails complets d'une suggestion |
| `procedure_approve` | L2 | Approuve et génère le fichier .md |
| `procedure_reject` | L1 | Rejette une suggestion |
| `procedure_modify` | L2 | Modifie le contenu avant approbation |
| `procedure_get_stats` | L0 | Stats du cercle vertueux |

---

## 4. Interface Frontend WIBOT

### 4.1 Vue Liste (N3)

```
┌─────────────────────────────────────────────────────────────────┐
│  WIBOT > Cercle Vertueux > Procédures à Valider                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📊 Résumé : 7 en attente | 23 validées ce mois | 4 rejetées   │
│                                                                 │
│  ┌─ Filtres ──────────────────────────────────────────────────┐ │
│  │ Statut: [Pending ▼]  Confiance: [Tous ▼]  Catégorie: [All] │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 🟢 Config VPN split tunneling                    [Détails] ││
│  │    Ticket #45892 | Confiance: 92% | Catégorie: VPN         ││
│  │    Suggéré: il y a 2h | Par: IA                            ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ 🟢 Réinitialisation imprimante HP série 400      [Détails] ││
│  │    Ticket #45887 | Confiance: 88% | Catégorie: Imprimante  ││
│  │    Suggéré: il y a 3h | Par: IA                            ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ 🟡 Migration boîte mail vers Exchange Online     [Détails] ││
│  │    Ticket #45879 | Confiance: 67% | Catégorie: Messagerie  ││
│  │    Suggéré: il y a 5h | Par: IA                            ││
│  │    ⚠️ Similarité 72% avec proc_migration_mail.md           ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ 🔴 Problème connexion réseau site distant        [Détails] ││
│  │    Ticket #45871 | Confiance: 45% | Catégorie: Réseau      ││
│  │    Suggéré: hier | Par: IA                                 ││
│  │    ⚠️ Solution source peu détaillée                        ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Légende: 🟢 Haute confiance (>80%) 🟡 Moyenne (50-80%) 🔴 Basse│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Vue Détail (Validation)

```
┌─────────────────────────────────────────────────────────────────┐
│  WIBOT > Cercle Vertueux > Détail Procédure #127                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ TICKET SOURCE ────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │  Ticket GLPI: #45892                    [🔗 Voir dans GLPI]│ │
│  │  Titre: Client ne peut pas accéder à SharePoint en VPN     │ │
│  │  Catégorie: VPN / Fortinet                                 │ │
│  │  Résolu par: Jean Dupont | Le: 07/01/2026 14:32            │ │
│  │                                                            │ │
│  │  Description:                                              │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │ Le client ACME signale que depuis la mise en place   │  │ │
│  │  │ du VPN, les utilisateurs ne peuvent plus accéder à   │  │ │
│  │  │ SharePoint Online. Accès OK sans VPN.                │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                                                            │ │
│  │  Solution appliquée:                                       │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │ Configuration split tunneling sur Fortinet:          │  │ │
│  │  │ 1. Accès console FortiGate                           │  │ │
│  │  │ 2. VPN > SSL-VPN Settings > Split Tunnel             │  │ │
│  │  │ 3. Ajout routes Microsoft 365 (cf. endpoints MS)     │  │ │
│  │  │ 4. Application policy                                │  │ │
│  │  │ 5. Test OK avec utilisateur                          │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ PROCÉDURE SUGGÉRÉE PAR IA ────────────────────────────────┐ │
│  │                                                            │ │
│  │  Confiance IA: 92% 🟢                                      │ │
│  │  Similarité max: 34% (pas de doublon détecté)              │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │ # Configuration Split Tunneling VPN Fortinet         │  │ │
│  │  │                                                      │  │ │
│  │  │ ## Métadonnées                                       │  │ │
│  │  │ - Catégorie: VPN / Fortinet                          │  │ │
│  │  │ - Niveau SAFEGUARD: L2 (modification réseau)         │  │ │
│  │  │ - Temps estimé: 15 minutes                           │  │ │
│  │  │ - Prérequis: Accès console FortiGate                 │  │ │
│  │  │                                                      │  │ │
│  │  │ ## Symptômes                                         │  │ │
│  │  │ - Utilisateurs VPN ne peuvent pas accéder à des      │  │ │
│  │  │   services cloud (M365, SharePoint, Teams)           │  │ │
│  │  │ - Accès OK sans VPN                                  │  │ │
│  │  │                                                      │  │ │
│  │  │ ## Procédure                                         │  │ │
│  │  │ 1. Se connecter à la console FortiGate               │  │ │
│  │  │ 2. Aller dans VPN > SSL-VPN Settings                 │  │ │
│  │  │ 3. Activer Split Tunnel si désactivé                 │  │ │
│  │  │ 4. Dans Routing Address, ajouter les plages M365     │  │ │
│  │  │    (voir endpoints.office.com)                       │  │ │
│  │  │ 5. Appliquer la policy                               │  │ │
│  │  │ 6. Demander à l'utilisateur de se reconnecter        │  │ │
│  │  │                                                      │  │ │
│  │  │ ## Vérification                                      │  │ │
│  │  │ - Utilisateur connecté au VPN peut accéder à         │  │ │
│  │  │   SharePoint/Teams                                   │  │ │
│  │  │                                                      │  │ │
│  │  │ ## Source                                            │  │ │
│  │  │ - Ticket GLPI: #45892                                │  │ │
│  │  │ - Date: 07/01/2026                                   │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                                                            │ │
│  │  [✏️ Modifier le contenu]                                  │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ ACTIONS ──────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │  Commentaire (optionnel):                                  │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │                                                      │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                                                            │ │
│  │  [✅ Valider et Créer Procédure]  [❌ Rejeter]             │ │
│  │                                                            │ │
│  │  Nom fichier généré: proc_vpn_split_tunnel_fortinet.md     │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Dashboard Stats

```
┌─────────────────────────────────────────────────────────────────┐
│  WIBOT > Cercle Vertueux > Dashboard                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ CE MOIS ──────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │   📥 Suggérées    📋 En attente    ✅ Validées   ❌ Rejetées│ │
│  │      47              7               35            5       │ │
│  │                                                            │ │
│  │   Taux validation: 87.5%                                   │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ IMPACT ───────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │   📚 Total procédures RAG: 127                             │ │
│  │   🤖 Tickets résolus par IA ce mois: 89                    │ │
│  │   📈 Évolution autonomie: +12% vs mois dernier             │ │
│  │                                                            │ │
│  │   Top procédures utilisées:                                │ │
│  │   1. proc_reset_password_ad.md (34 utilisations)           │ │
│  │   2. proc_vpn_connexion.md (28 utilisations)               │ │
│  │   3. proc_imprimante_reset.md (19 utilisations)            │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ PROCÉDURES À REVOIR ──────────────────────────────────────┐ │
│  │                                                            │ │
│  │   ⚠️ Procédures avec échecs récents:                       │ │
│  │   - proc_exchange_migration.md (3 échecs / 5 utilisations) │ │
│  │                                                            │ │
│  │   ⚠️ Procédures jamais utilisées (>30 jours):              │ │
│  │   - proc_fax_config.md (créée il y a 45 jours)             │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Flux de Validation Détaillé

### 5.1 Scénario : Validation Standard

```
1. [19:00] Cron WIDIP_Procedure_Suggester
   → Analyse 45 tickets résolus du jour
   → 38 déjà couverts par procédures existantes (SKIP)
   → 4 tickets trop pauvres en contenu (SKIP)
   → 3 tickets intéressants → 3 suggestions créées

2. [19:01] Notification Teams
   "📋 3 nouvelles procédures à valider sur WIBOT"

3. [Lendemain matin] N3 ouvre WIBOT
   → Voit 3 procédures en attente
   → Clique sur la première (confiance 92%)

4. [Review] N3 examine :
   → Ticket source : OK, solution claire
   → Procédure générée : OK, bien structurée
   → Clic "Valider"

5. [Validation] Système :
   → Crée fichier /procedures/proc_vpn_split_tunnel.md
   → UPDATE pending_procedures SET status = 'approved'
   → Déclenche webhook RAG ingestion
   → Log audit : "Procédure #127 validée par jean.dupont"

6. [Nuit suivante] Cron RAG ingestion
   → Ingère le nouveau fichier
   → Disponible dans n8n_vectors

7. [Jour suivant] Ticket similaire arrive
   → IA trouve la procédure
   → Propose/exécute sous SAFEGUARD
```

### 5.2 Scénario : Modification Avant Validation

```
1. N3 examine une suggestion (confiance 67%)
   → Procédure générée incomplète
   → Clic "Modifier"

2. [Éditeur Markdown]
   → N3 corrige/complète la procédure
   → Ajoute des détails manquants
   → Clic "Sauvegarder"

3. [Re-review]
   → N3 vérifie le résultat
   → Clic "Valider"

4. [Suite identique au scénario standard]
```

### 5.3 Scénario : Rejet

```
1. N3 examine une suggestion (confiance 45%)
   → Ticket source trop vague
   → Solution non réutilisable (cas trop spécifique)

2. N3 ajoute commentaire : "Cas trop spécifique au client X"
   → Clic "Rejeter"

3. [Système]
   → UPDATE pending_procedures SET status = 'rejected'
   → Log audit
   → Procédure archivée (pas supprimée, pour analyse future)
```

---

## 6. Mécanismes de Qualité

### 6.1 Anti-Doublon

Avant de suggérer une nouvelle procédure, l'IA vérifie :

```
1. Recherche RAG : memory_search_similar_cases(ticket.title + ticket.solution)

2. Si similarité >= 0.75 :
   → SKIP, procédure similaire existe
   → Log : "Ticket #X couvert par proc_yyy.md (sim: 82%)"

3. Si similarité entre 0.50 et 0.75 :
   → SUGGÈRE avec warning
   → Affiche dans UI : "⚠️ Similarité 68% avec proc_yyy.md"
   → N3 décide : nouvelle procédure ou enrichir l'existante

4. Si similarité < 0.50 :
   → SUGGÈRE normalement
   → Nouvelle procédure distincte
```

### 6.2 Score de Confiance IA

Calcul du score de confiance pour chaque suggestion :

```python
def calculate_confidence_score(ticket):
    score = 0.0

    # Qualité de la solution source (0-0.40)
    solution_length = len(ticket.solution)
    if solution_length >= 200:
        score += 0.40
    elif solution_length >= 100:
        score += 0.30
    elif solution_length >= 50:
        score += 0.20

    # Présence d'étapes numérotées (0-0.20)
    if has_numbered_steps(ticket.solution):
        score += 0.20

    # Description du ticket présente (0-0.15)
    if len(ticket.description) >= 50:
        score += 0.15

    # Catégorie identifiée (0-0.10)
    if ticket.category and ticket.category != "Autre":
        score += 0.10

    # Pas de mots "vides" dans solution (0-0.15)
    empty_words = ["fait", "ok", "résolu", "done", "test"]
    if not any(word in ticket.solution.lower() for word in empty_words):
        score += 0.15

    return min(score, 1.0)
```

Affichage dans l'UI :
- 🟢 **Haute confiance** (> 0.80) : Validation rapide recommandée
- 🟡 **Moyenne** (0.50 - 0.80) : Review attentive nécessaire
- 🔴 **Basse** (< 0.50) : Review approfondie, probable rejet

### 6.3 Feedback Loop Post-Utilisation

Quand l'IA utilise une procédure du RAG :

```
1. [Exécution] IA applique proc_xxx.md sur ticket #Y

2. [Tracking] Log dans pending_procedures :
   UPDATE SET
     usage_count = usage_count + 1,
     last_used_at = NOW()

3. [Résultat ticket]
   - Si ticket résolu → success_count += 1
   - Si ticket escaladé/échoué → failure_count += 1

4. [Alertes automatiques]
   Si failure_count / usage_count > 0.3 :
   → Notification N3 : "Procédure X a 35% d'échecs, review nécessaire"
   → Apparaît dans Dashboard "Procédures à revoir"
```

### 6.4 Cycle de Vie des Procédures

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   DRAFT     │ ───→ │   ACTIVE    │ ───→ │  ARCHIVED   │
│  (pending)  │      │ (validated) │      │ (obsolete)  │
└─────────────┘      └─────────────┘      └─────────────┘
      │                    │                     │
      │                    │                     │
      ▼                    ▼                     ▼
   Validation           En usage              Plus utilisée
   humaine N3           par IA                ou obsolète
```

Critères d'archivage automatique (suggestion) :
- Jamais utilisée depuis 90 jours
- Taux d'échec > 50% sur 10+ utilisations
- Marquée manuellement comme obsolète

---

## 7. Configuration

### 7.1 Variables d'Environnement

```bash
# Cercle Vertueux
PROCEDURE_SUGGESTER_ENABLED=true
PROCEDURE_SUGGESTER_CRON="0 19 * * *"        # 19h00 quotidien
PROCEDURE_MIN_CONFIDENCE=0.40                 # Seuil minimum pour suggérer
PROCEDURE_SIMILARITY_THRESHOLD=0.75           # Seuil anti-doublon
PROCEDURE_MAX_SUGGESTIONS_PER_DAY=10          # Limite fatigue validateur
PROCEDURE_OUTPUT_PATH=/home/node/.n8n-files/rag-documents/procedures

# Notifications
PROCEDURE_NOTIFY_TEAMS=true
PROCEDURE_NOTIFY_CHANNEL=widip-n3
```

### 7.2 Paramètres Ajustables

| Paramètre | Valeur défaut | Description |
|-----------|---------------|-------------|
| `min_confidence` | 0.40 | Score minimum pour créer une suggestion |
| `similarity_threshold` | 0.75 | Seuil pour considérer doublon |
| `max_per_day` | 10 | Max suggestions/jour (évite fatigue) |
| `review_reminder_days` | 3 | Rappel si procédure non reviewée |
| `archive_unused_days` | 90 | Archive si jamais utilisée |
| `failure_alert_threshold` | 0.30 | Alerte si taux échec > 30% |

---

## 8. Sécurité et Audit

### 8.1 Permissions

| Action | Rôle minimum | SAFEGUARD |
|--------|--------------|-----------|
| Voir suggestions | N2 | L0 |
| Valider procédure | N3 | L2 |
| Modifier procédure | N3 | L2 |
| Rejeter procédure | N3 | L1 |
| Archiver procédure | N3 | L2 |
| Voir dashboard | N2 | L0 |

### 8.2 Audit Trail

Chaque action est loggée :

```json
{
  "timestamp": "2026-01-07T09:15:32Z",
  "action": "procedure_approved",
  "procedure_id": 127,
  "ticket_id": "45892",
  "user": "jean.dupont",
  "user_role": "N3",
  "comment": "Procédure claire et réutilisable",
  "generated_file": "proc_vpn_split_tunnel.md",
  "ip_address": "192.168.1.45"
}
```

---

## 9. Métriques et KPIs

### 9.1 KPIs du Cercle Vertueux

| KPI | Description | Cible |
|-----|-------------|-------|
| **Suggestions/jour** | Nombre moyen de suggestions générées | 3-10 |
| **Taux validation** | % de suggestions validées | > 70% |
| **Délai review** | Temps moyen avant validation | < 24h |
| **Procédures actives** | Total procédures dans RAG | Croissant |
| **Taux utilisation** | % procédures utilisées au moins 1x | > 80% |
| **Taux succès** | % utilisations réussies | > 85% |
| **Autonomie IA** | % tickets résolus sans escalade | Croissant |

### 9.2 Évolution Attendue

```
Mois 1:  50 procédures  → IA résout 50% tickets simples
Mois 3:  120 procédures → IA résout 65% tickets
Mois 6:  200 procédures → IA résout 75% tickets
Mois 12: 350 procédures → IA résout 85% tickets

Le cercle vertueux accélère naturellement :
- Plus de procédures = Plus de résolutions IA
- Plus de résolutions = Plus de tickets à analyser
- Plus d'analyses = Plus de suggestions pertinentes
```

---

## 10. Fichiers et Dépendances

### 10.1 Nouveaux Fichiers à Créer

```
06_SYSTEME_RAG/
├── Workflows/
│   ├── WIDIP_Procedure_Suggester.json    # Nouveau workflow
│   └── ... (existants)
│
└── Documentation/
    ├── WIDIP_Cercle_Vertueux.md          # Ce fichier
    └── ... (existants)

02_MCP_SERVER/
├── src/tools/
│   └── procedure_tools.py                 # Nouveaux MCP tools
│
├── migrations/
│   └── 002_add_pending_procedures.sql     # Nouvelle table
│
└── init-db.sql                            # Mise à jour schéma

01_WIBOT/
└── wibot-frontend/
    └── src/pages/
        └── CercleVertueux/                # Nouvelles pages UI
            ├── PendingList.tsx
            ├── ProcedureDetail.tsx
            └── Dashboard.tsx
```

### 10.2 Dépendances Existantes Utilisées

- `WIDIP_rag_ingestion.json` - Ingestion des procédures validées
- `memory_search_similar_cases` - Recherche anti-doublon
- `glpi_get_resolved_tickets` - Source des tickets
- Frontend WIBOT - Base pour l'interface de validation

---

## 11. Plan d'Implémentation

### Phase 1 : Base de Données
- [ ] Créer migration `002_add_pending_procedures.sql`
- [ ] Appliquer migration
- [ ] Tester structure table

### Phase 2 : MCP Tools
- [ ] Créer `procedure_tools.py`
- [ ] Implémenter `procedure_get_pending`
- [ ] Implémenter `procedure_approve` / `procedure_reject`
- [ ] Implémenter `procedure_get_stats`
- [ ] Tests unitaires

### Phase 3 : Workflow Suggester
- [ ] Créer `WIDIP_Procedure_Suggester.json`
- [ ] Intégrer prompt LLM pour génération
- [ ] Configurer cron et notifications
- [ ] Tests end-to-end

### Phase 4 : Frontend WIBOT
- [ ] Page liste des suggestions
- [ ] Page détail/validation
- [ ] Dashboard statistiques
- [ ] Intégration authentification N3

### Phase 5 : Intégration
- [ ] Connecter validation → RAG ingestion
- [ ] Tracking utilisation procédures
- [ ] Alertes échecs
- [ ] Documentation utilisateur

---

**Dernière mise à jour** : 7 Janvier 2026 | **Version** : 1.0 (Spécification)
