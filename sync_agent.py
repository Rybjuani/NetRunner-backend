# sync_agent.py - NetRunner Sync-Node v2.1 (Filtered & Deduplicated)
import asyncio
import websockets
import json
import os
import hashlib
import time
import ssl
from pymongo import MongoClient
from tinydb import TinyDB, Query

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
local_db = TinyDB('sync_history.json')

# --- FUNCIONES CORE ---
def log_to_mongo(level, message, metadata={}):
    # (código existente)

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
    # (código existente)

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
                # Filtrar por extensión
                if not any(filename.lower().endswith(ext) for ext in ALLOWED_EXTENSIONS):
                    continue

                file_path = os.path.join(root, filename)
                file_hash = get_file_hash(file_path)

                # Comprobar si ya se subió y no ha cambiado
                result = local_db.get(File.path == file_path)
                if result and result['hash'] == file_hash:
                    skipped_count += 1
                    continue
                
                # Subir y registrar
                asyncio.create_task(upload_file_in_chunks(websocket, file_path))
                local_db.upsert({'path': file_path, 'hash': file_hash}, File.path == file_path)
                uploaded_count += 1

    summary = f"Escaneo completo. {uploaded_count} archivos subidos, {skipped_count} omitidos por duplicado."
    log_to_mongo("info", summary)
    with open('sync.log', 'a') as f:
        f.write(f"[{time.ctime()}] {summary}\n")


# --- WEBSOCKET CLIENT ---
async def agent_handler():
    # (código existente, pero llama a la nueva función de escaneo)

if __name__ == "__main__":
    # (código existente)
