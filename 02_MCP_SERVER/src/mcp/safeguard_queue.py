"""
Queue d'approbation SAFEGUARD pour les actions L3.

Ce module gère la file d'attente des actions sensibles qui nécessitent
une validation humaine avant exécution.

Fonctionnalités:
- Stockage persistant dans PostgreSQL (arguments sensibles redactés)
- Secrets chiffrés stockés dans Redis (TTL automatique)
- TTL configurable (défaut: 1 heure)
- Webhook callback après approbation
- Retry automatique des actions approuvées

SÉCURITÉ:
- Les mots de passe et secrets sont REDACTÉS avant stockage PostgreSQL
- Les secrets originaux sont stockés CHIFFRÉS dans Redis
- Utilise Fernet (AES-128-CBC) pour le chiffrement at-rest
"""

import asyncio
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

import asyncpg
import structlog

from ..config import settings
from ..utils.secrets import (
    extract_sensitive_fields,
    has_sensitive_fields,
    redact_sensitive_fields,
    secret_store,
)

logger = structlog.get_logger(__name__)


class ApprovalStatus(str, Enum):
    """Statuts possibles d'une demande d'approbation."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    EXECUTED = "executed"
    FAILED = "failed"
    SCHEDULED = "scheduled"  # Action approuvee mais en attente d'execution differee


class DeferredStatus(str, Enum):
    """Statuts possibles d'une action differee."""
    PENDING = "pending"      # En attente d'execution
    CANCELLED = "cancelled"  # Annulee avant execution
    EXECUTED = "executed"    # Executee avec succes
    FAILED = "failed"        # Echec d'execution


# Delais par niveau de securite (en heures)
DEFERRED_DELAY_HOURS: dict[str, int] = {
    "L3": 24,  # Actions sensibles: 24h
    "L4": 48,  # Actions tres sensibles: 48h
}


