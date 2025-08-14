// =================================================================================================
// FONCTIONS UTILITAIRES ROBUSTES
// =================================================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Attend qu'un élément correspondant au sélecteur apparaisse dans le DOM.
 * Rejette la promesse si le timeout est atteint.
 * @param {string} selector - Le sélecteur CSS de l'élément à trouver.
 * @param {number} timeout - Durée maximale d'attente en millisecondes.
 * @returns {Promise<Element>} L'élément du DOM trouvé.
 */
function waitForElement(selector, timeout = 15000) {
    console.log(`[waitForElement] Waiting for: "${selector}"`);
    return new Promise((resolve, reject) => {
        const intervalTime = 500;
        let elapsedTime = 0;
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                console.log(`[waitForElement] Found: "${selector}"`);
                clearInterval(interval);
                resolve(element);
            } else {
                elapsedTime += intervalTime;
                if (elapsedTime >= timeout) {
                    clearInterval(interval);
                    console.error(`[waitForElement] Timeout: Element not found for selector: "${selector}"`);
                    reject(new Error(`Timeout: Element "${selector}" not found.`));
                }
            }
        }, intervalTime);
    });
}

/**
 * Simule de manière fiable la saisie de texte dans un champ éditable.
 * @param {Element} element - L'élément de champ de texte.
 * @param {string} text - Le texte à saisir.
 */
async function typeIn(element, text) {
    element.focus();
    document.execCommand('insertText', false, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Convertit une Data URL (base64) en un objet File, nécessaire pour les pièces jointes.
 * @param {string} dataurl - La chaîne Data URL.
 * @param {string} filename - Le nom de fichier souhaité.
 * @returns {File} L'objet File.
 */
function dataURLtoFile(dataurl, filename) {
    let arr = dataurl.split(','),
        mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), 
        n = bstr.length, 
        u8arr = new Uint8Array(n);
    while(n--){ u8arr[n] = bstr.charCodeAt(n); }
    return new File([u8arr], filename, {type:mime});
}

// =================================================================================================
// LOGIQUE D'ENVOI SPÉCIFIQUE À WHATSAPP
// =================================================================================================

/**
 * Gère l'envoi d'un lot de fichiers (média, audio, ou documents).
 * @param {Array<File>} fileObjects - Le tableau d'objets File à envoyer.
 * @param {string | null} caption - La légende à associer (principalement pour les médias).
 */
async function sendAttachmentBatch(files, caption) {
    if (!files || files.length === 0) return;

    const fileType = files[0].type;
    const isMedia = fileType.startsWith('image/') || fileType.startsWith('video/');
    const isAudio = fileType.startsWith('audio/');

    console.log(`[sendAttachmentBatch] Starting batch for ${files.length} files. Type: ${fileType}`);

    // Étape 2/9 : Trouver et cliquer sur le bouton "Joindre" (VOS SÉLECTEURS)
    const attachButtonIcon = await waitForElement("span[data-icon='clip'], span[data-icon='plus-rounded']", 10000);
    const attachButton = attachButtonIcon.closest('button');
    if (!attachButton) throw new Error("Étape 2/9 : Bouton 'Joindre' parent introuvable.");
    attachButton.click();

    // Étape 3/9 : Choisir le bon bouton (Média, Audio, ou Document) (VOS SÉLECTEURS)
    let attachmentTypeIconSelector, attachmentTypeName;
    if (isMedia) {
        attachmentTypeIconSelector = "span[data-icon='media-filled-refreshed']";
        attachmentTypeName = 'Photos et vidéos';
    } else if (isAudio) {
        attachmentTypeIconSelector = "span[data-icon='ic-headphones-filled']";
        attachmentTypeName = 'Audio';
    } else {
        attachmentTypeIconSelector = "span[data-icon='document-filled-refreshed']";
        attachmentTypeName = 'Document';
    }

    const typeIcon = await waitForElement(attachmentTypeIconSelector, 5000);

    // Étape 4/9 : Trouver l'input de fichier caché
    const typeButton = typeIcon.closest("li[role='button']");
    if (!typeButton) throw new Error(`Étape 4/9 : Bouton '${attachmentTypeName}' parent introuvable.`);
    const fileInput = typeButton.querySelector("input[type='file']");
    if (!fileInput) throw new Error(`Étape 4/9 : Input de fichier pour '${attachmentTypeName}' introuvable.`);

    // Étape 5/9 & 6/9 : Assigner les fichiers à l'input
    const dataTransfer = new DataTransfer();
    files.forEach(file => dataTransfer.items.add(file));
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Étape 7/9 : Attendre l'écran de prévisualisation (VOS SÉLECTEURS)
    const sendIcon = await waitForElement("span[data-icon='send'], span[data-icon='wds-ic-send-filled']", 15000);
    const sendButtonAttachment = sendIcon.closest('button, div[role="button"]');
    if (!sendButtonAttachment) throw new Error("Étape 7/9 : Bouton d'envoi final (parent) introuvable.");

    // Étape 8/9 : Ajouter la légende (VOS SÉLECTEURS)
    if (caption) {
        const captionBoxSelector = 'div[aria-label*="légende"], div[aria-label*="caption"], div[data-testid="pluggable-input-body"]';
        const captionBox = await waitForElement(captionBoxSelector, 5000);
        await typeIn(captionBox, caption);
        await sleep(500);
    }
    
    // Étape 9/9 : Cliquer sur le bouton d'envoi final
    sendButtonAttachment.click();
    await sleep(2000);
}


/**
 * Fonction principale qui envoie un message complet à un contact.
 * @param {string} contact - Le nom ou le numéro de téléphone du contact.
 * @param {string} message - Le message texte.
 * @param {Array<object>} attachmentsData - Les données des pièces jointes.
 * @returns {Promise<{success: boolean, reason: string}>} Résultat de l'opération.
 */
async function processSingleContact(contactName, message, attachmentsData) {
    // VOS SÉLECTEURS ORIGINAUX
    const SEARCH_BOX_SELECTOR = 'div[title="Search input box"]';
    const MESSAGE_BOX_SELECTOR = 'div[title="Type a message"], div[aria-label="Entrez un message"], div[aria-label="Envoyer un message"], div[data-tab="10"][role="textbox"]';
    const SEND_BUTTON_SELECTOR = 'button[aria-label="Send"], button[aria-label="Envoyer"], button[data-testid="send"]';
    const CLEAR_SEARCH_SELECTOR = 'button[aria-label="Clear search"]';

    try {
        console.log(`\n--- Processing Contact: ${contactName} ---`);

        // 1. Ouvrir la discussion
        const isPhoneNumber = /^\+?[0-9\s]+$/.test(contactName);
        if (isPhoneNumber) {
            const phoneNumber = contactName.replace(/[\s+]/g, '');
            console.log(`Opening chat via URL for phone: ${phoneNumber}`);
            const tempLink = document.createElement('a');
            tempLink.href = `https://web.whatsapp.com/send?phone=${phoneNumber}`;
            document.body.appendChild(tempLink);
            tempLink.click();
            document.body.removeChild(tempLink);
            
            await sleep(2000);
            const errorPopup = document.querySelector("div[data-testid='popup-contents']");
            if (errorPopup && (errorPopup.textContent || '').toLowerCase().includes('invalid')) {
                document.querySelector("div[data-testid='popup-controls-ok'] button")?.click();
                throw new Error(`Numéro de téléphone non valide : ${contactName}`);
            }
        } else {
            console.log(`Searching for contact by name: ${contactName}`);
            const searchBox = await waitForElement(SEARCH_BOX_SELECTOR);
            const clearButton = searchBox.closest('div').querySelector(CLEAR_SEARCH_SELECTOR);
            if (clearButton) { clearButton.click(); await sleep(500); }
            await typeIn(searchBox, contactName);
            await sleep(2000);
            const contactElement = await waitForElement(`span[title="${contactName}"]`);
            contactElement.closest('div[role="listitem"]').click();
            await sleep(1000);
        }

        await waitForElement(MESSAGE_BOX_SELECTOR, 10000); // Attendre que la conversation soit pleinement chargée

        // 2. Préparer les pièces jointes
        const fileObjects = attachmentsData.map(att => dataURLtoFile(att.dataUrl, att.name));
        const mediaAttachments = fileObjects.filter(att => att.type.startsWith('image/') || att.type.startsWith('video/'));
        const audioAttachments = fileObjects.filter(att => att.type.startsWith('audio/'));
        const docAttachments = fileObjects.filter(att => !mediaAttachments.includes(att) && !audioAttachments.includes(att));
        let captionSent = false;

        // 3. Envoyer les pièces jointes par lots
        if (mediaAttachments.length > 0) {
            await sendAttachmentBatch(mediaAttachments, message);
            captionSent = true;
        }
        if (audioAttachments.length > 0) {
            await sendAttachmentBatch(audioAttachments, null);
        }
        if (docAttachments.length > 0) {
            await sendAttachmentBatch(docAttachments, null);
        }

        // 4. Envoyer le message texte s'il n'a pas servi de légende
        if (message && !captionSent) {
            const messageBox = await waitForElement(MESSAGE_BOX_SELECTOR, 15000);
            await typeIn(messageBox, message);
            await sleep(500);
            const sendButton = document.querySelector(SEND_BUTTON_SELECTOR);
            if (!sendButton) throw new Error("Le bouton d'envoi est introuvable.");
            sendButton.click();
        }

        await sleep(1000);
        console.log(`--- Successfully processed ${contactName} ---`);
        return { success: true, reason: 'Envoyé' };
    } catch (error) {
        console.error(`Error processing contact ${contactName}:`, error);
        return { success: false, reason: error.message };
    }
}


// =================================================================================================
// ÉCOUTEUR PRINCIPAL DE L'EXTENSION
// =================================================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "sendBulkMessage") {
        console.clear();
        console.log("=== CX WHATSAPP SENDER - NEW BULK MESSAGE JOB ===", request);

        (async () => {
            // Charger la configuration avant de commencer
            const { config } = await chrome.storage.local.get({
                config: {
                    delayMin: 5 // Valeur par défaut si non configuré
                }
            });
            const minDelaySeconds = config.delayMin;
            const maxDelaySeconds = minDelaySeconds * 2;

            const { message, contacts, attachments } = request;
            let successCount = 0;
            let errorDetails = [];

            for (let i = 0; i < contacts.length; i++) {
                const contact = contacts[i];
                chrome.runtime.sendMessage({ action: "updateProgress", processed: i, total: contacts.length, currentContact: contact, source: 'content' });
                const result = await processSingleContact(contact, message, attachments);
                if (result.success) {
                    successCount++;
                } else {
                    errorDetails.push(`${contact}: ${result.reason}`);
                }
                const randomDelay = Math.floor(Math.random() * (maxDelaySeconds - minDelaySeconds + 1) + minDelaySeconds) * 1000;
                console.log(`Waiting for ${randomDelay / 1000}s before next contact...`);
                if (i < contacts.length - 1) await sleep(randomDelay); // Ne pas attendre après le dernier contact
            }

            chrome.runtime.sendMessage({ action: "updateProgress", processed: contacts.length, total: contacts.length, currentContact: "Terminé !", source: 'content' });
            const finalStatus = `Terminé. ${successCount}/${contacts.length} message(s) envoyé(s) avec succès.`;
            sendResponse({ status: finalStatus, errors: errorDetails });
        })();

        return true; // Indispensable pour la réponse asynchrone
    }
});

