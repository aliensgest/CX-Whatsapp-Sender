// =================================================================================================
// FONCTIONS UTILITAIRES ROBUSTES
// =================================================================================================

// Fonction pour créer des icônes SVG simples
function createIcon(type) {
    const icons = {
        rocket: '🚀',
        clipboard: '📋',
        users: '👥',
        settings: '⚙️',
        robot: '🤖',
        stop: '⏹️',
        save: '💾',
        import: '📊',
        download: '⬇️',
        sync: '🔄',
        edit: '✏️',
        copy: '📄',
        check: '✓'
    };
    return icons[type] || '●';
}

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

    // Étape 2/9 : Trouver et cliquer sur le bouton "Joindre" (SÉLECTEURS AMÉLIORÉS)
    console.log(`[sendAttachmentBatch] Searching for attachment button...`);
    const attachButtonIcon = await waitForElement("span[data-icon='clip'], span[data-icon='plus-rounded']", 10000);
    console.log(`[sendAttachmentBatch] Found attachment icon:`, attachButtonIcon);
    
    // Essayer plusieurs types d'éléments parents cliquables
    let attachButton = attachButtonIcon.closest('button');
    if (!attachButton) {
        attachButton = attachButtonIcon.closest('div[role="button"]');
    }
    if (!attachButton) {
        attachButton = attachButtonIcon.closest('[tabindex="0"]');
    }
    if (!attachButton) {
        // Fallback : prendre le parent direct si il est cliquable
        const parent = attachButtonIcon.parentElement;
        if (parent && (parent.onclick || parent.getAttribute('role') === 'button')) {
            attachButton = parent;
        }
    }
    
    if (!attachButton) {
        console.error('[sendAttachmentBatch] Attach button parent not found. Icon parent:', attachButtonIcon.parentElement);
        throw new Error("Étape 2/9 : Bouton 'Joindre' parent introuvable.");
    }
    
    console.log(`[sendAttachmentBatch] Found clickable attach button:`, attachButton);
    attachButton.click();
    console.log(`[sendAttachmentBatch] Clicked attachment button`);
    
    // Attendre que le menu s'ouvre
    await sleep(1000);

    // Étape 3/9 : Choisir le bon bouton (Média, Audio, ou Document) (SÉLECTEURS AMÉLIORÉS)
    let attachmentTypeIconSelector, attachmentTypeName;
    if (isMedia) {
        attachmentTypeIconSelector = "span[data-icon='media-filled-refreshed'], span[data-icon='photos-videos'], span[data-icon='media']";
        attachmentTypeName = 'Photos et vidéos';
    } else if (isAudio) {
        attachmentTypeIconSelector = "span[data-icon='ic-headphones-filled'], span[data-icon='audio'], span[data-icon='headphones']";
        attachmentTypeName = 'Audio';
    } else {
        attachmentTypeIconSelector = "span[data-icon='document-filled-refreshed'], span[data-icon='document'], span[data-icon='attach-document']";
        attachmentTypeName = 'Document';
    }

    console.log(`[sendAttachmentBatch] Searching for ${attachmentTypeName} button...`);
    const typeIcon = await waitForElement(attachmentTypeIconSelector, 5000);
    console.log(`[sendAttachmentBatch] Found ${attachmentTypeName} icon:`, typeIcon);

    // Étape 4/9 : Trouver l'input de fichier caché (SÉLECTEURS AMÉLIORÉS)
    let typeButton = typeIcon.closest("li[role='button']");
    if (!typeButton) {
        typeButton = typeIcon.closest("button");
    }
    if (!typeButton) {
        typeButton = typeIcon.closest("div[role='button']");
    }
    if (!typeButton) {
        typeButton = typeIcon.closest("[tabindex='0']");
    }
    
    if (!typeButton) {
        console.error(`[sendAttachmentBatch] ${attachmentTypeName} button parent not found. Icon parent:`, typeIcon.parentElement);
        throw new Error(`Étape 4/9 : Bouton '${attachmentTypeName}' parent introuvable.`);
    }
    
    console.log(`[sendAttachmentBatch] Found ${attachmentTypeName} button:`, typeButton);
    
    const fileInput = typeButton.querySelector("input[type='file']");
    if (!fileInput) {
        console.error(`[sendAttachmentBatch] File input not found in ${attachmentTypeName} button:`, typeButton);
        throw new Error(`Étape 4/9 : Input de fichier pour '${attachmentTypeName}' introuvable.`);
    }
    
    console.log(`[sendAttachmentBatch] Found file input:`, fileInput);

    // Étape 5/9 & 6/9 : Assigner les fichiers à l'input
    const dataTransfer = new DataTransfer();
    files.forEach(file => dataTransfer.items.add(file));
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Étape 7/9 : Attendre l'écran de prévisualisation (SÉLECTEURS AMÉLIORÉS)
    console.log(`[sendAttachmentBatch] Waiting for send button in preview...`);
    const sendIcon = await waitForElement("span[data-icon='send'], span[data-icon='wds-ic-send-filled'], span[data-testid='send'], svg[title='wds-ic-send-filled']", 15000);
    console.log(`[sendAttachmentBatch] Found send icon:`, sendIcon);
    
    let sendButtonAttachment = sendIcon.closest('button');
    if (!sendButtonAttachment) {
        sendButtonAttachment = sendIcon.closest('div[role="button"]');
    }
    if (!sendButtonAttachment) {
        sendButtonAttachment = sendIcon.closest('[tabindex="0"]');
    }
    if (!sendButtonAttachment) {
        sendButtonAttachment = sendIcon.closest('[aria-label*="nvoyer"], [aria-label*="Send"]');
    }
    
    if (!sendButtonAttachment) {
        console.error('[sendAttachmentBatch] Send button parent not found. Icon parent:', sendIcon.parentElement);
        throw new Error("Étape 7/9 : Bouton d'envoi final (parent) introuvable.");
    }
    
    console.log(`[sendAttachmentBatch] Found send button:`, sendButtonAttachment);

    // Étape 8/9 : Ajouter la légende (SÉLECTEURS AMÉLIORÉS)
    if (caption) {
        console.log(`[sendAttachmentBatch] Adding caption: ${caption}`);
        try {
            const captionBoxSelector = 'div[aria-label*="légende"], div[aria-label*="caption"], div[data-testid="pluggable-input-body"], div[contenteditable="true"][data-tab="1"], div[role="textbox"]';
            const captionBox = await waitForElement(captionBoxSelector, 5000);
            console.log(`[sendAttachmentBatch] Found caption box:`, captionBox);
            await typeIn(captionBox, caption);
            await sleep(500);
        } catch (error) {
            console.warn(`[sendAttachmentBatch] Could not find caption box, proceeding without caption:`, error.message);
        }
    }
    
    // Étape 9/9 : Cliquer sur le bouton d'envoi final
    console.log(`[sendAttachmentBatch] Clicking send button...`);
    sendButtonAttachment.click();
    console.log(`[sendAttachmentBatch] Send button clicked, waiting 2s...`);
    await sleep(2000);
    console.log(`[sendAttachmentBatch] Attachment batch sent successfully!`);
}


/**
 * Fonction principale qui envoie un message complet à un contact.
 * @param {string} contact - Le nom ou le numéro de téléphone du contact.
 * @param {string} message - Le message texte.
 * @param {Array<object>} attachmentsData - Les données des pièces jointes.
 * @returns {Promise<{success: boolean, reason: string}>} Résultat de l'opération.
 */
