let recorder;
let audioChunks = [];

// Fonction pour envoyer des logs au service worker pour le débogage
function logOffscreen(message) {
    chrome.runtime.sendMessage({ type: 'log', target: 'background', message: message, source: 'Offscreen' });
}

// Écoute les messages venant du service worker (background.js)
chrome.runtime.onMessage.addListener((message) => {
    logOffscreen(`Received message: type=${message.type}`);
    if (message.target === 'offscreen') {
        if (message.type === 'start-recording') {
            startRecording();
        } else if (message.type === 'stop-recording') {
            stopRecording();
        }
    }
});

async function startRecording() {
    if (recorder?.state === 'recording') {
        logOffscreen('Start command received, but already recording.');
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        recorder = new MediaRecorder(stream);
        audioChunks = [];
        recorder.ondataavailable = (e) => audioChunks.push(e.data);
        
        recorder.onstop = () => {
            logOffscreen('Recording stopped. Starting MP3 conversion process.');
            const webmBlob = new Blob(audioChunks, { type: 'audio/webm' });
            convertToMp3(webmBlob);
            stream.getTracks().forEach(t => t.stop());
        };
        
        recorder.start();
        chrome.runtime.sendMessage({ type: 'recording-started', target: 'popup' });
    } catch (err) {
        chrome.runtime.sendMessage({ type: 'mic-error', target: 'background', error: `[${err.name}] ${err.message}` });
    }
}

function stopRecording() {
    if (recorder?.state === 'recording') {
        recorder.stop();
    }
}

/**
 * Le cœur du processus : convertit un blob audio (ex: webm) en blob MP3.
 * @param {Blob} audioBlob Le blob audio à convertir.
 */
async function convertToMp3(audioBlob) {
    try {
        logOffscreen('MP3 CONVERSION - Step 1: Reading audio blob as ArrayBuffer.');
        const arrayBuffer = await audioBlob.arrayBuffer();

        logOffscreen('MP3 CONVERSION - Step 2: Decoding ArrayBuffer to raw audio data (PCM).');
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // ========================================================================
        // CORRECTION MAJEURE : On s'adapte aux exigences de la bibliothèque lamejs
        // ========================================================================

        // 1. On déclare à l'encodeur qu'on va travailler en STÉRÉO (2 canaux).
        const mp3encoder = new lamejs.Mp3Encoder(2, audioBuffer.sampleRate, 128); 

        // 2. On prépare deux canaux, même si la source est mono.
        const leftPCM = audioBuffer.getChannelData(0);
        let rightPCM;

        if (audioBuffer.numberOfChannels === 2) {
            // Si la source est déjà stéréo, on prend le deuxième canal.
            rightPCM = audioBuffer.getChannelData(1);
        } else {
            // Si la source est mono, on DUPLIQUE le canal gauche pour le canal droit.
            rightPCM = leftPCM;
        }

        // 3. On convertit les deux canaux au format Int16 attendu par LAME.
        const leftInt16 = new Int16Array(leftPCM.length);
        const rightInt16 = new Int16Array(rightPCM.length);

        for (let i = 0; i < leftPCM.length; i++) {
            leftInt16[i] = leftPCM[i] * 32767;
            rightInt16[i] = rightPCM[i] * 32767;
        }

        logOffscreen('MP3 CONVERSION - Step 3: Encoding PCM data to MP3 chunks.');
        const mp3Data = [];
        const sampleBlockSize = 1152; 
        
        for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
            const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
            const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);
            
            // 4. On passe maintenant DEUX canaux à l'encodeur.
            const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);

            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }
        
        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }

        logOffscreen('MP3 CONVERSION - Step 4: Creating final MP3 blob.');
        const mp3Blob = new Blob(mp3Data, { type: 'audio/mpeg' });

        const reader = new FileReader();
        reader.onload = () => {
            logOffscreen('MP3 conversion successful. Sending to popup.');
            chrome.runtime.sendMessage({
                type: 'audio-ready',
                target: 'popup',
                dataUrl: reader.result,
                name: `Message-vocal-${new Date().toISOString()}.mp3`,
                mimeType: 'audio/mpeg'
            });
        };
        reader.readAsDataURL(mp3Blob);

    } catch (error) {
        logOffscreen(`MP3 Conversion Error: ${error.message}`);
        chrome.runtime.sendMessage({ type: 'mic-error', target: 'background', error: 'Erreur de conversion audio.' });
    }
}