// =================================================================================================
// INJECTION DE L'INTERFACE UTILISATEUR SUR LA PAGE
// =================================================================================================

let attachmentsForCurrentSend = []; // Stocke les P.J. du modèle sélectionné pour l'envoi
let currentTemplateAttachments = []; // Stocke les P.J. pour l'éditeur de modèle

/**
 * Ouvre la modale d'envoi en masse.
 */
async function openBulkSendModal() {
    const modal = document.getElementById('cx-modal-overlay');
    if (modal) {
        // Vider les infos du template précédent
        document.getElementById('cx-modal-template-info').textContent = '';
        // Charger les données fraîches à chaque ouverture
        const { messageTemplates = {} } = await chrome.storage.local.get('messageTemplates');
        const templateSelect = document.getElementById('cx-modal-template-select');
        templateSelect.innerHTML = '<option value="">Sélectionner un modèle</option>';
        for (const name in messageTemplates) {
            templateSelect.innerHTML += `<option value="${name}">${name}</option>`;
        }

        const { contactLists = {} } = await chrome.storage.local.get('contactLists');
        const contactListSelect = document.getElementById('cx-modal-contact-list-select');
        contactListSelect.innerHTML = '<option value="">Sélectionner une liste</option>';
        for (const name in contactLists) {
            contactListSelect.innerHTML += `<option value="${name}">${name}</option>`;
        }

        modal.style.display = 'flex';
        modal.classList.remove('cx-modal-hidden');
    }
}

async function openTemplatesModal() {
    console.log('openTemplatesModal called');
    const modal = document.getElementById('cx-templates-modal-overlay');
    console.log('Templates modal found:', modal);
    if (modal) {
        await renderTemplatesInModal();
        modal.style.display = 'flex';
        modal.classList.remove('cx-modal-hidden');
        console.log('Templates modal opened, display:', modal.style.display, 'classes:', modal.className);
    } else {
        console.error('Templates modal not found in DOM');
    }
}

async function openContactListsModal() {
    console.log('openContactListsModal called');
    const modal = document.getElementById('cx-contact-lists-modal-overlay');
    console.log('Contact lists modal found:', modal);
    if (modal) {
        await renderContactListsInModal();
        modal.style.display = 'flex';
        modal.classList.remove('cx-modal-hidden');
        console.log('Contact lists modal opened, display:', modal.style.display, 'classes:', modal.className);
    } else {
        console.error('Contact lists modal not found in DOM');
    }
}

async function openOptionsModal() {
    console.log('openOptionsModal called');
    const modal = document.getElementById('cx-options-modal-overlay');
    console.log('Options modal found:', modal);
    if (modal) {
        const { config } = await chrome.storage.local.get({ config: { delayMin: 5, devMode: false } });
        document.getElementById('cx-delay-min').value = config.delayMin;
        document.getElementById('cx-dev-mode-switch').checked = config.devMode;
        modal.style.display = 'flex';
        modal.classList.remove('cx-modal-hidden');
        console.log('Options modal opened, display:', modal.style.display, 'classes:', modal.className);
    } else {
        console.error('Options modal not found in DOM');
    }
}

/**
 * Crée et injecte la barre d'outils de l'extension dans la page WhatsApp Web.
 */
function injectToolbar(isActive) {
    // Vérifie si les éléments ne sont pas déjà présents
    if (document.getElementById('cx-sender-toolbar') || document.getElementById('cx-toolbar-toggle-btn')) {
        return;
    }

    // 1. Crée la barre d'outils
    const toolbar = document.createElement('div');
    toolbar.id = 'cx-sender-toolbar';
    toolbar.style.zIndex = '10050';
    toolbar.style.pointerEvents = 'auto';

    if (isActive) {
        toolbar.innerHTML = `
            <div class="cx-toolbar-left-content">
                <div class="cx-toolbar-brand">CX Sender</div>
                <div class="cx-toolbar-actions">
                    <button id="cx-send-bulk-btn" class="cx-toolbar-btn">🚀 Envoi en masse</button>
                    <button id="cx-manage-templates-btn" class="cx-toolbar-btn">📋 Gérer les modèles</button>
                    <button id="cx-manage-lists-btn" class="cx-toolbar-btn">👥 Gérer les listes</button>
                    <button id="cx-settings-btn" class="cx-toolbar-btn">⚙️ Options</button>
                    <button id="cx-copilot-settings-btn" class="cx-toolbar-btn">🤖 Paramètres Copilote</button>
                </div>
            </div>
        `;
    } else {
        toolbar.classList.add('cx-toolbar-inactive');
        toolbar.innerHTML = `
            <div class="cx-toolbar-left-content">
                <div class="cx-toolbar-brand">CX Sender</div>
                <div class="cx-inactive-message">
                    Veuillez cliquer sur l'icône de l'extension pour l'activer et utiliser ses fonctionnalités.
                </div>
            </div>
        `;
    }

    // 2. Crée le bouton flottant pour afficher/masquer
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'cx-toolbar-toggle-btn';
    toggleBtn.title = "Afficher/Masquer la barre d'outils";
    toggleBtn.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"></path>
            </svg>
    `;

    // 3. Injecte les éléments dans la page
    document.body.prepend(toolbar);
    document.body.prepend(toggleBtn);

    // 4. Injecte la feuille de style
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.type = 'text/css';
    styleLink.href = chrome.runtime.getURL('injected-styles.css');
    document.head.appendChild(styleLink);

    // Ajoute la logique pour le bouton afficher/masquer.
    // Il ne fait que basculer les classes, le CSS gère les animations.
    toggleBtn.addEventListener('click', () => {
        toolbar.classList.toggle('cx-toolbar-hidden');
        toggleBtn.classList.toggle('cx-toggled');
    });

    // Injecte les modales AVANT d'attacher les listeners pour garantir leur présence
    if (isActive) {
        if (!document.getElementById('cx-modal-overlay')) {
            console.log('Injecting bulk send modal');
            injectBulkSendModal();
        }
        if (!document.getElementById('cx-templates-modal-overlay')) {
            console.log('Injecting templates modal');
            injectTemplatesModal();
        }
        if (!document.getElementById('cx-contact-lists-modal-overlay')) {
            console.log('Injecting contact lists modal');
            injectContactListsModal();
        }
        if (!document.getElementById('cx-options-modal-overlay')) {
            console.log('Injecting options modal');
            injectOptionsModal();
        }
        if (!document.getElementById('cx-copilot-settings-modal')) {
            console.log('Injecting copilot settings modal');
            injectCopilotSettingsModal();
        }

        const bulkSendBtn = toolbar.querySelector('#cx-send-bulk-btn');
        if (bulkSendBtn) bulkSendBtn.addEventListener('click', openBulkSendModal);

        const manageTemplatesBtn = toolbar.querySelector('#cx-manage-templates-btn');
        if (manageTemplatesBtn) {
            console.log('Adding event listener to manage templates button');
            manageTemplatesBtn.addEventListener('click', openTemplatesModal);
        } else {
            console.error('Manage templates button not found');
        }

        const manageListsBtn = toolbar.querySelector('#cx-manage-lists-btn');
        if (manageListsBtn) {
            console.log('Adding event listener to manage lists button');
            manageListsBtn.addEventListener('click', openContactListsModal);
        } else {
            console.error('Manage lists button not found');
        }

        const settingsBtn = toolbar.querySelector('#cx-settings-btn');
        if (settingsBtn) {
            console.log('Adding event listener to settings button');
            settingsBtn.addEventListener('click', openOptionsModal);
        } else {
            console.error('Settings button not found');
        }

        const copilotSettingsBtn = toolbar.querySelector('#cx-copilot-settings-btn');
        if (copilotSettingsBtn) copilotSettingsBtn.addEventListener('click', () => {
            const modal = document.getElementById('cx-copilot-settings-modal');
            if (modal) {
                modal.classList.toggle('cx-modal-hidden');
                console.log('Copilot Settings Modal state:', modal.classList.contains('cx-modal-hidden') ? 'Hidden' : 'Visible');
            } else {
                console.error('Copilot Settings Modal not found in the DOM.');
            }
        });
        console.log('CX Sender Toolbar (Active) a été injectée avec succès.');
    } else {
        console.log('CX Sender Toolbar (Inactive) a été injectée avec succès.');
    }
}

/**
 * Crée et injecte la fenêtre modale pour l'envoi en masse.
 */
function injectBulkSendModal() {
    if (document.getElementById('cx-modal-overlay')) return;

    const modal = document.createElement('div');
    modal.id = 'cx-modal-overlay';
    modal.classList.add('cx-modal-hidden');
    modal.innerHTML = `
        <div id="cx-modal-content">
            <div id="cx-modal-header">
                <h2>🚀 Envoi en masse</h2>
                <button id="cx-modal-close-btn">&times;</button>
            </div>
            <div id="cx-modal-body">
                <div class="cx-modal-section">
                    <label>Modèles de message</label>
                    <div id="cx-modal-template-info"></div>
                    <select id="cx-modal-template-select"><option value="">Sélectionner un modèle</option></select>
                    <textarea id="cx-modal-message" placeholder="Entrez votre message ici..."></textarea>
                </div>
                <div class="cx-modal-section">
                    <label>Listes de contacts</label>
                    <select id="cx-modal-contact-list-select"><option value="">Sélectionner une liste</option></select>
                    <textarea id="cx-modal-contacts" placeholder="Copiez-collez les contacts, séparés par des virgules ou des sauts de ligne..."></textarea>
                </div>
            </div>
            <div id="cx-modal-footer">
                <div id="cx-modal-status"></div>
                <button id="cx-modal-send-btn">Envoyer</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // --- Logique de la modale ---
    const overlay = document.getElementById('cx-modal-overlay');
    const closeBtn = document.getElementById('cx-modal-close-btn');
    const sendBtn = document.getElementById('cx-modal-send-btn');

    closeBtn.addEventListener('click', closeBulkSendModal);
    overlay.addEventListener('click', (e) => {
        if (e.target.id === 'cx-modal-overlay') {
            closeBulkSendModal();
        }
    });

    sendBtn.addEventListener('click', handleModalSend);

    // Logique pour les listes déroulantes (templates et contacts)
    document.getElementById('cx-modal-template-select').addEventListener('change', async (e) => {
        const templateName = e.target.value;
        const messageTextarea = document.getElementById('cx-modal-message');
        const infoDiv = document.getElementById('cx-modal-template-info');
        
        attachmentsForCurrentSend = []; // Réinitialiser
        infoDiv.textContent = '';

        if (!templateName) {
            messageTextarea.value = '';
            return;
        }
        const { messageTemplates = {} } = await chrome.storage.local.get('messageTemplates');
        const template = messageTemplates[templateName];

        if (typeof template === 'object' && template !== null) {
            messageTextarea.value = template.message || '';
            attachmentsForCurrentSend = template.attachments || [];
            if (attachmentsForCurrentSend.length > 0) {
                infoDiv.textContent = `Ce modèle inclut ${attachmentsForCurrentSend.length} pièce(s) jointe(s).`;
            }
        } else { // Ancien format (string)
            messageTextarea.value = template || '';
        }
    });

    document.getElementById('cx-modal-contact-list-select').addEventListener('change', async (e) => {
        const listName = e.target.value;
        const contactsTextarea = document.getElementById('cx-modal-contacts');
        
        if (!listName) {
            contactsTextarea.value = '';
            return;
        }
        
        const { contactLists = {} } = await chrome.storage.local.get('contactLists');
        const contacts = contactLists[listName] || '';
        contactsTextarea.value = contacts;
    });
}