async function processSingleContact(contactName, message, attachmentsData) {
    // SÉLECTEURS AMÉLIORÉS AVEC FALLBACKS
    const SEARCH_BOX_SELECTOR = 'div[title="Search input text box"], div[title="Search input box"], div[data-testid="chat-list-search"] input, div[role="textbox"][data-tab="3"], input[data-testid="search-input"], div[contenteditable="true"][data-tab="3"]';
    const MESSAGE_BOX_SELECTOR = 'div[title="Type a message"], div[aria-label="Entrez un message"], div[aria-label="Envoyer un message"], div[data-tab="10"][role="textbox"], div[data-testid="conversation-compose-box-input"], div[contenteditable="true"][data-tab="10"], p[class*="selectable-text"]';
    const SEND_BUTTON_SELECTOR = 'button[aria-label="Send"], button[aria-label="Envoyer"], button[data-testid="send"], span[data-icon="send"], button[data-tab="11"], div[role="button"][aria-label="Send"], div[role="button"][aria-label="Envoyer"]';
    const CLEAR_SEARCH_SELECTOR = 'button[aria-label="Clear search"], button[data-testid="search-clear"], div[role="button"][aria-label="Clear search"]';

    try {
        console.log(`\n--- Processing Contact: ${contactName} ---`);

        // 1. Ouvrir la discussion
        const isPhoneNumber = /^\+?[0-9\s\-]+$/.test(contactName);
        
        if (isPhoneNumber) {
            // TOUJOURS utiliser la méthode directe pour les numéros de téléphone
            const phoneNumber = contactName.replace(/[\s+\-]/g, '');
            console.log(`[Bulk Send] Opening chat via URL for phone: ${phoneNumber}`);
            const tempLink = document.createElement('a');
            tempLink.href = `https://web.whatsapp.com/send?phone=${phoneNumber}`;
            document.body.appendChild(tempLink);
            tempLink.click();
            document.body.removeChild(tempLink);
            
            await sleep(3000); // Augmenté le délai
            
            // Vérifier s'il y a une popup d'erreur
            const errorPopup = document.querySelector("div[data-testid='popup-contents']");
            if (errorPopup && (errorPopup.textContent || '').toLowerCase().includes('invalid')) {
                document.querySelector("div[data-testid='popup-controls-ok'] button")?.click();
                throw new Error(`Numéro de téléphone non valide : ${contactName}`);
            }
        } else {
            // Seulement pour les noms (pas recommendé en mode bulk)
            console.log(`[Bulk Send] Searching for contact by name: ${contactName} (NOT RECOMMENDED)`);
            
            // Essayer plusieurs sélecteurs pour la boîte de recherche
            let searchBox = null;
            const searchSelectors = SEARCH_BOX_SELECTOR.split(', ');
            
            for (let selector of searchSelectors) {
                try {
                    searchBox = await waitForElement(selector, 2000);
                    console.log(`Search box found with selector: ${selector}`);
                    break;
                } catch (e) {
                    console.log(`Failed with selector: ${selector}`);
                    continue;
                }
            }
            
            if (!searchBox) {
                throw new Error('Search box not found with any selector');
            }
            
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
        const fileObjects = attachmentsData.map(att => {
            // Créer le fichier avec le bon type MIME
            let finalFileName = att.name;
            let finalMimeType = att.type;
            
            // Forcer .ogg pour les messages vocaux
            if (att.isVoiceMessage || att.name.includes('Message_vocal') || att.type.includes('ogg')) {
                if (!finalFileName.endsWith('.ogg')) {
                    finalFileName = finalFileName.replace(/\.(webm|mp3|wav|m4a)$/, '.ogg');
                }
                finalMimeType = 'audio/ogg';
            }
            
            // Créer une nouvelle dataURL avec le bon MIME type si nécessaire
            let finalDataURL = att.dataUrl;
            if (att.type !== finalMimeType) {
                finalDataURL = att.dataUrl.replace(/data:audio\/[^;]+/, `data:${finalMimeType}`);
            }
            
            return dataURLtoFile(finalDataURL, finalFileName);
        });
        
        const mediaAttachments = fileObjects.filter(att => att.type.startsWith('image/') || att.type.startsWith('video/'));
        const audioAttachments = fileObjects.filter(att => att.type.startsWith('audio/') && !att.name.endsWith('.ogg'));
        const voiceAttachments = fileObjects.filter(att => att.type.startsWith('audio/') && att.name.endsWith('.ogg'));
        const docAttachments = fileObjects.filter(att => !mediaAttachments.includes(att) && !audioAttachments.includes(att) && !voiceAttachments.includes(att));
        let captionSent = false;

        // 3. Envoyer les pièces jointes par lots
        if (mediaAttachments.length > 0) {
            await sendAttachmentBatch(mediaAttachments, message);
            captionSent = true;
        }
        if (audioAttachments.length > 0) {
            await sendAttachmentBatch(audioAttachments, null);
        }
        if (voiceAttachments.length > 0) {
            await sendVoiceMessages(voiceAttachments);
        }
        if (docAttachments.length > 0) {
            await sendAttachmentBatch(docAttachments, null);
        }

        // 4. Envoyer le message texte s'il n'a pas servi de légende
        if (message && !captionSent) {
            const messageBox = await waitForElement(MESSAGE_BOX_SELECTOR, 15000);
            await typeIn(messageBox, message);
            await sleep(500);
            
            // Debug: afficher les éléments disponibles
            console.log('[DEBUG] Recherche du bouton d\'envoi...');
            
            // Recherche améliorée du bouton d'envoi
            let sendButton = document.querySelector(SEND_BUTTON_SELECTOR);
            
            // Méthodes de fallback pour trouver le bouton d'envoi
            if (!sendButton) {
                // Méthode 1: Chercher par icône dans les spans
                sendButton = document.querySelector('span[data-icon="send"]')?.closest('button') ||
                           document.querySelector('span[data-icon="send"]')?.closest('div[role="button"]');
            }
            
            if (!sendButton) {
                // Méthode 2: Chercher dans les boutons proches de la zone de message
                const footer = document.querySelector('footer[data-testid="conversation-compose"]') || 
                              document.querySelector('div[data-testid="conversation-compose"]') ||
                              document.querySelector('footer');
                if (footer) {
                    sendButton = footer.querySelector('button[type="button"]:last-of-type') ||
                               footer.querySelector('div[role="button"]:last-of-type');
                }
            }
            
            if (!sendButton) {
                // Méthode 3: Utiliser keyboard shortcut comme fallback
                console.warn("[DEBUG] Bouton d'envoi non trouvé, tentative avec Enter");
                console.log("[DEBUG] Éléments disponibles:", {
                    footers: document.querySelectorAll('footer').length,
                    buttons: document.querySelectorAll('button').length,
                    sendIcons: document.querySelectorAll('span[data-icon="send"]').length
                });
                messageBox.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    keyCode: 13,
                    bubbles: true,
                    cancelable: true
                }));
            } else {
                console.log('[DEBUG] Bouton d\'envoi trouvé:', sendButton);
                sendButton.click();
            }
        }

        await sleep(1000);
        console.log(`--- Successfully processed ${contactName} ---`);
        return { success: true, reason: 'Envoyé' };
    } catch (error) {
        console.error(`Error processing contact ${contactName}:`, error);
        return { success: false, reason: error.message };
    }
}

/**
 * Envoie des fichiers audio .ogg comme des messages vocaux natifs WhatsApp
 * @param {Array<File>} voiceFiles - Les fichiers audio .ogg à envoyer
 */
/**
 * Convertit un fichier .ogg en .mp3 en utilisant lame.min.js
 * @param {File} oggFile - Le fichier .ogg à convertir
 * @returns {Promise<File>} Le fichier .mp3 converti
 */
async function convertOggToMp3(oggFile) {
    return new Promise((resolve, reject) => {
        console.log(`[convertOggToMp3] Début de conversion: ${oggFile.name}`);
        
        const fileReader = new FileReader();
        fileReader.onload = async function(event) {
            try {
                const arrayBuffer = event.target.result;
                
                // Décoder le fichier audio OGG
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                console.log(`[convertOggToMp3] Audio décodé - Durée: ${audioBuffer.duration}s, Canaux: ${audioBuffer.numberOfChannels}, Sample Rate: ${audioBuffer.sampleRate}`);
                
                // Convertir AudioBuffer en PCM data
                const pcmData = audioBufferToPCM(audioBuffer);
                
                // Initialiser l'encodeur MP3 LAME
                if (typeof lamejs === 'undefined') {
                    throw new Error('lame.min.js n\'est pas chargé correctement');
                }
                
                const mp3encoder = new lamejs.Mp3Encoder(audioBuffer.numberOfChannels, audioBuffer.sampleRate, 128); // 128 kbps
                
                // Encoder en MP3
                const blockSize = 1152; // Taille de bloc LAME standard
                const mp3Data = [];
                
                for (let i = 0; i < pcmData.length; i += blockSize) {
                    const sampleBlockSize = Math.min(blockSize, pcmData.length - i);
                    const sampleBlock = pcmData.slice(i, i + sampleBlockSize);
                    
                    let mp3buf;
                    if (audioBuffer.numberOfChannels === 1) {
                        mp3buf = mp3encoder.encodeBuffer(sampleBlock);
                    } else {
                        // Pour stéréo, séparer les canaux
                        const left = new Int16Array(sampleBlockSize / 2);
                        const right = new Int16Array(sampleBlockSize / 2);
                        for (let j = 0; j < sampleBlockSize / 2; j++) {
                            left[j] = sampleBlock[j * 2];
                            right[j] = sampleBlock[j * 2 + 1];
                        }
                        mp3buf = mp3encoder.encodeBuffer(left, right);
                    }
                    
                    if (mp3buf.length > 0) {
                        mp3Data.push(mp3buf);
                    }
                }
                
                // Finaliser l'encodage
                const finalBuffer = mp3encoder.flush();
                if (finalBuffer.length > 0) {
                    mp3Data.push(finalBuffer);
                }
                
                // Créer le blob MP3
                const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
                const mp3FileName = oggFile.name.replace(/\.ogg$/i, '.mp3');
                const mp3File = new File([mp3Blob], mp3FileName, { type: 'audio/mp3' });
                
                console.log(`[convertOggToMp3] Conversion réussie: ${mp3File.name}, taille: ${mp3File.size} bytes`);
                resolve(mp3File);
                
            } catch (error) {
                console.error('[convertOggToMp3] Erreur lors de la conversion:', error);
                reject(error);
            }
        };
        
        fileReader.onerror = () => {
            const error = new Error('Erreur lors de la lecture du fichier OGG');
            console.error('[convertOggToMp3]', error);
            reject(error);
        };
        
        fileReader.readAsArrayBuffer(oggFile);
    });
}

/**
 * Convertit un AudioBuffer en données PCM Int16
 * @param {AudioBuffer} audioBuffer 
 * @returns {Int16Array} Données PCM
 */
function audioBufferToPCM(audioBuffer) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const pcmData = new Int16Array(length * numberOfChannels);
    
    for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            const sample = Math.max(-1, Math.min(1, channelData[i]));
            pcmData[i * numberOfChannels + channel] = Math.round(sample * 32767);
        }
    }
    
    return pcmData;
}

async function sendVoiceMessages(voiceFiles) {
    if (!voiceFiles || voiceFiles.length === 0) return;

    console.log(`[sendVoiceMessages] Conversion et envoi de ${voiceFiles.length} fichier(s) audio`);

    for (const voiceFile of voiceFiles) {
        try {
            console.log(`[sendVoiceMessages] Traitement du fichier: ${voiceFile.name}`);
            
            // Convertir .ogg en .mp3 d'abord
            if (voiceFile.name.toLowerCase().includes('.ogg')) {
                console.log(`[sendVoiceMessages] Conversion OGG vers MP3 pour: ${voiceFile.name}`);
                const mp3File = await convertOggToMp3(voiceFile);
                console.log(`[sendVoiceMessages] Conversion réussie: ${mp3File.name}`);
                
                // Envoyer le fichier MP3 comme fichier audio
                await sendAudioFileDirectly(mp3File);
                console.log(`[sendVoiceMessages] Fichier MP3 envoyé avec succès: ${mp3File.name}`);
            } else {
                // Envoyer directement si ce n'est pas un .ogg
                await sendAudioFileDirectly(voiceFile);
                console.log(`[sendVoiceMessages] Fichier audio envoyé directement: ${voiceFile.name}`);
            }
            
        } catch (error) {
            console.error(`[sendVoiceMessages] Erreur lors du traitement de ${voiceFile.name}:`, error);
        }
    }
}

/**
 * Envoie un fichier audio directement selon la logique WhatsApp Web
 * @param {File} audioFile - Le fichier audio à envoyer
 */
async function sendAudioFileDirectly(audioFile) {
    console.log(`[sendAudioFileDirectly] Envoi de ${audioFile.name} comme fichier audio`);
    
    // Étape 1: Cliquer sur le bouton d'attachement (plus-rounded)
    console.log(`[sendAudioFileDirectly] Étape 1: Recherche du bouton d'attachement`);
    const attachIcon = await waitForElement('span[data-icon="plus-rounded"], span[data-icon="clip"]', 10000);
    const attachButton = attachIcon.closest('button') || attachIcon.closest('[role="button"]');
    if (!attachButton) throw new Error("Bouton d'attachement introuvable");
    
    console.log(`[sendAudioFileDirectly] Bouton d'attachement trouvé, clic...`);
    attachButton.click();
    await sleep(500);
    
    // Étape 2: Cliquer sur l'option Audio (ic-headphones-filled)
    console.log(`[sendAudioFileDirectly] Étape 2: Recherche de l'option Audio`);
    const audioIcon = await waitForElement('span[data-icon="ic-headphones-filled"]', 5000);
    const audioLi = audioIcon.closest('li') || audioIcon.closest('[role="button"]');
    if (!audioLi) throw new Error("Option Audio introuvable");
    
    console.log(`[sendAudioFileDirectly] Option Audio trouvée, clic...`);
    audioLi.click();
    await sleep(500);
    
    // Étape 3: Trouver l'input file et insérer le fichier
    console.log(`[sendAudioFileDirectly] Étape 3: Recherche de l'input file`);
    const fileInput = await waitForElement('input[accept*="audio"]', 5000);
    if (!fileInput) throw new Error("Input file audio introuvable");
    
    console.log(`[sendAudioFileDirectly] Input file trouvé, insertion du fichier...`);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(audioFile);
    fileInput.files = dataTransfer.files;
    
    const changeEvent = new Event('change', { bubbles: true });
    fileInput.dispatchEvent(changeEvent);
    await sleep(1500);
    
    // Étape 4: Attendre le preview et cliquer sur le bouton d'envoi
    console.log(`[sendAudioFileDirectly] Étape 4: Recherche du bouton d'envoi`);
    const sendIcon = await waitForElement('span[data-icon="wds-ic-send-filled"], span[data-icon="send"]', 10000);
    const sendButton = sendIcon.closest('button') || sendIcon.closest('[role="button"]') || sendIcon.closest('div[role="button"]');
    if (!sendButton) throw new Error("Bouton d'envoi introuvable");
    
    console.log(`[sendAudioFileDirectly] Bouton d'envoi trouvé, envoi...`);
    sendButton.click();
    await sleep(2000);
    
    console.log(`[sendAudioFileDirectly] Fichier ${audioFile.name} envoyé avec succès !`);
}

