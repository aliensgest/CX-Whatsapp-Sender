document.addEventListener('DOMContentLoaded', () => {
    const saveButton = document.getElementById('save-button');
    const statusDiv = document.getElementById('save-status');
    const delayMinInput = document.getElementById('delay-min');

    // Fonction pour sauvegarder les options
    function saveOptions() {
        const delayMin = parseInt(delayMinInput.value, 10);

        if (isNaN(delayMin) || delayMin < 1) {
            statusDiv.textContent = 'Veuillez entrer un délai valide (minimum 1 seconde).';
            statusDiv.style.color = '#c62828'; // Rouge
            return;
        }

        chrome.storage.local.set({
            config: {
                delayMin: delayMin
            }
        }, () => {
            statusDiv.textContent = 'Options enregistrées !';
            statusDiv.style.color = '#00a884'; // Vert
            setTimeout(() => {
                statusDiv.textContent = '';
            }, 2000);
        });
    }

    // Fonction pour charger les options
    function loadOptions() {
        // On charge avec des valeurs par défaut pour la première utilisation
        chrome.storage.local.get({
            config: {
                delayMin: 5 // Valeur par défaut de 5 secondes
            }
        }, (items) => {
            delayMinInput.value = items.config.delayMin;
        });
    }

    saveButton.addEventListener('click', saveOptions);
    loadOptions();
});