/**
 * Gère l'envoi en masse depuis la modale.
 */
async function handleModalSend() {
    const messageTextarea = document.getElementById('cx-modal-message');
    const contactsTextarea = document.getElementById('cx-modal-contacts');
    const statusDiv = document.getElementById('cx-modal-status');
    const sendBtn = document.getElementById('cx-modal-send-btn');

    const message = messageTextarea.value.trim();
    const contactsText = contactsTextarea.value.trim();

    if (!message && attachmentsForCurrentSend.length === 0) {
        statusDiv.textContent = 'Veuillez saisir un message ou sélectionner un modèle avec des pièces jointes.';
        statusDiv.style.color = '#d32f2f';
        return;
    }

    if (!contactsText) {
        statusDiv.textContent = 'Veuillez saisir des contacts.';
        statusDiv.style.color = '#d32f2f';
        return;
    }

    // Parse les contacts
    const contacts = contactsText.split(/[,\n]/).map(c => c.trim()).filter(c => c);
    if (contacts.length === 0) {
        statusDiv.textContent = 'Aucun contact valide trouvé.';
        statusDiv.style.color = '#d32f2f';
        return;
    }

    // Désactive le bouton et affiche le statut
    sendBtn.disabled = true;
    sendBtn.textContent = 'Envoi en cours...';
    statusDiv.textContent = `Envoi vers ${contacts.length} contact(s)...`;
    statusDiv.style.color = '#00a884';

    try {
        // Charger la configuration
        const { config } = await chrome.storage.local.get({
            config: {
                delayMin: 5 // Valeur par défaut si non configuré
            }
        });
        const minDelaySeconds = config.delayMin;
        const maxDelaySeconds = minDelaySeconds * 2;

        let successCount = 0;
        let errorDetails = [];

        // Traiter chaque contact
        for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];
            statusDiv.textContent = `Envoi ${i + 1}/${contacts.length} : ${contact}...`;
            
            const result = await processSingleContact(contact, message, attachmentsForCurrentSend);
            if (result.success) {
                successCount++;
            } else {
                errorDetails.push(`${contact}: ${result.reason}`);
            }
            
            // Attendre entre les envois (sauf pour le dernier)
            if (i < contacts.length - 1) {
                const randomDelay = Math.floor(Math.random() * (maxDelaySeconds - minDelaySeconds + 1) + minDelaySeconds) * 1000;
                console.log(`Waiting for ${randomDelay / 1000}s before next contact...`);
                await sleep(randomDelay);
            }
        }

        // Afficher le résultat final
        if (errorDetails.length > 0) {
            statusDiv.innerHTML = `Envoi terminé : ${successCount}/${contacts.length} réussis.<br>Échecs: ${errorDetails.length}`;
            statusDiv.style.color = '#f57c00';
            console.warn('Erreurs lors de l\'envoi:', errorDetails);
        } else {
            statusDiv.textContent = `Envoi terminé avec succès : ${successCount}/${contacts.length} messages envoyés.`;
            statusDiv.style.color = '#00a884';
        }
    } catch (error) {
        console.error('Erreur lors de l\'envoi en masse:', error);
        statusDiv.textContent = 'Erreur lors de l\'envoi: ' + error.message;
        statusDiv.style.color = '#d32f2f';
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Envoyer';
    }
}

/**
 * Ferme la modale d'envoi en masse.
 */
function closeBulkSendModal() {
    const modal = document.getElementById('cx-modal-overlay');
    if (modal) modal.classList.add('cx-modal-hidden');
}

/**
 * Crée et injecte la fenêtre modale pour la gestion des modèles.
 */
function injectTemplatesModal() {
    if (document.getElementById('cx-templates-modal-overlay')) return;

    const modal = document.createElement('div');
    modal.id = 'cx-templates-modal-overlay';
    modal.classList.add('cx-modal-hidden'); // Cachée par défaut
    modal.innerHTML = `
        <div id="cx-templates-modal-content">
            <div id="cx-templates-modal-header">
                <h2>📋 Gérer les modèles de message</h2>
                <button id="cx-templates-modal-close-btn">&times;</button>
            </div>
            <div id="cx-templates-modal-body">
                <div id="cx-templates-list-container">
                    <h3>Modèles existants</h3>
                    <ul id="cx-templates-list"></ul>
                </div>
                <div id="cx-template-editor-container">
                    <h3>Éditeur de modèle</h3>
                    <input type="text" id="cx-template-name-input" placeholder="Nom du modèle...">
                    <textarea id="cx-template-content-textarea" placeholder="Contenu du message..."></textarea>
                    <div id="cx-template-attachments-section">
                        <div id="cx-template-attachment-preview">
                            <!-- Les P.J. du modèle seront affichées ici -->
                        </div>
                        <div class="cx-template-attachment-actions">
                            <button id="cx-template-attach-file-btn" class="secondary">Joindre des fichiers</button>
                            <input type="file" id="cx-template-attachment-input" multiple style="display: none;">
                        </div>
                    </div>
                    <div id="cx-template-editor-actions">
                        <button id="cx-template-save-btn">Enregistrer</button>
                        <button id="cx-template-new-btn" class="secondary">Nouveau</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // --- Logique de la modale des modèles ---
    const overlay = document.getElementById('cx-templates-modal-overlay');
    const closeBtn = document.getElementById('cx-templates-modal-close-btn');
    const saveBtn = document.getElementById('cx-template-save-btn');
    const newBtn = document.getElementById('cx-template-new-btn');
    const templateList = document.getElementById('cx-templates-list');
    const attachBtn = document.getElementById('cx-template-attach-file-btn');
    const fileInput = document.getElementById('cx-template-attachment-input');

    closeBtn.addEventListener('click', closeTemplatesModal);
    overlay.addEventListener('click', (e) => {
        if (e.target.id === 'cx-templates-modal-overlay') {
            closeTemplatesModal();
        }
    });

    newBtn.addEventListener('click', () => {
        document.getElementById('cx-template-name-input').value = '';
        document.getElementById('cx-template-content-textarea').value = '';
        currentTemplateAttachments = [];
        renderTemplateAttachments(currentTemplateAttachments);
        document.getElementById('cx-template-name-input').readOnly = false;
        document.getElementById('cx-template-name-input').focus();
    });

    saveBtn.addEventListener('click', async () => {
        const name = document.getElementById('cx-template-name-input').value.trim();
        const content = document.getElementById('cx-template-content-textarea').value.trim();

        if (!name || !content) {
            alert('Le nom et le contenu du modèle ne peuvent pas être vides.');
            return;
        }

        const { messageTemplates = {} } = await chrome.storage.local.get('messageTemplates');
        // Sauvegarder dans le nouveau format objet
        messageTemplates[name] = {
            message: content,
            attachments: currentTemplateAttachments
        };
        await chrome.storage.local.set({ messageTemplates });
        
        await renderTemplatesInModal();
        alert(`Modèle "${name}" enregistré !`);
    });

    templateList.addEventListener('click', async (e) => {
        const target = e.target;
        const listItem = target.closest('li');
        if (!listItem) return;

        const templateName = listItem.dataset.templateName;

        if (target.classList.contains('delete-template')) {
            if (confirm(`Êtes-vous sûr de vouloir supprimer le modèle "${templateName}" ?`)) {
                const { messageTemplates = {} } = await chrome.storage.local.get('messageTemplates');
                delete messageTemplates[templateName];
                await chrome.storage.local.set({ messageTemplates });
                await renderTemplatesInModal();
                if (document.getElementById('cx-template-name-input').value === templateName) {
                    newBtn.click();
                }
            }
        } else {
            const { messageTemplates = {} } = await chrome.storage.local.get('messageTemplates');
            const template = messageTemplates[templateName];

            document.getElementById('cx-template-name-input').value = templateName;
            document.getElementById('cx-template-name-input').readOnly = true;

            if (typeof template === 'object' && template !== null) {
                document.getElementById('cx-template-content-textarea').value = template.message || '';
                currentTemplateAttachments = template.attachments || [];
            } else { // Gérer l'ancien format
                document.getElementById('cx-template-content-textarea').value = template || '';
                currentTemplateAttachments = [];
            }
            renderTemplateAttachments(currentTemplateAttachments);
        }
    });

    attachBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (event) => {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        const filePromises = files.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve({
                    dataUrl: e.target.result,
                    name: file.name,
                    type: file.type
                });
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        });

        const newAttachments = await Promise.all(filePromises);
        currentTemplateAttachments.push(...newAttachments);
        renderTemplateAttachments(currentTemplateAttachments);
        event.target.value = ''; // Allow re-selecting the same file
    });
}

/**
 * Affiche la liste des modèles dans la modale.
 */
async function renderTemplatesInModal() {
    const { messageTemplates = {} } = await chrome.storage.local.get('messageTemplates');
    const listElement = document.getElementById('cx-templates-list');
    if (!listElement) return;

    listElement.innerHTML = '';

    if (Object.keys(messageTemplates).length === 0) {
        listElement.innerHTML = '<li>Aucun modèle.</li>';
        return;
    }

    for (const name in messageTemplates) {
        const template = messageTemplates[name];
        const listItem = document.createElement('li');
        listItem.dataset.templateName = name;
        
        let attachmentInfo = '';
        if (typeof template === 'object' && template.attachments && template.attachments.length > 0) {
            attachmentInfo = ` (${template.attachments.length} pièce(s) jointe(s))`;
        }
        
        listItem.innerHTML = `<span>${name}${attachmentInfo}</span><button class="delete-template" title="Supprimer">&times;</button>`;
        listElement.appendChild(listItem);
    }
}

/**
 * Affiche la liste des contacts dans la modale.
 */
async function renderContactListsInModal() {
    const { contactLists = {} } = await chrome.storage.local.get('contactLists');
    const listElement = document.getElementById('cx-contact-lists-list');
    if (!listElement) return;

    const currentSelected = listElement.querySelector('li.selected')?.dataset.listName;
    listElement.innerHTML = '';

    if (Object.keys(contactLists).length === 0) {
        listElement.innerHTML = '<li>Aucune liste.</li>';
        return;
    }

    for (const name in contactLists) {
        const listItem = document.createElement('li');
        listItem.dataset.listName = name;
        listItem.innerHTML = `<span>${name}</span><button class="delete-list" title="Supprimer">&times;</button>`;
        if (name === currentSelected) {
            listItem.classList.add('selected');
        }
        listElement.appendChild(listItem);
    }
}

/**
 * Affiche l'aperçu des pièces jointes du modèle.
 */
function renderTemplateAttachments(attachments) {
    const previewContainer = document.getElementById('cx-template-attachment-preview');
    if (!previewContainer) return;

    previewContainer.innerHTML = '';

    attachments.forEach((attachment, index) => {
        const attachmentDiv = document.createElement('div');
        attachmentDiv.className = 'cx-attachment-item';
        attachmentDiv.innerHTML = `
            <span class="cx-attachment-name">${attachment.name}</span>
            <button class="cx-attachment-remove" data-index="${index}">&times;</button>
        `;
        previewContainer.appendChild(attachmentDiv);

        // Ajouter l'événement de suppression
        attachmentDiv.querySelector('.cx-attachment-remove').addEventListener('click', () => {
            currentTemplateAttachments.splice(index, 1);
            renderTemplateAttachments(currentTemplateAttachments);
        });
    });
}

async function openTemplatesModal() {
    const modal = document.getElementById('cx-templates-modal-overlay');
    if (modal) {
        await renderTemplatesInModal();
        modal.classList.remove('cx-modal-hidden');
    }
}

function closeTemplatesModal() {
    const modal = document.getElementById('cx-templates-modal-overlay');
    if (modal) modal.classList.add('cx-modal-hidden');
}

/**
 * Crée et injecte la fenêtre modale pour la gestion des listes de contacts.
 */
function injectContactListsModal() {
    if (document.getElementById('cx-contact-lists-modal-overlay')) return;

    const modal = document.createElement('div');
    modal.id = 'cx-contact-lists-modal-overlay';
    modal.classList.add('cx-modal-hidden');
    modal.innerHTML = `
        <div id="cx-contact-lists-modal-content">
            <div id="cx-contact-lists-modal-header">
                <h2>👥 Gérer les listes de contacts</h2>
                <button id="cx-contact-lists-modal-close-btn">&times;</button>
            </div>
            <div id="cx-contact-lists-modal-body">
                <div id="cx-contact-lists-list-container">
                    <h3>Listes existantes</h3>
                    <ul id="cx-contact-lists-list"></ul>
                </div>
                <div id="cx-contact-list-editor-container">
                    <h3>Éditeur de liste</h3>
                    <input type="text" id="cx-contact-list-name-input" placeholder="Nom de la liste...">
                    <textarea id="cx-contact-list-content-textarea" placeholder="Numéros de téléphone, un par ligne..."></textarea>
                    <div id="cx-contact-list-editor-actions">
                        <button id="cx-contact-list-save-btn">Enregistrer</button>
                        <button id="cx-contact-list-new-btn" class="secondary">Nouveau</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // --- Logique de la modale ---
    const overlay = document.getElementById('cx-contact-lists-modal-overlay');
    const closeBtn = document.getElementById('cx-contact-lists-modal-close-btn');
    const saveBtn = document.getElementById('cx-contact-list-save-btn');
    const newBtn = document.getElementById('cx-contact-list-new-btn');
    const listUI = document.getElementById('cx-contact-lists-list');

    closeBtn.addEventListener('click', closeContactListsModal);
    overlay.addEventListener('click', (e) => {
        if (e.target.id === 'cx-contact-lists-modal-overlay') closeContactListsModal();
    });

    newBtn.addEventListener('click', () => {
        document.getElementById('cx-contact-list-name-input').value = '';
        document.getElementById('cx-contact-list-content-textarea').value = '';
        document.getElementById('cx-contact-list-name-input').readOnly = false;
        document.getElementById('cx-contact-list-name-input').focus();
        listUI.querySelector('li.selected')?.classList.remove('selected');
    });

    saveBtn.addEventListener('click', async () => {
        const name = document.getElementById('cx-contact-list-name-input').value.trim();
        const content = document.getElementById('cx-contact-list-content-textarea').value.trim();
        if (!name) return alert('Le nom de la liste est requis.');

        const { contactLists = {} } = await chrome.storage.local.get('contactLists');
        contactLists[name] = content;
        await chrome.storage.local.set({ contactLists });
        await renderContactListsInModal();
        alert(`Liste "${name}" enregistrée !`);
    });

    listUI.addEventListener('click', async (e) => {
        const listItem = e.target.closest('li');
        if (!listItem) return;
        const listName = listItem.dataset.listName;

        if (e.target.classList.contains('delete-list')) {
            if (confirm(`Supprimer la liste "${listName}" ?`)) {
                const { contactLists = {} } = await chrome.storage.local.get('contactLists');
                delete contactLists[listName];
                await chrome.storage.local.set({ contactLists });
                await renderContactListsInModal();
                if (document.getElementById('cx-contact-list-name-input').value === listName) newBtn.click();
            }
        } else {
            const { contactLists = {} } = await chrome.storage.local.get('contactLists');
            document.getElementById('cx-contact-list-name-input').value = listName;
            document.getElementById('cx-contact-list-name-input').readOnly = true;
            document.getElementById('cx-contact-list-content-textarea').value = contactLists[listName] || '';
            listUI.querySelector('li.selected')?.classList.remove('selected');
            listItem.classList.add('selected');
        }
    });
}

