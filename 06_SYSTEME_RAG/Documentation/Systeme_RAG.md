# Système RAG WIDIP
## Retrieval Augmented Generation - Architecture Complète

> **Version** : 2.0 | **Dernière MAJ** : Janvier 2026

---

## Vue d'Ensemble

Le système RAG de WIDIP repose sur **deux workflows distincts** qui alimentent **deux bases vectorielles** complémentaires :

| Workflow | Table PostgreSQL | Source | Usage |
|----------|------------------|--------|-------|
| `WIDIP_rag_ingestion` | `n8n_vectors` | Fichiers (Word, PDF, Excel...) | Documentation statique |
| `WIDIP_Enrichisseur_v1` | `widip_knowledge_base` | Tickets GLPI résolus | Solutions dynamiques |

```
┌─────────────────────────────────────────────────────────────────┐
│                    SYSTÈME RAG WIDIP                            │
├────────────────────────────┬────────────────────────────────────┤
│   RAG DOCUMENTS            │   RAG KNOWLEDGE BASE               │
│   (Fichiers statiques)     │   (Tickets GLPI)                   │
├────────────────────────────┼────────────────────────────────────┤
│ Workflow: rag_ingestion    │ Workflow: Enrichisseur_v1          │
│ Table: n8n_vectors         │ Table: widip_knowledge_base        │
│ Embeddings: Mistral Cloud  │ Embeddings: Ollama (via MCP)       │
│ Trigger: Webhook/Cron/Man  │ Trigger: Cron 18h00                │
└────────────────────────────┴────────────────────────────────────┘
```

---

# PARTIE 1 : RAG Ingestion (Documents)

## Workflow : `WIDIP_rag_ingestion.json`

### Rôle

Ingestion de fichiers multi-format dans une base vectorielle pour la recherche sémantique. Permet aux agents IA d'interroger la documentation technique (procédures clients, manuels, etc.).

### Triggers

| Type | Déclencheur | Mode par défaut |
|------|-------------|-----------------|
| **Manuel** | Bouton n8n | `full` + clear |
| **Webhook** | `POST /wibot/rag/ingest` | `incremental` |
| **Cron** | Dimanche 3h00 | `incremental` |

### Formats Supportés

```
.md .txt .html .htm    → Extraction texte directe
.pdf                   → Extraction PDF native n8n
.docx .doc             → Extraction Word native n8n
.xlsx .xls             → Parse Excel → Texte structuré
.csv                   → Parse CSV → Texte structuré
.json                  → Flatten JSON → Texte
```

### Architecture du Workflow

```
[Trigger (Manual/Webhook/Cron)]
         ↓
[Detect Mode & Config]
    • mode: full | incremental
    • clearFirst: true | false
    • sourcePath: /home/node/.n8n-files/rag-documents
    • Métadonnées custom (category, conversation_id, user_id)
         ↓
[Clear First ?]─────────────────┐
    │ OUI                       │ NON
    ↓                           │
[Clear Vectors Table]           │
    │ TRUNCATE n8n_vectors      │
    └───────────┬───────────────┘
                ↓
[Scan Directory]
    • Parcours récursif
    • Hash MD5 par fichier
    • Détection catégorie automatique
         ↓
[Files Found ?]─────────────────┐
    │ OUI                       │ NON
    ↓                           ↓
[Switch by Extension]     [Respond No Files]
    ├─ PDF    → Read → Extract PDF → Prepare
    ├─ Excel  → Read → Parse → Prepare
    ├─ Word   → Read → Extract → Prepare
    ├─ CSV    → Extract CSV
    ├─ JSON   → Extract JSON (flatten)
    └─ Autres → Extract Text (MD/TXT/HTML)
         ↓
[Merge All Extractions] (6 inputs)
         ↓
[Filter Valid Content]
    • content non vide
    • pas d'erreur
         ↓
[Prepare for Vector Store]
    • content, source, category, path
    • Métadonnées custom si fournies
         ↓
[PGVector Store]
    ├── [Mistral Embeddings] (Mistral Cloud API)
    ├── [Document Loader] (métadonnées)
    └── [Text Splitter] (chunk overlap: 200)
         ↓
[Get Final Stats]
    SELECT COUNT(*), DISTINCT sources, DISTINCT categories
         ↓
[Format Response]
         ↓
[Respond Success]
```

