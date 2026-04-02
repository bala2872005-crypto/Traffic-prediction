"""
AI Traffic Prediction Model
Uses GNN-inspired spatial learning + GRU temporal learning
Based on: Traffexplainer - A Framework Toward GNN-Based Interpretable Traffic Prediction
"""

import torch
import torch.nn as nn
import numpy as np
import json


class SpatialBlock(nn.Module):
    """
    Graph Neural Network-inspired spatial block.
    Learns spatial relationships between road network nodes.
    Simulates message passing on graph structure.
    """
    def __init__(self, in_features, hidden_features, out_features):
        super().__init__()
        self.fc1 = nn.Linear(in_features, hidden_features)
        self.fc2 = nn.Linear(hidden_features, out_features)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.2)

    def forward(self, x, adj_matrix=None):
        """
        x: Node features [batch, num_nodes, features]
        adj_matrix: Adjacency matrix [num_nodes, num_nodes]
        """
        if adj_matrix is not None:
            # Simulate graph convolution: aggregate neighbor features
            x = torch.matmul(adj_matrix.float(), x)
        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)
        return x


class TemporalBlock(nn.Module):
    """
    GRU-based temporal block.
    Learns temporal patterns in traffic data (rush hours, trends).
    """
    def __init__(self, input_size, hidden_size, num_layers=2):
        super().__init__()
        self.gru = nn.GRU(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.2
        )
        self.fc = nn.Linear(hidden_size, input_size)

    def forward(self, x):
        """
        x: Temporal sequence [batch, seq_len, features]
        """
        output, hidden = self.gru(x)
        # Use the last hidden state for prediction
        prediction = self.fc(output[:, -1, :])
        return prediction


class TrafficPredictor(nn.Module):
    """
    Combined Spatial-Temporal Traffic Prediction Model.
    Merges GNN spatial features with GRU temporal features.
    """
    def __init__(self, num_nodes=10, node_features=4, hidden_dim=32, seq_len=6):
        super().__init__()
        self.num_nodes = num_nodes
        self.node_features = node_features
        self.seq_len = seq_len

        # Spatial block (GNN-inspired)
        self.spatial = SpatialBlock(node_features, hidden_dim, hidden_dim)

        # Temporal block (GRU)
        self.temporal = TemporalBlock(
            input_size=num_nodes * hidden_dim,
            hidden_size=hidden_dim * 2,
            num_layers=2
        )

        # Final prediction layers
        self.predictor = nn.Sequential(
            nn.Linear(num_nodes * hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, num_nodes)  # Predict congestion for each node
        )

    def forward(self, x, adj_matrix=None):
        """
        x: [batch, seq_len, num_nodes, node_features]
        adj_matrix: [num_nodes, num_nodes]
        """
        batch_size = x.size(0)
        spatial_outputs = []

        # Process each time step through spatial block
        for t in range(self.seq_len):
            spatial_out = self.spatial(x[:, t, :, :], adj_matrix)
            spatial_outputs.append(spatial_out.view(batch_size, -1))

        # Stack temporal sequence
        temporal_input = torch.stack(spatial_outputs, dim=1)

        # Process through temporal block
        temporal_out = self.temporal(temporal_input)

        # Final prediction
        prediction = self.predictor(temporal_out)
        return torch.sigmoid(prediction)  # Output: congestion probability per node


# ─── Synthetic Data & Training ───────────────────────────────────────────────

def generate_road_network():
    """
    Generate a road network graph for Tamil Nadu.
    Returns adjacency matrix and node positions.
    """
    nodes = {
        "CHN": {"pos": [13.0827, 80.2707], "name": "Chennai", "type": "highway"},
        "CBE": {"pos": [11.0168, 76.9558], "name": "Coimbatore", "type": "highway"},
        "MDU": {"pos": [9.9252, 78.1198], "name": "Madurai", "type": "highway"},
        "TRY": {"pos": [10.7905, 78.7047], "name": "Trichy", "type": "highway"},
        "SLM": {"pos": [11.6643, 78.1460], "name": "Salem", "type": "main"},
        "TNV": {"pos": [8.7139, 77.7567], "name": "Tirunelveli", "type": "main"},
        "VLR": {"pos": [12.9165, 79.1325], "name": "Vellore", "type": "main"},
        "ERD": {"pos": [11.3410, 77.7172], "name": "Erode", "type": "narrow"},
        "TUT": {"pos": [8.8049, 78.1460], "name": "Thoothukudi", "type": "narrow"},
        "TNJ": {"pos": [10.7870, 79.1378], "name": "Thanjavur", "type": "narrow"},
    }

    edges = [
        ("CHN", "VLR", 1.5), ("CHN", "TRY", 3.0), 
        ("VLR", "SLM", 2.0),
        ("SLM", "ERD", 1.0), ("SLM", "CBE", 2.5),
        ("ERD", "CBE", 1.5),
        ("CBE", "MDU", 3.0),
        ("TRY", "SLM", 2.0), ("TRY", "MDU", 2.0), ("TRY", "TNJ", 1.0),
        ("MDU", "TNV", 2.5), ("MDU", "TUT", 2.2),
        ("TNV", "TUT", 1.0),
        ("TNJ", "TRY", 1.0),
    ]

    node_list = list(nodes.keys())
    n = len(node_list)
    adj = np.zeros((n, n))

    for src, dst, weight in edges:
        i, j = node_list.index(src), node_list.index(dst)
        adj[i][j] = 1.0 / weight  # Use inverse weight for adjacency
        adj[j][i] = 1.0 / weight

    # Add self-loops
    np.fill_diagonal(adj, 1.0)

    # Normalize adjacency matrix (row-wise)
    row_sums = adj.sum(axis=1, keepdims=True)
    adj = adj / row_sums

    return nodes, edges, adj, node_list


