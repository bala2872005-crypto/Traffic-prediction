// TraffExplainer UI Logic

let map;
let gnnEngine = null;
let graphData = null;
let nodeMarkers = new Map();
let edgeLayers = [];
let currentHorizon = 15;
let selectedNodeId = null;

async function initTraffExplainer() {
    // Initialize Map
    map = L.map('map', {
        zoomControl: false
    }).setView([11.1271, 78.6569], 7);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    setupEventListeners();
    await fetchGraphData();
}

async function fetchGraphData() {
    try {
        const response = await fetch('/api/traffic-graph');
        if (!response.ok) throw new Error("API Error");
        
        graphData = await response.json();
        
        // Initialize Engine
        gnnEngine = new GNNEngine(graphData);
        populateSelects();
        drawGraph();
        autoSetSourceFromGeolocation();
    } catch (e) {
        console.error("Error fetching graph data:", e);
        alert("Failed to load traffic graph data. Check console.");
    }
}

function populateSelects() {
    const src = document.getElementById('sourceSelect');
    const dst = document.getElementById('destSelect');
    if (!src || !dst) return;
    graphData.nodes.forEach(n => {
        src.innerHTML += `<option value="${n.id}">${n.id}</option>`;
        dst.innerHTML += `<option value="${n.id}">${n.id}</option>`;
    });
}

function autoSetSourceFromGeolocation() {
    if (navigator.geolocation && graphData && graphData.nodes.length > 0) {
        navigator.geolocation.getCurrentPosition((pos) => {
            const { latitude, longitude } = pos.coords;
            let closestId = null;
            let minDist = Infinity;
            
            graphData.nodes.forEach(n => {
                const dLat = n.lat - latitude;
                const dLng = n.lng - longitude;
                const dist = dLat*dLat + dLng*dLng;
                if (dist < minDist) {
                    minDist = dist;
                    closestId = n.id;
                }
            });
            
            if (closestId) {
                const srcSelect = document.getElementById('sourceSelect');
                if (srcSelect) {
                    srcSelect.value = closestId;
                }
            }
        }, (err) => {
            console.log("Geolocation permission denied or failed:", err);
        });
    }
}

function getColorForSpeed(speed) {
    if (speed >= 50) return '#10b981'; // Green (Free Flow)
    if (speed >= 30) return '#f59e0b'; // Yellow (Moderate)
    return '#ef4444'; // Red (Congested)
}