### Catégories Auto-Détectées

Le workflow détecte automatiquement la catégorie selon le chemin du fichier :

| Pattern dans le chemin | Catégorie |
|------------------------|-----------|
| `/procedures/` ou `proc_` | procedure |
| `/clients/` ou `client_` | client |
| `/tickets/` ou `ticket_` | ticket |
| `/documentation/` ou `doc_` | documentation |
| `/faq/` | faq |
| Autre | general |

### Appel Webhook

```bash
# Ingestion incrémentale (par défaut)
curl -X POST http://n8n:5678/webhook/wibot/rag/ingest

# Ingestion complète avec clear
curl -X POST http://n8n:5678/webhook/wibot/rag/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "full",
    "clear": true
  }'

# Ingestion avec métadonnées custom (pièces jointes)
curl -X POST http://n8n:5678/webhook/wibot/rag/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/tmp/attachments",
    "category": "attachment",
    "conversation_id": "conv_123",
    "user_id": "user_456"
  }'
```

### Table `n8n_vectors`

```sql
-- Structure gérée par le node PGVector de n8n
CREATE TABLE n8n_vectors (
    id SERIAL PRIMARY KEY,
    content TEXT,
    metadata JSONB,  -- source, category, path, conversation_id, user_id
    embedding vector(1024)  -- Mistral embeddings
);

-- Index vectoriel créé automatiquement par n8n
```

### Réponse Succès

```json
{
  "success": true,
  "message": "Ingestion RAG terminee avec succes",
  "stats": {
    "totalVectors": 12450,
    "uniqueSources": 847,
    "uniqueCategories": 5
  },
  "config": {
    "mode": "incremental",
    "triggerType": "webhook",
    "sourcePath": "/home/node/.n8n-files/rag-documents",
    "startedAt": "2026-01-07T10:00:00.000Z",
    "completedAt": "2026-01-07T10:05:32.000Z"
  }
}
```

---

# PARTIE 2 : RAG Enrichisseur (Tickets GLPI)

## Workflow : `WIDIP_Enrichisseur_v1.json`

### Rôle

Enrichissement automatique quotidien de la base de connaissances à partir des tickets GLPI résolus. Crée un **cercle vertueux** : plus de tickets résolus = IA plus performante.

### Trigger

- **Cron** : Tous les jours à **18h00** (`0 18 * * *`)

### Architecture du Workflow

```
[Daily 18h00]
      ↓
[MCP: Run Enrichissement Batch]
    POST /mcp/call
    {
      "tool": "enrichisseur_run_batch",
      "arguments": {
        "hours_since": 24,
        "max_tickets": 50,
        "dry_run": false
      }
    }
      ↓
[Analyze Results]
    • Calcul taux succès
    • Génération summary
    • Décision notification
      ↓
[Should Notify ?]─────────────────┐
    │ OUI (nouveaux ou erreur)    │ NON
    ↓                             ↓
[MCP: Notify Teams]        [No Notification Needed]
    │                             │
    └──────────┬──────────────────┘
               ↓
[MCP: Get RAG Stats]
    • total_entries
    • added_last_24h
    • added_last_7d
    • top_categories
               ↓
[Final Log]
```

### Logique MCP `enrichisseur_run_batch`

Le tool MCP effectue en interne :

```
1. glpi_get_resolved_tickets(hours_since=24, limit=50)
   → Récupère tickets résolus des dernières 24h

2. Pour chaque ticket :
   a. memory_check_exists(ticket_id)
      → Si existe → SKIP (déduplication)

   b. enrichisseur_extract_knowledge(ticket)
      → Extrait problem_summary + solution_summary
      → Détecte catégorie
      → Génère tags
      → Calcule quality_score (0.0 - 1.0)

   c. Si quality_score >= 0.4 :
      → memory_add_knowledge(...)
      → INSERT widip_knowledge_base avec embedding Ollama

3. Retourne rapport complet
```

### Quality Score (Calcul)

Le score de qualité détermine si un ticket mérite d'être dans le RAG :