/**
 * Simule un enregistrement vocal natif WhatsApp en utilisant le bouton microphone
 * @param {File} audioFile - Le fichier audio à envoyer comme message vocal
 */
async function sendAsNativeVoiceMessage(audioFile) {
    console.log(`[sendAsNativeVoiceMessage] Simulation d'enregistrement vocal natif pour ${audioFile.name}`);
    
    // Étape 1: Trouver et cliquer sur le bouton microphone natif de WhatsApp
    console.log(`[sendAsNativeVoiceMessage] Étape 1: Recherche du bouton microphone...`);
    const micSelectors = [
        'span[data-icon="mic-outlined"]',
        'span[data-icon="mic"]',
        'span[data-icon="microphone"]',
        'button[aria-label*="Message vocal" i]',
        'button[aria-label*="Voice message" i]'
    ];
    
    let micIcon = null;
    for (const selector of micSelectors) {
        try {
            micIcon = await waitForElement(selector, 2000);
            console.log(`[sendAsNativeVoiceMessage] Bouton microphone trouvé avec: ${selector}`);
            break;
        } catch (e) {
            console.log(`[sendAsNativeVoiceMessage] Sélecteur ${selector} non trouvé`);
        }
    }
    
    if (!micIcon) {
        throw new Error("Bouton microphone natif introuvable");
    }
    
    const micButton = micIcon.closest('button');
    if (!micButton) throw new Error("Bouton microphone parent introuvable");
    
    // Étape 2: Intercepter MediaRecorder avant de cliquer
    console.log(`[sendAsNativeVoiceMessage] Étape 2: Interception de MediaRecorder...`);
    const originalMediaRecorder = window.MediaRecorder;
    let recordingStopped = false;
    
    // Créer un MediaRecorder simulé qui utilisera notre fichier audio
    window.MediaRecorder = class MockMediaRecorder extends EventTarget {
        constructor(stream, options) {
            super();
            this.state = 'inactive';
            this.stream = stream;
            this.options = options;
            console.log(`[MockMediaRecorder] Créé avec options:`, options);
        }
        
        start() {
            console.log(`[MockMediaRecorder] Démarrage de l'enregistrement simulé`);
            this.state = 'recording';
            
            // Déclencher l'événement start
            setTimeout(() => {
                this.dispatchEvent(new Event('start'));
                console.log(`[MockMediaRecorder] Événement 'start' déclenché`);
            }, 100);
        }
        
        stop() {
            if (recordingStopped) return;
            recordingStopped = true;
            
            console.log(`[MockMediaRecorder] Arrêt de l'enregistrement simulé`);
            this.state = 'inactive';
            
            // Convertir notre fichier en Blob et l'envoyer
            setTimeout(async () => {
                try {
                    const arrayBuffer = await audioFile.arrayBuffer();
                    const audioBlob = new Blob([arrayBuffer], { 
                        type: 'audio/ogg; codecs=opus' 
                    });
                    
                    console.log(`[MockMediaRecorder] Blob créé:`, {
                        size: audioBlob.size,
                        type: audioBlob.type
                    });
                    
                    // Déclencher l'événement dataavailable avec notre audio
                    const dataEvent = new Event('dataavailable');
                    dataEvent.data = audioBlob;
                    this.dispatchEvent(dataEvent);
                    console.log(`[MockMediaRecorder] Événement 'dataavailable' déclenché`);
                    
                    // Déclencher l'événement stop
                    this.dispatchEvent(new Event('stop'));
                    console.log(`[MockMediaRecorder] Événement 'stop' déclenché`);
                    
                } catch (error) {
                    console.error(`[MockMediaRecorder] Erreur lors de la création du blob:`, error);
                }
            }, 500);
        }
        
        pause() {
            this.state = 'paused';
        }
        
        resume() {
            this.state = 'recording';
        }
    };
    
    // Étape 3: Cliquer sur le bouton microphone pour commencer "l'enregistrement"
    console.log(`[sendAsNativeVoiceMessage] Étape 3: Clic sur le bouton microphone...`);
    micButton.click();
    
    // Attendre un peu pour que l'enregistrement démarre
    await sleep(1000);
    
    // Étape 4: Simuler la fin d'enregistrement en cliquant à nouveau
    console.log(`[sendAsNativeVoiceMessage] Étape 4: Arrêt de l'enregistrement...`);
    
    // Chercher le bouton d'arrêt (qui peut être le même bouton mais avec un état différent)
    try {
        const stopButton = await waitForElement('button[aria-label*="Arrêter" i], button[aria-label*="Stop" i], span[data-icon="mic-filled"]', 3000);
        const stopButtonElement = stopButton.closest ? stopButton.closest('button') : stopButton;
        if (stopButtonElement) {
            stopButtonElement.click();
        }
    } catch (e) {
        // Si on ne trouve pas le bouton d'arrêt spécifique, recliquer sur le bouton micro
        console.log(`[sendAsNativeVoiceMessage] Bouton d'arrêt non trouvé, reclic sur le microphone`);
        micButton.click();
    }
    
    // Étape 5: Attendre que le message soit traité et restaurer MediaRecorder
    setTimeout(() => {
        console.log(`[sendAsNativeVoiceMessage] Restauration de MediaRecorder original`);
        window.MediaRecorder = originalMediaRecorder;
    }, 3000);
    
    console.log(`[sendAsNativeVoiceMessage] Message vocal natif simulé envoyé !`);
}

/**
 * Envoie un fichier comme message vocal en utilisant les méthodes existantes
 */
async function sendAsVoiceMessage(audioFile) {
    console.log(`[sendAsVoiceMessage] Envoi de ${audioFile.name} comme message vocal`);
    
    // Méthode 1: Essayer d'utiliser l'enregistreur vocal natif de WhatsApp
    try {
        await sendAsNativeVoiceMessage(audioFile);
        console.log(`[sendAsVoiceMessage] Message vocal natif envoyé: ${audioFile.name}`);
        return;
    } catch (voiceError) {
        console.log(`[sendAsVoiceMessage] Échec de l'envoi vocal natif, tentative via MediaRecorder API`);
        
        // Méthode 2: Utiliser MediaRecorder API pour simuler un enregistrement
        try {
            await sendViaMediaRecorder(audioFile);
            console.log(`[sendAsVoiceMessage] Message vocal envoyé via MediaRecorder: ${audioFile.name}`);
            return;
        } catch (mediaError) {
            console.log(`[sendAsVoiceMessage] Échec MediaRecorder, envoi comme fichier audio`);
            
            // Méthode 3: Fallback - envoyer comme fichier audio normal
            await sendAsAudioFile(audioFile);
            console.log(`[sendAsVoiceMessage] Envoyé comme fichier audio: ${audioFile.name}`);
        }
    }
}

/**
 * Tente d'envoyer le fichier comme un message vocal natif WhatsApp
 */
async function sendAsNativeVoiceMessage(voiceFile) {
    // Cliquer sur le bouton microphone avec sélecteurs multiples
    console.log("[sendAsNativeVoiceMessage] Recherche du bouton microphone...");
    const micSelectors = [
        "span[data-icon='mic']",
        "span[data-icon='microphone']", 
        "span[data-icon='wds-ic-mic']",
        "span[data-icon='ptt-v2']",
        "svg[aria-label*='microphone' i]",
        "svg[title*='microphone' i]",
        "button[aria-label*='microphone' i]",
        "button[aria-label*='voice' i]",
        "[data-testid='ptt-button']"
    ];
    
    let micButton = null;
    for (const selector of micSelectors) {
        try {
            micButton = await waitForElement(selector, 2000);
            console.log(`[sendAsNativeVoiceMessage] Bouton microphone trouvé avec: ${selector}`);
            break;
        } catch (e) {
            console.log(`[sendAsNativeVoiceMessage] Sélecteur ${selector} non trouvé`);
        }
    }
    
    if (!micButton) {
        throw new Error("Bouton microphone introuvable avec tous les sélecteurs");
    }
    
    const micButtonElement = micButton.closest('button') || micButton.closest('[role="button"]') || micButton;
    if (!micButtonElement) throw new Error("Élément bouton microphone introuvable");
    
    // Intercepter l'API MediaRecorder de WhatsApp
    const originalMediaRecorder = window.MediaRecorder;
    let recordingStarted = false;
    
    // Créer un mock de MediaRecorder qui utilisera notre fichier
    window.MediaRecorder = class MockMediaRecorder extends EventTarget {
        constructor(stream, options) {
            super();
            this.state = 'inactive';
            this.stream = stream;
            this.options = options;
            console.log('[MockMediaRecorder] Créé avec options:', options);
        }
        
        start() {
            console.log('[MockMediaRecorder] Démarrage de l\'enregistrement');
            this.state = 'recording';
            recordingStarted = true;
            
            // Simuler le début d'enregistrement
            setTimeout(() => {
                this.dispatchEvent(new Event('start'));
            }, 100);
            
            // Simuler la fin d'enregistrement avec notre fichier
            setTimeout(async () => {
                this.state = 'inactive';
                
                // Créer un Blob à partir de notre fichier converti (MP3 ou OGG)
                const arrayBuffer = await voiceFile.arrayBuffer();
                const blob = new Blob([arrayBuffer], { 
                    type: voiceFile.type || 'audio/ogg; codecs=opus' 
                });
                
                // Dispatch l'événement dataavailable avec notre fichier
                const dataEvent = new Event('dataavailable');
                dataEvent.data = blob;
                this.dispatchEvent(dataEvent);
                
                // Dispatch l'événement stop
                this.dispatchEvent(new Event('stop'));
            }, 1000); // Simuler 1 seconde d'enregistrement
        }
        
        stop() {
            console.log('[MockMediaRecorder] Arrêt de l\'enregistrement');
            this.state = 'inactive';
        }
    };
    
    // Démarrer l'enregistrement
    micButtonElement.click();
    await sleep(500);
    
    // Attendre que l'enregistrement soit traité
    await new Promise(resolve => {
        const checkRecording = () => {
            if (recordingStarted) {
                resolve();
            } else {
                setTimeout(checkRecording, 100);
            }
        };
        checkRecording();
    });
    
    // Attendre que l'interface d'envoi apparaisse et cliquer sur envoyer
    await sleep(2000);
    
    // Chercher le bouton d'envoi du message vocal
    const sendVoiceButton = await waitForElement("span[data-icon='send']", 5000);
    const sendVoiceButtonElement = sendVoiceButton.closest('button');
    if (sendVoiceButtonElement) {
        sendVoiceButtonElement.click();
        await sleep(1000);
    }
    
    // Restaurer MediaRecorder original
    window.MediaRecorder = originalMediaRecorder;
}

