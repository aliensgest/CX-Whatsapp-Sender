// Test simple pour vérifier le stockage des listes de contacts
// À copier/coller dans la console de l'extension pour déboguer

console.log('=== TEST STOCKAGE LISTES CONTACTS ===');

// 1. Créer une liste de test
const testList = {
    'Ma Liste Test': '+33123456789, +33987654321, +33555777999'
};

// 2. Sauvegarder dans le storage
chrome.storage.local.set({ contactLists: testList }, () => {
    console.log('✓ Liste de test sauvegardée');
    
    // 3. Vérifier qu'elle est bien sauvegardée
    chrome.storage.local.get('contactLists', (result) => {
        console.log('Données récupérées:', result);
        
        if (result.contactLists && result.contactLists['Ma Liste Test']) {
            console.log('✓ Liste trouvée:', result.contactLists['Ma Liste Test']);
        } else {
            console.log('✗ Erreur: Liste non trouvée');
        }
    });
});

// 4. Afficher tout le contenu du storage
chrome.storage.local.get(null, (allData) => {
    console.log('Tout le contenu du storage:', allData);
});
