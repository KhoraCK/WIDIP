# TACHE 02 - Tests Faux Positifs pour Evaluer les Techniciens

> **Statut** : A faire
> **Priorite** : Moyenne
> **Projets concernes** : 03_SAFEGUARD, 01_WIBOT

---

## Objectif

Creer un systeme de **tests automatises** pour detecter les techniciens qui approuvent/rejettent les demandes Safeguard sans lire le contexte.

---

## Probleme Identifie

Certains techniciens pourraient :
- Approuver tout systematiquement sans verifier
- Rejeter tout par defaut sans analyser
- Ne pas lire le contexte de la demande
- Cliquer trop vite sans reflexion

---

## Solution Proposee

### Injection de Faux Positifs

Le systeme genere periodiquement des **demandes de test** qui ne correspondent pas a des actions reelles.

#### Type 1 : Demande Absurde (doit etre rejetee)
```
Demande: Supprimer le compte AD de "Jean DUPONT"
Contexte: Le client demande la creation d'un nouveau compte pour Jean DUPONT
          qui vient d'etre embauche.

--> Si approuve = ERREUR (le tech n'a pas lu)
```

#### Type 2 : Demande Incoherente (doit etre rejetee)
```
Demande: Reset password pour "admin@widip.local"
Contexte: Ticket #12345 - Le client signale une imprimante en panne.

--> Si approuve = ERREUR (aucun rapport)
```

#### Type 3 : Demande Legitime de Test (doit etre approuvee)
```
Demande: Desactiver le compte "TEST_FAUX_POSITIF_001"
Contexte: Compte de test cree pour validation Safeguard.
          Ce compte n'existe pas reellement.
          APPROUVER cette demande pour confirmer la lecture.

--> Si rejete = Le tech lit mais ne comprend pas le systeme
--> Si approuve = OK
```

---

## Implementation Technique

### 1. Nouvelle table PostgreSQL

```sql
CREATE TABLE safeguard_tests (
    id SERIAL PRIMARY KEY,
    test_type VARCHAR(50) NOT NULL,  -- absurd, incoherent, legitimate
    expected_action VARCHAR(20) NOT NULL,  -- approve, reject
    fake_approval_id VARCHAR(50) UNIQUE,
    assigned_to VARCHAR(100),  -- Technicien cible (ou NULL = random)
    technician_action VARCHAR(20),  -- approve, reject, timeout
    response_time_ms INTEGER,
    is_correct BOOLEAN,
    created_at TIMESTAMP DEFAULT NOW(),
    responded_at TIMESTAMP
);
```

### 2. Metriques par Technicien

```sql
CREATE VIEW technician_safeguard_score AS
SELECT
    technician,
    COUNT(*) as total_tests,
    SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
    ROUND(AVG(CASE WHEN is_correct THEN 100 ELSE 0 END), 1) as score_pct,
    AVG(response_time_ms) as avg_response_ms
FROM safeguard_tests
WHERE technician_action IS NOT NULL
GROUP BY technician;
```

### 3. Workflow n8n

- **WIDIP_Safeguard_Test_Generator_v1** : Cron quotidien, genere 1-2 tests par jour
- Injecte dans la queue Safeguard normale (indiscernable d'une vraie demande)
- Flag `is_test = true` en BDD (invisible pour le technicien)

---

## Dashboard Admin

Nouvel onglet reserve aux admins :
- Score par technicien (% de bonnes reponses)
- Temps de reponse moyen
- Historique des erreurs
- Alertes si score < 70%

---

## Criteres de Validation

- [ ] Les tests sont indiscernables des vraies demandes
- [ ] Le scoring fonctionne correctement
- [ ] Les tests ne declenchent jamais d'action reelle
- [ ] Le dashboard admin affiche les metriques
- [ ] Alerte automatique si technicien < 70% de reussite

---

## Considerations Ethiques

- Informer les techniciens que des tests existent (sans dire lesquels)
- Objectif = formation, pas sanction
- Utiliser les resultats pour identifier les besoins de formation
