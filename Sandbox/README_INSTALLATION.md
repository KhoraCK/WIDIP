# RAG WIDIP Local - Guide d'Installation

Stack autonome pour avoir un assistant IA avec RAG sur tes projets WIDIP.

**Ports utilises:**
- PostgreSQL: `5434`
- n8n: `5680`

---

## Etape 1 : Lancer la stack

Ouvre PowerShell et execute :

```powershell
cd C:\Users\maxim\Desktop\WIDIP\Sandbox
docker-compose up -d
```

Attends ~30 secondes que tout demarre.

Verifie que ca tourne :
```powershell
docker ps
```

Tu dois voir :
- `widip-rag-postgres` (port 5434)
- `widip-rag-n8n` (port 5680)

---

## Etape 2 : Acceder a n8n

Ouvre dans ton navigateur : **http://localhost:5680**

Identifiants :
- User: `admin`
- Password: `widip_rag_2025`

---

## Etape 3 : Configurer les credentials

### 3.1 Credential PostgreSQL

1. Va dans **Settings** (icone engrenage) > **Credentials**
2. Clique **Add Credential** > **Postgres**
3. Remplis :
   - Name: `Postgres RAG`
   - Host: `postgres-widip-rag`
   - Database: `widip_rag`
   - User: `widip_rag`
   - Password: `widip_rag_local_2025`
   - Port: `5432` (port interne Docker)
4. Clique **Save**

### 3.2 Credential Mistral

1. **Add Credential** > **Mistral Cloud API**
2. Remplis :
   - Name: `Mistral API`
   - API Key: `ta_cle_api_mistral`
3. Clique **Save**

---

## Etape 4 : Importer les workflows

1. Va dans **Workflows**
2. Clique **Import from File**
3. Importe `RAG_Ingestion_WIDIP_Local.json`
4. Importe `Assistant_RAG_WIDIP.json`

---

## Etape 5 : Lier les credentials aux workflows

### Pour RAG Ingestion WIDIP Local :
1. Ouvre le workflow
2. Clique sur le node **Clear Vectors Table** > Configure > Credential > `Postgres RAG`
3. Clique sur le node **PGVector Store WIDIP** > Configure > Credential > `Postgres RAG`
4. Clique sur le node **Get Final Stats** > Configure > Credential > `Postgres RAG`
5. Clique sur le node **Mistral Embeddings** > Configure > Credential > `Mistral API`
6. **Save** le workflow

### Pour Assistant RAG WIDIP :
1. Ouvre le workflow
2. Clique sur **RAG WIDIP (PGVector)** > Credential > `Postgres RAG`
3. Clique sur **Embeddings Mistral Cloud** > Credential > `Mistral API`
4. Clique sur **Postgres Chat Memory WIDIP** > Credential > `Postgres RAG`
5. Clique sur **Mistral Cloud Chat Model** > Credential > `Mistral API`
6. **Save** le workflow

---

## Etape 6 : Indexer les documents

1. Ouvre le workflow **RAG Ingestion WIDIP Local**
2. Clique sur **Execute Workflow** (bouton play)
3. Attends la fin (quelques minutes selon le nombre de fichiers)
4. Verifie les stats dans le resultat final

---

## Etape 7 : Tester l'assistant

1. Ouvre le workflow **Assistant RAG WIDIP**
2. Active-le (toggle ON en haut a droite)
3. Clique sur l'icone **Chat** (bulle en bas)
4. Teste avec :
   - "Quelles sont mes taches dans le projet Maxime ?"
   - "Comment fonctionne le Safeguard ?"
   - "Explique-moi l'architecture du WIBOT"

---

## Commandes utiles

**Arreter la stack :**
```powershell
cd C:\Users\maxim\Desktop\WIDIP\Sandbox
docker-compose down
```

**Voir les logs n8n :**
```powershell
docker logs widip-rag-n8n -f
```

**Voir les logs PostgreSQL :**
```powershell
docker logs widip-rag-postgres -f
```

**Reset complet (supprime les donnees) :**
```powershell
docker-compose down -v
docker-compose up -d
```

---

## Troubleshooting

### "Connection refused" sur n8n
- Attends 30 secondes apres le `docker-compose up`
- Verifie avec `docker ps` que les containers tournent

### "Credential not found" dans les workflows
- Reconfigure les credentials (Etape 5)

### "No files found" lors de l'indexation
- Verifie que le dossier WIDIP est bien monte :
  ```powershell
  docker exec widip-rag-n8n ls /home/node/.n8n-files/widip-docs
  ```

### L'assistant ne trouve rien
- Lance d'abord l'indexation (Etape 6)
- Verifie qu'il y a des donnees :
  ```powershell
  docker exec widip-rag-postgres psql -U widip_rag -d widip_rag -c "SELECT COUNT(*) FROM n8n_vectors;"
  ```
