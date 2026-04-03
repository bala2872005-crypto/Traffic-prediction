/**
 * AI Assistant Module
 * Voice Search, Natural Language Query Mapper, AI Chatbot
 */

const AIAssistant = (() => {
    let recognition = null;
    let isListening = false;
    let chatHistory = [];

    const intents = [
        { pattern: /(coffee|cafe|restaurant|food|eat|hotel|petrol|gas station|fuel|hospital|pharmacy|atm|bank|police|park)/i,
          handler: (match) => findNearbyPlace(match[1]) },
        { pattern: /route (from|to)?\s*(.+?) (to|and)\s*(.+)/i,
          handler: (match) => planRouteFromVoice(match[2], match[4]) },
        { pattern: /traffic (in|near|at|around)?\s*(.+)/i,
          handler: (match) => showTrafficInfo(match[2]) },
        { pattern: /(how long|eta|time) (to|from|for)?\s*(.+)/i,
          handler: (match) => estimateETA(match[3]) },
        { pattern: /avoid (toll|highway|motorway)/i,
          handler: () => setAvoidOption() },
        { pattern: /nearest (hospital|police|fire|emergency)/i,
          handler: (match) => findNearbyPlace(match[1] + ' emergency') },
        { pattern: /weather/i,
          handler: () => addChatMessage('bot', '⛅ Weather integration coming soon! Currently showing traffic conditions only.') },
    ];

    function init() {
        initVoiceSearch();
        initChatbot();
        setupVoiceTrigger();
    }

    function initVoiceSearch() {
        if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
            const micBtn = document.getElementById('voiceSearchBtn');
            if (micBtn) { micBtn.style.opacity = '0.3'; micBtn.title = 'Voice search not supported'; }
            return;
        }
        const SpeechRecog = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecog();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-IN';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            processVoiceQuery(transcript);
            stopListening();
        };
        recognition.onerror = () => stopListening();
        recognition.onend = () => stopListening();
    }

    function startListening() {
        if (!recognition) return;
        isListening = true;
        recognition.start();
        const micBtn = document.getElementById('voiceSearchBtn');
        if (micBtn) {
            micBtn.style.background = '#ef4444';
            micBtn.innerHTML = '🔴';
            micBtn.title = 'Listening... (click to stop)';
        }
        speak('Listening...');
    }

    function stopListening() {
        isListening = false;
        const micBtn = document.getElementById('voiceSearchBtn');
        if (micBtn) {
            micBtn.style.background = '';
            micBtn.innerHTML = '🎤';
            micBtn.title = 'Voice Search';
        }
        if (recognition) { try { recognition.stop(); } catch(e) {} }
    }

    function toggleListening() {
        if (isListening) stopListening();
        else startListening();
    }

    function processVoiceQuery(text) {
        addChatMessage('user', text);
        const lText = text.toLowerCase();

        for (let intent of intents) {
            const match = lText.match(intent.pattern);
            if (match) {
                intent.handler(match);
                return;
            }
        }

        // Fallback: try to search as a place
        const srcInput = document.getElementById('sourceInput');
        if (srcInput) {
            addChatMessage('bot', `🔍 Searching for "${text}" as a destination...`);
            const destInput = document.getElementById('destInput');
            if (destInput) {
                destInput.value = text;
                speak(`Setting destination to ${text}`);
            }
        } else {
            addChatMessage('bot', `I heard: "${text}". Try saying "show coffee near me" or "route from Chennai to Madurai".`);
        }
    }

    function planRouteFromVoice(src, dest) {
        const srcInput = document.getElementById('sourceInput');
        const dstInput = document.getElementById('destInput');
        if (srcInput) srcInput.value = src.trim();
        if (dstInput) dstInput.value = dest.trim();
        addChatMessage('bot', `🗺️ Planning route from ${src.trim()} to ${dest.trim()}...`);
        speak(`Planning route from ${src.trim()} to ${dest.trim()}`);
        const calcBtn = document.getElementById('calculateRouteBtn');
        if (calcBtn) setTimeout(() => calcBtn.click(), 500);
    }

    function showTrafficInfo(location) {
        addChatMessage('bot', `🚦 Checking traffic conditions near ${location.trim()}...`);
        speak(`Checking traffic near ${location.trim()}`);
        const srcInput = document.getElementById('sourceInput');
        if (srcInput) srcInput.value = location.trim();
    }

    function estimateETA(destination) {
        addChatMessage('bot', `⏱️ Calculating ETA to ${destination.trim()}. Set it as your destination and plan a route!`);
        speak(`Set ${destination} as destination to get ETA`);
        const dstInput = document.getElementById('destInput');
        if (dstInput) dstInput.value = destination.trim();
    }

    function setAvoidOption() {
        const tollToggle = document.getElementById('avoidTolls');
        const hwToggle = document.getElementById('avoidHighways');
        if (tollToggle) { tollToggle.checked = true; tollToggle.dispatchEvent(new Event('change')); }
        addChatMessage('bot', '✅ Avoiding tolls and highways. Route will be recalculated.');
        speak('Avoiding tolls and highways');
    }

    function findNearbyPlace(placeType) {
        addChatMessage('bot', `📍 Searching for nearby ${placeType}...`);
        speak(`Finding nearby ${placeType}`);
        if (typeof findNearby === 'function') {
            findNearby(placeType);
        } else {
            const nearbyBtn = document.getElementById('nearbySearchBtn');
            const nearbyInput = document.getElementById('nearbyPlaceInput');
            if (nearbyInput) nearbyInput.value = placeType;
            if (nearbyBtn) nearbyBtn.click();
        }
    }

    function speak(text, lang = 'en-IN') {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const msg = new SpeechSynthesisUtterance(text);
            msg.lang = lang;
            msg.rate = 0.95;
            window.speechSynthesis.speak(msg);
        }
    }

    function addChatMessage(role, text) {
        const chatBody = document.getElementById('chatBody');
        if (!chatBody) return;

        chatHistory.push({ role, text, time: new Date() });

        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg chat-msg-${role}`;
        msgDiv.innerHTML = `<span class="chat-bubble">${text}</span>`;
        chatBody.appendChild(msgDiv);
        chatBody.scrollTop = chatBody.scrollHeight;

        const chatWidget = document.getElementById('chatWidget');
        if (chatWidget && chatWidget.classList.contains('hidden')) {
            const badge = document.getElementById('chatBadge');
            if (badge) { badge.style.display = 'flex'; badge.innerText = chatHistory.filter(m => m.role === 'bot').length; }
        }
    }

    function initChatbot() {
        const chatInput = document.getElementById('chatInput');
        const chatSend = document.getElementById('chatSendBtn');
        if (!chatInput || !chatSend) return;

        chatSend.addEventListener('click', () => sendChatMessage());
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendChatMessage();
        });

        // Welcome message
        setTimeout(() => addChatMessage('bot', '👋 Hi! I\'m your AI Traffic Assistant. Ask me things like:\n• "Route from Chennai to Madurai"\n• "Find coffee near me"\n• "Avoid tolls"'), 800);
    }

    function sendChatMessage() {
        const chatInput = document.getElementById('chatInput');
        if (!chatInput || !chatInput.value.trim()) return;
        const text = chatInput.value.trim();
        chatInput.value = '';
        processVoiceQuery(text);
    }

    function setupVoiceTrigger() {
        const micBtn = document.getElementById('voiceSearchBtn');
        if (micBtn) micBtn.addEventListener('click', toggleListening);

        const chatToggle = document.getElementById('chatToggleBtn');
        const chatWidget = document.getElementById('chatWidget');
        if (chatToggle && chatWidget) {
            chatToggle.addEventListener('click', () => {
                chatWidget.classList.toggle('hidden');
                const badge = document.getElementById('chatBadge');
                if (badge) badge.style.display = 'none';
            });
        }
    }

    return { init, speak, addChatMessage, processVoiceQuery, toggleListening };
})();

window.AIAssistant = AIAssistant;
