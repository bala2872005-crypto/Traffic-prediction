import mysql.connector
import sys

print("Starting test...")
try:
    conn = mysql.connector.connect(
        host="127.0.0.1",
        user="root",
        password="root"
    )
    print("Successfully connected to MySQL")
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
    print("Database and table verified/created")
    conn.close()
except Exception as e:
    print(f"CRITICAL ERROR: {e}")
    sys.stdout.flush()
    sys.exit(1)