async function openContactListsModal() {
    const modal = document.getElementById('cx-contact-lists-modal-overlay');
    if (modal) {
        await renderContactListsInModal();
        modal.classList.remove('cx-modal-hidden');
    }
}

function closeContactListsModal() {
    document.getElementById('cx-contact-lists-modal-overlay')?.classList.add('cx-modal-hidden');
}

async function renderContactListsInModal() {
    const { contactLists = {} } = await chrome.storage.local.get('contactLists');
    const listElement = document.getElementById('cx-contact-lists-list');
    const currentSelected = listElement.querySelector('li.selected')?.dataset.listName;
    listElement.innerHTML = '';

    if (Object.keys(contactLists).length === 0) {
        listElement.innerHTML = '<li>Aucune liste.</li>';
        return;
    }

    for (const name in contactLists) {
        const listItem = document.createElement('li');
        listItem.dataset.listName = name;
        listItem.innerHTML = `<span>${name}</span><button class="delete-list" title="Supprimer">&times;</button>`;
        if (name === currentSelected) {
            listItem.classList.add('selected');
        }
        listElement.appendChild(listItem);
    }
}

/**
 * Crée et injecte la fenêtre modale pour les options.
 */
function injectOptionsModal() {
    if (document.getElementById('cx-options-modal-overlay')) return;

    const modal = document.createElement('div');
    modal.id = 'cx-options-modal-overlay';
    modal.classList.add('cx-modal-hidden');
    modal.innerHTML = `
        <div id="cx-options-modal-content">
            <div id="cx-options-modal-header">
                <h2>⚙️ Options</h2>
                <button id="cx-options-modal-close-btn">&times;</button>
            </div>
            <div id="cx-options-modal-body">
                <div class="cx-option-item">
                    <label for="cx-delay-min">Délai minimum entre les messages (secondes)</label>
                    <input type="number" id="cx-delay-min" min="1">
                    <div class="cx-option-description">Un délai aléatoire est appliqué (entre la valeur min et le double de cette valeur) pour simuler un comportement humain.</div>
                </div>
                <div class="cx-option-item">
                    <label for="cx-dev-mode-switch">Mode développeur</label>
                    <label class="cx-switch">
                        <input type="checkbox" id="cx-dev-mode-switch">
                        <span class="cx-slider round"></span>
                    </label>
                    <div class="cx-option-description">Affiche les options de débogage comme le bouton des logs dans le popup.</div>
                </div>
            </div>
            <div id="cx-options-modal-footer">
                <div id="cx-options-save-status"></div>
                <button id="cx-options-save-btn">Enregistrer</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // --- Logic ---
    const overlay = document.getElementById('cx-options-modal-overlay');
    const closeBtn = document.getElementById('cx-options-modal-close-btn');
    const saveBtn = document.getElementById('cx-options-save-btn');

    closeBtn.addEventListener('click', closeOptionsModal);
    overlay.addEventListener('click', (e) => {
        if (e.target.id === 'cx-options-modal-overlay') {
            closeOptionsModal();
        }
    });

    saveBtn.addEventListener('click', async () => {
        const delayMinInput = document.getElementById('cx-delay-min');
        const devModeSwitch = document.getElementById('cx-dev-mode-switch');
        const statusDiv = document.getElementById('cx-options-save-status');

        const delayMin = parseInt(delayMinInput.value, 10);
        const devMode = devModeSwitch.checked;

        if (isNaN(delayMin) || delayMin < 1) {
            statusDiv.textContent = 'Délai invalide (min 1s).';
            statusDiv.style.color = '#c62828'; // Rouge
            return;
        }

        const { config = {} } = await chrome.storage.local.get('config');
        const newConfig = { ...config, delayMin, devMode };

        await chrome.storage.local.set({ config: newConfig });

        statusDiv.textContent = 'Options enregistrées !';
        statusDiv.style.color = '#00a884'; // Vert
        setTimeout(() => { statusDiv.textContent = ''; }, 2000);
    });
}

async function openOptionsModal() {
    const modal = document.getElementById('cx-options-modal-overlay');
    if (modal) {
        const { config } = await chrome.storage.local.get({ config: { delayMin: 5, devMode: false } });
        document.getElementById('cx-delay-min').value = config.delayMin;
        document.getElementById('cx-dev-mode-switch').checked = config.devMode;
        modal.classList.remove('cx-modal-hidden');
    }
}

function closeOptionsModal() {
    const modal = document.getElementById('cx-options-modal-overlay');
    if (modal) modal.classList.add('cx-modal-hidden');
}

/**
 * Point d'entrée pour l'initialisation de l'interface injectée.
 * Attend que l'interface de WhatsApp soit prête avant d'injecter la barre d'outils.
 */
async function initializeInjectedUI() {
    try {
        await waitForElement('#pane-side', 20000); // Attend un élément stable de l'UI de WA
        const { activationToken } = await chrome.storage.local.get('activationToken');
        const isActive = !!activationToken;

        injectToolbar(isActive);
        // Injecte les modales juste après la toolbar pour garantir leur présence avant l'ajout des listeners
        if (isActive) {
            injectBulkSendModal();
            injectTemplatesModal();
            injectContactListsModal();
            injectOptionsModal();
            injectCopilotSettingsModal();
            
            // Initialiser l'observer pour l'interface copilote
            initializeCopilotObserver();
        }
    } catch (error) {
        console.error('CX Sender: Impossible d\'injecter la barre d\'outils. L\'interface WhatsApp n\'a pas été trouvée.', error);
    }
}

// Lance l'injection de l'UI
initializeInjectedUI();

/**
 * Normalise un numéro en format +prefixNNNNNNNNN.
 * @param {string} raw - Le numéro brut.
 * @returns {string} - Le numéro normalisé.
 */
function normalizePhoneNumber(raw) {
    let num = raw.replace(/[^\d]/g, '');
    if (num.startsWith('0')) num = '212' + num.slice(1);
    if (!num.startsWith('212') && num.length === 9) num = '212' + num;
    return '+' + num;
}

/**
 * Affiche des labels sur le contact si le numéro est déjà dans des listes.
 * @param {Element} block - Le bloc info du contact.
 * @param {string} normalizedNumber - Le numéro normalisé.
 * @param {Object} contactLists - Les listes de contacts déjà chargées.
 */
function showContactListLabels(block, normalizedNumber, contactLists) {
    const lists = Object.entries(contactLists)
        .filter(([name, content]) => {
            const numbers = content.split('\n').map(x => x.trim());
            return numbers.includes(normalizedNumber);
        })
        .map(([name]) => name);

    block.querySelectorAll('.cxws-contact-list-label').forEach(e => e.remove());

    if (lists.length > 0) {
        const labelContainer = document.createElement('span');
        labelContainer.className = 'cxws-contact-list-label';
        labelContainer.style.marginLeft = '8px';
        lists.forEach(listName => {
            const lbl = document.createElement('span');
            lbl.innerText = `📋 ${listName}`;
            lbl.style.background = '#e1f7e6';
            lbl.style.color = '#25d366';
            lbl.style.borderRadius = '4px';
            lbl.style.padding = '2px 6px';
            lbl.style.marginRight = '4px';
            lbl.style.fontSize = '11px';
            labelContainer.appendChild(lbl);
        });
        let numberSpan = block.querySelector('span[dir="auto"]');
        if (numberSpan) numberSpan.parentNode.appendChild(labelContainer);
    }
}

/**
 * Injecte le bouton "Ajouter à une liste" à côté du numéro dans la fiche contact.
 * Affiche un sélecteur de liste lors du clic.
 * Affiche aussi les labels des listes.
 * Optimisé pour éviter les ralentissements.
 */
function injectAddToListButtonOnContactInfo(contactLists) {
    const infoBlocks = document.querySelectorAll('.x1c4vz4f.x3nfvp2.xuce83p.x1bft6iq.x1i7k8ik.xq9mrsl.x6s0dn4');
    infoBlocks.forEach(block => {
        let numberSpan = block.querySelector('span[dir="auto"]');
        if (!numberSpan) return;
        const numberText = numberSpan.textContent.trim();
        if (!/^\+?\d[\d\s\-]+$/.test(numberText)) return;
        const normalized = normalizePhoneNumber(numberText);

        showContactListLabels(block, normalized, contactLists);

        if (block.querySelector('.cxws-addtolist-btn')) return;

        const btn = document.createElement('button');
        btn.innerText = '➕ Ajouter à une liste';
        btn.className = 'cxws-addtolist-btn';
        btn.style.marginLeft = '8px';
        btn.style.background = '#25d366';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '4px';
        btn.style.padding = '2px 8px';
        btn.style.fontSize = '12px';
        btn.style.cursor = 'pointer';
        btn.style.zIndex = '10010';
        btn.style.pointerEvents = 'auto';
        numberSpan.parentNode.appendChild(btn);

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const listNames = Object.keys(contactLists);
            if (listNames.length === 0) {
                alert('Aucune liste existante. Créez une liste d\'abord.');
                return;
            }

            let popup = document.getElementById('cxws-addtolist-popup');
            if (popup) popup.remove();
            popup = document.createElement('div');
            popup.id = 'cxws-addtolist-popup';
            popup.style.position = 'fixed';
            popup.style.top = (e.clientY + 10) + 'px';
            popup.style.left = (e.clientX - 80) + 'px';
            popup.style.background = '#fff';
            popup.style.border = '1px solid #25d366';
            popup.style.borderRadius = '6px';
            popup.style.padding = '10px';
            popup.style.zIndex = 9999;
            popup.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            popup.innerHTML = `
                <div style="margin-bottom:6px;font-weight:bold;">Ajouter à une liste :</div>
                <select id="cxws-list-select" style="width:100%;margin-bottom:8px;">
                    ${listNames.map(name => `<option value="${name}">${name}</option>`).join('')}
                </select>
                <button id="cxws-confirm-add-btn" style="background:#25d366;color:#fff;border:none;border-radius:4px;padding:4px 12px;cursor:pointer;">Ajouter</button>
                <button id="cxws-cancel-add-btn" style="margin-left:8px;background:#eee;color:#333;border:none;border-radius:4px;padding:4px 12px;cursor:pointer;">Annuler</button>
            `;
            document.body.appendChild(popup);

            popup.querySelector('#cxws-cancel-add-btn').onclick = () => popup.remove();

            popup.querySelector('#cxws-confirm-add-btn').onclick = async () => {
                const selectedList = popup.querySelector('#cxws-list-select').value;
                let content = contactLists[selectedList] || '';
                let numbers = content.split('\n').map(x => x.trim()).filter(x => x);
                if (!numbers.includes(normalized)) {
                    numbers.push(normalized);
                    contactLists[selectedList] = numbers.join('\n');
                    await chrome.storage.local.set({ contactLists });
                }
                popup.remove();
                alert(`Numéro ${normalized} ajouté à la liste "${selectedList}"`);
                showContactListLabels(block, normalized, contactLists);
            };
        });
    });
}

// Debounce pour limiter la fréquence d'injection
let cxwsInjectTimeout = null;
function debouncedInjectContactInfo() {
    if (cxwsInjectTimeout) clearTimeout(cxwsInjectTimeout);
    cxwsInjectTimeout = setTimeout(async () => {
        const { contactLists = {} } = await chrome.storage.local.get('contactLists');
        injectAddToListButtonOnContactInfo(contactLists);
    }, 300); // 300ms après la dernière mutation
}

// Observe les changements du DOM pour injecter le bouton à chaque affichage de fiche contact
const cxwsContactInfoObserver = new MutationObserver(() => {
    debouncedInjectContactInfo();
});
cxwsContactInfoObserver.observe(document.body, { childList: true, subtree: true });

/**
 * Injecte un bouton "Insérer un modèle" comme dernier bouton à droite dans la zone de saisie de message.
 * Affine le visuel et affiche la liste au-dessus du bouton, centrée dans la fenêtre.
 * Lors de l'insertion, remplit le champ message et prépare les pièces jointes (sans envoyer).
 */
function injectInsertTemplateButton() {
    const inputToolbar = document.querySelector('div._ak1r');
    if (!inputToolbar) return;
    if (inputToolbar.querySelector('.cxws-insert-template-btn')) return;

    // Trouve le bouton emoji pour positionner le bouton à droite
    const emojiBtn = inputToolbar.querySelector('button[aria-label="Sélecteur d’expressions"]');
    if (!emojiBtn) return;

    // Crée le bouton
    const btn = document.createElement('button');
    btn.className = 'cxws-insert-template-btn';
    btn.title = 'Insérer un modèle de message';
    btn.style.background = 'none';
    btn.style.border = 'none';
    btn.style.cursor = 'pointer';
    btn.style.marginLeft = '8px';
    btn.style.marginRight = '4px';
    btn.style.fontSize = '18px';
    btn.style.padding = '4px 8px';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.zIndex = '10010';
    btn.style.pointerEvents = 'auto';
    btn.innerHTML = `<span aria-hidden="true" style="color:#25d366;">📝</span>`;

    // Ajoute le bouton comme dernier enfant du toolbar (à droite)
    emojiBtn.parentNode.parentNode.appendChild(btn);

    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const { messageTemplates = {} } = await chrome.storage.local.get('messageTemplates');
        const templateNames = Object.keys(messageTemplates);
        if (templateNames.length === 0) {
            alert('Aucun modèle disponible.');
            return;
        }

        // Supprime le popup existant
        let popup = document.getElementById('cxws-insert-template-popup');
        if (popup) popup.remove();

        // Affiche le popup centré dans la fenêtre (pour éviter qu'il soit hors vue)
        popup = document.createElement('div');
        popup.id = 'cxws-insert-template-popup';
        popup.style.position = 'fixed';
        popup.style.left = '50%';
        popup.style.top = '35%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.style.background = '#fff';
        popup.style.border = '1px solid #25d366';
        popup.style.borderRadius = '8px';
        popup.style.padding = '16px 20px';
        popup.style.zIndex = 9999;
        popup.style.boxShadow = '0 4px 16px rgba(0,0,0,0.18)';
        popup.style.minWidth = '220px';
        popup.style.textAlign = 'center';

        popup.innerHTML = `
            <div style="margin-bottom:12px;font-weight:bold;color:#25d366;">Modèles de message</div>
            <select id="cxws-template-select" style="width:100%;margin-bottom:12px;padding:6px 8px;border-radius:4px;border:1px solid #ddd;">
                ${templateNames.map(name => `<option value="${name}">${name}</option>`).join('')}
            </select>
            <div>
                <button id="cxws-insert-template-confirm-btn" style="background:#25d366;color:#fff;border:none;border-radius:4px;padding:6px 18px;cursor:pointer;font-size:14px;">Insérer</button>
                <button id="cxws-insert-template-cancel-btn" style="margin-left:8px;background:#eee;color:#333;border:none;border-radius:4px;padding:6px 18px;cursor:pointer;font-size:14px;">Annuler</button>
            </div>
        `;
        document.body.appendChild(popup);

        popup.querySelector('#cxws-insert-template-cancel-btn').onclick = () => popup.remove();

        popup.querySelector('#cxws-insert-template-confirm-btn').onclick = async () => {
            const selectedName = popup.querySelector('#cxws-template-select').value;
            const template = messageTemplates[selectedName];
            let message = typeof template === 'object' ? template.message : template;
            let attachments = typeof template === 'object' && template.attachments ? template.attachments : [];

            // Remplit la barre d'envoi du message (pas la barre de recherche)
            const inputBox = document.querySelector('div[contenteditable="true"][role="textbox"][aria-label*="message"]');
            if (inputBox) {
                inputBox.focus();
                // Efface le contenu précédent
                inputBox.innerHTML = '';
                document.execCommand('insertText', false, message);
                inputBox.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // Ajoute les fichiers joints (prévisualisation, sans envoyer)
            if (attachments.length > 0) {
                // Trouve le bouton "Joindre"
                const attachButtonIcon = document.querySelector("span[data-icon='clip'], span[data-icon='plus-rounded']");
                const attachButton = attachButtonIcon ? attachButtonIcon.closest('button') : null;
                if (attachButton) {
                    attachButton.click();
                    // Attend le bouton "media" ou "document"
                    let fileType = attachments[0].type;
                    let attachmentTypeIconSelector;
                    if (fileType.startsWith('image/') || fileType.startsWith('video/')) {
                        attachmentTypeIconSelector = "span[data-icon='media-filled-refreshed']";
                    } else if (fileType.startsWith('audio/')) {
                        attachmentTypeIconSelector = "span[data-icon='ic-headphones-filled']";
                    } else {
                        attachmentTypeIconSelector = "span[data-icon='document-filled-refreshed']";
                    }
                    try {
                        const typeIcon = await waitForElement(attachmentTypeIconSelector, 3000);
                        const typeButton = typeIcon.closest("li[role='button']");
                        const fileInput = typeButton ? typeButton.querySelector("input[type='file']") : null;
                        if (fileInput) {
                            const dataTransfer = new DataTransfer();
                            attachments.forEach(att => {
                                const fileObj = dataURLtoFile(att.dataUrl, att.name);
                                dataTransfer.items.add(fileObj);
                            });
                            fileInput.files = dataTransfer.files;
                            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    } catch (err) {
                        // ignore si pas de bouton trouvé
                    }
                }
            }
            popup.remove();
        };
    });
}

// Debounce pour limiter la fréquence d'injection du bouton
let cxwsInsertBtnTimeout = null;
function debouncedInjectInsertTemplateButton() {
    if (cxwsInsertBtnTimeout) clearTimeout(cxwsInsertBtnTimeout);
    cxwsInsertBtnTimeout = setTimeout(() => {
        injectInsertTemplateButton();
    }, 300);
}

// Observe les changements du DOM pour injecter le bouton dans la zone de saisie
const cxwsInsertBtnObserver = new MutationObserver(() => {
    debouncedInjectInsertTemplateButton();
});
cxwsInsertBtnObserver.observe(document.body, { childList: true, subtree: true });

// Fonction pour injecter la modale de configuration du copilote
function injectCopilotSettingsModal() {
    if (document.getElementById('cx-copilot-settings-modal')) return;

    // Ajout de logs pour le débogage
    console.log('Injecting Copilot Settings Modal...');

    const modal = document.createElement('div');
    modal.id = 'cx-copilot-settings-modal';
    modal.className = 'cx-modal-hidden';
    modal.innerHTML = `
        <div id="cx-copilot-settings-content">
            <div id="cx-copilot-settings-header">
                <h2>🤖 Paramètres Copilote</h2>
                <button id="cx-copilot-settings-close-btn">&times;</button>
            </div>
            <div id="cx-copilot-settings-body">
                <div class="cx-modal-section">
                    <label for="cx-api-key">Clé API (Gemini/GPT)</label>
                    <input type="password" id="cx-api-key" placeholder="Entrez votre clé API..." autocomplete="off">
                </div>
                <div class="cx-modal-section">
                    <label for="cx-custom-instructions">Instructions personnalisées</label>
                    <textarea id="cx-custom-instructions" placeholder="Ajoutez vos instructions ici..."></textarea>
                </div>
            </div>
            <div id="cx-copilot-settings-footer">
                <button id="cx-copilot-settings-save-btn">Enregistrer</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Gestion des événements pour la modale
    const closeBtn = document.getElementById('cx-copilot-settings-close-btn');
    const saveBtn = document.getElementById('cx-copilot-settings-save-btn');

    closeBtn.addEventListener('click', () => {
        modal.classList.add('cx-modal-hidden');
    });

    saveBtn.addEventListener('click', async () => {
        const apiKey = document.getElementById('cx-api-key').value.trim();
        const customInstructions = document.getElementById('cx-custom-instructions').value.trim();
        await chrome.storage.local.set({
            copilotConfig: { apiKey, customInstructions }
        });
        alert('Paramètres enregistrés avec succès !');
        modal.classList.add('cx-modal-hidden');
    });

    // Pré-remplir les champs avec la config enregistrée à chaque ouverture
    modal.addEventListener('transitionend', async () => {
        if (!modal.classList.contains('cx-modal-hidden')) {
            const { copilotConfig = {} } = await chrome.storage.local.get('copilotConfig');
            document.getElementById('cx-api-key').value = copilotConfig.apiKey || '';
            document.getElementById('cx-custom-instructions').value = copilotConfig.customInstructions || '';
        }
    });
}

