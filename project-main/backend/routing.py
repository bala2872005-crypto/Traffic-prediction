"""
Smart Routing Algorithms
Implements Dijkstra, A*, and specialized routing for emergency and heavy vehicles.
"""

import networkx as nx
import numpy as np
import math


def build_road_network(nodes, edges, congestion_data=None):
    """
    Build a NetworkX graph from node and edge data.
    Incorporates real-time congestion into edge weights.
    """
    G = nx.Graph()

    # Add nodes with attributes
    for node_id, info in nodes.items():
        G.add_node(
            node_id,
            pos=info["pos"],
            name=info["name"],
            road_type=info["type"]
        )

    # Add edges with weights adjusted by congestion
    for src, dst, base_weight in edges:
        weight = base_weight

        if congestion_data:
            # Increase weight based on congestion at source and destination
            src_congestion = congestion_data.get(src, {}).get("congestion", 0)
            dst_congestion = congestion_data.get(dst, {}).get("congestion", 0)
            avg_congestion = (src_congestion + dst_congestion) / 2
            # Congestion multiplier: 1x (no traffic) to 3x (heavy traffic)
            congestion_multiplier = 1.0 + (avg_congestion * 2.0)
            weight = base_weight * congestion_multiplier

        G.add_edge(src, dst, weight=weight, base_weight=base_weight)

    return G


def heuristic(G, node1, node2):
    """Euclidean distance heuristic for A* algorithm."""
    pos1 = G.nodes[node1]["pos"]
    pos2 = G.nodes[node2]["pos"]
    return math.sqrt((pos1[0] - pos2[0])**2 + (pos1[1] - pos2[1])**2) * 100


def dijkstra_route(G, source, target):
    """
    Find shortest path using Dijkstra's algorithm.
    Returns path and total distance.
    """
    try:
        path = nx.dijkstra_path(G, source, target, weight="weight")
        distance = nx.dijkstra_path_length(G, source, target, weight="weight")
        return {
            "path": path,
            "distance": round(distance, 2),
            "algorithm": "Dijkstra",
            "success": True
        }
    except nx.NetworkXNoPath:
        return {
            "path": [],
            "distance": 0,
            "algorithm": "Dijkstra",
            "success": False,
            "error": "No path found"
        }


def astar_route(G, source, target):
    """
    Find shortest path using A* algorithm with Euclidean heuristic.
    More efficient than Dijkstra for single source-target queries.
    """
    try:
        path = nx.astar_path(G, source, target, heuristic=lambda n1, n2: heuristic(G, n1, n2), weight="weight")
        distance = sum(G[path[i]][path[i+1]]["weight"] for i in range(len(path)-1))
        return {
            "path": path,
            "distance": round(distance, 2),
            "algorithm": "A*",
            "success": True
        }
    except nx.NetworkXNoPath:
        return {
            "path": [],
            "distance": 0,
            "algorithm": "A*",
            "success": False,
            "error": "No path found"
        }


def emergency_route(G, source, target, congestion_data=None):
    """
    Emergency vehicle (ambulance) routing.
    - Prioritizes fastest path
    - Avoids highly congested areas
    - Reduces weights on highway segments
    """
    G_emergency = G.copy()

    for u, v, data in G_emergency.edges(data=True):
        weight = data["base_weight"]

        # Emergency vehicles get reduced weight on highways
        u_type = G_emergency.nodes[u].get("road_type", "main")
        v_type = G_emergency.nodes[v].get("road_type", "main")

        if u_type == "highway" or v_type == "highway":
            weight *= 0.5  # Highways are faster for emergency vehicles

        # Heavily penalize congested routes
        if congestion_data:
            src_cong = congestion_data.get(u, {}).get("congestion", 0)
            dst_cong = congestion_data.get(v, {}).get("congestion", 0)
            avg_cong = (src_cong + dst_cong) / 2

            if avg_cong > 0.7:
                weight *= 3.0  # Strongly avoid highly congested
            elif avg_cong > 0.4:
                weight *= 1.5  # Slightly avoid medium congestion

        G_emergency[u][v]["weight"] = weight

    try:
        path = nx.dijkstra_path(G_emergency, source, target, weight="weight")
        distance = sum(G_emergency[path[i]][path[i+1]]["weight"] for i in range(len(path)-1))

        return {
            "path": path,
            "distance": round(distance, 2),
            "algorithm": "Emergency (Dijkstra + Congestion Avoidance)",
            "vehicle_type": "ambulance",
            "success": True,
            "features": [
                "Fastest route prioritized",
                "Congested areas avoided",
                "Highway preference enabled"
            ]
        }
    except nx.NetworkXNoPath:
        return {
            "path": [],
            "distance": 0,
            "algorithm": "Emergency",
            "vehicle_type": "ambulance",
            "success": False,
            "error": "No path found"
        }


