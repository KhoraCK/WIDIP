-- =============================================================================
-- Migration 002: Table des actions differees SAFEGUARD
-- Permet de retarder l'execution des actions L3/L4 de 24-48h apres approbation
-- =============================================================================

-- Table des actions differees
CREATE TABLE IF NOT EXISTS safeguard_deferred_actions (
    id SERIAL PRIMARY KEY,
    deferred_id VARCHAR(50) UNIQUE NOT NULL,  -- DEF-2026-001
    approval_id UUID NOT NULL,                 -- Reference vers safeguard_approvals
    tool_name VARCHAR(100) NOT NULL,
    parameters JSONB NOT NULL,
    security_level VARCHAR(10) NOT NULL,

    -- Timing
    delay_hours INTEGER NOT NULL DEFAULT 24,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Status: pending, cancelled, executed, failed
    status VARCHAR(20) DEFAULT 'pending',

    -- Approbation originale
    approved_by VARCHAR(100) NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE NOT NULL,
    approval_comment TEXT,

    -- Annulation (si applicable)
    cancelled_by VARCHAR(100),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,

    -- Execution (si applicable)
    executed_at TIMESTAMP WITH TIME ZONE,
    execution_result JSONB,
    execution_error TEXT,

    -- Context (ticket, client, description)
    context JSONB,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Index pour les requetes frequentes
CREATE INDEX IF NOT EXISTS idx_deferred_status ON safeguard_deferred_actions(status);
CREATE INDEX IF NOT EXISTS idx_deferred_scheduled ON safeguard_deferred_actions(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_deferred_approval ON safeguard_deferred_actions(approval_id);
CREATE INDEX IF NOT EXISTS idx_deferred_created ON safeguard_deferred_actions(created_at DESC);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_deferred_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS trigger_deferred_updated_at ON safeguard_deferred_actions;
CREATE TRIGGER trigger_deferred_updated_at
    BEFORE UPDATE ON safeguard_deferred_actions
    FOR EACH ROW
    EXECUTE FUNCTION update_deferred_updated_at();

-- Commentaires
COMMENT ON TABLE safeguard_deferred_actions IS 'Actions L3/L4 approuvees mais en attente d''execution (delai 24-48h)';
COMMENT ON COLUMN safeguard_deferred_actions.deferred_id IS 'Identifiant unique format DEF-YYYY-NNN';
COMMENT ON COLUMN safeguard_deferred_actions.scheduled_at IS 'Date/heure prevue pour l''execution automatique';
COMMENT ON COLUMN safeguard_deferred_actions.delay_hours IS 'Delai en heures avant execution (24h pour L3, 48h pour L4)';
