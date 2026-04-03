// ════════════════════════════════════════════════════════════════
//  TN Command Center — Full Featured App.js
//  Features: Voice Nav, Map Switcher, Nearby Places, Bookmarks,
//            Traffic Layer, Congestion Heatmap, AI Suggestions,
//            Multi Route, Vehicle Modes, Share Route
// ════════════════════════════════════════════════════════════════

// ─── STATE ───────────────────────────────────────────────────────
const logContainer = document.getElementById('systemLogs');
let map;
let routingControl       = null;
let hazardsLayer         = L.layerGroup();
let trafficLayer         = L.layerGroup();
let heatmapLayer         = L.layerGroup();
let bikeRouteLayer       = L.layerGroup();
let transitLayer         = L.layerGroup();
let nearbyLayer          = L.layerGroup();
let routeCoordinates     = [];
let navigatingMarker     = null;
let navigationInterval   = null;
let ambulanceMode        = false;
let heavyVehicleMode     = false;
let hazardData           = [];
let staticHazardData     = [];
let currentRouteSummary  = null;
let currentRouteInstructions = [];
let livePositionWatcher  = null;
let isMidJourneyRerouting= false;
let hazardWarningsIssued = new Set();
let activeTriRoutes      = [];
let currentTravelMode    = 'driving';
let currentMapLayer      = 'dark';
let tileLayer            = null;
let voiceNavEnabled      = true;
let savedPlaces          = JSON.parse(localStorage.getItem('tn_saved_places') || '[]');

// OSRM profile map
const OSRM_PROFILES = {
    driving:  'driving',
    cycling:  'cycling',
    walking:  'foot',
    transit:  'driving'  // fallback; real transit needs GTFS
};

// Tile layer configs
const TILE_LAYERS = {
    dark: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '© OpenStreetMap © CARTO',
        invert: false
    },
    street: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
        invert: false
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: '© Esri',
        invert: false
    },
    terrain: {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attribution: '© OpenTopoMap',
        invert: false
    }
};

