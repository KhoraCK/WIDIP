# TACHE 01 - Execution Differee 24h pour Actions Sensibles

> **Statut** : A faire
> **Priorite** : Haute
> **Projets concernes** : 03_SAFEGUARD, 04_WORKFLOW_PROACTIF_OBSERVIUM, 05_WORKFLOW_ASSIST_TICKET

---

## Objectif

Implementer un systeme de **tache differee** pour les actions critiques validees par le Safeguard. Meme apres approbation humaine, l'execution est retardee de 24 heures.

---

## Contexte

Actuellement, quand un technicien approuve une action L3 (sensible) via le Safeguard :
1. L'action est executee immediatement
2. Pas de possibilite d'annulation post-approbation
3. Risque d'erreur humaine (clic trop rapide, mauvaise comprehension)

---

## Comportement Cible

```
[Agent IA demande action sensible]
    |
[Safeguard detecte L3/L4]
    |
[Notification Teams au technicien]
    |
[Technicien approuve]
    |
[Action mise en FILE D'ATTENTE 24h]  <-- NOUVEAU
    |
[Notification: "Action programmee pour J+1 a HH:MM"]
    |
[Possibilite d'ANNULER pendant 24h]  <-- NOUVEAU
    |
[Apres 24h: Execution automatique]
    |
[Log + Notification "Action executee"]
```

---

## Actions Concernees (L3+)

| Action | Niveau | Delai propose |
|--------|--------|---------------|
| `ad_reset_password` | L3 | 24h |
| `ad_disable_account` | L3 | 24h |
| `ad_delete_account` | L4 | 48h (si autorise) |
| `ad_move_to_ou` | L2 | Immediat |
| `glpi_close_ticket` | L2 | Immediat |

---

## Implementation Technique

### 1. Nouvelle table PostgreSQL

```sql
CREATE TABLE safeguard_deferred_actions (
    id SERIAL PRIMARY KEY,
    approval_id VARCHAR(50) REFERENCES safeguard_approvals(approval_id),
    tool_name VARCHAR(100) NOT NULL,
    parameters JSONB NOT NULL,
    scheduled_at TIMESTAMP NOT NULL,  -- Date execution prevue
    status VARCHAR(20) DEFAULT 'pending',  -- pending, cancelled, executed
    approved_by VARCHAR(100),
    approved_at TIMESTAMP,
    cancelled_by VARCHAR(100),
    cancelled_at TIMESTAMP,
    executed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Nouveau workflow n8n

- **WIDIP_Deferred_Executor_v1** : Cron toutes les 5 min, execute les actions dont `scheduled_at <= NOW()`

### 3. Modifications Dashboard Safeguard

- Nouvel onglet "Actions programmees"
- Bouton "Annuler" pour chaque action en attente
- Countdown visible (temps restant avant execution)

---

## Criteres de Validation

- [ ] Les actions L3 sont mises en file d'attente apres approbation
- [ ] Le technicien peut annuler pendant le delai
- [ ] L'execution automatique fonctionne apres 24h
- [ ] Les logs tracent approbation + execution separement
- [ ] Le Dashboard affiche les actions en attente

---

## Notes

- Prevoir une option "Execution immediate" pour les urgences (avec justification obligatoire)
- Envoyer un rappel 1h avant execution