// Injection de la modale de configuration du copilote au démarrage
injectCopilotSettingsModal();

// =================================================================================================
// INTERFACE COPILOTE IA - VERSION MODERNE ET FLUIDE
// =================================================================================================

/**
 * Injecte l'interface copilote moderne dans la conversation
 */
function injectCopilotInterface() {
    // Éviter les doublons
    if (document.getElementById('cx-copilot-box')) return;

    // Vérifier qu'on est dans une conversation
    const chatArea = document.querySelector('[data-testid="conversation-panel-messages"]');
    if (!chatArea) return;

    // Créer la boîte copilote principale
    const copilotBox = document.createElement('div');
    copilotBox.id = 'cx-copilot-box';
    copilotBox.className = 'hidden'; // Caché par défaut
    copilotBox.innerHTML = `
        <div id="cx-copilot-header">
            <div id="cx-copilot-title">
                <span class="icon">🤖</span>
                <span>Assistant IA</span>
            </div>
            <button id="cx-copilot-close" title="Fermer">&times;</button>
        </div>
        <div id="cx-copilot-body">
            <textarea id="cx-copilot-input" placeholder="Décrivez le type de réponse que vous souhaitez..."></textarea>
            <div id="cx-copilot-actions">
                <button class="cx-copilot-btn cx-copilot-btn-secondary" id="cx-copilot-clear">
                    🗑️ Effacer
                </button>
                <button class="cx-copilot-btn cx-copilot-btn-primary" id="cx-copilot-generate">
                    ✨ Générer
                </button>
            </div>
        </div>
    `;

    // Créer le bouton de suggestions flottant
    const suggestionsBtn = document.createElement('button');
    suggestionsBtn.id = 'cx-copilot-suggestions-btn';
    suggestionsBtn.innerHTML = `
        <span>💡</span>
        <span>Suggestions IA</span>
    `;

    // Ajouter les éléments au DOM
    document.body.appendChild(copilotBox);
    document.body.appendChild(suggestionsBtn);

    // Attacher les événements
    attachCopilotEvents();

    console.log('Interface copilote moderne injectée avec succès');
}

