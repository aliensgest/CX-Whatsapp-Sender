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
            const { message, contacts, attachments } = request;
            let successCount = 0;
            let errorDetails = [];

            for (let i = 0; i < contacts.length; i++) {
                const contact = contacts[i];
                chrome.runtime.sendMessage({ action: "updateProgress", processed: i, total: contacts.length, currentContact: contact });
                const result = await processSingleContact(contact, message, attachments);
                if (result.success) {
                    successCount++;
                } else {
                    errorDetails.push(`${contact}: ${result.reason}`);
                }
                const randomDelay = Math.floor(Math.random() * 2000) + 1000;
                console.log(`Waiting for ${randomDelay}ms before next contact...`);
                await sleep(randomDelay);
            }

            chrome.runtime.sendMessage({ action: "updateProgress", processed: contacts.length, total: contacts.length, currentContact: "Terminé !" });
            const finalStatus = `Terminé. ${successCount}/${contacts.length} message(s) envoyé(s) avec succès.`;
            sendResponse({ status: finalStatus, errors: errorDetails });
        })();

        return true; // Indispensable pour la réponse asynchrone
    }
});