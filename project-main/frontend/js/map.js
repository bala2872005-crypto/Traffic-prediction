/**
 * Map Module - Leaflet Map Integration
 * Renders road network, congestion overlay, and computed routes
 */

const MapModule = (() => {
    let map = null;
    let nodeMarkers = {};
    let edgeLines = [];
    let routeLines = [];
    let nodePositions = {};

    // Map tile styles
    const DARK_TILE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

    // Colors
    const COLORS = {
        highway: '#3b82f6',
        main: '#8b5cf6',
        narrow: '#f59e0b',
        low: '#10b981',
        medium: '#f59e0b',
        high: '#ef4444',
        route: '#06b6d4',
        routeAlt: '#8b5cf6',
        emergency: '#ef4444',
        heavy: '#f59e0b'
    };

    /**
     * Initialize the Leaflet map
     */
    function init() {
        map = L.map('traffic-map', {
            center: [11.1271, 78.6569], // Tamil Nadu center
            zoom: 7, // Zoom level to see the entire state
            zoomControl: true,
            attributionControl: false
        });

        L.tileLayer(DARK_TILE, {
            attribution: TILE_ATTRIBUTION,
            maxZoom: 19
        }).addTo(map);

        // Add attribution in bottom-right
        L.control.attribution({
            position: 'bottomright',
            prefix: false
        }).addTo(map);

        // Fix map rendering after container is ready
        setTimeout(() => map.invalidateSize(), 200);
    }

    /**
     * Render the road network graph on the map
     */
    function renderNetwork(graphData, congestionData = null) {
        // Clear existing
        clearNetwork();

        const nodes = graphData.nodes;
        const edges = graphData.edges;

        // Store node positions
        nodes.forEach(node => {
            nodePositions[node.id] = [node.lat, node.lng];
        });

        // Draw edges first (so they appear behind nodes)
        edges.forEach(edge => {
            const srcPos = nodePositions[edge.source];
            const dstPos = nodePositions[edge.target];

            if (srcPos && dstPos) {
                // Determine edge color based on congestion
                let edgeColor = '#475569';
                let edgeWeight = 2;

                if (congestionData) {
                    const srcCong = congestionData[edge.source]?.congestion || 0;
                    const dstCong = congestionData[edge.target]?.congestion || 0;
                    const avgCong = (srcCong + dstCong) / 2;

                    if (avgCong > 0.6) {
                        edgeColor = COLORS.high;
                        edgeWeight = 4;
                    } else if (avgCong > 0.3) {
                        edgeColor = COLORS.medium;
                        edgeWeight = 3;
                    } else {
                        edgeColor = COLORS.low;
                        edgeWeight = 2;
                    }
                }

                const line = L.polyline([srcPos, dstPos], {
                    color: edgeColor,
                    weight: edgeWeight,
                    opacity: 0.6,
                    dashArray: null
                }).addTo(map);

                edgeLines.push(line);
            }
        });

        // Draw nodes
        nodes.forEach(node => {
            const pos = [node.lat, node.lng];
            let color = COLORS[node.type] || COLORS.main;
            let radius = 10;
            let congLevel = 'low';
            let congValue = 0;

            if (congestionData && congestionData[node.id]) {
                const cong = congestionData[node.id];
                congValue = cong.congestion;
                congLevel = cong.traffic_level;

                if (congLevel === 'high') {
                    color = COLORS.high;
                    radius = 14;
                } else if (congLevel === 'medium') {
                    color = COLORS.medium;
                    radius = 12;
                } else {
                    color = COLORS.low;
                    radius = 10;
                }
            }

            // Create circle marker
            const marker = L.circleMarker(pos, {
                radius: radius,
                fillColor: color,
                color: 'rgba(255,255,255,0.3)',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.85
            }).addTo(map);

            // Create popup
            const roadTypeBg = node.type === 'highway' ? 'rgba(59,130,246,0.2)' :
                               node.type === 'narrow' ? 'rgba(245,158,11,0.2)' : 'rgba(139,92,246,0.2)';
            const roadTypeColor = node.type === 'highway' ? '#3b82f6' :
                                  node.type === 'narrow' ? '#f59e0b' : '#8b5cf6';
            const congColor = congLevel === 'high' ? '#ef4444' :
                              congLevel === 'medium' ? '#f59e0b' : '#10b981';

            marker.bindPopup(`
                <div class="popup-content">
                    <h3>📍 ${node.name}</h3>
                    <span class="popup-type" style="background:${roadTypeBg};color:${roadTypeColor}">${node.type.toUpperCase()}</span>
                    <div class="popup-congestion" style="color:${congColor}; margin-top:6px;">
                         Congestion: ${(congValue * 100).toFixed(1)}% (${congLevel.toUpperCase()})
                    </div>
                    <div class="popup-reason" style="color:#d1d5db; font-size:0.8rem; margin-top:6px; padding:4px 8px; background:rgba(255,255,255,0.05); border-radius:4px; border-left:3px solid ${congColor}">
                        <strong>AI Forecast Reason:</strong> ${cong.reason || 'Normal Flow'}
                    </div>
                    <div style="color:#94a3b8;font-size:0.72rem;margin-top:4px;">Node: ${node.id}</div>
                </div>
            `, { className: 'custom-popup' });

            // Add label
            const label = L.tooltip({
                permanent: true,
                direction: 'top',
                offset: [0, -12],
                className: 'node-label'
            }).setContent(`<span style="
                background:rgba(10,14,26,0.9);
                color:white;
                padding:2px 6px;
                border-radius:4px;
                font-size:11px;
                font-weight:600;
                font-family:'JetBrains Mono',monospace;
                border:1px solid ${color};
            ">${node.id}</span>`);

            marker.bindTooltip(label);
            nodeMarkers[node.id] = marker;
        });

        // Fit map to bounds
        const allPositions = Object.values(nodePositions);
        if (allPositions.length > 0) {
            map.fitBounds(allPositions, { padding: [40, 40] });
        }
    }

    /**
     * Draw a route on the map
     */
    function drawRoute(path, type = 'normal') {
        clearRoutes();

        if (!path || path.length < 2) return;

        const positions = path.map(nodeId => nodePositions[nodeId]).filter(Boolean);

        let color = COLORS.route;
        let weight = 5;
        let dashArray = null;

        if (type === 'emergency') {
            color = COLORS.emergency;
            weight = 6;
            dashArray = '10, 6';
        } else if (type === 'heavy') {
            color = COLORS.heavy;
            weight = 7;
            dashArray = '15, 5';
        }

        // Animated route line
        const routeLine = L.polyline(positions, {
            color: color,
            weight: weight,
            opacity: 0.9,
            dashArray: dashArray,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);

        // Glow effect
        const glowLine = L.polyline(positions, {
            color: color,
            weight: weight + 6,
            opacity: 0.2,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);

        routeLines.push(routeLine, glowLine);

        // Highlight start and end nodes
        if (path.length >= 2) {
            const startPos = nodePositions[path[0]];
            const endPos = nodePositions[path[path.length - 1]];

            if (startPos) {
                const startMarker = L.circleMarker(startPos, {
                    radius: 16,
                    fillColor: '#10b981',
                    color: 'white',
                    weight: 3,
                    fillOpacity: 0.9
                }).addTo(map);
                startMarker.bindTooltip('START', {
                    permanent: true,
                    direction: 'bottom',
                    className: 'route-label'
                });
                routeLines.push(startMarker);
            }

            if (endPos) {
                const endMarker = L.circleMarker(endPos, {
                    radius: 16,
                    fillColor: '#ef4444',
                    color: 'white',
                    weight: 3,
                    fillOpacity: 0.9
                }).addTo(map);
                endMarker.bindTooltip('END', {
                    permanent: true,
                    direction: 'bottom',
                    className: 'route-label'
                });
                routeLines.push(endMarker);
            }
        }

        // Fit map to route
        map.fitBounds(positions, { padding: [60, 60] });
    }

    /**
     * Clear route overlays
     */
    function clearRoutes() {
        routeLines.forEach(line => map.removeLayer(line));
        routeLines = [];
    }

    /**
     * Clear network overlays
     */
    function clearNetwork() {
        Object.values(nodeMarkers).forEach(m => map.removeLayer(m));
        edgeLines.forEach(l => map.removeLayer(l));
        nodeMarkers = {};
        edgeLines = [];
        nodePositions = {};
    }

    /**
     * Get node positions (for external use)
     */
    function getNodePositions() {
        return nodePositions;
    }

    /**
     * Invalidate map size (call after container resize)
     */
    function resize() {
        if (map) map.invalidateSize();
    }

    return {
        init,
        renderNetwork,
        drawRoute,
        clearRoutes,
        getNodePositions,
        resize
    };
})();