/**
 * Attache les événements pour l'interface copilote
 */
function attachCopilotEvents() {
    const copilotBox = document.getElementById('cx-copilot-box');
    const suggestionsBtn = document.getElementById('cx-copilot-suggestions-btn');
    const closeBtn = document.getElementById('cx-copilot-close');
    const clearBtn = document.getElementById('cx-copilot-clear');
    const generateBtn = document.getElementById('cx-copilot-generate');
    const input = document.getElementById('cx-copilot-input');

    // Afficher/masquer la boîte copilote
    suggestionsBtn?.addEventListener('click', () => {
        // Au lieu d'ouvrir la boîte d'input, afficher directement les suggestions
        showCopilotSuggestions();
    });

    // Fermer la boîte copilote
    closeBtn?.addEventListener('click', () => {
        copilotBox.classList.add('hidden');
    });

    // Effacer le texte
    clearBtn?.addEventListener('click', () => {
        input.value = '';
        input.focus();
    });

    // Générer une réponse IA
    generateBtn?.addEventListener('click', async () => {
        const prompt = input.value.trim();
        if (!prompt) {
            alert('Veuillez saisir une instruction pour l\'IA');
            return;
        }

        await generateCopilotResponse(prompt);
    });

    // Raccourci clavier pour générer (Ctrl+Enter)
    input?.addEventListener('keydown', async (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            const prompt = input.value.trim();
            if (prompt) {
                await generateCopilotResponse(prompt);
            }
        }
    });
}

/**
 * Génère une réponse avec l'IA et l'affiche
 */
async function generateCopilotResponse(prompt) {
    const generateBtn = document.getElementById('cx-copilot-generate');
    const originalText = generateBtn.textContent;

    try {
        // Afficher l'état de chargement
        generateBtn.innerHTML = '<span class="cx-copilot-loading">Génération...</span>';
        generateBtn.disabled = true;

        // Récupérer le contexte de la conversation
        const conversationContext = extractConversationContext();
        
        // Construire le prompt complet
        const fullPrompt = `Contexte de la conversation:\n${conversationContext}\n\nInstruction: ${prompt}\n\nVeuillez fournir une réponse appropriée en français.`;

        // Appeler l'IA
        const response = await callCopilotAI(fullPrompt);

        // Afficher la réponse
        showCopilotResponse(response);

    } catch (error) {
        console.error('Erreur lors de la génération IA:', error);
        alert('Erreur lors de la génération: ' + error.message);
    } finally {
        // Restaurer le bouton
        generateBtn.innerHTML = '✨ Générer';
        generateBtn.disabled = false;
    }
}

/**
 * Extrait le contexte de la conversation WhatsApp
 */
function extractConversationContext() {
    const messages = document.querySelectorAll('[data-testid="msg-container"]');
    const recentMessages = Array.from(messages).slice(-10); // 10 derniers messages
    
    let context = '';
    recentMessages.forEach(msg => {
        const textElement = msg.querySelector('[data-testid="conversation-text"]');
        if (textElement) {
            const isOutgoing = msg.querySelector('[data-testid="msg-meta"]')?.closest('[data-testid="msg-container"]')?.classList.contains('message-out');
            const sender = isOutgoing ? 'Moi' : 'Contact';
            context += `${sender}: ${textElement.textContent.trim()}\n`;
        }
    });
    
    return context || 'Aucun contexte de conversation disponible.';
}

/**
 * Affiche un popup avec des suggestions prédéfinies
 */