class SafeguardQueue:
    """
    Gestionnaire de la queue d'approbation SAFEGUARD.

    Stocke les demandes d'approbation L3 dans PostgreSQL et gère
    leur cycle de vie (création, approbation, expiration, exécution).
    """

    def __init__(self) -> None:
        self._pool: Optional[asyncpg.Pool] = None
        self._initialized = False

    async def _get_pool(self) -> asyncpg.Pool:
        """Retourne le pool de connexions PostgreSQL."""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                settings.postgres_dsn,
                min_size=1,
                max_size=5,
            )
        return self._pool

    async def initialize(self) -> None:
        """Initialise la table d'approbations si elle n'existe pas."""
        if self._initialized:
            return

        pool = await self._get_pool()

        create_table_sql = """
            CREATE TABLE IF NOT EXISTS safeguard_approvals (
                id UUID PRIMARY KEY,
                tool_name VARCHAR(100) NOT NULL,
                arguments JSONB NOT NULL,
                security_level VARCHAR(10) NOT NULL,
                requester_ip VARCHAR(45),
                request_context JSONB,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                approved_at TIMESTAMP WITH TIME ZONE,
                approver VARCHAR(100),
                approval_comment TEXT,
                executed_at TIMESTAMP WITH TIME ZONE,
                execution_result JSONB,
                execution_error TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_safeguard_status
                ON safeguard_approvals(status);
            CREATE INDEX IF NOT EXISTS idx_safeguard_expires
                ON safeguard_approvals(expires_at)
                WHERE status = 'pending';
            CREATE INDEX IF NOT EXISTS idx_safeguard_created
                ON safeguard_approvals(created_at DESC);
        """

        await pool.execute(create_table_sql)
        self._initialized = True
        logger.info("safeguard_queue_initialized")

    async def create_approval_request(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        security_level: str,
        requester_ip: Optional[str] = None,
        context: Optional[dict[str, Any]] = None,
        ttl_minutes: int = 60,
    ) -> dict[str, Any]:
        """
        Crée une nouvelle demande d'approbation L3.

        SÉCURITÉ: Les champs sensibles (passwords, secrets) sont:
        - REDACTÉS avant stockage dans PostgreSQL
        - Stockés CHIFFRÉS dans Redis avec TTL automatique

        Args:
            tool_name: Nom du tool MCP
            arguments: Arguments de l'appel
            security_level: Niveau SAFEGUARD (L3)
            requester_ip: IP du demandeur
            context: Contexte supplémentaire
            ttl_minutes: Durée de validité en minutes

        Returns:
            Détails de la demande créée
        """
        await self.initialize()
        pool = await self._get_pool()

        approval_id = uuid4()
        approval_id_str = str(approval_id)
        expires_at = datetime.utcnow() + timedelta(minutes=ttl_minutes)

        # =================================================================
        # SÉCURITÉ: Extraire et sécuriser les champs sensibles
        # =================================================================
        has_secrets = has_sensitive_fields(arguments)
        safe_arguments, extracted_secrets = extract_sensitive_fields(arguments)

        # Stocker les secrets chiffrés dans Redis si présents
        if extracted_secrets:
            ttl_seconds = ttl_minutes * 60 + 300  # TTL + 5 min de marge
            await secret_store.store_secret(
                key=f"approval:{approval_id_str}",
                data=extracted_secrets,
                ttl_seconds=ttl_seconds,
            )
            logger.info(
                "safeguard_secrets_secured",
                approval_id=approval_id_str[:8] + "...",
                secrets_count=len(extracted_secrets),
            )

        sql = """
            INSERT INTO safeguard_approvals
                (id, tool_name, arguments, security_level, requester_ip,
                 request_context, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, created_at
        """

        import json
        row = await pool.fetchrow(
            sql,
            approval_id,
            tool_name,
            json.dumps(safe_arguments),  # Arguments REDACTÉS
            security_level,
            requester_ip,
            json.dumps(context or {}),
            expires_at,
        )

        logger.warning(
            "safeguard_approval_created",
            approval_id=approval_id_str,
            tool_name=tool_name,
            expires_at=expires_at.isoformat(),
            has_redacted_secrets=has_secrets,
        )

        return {
            "approval_id": str(approval_id),
            "tool_name": tool_name,
            "status": ApprovalStatus.PENDING.value,
            "created_at": row["created_at"].isoformat(),
            "expires_at": expires_at.isoformat(),
            "ttl_minutes": ttl_minutes,
        }

    async def get_pending_approvals(
        self,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """
        Liste les approbations en attente.

        Returns:
            Liste des approbations pending non expirées
        """
        await self.initialize()
        pool = await self._get_pool()

        sql = """
            SELECT
                id, tool_name, arguments, security_level,
                requester_ip, request_context, created_at, expires_at
            FROM safeguard_approvals
            WHERE status = 'pending' AND expires_at > NOW()
            ORDER BY created_at DESC
            LIMIT $1
        """

        rows = await pool.fetch(sql, limit)

        return [
            {
                "approval_id": str(row["id"]),
                "tool_name": row["tool_name"],
                "arguments": row["arguments"],
                "security_level": row["security_level"],
                "requester_ip": row["requester_ip"],
                "context": row["request_context"],
                "created_at": row["created_at"].isoformat(),
                "expires_at": row["expires_at"].isoformat(),
                "time_remaining_seconds": max(
                    0,
                    (row["expires_at"] - datetime.now(row["expires_at"].tzinfo)).total_seconds()
                ),
            }
            for row in rows
        ]

    async def approve(
        self,
        approval_id: str,
        approver: str,
        comment: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Approuve une demande L3.

        Args:
            approval_id: ID de la demande
            approver: Identifiant de l'approbateur
            comment: Commentaire optionnel

        Returns:
            Résultat de l'approbation
        """
        await self.initialize()
        pool = await self._get_pool()

        # Vérifier que la demande existe et est valide
        check_sql = """
            SELECT id, tool_name, status, expires_at
            FROM safeguard_approvals
            WHERE id = $1
        """

        row = await pool.fetchrow(check_sql, approval_id)

        if not row:
            return {
                "success": False,
                "error": "Demande d'approbation non trouvée",
            }

        if row["status"] != ApprovalStatus.PENDING.value:
            return {
                "success": False,
                "error": f"Demande déjà traitée (status: {row['status']})",
            }

        if row["expires_at"] < datetime.now(row["expires_at"].tzinfo):
            # Marquer comme expirée
            await pool.execute(
                "UPDATE safeguard_approvals SET status = 'expired' WHERE id = $1",
                approval_id,
            )
            return {
                "success": False,
                "error": "Demande expirée",
            }

        # Approuver
        update_sql = """
            UPDATE safeguard_approvals
            SET status = 'approved',
                approved_at = NOW(),
                approver = $2,
                approval_comment = $3
            WHERE id = $1
            RETURNING id, tool_name, arguments
        """

        result = await pool.fetchrow(update_sql, approval_id, approver, comment)

        logger.info(
            "safeguard_approved",
            approval_id=approval_id,
            tool_name=result["tool_name"],
            approver=approver,
        )

        return {
            "success": True,
            "approval_id": approval_id,
            "tool_name": result["tool_name"],
            "arguments": result["arguments"],
            "status": ApprovalStatus.APPROVED.value,
            "approver": approver,
            "message": "Action approuvée. Prête pour exécution.",
        }

    async def reject(
        self,
        approval_id: str,
        approver: str,
        comment: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Rejette une demande L3.
        """
        await self.initialize()
        pool = await self._get_pool()

        update_sql = """
            UPDATE safeguard_approvals
            SET status = 'rejected',
                approved_at = NOW(),
                approver = $2,
                approval_comment = $3
            WHERE id = $1 AND status = 'pending'
            RETURNING id, tool_name
        """

        result = await pool.fetchrow(update_sql, approval_id, approver, comment)

        if not result:
            return {
                "success": False,
                "error": "Demande non trouvée ou déjà traitée",
            }

        logger.info(
            "safeguard_rejected",
            approval_id=approval_id,
            tool_name=result["tool_name"],
            approver=approver,
        )

        return {
            "success": True,
            "approval_id": approval_id,
            "status": ApprovalStatus.REJECTED.value,
            "message": "Action rejetée.",
        }

    async def mark_executed(
        self,
        approval_id: str,
        result: Optional[dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        """Marque une demande approuvée comme exécutée."""
        await self.initialize()
        pool = await self._get_pool()

        import json
        status = ApprovalStatus.EXECUTED.value if not error else ApprovalStatus.FAILED.value

        await pool.execute(
            """
            UPDATE safeguard_approvals
            SET status = $2,
                executed_at = NOW(),
                execution_result = $3,
                execution_error = $4
            WHERE id = $1
            """,
            approval_id,
            status,
            json.dumps(result) if result else None,
            error,
        )

    async def expire_old_requests(self) -> int:
        """
        Expire les demandes dépassées.

        Returns:
            Nombre de demandes expirées
        """
        await self.initialize()
        pool = await self._get_pool()

        result = await pool.execute(
            """
            UPDATE safeguard_approvals
            SET status = 'expired'
            WHERE status = 'pending' AND expires_at < NOW()
            """
        )

        # Parse le résultat (format: "UPDATE N")
        count = int(result.split()[-1]) if result else 0

        if count > 0:
            logger.info("safeguard_expired_requests", count=count)

        return count

    async def get_approval_status(self, approval_id: str) -> Optional[dict[str, Any]]:
        """Récupère le statut d'une demande d'approbation."""
        await self.initialize()
        pool = await self._get_pool()

        sql = """
            SELECT *
            FROM safeguard_approvals
            WHERE id = $1
        """

        row = await pool.fetchrow(sql, approval_id)

        if not row:
            return None

        return {
            "approval_id": str(row["id"]),
            "tool_name": row["tool_name"],
            "arguments": row["arguments"],
            "security_level": row["security_level"],
            "status": row["status"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
            "approved_at": row["approved_at"].isoformat() if row["approved_at"] else None,
            "approver": row["approver"],
            "approval_comment": row["approval_comment"],
            "executed_at": row["executed_at"].isoformat() if row["executed_at"] else None,
            "execution_result": row["execution_result"],
            "execution_error": row["execution_error"],
        }

    async def get_full_arguments(self, approval_id: str) -> Optional[dict[str, Any]]:
        """
        Récupère les arguments COMPLETS (avec secrets) pour exécution.

        Cette méthode reconstitue les arguments originaux en:
        1. Récupérant les arguments redactés depuis PostgreSQL
        2. Récupérant les secrets chiffrés depuis Redis
        3. Fusionnant les deux

        ATTENTION: N'utiliser que pour l'exécution après approbation!

        Args:
            approval_id: ID de la demande approuvée

        Returns:
            Arguments complets ou None si non trouvé
        """
        await self.initialize()
        pool = await self._get_pool()

        # Récupérer les arguments redactés depuis PostgreSQL
        sql = "SELECT arguments FROM safeguard_approvals WHERE id = $1"
        row = await pool.fetchrow(sql, approval_id)

        if not row:
            return None

        redacted_args = row["arguments"]
        if isinstance(redacted_args, str):
            import json
            redacted_args = json.loads(redacted_args)

        # Récupérer les secrets depuis Redis
        secrets = await secret_store.get_secret(f"approval:{approval_id}")

        if not secrets:
            # Pas de secrets stockés, retourner les arguments tels quels
            return redacted_args

        # Fusionner les secrets avec les arguments redactés
        full_args = dict(redacted_args)
        self._merge_secrets(full_args, secrets)

        logger.info(
            "safeguard_secrets_retrieved",
            approval_id=approval_id[:8] + "...",
        )

        return full_args

    def _merge_secrets(
        self,
        target: dict[str, Any],
        secrets: dict[str, Any],
    ) -> None:
        """
        Fusionne les secrets dans les arguments cibles (in-place).

        Remplace les valeurs [REDACTED] par les vraies valeurs.
        """
        for key, value in secrets.items():
            if isinstance(value, dict) and key in target and isinstance(target[key], dict):
                # Récursion pour les objets imbriqués
                self._merge_secrets(target[key], value)
            else:
                target[key] = value

    async def cleanup_secrets(self, approval_id: str) -> bool:
        """
        Supprime les secrets chiffrés après exécution.

        À appeler après mark_executed() pour nettoyer Redis.

        Args:
            approval_id: ID de la demande

        Returns:
            True si secrets supprimés
        """
        return await secret_store.delete_secret(f"approval:{approval_id}")

    async def close(self) -> None:
        """Ferme le pool de connexions."""
        if self._pool:
            await self._pool.close()
            self._pool = None


class DeferredActionManager:
    """
    Gestionnaire des actions differees SAFEGUARD.

    Gere la file d'attente des actions L3/L4 approuvees mais dont
    l'execution est retardee de 24-48h pour permettre l'annulation.
    """

    def __init__(self) -> None:
        self._pool: Optional[asyncpg.Pool] = None
        self._initialized = False
        self._counter_cache: dict[str, int] = {}

    async def _get_pool(self) -> asyncpg.Pool:
        """Retourne le pool de connexions PostgreSQL."""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                settings.postgres_dsn,
                min_size=1,
                max_size=5,
            )
        return self._pool

    async def initialize(self) -> None:
        """Initialise la table des actions differees si elle n'existe pas."""
        if self._initialized:
            return

        pool = await self._get_pool()

        create_table_sql = """
            CREATE TABLE IF NOT EXISTS safeguard_deferred_actions (
                id SERIAL PRIMARY KEY,
                deferred_id VARCHAR(50) UNIQUE NOT NULL,
                approval_id UUID NOT NULL,
                tool_name VARCHAR(100) NOT NULL,
                parameters JSONB NOT NULL,
                security_level VARCHAR(10) NOT NULL,
                delay_hours INTEGER NOT NULL DEFAULT 24,
                scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                approved_by VARCHAR(100) NOT NULL,
                approved_at TIMESTAMP WITH TIME ZONE NOT NULL,
                approval_comment TEXT,
                cancelled_by VARCHAR(100),
                cancelled_at TIMESTAMP WITH TIME ZONE,
                cancellation_reason TEXT,
                executed_at TIMESTAMP WITH TIME ZONE,
                execution_result JSONB,
                execution_error TEXT,
                context JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE
            );

            CREATE INDEX IF NOT EXISTS idx_deferred_status
                ON safeguard_deferred_actions(status);
            CREATE INDEX IF NOT EXISTS idx_deferred_scheduled
                ON safeguard_deferred_actions(scheduled_at)
                WHERE status = 'pending';
        """

        await pool.execute(create_table_sql)
        self._initialized = True
        logger.info("deferred_action_manager_initialized")

    async def _generate_deferred_id(self) -> str:
        """Genere un ID unique pour une action differee (DEF-2026-001)."""
        year = datetime.utcnow().year
        cache_key = f"deferred_{year}"

        pool = await self._get_pool()

        # Compter les actions existantes cette annee
        count = await pool.fetchval(
            "SELECT COUNT(*) FROM safeguard_deferred_actions WHERE deferred_id LIKE $1",
            f"DEF-{year}-%",
        )

        next_num = (count or 0) + 1
        return f"DEF-{year}-{next_num:03d}"

    async def create_deferred_action(
        self,
        approval_id: str,
        tool_name: str,
        parameters: dict[str, Any],
        security_level: str,
        approved_by: str,
        approval_comment: Optional[str] = None,
        context: Optional[dict[str, Any]] = None,
        delay_hours: Optional[int] = None,
    ) -> dict[str, Any]:
        """
        Cree une nouvelle action differee apres approbation L3/L4.

        Args:
            approval_id: ID de l'approbation originale
            tool_name: Nom du tool MCP
            parameters: Parametres de l'action (REDACTES)
            security_level: Niveau de securite (L3, L4)
            approved_by: Identifiant de l'approbateur
            approval_comment: Commentaire d'approbation
            context: Contexte (ticket, client, etc.)
            delay_hours: Delai personnalise (sinon selon niveau)

        Returns:
            Details de l'action differee creee
        """
        await self.initialize()
        pool = await self._get_pool()

        # Determiner le delai
        if delay_hours is None:
            delay_hours = DEFERRED_DELAY_HOURS.get(security_level, 24)

        deferred_id = await self._generate_deferred_id()
        scheduled_at = datetime.utcnow() + timedelta(hours=delay_hours)
        approved_at = datetime.utcnow()

        import json
        sql = """
            INSERT INTO safeguard_deferred_actions
                (deferred_id, approval_id, tool_name, parameters, security_level,
                 delay_hours, scheduled_at, approved_by, approved_at,
                 approval_comment, context)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id, created_at
        """

        await pool.fetchrow(
            sql,
            deferred_id,
            approval_id,
            tool_name,
            json.dumps(parameters),
            security_level,
            delay_hours,
            scheduled_at,
            approved_by,
            approved_at,
            approval_comment,
            json.dumps(context or {}),
        )

        logger.warning(
            "deferred_action_created",
            deferred_id=deferred_id,
            approval_id=approval_id,
            tool_name=tool_name,
            scheduled_at=scheduled_at.isoformat(),
            delay_hours=delay_hours,
        )

        return {
            "deferred_id": deferred_id,
            "approval_id": approval_id,
            "tool_name": tool_name,
            "security_level": security_level,
            "status": DeferredStatus.PENDING.value,
            "delay_hours": delay_hours,
            "scheduled_at": scheduled_at.isoformat(),
            "approved_by": approved_by,
            "approved_at": approved_at.isoformat(),
            "time_until_execution": int(delay_hours * 3600),
        }

    async def get_pending_actions(
        self,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """
        Liste les actions differees en attente d'execution.

        Returns:
            Liste des actions pending
        """
        await self.initialize()
        pool = await self._get_pool()

        sql = """
            SELECT *
            FROM safeguard_deferred_actions
            WHERE status = 'pending'
            ORDER BY scheduled_at ASC
            LIMIT $1
        """

        rows = await pool.fetch(sql, limit)

        return [
            {
                "deferred_id": row["deferred_id"],
                "approval_id": str(row["approval_id"]),
                "tool_name": row["tool_name"],
                "parameters": row["parameters"],
                "security_level": row["security_level"],
                "delay_hours": row["delay_hours"],
                "scheduled_at": row["scheduled_at"].isoformat(),
                "time_until_execution": max(
                    0,
                    int((row["scheduled_at"] - datetime.now(row["scheduled_at"].tzinfo)).total_seconds())
                ),
                "status": row["status"],
                "approved_by": row["approved_by"],
                "approved_at": row["approved_at"].isoformat() if row["approved_at"] else None,
                "approval_comment": row["approval_comment"],
                "context": row["context"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            }
            for row in rows
        ]

    async def get_due_actions(self) -> list[dict[str, Any]]:
        """
        Recupere les actions dont l'heure d'execution est passee.

        Returns:
            Liste des actions pretes a etre executees
        """
        await self.initialize()
        pool = await self._get_pool()

        sql = """
            SELECT *
            FROM safeguard_deferred_actions
            WHERE status = 'pending' AND scheduled_at <= NOW()
            ORDER BY scheduled_at ASC
        """

        rows = await pool.fetch(sql)

        return [
            {
                "deferred_id": row["deferred_id"],
                "approval_id": str(row["approval_id"]),
                "tool_name": row["tool_name"],
                "parameters": row["parameters"],
                "security_level": row["security_level"],
                "context": row["context"],
            }
            for row in rows
        ]

    async def cancel_action(
        self,
        deferred_id: str,
        cancelled_by: str,
        reason: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Annule une action differee avant son execution.

        Args:
            deferred_id: ID de l'action differee
            cancelled_by: Identifiant de la personne qui annule
            reason: Raison de l'annulation

        Returns:
            Resultat de l'annulation
        """
        await self.initialize()
        pool = await self._get_pool()

        # Verifier que l'action existe et est annulable
        check_sql = """
            SELECT deferred_id, tool_name, status, scheduled_at
            FROM safeguard_deferred_actions
            WHERE deferred_id = $1
        """

        row = await pool.fetchrow(check_sql, deferred_id)

        if not row:
            return {
                "success": False,
                "error": "Action differee non trouvee",
            }

        if row["status"] != DeferredStatus.PENDING.value:
            return {
                "success": False,
                "error": f"Action ne peut pas etre annulee (status: {row['status']})",
            }

        # Annuler
        update_sql = """
            UPDATE safeguard_deferred_actions
            SET status = 'cancelled',
                cancelled_by = $2,
                cancelled_at = NOW(),
                cancellation_reason = $3
            WHERE deferred_id = $1
            RETURNING deferred_id, tool_name
        """

        result = await pool.fetchrow(update_sql, deferred_id, cancelled_by, reason)

        logger.info(
            "deferred_action_cancelled",
            deferred_id=deferred_id,
            tool_name=result["tool_name"],
            cancelled_by=cancelled_by,
            reason=reason,
        )

        return {
            "success": True,
            "deferred_id": deferred_id,
            "status": DeferredStatus.CANCELLED.value,
            "message": "Action annulee avec succes.",
        }

    async def mark_executed(
        self,
        deferred_id: str,
        result: Optional[dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        """Marque une action differee comme executee."""
        await self.initialize()
        pool = await self._get_pool()

        import json
        status = DeferredStatus.EXECUTED.value if not error else DeferredStatus.FAILED.value

        await pool.execute(
            """
            UPDATE safeguard_deferred_actions
            SET status = $2,
                executed_at = NOW(),
                execution_result = $3,
                execution_error = $4
            WHERE deferred_id = $1
            """,
            deferred_id,
            status,
            json.dumps(result) if result else None,
            error,
        )

        logger.info(
            "deferred_action_executed",
            deferred_id=deferred_id,
            status=status,
            has_error=bool(error),
        )

    async def get_action_detail(self, deferred_id: str) -> Optional[dict[str, Any]]:
        """Recupere le detail d'une action differee."""
        await self.initialize()
        pool = await self._get_pool()

        sql = "SELECT * FROM safeguard_deferred_actions WHERE deferred_id = $1"
        row = await pool.fetchrow(sql, deferred_id)

        if not row:
            return None

        return {
            "deferred_id": row["deferred_id"],
            "approval_id": str(row["approval_id"]),
            "tool_name": row["tool_name"],
            "parameters": row["parameters"],
            "security_level": row["security_level"],
            "delay_hours": row["delay_hours"],
            "scheduled_at": row["scheduled_at"].isoformat() if row["scheduled_at"] else None,
            "time_until_execution": max(
                0,
                int((row["scheduled_at"] - datetime.now(row["scheduled_at"].tzinfo)).total_seconds())
            ) if row["scheduled_at"] and row["status"] == "pending" else 0,
            "status": row["status"],
            "approved_by": row["approved_by"],
            "approved_at": row["approved_at"].isoformat() if row["approved_at"] else None,
            "approval_comment": row["approval_comment"],
            "cancelled_by": row["cancelled_by"],
            "cancelled_at": row["cancelled_at"].isoformat() if row["cancelled_at"] else None,
            "cancellation_reason": row["cancellation_reason"],
            "executed_at": row["executed_at"].isoformat() if row["executed_at"] else None,
            "execution_result": row["execution_result"],
            "execution_error": row["execution_error"],
            "context": row["context"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }

    async def get_stats(self) -> dict[str, int]:
        """Retourne les statistiques des actions differees."""
        await self.initialize()
        pool = await self._get_pool()

        sql = """
            SELECT status, COUNT(*) as count
            FROM safeguard_deferred_actions
            GROUP BY status
        """

        rows = await pool.fetch(sql)

        stats = {status.value: 0 for status in DeferredStatus}
        for row in rows:
            stats[row["status"]] = row["count"]

        stats["total"] = sum(stats.values())
        return stats

    async def close(self) -> None:
        """Ferme le pool de connexions."""
        if self._pool:
            await self._pool.close()
            self._pool = None


# Instances singleton
safeguard_queue = SafeguardQueue()
deferred_manager = DeferredActionManager()