def generate_synthetic_traffic(num_samples=200, num_nodes=10, seq_len=6, features=4):
    """
    Generate synthetic traffic data for training.
    Features: [traffic_volume, speed, time_of_day, day_of_week]
    """
    np.random.seed(42)

    X = np.zeros((num_samples, seq_len, num_nodes, features))
    y = np.zeros((num_samples, num_nodes))

    for i in range(num_samples):
        hour = np.random.randint(0, 24)
        day = np.random.randint(0, 7)

        for t in range(seq_len):
            current_hour = (hour + t) % 24

            for n in range(num_nodes):
                # Simulate rush hour patterns
                is_rush = 1.0 if current_hour in [8, 9, 17, 18, 19] else 0.3
                base_traffic = np.random.uniform(0.2, 0.8) * is_rush
                noise = np.random.normal(0, 0.05)

                X[i, t, n, 0] = np.clip(base_traffic + noise, 0, 1)       # volume
                X[i, t, n, 1] = np.clip(1.0 - base_traffic + noise, 0, 1) # speed (inverse)
                X[i, t, n, 2] = current_hour / 24.0                        # time
                X[i, t, n, 3] = day / 7.0                                  # day

        # Target: congestion at next time step
        for n in range(num_nodes):
            y[i, n] = np.clip(X[i, -1, n, 0] + np.random.normal(0, 0.1), 0, 1)

    return (
        torch.FloatTensor(X),
        torch.FloatTensor(y)
    )


def train_model(model, adj_matrix, epochs=50):
    """Train the traffic prediction model on synthetic data."""
    X, y = generate_synthetic_traffic()
    adj_tensor = torch.FloatTensor(adj_matrix)

    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    criterion = nn.MSELoss()

    losses = []
    for epoch in range(epochs):
        model.train()
        optimizer.zero_grad()

        predictions = model(X, adj_tensor)
        loss = criterion(predictions, y)

        loss.backward()
        optimizer.step()

        losses.append(loss.item())
        if (epoch + 1) % 10 == 0:
            print(f"Epoch [{epoch+1}/{epochs}], Loss: {loss.item():.4f}")

    return losses


def predict_traffic(model, adj_matrix, current_data=None):
    """
    Predict traffic congestion for all nodes.
    Returns congestion levels (0-1) for each node.
    """
    model.eval()
    adj_tensor = torch.FloatTensor(adj_matrix)

    if current_data is None:
        # Generate a single sample for prediction
        X, _ = generate_synthetic_traffic(num_samples=1)
    else:
        X = torch.FloatTensor(current_data).unsqueeze(0)

    with torch.no_grad():
        prediction = model(X, adj_tensor)

    return prediction.squeeze().numpy()


# ─── Initialize on import ────────────────────────────────────────────────────

# Build network
NODES, EDGES, ADJ_MATRIX, NODE_LIST = generate_road_network()

# Create and train model
traffic_model = TrafficPredictor(
    num_nodes=len(NODE_LIST),
    node_features=4,
    hidden_dim=32,
    seq_len=6
)

print("[AI] Training Traffic Prediction Model...")
training_losses = train_model(traffic_model, ADJ_MATRIX, epochs=50)
print("[OK] Model trained successfully!")


def get_predictions():
    """Get current traffic predictions as a dict with reasons for traffic."""
    congestion = predict_traffic(traffic_model, ADJ_MATRIX)
    result = {}
    for i, node_id in enumerate(NODE_LIST):
        node_info = NODES[node_id]
        level_val = float(np.clip(congestion[i], 0, 1))

        # Determine traffic level
        if level_val > 0.6:
            traffic_level = "high"
            # Pick a serious reason for high traffic
            reason = np.random.choice(["Road Accident", "Peak Hour Surge", "Road Construction", "Heavy Rain"])
        elif level_val > 0.3:
            traffic_level = "medium"
            reason = np.random.choice(["Traffic Signal", "Peak Hour Surge", "Vehicle Breakdown"])
        else:
            traffic_level = "low"
            reason = "Normal Flow"

        result[node_id] = {
            "name": node_info["name"],
            "position": node_info["pos"],
            "type": node_info["type"],
            "congestion": level_val,
            "traffic_level": traffic_level,
            "reason": reason
        }
    return result


def get_network_graph():
    """Get the road network as a JSON-serializable dict."""
    nodes_data = []
    for node_id in NODE_LIST:
        info = NODES[node_id]
        nodes_data.append({
            "id": node_id,
            "name": info["name"],
            "lat": info["pos"][0],
            "lng": info["pos"][1],
            "type": info["type"]
        })

    edges_data = []
    for src, dst, weight in EDGES:
        edges_data.append({
            "source": src,
            "target": dst,
            "weight": weight
        })

    return {"nodes": nodes_data, "edges": edges_data}