def heavy_vehicle_route(G, source, target, congestion_data=None):
    """
    Heavy vehicle routing.
    - Avoids narrow roads
    - Prefers highways
    - Considers road capacity
    """
    G_heavy = G.copy()

    for u, v, data in G_heavy.edges(data=True):
        weight = data["base_weight"]

        u_type = G_heavy.nodes[u].get("road_type", "main")
        v_type = G_heavy.nodes[v].get("road_type", "main")

        # Heavily penalize narrow roads for heavy vehicles
        if u_type == "narrow" or v_type == "narrow":
            weight *= 5.0  # Very high penalty for narrow roads

        # Prefer highways for heavy vehicles
        if u_type == "highway" and v_type == "highway":
            weight *= 0.6  # Discount for highway-to-highway

        # Normal congestion adjustment
        if congestion_data:
            src_cong = congestion_data.get(u, {}).get("congestion", 0)
            dst_cong = congestion_data.get(v, {}).get("congestion", 0)
            avg_cong = (src_cong + dst_cong) / 2
            weight *= (1.0 + avg_cong)

        G_heavy[u][v]["weight"] = weight

    try:
        path = nx.dijkstra_path(G_heavy, source, target, weight="weight")
        distance = sum(G_heavy[path[i]][path[i+1]]["weight"] for i in range(len(path)-1))

        return {
            "path": path,
            "distance": round(distance, 2),
            "algorithm": "Heavy Vehicle (Dijkstra + Road Type Filter)",
            "vehicle_type": "heavy",
            "success": True,
            "features": [
                "Narrow roads avoided",
                "Highway preference enabled",
                "Road capacity considered"
            ]
        }
    except nx.NetworkXNoPath:
        return {
            "path": [],
            "distance": 0,
            "algorithm": "Heavy Vehicle",
            "vehicle_type": "heavy",
            "success": False,
            "error": "No path found"
        }


def get_alternative_routes(G, source, target, num_alternatives=3):
    """
    Find multiple alternative routes using edge-disjoint paths
    and penalized shortest paths.
    """
    routes = []

    # Primary route
    primary = dijkstra_route(G, source, target)
    if primary["success"]:
        primary["label"] = "Primary Route"
        routes.append(primary)

    # Generate alternatives by penalizing edges of previous routes
    G_alt = G.copy()
    for route in routes:
        if route["success"]:
            path = route["path"]
            for i in range(len(path) - 1):
                if G_alt.has_edge(path[i], path[i+1]):
                    G_alt[path[i]][path[i+1]]["weight"] *= 2.5

    for k in range(num_alternatives - 1):
        alt = dijkstra_route(G_alt, source, target)
        if alt["success"] and alt["path"] != primary.get("path"):
            alt["label"] = f"Alternative {k + 1}"
            routes.append(alt)

            # Further penalize this route's edges
            for i in range(len(alt["path"]) - 1):
                if G_alt.has_edge(alt["path"][i], alt["path"][i+1]):
                    G_alt[alt["path"][i]][alt["path"][i+1]]["weight"] *= 2.5

    return routes