function showCopilotSuggestions() {
    // Nettoyer les anciens éléments qui pourraient traîner
    const oldSuggestionsBox = document.getElementById('cx-copilot-suggestions-box');
    if (oldSuggestionsBox) {
        oldSuggestionsBox.remove();
    }
    
    // Supprimer l'ancien popup s'il existe
    const existingPopup = document.getElementById('cx-copilot-suggestions-popup');
    if (existingPopup) existingPopup.remove();

    // Récupérer le contexte de la conversation
    const conversationContext = extractConversationContext();
    
    // Suggestions prédéfinies basées sur le contexte
    const suggestions = [
        {
            title: "Réponse professionnelle",
            text: "Rédigez une réponse professionnelle et courtoise en tenant compte du contexte de la conversation."
        },
        {
            title: "Réponse amicale",
            text: "Écrivez une réponse chaleureuse et amicale qui maintient une bonne relation."
        },
        {
            title: "Résumé de conversation",
            text: "Résumez les points clés de cette conversation de manière claire et concise."
        },
        {
            title: "Réponse de remerciement",
            text: "Rédigez un message de remerciement approprié et sincère."
        },
        {
            title: "Demande de clarification",
            text: "Formulez poliment une demande de clarification ou d'information supplémentaire."
        },
        {
            title: "Proposition de solutions",
            text: "Proposez des solutions constructives basées sur la discussion en cours."
        }
    ];

    // Créer le popup de suggestions
    const suggestionsPopup = document.createElement('div');
    suggestionsPopup.id = 'cx-copilot-suggestions-popup';
    
    let suggestionsHTML = '';
    suggestions.forEach((suggestion, index) => {
        suggestionsHTML += `
            <div class="cx-suggestion-item" data-suggestion="${suggestion.text}">
                <div class="suggestion-title">${suggestion.title}</div>
                <div class="suggestion-text">${suggestion.text}</div>
            </div>
        `;
    });

    suggestionsPopup.innerHTML = `
        <div id="cx-copilot-suggestions-popup-header">
            <div id="cx-copilot-suggestions-popup-title">
                <span>💡</span>
                <span>Suggestions IA</span>
            </div>
            <button id="cx-copilot-suggestions-popup-close" title="Fermer">&times;</button>
        </div>
        <div id="cx-copilot-suggestions-popup-content">
            ${suggestionsHTML}
        </div>
        <div class="cx-copilot-suggestions-actions">
            <button class="cx-copilot-btn cx-copilot-btn-secondary" id="cx-open-custom-input">
                ✏️ Personnalisé
            </button>
            <button class="cx-copilot-btn cx-copilot-btn-primary" id="cx-refresh-suggestions">
                🔄 Actualiser
            </button>
        </div>
    `;

    // Ajouter au DOM
    document.body.appendChild(suggestionsPopup);

    // Fonction pour fermer le popup
    const closePopup = () => {
        suggestionsPopup.remove();
        document.removeEventListener('keydown', handleEscapeKey);
    };

    // Gérer la touche Échap
    const handleEscapeKey = (e) => {
        if (e.key === 'Escape') {
            closePopup();
        }
    };

    // Ajouter l'event listener pour Échap
    document.addEventListener('keydown', handleEscapeKey);

    // Attacher les événements
    const closeBtn = suggestionsPopup.querySelector('#cx-copilot-suggestions-popup-close');
    const customInputBtn = suggestionsPopup.querySelector('#cx-open-custom-input');
    const refreshBtn = suggestionsPopup.querySelector('#cx-refresh-suggestions');
    const suggestionItems = suggestionsPopup.querySelectorAll('.cx-suggestion-item');

    closeBtn.addEventListener('click', closePopup);

    // Bouton pour ouvrir la boîte d'input personnalisé
    customInputBtn.addEventListener('click', () => {
        closePopup();
        // Ouvrir la boîte d'input IA
        const copilotBox = document.getElementById('cx-copilot-box');
        if (copilotBox) {
            copilotBox.classList.remove('hidden');
            const input = document.getElementById('cx-copilot-input');
            if (input) input.focus();
        }
    });

    // Bouton pour actualiser les suggestions
    refreshBtn.addEventListener('click', () => {
        closePopup();
        showCopilotSuggestions(); // Réafficher le popup
    });

    // Clic sur une suggestion pour la générer
    suggestionItems.forEach(item => {
        item.addEventListener('click', async () => {
            const suggestionText = item.dataset.suggestion;
            closePopup();
            
            // Générer la réponse avec la suggestion sélectionnée
            try {
                // Construire le prompt complet
                const fullPrompt = `Contexte de la conversation:\n${conversationContext}\n\nInstruction: ${suggestionText}\n\nVeuillez fournir une réponse appropriée en français.`;

                // Afficher un indicateur de chargement temporaire
                const loadingPopup = document.createElement('div');
                loadingPopup.id = 'cx-copilot-loading';
                loadingPopup.style.cssText = `
                    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    background: white; padding: 20px; border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.12); z-index: 10025;
                    display: flex; align-items: center; gap: 12px;
                    font-family: var(--cx-font-family); color: #1a1a1a;
                `;
                loadingPopup.innerHTML = '<span class="cx-copilot-loading">Génération en cours...</span>';
                document.body.appendChild(loadingPopup);

                // Appeler l'IA
                const response = await callCopilotAI(fullPrompt);
                
                // Supprimer l'indicateur de chargement
                loadingPopup.remove();

                // Afficher la réponse
                showCopilotResponse(response);

            } catch (error) {
                console.error('Erreur lors de la génération IA:', error);
                if (document.getElementById('cx-copilot-loading')) {
                    document.getElementById('cx-copilot-loading').remove();
                }
                alert('Erreur lors de la génération: ' + error.message);
            }
        });
    });

    // Auto-fermeture après 60 secondes
    setTimeout(() => {
        if (document.getElementById('cx-copilot-suggestions-popup')) {
            closePopup();
        }
    }, 60000);
}

/**
 * Affiche la réponse de l'IA dans un popup discret
 */
function showCopilotResponse(response) {
    // Supprimer l'ancien popup s'il existe
    const existingPopup = document.getElementById('cx-copilot-response-popup');
    if (existingPopup) existingPopup.remove();

    // Créer le popup de réponse
    const responsePopup = document.createElement('div');
    responsePopup.id = 'cx-copilot-response-popup';
    responsePopup.innerHTML = `
        <div id="cx-copilot-response-popup-header">
            <div id="cx-copilot-response-popup-title">
                <span>🤖</span>
                <span>Réponse générée</span>
            </div>
            <button id="cx-copilot-response-popup-close" title="Fermer">&times;</button>
        </div>
        <div id="cx-copilot-response-popup-content">
            <p>${response.replace(/\n/g, '</p><p>')}</p>
        </div>
        <div class="cx-copilot-popup-actions">
            <button class="cx-copilot-btn cx-copilot-btn-secondary" id="cx-copilot-select-all">
                🔸 Tout
            </button>
            <button class="cx-copilot-btn cx-copilot-btn-primary" id="cx-copilot-copy-response">
                📋 Copier
            </button>
            <button class="cx-copilot-btn cx-copilot-btn-secondary" id="cx-copilot-insert-response">
                ➕ Insérer
            </button>
        </div>
    `;

    // Ajouter au DOM
    document.body.appendChild(responsePopup);

    // Fonction pour fermer le popup
    const closePopup = () => {
        responsePopup.remove();
        document.removeEventListener('keydown', handleEscapeKey);
    };

    // Gérer la touche Échap
    const handleEscapeKey = (e) => {
        if (e.key === 'Escape') {
            closePopup();
        }
    };

    // Ajouter l'event listener pour Échap
    document.addEventListener('keydown', handleEscapeKey);

    // Attacher les événements
    const closeBtn = responsePopup.querySelector('#cx-copilot-response-popup-close');
    const selectAllBtn = responsePopup.querySelector('#cx-copilot-select-all');
    const copyBtn = responsePopup.querySelector('#cx-copilot-copy-response');
    const insertBtn = responsePopup.querySelector('#cx-copilot-insert-response');
    const contentDiv = responsePopup.querySelector('#cx-copilot-response-popup-content');

    closeBtn.addEventListener('click', closePopup);

    // Bouton pour sélectionner tout le texte
    selectAllBtn.addEventListener('click', () => {
        const range = document.createRange();
        range.selectNodeContents(contentDiv);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        selectAllBtn.innerHTML = '✓ OK';
        selectAllBtn.style.background = '#28a745';
        setTimeout(() => {
            selectAllBtn.innerHTML = '🔸 Tout';
            selectAllBtn.style.background = '';
        }, 1500);
    });

    copyBtn.addEventListener('click', async () => {
        try {
            // Obtenir le texte pur sans balises HTML
            const textContent = contentDiv.textContent || contentDiv.innerText || response;
            await navigator.clipboard.writeText(textContent);
            copyBtn.innerHTML = '✓ Copié';
            copyBtn.style.background = '#28a745';
            setTimeout(() => {
                copyBtn.innerHTML = '📋 Copier';
                copyBtn.style.background = '';
            }, 2000);
        } catch (error) {
            console.error('Erreur lors de la copie:', error);
            // Fallback pour les navigateurs qui ne supportent pas navigator.clipboard
            const textContent = contentDiv.textContent || contentDiv.innerText || response;
            const textArea = document.createElement('textarea');
            textArea.value = textContent;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                document.execCommand('copy');
                copyBtn.innerHTML = '✓ Copié';
                copyBtn.style.background = '#28a745';
            } catch (err) {
                copyBtn.innerHTML = '❌ Erreur';
                copyBtn.style.background = '#dc3545';
            }
            
            document.body.removeChild(textArea);
            
            setTimeout(() => {
                copyBtn.innerHTML = '📋 Copier';
                copyBtn.style.background = '';
            }, 2000);
        }
    });

    insertBtn.addEventListener('click', () => {
        insertTextIntoWhatsAppInput(response);
        closePopup();
    });

    // Permettre la sélection du texte avec double-clic
    contentDiv.addEventListener('dblclick', () => {
        const range = document.createRange();
        range.selectNodeContents(contentDiv);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    });

    // Ajouter un menu contextuel personnalisé pour la copie
    contentDiv.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        
        // Simuler un clic sur le bouton copier
        copyBtn.click();
        
        // Message visuel temporaire
        const tooltip = document.createElement('div');
        tooltip.textContent = 'Texte copié !';
        tooltip.style.cssText = `
            position: fixed;
            left: ${e.clientX}px;
            top: ${e.clientY}px;
            background: #28a745;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 999999;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s;
        `;
        document.body.appendChild(tooltip);
        
        // Animation d'apparition
        setTimeout(() => tooltip.style.opacity = '1', 10);
        
        // Suppression après 1.5s
        setTimeout(() => {
            tooltip.style.opacity = '0';
            setTimeout(() => document.body.removeChild(tooltip), 300);
        }, 1500);
    });

    // Auto-fermeture après 30 secondes
    setTimeout(() => {
        if (document.getElementById('cx-copilot-response-popup')) {
            closePopup();
        }
    }, 30000);
}

/**
 * Insère le texte dans le champ de saisie WhatsApp
 */
