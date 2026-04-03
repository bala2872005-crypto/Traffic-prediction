/**
 * GNN Engine
 * Simulates a Graph Neural Network (GNN) for Traffic Prediction
 */
class GNNEngine {
    constructor(graphData) {
        this.nodes = new Map();
        this.edges = [];
        
        // Initialize nodes
        graphData.nodes.forEach(node => {
            this.nodes.set(node.id, {
                ...node,
                originalFeatures: {
                    speed: node.speed,
                    congestion: node.congestion
                },
                features: {
                    speed: node.speed,
                    congestion: node.congestion
                },
                neighbors: []
            });
        });
        
        // Initialize edges
        graphData.edges.forEach(edge => {
            this.edges.push(edge);
            
            // Add neighbor references (undirected graph for message passing)
            if (this.nodes.has(edge.source) && this.nodes.has(edge.target)) {
                if(!this.nodes.get(edge.source).neighbors.includes(edge.target))
                    this.nodes.get(edge.source).neighbors.push(edge.target);
                if(!this.nodes.get(edge.target).neighbors.includes(edge.source))
                    this.nodes.get(edge.target).neighbors.push(edge.source);
            }
        });
    }

    /**
     * Calculates Attention Weight between source and target nodes based on distance and current features.
     */
    getEdgeImportance(sourceId, targetId) {
        const edge = this.edges.find(e => 
            (e.source === sourceId && e.target === targetId) || 
            (e.source === targetId && e.target === sourceId)
        );
        
        if (!edge) return 0;
        
        const targetNode = this.nodes.get(targetId);
        if(!targetNode) return 0;
        
        // Inverse distance + factor of target congestion (more congested = more influence on source)
        const weight = (100 / edge.distance) * (0.5 + targetNode.features.congestion);
        return weight;
    }

    /**
     * Simulates Message Passing. Aggregates neighbor features weighted by attention.
     */
    runMessagePassing(layers = 3) {
        // Reset features to original before starting message passing
        for(let node of this.nodes.values()) {
            node.features = { ...node.originalFeatures };
        }

        for (let l = 0; l < layers; l++) {
            const nextFeatures = new Map();
            
            for (const [nodeId, node] of this.nodes.entries()) {
                let aggSpeed = node.features.speed;
                let aggCongestion = node.features.congestion;
                let totalWeight = 1.0; // Self-loop weight
                
                // Aggregate from neighbors
                node.neighbors.forEach(neighborId => {
                    const neighbor = this.nodes.get(neighborId);
                    if(neighbor) {
                        const attention = this.getEdgeImportance(nodeId, neighborId);
                        
                        aggSpeed += neighbor.features.speed * attention;
                        aggCongestion += neighbor.features.congestion * attention;
                        totalWeight += attention;
                    }
                });
                
                // Normalize and apply simple activation
                nextFeatures.set(nodeId, {
                    speed: Math.max(10, aggSpeed / totalWeight),
                    congestion: Math.min(1.0, Math.max(0.0, aggCongestion / totalWeight))
                });
            }
            
            // Apply updates
            for (const [nodeId, features] of nextFeatures.entries()) {
                this.nodes.get(nodeId).features = features;
            }
        }
    }

    /**
     * Prediction based on simple heuristic applied to GNN processed features.
     */
    predictTraffic(nodeId, horizon = 15) {
        const node = this.nodes.get(nodeId);
        if (!node) return null;
        
        // Calculate based on GNN passed features and time horizon
        let prediction = node.features.speed;
        let congestion = node.features.congestion;
        
        if (horizon === 30) {
            prediction = prediction * 0.8 + 40 * 0.2 - (congestion * 10);
        } else if (horizon === 60) {
            prediction = prediction * 0.6 + 40 * 0.4 - (congestion * 20);
        }
        
        return Math.max(5, Math.min(80, prediction)); // Cap between 5 and 80 km/h
    }

    /**
     * Explains the prediction by returning the top influencers.
     */
    explainPrediction(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node || node.neighbors.length === 0) return null;
        
        const influencers = [];
        let totalAttention = 0;
        
        // Calculate all attentions
        node.neighbors.forEach(neighborId => {
            const attention = this.getEdgeImportance(nodeId, neighborId);
            influencers.push({
                id: neighborId,
                attention: attention
            });
            totalAttention += attention;
        });
        
        if (totalAttention === 0) return { influencers: [] };
        
        // Normalize to percentages
        influencers.forEach(inf => {
            inf.percent = (inf.attention / totalAttention) * 100;
        });
        
        // Sort descending
        influencers.sort((a, b) => b.attention - a.attention);
        
        return {
            influencers: influencers.slice(0, 3) // Top 3
        };
    }
}