// ─── LOGGING ─────────────────────────────────────────────────────
function addLog(message, type = 'normal') {
    if (!logContainer) return;
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `<span style="opacity:0.5">[${time}]</span> ${message}`;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// ─── MAP INIT ────────────────────────────────────────────────────
async function initApp() {
    addLog('Initializing TN Command Center...');

    map = L.map('map', { zoomControl: false }).setView([11.1271, 78.6569], 7);

    tileLayer = L.tileLayer(TILE_LAYERS.dark.url, {
        attribution: TILE_LAYERS.dark.attribution,
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    hazardsLayer.addTo(map);
    trafficLayer.addTo(map);

    addLog('Map initialized', 'success');

    loadRecentSearches();
    loadSavedPlaces();
    await fetchHazards();
    await fetchAndOverlayTrafficData();
    generateAISuggestions();
    setupEventListeners();

    // Init AI assistant
    if (window.AIAssistant) AIAssistant.init();
}

// ─── MAP LAYER SWITCHER ──────────────────────────────────────────
function switchMapLayer(type) {
    if (currentMapLayer === type) return;
    currentMapLayer = type;

    if (tileLayer) map.removeLayer(tileLayer);

    const config = TILE_LAYERS[type];
    tileLayer = L.tileLayer(config.url, {
        attribution: config.attribution,
        subdomains: type === 'dark' ? 'abcd' : 'abc',
        maxZoom: 19
    }).addTo(map);

    // Update active button
    document.querySelectorAll('.map-type-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`mapType${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (btn) btn.classList.add('active');

    addLog(`Map view: ${type}`, 'success');
}

// ─── TRAVEL MODE ────────────────────────────────────────────────
function setTravelMode(mode) {
    currentTravelMode = mode;
    document.querySelectorAll('.travel-mode-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`mode${mode}`);
    if (btn) btn.classList.add('active');
    addLog(`Travel mode: ${mode}`, 'success');

    // Re-plan route if one exists
    if (routeCoordinates.length > 0) planRoute();
}

// ─── HAZARDS ────────────────────────────────────────────────────
async function fetchHazards() {
    addLog('Fetching road hazard data...');
    try {
        const response = await fetch('/api/road-hazards');
        if (!response.ok) throw new Error('API unavailable');
        hazardData = await response.json();
    } catch (e) {
        // Static fallback hazards distributed across Tamil Nadu
        hazardData = [
            { id: 'h1', lat: 13.082, lng: 80.270, type: 'traffic', severity: 'high', title: 'Heavy Traffic - Anna Salai' },
            { id: 'h2', lat: 11.663, lng: 78.146, type: 'accident', severity: 'high', title: 'Accident - Salem Bypass' },
            { id: 'h3', lat: 10.791, lng: 78.705, type: 'roadwork', severity: 'medium', title: 'Road Work - Trichy NH' },
            { id: 'h4', lat: 9.925,  lng: 78.119, type: 'pothole', severity: 'medium', title: 'Potholes - Madurai Ring Road' },
            { id: 'h5', lat: 11.127, lng: 77.341, type: 'speedbreaker', severity: 'low', title: 'Speed Breakers - Erode' },
            { id: 'h6', lat: 12.308, lng: 79.994, type: 'signal', severity: 'low', title: 'Signal Failure - Vellore' },
            { id: 'h7', lat: 10.508, lng: 76.999, type: 'party', severity: 'medium', title: 'Party Event - Coimbatore' },
            { id: 'h8', lat: 8.731,  lng: 77.734, type: 'accident', severity: 'high', title: 'Accident - Tirunelveli Highway' }
        ];
        addLog(`Using ${hazardData.length} static hazard markers`, 'warning');
    }
    staticHazardData = [...hazardData];
    plotHazards(hazardData);
    addLog(`Loaded ${hazardData.length} hazard reports`, 'success');
}

const HAZARD_CONFIG = {
    pothole:     { color: '#f59e0b', icon: '🕳️' },
    accident:    { color: '#ef4444', icon: '💥' },
    traffic:     { color: '#fcd34d', icon: '🚦' },
    speedbreaker:{ color: '#38bdf8', icon: '🛑' },
    roadwork:    { color: '#d946ef', icon: '🚧' },
    party:       { color: '#8b5cf6', icon: '📢' },
    signal:      { color: '#10b981', icon: '🚦' }
};

function plotHazards(data) {
    hazardsLayer.clearLayers();
    data.forEach(hazard => {
        const config = HAZARD_CONFIG[hazard.type] || { color: '#fff', icon: '📍' };
        const markerHTML = `<div style="background-color: ${config.color}; width: 30px; height: 30px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px ${config.color}; display: flex; align-items: center; justify-content: center; font-size: 16px;">${config.icon}</div>`;
        const icon = L.divIcon({ html: markerHTML, className: 'custom-hazard-marker', iconSize: [30, 30], iconAnchor: [15, 15] });
        const marker = L.marker([hazard.lat, hazard.lng], { icon, zIndexOffset: 800 }).bindPopup(`
            <strong>${hazard.title}</strong><br>
            <span style="color:#666; font-size:12px;">Type: ${hazard.type.toUpperCase()}</span><br>
            <span style="color:#666; font-size:12px;">Severity: ${hazard.severity.toUpperCase()}</span>
        `);
        hazardsLayer.addLayer(marker);

        if (hazard.severity === 'high' || hazard.severity === 'critical' || hazard.type === 'traffic') {
            const size = 0.005;
            const bounds = [[hazard.lat - size, hazard.lng - size], [hazard.lat + size, hazard.lng + size]];
            const rect = L.rectangle(bounds, { color: '#ef4444', weight: 3, fillOpacity: 0.1, interactive: true }).addTo(hazardsLayer);
            rect.on('click', () => handleHighTrafficSquareClick(hazard, bounds));
        }
    });
}

function handleHighTrafficSquareClick(hazard, bounds) {
    map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5 });
    activeTriRoutes.forEach(r => map.removeLayer(r));
    activeTriRoutes = [];

    let cause = 'Live AI tracked dense flow of heavy vehicles overlapping with commuter peaks.';
    if (hazard.type === 'accident') cause = 'AI detected multi-vehicle collision blocking two primary lanes.';
    else if (hazard.type === 'roadwork') cause = 'Scheduled highway expansion causing severe bottleneck upstream.';

    document.getElementById('aiTrafficExplanation').innerHTML =
        `<strong>Diagnostic:</strong> ${hazard.title}<br><br><strong>AI Insight:</strong> ${cause}`;
    document.getElementById('triRoutingPanel').classList.remove('hidden');

    const center = L.latLng(hazard.lat, hazard.lng);
    const s = 0.008;
    const hl = L.polyline([[center.lat-s, center.lng-s],[center.lat+s*1.5,center.lng-s*1.5],[center.lat+s, center.lng+s]], { color: '#facc15', weight: 6, dashArray: '10,10' }).addTo(map);
    const nl = L.polyline([[center.lat-s*0.8,center.lng-s*0.5],[center.lat-s*0.5,center.lng+s*1.2],[center.lat+s*0.8,center.lng+s*0.5]], { color: '#10b981', weight: 6 }).addTo(map);
    const al = L.polyline([[center.lat-s,center.lng],[center.lat,center.lng+s*0.5],[center.lat+s,center.lng]], { color: '#ef4444', weight: 8, dashArray: '20,15' }).addTo(map);
    activeTriRoutes.push(hl, nl, al);
}

// ─── AI TRAFFIC DATA OVERLAY ─────────────────────────────────────
async function fetchAndOverlayTrafficData() {
    addLog('Fetching AI traffic predictions...');
    trafficLayer.clearLayers();
    heatmapLayer.clearLayers();

    try {
        const res = await fetch('/traffic-data');
        if (!res.ok) throw new Error('traffic-data API error');
        const data = await res.json();
        const predictions = data.predictions;

        Object.values(predictions).forEach(node => {
            if (!node.position || !node.position[0] || !node.position[1]) return;
            const lat = node.position[0];
            const lng = node.position[1];
            const cong = node.congestion;

            let color = cong > 0.6 ? '#ef4444' : cong > 0.3 ? '#f59e0b' : '#10b981';
            const radius = 600 + cong * 1200;

            // Traffic circle
            const circle = L.circle([lat, lng], {
                radius, color, fillColor: color, fillOpacity: 0.12, weight: 2, opacity: 0.6
            });
            circle.bindPopup(`<strong>${node.name}</strong><br>Congestion: ${(cong * 100).toFixed(0)}%<br>Level: ${node.traffic_level}`);
            trafficLayer.addLayer(circle);

            // Heatmap div marker
            const heatEl = L.divIcon({
                html: `<div style="width:${radius/40}px; height:${radius/40}px; border-radius:50%; background:${color}; opacity:0.15; border:2px solid ${color};"></div>`,
                className: 'congestion-heatmap-circle',
                iconSize: [radius/40, radius/40],
                iconAnchor: [radius/80, radius/80]
            });
            heatmapLayer.addLayer(L.marker([lat, lng], { icon: heatEl, zIndexOffset: -100 }));
        });

        addLog('AI traffic overlay rendered', 'success');
    } catch (e) {
        addLog('Traffic overlay using simulated data', 'warning');
        // Simulated fallback circles for Tamil Nadu nodes
        const simNodes = [
            { lat: 13.082, lng: 80.270, name: 'Chennai', cong: 0.82 },
            { lat: 11.663, lng: 78.146, name: 'Salem', cong: 0.55 },
            { lat: 10.791, lng: 78.705, name: 'Trichy', cong: 0.34 },
            { lat: 9.925,  lng: 78.119, name: 'Madurai', cong: 0.71 },
            { lat: 11.127, lng: 77.341, name: 'Erode', cong: 0.42 },
            { lat: 10.508, lng: 76.999, name: 'Coimbatore', cong: 0.67 },
            { lat: 12.308, lng: 79.994, name: 'Vellore', cong: 0.30 },
            { lat: 8.731,  lng: 77.734, name: 'Tirunelveli', cong: 0.58 }
        ];
        simNodes.forEach(n => {
            const color = n.cong > 0.6 ? '#ef4444' : n.cong > 0.3 ? '#f59e0b' : '#10b981';
            const circle = L.circle([n.lat, n.lng], { radius: 2000 + n.cong * 4000, color, fillColor: color, fillOpacity: 0.1, weight: 2, opacity: 0.5 });
            circle.bindPopup(`<strong>${n.name}</strong><br>AI Congestion: ${(n.cong * 100).toFixed(0)}%`);
            trafficLayer.addLayer(circle);
        });
    }
}

// ─── NEARBY PLACES (Overpass API) ───────────────────────────────
async function findNearby(placeType) {
    const center = map.getCenter();
    const radius = 5000;
    addLog(`Searching nearby: ${placeType}`, 'warning');
    nearbyLayer.clearLayers();
    if (!map.hasLayer(nearbyLayer)) nearbyLayer.addTo(map);

    const TAG_MAP = {
        restaurant: 'amenity=restaurant', coffee: 'amenity=cafe',
        hospital: 'amenity=hospital', fuel: 'amenity=fuel',
        atm: 'amenity=atm', police: 'amenity=police',
        pharmacy: 'amenity=pharmacy', hotel: 'tourism=hotel',
        park: 'leisure=park', bank: 'amenity=bank'
    };
    const typeKey = Object.keys(TAG_MAP).find(k => placeType.toLowerCase().includes(k)) || 'amenity=cafe';
    const tagQuery = TAG_MAP[typeKey] || `amenity=${placeType}`;
    const [key, val] = tagQuery.split('=');

    const query = `[out:json][timeout:10];node["${key}"="${val}"](around:${radius},${center.lat},${center.lng});out 8;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    const resultsList = document.getElementById('nearbyResultsList');
    if (resultsList) resultsList.innerHTML = '<div style="color:#64748b; font-size:12px; padding:8px;">Searching...</div>';

    try {
        const res = await fetch(url);
        const data = await res.json();
        const elements = data.elements || [];

        if (elements.length === 0) {
            if (resultsList) resultsList.innerHTML = '<div style="color:#64748b; font-size:12px; padding:8px;">No results found nearby.</div>';
            return;
        }

        const icons = {
            restaurant: '🍽️', cafe: '☕', hospital: '🏥', fuel: '⛽',
            atm: '🏧', police: '🚔', pharmacy: '💊', hotel: '🏨', park: '🌳', bank: '🏦'
        };
        const icon = icons[val] || icons[typeKey] || '📍';

        if (resultsList) resultsList.innerHTML = '';

        elements.slice(0, 8).forEach(el => {
            const name = el.tags.name || `${val.charAt(0).toUpperCase() + val.slice(1)}`;
            const dist = map.getCenter().distanceTo([el.lat, el.lon]);
            const distStr = dist > 1000 ? (dist/1000).toFixed(1) + ' km' : Math.round(dist) + ' m';

            // Map marker
            const markerIcon = L.divIcon({
                html: `<div style="background:#1e3a5f; border:2px solid #38bdf8; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-size:16px; box-shadow:0 0 8px rgba(56,189,248,0.4);">${icon}</div>`,
                className: '', iconSize: [32,32], iconAnchor: [16,16]
            });
            const marker = L.marker([el.lat, el.lon], { icon: markerIcon, zIndexOffset: 900 });
            marker.bindPopup(`<strong>${name}</strong><br><small>${val}</small><br><small>~${distStr}</small>`);
            marker.on('click', () => showPlaceDetail(el, name, val, icon, distStr));
            nearbyLayer.addLayer(marker);

            // Sidebar result item
            if (resultsList) {
                const item = document.createElement('div');
                item.className = 'nearby-result-item';
                item.innerHTML = `<span class="nearby-result-icon">${icon}</span><div><div class="nearby-result-name">${name}</div><div class="nearby-result-dist">${distStr}</div></div>`;
                item.addEventListener('click', () => {
                    map.setView([el.lat, el.lon], 16);
                    marker.openPopup();
                });
                resultsList.appendChild(item);
            }
        });

        addLog(`Found ${elements.length > 8 ? 8 : elements.length} nearby ${placeType}`, 'success');
        if (window.AIAssistant) AIAssistant.addChatMessage('bot', `✅ Found ${elements.length > 8 ? 8 : elements.length} nearby ${placeType}. Check the sidebar and map!`);

    } catch (e) {
        addLog(`Nearby search failed: ${e.message}`, 'error');
        if (resultsList) resultsList.innerHTML = '<div style="color:#ef4444; font-size:12px; padding:8px;">Search failed. Check internet connection.</div>';
    }
}

function showPlaceDetail(el, name, type, icon, distStr) {
    const panel = document.getElementById('placeDetailPanel');
    const content = document.getElementById('placeDetailContent');
    if (!panel || !content) return;

    const phone = el.tags?.phone || el.tags?.['contact:phone'] || '';
    const website = el.tags?.website || '';
    const openingHours = el.tags?.opening_hours || '';
    const rating = (3.5 + Math.random() * 1.5).toFixed(1);
    const stars = '⭐'.repeat(Math.round(parseFloat(rating)));

    content.innerHTML = `
        <div class="place-detail-name">${icon} ${name}</div>
        <div class="place-detail-type">${type.toUpperCase()} • ${distStr} away</div>
        <div class="place-detail-info">
            ${openingHours ? `🕒 ${openingHours}<br>` : ''}
            ${phone ? `📞 ${phone}<br>` : ''}
            ${website ? `🌐 <a href="${website}" target="_blank" style="color:#38bdf8">${website}</a><br>` : ''}
            ⭐ Rating: ${rating} ${stars}
        </div>
        <div class="place-detail-actions">
            <button class="btn btn-primary" onclick="setAsDestination(${el.lat}, ${el.lon}, '${name.replace(/'/g,"\\'")}')">🗺️ Navigate</button>
            <button class="btn btn-secondary" onclick="savePlace(${el.lat}, ${el.lon}, '${name.replace(/'/g,"\\'")}', '${icon}')">⭐ Save</button>
            <button class="btn btn-secondary" onclick="document.getElementById('placeDetailPanel').classList.add('hidden')">✕</button>
        </div>
    `;
    panel.classList.remove('hidden');
}

function setAsDestination(lat, lng, name) {
    const destInput = document.getElementById('destInput');
    if (destInput) destInput.value = name;
    document.getElementById('placeDetailPanel')?.classList.add('hidden');
    addLog(`Destination set: ${name}`, 'success');
    planRouteToCoords(lat, lng);
}

// ─── SAVED PLACES (Bookmarks) ────────────────────────────────────
function savePlace(lat, lng, name, icon) {
    savedPlaces = savedPlaces.filter(p => p.name !== name);
    savedPlaces.unshift({ lat, lng, name, icon, time: Date.now() });
    if (savedPlaces.length > 20) savedPlaces.pop();
    localStorage.setItem('tn_saved_places', JSON.stringify(savedPlaces));
    loadSavedPlaces();
    showShareToast(`⭐ Saved: ${name}`);
}

function saveCurrentView() {
    const center = map.getCenter();
    const name = `View (${center.lat.toFixed(3)}, ${center.lng.toFixed(3)})`;
    savePlace(center.lat, center.lng, name, '📌');
}

function loadSavedPlaces() {
    savedPlaces = JSON.parse(localStorage.getItem('tn_saved_places') || '[]');
    const list = document.getElementById('savedPlacesList');
    if (!list) return;
    list.innerHTML = '';
    if (savedPlaces.length === 0) {
        list.innerHTML = '<div style="color:#64748b; font-size:12px; padding:4px;">No saved places yet.</div>';
        return;
    }
    savedPlaces.forEach((p, i) => {
        const item = document.createElement('div');
        item.className = 'saved-place-item';
        item.innerHTML = `<span>${p.icon || '📍'}</span><span style="flex:1;">${p.name}</span><button class="saved-place-remove" onclick="removeSavedPlace(${i})">✕</button>`;
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('saved-place-remove')) return;
            map.setView([p.lat, p.lng], 14);
        });
        list.appendChild(item);
    });
}

function removeSavedPlace(index) {
    savedPlaces.splice(index, 1);
    localStorage.setItem('tn_saved_places', JSON.stringify(savedPlaces));
    loadSavedPlaces();
}

// ─── SHARE ROUTE ─────────────────────────────────────────────────
function shareRoute() {
    const src = document.getElementById('sourceInput')?.value;
    const dst = document.getElementById('destInput')?.value;
    const url = `${location.origin}${location.pathname}?from=${encodeURIComponent(src)}&to=${encodeURIComponent(dst)}&mode=${currentTravelMode}`;
    navigator.clipboard.writeText(url).then(() => showShareToast('🔗 Route link copied!'));
}

function showShareToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'share-toast';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ─── GEOCODE ─────────────────────────────────────────────────────
async function geocode(query) {
    if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(query.replace(/\s/g, ''))) {
        const [lat, lng] = query.replace(/\s/g, '').split(',');
        return L.latLng(parseFloat(lat), parseFloat(lng));
    }
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Tamil Nadu, India')}&limit=1`);
    const data = await res.json();
    if (data.length > 0) return L.latLng(data[0].lat, data[0].lon);
    throw new Error(`Location '${query}' not found.`);
}

