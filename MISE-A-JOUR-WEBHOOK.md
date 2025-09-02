# Mise à jour du Webhook - CX WhatsApp Sender

## Modifications effectuées

### Changement d'URL
**Ancienne URL** : `http://192.168.1.22:8055/flows/trigger/38345740-be05-4138-aa7d-8b1fc650bf7a`  
**Nouvelle URL** : `http://admin.clicandclose.com/flows/trigger/38345740-be05-4138-aa7d-8b1fc650bf7a`

### Fichiers modifiés

#### 1. popup.js
- **API_BASE_URL** : `http://192.168.1.22:8055` → `http://admin.clicandclose.com`
- **WEBHOOK_URL** : `http://192.168.1.22:8055/flows/trigger/38345740-be05-4138-aa7d-8b1fc650bf7a` → `http://admin.clicandclose.com/flows/trigger/38345740-be05-4138-aa7d-8b1fc650bf7a`

#### 2. manifest.json
- **host_permissions** : `http://192.168.1.22/*` → `http://admin.clicandclose.com/*`

## Étapes à suivre après modification

### 1. Recharger l'extension
1. Allez dans `chrome://extensions/`
2. Trouvez "CX Whatsapp Sender"
3. Cliquez sur le bouton "Recharger" (⟳)

### 2. Vérifier le fonctionnement
1. Ouvrez l'extension
2. Testez l'activation avec un numéro de téléphone
3. Vérifiez que la connexion au nouveau serveur fonctionne

### 3. Test complet
- Activation d'un utilisateur
- Envoi de message en masse
- Gestion des modèles et listes

## Notes importantes

- L'ID du flow reste le même : `38345740-be05-4138-aa7d-8b1fc650bf7a`
- Seul le domaine change : `192.168.1.22:8055` → `admin.clicandclose.com`
- Les permissions Chrome sont mises à jour pour autoriser le nouveau domaine

## Statut
✅ **Toutes les modifications ont été appliquées avec succès**

L'extension est maintenant configurée pour utiliser le nouveau serveur `admin.clicandclose.com`.
