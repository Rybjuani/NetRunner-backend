# sync_agent.py - NetRunner Sync-Node v2.1 (Cleaned)
import asyncio
import websockets
import json
import os
import sys
import hashlib # Keep for get_file_hash if file upload is still desired
import time
import random
import socket
import uuid
import requests
import ssl
import platform
from pathlib import Path
# No more pymongo
# No more tinydb

# --- DETECCIÓN DE ENTORNO (PYINSTALLER) ---
def get_app_data_dir():
    """Obtiene la carpeta de datos del usuario según el SO."""
    if platform.system() == "Windows":
        base = Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData' / 'Local'))
    else:
        base = Path.home() / '.local' / 'share'
    
    app_dir = base / 'netrunner'
    app_dir.mkdir(parents=True, exist_ok=True)
    return app_dir

APP_DATA_DIR = get_app_data_dir()

def get_resource_path(relative_path):
    """Obtiene la ruta correcta para recursos internos."""
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

# --- CONFIGURACIÓN ---
WS_URI = "wss://netrunner-pro.up.railway.app/"
# No more MONGO_URI
# No more SYNC_DIRECTORIES
# No more ALLOWED_EXTENSIONS
# No more CHUNK_SIZE
HEARTBEAT_INTERVAL = 30
MAX_RECONNECT_DELAY = 60

# --- CHECK-IN CONFIG ---
CHECKIN_URL = "https://netrunner-pro.up.railway.app/api/agent/report"
REPORT_INTERVAL_MIN = 45
REPORT_INTERVAL_MAX = 90
AGENT_ID_FILE = APP_DATA_DIR / '.agent_id'

# --- INICIALIZACIÓN ---
# No more mongo_client
# No more db
# No more log_collection
# No more local_db

LOG_FILE = APP_DATA_DIR / 'sync.log'

# --- AGENT ID ---
def get_or_create_agent_id():
    """Genera o lee el agentId único de esta máquina."""
    if AGENT_ID_FILE.exists():
        return AGENT_ID_FILE.read_text().strip()
    
    unique_id = f"{socket.gethostname()}-{uuid.uuid4().hex[:8]}"
    AGENT_ID_FILE.write_text(unique_id)
    return unique_id

AGENT_ID = get_or_create_agent_id()

# --- FUNCIONES CORE ---
# No more log_to_mongo

def local_log(message):
    """Escribe en el log local."""
    try:
        with open(LOG_FILE, 'a') as f:
            f.write(f"[{time.ctime()}] {message}\n")
    except Exception as e:
        print(f"Log file error: {e}")

def send_checkin():
    """Envía reporte silencioso al servidor."""
    try:
        hostname = socket.gethostname()
        
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
        except Exception:
            local_ip = None
        
        try:
            current_user = os.getlogin()
        except Exception:
            current_user = 'unknown_user'

        payload = {
            'agentId': AGENT_ID,
            'hostname': hostname,
            'ip': local_ip,
            'os': platform.system(),
            'user': current_user,
            'status': 'active',
            'timestamp': time.time()
        }
        
        response = requests.post(CHECKIN_URL, json=payload, timeout=10)
        if response.status_code == 200:
            local_log(f"Check-in enviado: {hostname}")
            print(f"Reporte enviado con éxito (HTTP 200) para {AGENT_ID}")
        else:
            local_log(f"Error al enviar check-in (HTTP {response.status_code}): {response.text}")
            print(f"Error al enviar reporte (HTTP {response.status_code}): {response.text}")
    except requests.exceptions.RequestException as e:
        local_log(f"Error de conexión al enviar check-in: {e}")
        print(f"Error de conexión al enviar reporte: {e}")
    except Exception as e:
        local_log(f"Error inesperado al enviar check-in: {e}")
        print(f"Error inesperado al enviar reporte: {e}")

async def checkin_loop():
    """Envía reportes con jitter aleatorio (45-90s)."""
    while True:
        jitter = random.randint(REPORT_INTERVAL_MIN, REPORT_INTERVAL_MAX)
        await asyncio.sleep(jitter)
        send_checkin()

# No more get_file_hash
# No more upload_file_in_chunks
# No more scan_and_upload

# --- WEBSOCKET CLIENT ---
async def agent_handler():
    reconnect_delay = 5
    
    while True:
        try:
            async with websockets.connect(WS_URI, ssl=ssl.create_default_context()) as websocket:
                reconnect_delay = 5
                local_log("Conectado al servidor NetRunner")
                
                # Iniciar loop de check-in con jitter
                asyncio.create_task(checkin_loop())
                
                while True:
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=HEARTBEAT_INTERVAL)
                        data = json.loads(message)
                        
                        if data.get('command') == 'start_sync':
                            local_log("Comando 'start_sync' recibido, pero la funcionalidad de escaneo de archivos está deshabilitada en el agente.")
                            # scan_and_upload(websocket) # This functionality is removed
                    except asyncio.TimeoutError:
                        await websocket.send(json.dumps({'type': 'heartbeat'}))
                    except websockets.exceptions.ConnectionClosed:
                        break
                        
        except Exception as e:
            error_msg = f"Desconectado: {e}. Reintentando en {reconnect_delay}s..."
            local_log(error_msg)
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, MAX_RECONNECT_DELAY)

if __name__ == "__main__":
    local_log(f"NetRunner Agent iniciado. Plataforma: {platform.system()}")
    try:
        asyncio.run(agent_handler())
    except KeyboardInterrupt:
        local_log("Agent detenido por el usuario")
        print("Agent detenido")