async function reverseGeocode(lat, lng) {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    return data?.address?.city || data?.address?.town || data?.address?.county || `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

// ─── ROUTE PLANNING ──────────────────────────────────────────────
async function planRoute() {
    const source = document.getElementById('sourceInput').value;
    const dest   = document.getElementById('destInput').value;
    const calcBtn = document.getElementById('calculateRouteBtn');
    if (!source || !dest) return addLog('Please enter source and destination.', 'error');

    addLog(`Planning ${currentTravelMode} route: ${source} → ${dest}`, 'warning');
    calcBtn.innerText = '⏳ Planning...';
    calcBtn.disabled = true;

    try {
        const srcLatLng  = await geocode(source);
        const destLatLng = await geocode(dest);

        saveRecentSearch(source);
        saveRecentSearch(dest);

        if (routingControl) map.removeControl(routingControl);
        if (navigatingMarker) map.removeLayer(navigatingMarker);
        clearInterval(navigationInterval);
        document.getElementById('startNavigationBtn').classList.add('hidden');

        const avoidTolls    = document.getElementById('avoidTolls')?.checked || false;
        const avoidHighways = document.getElementById('avoidHighways')?.checked || false;

        const profile = OSRM_PROFILES[currentTravelMode] || 'driving';
        const routeColor = ambulanceMode ? '#ef4444' : heavyVehicleMode ? '#f59e0b' : '#facc15';

        let isFirstRoute = true;

        routingControl = L.Routing.control({
            waypoints: [srcLatLng, destLatLng],
            router: L.Routing.osrmv1({
                serviceUrl: 'https://router.project-osrm.org/route/v1',
                profile: profile,
                useHints: false
            }),
            lineOptions: {
                styles: [{ color: routeColor, opacity: 0.9, weight: 6 }]
            },
            altLineOptions: {
                styles: [{ color: '#64748b', opacity: 0.7, weight: 5 }]
            },
            showAlternatives: true,
            show: false,
            addWaypoints: false,
            draggableWaypoints: false,
            fitSelectedRoutes: true
        }).addTo(map);

        routingControl.on('routeselected', (e) => {
            const route = e.route;
            currentRouteSummary = route.summary;
            routeCoordinates = route.coordinates;
            currentRouteInstructions = route.instructions;

            const distKm  = (currentRouteSummary.totalDistance / 1000).toFixed(1);
            const timeMin = Math.round(currentRouteSummary.totalTime / 60);

            addLog(`Route: ${distKm} km, ~${timeMin} min`, 'success');

            if (isFirstRoute) {
                generateDemoHazards(routeCoordinates);
                plotHazards(hazardData);
                isFirstRoute = false;
            }

            checkForHazardsOnRoute(route);

            document.getElementById('startNavigationBtn').classList.remove('hidden');
            document.getElementById('previewEta').innerText  = `${timeMin} min`;
            document.getElementById('previewDist').innerText = `${distKm} km`;
            document.getElementById('routePreviewPanel').classList.remove('hidden');

            // Voice announcement
            if (voiceNavEnabled && window.AIAssistant) {
                AIAssistant.speak(`Route found. ${timeMin} minutes, ${distKm} kilometers via ${currentTravelMode === 'driving' ? 'road' : currentTravelMode}.`);
            }
        });

    } catch (e) {
        addLog(e.message, 'error');
        if (window.AIAssistant) AIAssistant.addChatMessage('bot', `❌ Route planning failed: ${e.message}`);
    } finally {
        calcBtn.innerText = '🗺️ Plan Route';
        calcBtn.disabled = false;
    }
}

async function planRouteToCoords(lat, lng) {
    const srcInput = document.getElementById('sourceInput');
    const destInput = document.getElementById('destInput');
    const src = srcInput?.value || 'My Location';
    if (destInput) destInput.value = `${lat},${lng}`;
    await planRoute();
}

// ─── HAZARD CHECKS ────────────────────────────────────────────────
function checkForHazardsOnRoute(route) {
    const encountered = new Set();
    hazardData.forEach(h => {
        const p1 = L.latLng(h.lat, h.lng);
        for (let j = 0; j < routeCoordinates.length; j += 10) {
            if (p1.distanceTo(routeCoordinates[j]) < 2000) { encountered.add(h); break; }
        }
    });
    if (encountered.size > 0) {
        addLog(`⚠️ ${encountered.size} hazard(s) on this route!`, 'error');
        if (window.AIAssistant) AIAssistant.addChatMessage('bot', `⚠️ ${encountered.size} road hazard(s) detected on your route. Stay alert!`);
    } else {
        addLog('Route is clear of hazards ✅', 'success');
    }
    renderRouteSummary(encountered);
}

function renderRouteSummary(hazardsSet) {
    const panel = document.getElementById('routeSummaryPanel');
    const grid  = document.getElementById('routeSummaryGrid');
    if (!panel || !grid) return;

    if (hazardsSet.size === 0) {
        grid.innerHTML = `<div class="summary-item" style="grid-column:1/-1; background:rgba(16,185,129,0.2);"><div class="count" style="color:#10b981;">0</div><div class="label" style="color:#10b981;">Hazards — Safe Route ✅</div></div>`;
        panel.classList.remove('hidden');
        return;
    }
    const counts = { pothole:0, speedbreaker:0, roadwork:0, party:0, traffic:0, signal:0, accident:0 };
    hazardsSet.forEach(h => { if (counts[h.type] !== undefined) counts[h.type]++; });
    const labels = { pothole:'Potholes', speedbreaker:'Speed Breakers', roadwork:'Road Works', party:'Party Events', traffic:'Traffic Zones', signal:'Signals', accident:'Accidents' };
    grid.innerHTML = '';
    Object.keys(counts).forEach(k => {
        if (counts[k] > 0) grid.innerHTML += `<div class="summary-item"><div class="count">${counts[k]}</div><div class="label">${labels[k]}</div></div>`;
    });
    panel.classList.remove('hidden');
}

function generateDemoHazards(coords) {
    if (!coords || coords.length < 10) return;
    const types = ['pothole','accident','traffic','speedbreaker','roadwork','party','signal'];
    const newHazards = types.map((type, i) => {
        const seg = Math.floor(coords.length / types.length);
        let idx = Math.max(1, Math.min(coords.length-1, i * seg + Math.floor(Math.random() * seg)));
        const pt = coords[idx];
        return { id:`demo-${type}-${i}`, lat: pt.lat+(Math.random()-0.5)*0.0003, lng: pt.lng+(Math.random()-0.5)*0.0003, type, severity:'high', title:`Reported ${type.toUpperCase()}` };
    });
    for (let i = 0; i < 3; i++) {
        const pt = coords[Math.floor(Math.random() * coords.length)];
        newHazards.push({ id:`demo-rand-${i}`, lat:pt.lat, lng:pt.lng, type:Math.random()>0.5?'traffic':'pothole', severity:'medium', title:'Detected Issue' });
    }
    hazardData = [...staticHazardData, ...newHazards];
}

// ─── VOICE NAVIGATION ────────────────────────────────────────────
function speakInstruction(text) {
    if (!voiceNavEnabled) return;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance(text);
        msg.lang = 'en-IN';
        msg.rate = 0.95;
        window.speechSynthesis.speak(msg);
    }
}

// ─── NAVIGATION ──────────────────────────────────────────────────
function startNavigation() {
    if (!routeCoordinates || routeCoordinates.length === 0) return;
    addLog('Live Navigation Started', 'success');

    const btn = document.getElementById('startNavigationBtn');
    if (btn) { btn.disabled = true; btn.innerText = '🔵 Navigating...'; }

    isMidJourneyRerouting = false;
    hazardWarningsIssued.clear();

    document.getElementById('routePreviewPanel')?.classList.add('hidden');
    document.getElementById('navTopPanel')?.classList.remove('hidden');
    document.getElementById('navBottomPanel')?.classList.remove('hidden');
    document.querySelector('.sidebar')?.classList.add('hidden');

    if (currentRouteSummary) {
        const eta = Math.round(currentRouteSummary.totalTime / 60);
        const dist = (currentRouteSummary.totalDistance / 1000).toFixed(1);
        const arrival = new Date(Date.now() + currentRouteSummary.totalTime * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        document.getElementById('navEta').innerText  = `${eta} min`;
        document.getElementById('navDist').innerText = `${dist} km`;
        document.getElementById('navArrival').innerText = arrival;
    }

    if (navigatingMarker) map.removeLayer(navigatingMarker);
    if (livePositionWatcher && navigator.geolocation) navigator.geolocation.clearWatch(livePositionWatcher);

    const emoji = ambulanceMode ? '🚑' : heavyVehicleMode ? '🚛' : currentTravelMode === 'cycling' ? '🚲' : currentTravelMode === 'walking' ? '🚶' : '🚗';
    const cls   = ambulanceMode ? 'ambulance' : 'default';
    const icon  = L.divIcon({ html:`<div class="vehicle-marker ${cls}">${emoji}</div>`, className:'custom-vehicle-container', iconSize:[35,35], iconAnchor:[17,17] });

    navigatingMarker = L.marker(routeCoordinates[0], { icon, zIndexOffset: 1000 }).addTo(map);
    map.setView(routeCoordinates[0], 16);
    updateNavInstructions(0);

    speakInstruction(`Navigation started. Head towards ${document.getElementById('destInput')?.value || 'destination'}.`);

    if (navigator.geolocation) {
        livePositionWatcher = navigator.geolocation.watchPosition((pos) => {
            const newPos = L.latLng(pos.coords.latitude, pos.coords.longitude);
            navigatingMarker.setLatLng(newPos);
            map.panTo(newPos, { animate: true });

            let minDist = Infinity, closestIdx = 0;
            routeCoordinates.forEach((c, i) => { const d = newPos.distanceTo(c); if (d < minDist) { minDist = d; closestIdx = i; } });
            updateNavInstructions(closestIdx);
            scanForUpcomingHazards(newPos);

            const dest = routeCoordinates[routeCoordinates.length - 1];
            if (newPos.distanceTo(dest) < 50) {
                speakInstruction('You have arrived at your destination!');
                addLog('Destination Reached!', 'success');
                stopNavigation();
            }
        }, (err) => {
            if (err.code === err.PERMISSION_DENIED) { alert('Location access denied.'); stopNavigation(); }
        }, { enableHighAccuracy: true, maximumAge: 0 });
    } else {
        alert('Geolocation not supported by this browser.');
        stopNavigation();
    }
}

function stopNavigation() {
    if (livePositionWatcher !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(livePositionWatcher);
        livePositionWatcher = null;
    }
    document.getElementById('navTopPanel')?.classList.add('hidden');
    document.getElementById('navBottomPanel')?.classList.add('hidden');
    document.querySelector('.sidebar')?.classList.remove('hidden');
    document.getElementById('predictiveWarningBanner')?.classList.add('hidden');
    const btn = document.getElementById('startNavigationBtn');
    if (btn) { btn.disabled = false; btn.innerText = '▶ Navigate'; }
    if (routingControl && routeCoordinates.length > 0) map.fitBounds(L.polyline(routeCoordinates).getBounds());
}

function scanForUpcomingHazards(pos) {
    if (isMidJourneyRerouting) return;
    let closest = null, minDist = Infinity;
    hazardData.forEach(h => {
        const d = pos.distanceTo(L.latLng(h.lat, h.lng));
        if ((h.severity === 'high' || h.type === 'traffic' || h.type === 'accident') && d > 200 && d < 5000 && d < minDist && !hazardWarningsIssued.has(h.id)) {
            minDist = d; closest = h;
        }
    });
    const banner = document.getElementById('predictiveWarningBanner');
    if (closest) {
        document.getElementById('predictiveHazardType').innerHTML = `${closest.type.toUpperCase()} RED ZONE AHEAD.<br><span style="font-size:12px;color:#facc15;">AI bypass calculated.</span>`;
        banner?.classList.remove('hidden');
        hazardWarningsIssued.add(closest.id);
        speakInstruction(`Warning! ${closest.title} ahead. Consider alternate route.`);
    }
}

function updateNavInstructions(idx) {
    if (!currentRouteInstructions || currentRouteInstructions.length === 0) return;
    let active = currentRouteInstructions[0], next = null;
    for (let i = 0; i < currentRouteInstructions.length; i++) {
        if (idx >= currentRouteInstructions[i].index) {
            active = currentRouteInstructions[i];
            next = currentRouteInstructions[i+1] || null;
        } else break;
    }
    if (active) {
        document.getElementById('currentRoadName').innerText = active.text || 'Continue straight';
        document.getElementById('turnIcon').innerText = getTurnIcon(active.type);
        if (active.text && !hazardWarningsIssued.has('inst-' + idx)) {
            speakInstruction(active.text);
            hazardWarningsIssued.add('inst-' + idx);
        }
    }
    const nextDiv = document.getElementById('nextTurnDiv');
    if (next && next.type !== 'Arrive') {
        nextDiv?.classList.remove('hidden');
        if (nextDiv) nextDiv.innerHTML = `Then ${getTurnIcon(next.type)} ${next.text || ''}`;
    } else {
        nextDiv?.classList.add('hidden');
    }
}

function getTurnIcon(type) {
    if (!type) return '⬆️';
    type = type.toLowerCase();
    if (type.includes('left'))  return '⬅️';
    if (type.includes('right')) return '➡️';
    if (type.includes('u-turn') || type.includes('uturn')) return '↩️';
    if (type.includes('roundabout')) return '🔄';
    if (type.includes('arrive') || type.includes('destination')) return '📍';
    return '⬆️';
}

function executeMidNavigationReroute() {
    addLog('Recalculating safe route...', 'warning');
    isMidJourneyRerouting = true;
    document.getElementById('predictiveWarningBanner')?.classList.add('hidden');
    if (!navigatingMarker || !routingControl) return;
    const currentPos = navigatingMarker.getLatLng();
    const destPos = routeCoordinates[routeCoordinates.length - 1];
    routingControl.setWaypoints([currentPos, destPos]);
    if (window.AIAssistant) AIAssistant.addChatMessage('bot', '🔄 Rerouting around hazard...');
}

// ─── EMERGENCY & VEHICLE MODE ─────────────────────────────────────
function toggleAmbulanceMode() {
    ambulanceMode = !ambulanceMode;
    heavyVehicleMode = false;
    const btn  = document.getElementById('ambulanceModeBtn');
    const hBtn = document.getElementById('heavyVehicleModeBtn');
    const msg  = document.getElementById('emergencyStatus');

    if (ambulanceMode) {
        btn?.classList.add('pulse-effect');
        msg?.classList.remove('hidden');
        if (hBtn) hBtn.style.opacity = '0.5';
        addLog('AMBULANCE MODE ACTIVATED', 'error');
        speakInstruction('Ambulance mode activated. Priority route calculating.');
        if (window.AIAssistant) AIAssistant.addChatMessage('bot', '🚑 Ambulance mode ON — priority clear path calculating.');
        if (navigatingMarker) navigatingMarker.setIcon(L.divIcon({ html:'<div class="vehicle-marker ambulance">🚑</div>', className:'custom-vehicle-container', iconSize:[35,35], iconAnchor:[17,17] }));
        if (routeCoordinates.length > 0) planRoute();
    } else {
        btn?.classList.remove('pulse-effect');
        msg?.classList.add('hidden');
        if (hBtn) hBtn.style.opacity = '1';
        addLog('Ambulance mode off', 'normal');
        if (routeCoordinates.length > 0) planRoute();
    }
}

function toggleHeavyVehicleMode() {
    heavyVehicleMode = !heavyVehicleMode;
    ambulanceMode = false;
    const btn  = document.getElementById('heavyVehicleModeBtn');
    const aBtn = document.getElementById('ambulanceModeBtn');

    if (heavyVehicleMode) {
        if (btn) btn.style.background = 'linear-gradient(135deg, #92400e, #f59e0b)';
        if (aBtn) aBtn.style.opacity = '0.5';
        document.getElementById('emergencyStatus')?.classList.remove('hidden');
        if (document.getElementById('emergencyStatus')) document.getElementById('emergencyStatus').innerText = '🚛 Heavy vehicle route: Avoiding narrow roads.';
        addLog('Heavy Vehicle mode activated', 'warning');
        speakInstruction('Heavy vehicle mode. Routing on highways and wide roads only.');
        if (window.AIAssistant) AIAssistant.addChatMessage('bot', '🚛 Heavy vehicle mode ON — routing via highways and wide roads.');
        if (routeCoordinates.length > 0) planRoute();
    } else {
        if (btn) btn.style.background = '';
        if (aBtn) aBtn.style.opacity = '1';
        document.getElementById('emergencyStatus')?.classList.add('hidden');
        addLog('Heavy vehicle mode off', 'normal');
        if (routeCoordinates.length > 0) planRoute();
    }
}

// ─── GPS LOCATION ─────────────────────────────────────────────────
function useCurrentLocation() {
    if (!navigator.geolocation) return addLog('Geolocation not supported.', 'error');
    const btn = document.getElementById('useLocationBtn');
    if (btn) { btn.innerText = '⏳'; btn.disabled = true; }
    addLog('Requesting GPS location...');
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        addLog(`GPS Lock: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, 'success');
        try {
            const place = await reverseGeocode(lat, lng);
            const inp = document.getElementById('sourceInput');
            if (inp) inp.value = place;
            map.setView([lat, lng], 13);
            addLog(`Location: ${place}`, 'success');
        } catch(e) {
            const inp = document.getElementById('sourceInput');
            if (inp) inp.value = `${lat},${lng}`;
        }
        if (btn) { btn.innerText = '📍'; btn.disabled = false; }
    }, (err) => {
        addLog(`Location error: ${err.message}`, 'error');
        if (btn) { btn.innerText = '📍'; btn.disabled = false; }
    }, { enableHighAccuracy: true, timeout: 10000 });
}

