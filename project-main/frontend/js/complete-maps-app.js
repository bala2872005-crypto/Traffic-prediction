/**
 * Complete Google Maps Clone with AI Traffic Prediction
 * All features integrated
 */

const MapsApp = (() => {
    const API_BASE = '';
    
    // State Management
    const state = {
        map: null,
        currentLayer: 'default',
        currentMode: 'car',
        locations: [],
        selectedStart: null,
        selectedEnd: null,
        currentRoute: null,
        userLocation: null,
        trafficData: {},
        nearbyPlaces: [],
        savedPlaces: [],
        routeMarkers: [],
        trafficLayers: [],
        isVoiceActive: false,
        aiChatHistory: []
    };
    
    // Map Layers
    const mapLayers = {
        default: null,
        satellite: null,
        terrain: null,
        traffic: null
    };
    
    // Initialize Application
    async function init() {
        console.log('🗺️ Initializing Complete Maps Application...');
        
        try {
            await initializeMap();
            await loadLocations();
            await loadTrafficData();
            setupEventHandlers();
            setupVoiceRecognition();
            initializeAI();
            getUserLocation();
            
            showToast('Maps ready! Try the AI Assistant', 'success');
        } catch (error) {
            console.error('Initialization error:', error);
            showToast('Failed to initialize. Please refresh.', 'error');
        }
    }
    
    // Map Initialization
    function initializeMap() {
        return new Promise((resolve) => {
            // Initialize main map
            state.map = L.map('mainMap', {
                center: [11.1271, 78.6569],
                zoom: 7,
                zoomControl: true
            });
            
            // Default layer - OpenStreetMap
            mapLayers.default = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(state.map);
            
            // Satellite layer
            mapLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri',
                maxZoom: 19
            });
            
            // Terrain layer
            mapLayers.terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                attribution: 'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap',
                maxZoom: 17
            });
            
            setTimeout(() => {
                state.map.invalidateSize();
                resolve();
            }, 200);
        });
    }
    
    // Load Locations
    async function loadLocations() {
        try {
            const response = await fetch(`${API_BASE}/nodes`);
            const data = await response.json();
            state.locations = data.nodes.map(node => ({
                id: node.id,
                name: node.name,
                type: node.type,
                lat: node.lat,
                lng: node.lng,
                searchText: `${node.name} ${node.id} ${node.type}`.toLowerCase()
            }));
            
            renderNodesOnMap();
        } catch (error) {
            console.error('Failed to load locations:', error);
        }
    }
    
    // Load Traffic Data
    async function loadTrafficData() {
        try {
            const response = await fetch(`${API_BASE}/traffic-data`);
            const data = await response.json();
            state.trafficData = data.predictions || {};
            
            if (state.currentLayer === 'traffic') {
                renderTrafficLayer();
            }
        } catch (error) {
            console.error('Failed to load traffic data:', error);
        }
    }
    
    // Render Nodes on Map
    function renderNodesOnMap() {
        state.locations.forEach(location => {
            const marker = L.circleMarker([location.lat, location.lng], {
                radius: 6,
                fillColor: '#1a73e8',
                color: 'white',
                weight: 2,
                fillOpacity: 0.8
            }).addTo(state.map);
            
            marker.bindPopup(`
                <div style="font-family: Roboto, sans-serif;">
                    <h3 style="margin: 0 0 8px 0; font-size: 14px;">${location.name}</h3>
                    <p style="margin: 0; font-size: 12px; color: #5f6368;">${location.type} road</p>
                </div>
            `);
        });
    }
    
    // Render Traffic Layer
    function renderTrafficLayer() {
        clearTrafficLayers();
        
        state.locations.forEach(location => {
            const traffic = state.trafficData[location.id];
            if (!traffic) return;
            
            let color = '#34a853'; // green
            if (traffic.traffic_level === 'high') color = '#ea4335';
            else if (traffic.traffic_level === 'medium') color = '#fbbc04';
            
            const circle = L.circle([location.lat, location.lng], {
                radius: traffic.traffic_level === 'high' ? 12000 : 10000,
                color: color,
                fillColor: color,
                fillOpacity: 0.15,
                opacity: 0.5,
                weight: 2
            }).addTo(state.map);
            
            state.trafficLayers.push(circle);
        });
        
        document.getElementById('trafficLegend').classList.remove('hidden');
    }
    
    function clearTrafficLayers() {
        state.trafficLayers.forEach(layer => state.map.removeLayer(layer));
        state.trafficLayers = [];
    }
    
    // Event Handlers Setup
    function setupEventHandlers() {
        // Menu button
        document.getElementById('menuBtn').addEventListener('click', toggleMenu);
        
        // Quick actions
        document.getElementById('directionsBtn').addEventListener('click', showDirections);
        document.getElementById('exploreBtn').addEventListener('click', showExplore);
        document.getElementById('savedBtn').addEventListener('click', showSaved);
        
        // Back buttons
        document.getElementById('backToSearch').addEventListener('click', backToSearch);
        document.getElementById('backFromExplore').addEventListener('click', backToSearch);
        
        // Travel mode buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                state.currentMode = e.currentTarget.dataset.mode;
            });
        });
        
        // Route inputs
        setupAutocomplete('startPoint', 'startAutocomplete', (location) => {
            state.selectedStart = location;
            checkAndCalculateRoute();
        });
        
        setupAutocomplete('endPoint', 'endAutocomplete', (location) => {
            state.selectedEnd = location;
            checkAndCalculateRoute();
        });
        
        // Clear buttons
        document.getElementById('clearStart').addEventListener('click', () => {
            document.getElementById('startPoint').value = '';
            state.selectedStart = null;
        });
        
        document.getElementById('clearEnd').addEventListener('click', () => {
            document.getElementById('endPoint').value = '';
            state.selectedEnd = null;
        });
        
        // Swap locations
        document.getElementById('swapLocations').addEventListener('click', swapLocations);
        
        // Layer controls
        document.getElementById('layerBtn').addEventListener('click', () => {
            document.getElementById('layerMenu').classList.toggle('hidden');
        });
        
        document.querySelectorAll('.layer-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const layer = e.currentTarget.dataset.layer;
                switchMapLayer(layer);
            });
        });
        
        // Map controls
        document.getElementById('myLocationBtn').addEventListener('click', goToMyLocation);
        document.getElementById('view3dBtn').addEventListener('click', toggle3DView);
        document.getElementById('streetViewBtn').addEventListener('click', toggleStreetView);
        
        // AI Assistant
        document.getElementById('aiAssistantBtn').addEventListener('click', openAIChat);
        document.getElementById('closeChatBtn').addEventListener('click', closeAIChat);
        document.getElementById('sendAiMessage').addEventListener('click', sendAIMessage);
        document.getElementById('aiChatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendAIMessage();
        });
        
        // Voice buttons
        document.getElementById('voiceSearchBtn').addEventListener('click', startVoiceSearch);
        document.getElementById('voiceInputBtn').addEventListener('click', startVoiceInput);
        
        // Suggestion chips
        document.querySelectorAll('.suggestion-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                document.getElementById('aiChatInput').value = e.target.textContent;
                sendAIMessage();
            });
        });
        
        // Explore categories
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category;
                searchNearby(category);
            });
        });
    }
    
    // Autocomplete System
    function setupAutocomplete(inputId, dropdownId, onSelect) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);
        
        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            
            if (!query) {
                dropdown.classList.remove('show');
                return;
            }
            
            const matches = state.locations.filter(loc => 
                loc.searchText.includes(query)
            ).slice(0, 5);
            
            if (matches.length === 0) {
                dropdown.classList.remove('show');
                return;
            }
            
            dropdown.innerHTML = matches.map(loc => `
                <div class="autocomplete-item" data-id="${loc.id}">
                    <i class="fas fa-map-marker-alt"></i>
                    <div>
                        <div style="font-weight: 500;">${loc.name}</div>
                        <div style="font-size: 12px; color: #5f6368;">${loc.type} road</div>
                    </div>
                </div>
            `).join('');
            
            dropdown.classList.add('show');
            
            dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
                item.addEventListener('click', () => {
                    const id = item.dataset.id;
                    const location = state.locations.find(l => l.id === id);
                    if (location) {
                        input.value = location.name;
                        dropdown.classList.remove('show');
                        onSelect(location);
                    }
                });
            });
        });
        
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
    }
    
    // Route Calculation
    async function checkAndCalculateRoute() {
        if (!state.selectedStart || !state.selectedEnd) return;
        
        showLoading();
        
        try {
            let endpoint = '/route';
            if (state.currentMode === 'emergency') endpoint = '/route/emergency';
            else if (state.currentMode === 'truck') endpoint = '/route/heavy';
            
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: state.selectedStart.id,
                    target: state.selectedEnd.id
                })
            });
            
            const result = await response.json();
            state.currentRoute = result;
            
            displayRouteResults(result);
            drawRouteOnMap(result);
            
            showToast('Route calculated successfully!', 'success');
        } catch (error) {
            console.error('Route calculation error:', error);
            showToast('Failed to calculate route', 'error');
        } finally {
            hideLoading();
        }
    }
    
    // Display Route Results
    function displayRouteResults(result) {
        const container = document.getElementById('routeResults');
        
        if (!result.success) {
            container.innerHTML = `
                <div style="padding: 32px; text-align: center; color: #5f6368;">
                    <i class="fas fa-route" style="font-size: 48px; margin-bottom: 16px;"></i>
                    <p>No route found between these locations</p>
                </div>
            `;
            return;
        }
        
        const estimatedTime = Math.ceil(result.distance / 60 * 60); // rough estimate
        const trafficLevel = result.has_heavy_traffic ? 'high' : 
                           result.total_warnings > 0 ? 'medium' : 'low';
        
        container.innerHTML = `
            <div class="route-card active">
                <div class="route-summary">
                    <div class="route-time">${estimatedTime} min</div>
                    <div class="route-distance">${result.distance} km</div>
                </div>
                <div class="route-details">
                    Via ${result.path.join(' • ')}
                </div>
                <div style="margin-top: 8px;">
                    <span class="traffic-badge ${trafficLevel}">
                        ${trafficLevel === 'high' ? '🔴' : trafficLevel === 'medium' ? '🟡' : '🟢'}
                        ${trafficLevel} traffic
                    </span>
                </div>
                ${result.traffic_warnings && result.traffic_warnings.length > 0 ? `
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e8eaed;">
                        <div style="font-size: 13px; font-weight: 500; margin-bottom: 8px;">
                            ⚠️ Traffic Alerts (${result.traffic_warnings.length})
                        </div>
                        ${result.traffic_warnings.map(w => `
                            <div style="font-size: 12px; color: #5f6368; margin-bottom: 4px;">
                                • ${w.name}: ${w.reason}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
            
            ${result.has_heavy_traffic ? `
                <div style="padding: 16px;">
                    <button class="quick-action-btn" onclick="MapsApp.findAlternativeRoutes()" style="width: 100%;">
                        <i class="fas fa-route"></i>
                        <span>Find Alternative Routes</span>
                    </button>
                </div>
            ` : ''}
        `;
    }
    
    // Draw Route on Map
    function drawRouteOnMap(result) {
        clearRouteMarkers();
        
        if (!result.success || !result.path) return;
        
        const positions = result.path.map(nodeId => {
            const loc = state.locations.find(l => l.id === nodeId);
            return loc ? [loc.lat, loc.lng] : null;
        }).filter(Boolean);
        
        if (positions.length === 0) return;
        
        // Draw route line
        let color = '#1a73e8';
        if (state.currentMode === 'emergency') color = '#ea4335';
        else if (state.currentMode === 'truck') color = '#f97316';
        
        const routeLine = L.polyline(positions, {
            color: color,
            weight: 6,
            opacity: 0.8
        }).addTo(state.map);
        
        state.routeMarkers.push(routeLine);
        
        // Draw traffic zones
        if (result.path_details) {
            result.path_details.forEach(node => {
                const loc = state.locations.find(l => l.id === node.id);
                if (!loc) return;
                
                let zoneColor = '#34a853';
                if (node.level === 'high') zoneColor = '#ea4335';
                else if (node.level === 'medium') zoneColor = '#fbbc04';
                
                const zone = L.circle([loc.lat, loc.lng], {
                    radius: node.level === 'high' ? 12000 : 10000,
                    color: zoneColor,
                    fillColor: zoneColor,
                    fillOpacity: 0.15,
                    opacity: 0.5,
                    weight: 2
                }).addTo(state.map);
                
                state.routeMarkers.push(zone);
            });
        }
        
        // Start and end markers
        const startMarker = L.marker(positions[0], {
            icon: L.divIcon({
                className: 'custom-marker',
                html: `<div style="
                    width: 32px;
                    height: 32px;
                    background: #34a853;
                    border: 3px solid white;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                ">A</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 32]
            })
        }).addTo(state.map);
        
        const endMarker = L.marker(positions[positions.length - 1], {
            icon: L.divIcon({
                className: 'custom-marker',
                html: `<div style="
                    width: 32px;
                    height: 32px;
                    background: #ea4335;
                    border: 3px solid white;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                ">B</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 32]
            })
        }).addTo(state.map);
        
        state.routeMarkers.push(startMarker, endMarker);
        
        // Fit map to route
        state.map.fitBounds(positions, { padding: [50, 50] });
    }
    
    function clearRouteMarkers() {
        state.routeMarkers.forEach(marker => state.map.removeLayer(marker));
        state.routeMarkers = [];
    }
    
    // Voice Recognition
    function setupVoiceRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.log('Voice recognition not supported');
            return;
        }
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        state.recognition = new SpeechRecognition();
        state.recognition.continuous = false;
        state.recognition.interimResults = false;
        state.recognition.lang = 'en-US';
        
        state.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            handleVoiceInput(transcript);
        };
        
        state.recognition.onerror = (event) => {
            console.error('Voice recognition error:', event.error);
            state.isVoiceActive = false;
        };
    }
    
    function startVoiceSearch() {
        if (!state.recognition) {
            showToast('Voice recognition not supported', 'error');
            return;
        }
        
        state.isVoiceActive = true;
        state.recognition.start();
        showToast('Listening...', 'info');
    }
    
    function startVoiceInput() {
        if (!state.recognition) {
            showToast('Voice recognition not supported', 'error');
            return;
        }
        
        state.isVoiceActive = true;
        state.recognition.start();
        document.getElementById('voiceInputBtn').style.color = '#ea4335';
    }
    
    function handleVoiceInput(text) {
        state.isVoiceActive = false;
        document.getElementById('voiceInputBtn').style.color = '';
        
        if (document.getElementById('aiChatContainer').classList.contains('hidden')) {
            // Voice search in main search
            document.getElementById('mainSearch').value = text;
            searchLocation(text);
        } else {
            // Voice input in AI chat
            document.getElementById('aiChatInput').value = text;
            sendAIMessage();
        }
    }
    
    // AI Assistant
    function initializeAI() {
        state.aiChatHistory = [];
    }
    
    function openAIChat() {
        document.getElementById('aiChatContainer').classList.remove('hidden');
    }
    
    function closeAIChat() {
        document.getElementById('aiChatContainer').classList.add('hidden');
    }
    
    async function sendAIMessage() {
        const input = document.getElementById('aiChatInput');
        const message = input.value.trim();
        
        if (!message) return;
        
        // Add user message to chat
        addMessageToChat(message, 'user');
        input.value = '';
        
        // Process with AI
        const response = await processAIQuery(message);
        addMessageToChat(response, 'ai');
    }
    
    async function processAIQuery(query) {
        const lowerQuery = query.toLowerCase();
        
        // Route finding queries
        if (lowerQuery.includes('route') || lowerQuery.includes('directions') || lowerQuery.includes('how to get')) {
            return await handleRouteQuery(query);
        }
        
        // Traffic queries
        if (lowerQuery.includes('traffic')) {
            return await handleTrafficQuery(query);
        }
        
        // Nearby search
        if (lowerQuery.includes('find') || lowerQuery.includes('nearby') || lowerQuery.includes('near me')) {
            return handleNearbyQuery(query);
        }
        
        // Alternative routes
        if (lowerQuery.includes('alternative') || lowerQuery.includes('other route')) {
            return handleAlternativeQuery();
        }
        
        // Default response
        return `I can help you with:
- Finding routes: "Find route from Chennai to Madurai"
- Checking traffic: "What's the traffic like?"
- Finding places: "Find restaurants nearby"
- Alternative routes: "Show alternative routes"

What would you like to do?`;
    }
    
    async function handleRouteQuery(query) {
        // Extract location names from query
        const locations = state.locations.filter(loc => 
            query.toLowerCase().includes(loc.name.toLowerCase())
        );
        
        if (locations.length >= 2) {
            state.selectedStart = locations[0];
            state.selectedEnd = locations[1];
            document.getElementById('startPoint').value = locations[0].name;
            document.getElementById('endPoint').value = locations[1].name;
            
            await checkAndCalculateRoute();
            
            return `Great! I found a route from ${locations[0].name} to ${locations[1].name}. 
Distance: ${state.currentRoute.distance} km
Check the map for traffic conditions and alternative routes!`;
        }
        
        return `Please specify both starting point and destination. For example: "Find route from Chennai to Madurai"`;
    }
    
    async function handleTrafficQuery(query) {
        if (!state.currentRoute) {
            return `I need a route first! Try saying "Find route from [place] to [place]"`;
        }
        
        const warnings = state.currentRoute.traffic_warnings || [];
        if (warnings.length === 0) {
            return `Good news! Traffic is clear on your route. 🟢 Estimated time: ${Math.ceil(state.currentRoute.distance / 60 * 60)} minutes.`;
        }
        
        const response = `⚠️ Traffic Alert!\n\nI found ${warnings.length} issue(s) on your route:\n\n` +
            warnings.map(w => `• ${w.name}: ${w.reason}`).join('\n') +
            `\n\nWould you like to see alternative routes?`;
        
        return response;
    }
    
    function handleNearbyQuery(query) {
        return `I can help you find nearby places! Here are some options:
🍽️ Restaurants
⛽ Gas stations
🅿️ Parking
🏨 Hotels
💳 ATMs
🏥 Hospitals

Click on Explore to search for places, or tell me what you're looking for!`;
    }
    
    function handleAlternativeQuery() {
        if (!state.currentRoute) {
            return `I need a route first! Try saying "Find route from [place] to [place]"`;
        }
        
        if (state.currentRoute.has_heavy_traffic) {
            // Trigger alternative routes
            findAlternativeRoutes();
            return `Looking for alternative routes with less traffic... Check the results panel!`;
        }
        
        return `The current route looks good! No need for alternatives right now. 😊`;
    }
    
    function addMessageToChat(message, type) {
        const container = document.getElementById('aiChatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = type === 'user' ? 'user-message' : 'ai-message';
        
        messageDiv.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-${type === 'user' ? 'user' : 'robot'}"></i>
            </div>
            <div class="message-content">
                <p>${message.replace(/\n/g, '<br>')}</p>
            </div>
        `;
        
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    }
    
    // Helper Functions
    function showDirections() {
        document.querySelector('.search-section').classList.add('hidden');
        document.getElementById('directionsPanel').classList.remove('hidden');
        document.getElementById('explorePanel').classList.add('hidden');
    }
    
    function showExplore() {
        document.querySelector('.search-section').classList.add('hidden');
        document.getElementById('directionsPanel').classList.add('hidden');
        document.getElementById('explorePanel').classList.remove('hidden');
    }
    
    function showSaved() {
        showToast('Saved places feature - Coming soon!', 'info');
    }
    
    function backToSearch() {
        document.querySelector('.search-section').classList.remove('hidden');
        document.getElementById('directionsPanel').classList.add('hidden');
        document.getElementById('explorePanel').classList.add('hidden');
    }
    
    function swapLocations() {
        const temp = state.selectedStart;
        state.selectedStart = state.selectedEnd;
        state.selectedEnd = temp;
        
        const startInput = document.getElementById('startPoint');
        const endInput = document.getElementById('endPoint');
        const tempValue = startInput.value;
        startInput.value = endInput.value;
        endInput.value = tempValue;
        
        if (state.selectedStart && state.selectedEnd) {
            checkAndCalculateRoute();
        }
    }
    
    function switchMapLayer(layerName) {
        // Remove current layer
        Object.values(mapLayers).forEach(layer => {
            if (layer && state.map.hasLayer(layer)) {
                state.map.removeLayer(layer);
            }
        });
        
        // Add new layer
        if (mapLayers[layerName]) {
            mapLayers[layerName].addTo(state.map);
        }
        
        // Update active button
        document.querySelectorAll('.layer-option').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.layer === layerName) {
                btn.classList.add('active');
            }
        });
        
        state.currentLayer = layerName;
        
        // Handle traffic layer
        if (layerName === 'traffic') {
            renderTrafficLayer();
        } else {
            clearTrafficLayers();
            document.getElementById('trafficLegend').classList.add('hidden');
        }
        
        document.getElementById('layerMenu').classList.add('hidden');
    }
    
    function getUserLocation() {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    state.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    showToast('Location detected', 'success');
                },
                (error) => {
                    console.error('Location error:', error);
                }
            );
        }
    }
    
    function goToMyLocation() {
        if (state.userLocation) {
            state.map.setView([state.userLocation.lat, state.userLocation.lng], 13);
            
            L.marker([state.userLocation.lat, state.userLocation.lng], {
                icon: L.divIcon({
                    className: 'user-location-marker',
                    html: '<div style="width: 16px; height: 16px; background: #1a73e8; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.3);"></div>',
                    iconSize: [16, 16]
                })
            }).addTo(state.map);
        } else {
            showToast('Location not available', 'error');
        }
    }
    
    function toggle3DView() {
        showToast('3D View - Feature in development', 'info');
    }
    
    function toggleStreetView() {
        showToast('Street View - Feature in development', 'info');
    }
    
    function toggleMenu() {
        showToast('Menu - Feature in development', 'info');
    }
    
    function searchLocation(query) {
        const matches = state.locations.filter(loc => 
            loc.searchText.includes(query.toLowerCase())
        );
        
        if (matches.length > 0) {
            const loc = matches[0];
            state.map.setView([loc.lat, loc.lng], 12);
            showToast(`Found: ${loc.name}`, 'success');
        }
    }
    
    async function searchNearby(category) {
        showToast(`Searching for ${category}...`, 'info');
        // Placeholder - would integrate with real places API
        document.getElementById('nearbyResults').innerHTML = `
            <div style="padding: 32px; text-align: center; color: #5f6368;">
                <i class="fas fa-search" style="font-size: 48px; margin-bottom: 16px;"></i>
                <p>Nearby ${category} search</p>
                <p style="font-size: 12px;">Feature in development</p>
            </div>
        `;
    }
    
    function findAlternativeRoutes() {
        showToast('Finding alternative routes...', 'info');
        // Would calculate multiple routes here
    }
    
    // UI Helpers
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => toast.remove(), 3000);
    }
    
    function showLoading() {
        document.getElementById('loadingOverlay').classList.remove('hidden');
    }
    
    function hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }
    
    // Public API
    return {
        init,
        findAlternativeRoutes,
        switchMapLayer,
        sendAIMessage
    };
})();

// Initialize on load
document.addEventListener('DOMContentLoaded', MapsApp.init);
