document.addEventListener('DOMContentLoaded', function() {
    // Helper function to send log messages to the background script
    function logToBackground(message) {
        chrome.runtime.sendMessage({ type: 'log', source: 'Popup', message: message });
    }

    const sendButton = document.getElementById('send-button');
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

    let timerInterval;
    let secondsRecorded = 0;
    
    let attachments = []; // Pour stocker les données des fichiers joints

    // Écouteur pour les mises à jour de progression envoyées par content.js
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        logToBackground(`Received message: type=${request.type || request.action}`);
        // Gère la barre de progression
        // Cacher le bouton de correction si une autre action a lieu
        fixPermissionButton.style.display = 'none';

        if (request.action === "updateProgress") {
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
        contactsInput.value = result.contactLists[listName] || '';
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

    // Initialisation
    loadTemplates();
    loadContactLists();
    logToBackground('Popup opened.');
});