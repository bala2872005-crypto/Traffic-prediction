/**
 * Main Application Logic
 * Handles API communication, UI updates, and user interactions
 */

const App = (() => {
    const API_BASE = ''; // Use relative paths for same-origin requests
    let currentVehicleType = 'normal';
    let graphData = null;
    let trafficData = null;

    // ─── Toast Notifications ─────────────────────────────────────────────────

    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
            <span>${message}</span>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // ─── API Calls ───────────────────────────────────────────────────────────

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
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                showToast('Cannot connect to backend. Make sure the server is running on port 8000.', 'error');
            }
            throw error;
        }
    }

    async function loadGraph() {
        try {
            graphData = await fetchJSON(`${API_BASE}/graph`);
            return graphData;
        } catch (e) {
            console.error('Failed to load graph:', e);
            return null;
        }
    }

    async function loadTrafficData() {
        try {
            const data = await fetchJSON(`${API_BASE}/traffic-data`);
            trafficData = data.predictions;
            return data;
        } catch (e) {
            console.error('Failed to load traffic data:', e);
            return null;
        }
    }

    async function loadNodes() {
        try {
            return await fetchJSON(`${API_BASE}/nodes`);
        } catch (e) {
            console.error('Failed to load nodes:', e);
            return null;
        }
    }

    async function findRoute(source, target, vehicleType) {
        let endpoint = '/route';
        if (vehicleType === 'emergency') endpoint = '/route/emergency';
        else if (vehicleType === 'heavy') endpoint = '/route/heavy';

        return await fetchJSON(`${API_BASE}${endpoint}`, {
            method: 'POST',
            body: JSON.stringify({ source, target })
        });
    }

    async function getPredictions() {
        return await fetchJSON(`${API_BASE}/predict`, {
            method: 'POST',
            body: JSON.stringify({})
        });
    }

    // Store current route result for later use
    let currentRouteResult = null;

    // ─── UI Updates ──────────────────────────────────────────────────────────

    function updateStats(summary) {
        const avgEl = document.getElementById('statAvgCongestion');
        const maxEl = document.getElementById('statMaxCongestion');
        const highEl = document.getElementById('statHighNodes');
        const totalEl = document.getElementById('statTotalNodes');

        if (avgEl) avgEl.textContent = (summary.avg_congestion * 100).toFixed(1) + '%';
        if (maxEl) maxEl.textContent = (summary.max_congestion * 100).toFixed(1) + '%';
        if (highEl) highEl.textContent = summary.high_congestion_nodes;
        if (totalEl) totalEl.textContent = summary.total_nodes;
    }

    function updateCongestionList(predictions) {
        const list = document.getElementById('congestionList');
        if (!list) return;

        // Sort by congestion descending
        const sorted = Object.entries(predictions).sort(
            (a, b) => b[1].congestion - a[1].congestion
        );

        list.innerHTML = sorted.map(([nodeId, info]) => {
            const level = info.traffic_level;
            const percent = (info.congestion * 100).toFixed(1);

            return `
                <li class="congestion-item">
                    <div class="congestion-left">
                        <div class="node-badge ${level}">${nodeId}</div>
                        <div style="flex: 1;">
                            <div class="congestion-name">${info.name}</div>
                            <div class="congestion-type" style="display:inline-block;">${info.type.toUpperCase()}</div>
                            <div class="congestion-reason" style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">
                                <span style="font-weight:600;">Reason:</span> ${info.reason || 'Normal Flow'}
                            </div>
                        </div>
                    </div>
                    <div class="congestion-right">
                        <div class="congestion-bar-container">
                            <div class="congestion-bar ${level}" style="width:${percent}%"></div>
                        </div>
                        <div class="congestion-percent ${level}">${percent}%</div>
                    </div>
                </li>
            `;
        }).join('');
    }

    function populateNodeSelectors(nodes) {
        const sourceSelect = document.getElementById('sourceNode');
        const targetSelect = document.getElementById('targetNode');

        if (!sourceSelect || !targetSelect) return;

        const options = nodes.map(n =>
            `<option value="${n.id}">${n.id} — ${n.name} (${n.type})</option>`
        ).join('');

        sourceSelect.innerHTML = '<option value="">Select Source</option>' + options;
        targetSelect.innerHTML = '<option value="">Select Destination</option>' + options;

        // Set defaults
        if (nodes.length >= 2) {
            sourceSelect.value = nodes[0].id;
            targetSelect.value = nodes[nodes.length - 1].id;
        }
    }

    function displayRouteResult(result) {
        const container = document.getElementById('routeResult');
        if (!container) return;

        container.classList.add('show');

        if (!result.success) {
            container.innerHTML = `
                <div class="route-info" style="border-color: var(--accent-red);">
                    <div class="route-label">❌ Route Not Found</div>
                    <p style="color: var(--text-secondary); font-size: 0.85rem;">
                        ${result.error || 'Unable to find a path between these nodes.'}
                    </p>
                </div>
            `;
            return;
        }

        // Build path display
        const pathHTML = result.path.map((node, i) => {
            const html = `<span class="route-node">${node}</span>`;
            return i < result.path.length - 1
                ? html + '<span class="route-arrow">→</span>'
                : html;
        }).join('');

        // Traffic warnings section
        let warningsHTML = '';
        if (result.traffic_warnings && result.traffic_warnings.length > 0) {
            const warningsList = result.traffic_warnings.map(w => {
                const severityColor = w.severity === 'high' ? '#ef4444' : 
                                     w.severity === 'medium' ? '#f59e0b' : '#10b981';
                const icon = w.severity === 'high' ? '⚠️' : '⚡';
                return `
                    <div class="traffic-warning-item" style="
                        padding: 8px 12px;
                        background: rgba(15, 23, 42, 0.4);
                        border-radius: 6px;
                        border-left: 3px solid ${severityColor};
                        margin-bottom: 8px;
                    ">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 4px;">
                                    ${icon} ${w.name}
                                </div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">
                                    <strong>Reason:</strong> ${w.reason}
                                </div>
                            </div>
                            <div style="
                                padding: 4px 8px;
                                background: ${severityColor}22;
                                color: ${severityColor};
                                border-radius: 4px;
                                font-size: 0.7rem;
                                font-weight: 600;
                                text-transform: uppercase;
                            ">
                                ${w.severity}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            warningsHTML = `
                <div style="margin-top: 12px;">
                    <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; text-transform: uppercase;">
                        🚦 Traffic Alerts (${result.traffic_warnings.length})
                    </div>
                    ${warningsList}
                </div>
            `;
        }

        // Alternative routes button (shown only when heavy traffic detected)
        let alternativeHTML = '';
        if (result.has_heavy_traffic) {
            alternativeHTML = `
                <button class="btn-alternative-route" id="showAlternativesBtn" style="
                    width: 100%;
                    margin-top: 12px;
                    padding: 10px 16px;
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 8px;
                    color: #fca5a5;
                    font-weight: 600;
                    font-size: 0.85rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                ">
                    🔄 Find Alternative Routes
                </button>
            `;
        }

        // Features (for emergency/heavy)
        let featuresHTML = '';
        if (result.features && result.features.length > 0) {
            featuresHTML = `
                <div class="feature-tags">
                    ${result.features.map(f => `<span class="feature-tag">✓ ${f}</span>`).join('')}
                </div>
            `;
        }

        // Time saved (for emergency)
        let savedHTML = '';
        if (result.time_saved && result.time_saved > 0) {
            savedHTML = `
                <div class="route-meta-item" style="grid-column: 1 / -1; border-color: rgba(16,185,129,0.3);">
                    <div class="meta-label">⚡ Time Saved vs Normal Route</div>
                    <div class="meta-value" style="color: var(--accent-green);">${result.time_saved.toFixed(2)} units</div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="route-info">
                <div class="route-label">🛣️ ${result.algorithm}</div>
                <div class="route-path">${pathHTML}</div>
                <div class="route-meta">
                    <div class="route-meta-item">
                        <div class="meta-label">Distance</div>
                        <div class="meta-value">${result.distance}</div>
                    </div>
                    <div class="route-meta-item">
                        <div class="meta-label">Stops</div>
                        <div class="meta-value">${result.path.length}</div>
                    </div>
                    ${savedHTML}
                </div>
                ${featuresHTML}
                ${warningsHTML}
                ${alternativeHTML}
            </div>
        `;

        // Setup alternative routes button
        if (result.has_heavy_traffic) {
            const altBtn = document.getElementById('showAlternativesBtn');
            if (altBtn) {
                altBtn.addEventListener('click', () => showAlternativeRoutes());
            }
        }
    }

    // ─── Event Handlers ──────────────────────────────────────────────────────

    function setupVehicleSelector() {
        document.querySelectorAll('.vehicle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.vehicle-btn').forEach(b => {
                    b.classList.remove('active', 'emergency', 'heavy');
                });
                btn.classList.add('active');

                const type = btn.dataset.type;
                currentVehicleType = type;

                if (type === 'emergency') btn.classList.add('emergency');
                if (type === 'heavy') btn.classList.add('heavy');
            });
        });
    }

    function setupRouteButton() {
        const btn = document.getElementById('findRouteBtn');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            const source = document.getElementById('sourceNode').value;
            const target = document.getElementById('targetNode').value;

            if (!source || !target) {
                showToast('Please select both source and destination nodes.', 'error');
                return;
            }

            if (source === target) {
                showToast('Source and destination must be different.', 'error');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Finding Route...';

            try {
                const result = await findRoute(source, target, currentVehicleType);
                currentRouteResult = result; // Store for later use
                displayRouteResult(result);

                if (result.success) {
                    const routeType = currentVehicleType === 'emergency' ? 'emergency' :
                                     currentVehicleType === 'heavy' ? 'heavy' : 'normal';
                    
                    // Pass traffic warnings to map for visualization
                    const trafficWarnings = result.traffic_warnings || [];
                    MapModule.drawRoute(result.path, routeType, trafficWarnings);
                    
                    // Show success message with traffic info
                    if (trafficWarnings.length > 0) {
                        showToast(`Route found with ${trafficWarnings.length} traffic alert(s)!`, 'info');
                    } else {
                        showToast(`Route found: ${result.path.join(' → ')}`, 'success');
                    }
                }
            } catch (error) {
                showToast('Failed to find route. Check backend connection.', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '🔍 Find Optimal Route';
            }
        });
    }

    function setupRefreshButton() {
        const btn = document.getElementById('refreshBtn');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Refreshing...';

            await refreshData();

            btn.disabled = false;
            btn.innerHTML = '🔄 Refresh Predictions';
            showToast('Traffic data refreshed!', 'success');
        });
    }

    function setupClearRouteButton() {
        const btn = document.getElementById('clearRouteBtn');
        if (!btn) return;

        btn.addEventListener('click', () => {
            MapModule.clearRoutes();
            const container = document.getElementById('routeResult');
            if (container) {
                container.classList.remove('show');
                container.innerHTML = '';
            }
            showToast('Route cleared.', 'info');
        });
    }

    // ─── Data Refresh ────────────────────────────────────────────────────────

    async function refreshData() {
        const trafficResponse = await loadTrafficData();
        if (trafficResponse) {
            updateStats(trafficResponse.summary);
            updateCongestionList(trafficResponse.predictions);
            ChartsModule.renderCongestionChart(trafficResponse.predictions);

            if (graphData) {
                MapModule.renderNetwork(graphData, trafficResponse.predictions);
            }
        }
    }

    // ─── Initialization ──────────────────────────────────────────────────────

    async function init() {
        console.log('🚦 Initializing AI Traffic Prediction System...');

        // Initialize map
        MapModule.init();

        // Setup event handlers
        setupVehicleSelector();
        setupRouteButton();
        setupRefreshButton();
        setupClearRouteButton();

        // Load data
        try {
            // Load graph
            const graph = await loadGraph();
            if (!graph) {
                showToast('Backend not available. Please start the FastAPI server.', 'error');
                return;
            }

            // Load nodes for selectors
            const nodesData = await loadNodes();
            if (nodesData) {
                populateNodeSelectors(nodesData.nodes);
            }

            // Load traffic data and render
            await refreshData();

            // Traffic Trends chart removed to clean up UI

            showToast('System initialized successfully!', 'success');

            // Auto-refresh every 30 seconds
            setInterval(refreshData, 30000);

        } catch (error) {
            console.error('Initialization error:', error);
            showToast('Failed to connect to backend server.', 'error');
        }
    }

    return { init };
})();

// Start on DOM ready
document.addEventListener('DOMContentLoaded', App.init);