/**
 * Utilise MediaRecorder API pour simuler un enregistrement
 */
/**
 * Fallback: envoie comme fichier audio normal (pièce jointe)
 */
async function sendAsAudioFile(voiceFile) {
    console.log(`[sendAsAudioFile] Envoi de ${voiceFile.name} comme fichier audio`);
    
    // Cliquer sur le bouton d'attachement
    const attachButtonIcon = await waitForElement("span[data-icon='clip'], span[data-icon='plus-rounded']", 10000);
    const attachButton = attachButtonIcon.closest('button') || attachButtonIcon.closest('[role="button"]');
    if (!attachButton) throw new Error("Bouton 'Joindre' introuvable");
    attachButton.click();
    await sleep(500);

    // Sélectionner le type Audio avec plusieurs sélecteurs
    console.log("[sendAsAudioFile] Recherche de l'option Audio...");
    const audioSelectors = [
        "span[data-icon='ic-headphones-filled']",
        "span[data-icon='headphones']",
        "span[data-icon='audio']", 
        "span[data-icon='wds-ic-headphones']",
        "svg[aria-label*='audio' i]",
        "svg[title*='audio' i]"
    ];
    
    let audioTypeIcon = null;
    for (const selector of audioSelectors) {
        try {
            audioTypeIcon = await waitForElement(selector, 2000);
            console.log(`[sendAsAudioFile] Option Audio trouvée avec: ${selector}`);
            break;
        } catch (e) {
            console.log(`[sendAsAudioFile] Sélecteur ${selector} non trouvé`);
        }
    }
    
    if (!audioTypeIcon) {
        throw new Error("Option 'Audio' introuvable avec tous les sélecteurs");
    }
    
    const audioTypeButton = audioTypeIcon.closest('button') || audioTypeIcon.closest('div[role="button"]') || audioTypeIcon.closest('div');
    if (!audioTypeButton) throw new Error("Bouton option 'Audio' introuvable");
    audioTypeButton.click();
    await sleep(500);

    // Attendre que l'input file apparaisse
    const fileInput = await waitForElement('input[type="file"]', 5000);
    if (!fileInput) throw new Error("Input file introuvable");

    // Créer un DataTransfer pour simuler la sélection de fichier
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(voiceFile);
    fileInput.files = dataTransfer.files;

    // Déclencher l'événement change
    const changeEvent = new Event('change', { bubbles: true });
    fileInput.dispatchEvent(changeEvent);
    
    await sleep(1500);

    // Attendre et cliquer sur le bouton d'envoi
    const sendButton = await waitForElement("span[data-icon='send']", 10000);
    const sendButtonElement = sendButton.closest('button');
    if (!sendButtonElement) throw new Error("Bouton d'envoi introuvable");
    
    sendButtonElement.click();
    await sleep(2000);
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
                <div class="cx-toolbar-brand">
                    <img src="${chrome.runtime.getURL('cc-logo.png')}" alt="CX Logo" style="width: 24px; height: 24px;">
                </div>
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
                <div class="cx-toolbar-brand">
                    <img src="${chrome.runtime.getURL('cc-logo.png')}" alt="CX Logo" style="width: 24px; height: 24px;">
                </div>
                <div class="cx-inactive-message">
                    Veuillez cliquer sur l'icône de l'extension pour l'activer et utiliser ses fonctionnalités.
                </div>
            </div>
        `;
    }

    // 2. Crée le bouton flottant pour afficher/masquer
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'cx-toolbar-toggle-btn';
    toggleBtn.title = "Afficher/Masquer la barre d'outils CX Sender";
    toggleBtn.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path>
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
        const isHidden = toolbar.classList.toggle('cx-toolbar-hidden');
        toggleBtn.classList.toggle('cx-toggled', isHidden);
        
        // Met à jour le titre du bouton selon l'état
        if (isHidden) {
            toggleBtn.title = "Afficher la barre d'outils CX Sender";
        } else {
            toggleBtn.title = "Masquer la barre d'outils CX Sender";
        }
        
        console.log(`Barre d'outils CX ${isHidden ? 'masquée' : 'affichée'}`);
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
                    
                    <!-- Tableau de contacts pour l'envoi en masse -->
                    <div id="cx-modal-contact-table-container">
                        <div id="cx-modal-contact-table-header">
                            <div class="cx-table-controls">
                                <button id="cx-modal-add-contact-btn" class="cx-table-btn">➕ Ajouter contact</button>
                                <button id="cx-modal-clear-contacts-btn" class="cx-table-btn">🗑️ Vider la liste</button>
                            </div>
                        </div>
                        <div id="cx-modal-contact-table-wrapper">
                            <table id="cx-modal-contact-table">
                                <thead>
                                    <tr>
                                        <th>Numéro de téléphone</th>
                                        <th>Nom complet</th>
                                        <th>Adresse email</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="cx-modal-contact-table-body">
                                    <!-- Les contacts seront ajoutés ici dynamiquement -->
                                </tbody>
                            </table>
                        </div>
                    </div>
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
        
        if (!listName) {
            clearModalContactTable();
            return;
        }
        
        const { contactLists = {} } = await chrome.storage.local.get('contactLists');
        const listData = contactLists[listName];
        
        if (!listData) {
            clearModalContactTable();
            return;
        }
        
        // Vider le tableau actuel
        clearModalContactTable();
        
        // Nouveau format (objet avec tableau de contacts)
        if (typeof listData === 'object' && listData.format === 'table' && listData.contacts) {
            // Charger les contacts dans le tableau
            listData.contacts.forEach(contact => {
                if (contact.phone && contact.phone.trim()) {
                    addModalContactRow(contact.phone || '', contact.name || '', contact.email || '');
                }
            });
        }
        // Ancien format (chaîne de numéros)
        else if (typeof listData === 'string') {
            const phones = listData.split('\n').map(p => p.trim()).filter(p => p);
            phones.forEach(phone => {
                addModalContactRow(phone, '', '');
            });
        }
        
        // Ajouter une ligne vide à la fin pour permettre l'ajout de nouveaux contacts
        addModalContactRow('', '', '');
    });

    // Event listeners pour les boutons du tableau
    document.getElementById('cx-modal-add-contact-btn').addEventListener('click', () => {
        addModalContactRow('', '', '');
    });

    document.getElementById('cx-modal-clear-contacts-btn').addEventListener('click', () => {
        clearModalContactTable();
        addModalContactRow('', '', ''); // Ajouter une ligne vide
    });

    // Initialiser le tableau avec une ligne vide
    addModalContactRow('', '', '');
}

/**
 * Gère l'envoi en masse depuis la modale.
 */
