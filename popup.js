document.addEventListener('DOMContentLoaded', function () {
    // --- CONFIGURATION ---
    const API_BASE_URL = 'https://admin.clicandclose.com';
    const WEBHOOK_URL = `https://admin.clicandclose.com/flows/trigger/38345740-be05-4138-aa7d-8b1fc650bf7a`;

    // --- ÉLÉMENTS DU DOM ---
    const loginSection = document.getElementById('login-section');
    const verifyBtn = document.getElementById('verify-btn');
    const phoneInput = document.getElementById('phone-input');
    const errorMessage = document.getElementById('error-message');
    const welcomeSection = document.getElementById('welcome-section');
    
    console.log('[CX Popup] Extension popup loaded');

    // Helper function to send log messages to the background script
    function logToBackground(message) {
        chrome.runtime.sendMessage({ type: 'log', source: 'Popup', message: message });
    }

    // --- FONCTIONS D'AFFICHAGE ---
    function showLogin() {
        loginSection.classList.remove('hidden');
        welcomeSection.classList.add('hidden');
        console.log('[CX Popup] Login page displayed');
    }

    function showWelcome() {
        loginSection.classList.add('hidden');
        welcomeSection.classList.remove('hidden');
        console.log('[CX Popup] Welcome page displayed');
        logToBackground('Welcome page displayed to authenticated user.');
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    function hideError() {
        errorMessage.classList.add('hidden');
    }

    // --- LOGIQUE D'AUTHENTIFICATION ---
    /**
     * Vérifie l'état de la session de l'utilisateur.
     * @returns {Promise<{status: 'VALID' | 'INVALID_TOKEN' | 'NO_SESSION' | 'API_ERROR', message?: string}>}
     */
    async function checkStoredToken() {
        console.log('[CX Popup] Checking for stored session...');
        const session = await chrome.storage.local.get(['activationToken', 'userPhone', 'tokenTimestamp']);
        
        if (!session.activationToken || !session.userPhone) {
            logToBackground('No session found in storage.');
            return { status: 'NO_SESSION' };
        }

        // Vérification locale avec expiration du token (24h)
        const TOKEN_EXPIRY_HOURS = 24;
        const now = Date.now();
        const tokenAge = session.tokenTimestamp ? (now - session.tokenTimestamp) : Infinity;
        const maxAge = TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;

        if (tokenAge > maxAge) {
            logToBackground(`Token expired (age: ${Math.round(tokenAge / (60 * 60 * 1000))}h). Clearing session.`);
            await chrome.storage.local.remove(['activationToken', 'userPhone', 'tokenTimestamp']);
            return { status: 'NO_SESSION' };
        }

        logToBackground(`Found valid session for ${session.userPhone}. Token age: ${Math.round(tokenAge / (60 * 60 * 1000))}h`);

        // Pour l'instant, on fait confiance à la validation locale
        // La vérification serveur sera faite si nécessaire par content.js
        return { status: 'VALID', phone: session.userPhone };
    }

    /**
     * Vérifie un numéro de téléphone auprès du serveur
     */
    async function verifyPhoneNumber(phone) {
        console.log(`[CX Popup] Verifying phone: ${phone}`);
        
        try {
            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ phone: phone })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('[CX Popup] Server response:', result);

            if (result.success) {
                // Sauvegarder les informations de session
                const now = Date.now();
                await chrome.storage.local.set({
                    activationToken: result.token,
                    userPhone: phone,
                    tokenTimestamp: now
                });
                logToBackground(`Token saved for ${phone}`);
            }

            return result;
        } catch (error) {
            console.error('[CX Popup] Error verifying phone:', error);
            logToBackground(`Error verifying phone ${phone}: ${error.message}`);
            return {
                success: false,
                message: 'Erreur de connexion au serveur. Veuillez réessayer.'
            };
        }
    }

    // --- GESTIONNAIRES D'ÉVÉNEMENTS ---
    
    // Événement pour le bouton de vérification
    if (verifyBtn) {
        verifyBtn.addEventListener('click', handleVerification);
    }
    
    // Événement pour l'entrée au clavier sur le champ téléphone
    if (phoneInput) {
        phoneInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                handleVerification();
            }
        });
    }

    // Gestionnaire de vérification du numéro
    async function handleVerification() {
        const phone = phoneInput.value.trim();
        
        if (!phone) {
            showError('Veuillez entrer un numéro de téléphone.');
            return;
        }

        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Vérification...';
        hideError();

        const activation = await verifyPhoneNumber(phone);
        
        if (activation.success) {
            logToBackground(`User authenticated: ${phone}`);
            
            // Rechercher l'onglet WhatsApp et le recharger pour injecter le script
            try {
                const tabs = await chrome.tabs.query({ url: "*://web.whatsapp.com/*" });
                if (tabs.length > 0) {
                    const whatsappTab = tabs[0];
                    await chrome.tabs.reload(whatsappTab.id);
                    logToBackground('WhatsApp tab found and reloaded to activate toolbar.');
                }
            } catch (error) {
                console.error('[CX Popup] Error reloading WhatsApp tab:', error);
            }

            showWelcome();
        } else {
            showError(activation.message);
        }

        verifyBtn.disabled = false;
        verifyBtn.textContent = "Vérifier";
    }

    // --- INITIALISATION ---
    
    // Vérifier la session au chargement
    checkStoredToken().then(sessionState => {
        console.log('[CX Popup] Session state:', sessionState);
        
        switch (sessionState.status) {
            case 'VALID':
                showWelcome();
                break;
            
            case 'INVALID_TOKEN':
                // Le token n'est plus valide (une autre session a été activée).
                logToBackground('Token is invalid. Session cleared.');
                showLogin();
                break;
            
            case 'NO_SESSION':
            case 'API_ERROR':
            default:
                // Aucune session active ou erreur API - afficher la page de connexion.
                showLogin();
                break;
        }
    }).catch(error => {
        console.error('[CX Popup] Error checking session:', error);
        showLogin();
    });
});