-- =============================================================================
-- RAG WIDIP Local - Init Base de Donnees
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- Table pour les vecteurs RAG (format n8n PGVector)
CREATE TABLE IF NOT EXISTS n8n_vectors (
    id SERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    metadata JSONB,
    embedding vector(1024)
);

CREATE INDEX IF NOT EXISTS idx_n8n_vectors_embedding
ON n8n_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_n8n_vectors_metadata
ON n8n_vectors USING gin (metadata);

-- Table pour l'historique des conversations
CREATE TABLE IF NOT EXISTS n8n_chat_histories (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    message JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_histories_session
ON n8n_chat_histories (session_id);

-- Confirmation
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'RAG WIDIP Local - Base initialisee';
    RAISE NOTICE '========================================';
END $$;