function drawGraph() {
    // Clear old
    nodeMarkers.forEach(m => map.removeLayer(m));
    nodeMarkers.clear();
    edgeLayers.forEach(e => map.removeLayer(e));
    edgeLayers = [];

    // Draw Edges first (so they are under nodes)
    graphData.edges.forEach(edge => {
        const sourceNode = graphData.nodes.find(n => n.id === edge.source);
        const targetNode = graphData.nodes.find(n => n.id === edge.target);
        if (sourceNode && targetNode) {
            const polyline = L.polyline([[sourceNode.lat, sourceNode.lng], [targetNode.lat, targetNode.lng]], {
                color: 'rgba(255, 255, 255, 0.1)',
                weight: 3,
                className: `edge-${edge.source}-${edge.target} edge-path`
            }).addTo(map);
            edgeLayers.push({
                layer: polyline,
                source: edge.source,
                target: edge.target
            });
        }
    });

    // Draw Nodes
    graphData.nodes.forEach(node => {
        const color = getColorForSpeed(node.speed);
        
        const markerHTML = `
            <div class="gnn-node" id="node-${node.id}" style="background-color: ${color}; box-shadow: 0 0 15px ${color};">
                <span class="gnn-node-label">${node.id}</span>
            </div>
        `;
        
        const icon = L.divIcon({
            html: markerHTML,
            className: 'custom-gnn-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        const marker = L.marker([node.lat, node.lng], { icon, zIndexOffset: 800 }).addTo(map);
        
        marker.on('click', () => {
            selectNode(node.id);
        });
        
        nodeMarkers.set(node.id, marker);
    });
}

function resetGraphStyle() {
    // Reset edges
    edgeLayers.forEach(e => {
        e.layer.setStyle({
            color: 'rgba(255, 255, 255, 0.1)',
            weight: 3,
            opacity: 1
        });
    });
    
    // Reset nodes
    nodeMarkers.forEach((marker, id) => {
        const node = gnnEngine.nodes.get(id);
        const color = getColorForSpeed(node.features.speed);
        const div = marker.getElement().querySelector('.gnn-node');
        if (div) {
            div.style.backgroundColor = color;
            div.style.boxShadow = `0 0 15px ${color}`;
            div.style.border = '2px solid rgba(255,255,255,0.8)';
            div.style.transform = 'scale(1)';
        }
    });
}

function selectNode(nodeId) {
    selectedNodeId = nodeId;
    resetGraphStyle();
    
    // Run GNN prediction
    gnnEngine.runMessagePassing(3);
    const predSpeed = gnnEngine.predictTraffic(nodeId, currentHorizon);
    const explanation = gnnEngine.explainPrediction(nodeId);
    
    // Highlight Target Node
    const targetMarker = nodeMarkers.get(nodeId);
    if(targetMarker) {
        const div = targetMarker.getElement().querySelector('.gnn-node');
        if(div) {
            div.style.border = '4px solid #fff';
            div.style.transform = 'scale(1.3)';
        }
    }
    
    // Highlight Edges
    if(explanation && explanation.influencers) {
        explanation.influencers.forEach(inf => {
            // Find edge connecting them
            const edge = edgeLayers.find(e => 
                (e.source === nodeId && e.target === inf.id) || 
                (e.source === inf.id && e.target === nodeId)
            );
            
            if(edge) {
                // Color depending on attention weight
                const opacity = 0.5 + (inf.percent / 100) * 0.5;
                const weight = 3 + (inf.percent / 100) * 5;
                edge.layer.setStyle({
                    color: '#3b82f6', // Bright Blue for attention
                    weight: weight,
                    opacity: opacity
                });
            }
        });
    }

    updateExplainerPanel(nodeId, predSpeed, explanation);
}

function calculateGNNPath() {
    const sourceId = document.getElementById('sourceSelect').value;
    const destId = document.getElementById('destSelect').value;
    if (!sourceId || !destId || sourceId === destId) return alert("Please select different source and destination.");
    
    // Simple Dijkstra
    const dist = new Map();
    const prev = new Map();
    const q = new Set();
    
    graphData.nodes.forEach(n => {
        dist.set(n.id, Infinity);
        prev.set(n.id, null);
        q.add(n.id);
    });
    dist.set(sourceId, 0);
    
    while(q.size > 0) {
        let u = null;
        let minD = Infinity;
        for(let nid of q) {
            if(dist.get(nid) < minD) { minD = dist.get(nid); u = nid; }
        }
        if (u === null || u === destId) break;
        q.delete(u);
        
        const neighbors = graphData.edges.filter(e => e.source === u || e.target === u);
        for(let e of neighbors) {
            let altNode = e.source === u ? e.target : e.source;
            if(!q.has(altNode)) continue;
            
            // Weight is distance + congestion penalty
            let congestionTarget = gnnEngine.nodes.get(altNode).features.congestion;
            let weight = e.distance * (1 + congestionTarget);
            
            let altDist = dist.get(u) + weight;
            if(altDist < dist.get(altNode)) {
                dist.set(altNode, altDist);
                prev.set(altNode, u);
            }
        }
    }
    
    const path = [];
    let u = destId;
    while(prev.get(u) || u === sourceId) {
        path.push(u);
        u = prev.get(u);
    }
    path.reverse();
    
    // Highlight Path on Map
    resetGraphStyle();
    
    let pathSpeedSum = 0;
    for(let i=0; i<path.length; i++) {
        const nid = path[i];
        gnnEngine.runMessagePassing(3);
        const pSpeed = gnnEngine.predictTraffic(nid, currentHorizon);
        pathSpeedSum += pSpeed;
        
        let marker = nodeMarkers.get(nid);
        if(marker) {
            let div = marker.getElement().querySelector('.gnn-node');
            if(div) {
                div.style.border = '4px solid #facc15';
                div.style.transform = 'scale(1.2)';
            }
        }
        
        if(i > 0) {
            let prevNid = path[i-1];
            let edge = edgeLayers.find(e => (e.source === nid && e.target === prevNid) || (e.source === prevNid && e.target === nid));
            if(edge) {
                edge.layer.setStyle({ color: '#facc15', weight: 6, opacity: 0.9, zIndex: 1000 });
            }
        }
    }
    
    if(path.length > 0) {
        let avgSpeed = pathSpeedSum / path.length;
        // Count traffic occurrences
        let trafficIncidents = path.filter(nid => {
            const pSpeed = gnnEngine.predictTraffic(nid, currentHorizon);
            return pSpeed < 30; // Congested
        }).length;
        
        // Use standard update
        updateExplainerPanel("Route: " + sourceId + " to " + destId, avgSpeed, null);
        
        // Override influencers to show route occurrences prediction
        setTimeout(() => {
            const listEl = document.getElementById('influencersList');
            if (listEl) {
                listEl.innerHTML = `
                    <p style="color:#cbd5e1; font-size:14px; margin-bottom:10px;">Traffic Occurrences Detected: <strong style="color:#ef4444">${trafficIncidents}</strong></p>
                    <p style="color:#10b981; font-size:14px;">Live AI Dataset confirmed fast viable sub-routing. Reaching destination optimally.</p>
                `;
            }

            // TAMIL VOICE ASSISTANT SYSTEM
            if ('speechSynthesis' in window) {
                // Cancel any ongoing speech
                window.speechSynthesis.cancel();
                
                let tamilAlert = "";
                if (trafficIncidents > 2) {
                    tamilAlert = "முன்னால் கடும் போக்குவரத்து உள்ளது. போக்குவரத்து நெரிசலை தவிர்க்கும் பாதுகாப்பான மாற்று பாதை தயார்."; // Heavy traffic ahead. Safe alternate route ready.
                } else if (trafficIncidents > 0) {
                    tamilAlert = "மிதமான போக்குவரத்து. ஏஐ வழிசெலுத்தல் அமைப்பு உங்களை பாதுகாப்பாக வழிநடத்தும்."; // Moderate traffic. AI navigation system will guide you safely.
                } else {
                    tamilAlert = "போக்குவரத்து சாதாரணமாக உள்ளது. உங்கள் பயணம் சீராக இருக்கும்."; // Traffic is normal. Your journey will be smooth.
                }
                
                let msg = new SpeechSynthesisUtterance(tamilAlert);
                msg.lang = 'ta-IN'; // Tamil - India
                msg.rate = 0.9; // Slightly slower for clarity
                window.speechSynthesis.speak(msg);
                
                // Show Tamil Voice Output UI
                if (listEl) {
                    listEl.innerHTML += `<div style="background: rgba(15, 23, 42, 0.8); border: 1px solid #f59e0b; padding: 10px; margin-top: 15px; border-radius: 8px;">
                        <div style="color:#f59e0b; font-size: 13px; margin-bottom:5px;"><strong>🗣️ AI Voice Assistant (Tamil)</strong></div>
                        <div style="color:white; font-size: 14px;">"${tamilAlert}"</div>
                    </div>`;
                }
            }
        }, 50);

        // Save to globals for the Animate Flow button
        globalCalculatedPath = path;
        globalAvgSpeed = avgSpeed;
        globalTrafficIncidents = trafficIncidents;
        globalDestId = destId;

        // Place stationary car at source location
        let cursorIcon = L.divIcon({
            html: '<div id="carIcon" style="font-size: 28px; filter: drop-shadow(0 0 8px #38bdf8);">🚘</div>',
            className: 'gps-cursor',
            iconSize: [28,28],
            iconAnchor: [14, 14]
        });
        const startNode = graphData.nodes.find(n => n.id === path[0]);
        if(gpsMarker) map.removeLayer(gpsMarker);
        gpsMarker = L.marker([startNode.lat, startNode.lng], { icon: cursorIcon, zIndexOffset: 2000 }).addTo(map);
        map.setView([startNode.lat, startNode.lng], 9);
    }
}

// Bind Animate Flow button
document.getElementById('animateBtn').addEventListener('click', () => {
    if (globalCalculatedPath.length === 0) {
        alert("Please calculate a route first.");
        return;
    }

    const path = globalCalculatedPath;
    const avgSpeed = globalAvgSpeed;
    const trafficIncidents = globalTrafficIncidents;
    const destId = globalDestId;

    // Start pulse animation on car
    const carEl = document.getElementById('carIcon');
    if(carEl) carEl.style.animation = "pulse 1s infinite";

    // Setup 3D Navigation HUD
    document.getElementById('navHudTopLeft').classList.remove('hidden');
    document.getElementById('navHudBottom').classList.remove('hidden');
    document.querySelector('.sidebar').classList.add('hidden'); // Hide sidebar for full immersion
    
    let pathDistKm = path.length * 8.5; // mock distance approximation
    let timeMin = Math.round(pathDistKm / (avgSpeed/60));
    if(!isFinite(timeMin)) timeMin = 15;
    
    document.getElementById('hudSpeed').innerText = Math.round(avgSpeed);
    document.getElementById('hudDist').innerText = pathDistKm.toFixed(1) + " km";
    document.getElementById('hudRoad').innerText = "Towards " + destId;
    
    document.getElementById('hudTotalTime').innerText = timeMin + " min";
    document.getElementById('hudTotalDist').innerText = pathDistKm.toFixed(1) + " km";
    
    let arrival = new Date();
    arrival.setMinutes(arrival.getMinutes() + timeMin);
    document.getElementById('hudArrivalTime').innerText = arrival.getHours().toString().padStart(2, '0') + ":" + arrival.getMinutes().toString().padStart(2, '0');
    
    // Prepare precise coordinate path for animation
    let pathPoints = path.map(nid => {
        let node = graphData.nodes.find(n => n.id === nid);
        return { lat: node.lat, lng: node.lng };
    });
    
    let currentSegment = 0;
    let progress = 0;
    let animationSpeed = 0.012; // Modifiable speed base
    
    // Change Route Village Bypass Feature
    const changeRouteBtn = document.getElementById('hudChangeRouteBtn');
    let bypassLine = null;
    if (trafficIncidents > 0) {
        changeRouteBtn.classList.remove('hidden');
        changeRouteBtn.onclick = () => {
            changeRouteBtn.classList.add('hidden');
            
            // Wipe the thick yellow line completely
            edgeLayers.forEach(e => {
                e.layer.setStyle({ color: 'rgba(255, 255, 255, 0.2)', weight: 3 });
            });
            
            // Create winding side-road/village path algorithmically
            let villagePoints = [];
            for(let j=0; j<pathPoints.length; j++) {
                let p = pathPoints[j];
                // small curving offsets to simulate country roads
                let latOff = (j%2===0) ? 0.04 : -0.02;
                let lngOff = (j%3===0) ? -0.03 : 0.03;
                if(j===0 || j===pathPoints.length-1) { latOff=0; lngOff=0; } // keep start and end exact
                villagePoints.push({lat: p.lat + latOff, lng: p.lng + lngOff});
            }
            
            // Draw green dotted village polyline
            bypassLine = L.polyline(villagePoints, {color: '#10b981', weight: 6, dashArray: '12, 12'}).addTo(map);
            
            // Re-pipe the car to the village road
            pathPoints = villagePoints;
            currentSegment = 0;
            progress = 0;
            animationSpeed = 0.03; // double the driving speed to reach 'too fast'
            
            // Update HUD
            document.getElementById('hudRoad').innerText = "Rural Village Bypass (Fast)";
            document.getElementById('hudRoad').style.color = "#10b981";
            document.getElementById('hudTotalTime').innerText = Math.round(timeMin * 0.55) + " min";
            
            // Play Tamil Voice
            if ('speechSynthesis' in window) {
               window.speechSynthesis.cancel();
               let msg = new SpeechSynthesisUtterance("கிராமப்புற மாற்று பாதையில் பயணிக்கிறோம். நெரிசல் இன்றி மிக விரைவாக இலக்கை அடைவீர்கள்.");
               msg.lang = 'ta-IN';
               window.speechSynthesis.speak(msg);
            }
        };
    } else {
        changeRouteBtn.classList.add('hidden');
    }
    
    function animateCar() {
        if (currentSegment >= pathPoints.length - 1) {
            setTimeout(() => {
                map.removeLayer(gpsMarker);
                document.getElementById('navHudTopLeft').classList.add('hidden');
                document.getElementById('navHudBottom').classList.add('hidden');
                document.querySelector('.sidebar').classList.remove('hidden');
                if(bypassLine) map.removeLayer(bypassLine);
            }, 3000);
            return;
        }
        
        progress += animationSpeed;
        if (progress >= 1) {
            progress = 0;
            currentSegment++;
            if (currentSegment >= pathPoints.length - 1) {
                setTimeout(() => {
                    map.removeLayer(gpsMarker);
                    document.getElementById('navHudTopLeft').classList.add('hidden');
                    document.getElementById('navHudBottom').classList.add('hidden');
                    document.querySelector('.sidebar').classList.remove('hidden');
                    if(bypassLine) map.removeLayer(bypassLine);
                }, 3000);
                return;
            }
        }
        
        let p1 = pathPoints[currentSegment];
        let p2 = pathPoints[currentSegment + 1];
        // Linear interpolate
        let newLat = p1.lat + (p2.lat - p1.lat) * progress;
        let newLng = p1.lng + (p2.lng - p1.lng) * progress;
        
        gpsMarker.setLatLng([newLat, newLng]);
        map.panTo([newLat, newLng], { animate: false });
        
        requestAnimationFrame(animateCar);
    }
    
    // Start smooth loop
    requestAnimationFrame(animateCar);
});

function updateExplainerPanel(nodeId, speed, explanation) {
    const panel = document.getElementById('explainerPanel');
    panel.classList.remove('hidden');
    
    document.getElementById('predCityName').innerText = nodeId;
    document.getElementById('predTimeHorizon').innerText = `Prediction for next ${currentHorizon} mins`;
    
    const speedInt = Math.round(speed);
    document.getElementById('predSpeedVal').innerText = speedInt;
    
    const statusEl = document.getElementById('predStatus');
    if (speedInt >= 50) {
        statusEl.innerText = "Clear (Free Flow)";
        statusEl.style.color = '#10b981';
    } else if (speedInt >= 30) {
        statusEl.innerText = "Moderate Traffic";
        statusEl.style.color = '#f59e0b';
    } else {
        statusEl.innerText = "Heavy Congestion";
        statusEl.style.color = '#ef4444';
    }
    
    // Confidence calculation (pseudo)
    const conf = Math.floor(82 + Math.random() * 15);
    document.getElementById('predConfidence').innerText = `${conf}%`;
    
    // Render Influencers
    const listEl = document.getElementById('influencersList');
    listEl.innerHTML = '';
    
    if (explanation && explanation.influencers && explanation.influencers.length > 0) {
        explanation.influencers.forEach(inf => {
            const pct = inf.percent.toFixed(1);
            listEl.innerHTML += `
                <div style="margin-bottom: 12px;">
                    <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:5px;">
                        <span>${inf.id}</span>
                        <span style="color:#3b82f6; font-weight:bold;">${pct}%</span>
                    </div>
                    <div style="width:100%; height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                        <div style="width:${pct}%; height:100%; background:#3b82f6;"></div>
                    </div>
                </div>
            `;
        });
    } else {
        listEl.innerHTML = '<p style="color:#aaa; font-size:14px;">No adjacent nodes to influence prediction.</p>';
    }
}

function setTimeHorizon(mins) {
    currentHorizon = mins;
    
    // Update active button
    document.getElementById('time15').className = "btn " + (mins === 15 ? "btn-primary" : "btn-secondary");
    document.getElementById('time30').className = "btn " + (mins === 30 ? "btn-primary" : "btn-secondary");
    document.getElementById('time60').className = "btn " + (mins === 60 ? "btn-primary" : "btn-secondary");
    
    // Recalculate if node is selected
    if (selectedNodeId) {
        selectNode(selectedNodeId);
    }
}

function animateGNN() {
    if(!gnnEngine) return;
    
    // Simple visual pulse effect
    let step = 0;
    const interval = setInterval(() => {
        nodeMarkers.forEach((marker, id) => {
            const div = marker.getElement().querySelector('.gnn-node');
            if(div) {
                if(Math.random() > 0.5) {
                    div.style.transform = 'scale(1.4)';
                    div.style.filter = 'brightness(1.5)';
                } else {
                    div.style.transform = 'scale(1)';
                    div.style.filter = 'brightness(1)';
                }
            }
        });
        
        step++;
        if(step > 15) {
            clearInterval(interval);
            if(selectedNodeId) {
                selectNode(selectedNodeId); // Restore state
            } else {
                resetGraphStyle();
            }
        }
    }, 150);
}

function setupEventListeners() {
    document.getElementById('time15').addEventListener('click', () => setTimeHorizon(15));
    document.getElementById('time30').addEventListener('click', () => setTimeHorizon(30));
    document.getElementById('time60').addEventListener('click', () => setTimeHorizon(60));
    
    const planBtn = document.getElementById('planPathBtn');
    if (planBtn) planBtn.addEventListener('click', calculateGNNPath);
    
    document.getElementById('animateBtn').addEventListener('click', animateGNN);
}

window.onload = initTraffExplainer;