| Critère | Points Max | Détail |
|---------|------------|--------|
| Titre | 0.15 | >= 20 chars = 0.15 |
| Description | 0.20 | >= 100 chars = 0.20 |
| Solution | 0.40 | >= 200 chars = 0.40 |
| Catégorie | 0.10 | Identifiée (!= "Autre") = 0.10 |
| Tags | 0.15 | >= 3 tags = 0.15 |
| **Bonus** | +0.05 | Verbes d'action dans solution |

**Pénalités** (score = 0 pour solution) :
- Solutions vides : "fait", "ok", "fermé", "résolu", "done", "test", "n/a"
- Solution < 10 caractères

**Seuil d'injection** : `quality_score >= 0.4`

### Exemple de Résultat

```
[18:00] Cron trigger
[18:01] MCP enrichisseur_run_batch:
        → 15 tickets trouvés
        → 7 déjà dans RAG (skip)
        → 8 nouveaux traités
        → 6 injectés (quality >= 0.4)
        → 2 filtrés (solutions vides)

[18:02] Notification Teams:
        ✅ Enrichissement RAG terminé
        📊 15 tickets trouvés
        🔄 7 déjà dans le RAG
        ✨ 6 nouveaux ajoutés
        ❌ 0 échecs

[18:03] RAG Stats:
        total_entries: 1247
        added_last_24h: 6
        added_last_7d: 42
```

### Table `widip_knowledge_base`

```sql
CREATE TABLE widip_knowledge_base (
    id SERIAL PRIMARY KEY,
    ticket_id VARCHAR(50) UNIQUE NOT NULL,
    problem_summary TEXT NOT NULL,
    solution_summary TEXT NOT NULL,
    category VARCHAR(100),
    tags TEXT[],
    quality_score FLOAT DEFAULT 0.5,
    embedding vector(768),  -- Ollama nomic-embed-text
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- Index vectoriel
CREATE INDEX knowledge_embedding_idx
ON widip_knowledge_base
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index quality score
CREATE INDEX knowledge_quality_idx
ON widip_knowledge_base (quality_score DESC);
```

---

# PARTIE 3 : Redis Helper (Utilitaire)

## Workflow : `WIDIP_Redis_Helper_v2.2.json`

### Rôle

Workflow utilitaire centralisé pour les opérations Redis. Appelé par les autres workflows pour :
- **Cache** : Stocker résultats temporaires
- **Déduplication** : Éviter traitements doubles
- **Health checks** : Statuts services

### Actions Supportées

| Action | Description | Paramètres |
|--------|-------------|------------|
| `GET` | Récupérer valeur | key |
| `SET` | Stocker valeur | key, value, ttl (optionnel) |
| `DELETE` | Supprimer clé | key |
| `EXISTS` | Vérifier existence | key |
| `INCR` | Incrémenter compteur | key |

### Exemples d'Appels

```javascript
// Cache health status
{action: "set", key: "glpi_health", value: "ok", ttl: 300}

// Déduplication ticket
{action: "set", key: "ticket:1234:processed", value: "1", ttl: 86400}

// Vérifier si déjà traité
{action: "exists", key: "ticket:1234:processed"}

// Compteur alertes
{action: "incr", key: "alerts:network:count"}
```

### Workflows Dépendants

- `WIDIP_Assist_ticket` - Déduplication tickets
- `WIDIP_Proactif_Observium` - Cache diagnostics
- `WIDIP_Health_Check_GLPI` - Health status
- `WIDIP_Enrichisseur_v1` - Stats temporaires

---

# Récapitulatif Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         SOURCES DE DONNÉES                         │
├────────────────────────────┬───────────────────────────────────────┤
│  Fichiers statiques        │  Tickets GLPI résolus                 │
│  (Word, PDF, Excel...)     │  (via API GLPI)                       │
│  P:\CLIENTS, Procédures    │  ITILSolution + Followups             │
└─────────────┬──────────────┴──────────────────┬────────────────────┘
              │                                 │
              ▼                                 ▼