function insertTextIntoWhatsAppInput(text) {
    const inputBox = document.querySelector('[data-testid="conversation-compose-box-input"]');
    if (inputBox) {
        inputBox.focus();
        
        // Utiliser la méthode de saisie simulée
        document.execCommand('insertText', false, text);
        
        // Déclencher les événements nécessaires
        inputBox.dispatchEvent(new Event('input', { bubbles: true }));
        inputBox.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

/**
 * Masque/Affiche l'interface copilote
 */
function toggleCopilotInterface() {
    const copilotBox = document.getElementById('cx-copilot-box');
    const suggestionsBtn = document.getElementById('cx-copilot-suggestions-btn');
    
    if (copilotBox && suggestionsBtn) {
        const isHidden = copilotBox.classList.contains('hidden');
        copilotBox.classList.toggle('hidden', !isHidden);
        suggestionsBtn.classList.toggle('hidden', !isHidden);
    }
}

// Observer pour injecter l'interface copilote quand une conversation est ouverte
let copilotObserver = null;
function initializeCopilotObserver() {
    if (copilotObserver) copilotObserver.disconnect();
    
    copilotObserver = new MutationObserver(() => {
        // Vérifier si on est dans une conversation
        const conversationPanel = document.querySelector('[data-testid="conversation-panel-messages"]');
        if (conversationPanel && !document.getElementById('cx-copilot-box')) {
            setTimeout(injectCopilotInterface, 1000); // Petit délai pour s'assurer que la conversation est chargée
        }
    });
    
    copilotObserver.observe(document.body, { childList: true, subtree: true });
}

// Fonction utilitaire pour appeler Gemini ou GPT
async function callCopilotAI(prompt) {
    const { copilotConfig = {} } = await chrome.storage.local.get('copilotConfig');
    const apiKey = copilotConfig.apiKey || '';
    const instructions = copilotConfig.customInstructions || '';
    if (!apiKey) throw new Error('Clé API manquante.');

    // Détection du type d'API (Gemini ou OpenAI)
    const isOpenAI = apiKey.startsWith('sk-');
    let endpoint, headers, body;
    if (isOpenAI) {
        endpoint = 'https://api.openai.com/v1/chat/completions';
        headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };
        body = JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: instructions },
                { role: 'user', content: prompt }
            ]
        });
    } else {
        // Gemini API (Google) - Correction du modèle
        endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
        headers = { 'Content-Type': 'application/json' };
        body = JSON.stringify({
            contents: [
                { parts: [ { text: instructions + '\n' + prompt } ] }
            ]
        });
    }
    try {
        const response = await fetch(endpoint, { method: 'POST', headers, body });
        const data = await response.json();
        if (isOpenAI) {
            return data.choices?.[0]?.message?.content || 'Réponse vide.';
        } else {
            return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Réponse vide.';
        }
    } catch (err) {
        return 'Erreur IA : ' + err.message;
    }
}

// Correction : injecter la box Copilot IA et le bouton Suggestions AVANT la barre d'input
function injectCopilotBox() {
    if (document.getElementById('cx-copilot-box')) return;
    const inputArea = document.querySelector('footer');
    if (!inputArea) return;
    const box = document.createElement('div');
    box.id = 'cx-copilot-box';
    box.style.background = '#f7fafc';
    box.style.border = '1px solid #d0d7de';
    box.style.borderRadius = '8px';
    box.style.padding = '12px 16px';
    box.style.margin = '12px 0';
    box.style.display = 'flex';
    box.style.flexDirection = 'column';
    box.style.gap = '8px';
    box.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)';
    box.style.zIndex = '10010';
    box.style.pointerEvents = 'auto';
    box.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
            <input type="text" id="cx-copilot-prompt" placeholder="Demandez à l'IA..." style="flex:1;padding:8px 12px;border-radius:6px;border:1px solid #d0d7de;font-size:15px;">
            <button id="cx-copilot-generate-btn" style="background:#00a884;color:#fff;border:none;border-radius:6px;padding:8px 18px;font-size:15px;cursor:pointer;">Générer</button>
        </div>
    `;
    inputArea.parentNode.insertBefore(box, inputArea);

    document.getElementById('cx-copilot-generate-btn').onclick = async () => {
        const prompt = document.getElementById('cx-copilot-prompt').value.trim();
        if (!prompt) {
            showCopilotResponse('Veuillez entrer une demande.');
            return;
        }
        
        // Afficher un message de chargement dans le popup
        showCopilotResponse('🔄 Génération en cours...');
        
        try {
            const result = await callCopilotAI(prompt);
            // Vider l'input après génération réussie
            document.getElementById('cx-copilot-prompt').value = '';
            // Afficher la réponse dans le popup
            showCopilotResponse(result);
        } catch (error) {
            showCopilotResponse('❌ Erreur lors de la génération. Veuillez réessayer.');
        }
    };

    // Ajouter la gestion de la touche Entrée pour l'input
    document.getElementById('cx-copilot-prompt').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('cx-copilot-generate-btn').click();
        }
    });
}

// Bouton pour afficher/masquer le copilote
function injectCopilotToggleBtn() {
    if (document.getElementById('cx-copilot-toggle-btn')) return;
    const inputArea = document.querySelector('footer');
    if (!inputArea) return;
    const btn = document.createElement('button');
    btn.id = 'cx-copilot-toggle-btn';
    btn.textContent = '👁️ Afficher/Masquer Copilot';
    btn.style.background = '#e9edef';
    btn.style.color = '#008a69';
    btn.style.border = 'none';
    btn.style.borderRadius = '20px';
    btn.style.padding = '8px 18px';
    btn.style.fontSize = '15px';
    btn.style.cursor = 'pointer';
    btn.style.margin = '8px 0';
    btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)';
    btn.style.zIndex = '10010';
    btn.style.pointerEvents = 'auto';
    inputArea.parentNode.insertBefore(btn, inputArea);
    btn.onclick = () => {
        const copilotBox = document.getElementById('cx-copilot-box');
        const suggestionsBtn = document.getElementById('cx-copilot-suggestions-btn');
        if (copilotBox) copilotBox.style.display = (copilotBox.style.display === 'none') ? 'flex' : 'none';
        if (suggestionsBtn) suggestionsBtn.style.display = (suggestionsBtn.style.display === 'none') ? 'inline-block' : 'none';
    };
}

// Ajout d'une croix pour fermer la box de réponse IA - DEPRECATED
// Cette fonction a été remplacée par la version popup à la ligne 1681

// Injection immédiate du bouton toggle copilote
function tryInjectCopilotElements() {
    const inputArea = document.querySelector('footer');
    if (inputArea) {
        injectCopilotToggleBtn();
        injectCopilotBox();
        injectCopilotSuggestionsBtn();
    }
}
let copilotInjectInterval = null;
copilotInjectInterval = setInterval(() => {
    tryInjectCopilotElements();
    // Si les deux éléments sont présents, on arrête l'intervalle
    if (document.getElementById('cx-copilot-box') && document.getElementById('cx-copilot-suggestions-btn')) {
        clearInterval(copilotInjectInterval);
    }
}, 500);

// Injection du bouton Suggestions Copilot et affichage des suggestions IA
function injectCopilotSuggestionsBtn() {
    if (document.getElementById('cx-copilot-suggestions-btn')) return;
    const inputArea = document.querySelector('footer');
    if (!inputArea) return;
    const btn = document.createElement('button');
    btn.id = 'cx-copilot-suggestions-btn';
    btn.textContent = '💡 Suggestions Copilot';
    btn.style.background = '#008a69';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.borderRadius = '20px';
    btn.style.padding = '8px 18px';
    btn.style.fontSize = '15px';
    btn.style.cursor = 'pointer';
    btn.style.margin = '8px 0';
    btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)';
    btn.style.zIndex = '10010';
    btn.style.pointerEvents = 'auto';
    inputArea.parentNode.insertBefore(btn, inputArea);

    btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = 'Analyse en cours...';
        // Récupérer les messages visibles de la conversation
        let messages = Array.from(document.querySelectorAll('div.message-in, div.message-out, div._1wlJG'));
        if (messages.length === 0) {
            messages = Array.from(document.querySelectorAll('[data-testid="msg-container"]'));
        }
        const texts = messages.map(m => m.innerText).filter(Boolean).join('\n');
        const prompt = `Voici la conversation WhatsApp :\n${texts}\n\nQuelles actions ou réponses suggères-tu ?`;
        const result = await callCopilotAI(prompt);
        showCopilotResponse(result); // Utiliser showCopilotResponse pour afficher dans le popup
        btn.disabled = false;
        btn.textContent = '💡 Suggestions Copilot';
    };
}

// Observer pour injecter la box IA à chaque affichage de conversation
// Injection immédiate de la barre Copilot dès que le footer est présent
function tryInjectCopilotElements() {
    const inputArea = document.querySelector('footer');
    if (inputArea) {
        injectCopilotToggleBtn();
        injectCopilotBox();
        injectCopilotSuggestionsBtn();
    }
}
copilotInjectInterval = setInterval(() => {
    tryInjectCopilotElements();
    // Si les deux éléments sont présents, on arrête l'intervalle
    if (document.getElementById('cx-copilot-box') && document.getElementById('cx-copilot-suggestions-btn')) {
        clearInterval(copilotInjectInterval);
    }
}, 500);

// Injection du bouton Suggestions Copilot et affichage des suggestions IA
function injectCopilotSuggestionsBtn() {
    if (document.getElementById('cx-copilot-suggestions-btn')) return;
    const inputArea = document.querySelector('footer');
    if (!inputArea) return;
    const btn = document.createElement('button');
    btn.id = 'cx-copilot-suggestions-btn';
    btn.textContent = '💡 Suggestions Copilot';
    btn.style.background = '#008a69';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.borderRadius = '20px';
    btn.style.padding = '8px 18px';
    btn.style.fontSize = '15px';
    btn.style.cursor = 'pointer';
    btn.style.margin = '8px 0';
    btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)';
    btn.style.zIndex = '10010';
    btn.style.pointerEvents = 'auto';
    inputArea.parentNode.insertBefore(btn, inputArea);

    btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = 'Analyse en cours...';
        // Récupérer les messages visibles de la conversation
        let messages = Array.from(document.querySelectorAll('div.message-in, div.message-out, div._1wlJG'));
        if (messages.length === 0) {
            messages = Array.from(document.querySelectorAll('[data-testid="msg-container"]'));
        }
        const texts = messages.map(m => m.innerText).filter(Boolean).join('\n');
        const prompt = `Voici la conversation WhatsApp :\n${texts}\n\nQuelles actions ou réponses suggères-tu ?`;
        const result = await callCopilotAI(prompt);
        showCopilotResponse(result); // Utiliser showCopilotResponse pour afficher dans le popup
        btn.disabled = false;
        btn.textContent = '💡 Suggestions Copilot';
    };
}

// Observer pour injecter le bouton Suggestions Copilot à chaque affichage de conversation
let cxCopilotSuggestionsTimeout = null;
function debouncedInjectCopilotSuggestionsBtn() {
    if (cxCopilotSuggestionsTimeout) clearTimeout(cxCopilotSuggestionsTimeout);
    cxCopilotSuggestionsTimeout = setTimeout(() => {
        injectCopilotSuggestionsBtn();
    }, 400);
}
const cxCopilotSuggestionsObserver = new MutationObserver(() => {
    debouncedInjectCopilotSuggestionsBtn();
});
cxCopilotSuggestionsObserver.observe(document.body, { childList: true, subtree: true });