# Brief Optimisation RAG WIDIP

## Contexte du projet

**Client** : WIDIP (ESN spécialisée infogérance/cybersécurité)
**Objectif** : RAG pour l'équipe interne - recherche d'infos clients, procédures, documentation
**Workflow actuel** : `WIDIP_rag_ingestion.json` (n8n)

---

## Volume et types de fichiers

| Critère | Valeur |
|---------|--------|
| **Nombre de fichiers** | ~11 000 |
| **Volume total** | Quelques Go |
| **Types majoritaires** | PDF (quelques Mo), Word, Excel, TXT (quelques Ko) |
| **Contenu** | Procédures techniques, infos clients, organigrammes, documentation |
| **Données sensibles** | Adresses IP, configurations réseau, infos précises |

---

## Modèle d'embedding

**Choix** : `mistral-embed` (Mistral AI)
- **Dimensions** : 1024
- **Context window** : 8 000 tokens
- **Prix** : 0.09€ / million de tokens
- **Coût estimé ingestion initiale** : ~2-3€ (pour ~21M tokens)

---

## Modifications requises dans le workflow

### 1. Text Splitter (PRIORITAIRE)

**Configuration actuelle** (à modifier) :
```json
{
  "chunkOverlap": 200,
  "options": {}
}
```

**Configuration recommandée** :
```json
{
  "chunkSize": 2000,
  "chunkOverlap": 400,
  "options": {}
}
```

**Raison** : Les procédures contiennent des infos techniques précises (IP, configs). Un chunk plus grand préserve le contexte.

---

### 2. Batching pour l'ingestion initiale

Le workflow actuel traite tous les fichiers d'un coup → risque de :
- Rate limiting Mistral API
- Timeout n8n
- Saturation mémoire

**Solution** : Traiter par lots de 200-300 fichiers avec pause de 2 secondes entre chaque lot.

**Temps estimé** : 2-3 heures pour les 11 000 fichiers.

---

### 3. Déduplication par hash

Le hash MD5 est déjà calculé dans "Scan Directory" mais **non utilisé**.

**Ajouter avant insertion PGVector** :
```sql
SELECT 1 FROM n8n_vectors 
WHERE metadata->>'hash' = '{{ $json.hash }}' 
LIMIT 1;
```

Si existe → skip, sinon → insert.

---

### 4. Métadonnées à enrichir

**Actuelles** : source, category, path, conversation_id, user_id

**À ajouter** :
- `hash` (pour déduplication)
- `file_type` (extension)
- `ingestion_date` (timestamp)
- `chunk_index` (position du chunk dans le document)
- `file_size` (taille originale)

---

### 5. Gestion des erreurs

Ajouter :
- Retry automatique (3 tentatives) sur erreur API Mistral
- Logging des fichiers échoués dans un fichier/table pour reprise
- Timeout par fichier (éviter blocage sur fichier corrompu)

---

## Stratégie d'ingestion

### Phase 1 : Ingestion initiale (one-shot)
- **Quand** : Week-end (dimanche nuit)
- **Mode** : `full` avec `clearFirst: true`
- **Batch size** : 200 fichiers
- **Pause entre lots** : 2 secondes

### Phase 2 : Enrichissement quotidien
- **Trigger** : Cron existant (dimanche 3h) + webhook pour ajouts manuels
- **Mode** : `incremental`
- **Vérification** : Hash avant insertion (éviter doublons)

---

## Points de vigilance

### Précision des données techniques
- Les adresses IP, configs réseau doivent rester dans leur contexte
- Chunk size de 2000 chars minimum pour les procédures
- Tester après ingestion avec requêtes précises : "IP du serveur X", "config VLAN client Y"

### Fichiers volumineux
- Troncation actuelle à 50 000 caractères (dans les nodes "Prepare X Content")
- Acceptable mais à monitorer si certains PDF dépassent largement

### Rate limits Mistral
- Tier gratuit : ~500 req/min
- Avec batching de 200 fichiers + pause 2s → safe

---

## Tests de validation post-ingestion

1. **Test précision** : "Quelle est l'IP du serveur [NOM_CLIENT]?"
2. **Test organigramme** : "Qui est le DSI de WIDIP?" (réponse attendue : Jean-François CIOTTA)
3. **Test procédure** : "Comment configurer [PROCEDURE_SPECIFIQUE]?"
4. **Test volume** : Vérifier nombre de vecteurs en base vs fichiers ingérés

---

## Fichiers de référence

- **Workflow n8n** : `WIDIP_rag_ingestion.json`
- **Exemple document** : `organigramme_widip_26_08_25.pdf`

---

## Résumé des actions Claude Code

1. [ ] Modifier `chunkSize` à 2000 et `chunkOverlap` à 400 dans le Text Splitter
2. [ ] Ajouter logique de batching (lots de 200, pause 2s)
3. [ ] Implémenter déduplication par hash MD5
4. [ ] Enrichir les métadonnées (hash, file_type, ingestion_date, chunk_index)
5. [ ] Ajouter retry logic sur erreurs API
6. [ ] Ajouter logging des fichiers échoués
7. [ ] Tester sur échantillon de 100 fichiers avant ingestion complète