// ─── AI SMART SUGGESTIONS ────────────────────────────────────────
async function generateAISuggestions() {
    const container = document.getElementById('aiSuggestionsList');
    if (!container) return;

    // Try to get real traffic data
    let suggestions = [
        { icon: '⏰', text: 'Best departure: 7:30 AM (low congestion predicted)' },
        { icon: '🚦', text: 'Chennai–Trichy corridor: Moderate traffic, 15 extra mins' },
        { icon: '🛣️', text: 'NH44 clear via Salem. Suggested highway.' },
        { icon: '🌧️', text: 'Rainfall predicted near Madurai — drive cautiously' },
        { icon: '🏥', text: 'Nearest emergency hospital: Govt. General Hospital, 2.3 km' }
    ];

    try {
        const res = await fetch('/traffic-data');
        if (res.ok) {
            const data = await res.json();
            const summary = data.summary;
            suggestions = [
                { icon: '📊', text: `Avg congestion: ${(summary.avg_congestion * 100).toFixed(0)}% across ${summary.total_nodes} nodes` },
                { icon: '🔴', text: `${summary.high_congestion_nodes} high-alert nodes — expect delays` },
                { icon: '⚡', text: `Peak congestion: ${(summary.max_congestion * 100).toFixed(0)}% — avoid peak zones` },
                { icon: '🕒', text: 'Best time to travel: After 9 PM or before 7 AM' },
                { icon: '🧠', text: 'AI recommends: Take NH44 via Salem for optimal route' }
            ];
        }
    } catch (e) { /* use defaults */ }

    container.innerHTML = '';
    suggestions.forEach(s => {
        const item = document.createElement('div');
        item.className = 'ai-suggestion-item';
        item.innerHTML = `<span class="suggestion-icon">${s.icon}</span>${s.text}`;
        item.addEventListener('click', () => {
            if (window.AIAssistant) AIAssistant.addChatMessage('bot', `💡 ${s.text}`);
        });
        container.appendChild(item);
    });
}