async function handleModalSend() {
    const messageTextarea = document.getElementById('cx-modal-message');
    const statusDiv = document.getElementById('cx-modal-status');
    const sendBtn = document.getElementById('cx-modal-send-btn');

    const message = messageTextarea.value.trim();
    
    // Récupérer les contacts depuis le nouveau tableau
    const contactsFromTable = getModalContactsFromTable();
    console.log('Contacts récupérés du tableau:', contactsFromTable);

    if (!message && attachmentsForCurrentSend.length === 0) {
        statusDiv.textContent = 'Veuillez saisir un message ou sélectionner un modèle avec des pièces jointes.';
        statusDiv.style.color = '#d32f2f';
        return;
    }

    if (contactsFromTable.length === 0) {
        statusDiv.textContent = 'Veuillez ajouter des contacts dans le tableau.';
        statusDiv.style.color = '#d32f2f';
        return;
    }

    // Filtrer les contacts avec un numéro de téléphone valide (garder l'objet complet)
    const contacts = contactsFromTable.filter(contact => contact.phone && contact.phone.trim());
    console.log('Contacts filtrés pour envoi:', contacts);
    
    if (contacts.length === 0) {
        statusDiv.textContent = 'Aucun numéro de téléphone valide trouvé.';
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
            
            // TOUJOURS utiliser le numéro de téléphone pour l'envoi, même si on a un nom
            const phoneNumber = contact.phone;
            
            // Afficher le nom si disponible, sinon le numéro (juste pour l'affichage)
            const displayName = contact.name || contact.phone;
            statusDiv.textContent = `Envoi ${i + 1}/${contacts.length} : ${displayName}...`;
            
            console.log(`[Bulk Send] Envoi vers numéro: ${phoneNumber} (affiché comme: ${displayName})`);
            
            // IMPORTANT: Toujours passer le numéro de téléphone, jamais le nom
            const result = await processSingleContact(phoneNumber, message, attachmentsForCurrentSend);
            if (result.success) {
                successCount++;
            } else {
                errorDetails.push(`${displayName}: ${result.reason}`);
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
                            <button id="cx-template-record-audio-btn" class="secondary">🎤 Enregistrer un vocal</button>
                            <input type="file" id="cx-template-attachment-input" multiple style="display: none;">
                        </div>
                        <div id="cx-template-audio-recording" style="display: none;" class="cx-audio-recording-section">
                            <div class="cx-recording-controls">
                                <button id="cx-template-start-recording" class="cx-record-btn">🔴 Démarrer</button>
                                <button id="cx-template-stop-recording" class="cx-stop-btn" style="display: none;">⏹️ Arrêter</button>
                                <span id="cx-template-recording-timer">00:00</span>
                            </div>
                            <div id="cx-template-audio-preview" style="display: none;">
                                <audio controls id="cx-template-audio-player"></audio>
                                <button id="cx-template-save-audio" class="secondary">💾 Ajouter ce vocal</button>
                                <button id="cx-template-cancel-audio" class="secondary">❌ Annuler</button>
                            </div>
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

    // === GESTION DE L'ENREGISTREMENT AUDIO ===
    const recordAudioBtn = document.getElementById('cx-template-record-audio-btn');
    const audioRecordingSection = document.getElementById('cx-template-audio-recording');
    const startRecordingBtn = document.getElementById('cx-template-start-recording');
    const stopRecordingBtn = document.getElementById('cx-template-stop-recording');
    const recordingTimer = document.getElementById('cx-template-recording-timer');
    const audioPreview = document.getElementById('cx-template-audio-preview');
    const audioPlayer = document.getElementById('cx-template-audio-player');
    const saveAudioBtn = document.getElementById('cx-template-save-audio');
    const cancelAudioBtn = document.getElementById('cx-template-cancel-audio');

    let mediaRecorder = null;
    let audioChunks = [];
    let recordingStartTime = 0;
    let recordingInterval = null;
    let currentAudioBlob = null;

    recordAudioBtn.addEventListener('click', () => {
        audioRecordingSection.style.display = 'block';
    });

    startRecordingBtn.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 48000
                } 
            });
            
            // Utiliser ogg/opus pour le format natif WhatsApp de messages vocaux
            let options = { mimeType: 'audio/ogg;codecs=opus' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                // Fallback 1: essayer ogg sans codec spécifique
                options = { mimeType: 'audio/ogg' };
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    // Fallback 2: utiliser webm/opus (sera converti plus tard)
                    options = { mimeType: 'audio/webm;codecs=opus' };
                    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                        // Fallback final: webm standard
                        options = { mimeType: 'audio/webm' };
                    }
                }
            }
            
            console.log('Format d\'enregistrement utilisé:', options.mimeType);
            mediaRecorder = new MediaRecorder(stream, options);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                // Créer le blob avec le bon type MIME pour WhatsApp
                let mimeType = 'audio/ogg';
                if (options.mimeType.includes('webm')) {
                    // Si on a utilisé webm, on garde webm mais on changera l'extension
                    mimeType = options.mimeType;
                }
                
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                currentAudioBlob = audioBlob;
                const audioUrl = URL.createObjectURL(audioBlob);
                audioPlayer.src = audioUrl;
                audioPreview.style.display = 'block';
                
                // Arrêter le stream
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            recordingStartTime = Date.now();
            
            startRecordingBtn.style.display = 'none';
            stopRecordingBtn.style.display = 'inline-block';
            
            // Démarrer le timer
            recordingInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const seconds = (elapsed % 60).toString().padStart(2, '0');
                recordingTimer.textContent = `${minutes}:${seconds}`;
            }, 1000);
            
        } catch (error) {
            console.error('Erreur d\'accès au microphone:', error);
            alert('Impossible d\'accéder au microphone. Veuillez autoriser l\'accès.');
        }
    });

    stopRecordingBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            clearInterval(recordingInterval);
            startRecordingBtn.style.display = 'inline-block';
            stopRecordingBtn.style.display = 'none';
        }
    });

    saveAudioBtn.addEventListener('click', async () => {
        if (currentAudioBlob) {
            // Convertir le blob en dataURL pour le stockage
            const reader = new FileReader();
            reader.onload = () => {
                // Générer un nom de fichier avec extension .ogg pour WhatsApp
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const audioAttachment = {
                    dataUrl: reader.result,
                    name: `Message_vocal_${timestamp}.ogg`,
                    type: 'audio/ogg',
                    isVoiceMessage: true // Marquer comme message vocal WhatsApp
                };
                
                currentTemplateAttachments.push(audioAttachment);
                renderTemplateAttachments(currentTemplateAttachments);
                
                console.log('Message vocal ajouté:', audioAttachment.name);
                
                // Réinitialiser l'interface
                audioRecordingSection.style.display = 'none';
                audioPreview.style.display = 'none';
                recordingTimer.textContent = '00:00';
                currentAudioBlob = null;
            };
            reader.readAsDataURL(currentAudioBlob);
        }
    });

    cancelAudioBtn.addEventListener('click', () => {
        audioRecordingSection.style.display = 'none';
        audioPreview.style.display = 'none';
        recordingTimer.textContent = '00:00';
        currentAudioBlob = null;
        if (audioPlayer.src) {
            URL.revokeObjectURL(audioPlayer.src);
        }
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
        
        // Icône selon le type de fichier et si c'est un message vocal
        let icon = '📄';
        let typeLabel = attachment.type.split('/')[1];
        
        if (attachment.type.startsWith('image/')) {
            icon = '🖼️';
        } else if (attachment.type.startsWith('audio/')) {
            if (attachment.isVoiceMessage || attachment.name.includes('Message_vocal') || attachment.type.includes('ogg')) {
                icon = '�'; // Icône microphone pour les messages vocaux
                typeLabel = 'vocal WhatsApp';
            } else {
                icon = '�🎵'; // Icône musique pour les autres fichiers audio
            }
        } else if (attachment.type.startsWith('video/')) {
            icon = '🎬';
        }
        
        attachmentDiv.innerHTML = `
            <span class="cx-attachment-icon">${icon}</span>
            <span class="cx-attachment-name">${attachment.name}</span>
            <span class="cx-attachment-type">(${typeLabel})</span>
            <button class="cx-attachment-remove" data-index="${index}" title="Supprimer">&times;</button>
        `;
        
        // Si c'est un fichier audio, ajouter un lecteur
        if (attachment.type.startsWith('audio/')) {
            const audioPlayer = document.createElement('audio');
            audioPlayer.controls = true;
            audioPlayer.src = attachment.dataUrl;
            audioPlayer.style.width = '100%';
            audioPlayer.style.marginTop = '5px';
            
            // Style spécial pour les messages vocaux
            if (attachment.isVoiceMessage || attachment.name.includes('Message_vocal')) {
                audioPlayer.style.border = '2px solid #00a884';
                audioPlayer.style.borderRadius = '8px';
                audioPlayer.style.background = '#f0f8f5';
            }
            
            attachmentDiv.appendChild(audioPlayer);
        }
        
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
                    
                    <!-- Nouvelle interface table -->
                    <div id="cx-contact-table-container">
                        <div id="cx-contact-table-header">
                            <div class="cx-table-controls">
                                <button id="cx-add-contact-btn" class="cx-table-btn">➕ Ajouter contact</button>
                                <button id="cx-import-csv-btn" class="cx-table-btn">📊 Importer CSV</button>
                                <button id="cx-export-csv-btn" class="cx-table-btn">⬇️ Exporter CSV</button>
                            </div>
                        </div>
                        <div id="cx-contact-table-wrapper">
                            <table id="cx-contact-table">
                                <thead>
                                    <tr>
                                        <th>Numéro de téléphone</th>
                                        <th>Nom complet</th>
                                        <th>Adresse email</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="cx-contact-table-body">
                                    <!-- Les contacts seront ajoutés ici dynamiquement -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <!-- Champ caché pour compatibilité avec l'ancien format -->
                    <textarea id="cx-contact-list-content-textarea" style="display: none;"></textarea>
                    
                    <div id="cx-contact-list-editor-actions">
                        <button id="cx-contact-list-save-btn">Enregistrer</button>
                        <button id="cx-contact-list-new-btn" class="secondary">Nouveau</button>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Input caché pour l'import CSV -->
        <input type="file" id="cx-csv-import-input" accept=".csv" style="display: none;">
    `;
    document.body.appendChild(modal);

    // --- Logique de la modale ---
    const overlay = document.getElementById('cx-contact-lists-modal-overlay');
    const closeBtn = document.getElementById('cx-contact-lists-modal-close-btn');
    const saveBtn = document.getElementById('cx-contact-list-save-btn');
    const newBtn = document.getElementById('cx-contact-list-new-btn');
    const listUI = document.getElementById('cx-contact-lists-list');
    const addContactBtn = document.getElementById('cx-add-contact-btn');
    const importCsvBtn = document.getElementById('cx-import-csv-btn');
    const exportCsvBtn = document.getElementById('cx-export-csv-btn');
    const csvInput = document.getElementById('cx-csv-import-input');

    closeBtn.addEventListener('click', closeContactListsModal);
    overlay.addEventListener('click', (e) => {
        if (e.target.id === 'cx-contact-lists-modal-overlay') closeContactListsModal();
    });

    newBtn.addEventListener('click', () => {
        document.getElementById('cx-contact-list-name-input').value = '';
        clearContactTable();
        document.getElementById('cx-contact-list-name-input').readOnly = false;
        document.getElementById('cx-contact-list-name-input').focus();
        listUI.querySelector('li.selected')?.classList.remove('selected');
    });

    addContactBtn.addEventListener('click', () => {
        addContactRow('', '', '');
    });

    importCsvBtn.addEventListener('click', () => {
        csvInput.click();
    });

    exportCsvBtn.addEventListener('click', () => {
        exportContactsToCSV();
    });

    csvInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            importContactsFromCSV(e.target.files[0]);
        }
    });

    saveBtn.addEventListener('click', async () => {
        const name = document.getElementById('cx-contact-list-name-input').value.trim();
        if (!name) return alert('Le nom de la liste est requis.');

        const contacts = getContactsFromTable();
        console.log('Contacts à sauvegarder:', contacts);
        const { contactLists = {} } = await chrome.storage.local.get('contactLists');
        
        // Nouveau format : objet avec les données structurées
        contactLists[name] = {
            format: 'table',
            contacts: contacts,
            // Compatibilité rétroactive : génération du format texte
            textFormat: contacts.map(c => c.phone).join('\n')
        };
        
        console.log('Liste sauvegardée:', contactLists[name]);
        await chrome.storage.local.set({ contactLists });
        await renderContactListsInModal();
        alert(`Liste "${name}" enregistrée avec ${contacts.length} contact(s) !`);
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
            
            console.log('Chargement de la liste:', listName, contactLists[listName]);
            
            // Charger les données dans le tableau
            loadContactsToTable(contactLists[listName]);
            
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

// === NOUVELLES FONCTIONS POUR LA GESTION DES TABLES DE CONTACTS ===

/**
 * Ajoute une nouvelle ligne de contact dans le tableau
 */
function addContactRow(phone = '', name = '', email = '') {
    const tbody = document.getElementById('cx-contact-table-body');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="text" class="cx-contact-phone" value="${phone}" placeholder="+212XXXXXXXXX"></td>
        <td><input type="text" class="cx-contact-name" value="${name}" placeholder="Nom Prénom"></td>
        <td><input type="email" class="cx-contact-email" value="${email}" placeholder="email@exemple.com"></td>
        <td>
            <button class="cx-delete-contact-btn" title="Supprimer">🗑️</button>
        </td>
    `;
    tbody.appendChild(row);

    // Événement pour supprimer la ligne
    row.querySelector('.cx-delete-contact-btn').addEventListener('click', () => {
        row.remove();
        checkTableScrollable(); // Vérifier après suppression
    });

    // Auto-formatage du numéro de téléphone
    const phoneInput = row.querySelector('.cx-contact-phone');
    phoneInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/[^\d+]/g, '');
        if (value && !value.startsWith('+')) {
            if (value.startsWith('0')) {
                value = '+212' + value.substring(1);
            } else if (!value.startsWith('212')) {
                value = '+212' + value;
            } else {
                value = '+' + value;
            }
        }
        e.target.value = value;
    });

    // Vérifier si le tableau nécessite un scroll
    checkTableScrollable();
}

