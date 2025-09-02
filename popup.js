document.addEventListener('DOMContentLoaded', function () {
    // --- CONFIGURATION ---
    const API_BASE_URL = 'https://admin.clicandclose.com'; // Migration vers HTTPS
    const WEBHOOK_URL = `https://admin.clicandclose.com/flows/trigger/38345740-be05-4138-aa7d-8b1fc650bf7a`;

    // --- ÉLÉMENTS DU DOM (Activation) ---
    const loginSection = document.getElementById('login-section');
    const verifyBtn = document.getElementById('verify-btn');
    const phoneInput = document.getElementById('phone-input');
    const errorMessage = document.getElementById('error-message');
    
    // Debug: vérifier que les éléments existent
    console.log('[CX Popup Debug] DOM elements check:');
    console.log('loginSection:', loginSection);
    console.log('verifyBtn:', verifyBtn);
    console.log('phoneInput:', phoneInput);
    console.log('errorMessage:', errorMessage);

    // Helper function to send log messages to the background script
    function logToBackground(message) {
        chrome.runtime.sendMessage({ type: 'log', source: 'Popup', message: message });
    }

    // --- ÉLÉMENTS DU DOM (Fonctionnalités Principales) ---
    const popupContainer = document.getElementById('popup-container'); // Conteneur principal des fonctionnalités
    const mainView = document.getElementById('main-view');
    const sendButton = document.getElementById('send-button');
    
    // Debug: vérifier les éléments principaux
    console.log('popupContainer:', popupContainer);
    console.log('mainView:', mainView);
    const messageInput = document.getElementById('message');
    const contactsInput = document.getElementById('contacts');
    const statusDiv = document.getElementById('status');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const importCsvButton = document.getElementById('import-csv-button');
    const csvFileInput = document.getElementById('csv-file-input');
    const attachFileButton = document.getElementById('attach-file-button');
    const attachmentInput = document.getElementById('attachment-input');
    const attachmentPreview = document.getElementById('attachment-preview');
    const templateSelect = document.getElementById('template-select');
    const saveTemplateButton = document.getElementById('save-template-button');
    const deleteTemplateButton = document.getElementById('delete-template-button');
    const contactListSelect = document.getElementById('contact-list-select');
    const saveContactListButton = document.getElementById('save-contact-list-button');
    const deleteContactListButton = document.getElementById('delete-contact-list-button');
    const recordAudioButton = document.getElementById('record-audio-button');
    const recordingControls = document.getElementById('recording-controls');
    const stopRecordingButton = document.getElementById('stop-recording-button');
    const recordingTimer = document.getElementById('recording-timer');
    const fixPermissionButton = document.getElementById('fix-permission-button');
    const toggleLogsButton = document.getElementById('toggle-logs-button');
    const clearLogsButton = document.getElementById('clear-logs-button');
    const logsDisplay = document.getElementById('logs-display');

    // Éléments des vues (Options)
    const optionsView = document.getElementById('options-view');
    const openOptionsButton = document.getElementById('open-options-button');
    const backToMainButton = document.getElementById('back-to-main-button');

    // Éléments de la vue Options
    const saveOptionsButton = document.getElementById('save-options-button');
    const saveStatusDiv = document.getElementById('save-status');
    const delayMinInput = document.getElementById('delay-min');
    const devModeSwitch = document.getElementById('dev-mode-switch');

    let timerInterval;
    let secondsRecorded = 0;
    let currentConfig = {}; // Pour garder la configuration actuelle en mémoire
    let attachments = []; // Pour stocker les données des fichiers joints

    // --- LOGIQUE D'ACTIVATION ---
    // --- FONCTIONS D'AFFICHAGE ---
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    function showLogin() {
        console.log('[CX Popup Debug] showLogin() called - showing login section');
        loginSection.classList.remove('hidden');
        popupContainer.classList.add('hidden');
        console.log('[CX Popup Debug] Login section classes:', loginSection.className);
        console.log('[CX Popup Debug] Popup container classes:', popupContainer.className);
    }

    function showMainFeatures() {
        console.log('[CX Popup Debug] showMainFeatures() called - showing main features');
        loginSection.classList.add('hidden');
        popupContainer.classList.remove('hidden');
        console.log('[CX Popup Debug] Login section classes:', loginSection.className);
        console.log('[CX Popup Debug] Popup container classes:', popupContainer.className);
        // Charger les données de l'application une fois l'utilisateur authentifié
        loadTemplates();
        loadContactLists();
        loadOptions();
        logToBackground('Popup opened and user authenticated.');
    }
    
    // --- LOGIQUE DE SESSION ---
    /**
     * Vérifie l'état de la session de l'utilisateur en interrogeant le serveur.
     * @returns {Promise<{status: 'VALID' | 'INVALID_TOKEN' | 'NO_SESSION' | 'API_ERROR', message?: string}>}
     */
    async function checkStoredToken() {
        console.log('[CX Popup Debug] Checking for stored session...');
        const session = await chrome.storage.local.get(['activationToken', 'userPhone', 'tokenTimestamp']);
        
        // Debug détaillé
        console.log('[CX Popup Debug] Session data:', session);
        
        if (!session.activationToken || !session.userPhone) {
            logToBackground('No session found in storage.');
            console.log('[CX Popup Debug] No session - redirecting to login');
            return { status: 'NO_SESSION' };
        }

        // Vérification locale avec expiration du token (24h)
        const TOKEN_EXPIRY_HOURS = 24;
        const now = Date.now();
        const tokenAge = session.tokenTimestamp ? (now - session.tokenTimestamp) : Infinity;
        const maxAge = TOKEN_EXPIRY_HOURS * 60 * 60 * 1000; // 24h en millisecondes

        if (tokenAge > maxAge) {
            logToBackground(`Token expired (age: ${Math.round(tokenAge / (60 * 60 * 1000))}h). Clearing session.`);
            console.log('[CX Popup Debug] Token expired - clearing session');
            await chrome.storage.local.remove(['activationToken', 'userPhone', 'tokenTimestamp']);
            return { status: 'NO_SESSION' };
        }

        logToBackground(`Found valid session for ${session.userPhone}. Token age: ${Math.round(tokenAge / (60 * 60 * 1000))}h`);
        console.log('[CX Popup Debug] Session valid - using local validation');

        // Workflow de vérification Directus activé
        try {
            const VERIFY_WORKFLOW_URL = 'https://admin.clicandclose.com/flows/trigger/b5247808-f6c2-439c-a9b0-5e50f142e7e8';
            
            const response = await fetch(VERIFY_WORKFLOW_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    phone: session.userPhone, 
                    token: session.activationToken 
                })
            });

            if (!response.ok) {
                console.error("[CX Popup Debug] Erreur serveur lors de la validation:", response.status);
                logToBackground(`Token validation failed with status: ${response.status}`);
                return { status: 'API_ERROR', message: `Erreur serveur (${response.status})` };
            }
            
            const result = await response.json();
            console.log('[CX Popup Debug] Server response:', result);

            if (result.success) {
                if (result.action === 'valid') {
                    logToBackground('Token is VALID (server confirmed).');
                    console.log('[CX Popup Debug] Token is VALID - showing main features');
                    return { status: 'VALID' };
                } else if (result.action === 'new_session' || result.action === 'created') {
                    // Nouveau token généré, mise à jour locale
                    logToBackground(`New token generated: ${result.action}`);
                    await chrome.storage.local.set({ 
                        activationToken: result.token,
                        userPhone: session.userPhone,
                        tokenTimestamp: Date.now()
                    });
                    console.log('[CX Popup Debug] New token saved - showing main features');
                    return { status: 'VALID' };
                }
            } else {
                logToBackground('Token validation failed on server.');
                console.log('[CX Popup Debug] Token validation failed - clearing and showing login');
                await chrome.storage.local.remove(['activationToken', 'userPhone', 'tokenTimestamp']);
                return { status: 'INVALID_TOKEN' };
            }
        } catch (error) {
            console.error("[CX Popup Debug] Erreur durant la vérification:", error);
            logToBackground(`Token validation failed: ${error.message}`);
            
            // En cas d'erreur réseau, on garde le token local s'il n'est pas expiré
            if (tokenAge <= maxAge) {
                console.log('[CX Popup Debug] Network error, but token not expired - keeping session');
                return { status: 'VALID' };
            } else {
                await chrome.storage.local.remove(['activationToken', 'userPhone', 'tokenTimestamp']);
                return { status: 'NO_SESSION' };
            }
        }
    }

    /**
     * Appelle le Flow pour activer une nouvelle session.
     */
    async function activateExtension(phoneNumber) {
        try {
            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: phoneNumber })
            });

            const data = await response.json();
            if (!response.ok) {
                const errorMsg = data.errors?.[0]?.message || "Erreur d'activation.";
                return { success: false, message: errorMsg };
            }
            return data; // Devrait être { success: true, token: "..." }
        } catch (error) {
            return { success: false, message: 'Erreur de connexion au service.' };
        }
    }

    // Écouteur pour les mises à jour de progression envoyées par content.js
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.source !== 'content') { // Ne pas logger les messages de progression
            logToBackground(`Received message from ${request.source || 'unknown'}: type=${request.type || request.action}`);
        }
        // Gère la barre de progression
        // Cacher le bouton de correction si une autre action a lieu
        fixPermissionButton.style.display = 'none';

        if (request.action === "updateProgress" && request.source === 'content') {
            const percent = (request.processed / request.total) * 100;
            progressBar.style.width = percent + '%';
            statusDiv.textContent = `Envoi ${request.processed}/${request.total} : ${request.currentContact}...`;
            return;
        }

        // Gère les événements de l'enregistrement audio
        if (request.target === 'popup') {
            switch (request.type) {
                case 'recording-started':
                    recordAudioButton.style.display = 'none';
                    recordingControls.classList.remove('recording-controls-hidden');
                    startTimer();
                    break;
                case 'audio-ready':
                    clearInterval(timerInterval);
                    secondsRecorded = 0;
                    recordAudioButton.style.display = 'block';
                    recordingControls.classList.add('recording-controls-hidden');

                    const audioAttachment = {
                        dataUrl: request.dataUrl,
                        name: request.name,
                        type: request.mimeType, // Utilise le type MIME réel fourni par l'enregistreur
                        id: Date.now() + Math.random()
                    };
                    attachments.push(audioAttachment);
                    
                    if (attachmentPreview.style.display === 'none') {
                        attachmentPreview.innerHTML = '<ul></ul>';
                        attachmentPreview.style.display = 'block';
                    }
                    renderAttachments();
                    chrome.runtime.sendMessage({ type: 'audio-ready', target: 'background' });
                    break;
                case 'mic-error':
                    statusDiv.textContent = `Erreur micro : ${request.error}. Veuillez autoriser l'accès.`;
                    recordAudioButton.style.display = 'block';
                    recordingControls.classList.add('recording-controls-hidden');
                    fixPermissionButton.style.display = 'block';
                    fixPermissionButton.onclick = () => chrome.tabs.create({ url: `chrome://settings/content/siteDetails?site=chrome-extension://${chrome.runtime.id}` });
                    break;
            }
        }
    });

    toggleLogsButton.addEventListener('click', async () => {
        if (logsDisplay.style.display === 'none') {
            const { logs = [] } = await chrome.storage.local.get('logs');
            logsDisplay.textContent = logs.join('\n') || 'Le journal est vide.';
            logsDisplay.style.display = 'block';
            clearLogsButton.style.display = 'inline-block';
            logsDisplay.scrollTop = logsDisplay.scrollHeight; // Scroll to bottom
        } else {
            logsDisplay.style.display = 'none';
            clearLogsButton.style.display = 'none';
        }
    });

    clearLogsButton.addEventListener('click', async () => {
        await chrome.storage.local.set({ logs: [] });
        logsDisplay.textContent = 'Journal effacé.';
        logToBackground('Logs cleared.');
    });

    // --- GESTION DE LA NAVIGATION ENTRE LES VUES ---
    openOptionsButton.addEventListener('click', () => {
        optionsView.classList.remove('hidden');
    });

    backToMainButton.addEventListener('click', () => {
        optionsView.classList.add('hidden');
        mainView.classList.remove('hidden');
    });

    // --- GESTION DE LA CONFIGURATION ---

    /**
     * Applique la configuration à l'interface utilisateur.
     * @param {object} config - L'objet de configuration.
     */
    function applyConfig(config) {
        currentConfig = config;
        // Affiche ou cache les contrôles de logs en fonction du mode développeur
        if (config.devMode) {
            toggleLogsButton.style.display = ''; // Rétablit l'affichage par défaut (flex item)
        } else {
            toggleLogsButton.style.display = 'none';
            // S'assure que le panneau de logs et le bouton d'effacement sont aussi cachés
            logsDisplay.style.display = 'none';
            clearLogsButton.style.display = 'none';
        }
    }

    // --- LOGIQUE DE LA VUE OPTIONS ---
    function saveOptions() {
        const delayMin = parseInt(delayMinInput.value, 10);
        const devMode = devModeSwitch.checked;

        if (isNaN(delayMin) || delayMin < 1) {
            saveStatusDiv.textContent = 'Délai invalide (min 1s).';
            saveStatusDiv.style.color = '#c62828'; // Rouge
            return;
        }
        
        const newConfig = { ...currentConfig, delayMin, devMode };

        chrome.storage.local.set({ config: newConfig }, () => {
            saveStatusDiv.textContent = 'Options enregistrées !';
            saveStatusDiv.style.color = '#00a884'; // Vert
            applyConfig(newConfig); // Applique les changements immédiatement
            setTimeout(() => {
                saveStatusDiv.textContent = '';
            }, 2000);
        });
    }

    function loadOptions() {
        chrome.storage.local.get({
            config: {
                delayMin: 5, // Valeur par défaut
                devMode: false // Mode développeur désactivé par défaut
            }
        }, (items) => {
            delayMinInput.value = items.config.delayMin;
            devModeSwitch.checked = items.config.devMode;
            applyConfig(items.config);
        });
    }
    saveOptionsButton.addEventListener('click', saveOptions);

    // --- GESTION DES MODÈLES ---
    async function loadTemplates() {
        const result = await chrome.storage.local.get('messageTemplates');
        const templates = result.messageTemplates || {};
        
        templateSelect.innerHTML = '<option value="">Sélectionner un modèle</option>';

        for (const name in templates) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            templateSelect.appendChild(option);
        }
    }
    templateSelect.addEventListener('change', async () => {
        const templateName = templateSelect.value;
        if (!templateName) {
            messageInput.value = '';
            return;
        }
        const result = await chrome.storage.local.get('messageTemplates');
        messageInput.value = result.messageTemplates[templateName] || '';
    });
    saveTemplateButton.addEventListener('click', async () => {
        const message = messageInput.value.trim();
        if (!message) {
            alert("Le message est vide. Impossible de sauvegarder le modèle.");
            return;
        }
        const templateName = prompt("Entrez un nom pour ce modèle :");
        if (!templateName) return; 

        const result = await chrome.storage.local.get('messageTemplates');
        const templates = result.messageTemplates || {};
        templates[templateName] = message;
        await chrome.storage.local.set({ messageTemplates: templates });
        await loadTemplates();
        templateSelect.value = templateName;
        logToBackground(`Template "${templateName}" saved.`);
    });
    deleteTemplateButton.addEventListener('click', async () => {
        const templateName = templateSelect.value;
        if (!templateName) return;
        const result = await chrome.storage.local.get('messageTemplates');
        const templates = result.messageTemplates || {};
        delete templates[templateName];
        await chrome.storage.local.set({ messageTemplates: templates });
        messageInput.value = '';
        await loadTemplates();
        logToBackground(`Template "${templateName}" deleted.`);
    });
    // --- GESTION DES LISTES DE CONTACTS ---
    async function loadContactLists() {
        const result = await chrome.storage.local.get('contactLists');
        const lists = result.contactLists || {};
        
        // Debug: vérifier ce qui est stocké
        console.log('Listes de contacts trouvées:', Object.keys(lists));
        
        contactListSelect.innerHTML = '<option value="">Sélectionner une liste</option>';

        for (const name in lists) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            contactListSelect.appendChild(option);
        }
    }
    contactListSelect.addEventListener('change', async () => {
        const listName = contactListSelect.value;
        if (!listName) {
            contactsInput.value = '';
            return;
        }
        const result = await chrome.storage.local.get('contactLists');
        const contacts = result.contactLists && result.contactLists[listName] ? result.contactLists[listName] : '';
        contactsInput.value = contacts;
        
        // Debug: vérifier si les contacts ont été récupérés
        if (contacts) {
            console.log(`Liste "${listName}" chargée avec ${contacts.split(/[\n,;]+/).filter(c => c.trim()).length} contacts`);
        } else {
            console.log(`Aucun contact trouvé pour la liste "${listName}"`);
        }
    });
    saveContactListButton.addEventListener('click', async () => {
        const contacts = contactsInput.value.trim();
        if (!contacts) {
            alert("La liste de contacts est vide. Impossible de sauvegarder.");
            return;
        }
        const listName = prompt("Entrez un nom (catégorie) pour cette liste :");
        if (!listName) return;

        const result = await chrome.storage.local.get('contactLists');
        const lists = result.contactLists || {};
        lists[listName] = contacts;
        await chrome.storage.local.set({ contactLists: lists });
        await loadContactLists();
        contactListSelect.value = listName;
        logToBackground(`Contact list "${listName}" saved.`);
    });
    deleteContactListButton.addEventListener('click', async () => {
        const listName = contactListSelect.value;
        if (!listName) return;
        if (!confirm(`Êtes-vous sûr de vouloir supprimer la liste "${listName}" ?`)) return;
        const result = await chrome.storage.local.get('contactLists');
        const lists = result.contactLists || {};
        delete lists[listName];
        await chrome.storage.local.set({ contactLists: lists });
        contactsInput.value = '';
        await loadContactLists();
        logToBackground(`Contact list "${listName}" deleted.`);
    });
    // --- GESTION DE L'ENREGISTREMENT AUDIO (via Offscreen API) ---
    recordAudioButton.addEventListener('click', () => {
        logToBackground('Record button clicked. Sending message to background.');
        chrome.runtime.sendMessage({ type: 'start-recording', target: 'background' });
    });

    stopRecordingButton.addEventListener('click', () => {
        logToBackground('Stop button clicked. Sending message to background.');
        chrome.runtime.sendMessage({ type: 'stop-recording', target: 'background' });
    });

    function startTimer() {
        recordingTimer.textContent = '00:00';
        clearInterval(timerInterval);
        secondsRecorded = 0;

        timerInterval = setInterval(() => {
            secondsRecorded++;
            const minutes = Math.floor(secondsRecorded / 60).toString().padStart(2, '0');
            const seconds = (secondsRecorded % 60).toString().padStart(2, '0');
            recordingTimer.textContent = `${minutes}:${seconds}`;
        }, 1000);
    }

    importCsvButton.addEventListener('click', () => csvFileInput.click());

    csvFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const contactsFromFile = e.target.result.split(/[\n,;]+/).map(c => c.trim()).filter(c => c);
            contactsInput.value = contactsFromFile.join(', ');
        };
        reader.readAsText(file);
        event.target.value = '';
    });

    attachFileButton.addEventListener('click', () => attachmentInput.click());

    function renderAttachments() {
        const list = attachmentPreview.querySelector('ul');
        if (!list) return;
        list.innerHTML = ''; 
        if (attachments.length === 0) {
            attachmentPreview.style.display = 'none';
            return;
        }

        attachments.forEach(att => {
            const listItem = document.createElement('li');
            listItem.dataset.id = att.id;
            listItem.innerHTML = `
                <span title="${att.name}">${att.name.length > 30 ? att.name.substring(0, 27) + '...' : att.name}</span>
                <button class="remove-file-btn" title="Supprimer ce fichier">×</button>
            `;
            list.appendChild(listItem);
        });
        attachmentPreview.style.display = 'block';
    }

    attachmentPreview.addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-file-btn')) {
            const listItem = event.target.closest('li');
            const fileId = parseFloat(listItem.dataset.id);
            attachments = attachments.filter(att => att.id !== fileId);
            renderAttachments();
        }
    });

    attachmentInput.addEventListener('change', async (event) => {
        const files = Array.from(event.target.files);
        if (!files.length) return;
        
        statusDiv.textContent = `Chargement de ${files.length} fichier(s)...`;
        
        const filePromises = files.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve({
                    dataUrl: e.target.result,
                    name: file.name,
                    type: file.type,
                    id: Date.now() + Math.random()
                });
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        });

        try {
            const newAttachments = await Promise.all(filePromises);
            attachments.push(...newAttachments);
            renderAttachments();
            statusDiv.textContent = "";
        } catch (error) {
            statusDiv.textContent = "Erreur lors de la lecture des fichiers.";
            logToBackground(`File attachment error: ${error.message}`);
        }

        event.target.value = '';
    });

    sendButton.addEventListener('click', async () => {
        sendButton.disabled = true; 

        const message = messageInput.value.trim();
        const contacts = contactsInput.value.split(/[\n,;]+/).map(c => c.trim()).filter(c => c);

        if (contacts.length === 0 || (!message && attachments.length === 0)) {
            statusDiv.textContent = 'Veuillez fournir des contacts et soit un message, soit une pièce jointe.';
            sendButton.disabled = false;
            return;
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab?.url?.startsWith("https://web.whatsapp.com/")) {
            progressContainer.style.display = 'block';
            progressBar.style.width = '0%';
            statusDiv.textContent = 'Initialisation de l\'envoi...';

            logToBackground(`Sending bulk message to ${contacts.length} contacts.`);
            chrome.tabs.sendMessage(tab.id, {
                action: "sendBulkMessage",
                message: message,
                contacts: contacts,
                attachments: attachments
            }, (response) => {
                if (chrome.runtime.lastError) {
                    statusDiv.textContent = `Erreur : ${chrome.runtime.lastError.message}. Essayez de recharger WhatsApp Web.`;
                    logToBackground(`SEND FAILED: ${chrome.runtime.lastError.message}`);
                } else if (response && response.status) {
                    statusDiv.innerHTML = response.status;
                    if (response.errors && response.errors.length > 0) {
                        let errorHtml = '<div class="error-details"><strong>Détails des échecs :</strong><br>' + response.errors.join('<br>') + '</div>';
                        statusDiv.innerHTML += errorHtml;
                    }
                    logToBackground(`SEND COMPLETE: ${response.status}`);
                } else {
                    statusDiv.textContent = 'Impossible d\'obtenir une réponse du script. Veuillez rafraîchir WhatsApp Web.';
                    logToBackground('SEND FAILED: No response from content script.');
                }
                sendButton.disabled = false;
                setTimeout(() => { progressContainer.style.display = 'none'; }, 4000);
            });
        } else {
            statusDiv.textContent = 'Veuillez vous rendre sur un onglet WhatsApp Web actif pour envoyer des messages.';
            sendButton.disabled = false;
        }
    });

    // --- GESTION DES ÉVÉNEMENTS & INITIALISATION ---

    // Gérer le clic sur le bouton de vérification
    verifyBtn.addEventListener('click', async () => {
        errorMessage.classList.add('hidden');
        const phoneNumber = phoneInput.value.trim();
        if (!phoneNumber) {
            showError("Veuillez entrer un numéro de téléphone.");
            return;
        }

        verifyBtn.disabled = true;
        verifyBtn.textContent = "Vérification...";

        const activation = await activateExtension(phoneNumber);

        if (activation.success) {
            // Succès ! On stocke le token, le numéro ET le timestamp
            await chrome.storage.local.set({ 
                activationToken: activation.token,
                userPhone: phoneNumber,
                tokenTimestamp: Date.now() // Ajout du timestamp pour l'expiration
            });

            // Recharge l'onglet WhatsApp Web pour activer la barre d'outils
            const [whatsappTab] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
            if (whatsappTab) {
                chrome.tabs.reload(whatsappTab.id);
                logToBackground('Onglet WhatsApp trouvé et rechargé pour activer la barre d\'outils.');
            }

            showMainFeatures();
        } else {
            showError(activation.message);
        }

        verifyBtn.disabled = false;
        verifyBtn.textContent = "Vérifier";
    });

    /**
     * POINT D'ENTRÉE : C'est la première chose qui s'exécute quand le popup s'ouvre.
     */
    async function initializePopup() {
        console.log('[CX Popup Debug] Initializing popup...');
        const sessionState = await checkStoredToken();
        
        console.log('[CX Popup Debug] Session state result:', sessionState);
        
        switch (sessionState.status) {
            case 'VALID':
                // Le token est valide, on affiche les fonctionnalités.
                console.log('[CX Popup Debug] Case VALID - calling showMainFeatures()');
                showMainFeatures();
                break;
            
            case 'INVALID_TOKEN':
                // Le token n'est plus valide (une autre session a été activée).
                console.log('[CX Popup Debug] Case INVALID_TOKEN - calling showLogin()');
                showLogin();
                showError("Déjà connecté sur un autre appareil. Veuillez réactiver votre accès.");
                break;

            case 'NO_SESSION':
                // Aucun token en mémoire, l'utilisateur doit s'activer.
                console.log('[CX Popup Debug] Case NO_SESSION - calling showLogin()');
                showLogin();
                // L'erreur "Pas d'abonnement actif" sera affichée après une tentative d'activation échouée, ce qui est plus logique.
                break;

            case 'API_ERROR':
                console.log('[CX Popup Debug] Case API_ERROR - calling showLogin()');
                showLogin();
                showError(`Erreur de connexion: ${sessionState.message}. Veuillez réessayer.`);
                break;
                
            default:
                console.error('[CX Popup Debug] Unknown session status:', sessionState.status);
                showLogin();
                showError("État de session inconnu. Veuillez réessayer.");
                break;
        }
    }
    initializePopup();
});