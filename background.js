importScripts('logger.js');

let creating; // Promesse pour éviter les créations multiples

// Vérifie si un document offscreen existe déjà
async function hasDocument() {
  const matchedClients = await clients.matchAll();
  for (const client of matchedClients) {
    if (client.url.endsWith('/offscreen.html')) {
      return true;
    }
  }
  return false;
}

async function setupOffscreenDocument() {
  if (await hasDocument()) {
    await logEvent('Offscreen document already exists.', 'Background');
    return;
  }
  if (creating) {
    await creating;
  } else {
    await logEvent('Creating offscreen document...', 'Background');
    creating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Enregistrement audio pour les messages vocaux.',
    });
    await creating;
    creating = null;
    await logEvent('Offscreen document created.', 'Background');
  }
}

async function closeOffscreenDocument() {
    if (!(await hasDocument())) {
        await logEvent('Attempted to close a non-existent offscreen document.', 'Background');
        return;
    }
    await chrome.offscreen.closeDocument();
}

// Écoute les messages venant du popup
chrome.runtime.onMessage.addListener(async (message) => {
    // Handle logging messages from other contexts first
    if (message.type === 'log') {
        await logEvent(message.message, message.source);
        return;
    }

    await logEvent(`Received message: type=${message.type}, target=${message.target}`, 'Background');
    if (message.target !== 'background') {
        return;
    }

    if (message.type === 'start-recording') {
        await setupOffscreenDocument();
        await logEvent('Forwarding start-recording to offscreen.', 'Background');
        chrome.runtime.sendMessage({ type: 'start-recording', target: 'offscreen' });
    } else if (message.type === 'stop-recording') {
        // Le popup demande d'arrêter. On transmet simplement l'ordre à l'offscreen script.
        await logEvent('Forwarding stop-recording to offscreen.', 'Background');
        chrome.runtime.sendMessage({ type: 'stop-recording', target: 'offscreen' });
    } else if (message.type === 'mic-error') {
        await logEvent(`Mic error from offscreen: ${message.error}`, 'Background');
        chrome.runtime.sendMessage({ type: 'mic-error', target: 'popup', error: message.error });
        await closeOffscreenDocument();
    } else if (message.type === 'audio-ready') {
        // Le popup confirme avoir reçu l'audio. C'est le signal qu'on peut tout nettoyer.
        await logEvent('Audio is ready in popup. Closing offscreen document.', 'Background');
        await closeOffscreenDocument();
    }
});