/**
 * Vérifie si le tableau nécessite un scroll et applique la classe appropriée
 */
function checkTableScrollable() {
    const wrapper = document.getElementById('cx-contact-table-wrapper');
    if (wrapper) {
        const isScrollable = wrapper.scrollHeight > wrapper.clientHeight;
        wrapper.classList.toggle('scrollable-content', isScrollable);
    }
}

/**
 * Vide le tableau de contacts
 */
function clearContactTable() {
    const tbody = document.getElementById('cx-contact-table-body');
    tbody.innerHTML = '';
    checkTableScrollable(); // Vérifier après vidage
}

/**
 * Récupère tous les contacts du tableau
 */
function getContactsFromTable() {
    const rows = document.querySelectorAll('#cx-contact-table-body tr');
    const contacts = [];
    
    rows.forEach(row => {
        const phone = row.querySelector('.cx-contact-phone').value.trim();
        const name = row.querySelector('.cx-contact-name').value.trim();
        const email = row.querySelector('.cx-contact-email').value.trim();
        
        if (phone) { // Au minimum, le numéro est requis
            contacts.push({ phone, name, email });
        }
    });
    
    return contacts;
}

/**
 * Charge les contacts dans le tableau
 */
function loadContactsToTable(listData) {
    clearContactTable();
    
    if (!listData) return;
    
    let contacts = [];
    
    // Nouveau format (objet avec tableau de contacts)
    if (typeof listData === 'object' && listData.format === 'table' && listData.contacts) {
        contacts = listData.contacts;
    }
    // Ancien format (chaîne de numéros)
    else if (typeof listData === 'string') {
        const phones = listData.split('\n').map(p => p.trim()).filter(p => p);
        contacts = phones.map(phone => ({ phone, name: '', email: '' }));
    }
    
    // Ajouter les contacts au tableau
    contacts.forEach(contact => {
        addContactRow(contact.phone || '', contact.name || '', contact.email || '');
    });
    
    // S'il n'y a pas de contacts, ajouter une ligne vide
    if (contacts.length === 0) {
        addContactRow();
    }
}

/**
 * Import CSV
 */
async function importContactsFromCSV(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const csv = e.target.result;
                const lines = csv.split('\n').filter(line => line.trim());
                
                // Vider le tableau actuel
                clearContactTable();
                
                lines.forEach((line, index) => {
                    const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
                    
                    // Ignorer la ligne d'en-tête si elle contient des mots clés
                    if (index === 0 && (columns[0].toLowerCase().includes('tel') || columns[0].toLowerCase().includes('phone'))) {
                        return;
                    }
                    
                    const phone = columns[0] || '';
                    const name = columns[1] || '';
                    const email = columns[2] || '';
                    
                    if (phone) {
                        addContactRow(phone, name, email);
                    }
                });
                
                // Ajouter une ligne vide à la fin
                addContactRow();
                
                // Vérifier si le tableau nécessite un scroll après import
                checkTableScrollable();
                
                alert(`${lines.length} contact(s) importé(s) depuis le fichier CSV.`);
                resolve();
            } catch (error) {
                alert('Erreur lors de l\'import CSV : ' + error.message);
                reject(error);
            }
        };
        reader.readAsText(file);
    });
}

/**
 * Export CSV
 */
function exportContactsToCSV() {
    const contacts = getContactsFromTable();
    
    if (contacts.length === 0) {
        alert('Aucun contact à exporter.');
        return;
    }
    
    // Créer le contenu CSV
    let csv = 'Numero telephone,Nom complet,Adresse email\n';
    contacts.forEach(contact => {
        csv += `"${contact.phone}","${contact.name}","${contact.email}"\n`;
    });
    
    // Télécharger le fichier
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    
    const listName = document.getElementById('cx-contact-list-name-input').value.trim() || 'contacts';
    link.download = `${listName}_contacts.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// === FONCTIONS POUR LE TABLEAU DU MODAL D'ENVOI EN MASSE ===

/**
 * Ajoute une nouvelle ligne de contact dans le tableau du modal
 */
function addModalContactRow(phone = '', name = '', email = '') {
    const tbody = document.getElementById('cx-modal-contact-table-body');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="text" class="cx-modal-contact-phone" value="${phone}" placeholder="+212XXXXXXXXX"></td>
        <td><input type="text" class="cx-modal-contact-name" value="${name}" placeholder="Nom Prénom"></td>
        <td><input type="email" class="cx-modal-contact-email" value="${email}" placeholder="email@exemple.com"></td>
        <td>
            <button class="cx-modal-delete-contact-btn" title="Supprimer">🗑️</button>
        </td>
    `;
    tbody.appendChild(row);

    // Événement pour supprimer la ligne
    row.querySelector('.cx-modal-delete-contact-btn').addEventListener('click', () => {
        row.remove();
        checkModalTableScrollable();
    });

    // Auto-formatage du numéro de téléphone
    const phoneInput = row.querySelector('.cx-modal-contact-phone');
    phoneInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/[^\d+]/g, '');
        if (value && !value.startsWith('+')) {
            if (value.startsWith('0')) {
                value = '+212' + value.substring(1);
            } else if (!value.startsWith('212')) {
                value = '+212' + value;
            } else {
                value = '+' + value;
            }
        }
        e.target.value = value;
    });

    // Vérifier si le tableau nécessite un scroll
    checkModalTableScrollable();
}

/**
 * Vide le tableau de contacts du modal
 */
function clearModalContactTable() {
    const tbody = document.getElementById('cx-modal-contact-table-body');
    tbody.innerHTML = '';
    checkModalTableScrollable();
}

/**
 * Récupère tous les contacts du tableau du modal
 */
function getModalContactsFromTable() {
    const rows = document.querySelectorAll('#cx-modal-contact-table-body tr');
    const contacts = [];
    
    rows.forEach(row => {
        const phone = row.querySelector('.cx-modal-contact-phone').value.trim();
        const name = row.querySelector('.cx-modal-contact-name').value.trim();
        const email = row.querySelector('.cx-modal-contact-email').value.trim();
        
        if (phone) { // Seuls les contacts avec numéro de téléphone
            contacts.push({ phone, name, email });
        }
    });
    
    return contacts;
}

/**
 * Vérifie si le tableau du modal nécessite un scroll
 */
function checkModalTableScrollable() {
    const wrapper = document.getElementById('cx-modal-contact-table-wrapper');
    if (wrapper) {
        const isScrollable = wrapper.scrollHeight > wrapper.clientHeight;
        wrapper.classList.toggle('scrollable-content', isScrollable);
    }
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
        const listData = contactLists[name];
        let contactCount = 0;
        
        // Compter les contacts selon le format
        if (typeof listData === 'object' && listData.format === 'table' && listData.contacts) {
            contactCount = listData.contacts.length;
        } else if (typeof listData === 'string') {
            contactCount = listData.split('\n').filter(line => line.trim()).length;
        }
        
        const listItem = document.createElement('li');
        listItem.dataset.listName = name;
        listItem.innerHTML = `<span>${name} (${contactCount} contact${contactCount > 1 ? 's' : ''})</span><button class="delete-list" title="Supprimer">&times;</button>`;
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
 * Vérifie l'état de la session utilisateur côté serveur (même logique que popup.js).
 * @returns {Promise<{status: 'VALID' | 'INVALID_TOKEN' | 'NO_SESSION' | 'API_ERROR'}>}
 */
async function checkStoredTokenInContent() {
    console.log('[CX Content] Checking for stored session...');
    
    const session = await chrome.storage.local.get(['activationToken', 'userPhone', 'tokenTimestamp']);
    if (!session.activationToken || !session.userPhone) {
        console.log('[CX Content] No session found in storage.');
        return { status: 'NO_SESSION' };
    }

    // Vérification locale avec expiration du token (24h)
    const TOKEN_EXPIRY_HOURS = 24;
    const now = Date.now();
    const tokenAge = session.tokenTimestamp ? (now - session.tokenTimestamp) : Infinity;
    const maxAge = TOKEN_EXPIRY_HOURS * 60 * 60 * 1000; // 24h en millisecondes

    if (tokenAge > maxAge) {
        console.log('[CX Content] Token expired - clearing session');
        await chrome.storage.local.remove(['activationToken', 'userPhone', 'tokenTimestamp']);
        return { status: 'NO_SESSION' };
    }

    console.log(`[CX Content] Session valid for ${session.userPhone}. Token age: ${Math.round(tokenAge / (60 * 60 * 1000))}h`);
    
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
            console.error("[CX Content] Erreur serveur lors de la validation:", response.status);
            return { status: 'API_ERROR' };
        }
        
        const result = await response.json();

        if (result.success) {
            if (result.action === 'valid') {
                return { status: 'VALID' };
            } else if (result.action === 'new_session' || result.action === 'created') {
                // Nouveau token généré, mise à jour locale
                console.log('[CX Content] New token received from server');
                await chrome.storage.local.set({ 
                    activationToken: result.token,
                    userPhone: session.userPhone,
                    tokenTimestamp: Date.now()
                });
                return { status: 'VALID' };
            }
        } else {
            console.log('[CX Content] Token invalide selon le serveur - nettoyage session');
            await chrome.storage.local.remove(['activationToken', 'userPhone', 'tokenTimestamp']);
            return { status: 'INVALID_TOKEN' };
        }
    } catch (error) {
        console.error("[CX Content] Erreur durant la vérification:", error);
        
        // En cas d'erreur réseau, on garde le token local s'il n'est pas expiré
        if (tokenAge <= maxAge) {
            console.log('[CX Content] Erreur réseau, mais token pas expiré - conservation session');
            return { status: 'VALID' };
        } else {
            await chrome.storage.local.remove(['activationToken', 'userPhone', 'tokenTimestamp']);
            return { status: 'NO_SESSION' };
        }
    }
}

/**
 * Point d'entrée pour l'initialisation de l'interface injectée.
 * Attend que l'interface de WhatsApp soit prête avant d'injecter la barre d'outils.
 */
