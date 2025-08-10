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

    if (isActive) {
        toolbar.innerHTML = `
            <div class="cx-toolbar-left-content">
                <div class="cx-toolbar-brand">CX Sender</div>
                <div class="cx-toolbar-actions">
                    <button id="cx-send-bulk-btn" class="cx-toolbar-btn">🚀 Envoi en masse</button>
                    <button id="cx-manage-templates-btn" class="cx-toolbar-btn">📋 Gérer les modèles</button>
                    <button id="cx-manage-lists-btn" class="cx-toolbar-btn">👥 Gérer les listes</button>
                    <button id="cx-settings-btn" class="cx-toolbar-btn">⚙️ Options</button>
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

    if (isActive) {
        // --- Activation des boutons de la barre d'outils ---
        const bulkSendBtn = document.getElementById('cx-send-bulk-btn');
        bulkSendBtn.addEventListener('click', openBulkSendModal);

        const manageTemplatesBtn = document.getElementById('cx-manage-templates-btn');
        manageTemplatesBtn.addEventListener('click', openTemplatesModal);

        const manageListsBtn = document.getElementById('cx-manage-lists-btn');
        manageListsBtn.addEventListener('click', () => {
            openContactListsModal();
        });

        const settingsBtn = document.getElementById('cx-settings-btn');
        settingsBtn.addEventListener('click', openOptionsModal);
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
        contactsTextarea.value = contactLists[listName] || '';
    });
}

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

        modal.classList.remove('cx-modal-hidden');
    }
}

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
 * Affiche les pièces jointes dans l'éditeur de modèle.
 * @param {Array<object>} attachments - Le tableau des pièces jointes.
 */
function renderTemplateAttachments(attachments) {
    const previewContainer = document.getElementById('cx-template-attachment-preview');
    previewContainer.innerHTML = '';
    if (!attachments || attachments.length === 0) {
        previewContainer.innerHTML = '<p class="no-attachments">Aucune pièce jointe.</p>';
        return;
    }

    const list = document.createElement('ul');
    attachments.forEach((att, index) => {
        const listItem = document.createElement('li');
        listItem.dataset.index = index;
        listItem.innerHTML = `
            <span class="attachment-name" title="${att.name}">${att.name}</span>
            <button class="delete-attachment-btn" title="Supprimer">&times;</button>
        `;
        list.appendChild(listItem);
    });
    previewContainer.appendChild(list);

    // Ajoute un seul écouteur d'événements sur le conteneur
    list.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-attachment-btn')) {
            const item = e.target.closest('li');
            const indexToRemove = parseInt(item.dataset.index, 10);
            currentTemplateAttachments.splice(indexToRemove, 1);
            renderTemplateAttachments(currentTemplateAttachments); // Re-render the list
        }
    });
}

async function renderTemplatesInModal() {
    const { messageTemplates = {} } = await chrome.storage.local.get('messageTemplates');
    const listElement = document.getElementById('cx-templates-list');
    listElement.innerHTML = '';

    if (Object.keys(messageTemplates).length === 0) {
        listElement.innerHTML = '<li>Aucun modèle enregistré.</li>';
        return;
    }

    for (const name in messageTemplates) {
        const template = messageTemplates[name];
        const hasAttachments = (typeof template === 'object' && template.attachments && template.attachments.length > 0);

        const listItem = document.createElement('li');
        listItem.dataset.templateName = name;
        listItem.innerHTML = `
            <span>${name} ${hasAttachments ? '📎' : ''}</span>
            <button class="delete-template" title="Supprimer">&times;</button>
        `;
        listElement.appendChild(listItem);
    }
}

async function handleModalSend() {
    const sendBtn = document.getElementById('cx-modal-send-btn');
    const statusDiv = document.getElementById('cx-modal-status');
    sendBtn.disabled = true;
    statusDiv.textContent = 'Préparation de l\'envoi...';

    const message = document.getElementById('cx-modal-message').value.trim();
    const contacts = document.getElementById('cx-modal-contacts').value.split(/[\n,;]+/).map(c => c.trim()).filter(c => c);

    if (contacts.length === 0 || !message) {
        statusDiv.textContent = 'Veuillez fournir des contacts et un message.';
        sendBtn.disabled = false;
        return;
    }

    // Réutilisation de la logique d'envoi existante
    const { config } = await chrome.storage.local.get({ config: { delayMin: 5 } });
    const minDelaySeconds = config.delayMin;
    const maxDelaySeconds = minDelaySeconds * 2;
    let successCount = 0;
    let errorDetails = [];

    for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        statusDiv.textContent = `Envoi ${i + 1}/${contacts.length} à ${contact}...`;
        const result = await processSingleContact(contact, message, attachmentsForCurrentSend);
        if (result.success) {
            successCount++;
        } else {
            errorDetails.push(`${contact}: ${result.reason}`);
        }
        const randomDelay = Math.floor(Math.random() * (maxDelaySeconds - minDelaySeconds + 1) + minDelaySeconds) * 1000;
        if (i < contacts.length - 1) await sleep(randomDelay);
    }

    statusDiv.textContent = `Terminé. ${successCount}/${contacts.length} envoyé(s).`;
    sendBtn.disabled = false;
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

        // N'injecte les modales que si l'extension est active
        if (isActive) {
            injectBulkSendModal();
            injectTemplatesModal();
            injectContactListsModal();
            injectOptionsModal();
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