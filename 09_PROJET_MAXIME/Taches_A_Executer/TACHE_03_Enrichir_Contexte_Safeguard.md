# TACHE 03 - Enrichir le Contexte des Demandes Safeguard

> **Statut** : A faire
> **Priorite** : Haute
> **Projets concernes** : 03_SAFEGUARD, 01_WIBOT (Frontend Dashboard)

---

## Objectif

Ameliorer l'interface Safeguard du WIBOT pour afficher un **contexte complet** derriere chaque demande d'approbation.

---

## Probleme Actuel

Quand un technicien recoit une demande Safeguard, il voit :
- Le nom de l'action (ex: `ad_reset_password`)
- Les parametres (ex: `username: jdupont`)
- Le niveau de risque (L3)

**Ce qui manque :**
- La demande client originale
- Le ticket GLPI associe
- L'historique des actions sur ce compte/client
- Le raisonnement de l'IA

---

## Contexte a Ajouter

### Pour les actions sur comptes AD

```
+----------------------------------------------------------+
| DEMANDE SAFEGUARD #APR-2025-042                    [L3]  |
+----------------------------------------------------------+
| Action: ad_reset_password                                |
| Compte: jdupont@client.local                             |
+----------------------------------------------------------+
| CONTEXTE CLIENT                                          |
| -------------------------------------------------------- |
| Ticket GLPI: #45678 - "Mot de passe oublie"              |
| Client: EHPAD Les Music'Arts                             |
| Demandeur: Marie MARTIN (Cadre de sante)                 |
| Date demande: 06/01/2026 14:32                           |
| -------------------------------------------------------- |
| Contenu ticket:                                          |
| "Bonjour, Jean Dupont ne peut plus se connecter a son    |
| poste depuis ce matin. Il a oublie son mot de passe.     |
| Pouvez-vous le reinitialiser ? Merci"                    |
+----------------------------------------------------------+
| HISTORIQUE COMPTE (30 derniers jours)                    |
| -------------------------------------------------------- |
| - 15/12/2025: Reset password (approuve par A. DELAUZUN)  |
| - 02/01/2026: Tentatives connexion echouees (x5)         |
+----------------------------------------------------------+
| ANALYSE IA                                               |
| -------------------------------------------------------- |
| Confiance: 85%                                           |
| Raison: Demande legitime, pattern classique "oubli MDP"  |
| Verification: Demandeur = cadre autorise pour ce user    |
+----------------------------------------------------------+
|                                                          |
|     [ APPROUVER ]              [ REJETER ]               |
|                                                          |
+----------------------------------------------------------+
```

### Pour les creations/suppressions de comptes

```
+----------------------------------------------------------+
| DEMANDE SAFEGUARD #APR-2025-043                    [L3]  |
+----------------------------------------------------------+
| Action: ad_create_account                                |
| Nouveau compte: mmartin@client.local                     |
+----------------------------------------------------------+
| CONTEXTE CLIENT                                          |
| -------------------------------------------------------- |
| Email original du client (en copie):                     |
| -------------------------------------------------------- |
| De: direction@ehpad-musicarts.fr                         |
| A: support@widip.fr                                      |
| Objet: Creation compte - Nouvelle embauche              |
|                                                          |
| "Bonjour,                                                |
| Suite a l'embauche de Mme Marie MARTIN au poste         |
| d'infirmiere, merci de creer son compte informatique.   |
| Date de prise de poste: 08/01/2026                      |
| Service: Soins                                           |
| Responsable: Dr. DURAND                                  |
| Cordialement"                                            |
+----------------------------------------------------------+
| VERIFICATION AUTOMATIQUE                                 |
| -------------------------------------------------------- |
| [OK] Email provient d'un contact autorise                |
| [OK] Le service "Soins" existe dans l'AD                 |
| [!!] Aucun contrat RH fourni en PJ                       |
+----------------------------------------------------------+
```

---

## Implementation Technique

### 1. Modifier le schema safeguard_approvals

```sql
ALTER TABLE safeguard_approvals ADD COLUMN context JSONB;

-- Exemple de contenu:
{
    "ticket_id": 45678,
    "ticket_title": "Mot de passe oublie",
    "client_name": "EHPAD Les Music'Arts",
    "requester": "Marie MARTIN",
    "requester_role": "Cadre de sante",
    "original_message": "Bonjour, Jean Dupont ne peut plus...",
    "email_copy": null,
    "account_history": [
        {"date": "2025-12-15", "action": "reset_password", "by": "A. DELAUZUN"}
    ],
    "ai_analysis": {
        "confidence": 85,
        "reason": "Demande legitime, pattern classique",
        "checks": ["demandeur_autorise", "compte_existe"]
    }
}
```

### 2. Modifier les workflows qui creent les demandes

- **WIDIP_Assist_ticket** : Inclure le contenu du ticket GLPI
- **WIDIP_Proactif_Observium** : Inclure l'alerte Observium originale
- **Tous** : Appeler un tool `get_account_history` avant de soumettre

### 3. Modifier le Frontend WIBOT

- Composant `SafeguardRequestCard` : Afficher le contexte enrichi
- Accordeon/tabs pour ne pas surcharger visuellement
- Highlight des elements importants (demandeur, client)

---

## Criteres de Validation

- [ ] Chaque demande Safeguard contient le contexte complet
- [ ] Le ticket GLPI original est affiche
- [ ] L'historique du compte (si applicable) est visible
- [ ] L'email client est affiche pour les demandes par email
- [ ] L'interface reste lisible (accordeons, pas un mur de texte)

---

## Priorite des Champs

1. **Obligatoire** : Ticket GLPI + contenu
2. **Important** : Demandeur + role
3. **Utile** : Historique actions recentes
4. **Bonus** : Analyse IA avec score de confiance