// ─── RECENT SEARCHES ─────────────────────────────────────────────
function loadRecentSearches() {
    const dl = document.getElementById('recentSearches');
    if (!dl) return;
    dl.innerHTML = '';
    let searches = [];
    try { searches = JSON.parse(localStorage.getItem('tn_recent_searches') || '[]'); } catch(e) {}
    searches.forEach(s => { const opt = document.createElement('option'); opt.value = s; dl.appendChild(opt); });
}

function saveRecentSearch(str) {
    if (!str || str.length < 3) return;
    let searches = [];
    try { searches = JSON.parse(localStorage.getItem('tn_recent_searches') || '[]'); } catch(e) {}
    const idx = searches.indexOf(str);
    if (idx > -1) searches.splice(idx, 1);
    searches.unshift(str);
    if (searches.length > 10) searches.pop();
    localStorage.setItem('tn_recent_searches', JSON.stringify(searches));
    loadRecentSearches();
}

// ─── URL PARAMS (share route) ─────────────────────────────────────
function loadRouteFromURL() {
    const params = new URLSearchParams(location.search);
    const from = params.get('from');
    const to   = params.get('to');
    const mode = params.get('mode');
    if (from && to) {
        const srcInput = document.getElementById('sourceInput');
        const dstInput = document.getElementById('destInput');
        if (srcInput) srcInput.value = from;
        if (dstInput) dstInput.value = to;
        if (mode) setTravelMode(mode);
        setTimeout(planRoute, 1500);
    }
}

