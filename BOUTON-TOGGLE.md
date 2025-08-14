# Bouton Toggle de la Barre d'Outils CX Sender

## Description
Un bouton flottant circulaire permet d'afficher/masquer la barre d'outils CX Sender sur WhatsApp Web.

## Fonctionnalités

### Position et Apparence
- **Position** : Coin supérieur droit de l'écran (right: 20px, top: 70px)
- **Taille** : 50x50 pixels, forme circulaire
- **Couleur** : Vert WhatsApp (#00a884) quand la barre est visible, gris quand masquée
- **Icône** : Flèche qui s'anime (rotation 180°) selon l'état

### Fonctionnalités
- **Clic** : Affiche/masque la barre d'outils
- **Hover** : Effet de grossissement (scale 1.1) et ombre plus marquée
- **Animation** : Transition fluide avec rotation de l'icône
- **Tooltip** : Texte d'aide qui change selon l'état

### États
1. **Barre visible** :
   - Bouton vert
   - Flèche pointant vers le haut
   - Tooltip: "Masquer la barre d'outils CX Sender"

2. **Barre masquée** :
   - Bouton gris
   - Flèche pointant vers le bas (rotation 180°)
   - Tooltip: "Afficher la barre d'outils CX Sender"

## Code CSS
```css
#cx-toolbar-toggle-btn {
  position: fixed;
  right: 20px;
  top: 70px;
  z-index: 10001;
  background: var(--cx-primary);
  width: 50px;
  height: 50px;
  border-radius: 50%;
  transition: all 0.3s ease;
}
```

## Code JavaScript
```javascript
toggleBtn.addEventListener('click', () => {
    const isHidden = toolbar.classList.toggle('cx-toolbar-hidden');
    toggleBtn.classList.toggle('cx-toggled', isHidden);
    // Met à jour le titre selon l'état
});
```

## Utilisation
1. Ouvrez WhatsApp Web
2. L'extension CX Sender s'active automatiquement
3. Cliquez sur le bouton circulaire vert en haut à droite
4. La barre d'outils apparaît/disparaît avec une animation fluide

Le bouton reste toujours visible pour permettre de ramener la barre si elle est masquée.
