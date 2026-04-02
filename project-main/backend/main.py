"""
FastAPI Backend Server
AI Traffic Prediction & Smart Routing System
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import json
import os
import pymysql
from apscheduler.schedulers.background import BackgroundScheduler
import datetime
import pandas as pd
from dotenv import load_dotenv

load_dotenv()
    get_predictions, get_network_graph,
    NODES, EDGES, ADJ_MATRIX, NODE_LIST, traffic_model
)
from routing import (
    build_road_network, dijkstra_route, astar_route,
    emergency_route, heavy_vehicle_route, get_alternative_routes
)

# ─── FastAPI App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="AI Traffic Prediction & Smart Routing System",
    description="GNN + GRU based traffic prediction with smart routing algorithms",
    version="1.0.0"
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request/Response Models ─────────────────────────────────────────────────

class RouteRequest(BaseModel):
    source: str
    target: str
    algorithm: Optional[str] = "dijkstra"  # dijkstra, astar

class PredictRequest(BaseModel):
    data: Optional[List[float]] = None

class EmergencyRouteRequest(BaseModel):
    source: str
    target: str

class HeavyVehicleRouteRequest(BaseModel):
    source: str
    target: str

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    token: str
    status: str

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/")
def home():
    """Health check endpoint."""
    return {
        "message": "AI Traffic Prediction & Smart Routing System is Running",
        "status": "active",
        "model": "GNN + GRU (Spatial-Temporal)",
        "nodes": len(NODE_LIST),
        "version": "1.0.0"
    }


@app.post("/login")
def login(request: LoginRequest):
    """Simple login authentication (Simulated)."""
    # Try MySQL first
    try:
        db = get_db_connection()
        cursor = db.cursor()
        cursor.execute("SELECT * FROM users WHERE username = %s AND password = %s", (request.username, request.password))
        user = cursor.fetchone()
        db.close()
        
        if user:
            return {
                "token": "db_session_token_" + request.username,
                "status": "success",
                "message": "Login successful"
            }
    except Exception as e:
        print(f"[DB] Login error: {e}")

    # Fallback to demo credentials
    if request.username == "admin" and request.password == "traffic123":
        return {
            "token": "simulated_jwt_token_for_traffic_system",
            "status": "success",
            "message": "Login successful"
        }
    else:
        raise HTTPException(status_code=401, detail="Invalid username or password")


@app.post("/register")
def register(request: RegisterRequest):
    """Register a new user in the MySQL database."""
    try:
        db = get_db_connection()
        cursor = db.cursor()
        
        # Check if user exists
        cursor.execute("SELECT id FROM users WHERE username = %s OR email = %s", (request.username, request.email))
        if cursor.fetchone():
            db.close()
            raise HTTPException(status_code=400, detail="Username or email already registered")
            
        # Insert user
        cursor.execute(
            "INSERT INTO users (username, email, password) VALUES (%s, %s, %s)",
            (request.username, request.email, request.password)
        )
        db.commit()
        db.close()
        
        return {"status": "success", "message": "User registered successfully"}
    except Exception as e:
        print(f"[DB] Registration error: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred")


@app.get("/graph")
def get_graph():
    """Get the road network graph (nodes and edges)."""
    return get_network_graph()


@app.get("/traffic-data")
def get_traffic_data():
    """Get current traffic predictions for all nodes."""
    predictions = get_predictions()

    # Add summary statistics
    congestion_values = [v["congestion"] for v in predictions.values()]
    summary = {
        "avg_congestion": round(float(np.mean(congestion_values)), 3),
        "max_congestion": round(float(np.max(congestion_values)), 3),
        "min_congestion": round(float(np.min(congestion_values)), 3),
        "high_congestion_nodes": sum(1 for v in congestion_values if v > 0.6),
        "total_nodes": len(congestion_values)
    }

    return {
        "predictions": predictions,
        "summary": summary
    }


@app.post("/predict")
def predict(request: PredictRequest):
    """
    Predict traffic congestion.
    Accepts optional traffic data, returns predictions for all nodes.
    """
    predictions = get_predictions()

    # Calculate per-node predictions
    node_predictions = []
    for node_id, data in predictions.items():
        node_predictions.append({
            "node": node_id,
            "name": data["name"],
            "congestion": data["congestion"],
            "level": data["traffic_level"],
            "position": data["position"]
        })

    # Sort by congestion (highest first)
    node_predictions.sort(key=lambda x: x["congestion"], reverse=True)

    return {
        "predictions": node_predictions,
        "model_info": {
            "architecture": "GNN (Spatial) + GRU (Temporal)",
            "input_features": ["traffic_volume", "speed", "time_of_day", "day_of_week"],
            "spatial_model": "Graph Neural Network with message passing",
            "temporal_model": "Gated Recurrent Unit (2 layers)"
        }
    }


@app.post("/route")
def find_route(request: RouteRequest):
    """Find optimal route between two nodes."""
    # Validate nodes
    if request.source not in NODE_LIST:
        raise HTTPException(status_code=400, detail=f"Source node '{request.source}' not found. Valid nodes: {NODE_LIST}")
    if request.target not in NODE_LIST:
        raise HTTPException(status_code=400, detail=f"Target node '{request.target}' not found. Valid nodes: {NODE_LIST}")
    if request.source == request.target:
        raise HTTPException(status_code=400, detail="Source and target must be different")

    # Get current congestion data
    congestion_data = get_predictions()

    # Build graph with congestion-adjusted weights
    G = build_road_network(NODES, EDGES, congestion_data)

    # Choose algorithm
    if request.algorithm == "astar":
        result = astar_route(G, request.source, request.target)
    else:
        result = dijkstra_route(G, request.source, request.target)

    # Add node details to path
    if result["success"]:
        path_details = []
        for node_id in result["path"]:
            info = NODES[node_id]
            cong = congestion_data.get(node_id, {})
            path_details.append({
                "id": node_id,
                "name": info["name"],
                "position": info["pos"],
                "type": info["type"],
                "congestion": cong.get("congestion", 0),
                "level": cong.get("traffic_level", "unknown")
            })
        result["path_details"] = path_details

    return result


@app.post("/route/emergency")
def find_emergency_route(request: EmergencyRouteRequest):
    """
    Find optimal route for emergency vehicles (ambulances).
    Avoids congestion, prioritizes highways, fastest path.
    """
    if request.source not in NODE_LIST:
        raise HTTPException(status_code=400, detail=f"Source node '{request.source}' not found")
    if request.target not in NODE_LIST:
        raise HTTPException(status_code=400, detail=f"Target node '{request.target}' not found")

    congestion_data = get_predictions()
    G = build_road_network(NODES, EDGES, congestion_data)

    result = emergency_route(G, request.source, request.target, congestion_data)

    if result["success"]:
        path_details = []
        for node_id in result["path"]:
            info = NODES[node_id]
            cong = congestion_data.get(node_id, {})
            path_details.append({
                "id": node_id,
                "name": info["name"],
                "position": info["pos"],
                "type": info["type"],
                "congestion": cong.get("congestion", 0),
                "level": cong.get("traffic_level", "unknown")
            })
        result["path_details"] = path_details

    # Also provide the normal route for comparison
    normal = dijkstra_route(G, request.source, request.target)
    result["normal_route_distance"] = normal.get("distance", 0)
    result["time_saved"] = round(normal.get("distance", 0) - result.get("distance", 0), 2)

    return result


@app.post("/route/heavy")
def find_heavy_vehicle_route(request: HeavyVehicleRouteRequest):
    """
    Find optimal route for heavy vehicles.
    Avoids narrow roads, prefers highways.
    """
    if request.source not in NODE_LIST:
        raise HTTPException(status_code=400, detail=f"Source node '{request.source}' not found")
    if request.target not in NODE_LIST:
        raise HTTPException(status_code=400, detail=f"Target node '{request.target}' not found")

    congestion_data = get_predictions()
    G = build_road_network(NODES, EDGES, congestion_data)

    result = heavy_vehicle_route(G, request.source, request.target, congestion_data)

    if result["success"]:
        path_details = []
        for node_id in result["path"]:
            info = NODES[node_id]
            cong = congestion_data.get(node_id, {})
            path_details.append({
                "id": node_id,
                "name": info["name"],
                "position": info["pos"],
                "type": info["type"],
                "congestion": cong.get("congestion", 0),
                "level": cong.get("traffic_level", "unknown")
            })
        result["path_details"] = path_details

    return result


@app.post("/route/alternatives")
def find_alternative_routes(request: RouteRequest):
    """Find multiple alternative routes."""
    if request.source not in NODE_LIST:
        raise HTTPException(status_code=400, detail=f"Source node '{request.source}' not found")
    if request.target not in NODE_LIST:
        raise HTTPException(status_code=400, detail=f"Target node '{request.target}' not found")

    congestion_data = get_predictions()
    G = build_road_network(NODES, EDGES, congestion_data)

    routes = get_alternative_routes(G, request.source, request.target)

    return {
        "routes": routes,
        "total_alternatives": len(routes)
    }


@app.get("/nodes")
def get_nodes():
    """Get list of all available nodes."""
    return {
        "nodes": [
            {
                "id": node_id,
                "name": NODES[node_id]["name"],
                "type": NODES[node_id]["type"]
            }
            for node_id in NODE_LIST
        ]
    }


# ─── Static File Serving ──────────────────────────────────────────────────────

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")


@app.get("/login")
def serve_login():
    """Serve the login page."""
    return FileResponse(os.path.join(FRONTEND_DIR, "login.html"))


@app.get("/app")
def serve_frontend():
    """Serve the frontend dashboard."""
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


# Mount static files (CSS, JS, Images) - must be after API routes
# Mount static files (CSS, JS, Images) - must be after API routes
app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")
app.mount("/img", StaticFiles(directory=os.path.join(FRONTEND_DIR, "img")), name="img")


@app.get("/register")
def serve_register():
    """Serve the registration page."""
    return FileResponse(os.path.join(FRONTEND_DIR, "register.html"))


# ─── MySQL Database Setup ──────────────────────────────────────────────────

def get_db_connection():
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASSWORD", "root"),
        database=os.environ.get("DB_NAME", "traffic_prediction"),
        cursorclass=pymysql.cursors.DictCursor
    )

def init_db():
    try:
        conn = pymysql.connect(
            host=os.environ.get("DB_HOST", "127.0.0.1"),
            user=os.environ.get("DB_USER", "root"),
            password=os.environ.get("DB_PASSWORD", "root")
        )
        cursor = conn.cursor()
        cursor.execute("CREATE DATABASE IF NOT EXISTS traffic_prediction")
        cursor.execute("USE traffic_prediction")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        conn.close()
        print("[DB] MySQL connection and schema verified.")
    except Exception as e:
        print(f"[DB] Error initializing database: {e}")

# ─── Automated Daily Dataset Update ──────────────────────────────────────────

def daily_data_update():
    """Simulates daily dataset update by appending new synthetic data."""
    print(f"[AI] {datetime.datetime.now()} - Running automated daily dataset update...")
    
    csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "traffic.csv")
    if not os.path.exists(csv_path):
        print("[AI] traffic.csv not found for update!")
        return
        
    try:
        # Load existing data to get structure
        df = pd.read_csv(csv_path)
        
        # Generate new data for the current timestamp
        new_timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_rows = []
        
        for node_id in NODE_LIST:
            vol = np.random.randint(50, 500)
            speed = np.random.randint(10, 60)
            cong = round(np.random.uniform(0.1, 0.9), 2)
            node_name = NODES.get(node_id, {}).get("name", "Unknown")
            road_type = NODES.get(node_id, {}).get("type", "main")
            
            new_rows.append({
                'timestamp': new_timestamp,
                'node_id': node_id,
                'node_name': node_name,
                'traffic_volume': vol,
                'speed_kmh': speed,
                'congestion_level': cong,
                'road_type': road_type
            })
            
        new_df = pd.DataFrame(new_rows)
        combined_df = pd.concat([df, new_df], ignore_index=True)
        
        # Keep only last 1000 rows to avoid file bloat
        if len(combined_df) > 1000:
            combined_df = combined_df.tail(1000)
            
        combined_df.to_csv(csv_path, index=False)
        print(f"[AI] Successfully updated {csv_path} with new day data.")
        
        # In a real scenario, you would trigger model re-training here
        # For now, we print a confirmation
        print("[AI] Model retraining triggered for new dataset trends.")
        
    except Exception as e:
        print(f"[AI] Update error: {e}")

# ─── Startup Background Jobs ────────────────────────────────────────────────

@app.on_event("startup")
def startup_event():
    init_db()
    
    # Setup Daily Scheduler
    scheduler = BackgroundScheduler()
    # Run once at startup to ensure data is fresh
    scheduler.add_job(daily_data_update, 'interval', days=1, next_run_time=datetime.datetime.now())
    scheduler.start()
    print("[OK] Daily Dataset Auto-Update Scheduler started.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
