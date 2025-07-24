/**
 * Enregistre un message dans le journal de l'extension.
 * @param {string} message Le message à enregistrer.
 * @param {string} source La source du message (ex: 'Popup', 'Background').
 */
async function logEvent(message, source) {
    const { logs = [] } = await chrome.storage.local.get('logs');
    const timestamp = new Date().toLocaleTimeString();
    logs.push(`[${timestamp}] [${source}] ${message}`);
    // Garde les 100 derniers logs pour éviter de surcharger le stockage
    await chrome.storage.local.set({ logs: logs.slice(-100) });
}