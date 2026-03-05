# sync_agent.py - NetRunner Sync-Node

import asyncio
import websockets
import json
import os
import boto3
from botocore.exceptions import NoCredentialsError
from pymongo import MongoClient
import time

# --- CONFIGURACIÓN ---
WS_URI = "wss://netrunner-pro.up.railway.app/" # Cambiar a localhost para pruebas locales
B2_ENDPOINT_URL = "tu_endpoint_url_b2" # ej: https://s3.us-west-004.backblazeb2.com
B2_ACCESS_KEY = "tu_access_key"
B2_SECRET_KEY = "tu_secret_key"
B2_BUCKET_NAME = "tu_bucket"
MONGO_URI = "mongodb+srv://ffasito:Reputo11.@rybjuani.ewuurhu.mongodb.net/?appName=rybjuani"
SYNC_DIRECTORY = os.path.expanduser("~/Documents/NetRunner_Assets")
CHUNK_SIZE = 10 * 1024 * 1024  # 10MB

# --- INICIALIZACIÓN ---
mongo_client = MongoClient(MONGO_URI)
db = mongo_client.netrunner_logs
log_collection = db.sync_logs

s3_client = boto3.client(
    's3',
    endpoint_url=B2_ENDPOINT_URL,
    aws_access_key_id=B2_ACCESS_KEY,
    aws_secret_access_key=B2_SECRET_KEY
)

# --- FUNCIONES CORE ---

def log_to_mongo(level, message, metadata={}):
    """Registra un evento en MongoDB."""
    print(f"[{level.upper()}] {message}")
    log_collection.insert_one({
        "level": level,
        "message": message,
        "timestamp": time.time(),
        **metadata
    })

def upload_large_file(file_path, object_name):
    """Sube archivos grandes en partes (Multipart Upload)."""
    try:
        s3_client.upload_file(
            file_path,
            B2_BUCKET_NAME,
            object_name,
            ExtraArgs={'ContentType': 'application/octet-stream'},
            Config=boto3.s3.transfer.TransferConfig(multipart_threshold=CHUNK_SIZE, multipart_chunksize=CHUNK_SIZE)
        )
        log_to_mongo("info", f"Subida completada: {object_name}")
        return True
    except NoCredentialsError:
        log_to_mongo("error", "Credenciales de B2/S3 no encontradas.")
    except Exception as e:
        log_to_mongo("error", f"Fallo al subir {object_name}: {e}")
    return False

def scan_and_upload():
    """Escanea el directorio y sube los archivos."""
    log_to_mongo("info", f"Iniciando escaneo del directorio: {SYNC_DIRECTORY}")
    if not os.path.exists(SYNC_DIRECTORY):
        os.makedirs(SYNC_DIRECTORY)
        log_to_mongo("info", f"Directorio creado: {SYNC_DIRECTORY}")
        return

    for root, _, files in os.walk(SYNC_DIRECTORY):
        for filename in files:
            file_path = os.path.join(root, filename)
            object_name = os.path.relpath(file_path, SYNC_DIRECTORY).replace("", "/")
            
            log_to_mongo("info", f"Procesando archivo: {file_path}")
            upload_large_file(file_path, object_name)

# --- WEBSOCKET CLIENT ---

async def agent_loop():
    while True:
        try:
            async with websockets.connect(WS_URI, ssl=True) as websocket:
                log_to_mongo("info", "Conectado al servidor WebSocket de NetRunner.")
                await websocket.send(json.dumps({"status": "connected", "agent": "Sync-Node"}))

                async for message in websocket:
                    try:
                        data = json.loads(message)
                        if data.get("command") == "start_sync":
                            scan_and_upload()
                            await websocket.send(json.dumps({"status": "sync_complete"}))
                    except json.JSONDecodeError:
                        log_to_mongo("warning", f"Mensaje inválido recibido: {message}")

        except (websockets.exceptions.ConnectionClosed, ConnectionRefusedError) as e:
            log_to_mongo("error", f"Conexión perdida. Reintentando en 15 segundos... Error: {e}")
            await asyncio.sleep(15)
        except Exception as e:
            log_to_mongo("critical", f"Error inesperado en el agente: {e}")
            await asyncio.sleep(60)

if __name__ == "__main__":
    try:
        asyncio.run(agent_loop())
    except KeyboardInterrupt:
        log_to_mongo("info", "Agente detenido manualmente.")