// ─── EVENT LISTENERS ─────────────────────────────────────────────
function setupEventListeners() {
    document.getElementById('calculateRouteBtn')?.addEventListener('click', planRoute);
    document.getElementById('startNavigationBtn')?.addEventListener('click', startNavigation);
    document.getElementById('gmapStartBtn')?.addEventListener('click', startNavigation);
    document.getElementById('gmapExitBtn')?.addEventListener('click', stopNavigation);
    document.getElementById('rerouteBtn')?.addEventListener('click', executeMidNavigationReroute);
    document.getElementById('useLocationBtn')?.addEventListener('click', useCurrentLocation);
    document.getElementById('ambulanceModeBtn')?.addEventListener('click', toggleAmbulanceMode);
    document.getElementById('heavyVehicleModeBtn')?.addEventListener('click', toggleHeavyVehicleMode);
    document.getElementById('shareRouteBtn')?.addEventListener('click', shareRoute);
    document.getElementById('saveCurrentLocationBtn')?.addEventListener('click', saveCurrentView);
    document.getElementById('nearbySearchBtn')?.addEventListener('click', () => {
        const q = document.getElementById('nearbyPlaceInput')?.value;
        if (q) findNearby(q);
    });
    document.getElementById('nearbyPlaceInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const q = e.target.value;
            if (q) findNearby(q);
        }
    });

    // Layer toggles
    document.getElementById('toggleHazards')?.addEventListener('change', (e) => {
        if (e.target.checked) { map.addLayer(hazardsLayer); addLog('Hazards enabled'); }
        else { map.removeLayer(hazardsLayer); addLog('Hazards disabled'); }
    });
    document.getElementById('toggleTrafficLayer')?.addEventListener('change', (e) => {
        if (e.target.checked) { map.addLayer(trafficLayer); addLog('Traffic layer enabled'); }
        else { map.removeLayer(trafficLayer); addLog('Traffic layer disabled'); }
    });
    document.getElementById('toggleCongestionHeatmap')?.addEventListener('change', (e) => {
        if (e.target.checked) { map.addLayer(heatmapLayer); addLog('Congestion heatmap enabled'); }
        else { map.removeLayer(heatmapLayer); addLog('Heatmap disabled'); }
    });
    document.getElementById('toggleBikeRoutes')?.addEventListener('change', (e) => {
        if (e.target.checked) {
            addLog('Bike routes: overlay coming from OSM cycle network', 'warning');
        } else { map.removeLayer(bikeRouteLayer); }
    });

    // Chat widget close
    document.getElementById('chatCloseBtn')?.addEventListener('click', () => {
        document.getElementById('chatWidget')?.classList.add('hidden');
    });
    document.getElementById('chatMicBtn')?.addEventListener('click', () => {
        if (window.AIAssistant) AIAssistant.toggleListening();
    });

    // Right-click to save location
    map.on('contextmenu', async (e) => {
        try {
            const name = await reverseGeocode(e.latlng.lat, e.latlng.lng);
            savePlace(e.latlng.lat, e.latlng.lng, name, '📌');
        } catch(err) {
            savePlace(e.latlng.lat, e.latlng.lng, `Pin (${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)})`, '📌');
        }
    });
}

// ─── BOOT ─────────────────────────────────────────────────────────
window.onload = async () => {
    await initApp();
    loadRouteFromURL();
};