async function initializeInjectedUI() {
    try {
        await waitForElement('#pane-side', 20000); // Attend un élément stable de l'UI de WA
        
        // Vérification sécurisée de l'état de la session avec le serveur
        const sessionState = await checkStoredTokenInContent();
        const isActive = sessionState.status === 'VALID';
        
        console.log(`[CX Content] Session state: ${sessionState.status}, isActive: ${isActive}`);

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

// Vérification périodique de la validité du token (toutes les 5 minutes)
setInterval(async () => {
    const sessionState = await checkStoredTokenInContent();
    
    if (sessionState.status === 'INVALID_TOKEN' || sessionState.status === 'API_ERROR') {
        console.log('[CX Content] Token invalide détecté. Réinitialisation de l\'interface...');
        
        // Supprimer l'ancienne toolbar si elle existe
        const existingToolbar = document.getElementById('cx-sender-toolbar');
        const existingToggleBtn = document.getElementById('cx-toolbar-toggle-btn');
        
        if (existingToolbar) existingToolbar.remove();
        if (existingToggleBtn) existingToggleBtn.remove();
        
        // Réinjecter avec le statut inactif
        injectToolbar(false);
    }
}, 5 * 60 * 1000); // 5 minutes

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
        .filter(([name, listData]) => {
            // Support du nouveau format (objet) et de l'ancien format (string)
            let phones = [];
            
            if (typeof listData === 'object' && listData.format === 'table' && listData.contacts) {
                // Nouveau format
                phones = listData.contacts.map(contact => contact.phone);
            } else if (typeof listData === 'string') {
                // Ancien format
                phones = listData.split('\n').map(x => x.trim()).filter(x => x);
            } else {
                console.warn(`[showContactListLabels] Format de liste non reconnu pour "${name}":`, typeof listData, listData);
                return false;
            }
            
            return phones.includes(normalizedNumber);
        })
        .map(([name]) => name);

    // Nettoyer les labels existants
    if (block && block.querySelectorAll) {
        block.querySelectorAll('.cxws-contact-list-label').forEach(e => e.remove());
    }

    if (lists.length > 0) {
        const labelContainer = document.createElement('span');
        labelContainer.className = 'cxws-contact-list-label';
        labelContainer.style.marginLeft = '8px';
        lists.forEach(listName => {
            const lbl = document.createElement('span');
            lbl.innerHTML = `📋 ${listName}`;
            lbl.style.background = 'linear-gradient(135deg, var(--cx-primary, #facc37) 0%, var(--cx-primary-light, #fdd55a) 100%)';
            lbl.style.color = 'var(--cx-background-light, #1b1d4f)';
            lbl.style.borderRadius = '6px';
            lbl.style.padding = '3px 8px';
            lbl.style.marginRight = '6px';
            lbl.style.fontSize = '11px';
            lbl.style.fontWeight = '600';
            lbl.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
            lbl.style.boxShadow = '0 2px 4px rgba(250, 204, 55, 0.3)';
            lbl.style.border = '1px solid rgba(250, 204, 55, 0.5)';
            lbl.style.display = 'inline-block';
            lbl.style.transition = 'all 0.2s ease';
            labelContainer.appendChild(lbl);
        });
        
        // Insérer le label dans le DOM de manière sécurisée
        if (block && block.appendChild) {
            block.appendChild(labelContainer);
        } else {
            console.warn('[showContactListLabels] Bloc invalide pour insertion de label:', block);
        }
    }
}

/**
 * Injecte le bouton "Ajouter à une liste" à côté du numéro dans la fiche contact.
 * Affiche un sélecteur de liste lors du clic.
 * Affiche aussi les labels des listes.
 * Optimisé pour éviter les ralentissements avec sélecteurs robustes.
 */
function injectAddToListButtonOnContactInfo(contactLists) {
    // Essayer plusieurs sélecteurs pour les blocs d'information de contact
    const selectors = [
        '.x1c4vz4f.x3nfvp2.xuce83p.x1bft6iq.x1i7k8ik.xq9mrsl.x6s0dn4', // Ancien sélecteur
        '[data-testid="contact-info-drawer"]', // Tiroir d'informations contact
        '.x1c4vz4f.x2lwn1j', // Sélecteur alternatif
        '.copyable-text', // Zone de texte copiable (numéro)
        'div[role="button"] span[dir="auto"]', // Span avec direction automatique dans un bouton
        'span[title*="+"]', // Span avec titre contenant un +
        'span[dir="auto"]' // Fallback général pour les spans avec direction auto
    ];

    let infoBlocks = [];
    
    // Essayer chaque sélecteur jusqu'à trouver des éléments
    for (const selector of selectors) {
        try {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                console.log(`[Contact Observer] Trouvé ${elements.length} éléments avec le sélecteur: ${selector}`);
                infoBlocks = Array.from(elements);
                break;
            }
        } catch (e) {
            console.warn(`[Contact Observer] Erreur avec le sélecteur ${selector}:`, e);
        }
    }

    // Si aucun bloc trouvé avec les sélecteurs spécifiques, chercher les numéros de téléphone
    if (infoBlocks.length === 0) {
        const allSpans = document.querySelectorAll('span[dir="auto"]');
        infoBlocks = Array.from(allSpans).filter(span => {
            const text = span.textContent?.trim() || '';
            return /^\+?\d[\d\s\-\(\)]{8,}$/.test(text); // Pattern pour numéros de téléphone
        });
        console.log(`[Contact Observer] Fallback: trouvé ${infoBlocks.length} numéros potentiels`);
    }

    infoBlocks.forEach(block => {
        // Chercher le span contenant le numéro dans ce bloc ou ses parents/enfants
        let numberSpan = null;
        
        if (block.matches('span[dir="auto"]')) {
            // Le bloc est lui-même un span
            numberSpan = block;
        } else {
            // Chercher dans les enfants
            numberSpan = block.querySelector('span[dir="auto"]');
        }
        
        if (!numberSpan) {
            // Chercher dans les parents proches
            let parent = block.parentElement;
            for (let i = 0; i < 3 && parent; i++) {
                numberSpan = parent.querySelector('span[dir="auto"]');
                if (numberSpan) break;
                parent = parent.parentElement;
            }
        }

        if (!numberSpan) return;

        const numberText = numberSpan.textContent?.trim() || '';
        
        // Vérifier que c'est bien un numéro de téléphone
        if (!/^\+?\d[\d\s\-\(\)]{8,}$/.test(numberText)) return;
        
        const normalized = normalizePhoneNumber(numberText);
        console.log(`[Contact Observer] Numéro détecté: ${numberText} -> ${normalized}`);

        // Afficher les labels des listes
        showContactListLabels(numberSpan.parentNode || numberSpan.parentElement, normalized, contactLists);

        // Vérifier si le bouton existe déjà
        const parentContainer = numberSpan.parentNode || numberSpan.parentElement;
        if (parentContainer?.querySelector('.cxws-addtolist-btn')) return;

        const btn = document.createElement('button');
        btn.innerText = '➕ Ajouter à une liste';
        btn.className = 'cxws-addtolist-btn';
        btn.style.marginLeft = '8px';
        btn.style.background = 'var(--cx-primary, #facc37)';
        btn.style.color = 'var(--cx-background-light, #1b1d4f)';
        btn.style.border = 'none';
        btn.style.borderRadius = '8px';
        btn.style.padding = '4px 10px';
        btn.style.fontSize = '12px';
        btn.style.fontWeight = '600';
        btn.style.cursor = 'pointer';
        btn.style.zIndex = '10010';
        btn.style.pointerEvents = 'auto';
        btn.style.position = 'relative';
        btn.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        btn.style.boxShadow = '0 2px 8px rgba(250, 204, 55, 0.3)';
        btn.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
        
        // Effets hover
        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'var(--cx-primary-light, #fdd55a)';
            btn.style.transform = 'translateY(-1px)';
            btn.style.boxShadow = '0 4px 12px rgba(250, 204, 55, 0.4)';
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'var(--cx-primary, #facc37)';
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 2px 8px rgba(250, 204, 55, 0.3)';
        });
        
        // Insérer le bouton après le numéro
        if (numberSpan.nextSibling) {
            numberSpan.parentNode.insertBefore(btn, numberSpan.nextSibling);
        } else {
            numberSpan.parentNode.appendChild(btn);
        }

        console.log(`[Contact Observer] Bouton ajouté pour ${normalized}`);

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
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
            popup.style.background = 'var(--cx-background-white, #ffffff)';
            popup.style.border = '2px solid var(--cx-primary, #facc37)';
            popup.style.borderRadius = '12px';
            popup.style.padding = '16px';
            popup.style.zIndex = '99999';
            popup.style.boxShadow = '0 8px 32px rgba(27, 29, 79, 0.4), 0 0 0 1px rgba(250, 204, 55, 0.2)';
            popup.style.minWidth = '220px';
            popup.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
            popup.style.backdropFilter = 'blur(10px)';
            popup.style.animation = 'fadeInScale 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
            popup.innerHTML = `
                <div style="margin-bottom:10px;font-weight:700;color:var(--cx-background-light, #1b1d4f);font-size:14px;">Ajouter à une liste :</div>
                <select id="cxws-list-select" style="width:100%;margin-bottom:12px;padding:8px 12px;border:2px solid var(--cx-border-color, rgba(250, 204, 55, 0.4));border-radius:8px;background:var(--cx-background-white, #ffffff);color:var(--cx-background-light, #1b1d4f);font-size:13px;font-family:inherit;outline:none;transition:all 0.2s ease;">
                    ${listNames.map(name => `<option value="${name}">${name}</option>`).join('')}
                </select>
                <div style="display:flex;gap:8px;">
                    <button id="cxws-confirm-add-btn" style="flex:1;background:var(--cx-primary, #facc37);color:var(--cx-background-light, #1b1d4f);border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-weight:600;font-size:13px;transition:all 0.2s ease;font-family:inherit;">Ajouter</button>
                    <button id="cxws-cancel-add-btn" style="flex:1;background:var(--cx-text-muted, rgba(255, 255, 255, 0.7));color:var(--cx-background-light, #1b1d4f);border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-weight:600;font-size:13px;transition:all 0.2s ease;font-family:inherit;">Annuler</button>
                </div>
            `;
            document.body.appendChild(popup);

            popup.querySelector('#cxws-cancel-add-btn').onclick = () => popup.remove();

            popup.querySelector('#cxws-confirm-add-btn').onclick = async () => {
                const selectedList = popup.querySelector('#cxws-list-select').value;
                
                console.log(`[Contact Observer] Tentative d'ajout de ${normalized} à la liste ${selectedList}`);
                
                // Récupérer les listes depuis le storage
                const { contactLists: storedLists = {} } = await chrome.storage.local.get('contactLists');
                
                let listData = storedLists[selectedList];
                
                // Initialiser la liste si elle n'existe pas
                if (!listData) {
                    listData = {
                        format: 'table',
                        contacts: [],
                        textFormat: ''
                    };
                }
                
                // Convertir l'ancien format si nécessaire
                if (typeof listData === 'string') {
                    const phones = listData.split('\n').map(p => p.trim()).filter(p => p);
                    listData = {
                        format: 'table',
                        contacts: phones.map(phone => ({ phone, name: '', email: '' })),
                        textFormat: listData
                    };
                }
                
                // Vérifier si le contact existe déjà
                const existingContact = listData.contacts?.find(contact => contact.phone === normalized);
                
                if (!existingContact) {
                    // Ajouter le nouveau contact
                    if (!listData.contacts) listData.contacts = [];
                    listData.contacts.push({ 
                        phone: normalized, 
                        name: '', 
                        email: '' 
                    });
                    
                    // Mettre à jour le format texte pour la compatibilité
                    listData.textFormat = listData.contacts.map(c => c.phone).join('\n');
                    
                    // Sauvegarder
                    storedLists[selectedList] = listData;
                    await chrome.storage.local.set({ contactLists: storedLists });
                    
                    console.log(`[Contact Observer] Contact ${normalized} ajouté à la liste ${selectedList}`, listData);
                    alert(`Numéro ${normalized} ajouté à la liste "${selectedList}"`);
                } else {
                    console.log(`[Contact Observer] Contact ${normalized} déjà présent dans la liste ${selectedList}`);
                    alert(`Le numéro ${normalized} est déjà dans la liste "${selectedList}"`);
                }
                
                popup.remove();
                showContactListLabels(parentContainer, normalized, storedLists);
            };
        });
    });
}

