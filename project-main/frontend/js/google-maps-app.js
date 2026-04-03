/**
 * Google Maps Style Traffic Prediction App
 */

const App = (() => {
    const API_BASE = '';
    let map = null;
    let allLocations = [];
    let selectedSource = null;
    let selectedDest = null;
    let currentVehicleType = 'normal';
    let routeLines = [];
    let trafficZones = [];
    let trafficMarkers = [];
    let nodeMarkers = {};
    let edgeLines = [];
    
    const COLORS = {
        highway: '#4285f4',
        main: '#9333ea',
        narrow: '#f97316',
        low: '#34a853',
        medium: '#fbbc04',
        high: '#ea4335',
        route: '#1a73e8'
    };
    
    // Toast Notification
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
    
    // API Calls
    async function fetchJSON(url, options = {}) {
        try {
            const response = await fetch(url, {
                headers: { 'Content-Type': 'application/json' },
                ...options
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'API Error');
            }
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            showToast('Failed to connect to backend', 'error');
            throw error;
        }
    }
    
    async function loadLocations() {
        try {
            const data = await fetchJSON(`${API_BASE}/nodes`);
            allLocations = data.nodes.map(node => ({
                id: node.id,
                name: node.name,
                type: node.type,
                searchText: `${node.name} ${node.id}`.toLowerCase()
            }));
            return allLocations;
        } catch (e) {
            console.error('Failed to load locations:', e);
            return [];
        }
    }
    
    async function getRoute(source, dest, vehicleType) {
        let endpoint = '/route';
        if (vehicleType === 'emergency') endpoint = '/route/emergency';
        else if (vehicleType === 'heavy') endpoint = '/route/heavy';
        
        return await fetchJSON(`${API_BASE}${endpoint}`, {
            method: 'POST',
            body: JSON.stringify({ source, target: dest })
        });
    }
    
    async function getTrafficData() {
        return await fetchJSON(`${API_BASE}/traffic-data`);
    }
    
    async function getGraphData() {
        return await fetchJSON(`${API_BASE}/graph`);
    }
    
    // Autocomplete
    function setupAutocomplete(inputId, dropdownId) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);
        const clearBtn = input.parentElement.querySelector('.clear-btn');
        
        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            
            if (!query) {
                dropdown.classList.remove('show');
                return;
            }
            
            const matches = allLocations.filter(loc => 
                loc.searchText.includes(query)
            );
            
            if (matches.length === 0) {
                dropdown.classList.remove('show');
                return;
            }
            
            dropdown.innerHTML = matches.map(loc => `
                <div class="autocomplete-item" data-id="${loc.id}" data-name="${loc.name}">
                    <span class="location-icon">📍</span>
                    <div class="location-text">
                        <div class="location-name">${loc.name}</div>
                        <div class="location-type">${loc.type} road • ${loc.id}</div>
                    </div>
                </div>
            `).join('');
            
            dropdown.classList.add('show');
            
            // Add click handlers
            dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
                item.addEventListener('click', () => {
                    const id = item.getAttribute('data-id');
                    const name = item.getAttribute('data-name');
                    input.value = name;
                    dropdown.classList.remove('show');
                    
                    if (inputId === 'sourceInput') {
                        selectedSource = id;
                    } else {
                        selectedDest = id;
                    }
                    
                    updateDirectionButton();
                });
            });
        });
        
        // Clear button
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                input.value = '';
                dropdown.classList.remove('show');
                if (inputId === 'sourceInput') {
                    selectedSource = null;
                } else {
                    selectedDest = null;
                }
                updateDirectionButton();
            });
        }
        
        // Close dropdown on outside click
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
    }
    
    function updateDirectionButton() {
        const btn = document.getElementById('getDirectionsBtn');
        btn.disabled = !selectedSource || !selectedDest || selectedSource === selectedDest;
    }
    
    // Map Functions
    function initMap() {
        map = L.map('traffic-map', {
            center: [11.1271, 78.6569],
            zoom: 7,
            zoomControl: true
        });
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);
        
        setTimeout(() => map.invalidateSize(), 200);
    }
    
    async function renderNetwork() {
        try {
            const [graphData, trafficData] = await Promise.all([
                getGraphData(),
                getTrafficData()
            ]);
            
            clearNetwork();
            
            const nodes = graphData.nodes;
            const edges = graphData.edges;
            const congestionData = trafficData.predictions;
            
            // Draw edges
            edges.forEach(edge => {
                const srcNode = nodes.find(n => n.id === edge.source);
                const dstNode = nodes.find(n => n.id === edge.target);
                
                if (srcNode && dstNode) {
                    const srcPos = [srcNode.lat, srcNode.lng];
                    const dstPos = [dstNode.lat, dstNode.lng];
                    
                    const line = L.polyline([srcPos, dstPos], {
                        color: '#e5e7eb',
                        weight: 2,
                        opacity: 0.6
                    }).addTo(map);
                    
                    edgeLines.push(line);
                }
            });
            
            // Draw nodes
            nodes.forEach(node => {
                const pos = [node.lat, node.lng];
                const cong = congestionData[node.id] || {};
                const congLevel = cong.traffic_level || 'low';
                const congValue = cong.congestion || 0;
                
                let color = COLORS[congLevel];
                let radius = congLevel === 'high' ? 10 : congLevel === 'medium' ? 8 : 6;
                
                const marker = L.circleMarker(pos, {
                    radius: radius,
                    fillColor: color,
                    color: 'white',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map);
                
                marker.bindPopup(`
                    <div style="font-family: Roboto, sans-serif;">
                        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 500;">${node.name}</h3>
                        <div style="font-size: 12px; color: #5f6368; margin-bottom: 4px;">${node.type} road</div>
                        <div style="font-size: 13px; color: ${color}; font-weight: 500;">
                            ${(congValue * 100).toFixed(0)}% congestion
                        </div>
                        ${cong.reason ? `<div style="font-size: 12px; color: #5f6368; margin-top: 6px; padding: 6px; background: #f8f9fa; border-radius: 4px;"><strong>Reason:</strong> ${cong.reason}</div>` : ''}
                    </div>
                `);
                
                nodeMarkers[node.id] = { marker, pos };
            });
            
            // Fit bounds
            const positions = nodes.map(n => [n.lat, n.lng]);
            if (positions.length > 0) {
                map.fitBounds(positions, { padding: [50, 50] });
            }
        } catch (error) {
            console.error('Failed to render network:', error);
        }
    }
    
    function clearNetwork() {
        Object.values(nodeMarkers).forEach(({ marker }) => map.removeLayer(marker));
        edgeLines.forEach(line => map.removeLayer(line));
        nodeMarkers = {};
        edgeLines = [];
    }
    
    function clearRoute() {
        routeLines.forEach(line => map.removeLayer(line));
        trafficZones.forEach(zone => map.removeLayer(zone));
        trafficMarkers.forEach(marker => map.removeLayer(marker));
        routeLines = [];
        trafficZones = [];
        trafficMarkers = [];
    }
    
    async function drawRoute(result) {
        clearRoute();
        
        if (!result.success || !result.path || result.path.length < 2) {
            showToast('Route not found', 'error');
            return;
        }
        
        const path = result.path;
        const positions = path.map(nodeId => nodeMarkers[nodeId]?.pos).filter(Boolean);
        
        if (positions.length === 0) {
            showToast('Unable to display route on map', 'error');
            return;
        }
        
        // Draw route line
        let color = COLORS.route;
        if (currentVehicleType === 'emergency') color = '#ea4335';
        else if (currentVehicleType === 'heavy') color = '#f97316';
        
        const routeLine = L.polyline(positions, {
            color: color,
            weight: 5,
            opacity: 0.8
        }).addTo(map);
        
        routeLines.push(routeLine);
        
        // Draw traffic zones
        if (result.traffic_warnings && result.traffic_warnings.length > 0) {
            result.traffic_warnings.forEach(warning => {
                const pos = [warning.position[0], warning.position[1]];
                let zoneColor = COLORS[warning.severity] || COLORS.medium;
                let radius = warning.severity === 'high' ? 12000 : 10000;
                
                const zone = L.circle(pos, {
                    color: zoneColor,
                    fillColor: zoneColor,
                    fillOpacity: 0.15,
                    opacity: 0.5,
                    weight: 2,
                    radius: radius
                }).addTo(map);
                
                trafficZones.push(zone);
                
                const warningMarker = L.marker(pos, {
                    icon: L.divIcon({
                        className: 'traffic-warning-marker',
                        html: `<div style="
                            background: ${zoneColor};
                            color: white;
                            width: 30px;
                            height: 30px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 16px;
                            border: 3px solid white;
                            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                        ">⚠️</div>`,
                        iconSize: [30, 30],
                        iconAnchor: [15, 15]
                    })
                }).addTo(map);
                
                warningMarker.bindPopup(`
                    <div style="font-family: Roboto, sans-serif; min-width: 200px;">
                        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 500; color: ${zoneColor};">⚠️ Traffic Alert</h3>
                        <div style="font-size: 13px; margin-bottom: 6px;"><strong>Location:</strong> ${warning.name}</div>
                        <div style="font-size: 13px; margin-bottom: 6px;"><strong>Severity:</strong> <span style="color: ${zoneColor}; text-transform: uppercase; font-weight: 500;">${warning.severity}</span></div>
                        <div style="font-size: 13px; margin-bottom: 6px;"><strong>Congestion:</strong> ${(warning.congestion * 100).toFixed(0)}%</div>
                        <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; font-size: 12px;"><strong>Reason:</strong> ${warning.reason}</div>
                    </div>
                `);
                
                trafficMarkers.push(warningMarker);
            });
        }
        
        // Start and end markers
        if (positions.length >= 2) {
            const startMarker = L.circleMarker(positions[0], {
                radius: 12,
                fillColor: '#34a853',
                color: 'white',
                weight: 3,
                fillOpacity: 1
            }).addTo(map);
            startMarker.bindTooltip('START', { permanent: true, direction: 'top' });
            routeLines.push(startMarker);
            
            const endMarker = L.circleMarker(positions[positions.length - 1], {
                radius: 12,
                fillColor: '#ea4335',
                color: 'white',
                weight: 3,
                fillOpacity: 1
            }).addTo(map);
            endMarker.bindTooltip('END', { permanent: true, direction: 'top' });
            routeLines.push(endMarker);
        }
        
        // Fit map to route
        map.fitBounds(positions, { padding: [100, 100] });
    }
    
    function displayRouteInfo(result) {
        const panel = document.getElementById('routeInfoPanel');
        const sidebar = document.getElementById('sidebar');
        
        if (!result.success) {
            panel.innerHTML = `
                <div style="padding: 16px; text-align: center; color: #5f6368;">
                    <div style="font-size: 48px; margin-bottom: 8px;">🚫</div>
                    <div style="font-size: 16px; font-weight: 500;">Route not found</div>
                    <div style="font-size: 14px; margin-top: 8px;">No path available between these locations</div>
                </div>
            `;
            sidebar.classList.add('show');
            return;
        }
        
        const stepsHTML = result.path_details ? result.path_details.map((step, idx) => `
            <li class="route-step">
                <div class="step-icon">${idx + 1}</div>
                <div class="step-content">
                    <div class="step-location">${step.name}</div>
                    <div class="step-detail">${step.type} road • ${(step.congestion * 100).toFixed(0)}% congestion</div>
                    ${step.reason ? `<div class="step-detail" style="color: #ea4335; margin-top: 2px;">⚠️ ${step.reason}</div>` : ''}
                </div>
            </li>
        `).join('') : '';
        
        const warningsHTML = result.traffic_warnings && result.traffic_warnings.length > 0 ? `
            <div class="traffic-warnings">
                <div class="warning-title">⚠️ Traffic Alerts (${result.traffic_warnings.length})</div>
                ${result.traffic_warnings.map(w => `
                    <div class="warning-item ${w.severity}">
                        <div class="warning-location">${w.name}</div>
                        <div class="warning-reason">${w.reason}</div>
                    </div>
                `).join('')}
            </div>
        ` : '';
        
        panel.innerHTML = `
            <div class="route-summary">
                <div class="distance">${result.distance} km</div>
                <div class="duration">Via ${result.path.length} locations</div>
            </div>
            
            ${warningsHTML}
            
            ${result.has_heavy_traffic ? '<button class="alt-routes-btn" id="altRoutesBtn">🔄 Show Alternative Routes</button>' : ''}
            
            <ul class="route-steps">
                ${stepsHTML}
            </ul>
        `;
        
        sidebar.classList.add('show');
    }
    
    // Event Handlers
    function setupEventHandlers() {
        // Vehicle selector
        document.querySelectorAll('.vehicle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.vehicle-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentVehicleType = btn.dataset.type;
            });
        });
        
        // Get directions
        document.getElementById('getDirectionsBtn').addEventListener('click', async () => {
            if (!selectedSource || !selectedDest) {
                showToast('Please select both starting point and destination', 'error');
                return;
            }
            
            if (selectedSource === selectedDest) {
                showToast('Starting point and destination must be different', 'error');
                return;
            }
            
            const btn = document.getElementById('getDirectionsBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="loading-spinner"></span> Finding route...';
            
            try {
                const result = await getRoute(selectedSource, selectedDest, currentVehicleType);
                await drawRoute(result);
                displayRouteInfo(result);
                showToast('Route found successfully!', 'success');
            } catch (error) {
                console.error('Route error:', error);
                showToast('Failed to find route. Please try again.', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = 'Get Directions';
            }
        });
        
        // Close sidebar
        document.getElementById('closeSidebar').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('show');
        });
        
        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            Auth.logout();
        });
    }
    
    // Initialize
    async function init() {
        console.log('🚦 Initializing Traffic Prediction System...');
        
        initMap();
        setupEventHandlers();
        
        await loadLocations();
        setupAutocomplete('sourceInput', 'sourceDropdown');
        setupAutocomplete('destInput', 'destDropdown');
        
        await renderNetwork();
        
        showToast('System ready!', 'success');
    }
    
    return { init };
})();

// Start on DOM ready
document.addEventListener('DOMContentLoaded', App.init);
