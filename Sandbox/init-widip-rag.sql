-- =============================================================================
-- RAG WIDIP Local - Table separee pour ne pas melanger avec WIBOT
-- =============================================================================
-- A executer une seule fois dans PostgreSQL (wibot-postgres)
-- Commande: docker exec -i wibot-postgres psql -U widip -d wibot < init-widip-rag.sql
-- =============================================================================

-- Extension pgvector (deja installee normalement)
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- Table: n8n_vectors_widip (separee de n8n_vectors)
-- =============================================================================
CREATE TABLE IF NOT EXISTS n8n_vectors_widip (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    metadata JSONB,
    embedding vector(1024)  -- Mistral embeddings = 1024 dimensions
);

-- Index vectoriel pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_n8n_vectors_widip_embedding
ON n8n_vectors_widip
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index sur les metadonnees
CREATE INDEX IF NOT EXISTS idx_n8n_vectors_widip_metadata
ON n8n_vectors_widip USING gin (metadata);

-- =============================================================================
-- Vue: Stats du RAG WIDIP
-- =============================================================================
CREATE OR REPLACE VIEW widip_rag_stats AS
SELECT
    COUNT(*) as total_chunks,
    COUNT(DISTINCT metadata->>'source') as total_files,
    COUNT(DISTINCT metadata->>'category') as total_categories,
    pg_size_pretty(pg_total_relation_size('n8n_vectors_widip')) as table_size
FROM n8n_vectors_widip;

-- =============================================================================
-- Confirmation
-- =============================================================================
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Table n8n_vectors_widip creee avec succes!';
    RAISE NOTICE 'Separee de n8n_vectors (WIBOT)';
    RAISE NOTICE '================================================';
END $$;
