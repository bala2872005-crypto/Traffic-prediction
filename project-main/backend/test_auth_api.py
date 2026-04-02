import requests
import random
import string

def random_string(length=8):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

base_url = "http://localhost:8000"
username = "testuser_" + random_string(4)
email = username + "@example.com"
password = "testpassword123"

print(f"Attempting to register: {username}")

try:
    # 1. Register
    reg_response = requests.post(f"{base_url}/register", json={
        "username": username,
        "email": email,
        "password": password
    })
    print(f"Registration Status: {reg_response.status_code}")
    print(f"Registration Response: {reg_response.json()}")

    if reg_response.status_code == 200:
        # 2. Login
        print(f"Attempting to login: {username}")
        login_response = requests.post(f"{base_url}/login", json={
            "username": username,
            "password": password
        })
        print(f"Login Status: {login_response.status_code}")
        print(f"Login Response: {login_response.json()}")
    else:
        print("Registration failed, skipping login test.")

except Exception as e:
    print(f"Error during test: {e}")