// Debounce pour limiter la fréquence d'injection avec logs améliorés
let cxwsInjectTimeout = null;
let lastInjectTime = 0;
const INJECT_COOLDOWN = 1000; // 1 seconde entre les injections

function debouncedInjectContactInfo() {
    if (cxwsInjectTimeout) clearTimeout(cxwsInjectTimeout);
    
    cxwsInjectTimeout = setTimeout(async () => {
        // Éviter les injections trop fréquentes
        const now = Date.now();
        if (now - lastInjectTime < INJECT_COOLDOWN) {
            console.log('[Contact Observer] Injection ignorée (cooldown actif)');
            return;
        }
        
        try {
            console.log('[Contact Observer] Début d\'injection des boutons de contact');
            const { contactLists = {} } = await chrome.storage.local.get('contactLists');
            console.log('[Contact Observer] Listes de contacts chargées:', Object.keys(contactLists));
            
            // Vérifier que les listes ont un format correct
            const validLists = {};
            for (const [name, content] of Object.entries(contactLists)) {
                if (typeof content === 'string') {
                    validLists[name] = content;
                } else if (content && typeof content === 'object') {
                    // Gestion des objets avec propriétés contacts, format, etc.
                    if (content.contacts && Array.isArray(content.contacts)) {
                        validLists[name] = content.contacts.map(contact => 
                            contact.phone || contact.number || contact
                        ).join('\n');
                    } else if (content.textFormat) {
                        validLists[name] = content.textFormat;
                    } else {
                        console.warn(`[Contact Observer] Liste "${name}" a un format invalide:`, typeof content, content);
                        validLists[name] = JSON.stringify(content);
                    }
                } else {
                    console.warn(`[Contact Observer] Liste "${name}" a un format invalide:`, typeof content, content);
                    // Tenter de convertir en string si possible
                    if (Array.isArray(content)) {
                        validLists[name] = content.join('\n');
                    } else if (content != null) {
                        validLists[name] = String(content);
                    }
                }
            }
            
            injectAddToListButtonOnContactInfo(validLists);
            lastInjectTime = now;
            console.log('[Contact Observer] Injection terminée');
        } catch (error) {
            console.error('[Contact Observer] Erreur lors de l\'injection:', error);
        }
    }, 500); // Augmenté à 500ms pour réduire la fréquence
}

// Observer optimisé pour les changements du DOM
const cxwsContactInfoObserver = new MutationObserver((mutations) => {
    // Filtrer les mutations pertinentes seulement
    const hasRelevantChanges = mutations.some(mutation => {
        if (mutation.type !== 'childList') return false;
        
        // Ignorer les changements dans nos propres éléments
        if (mutation.target.classList?.contains('cxws-addtolist-btn') || 
            mutation.target.classList?.contains('cxws-contact-list-label')) {
            return false;
        }
        
        // Vérifier s'il y a des ajouts/suppressions significatifs
        const hasAddedNodes = mutation.addedNodes.length > 0;
        const hasRemovedNodes = mutation.removedNodes.length > 0;
        
        // Ignorer les petits changements de texte
        if (hasAddedNodes) {
            const hasSignificantNodes = Array.from(mutation.addedNodes).some(node => 
                node.nodeType === Node.ELEMENT_NODE && 
                !node.classList?.contains('cxws-addtolist-btn') &&
                !node.classList?.contains('cxws-contact-list-label')
            );
            return hasSignificantNodes;
        }
        
        return hasRemovedNodes;
    });

    if (hasRelevantChanges) {
        console.log('[Contact Observer] Mutation pertinente détectée, planification de l\'injection');
        debouncedInjectContactInfo();
    }
});
cxwsContactInfoObserver.observe(document.body, { childList: true, subtree: true });

// Injection immédiate au chargement
console.log('[Contact Observer] Initialisation et injection immédiate');
setTimeout(() => {
    debouncedInjectContactInfo();
}, 2000); // Attendre 2 secondes pour que la page soit chargée

// Réessayer seulement 3 fois toutes les 10 secondes
let retryCount = 0;
const retryInterval = setInterval(() => {
    retryCount++;
    console.log(`[Contact Observer] Tentative d'injection ${retryCount}/3`);
    debouncedInjectContactInfo();
    
    if (retryCount >= 3) { // Seulement 3 tentatives
        clearInterval(retryInterval);
        console.log('[Contact Observer] Fin des tentatives automatiques');
    }
}, 10000); // Toutes les 10 secondes au lieu de 5

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
    btn.style.background = 'linear-gradient(135deg, var(--cx-primary, #facc37) 0%, var(--cx-primary-light, #fdd55a) 100%)';
    btn.style.border = '2px solid var(--cx-border-bright, rgba(250, 204, 55, 0.8))';
    btn.style.borderRadius = '20px';
    btn.style.cursor = 'pointer';
    btn.style.marginLeft = '8px';
    btn.style.marginRight = '4px';
    btn.style.fontSize = '16px';
    btn.style.padding = '6px 12px';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.zIndex = '10010';
    btn.style.pointerEvents = 'auto';
    btn.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    btn.style.boxShadow = '0 2px 8px rgba(250, 204, 55, 0.3)';
    btn.innerHTML = `<span aria-hidden="true" style="color:var(--cx-background-light, #1b1d4f);">✏️</span>`;
    
    // Effets hover
    btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'translateY(-1px) scale(1.05)';
        btn.style.boxShadow = '0 4px 12px rgba(250, 204, 55, 0.4)';
    });
    
    btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translateY(0) scale(1)';
        btn.style.boxShadow = '0 2px 8px rgba(250, 204, 55, 0.3)';
    });

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
    suggestionsBtn.className = 'hidden'; // Caché par défaut comme la boîte
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
        // Basculer l'interface Copilot
        const copilotBox = document.getElementById('cx-copilot-box');
        if (copilotBox.classList.contains('hidden')) {
            // Si caché, afficher la boîte ET les suggestions
            copilotBox.classList.remove('hidden');
            setTimeout(() => showCopilotSuggestions(), 300); // Petit délai pour l'animation
        } else {
            // Si affiché, masquer
            copilotBox.classList.add('hidden');
        }
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
            copyBtn.innerHTML = '✅ Copié';
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
    const toggleBtn = document.getElementById('cx-copilot-toggle-btn');
    
    console.log('[DEBUG] Toggle Copilot - Éléments trouvés:', {
        copilotBox: !!copilotBox,
        suggestionsBtn: !!suggestionsBtn,
        toggleBtn: !!toggleBtn
    });
    
    if (copilotBox && suggestionsBtn) {
        const isHidden = copilotBox.classList.contains('hidden');
        console.log('[DEBUG] État actuel - isHidden:', isHidden);
        
        // Basculer l'état : si caché -> afficher, si affiché -> cacher
        if (isHidden) {
            copilotBox.classList.remove('hidden');
            suggestionsBtn.classList.remove('hidden');
            if (toggleBtn) toggleBtn.textContent = '👁️ Masquer Copilot';
            console.log('[DEBUG] Affichage du Copilot');
            console.log('[DEBUG] Classes après affichage:', {
                copilotBoxClasses: copilotBox.className,
                copilotBoxVisible: getComputedStyle(copilotBox).display !== 'none',
                suggestionsVisible: getComputedStyle(suggestionsBtn).display !== 'none'
            });
        } else {
            copilotBox.classList.add('hidden');
            suggestionsBtn.classList.add('hidden');
            if (toggleBtn) toggleBtn.textContent = '👁️ Afficher Copilot';
            console.log('[DEBUG] Masquage du Copilot');
            console.log('[DEBUG] Classes après masquage:', {
                copilotBoxClasses: copilotBox.className,
                copilotBoxVisible: getComputedStyle(copilotBox).display !== 'none',
                suggestionsVisible: getComputedStyle(suggestionsBtn).display !== 'none'
            });
        }
    } else {
        console.warn('[DEBUG] Éléments Copilot non trouvés:', {
            copilotBox: document.getElementById('cx-copilot-box'),
            suggestionsBtn: document.getElementById('cx-copilot-suggestions-btn')
        });
    }
}

// Fonction de test pour diagnostiquer le problème du Copilot
window.testCopilotToggle = function() {
    console.log('=== TEST COPILOT TOGGLE ===');
    const copilotBox = document.getElementById('cx-copilot-box');
    const suggestionsBtn = document.getElementById('cx-copilot-suggestions-btn');
    const toggleBtn = document.getElementById('cx-copilot-toggle-btn');
    
    console.log('Éléments trouvés:', {
        copilotBox: !!copilotBox,
        suggestionsBtn: !!suggestionsBtn,
        toggleBtn: !!toggleBtn
    });
    
    if (copilotBox) {
        console.log('État copilotBox:', {
            classes: copilotBox.className,
            hasHiddenClass: copilotBox.classList.contains('hidden'),
            computedDisplay: getComputedStyle(copilotBox).display,
            computedVisibility: getComputedStyle(copilotBox).visibility
        });
    }
    
    if (suggestionsBtn) {
        console.log('État suggestionsBtn:', {
            classes: suggestionsBtn.className,
            hasHiddenClass: suggestionsBtn.classList.contains('hidden'),
            computedDisplay: getComputedStyle(suggestionsBtn).display,
            computedVisibility: getComputedStyle(suggestionsBtn).visibility
        });
    }
    
    console.log('Appel de toggleCopilotInterface()...');
    toggleCopilotInterface();
};

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
    btn.textContent = '👁️ Afficher Copilot'; // Texte initial indique l'action à faire
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
        toggleCopilotInterface();
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