┌─────────────────────────┐       ┌──────────────────────────────────┐
│ WIDIP_rag_ingestion     │       │ WIDIP_Enrichisseur_v1            │
├─────────────────────────┤       ├──────────────────────────────────┤
│ Trigger:                │       │ Trigger:                         │
│ • Manual                │       │ • Cron 18h00                     │
│ • Webhook               │       │                                  │
│ • Cron Dim 3h           │       │ Process:                         │
│                         │       │ • MCP enrichisseur_run_batch     │
│ Process:                │       │ • Quality Score filtering        │
│ • Scan directory        │       │ • Déduplication                  │
│ • Multi-format extract  │       │                                  │
│ • Chunking (overlap:200)│       │ Embeddings:                      │
│                         │       │ • Ollama (768D)                  │
│ Embeddings:             │       │                                  │
│ • Mistral Cloud         │       │ Notification:                    │
└─────────────┬───────────┘       │ • Teams si nouveaux              │
              │                   └──────────────────┬───────────────┘
              │                                      │
              ▼                                      ▼
┌─────────────────────────┐       ┌──────────────────────────────────┐
│ PostgreSQL + pgvector   │       │ PostgreSQL + pgvector            │
│ Table: n8n_vectors      │       │ Table: widip_knowledge_base      │
│ ~12,000+ chunks         │       │ ~1,200+ tickets                  │
└─────────────────────────┘       └──────────────────────────────────┘
              │                                      │
              └──────────────┬───────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────────┐
              │         AGENTS IA WIDIP          │
              │  memory_search_similar_cases()   │
              │  → Recherche sémantique          │
              │  → Top 3 résultats (sim >= 0.6)  │
              └──────────────────────────────────┘
```

---

# Configuration

## Variables d'Environnement

```bash
# PostgreSQL (pgvector)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=widip
POSTGRES_PASSWORD=***
POSTGRES_DB=widip_knowledge

# Mistral (RAG Ingestion)
MISTRAL_API_KEY=***

# Ollama (Enrichisseur)
OLLAMA_URL=http://ollama:11434
OLLAMA_EMBED_MODEL=nomic-embed-text

# MCP Server
MCP_SERVER_URL=http://mcp-server:3001
MCP_API_KEY=***

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
```

## Paramètres RAG

| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| Chunk size | 1000 | Taille chunks (Text Splitter) |
| Chunk overlap | 200 | Chevauchement entre chunks |
| Min similarity | 0.6 | Seuil recherche sémantique |
| Max results | 3 | Résultats par recherche |
| Quality threshold | 0.4 | Seuil injection enrichisseur |

---

# Maintenance

## Commandes Utiles

```sql
-- Stats RAG Documents (n8n_vectors)
SELECT
    COUNT(*) as total_chunks,
    COUNT(DISTINCT metadata->>'source') as sources,
    COUNT(DISTINCT metadata->>'category') as categories
FROM n8n_vectors;

-- Stats Knowledge Base (enrichisseur)
SELECT
    COUNT(*) as total_entries,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24h' THEN 1 END) as last_24h,
    AVG(quality_score) as avg_quality
FROM widip_knowledge_base;

-- Top catégories enrichisseur
SELECT category, COUNT(*)
FROM widip_knowledge_base
GROUP BY category
ORDER BY COUNT(*) DESC
LIMIT 10;

-- Vacuum hebdomadaire
VACUUM ANALYZE n8n_vectors;
VACUUM ANALYZE widip_knowledge_base;
```

## Re-ingestion Complète

```bash
# Via webhook avec clear
curl -X POST http://n8n:5678/webhook/wibot/rag/ingest \
  -H "Content-Type: application/json" \
  -d '{"mode": "full", "clear": true}'
```

---

# Fichiers du Répertoire

```
06_SYSTEME_RAG/
├── Workflows/
│   ├── WIDIP_rag_ingestion.json      # Ingestion fichiers → n8n_vectors
│   ├── WIDIP_Enrichisseur_v1.json    # Enrichissement GLPI → knowledge_base
│   └── WIDIP_Redis_Helper_v2.2.json  # Utilitaire Redis
│
└── Documentation/
    ├── Systeme_RAG.md                # Ce fichier
    ├── WIDIP_Enrichisseur_v1.md      # Doc détaillée enrichisseur
    └── WIDIP_Redis_Helper_v2.2.md    # Doc Redis helper
```

---

**Dernière mise à jour** : 7 Janvier 2026 | **Version** : 2.0
