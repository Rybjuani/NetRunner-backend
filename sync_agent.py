# sync_agent.py - NetRunner Sync-Node v2.0 (Robust Edition)

import asyncio
import websockets
import json
import os
import time
import ssl
from pymongo import MongoClient

# --- CONFIGURACIÓN ---
WS_URI = "wss://netrunner-pro.up.railway.app/"
MONGO_URI = "mongodb+srv://ffasito:Reputo11.@rybjuani.ewuurhu.mongodb.net/?appName=rybjuani"
SYNC_DIRECTORY = os.path.expanduser("~/Documents/NetRunner_Sync")
CHUNK_SIZE = 1024 * 1024  # 1MB
HEARTBEAT_INTERVAL = 30  # segundos
MAX_RECONNECT_DELAY = 60  # segundos

# --- INICIALIZACIÓN ---
mongo_client = MongoClient(MONGO_URI)
db = mongo_client.netrunner_logs
log_collection = db.sync_agent_logs

ssl_context = ssl.create_default_context()
ssl_context.check_hostname = True
ssl_context.verify_mode = ssl.CERT_REQUIRED

# --- FUNCIONES CORE ---

def log_to_mongo(level, message, metadata={}):
    print(f"[{level.upper()}] {message}")
    log_collection.insert_one({
        "level": level,
        "message": message,
        "timestamp": time.time(),
        "agent": "Sync-Node v2.0",
        **metadata
    })

async def upload_file_in_chunks(websocket, file_path):
    """Lee un archivo y lo envía en pedazos (chunks) por el WebSocket."""
    filename = os.path.basename(file_path)
    log_to_mongo("info", f"Iniciando subida de {filename}")

    try:
        with open(file_path, 'rb') as f:
            chunk_index = 0
            while True:
                chunk = f.read(CHUNK_SIZE)
                if not chunk:
                    break  # Fin del archivo
                
                # Enviar metadatos y el chunk
                await websocket.send(json.dumps({
                    "type": "file_chunk",
                    "filename": filename,
                    "chunk_index": chunk_index,
                    "is_last": False
                }))
                await websocket.send(chunk) # Enviar el chunk como binario
                
                chunk_index += 1
            
            # Enviar señal de fin de archivo
            await websocket.send(json.dumps({
                "type": "file_chunk",
                "filename": filename,
                "is_last": True
            }))
            log_to_mongo("info", f"Subida de {filename} completada.")
    except FileNotFoundError:
        log_to_mongo("error", f"Archivo no encontrado: {file_path}")
    except Exception as e:
        log_to_mongo("error", f"Error al subir {filename}: {e}")

async def scan_and_upload(websocket):
    if not os.path.exists(SYNC_DIRECTORY):
        os.makedirs(SYNC_DIRECTORY)
    
    for filename in os.listdir(SYNC_DIRECTORY):
        file_path = os.path.join(SYNC_DIRECTORY, filename)
        if os.path.isfile(file_path):
            await upload_file_in_chunks(websocket, file_path)

# --- WEBSOCKET CLIENT CON RECONEXIÓN Y HEARTBEAT ---

async def agent_handler():
    reconnect_delay = 1
    
    while True:
        try:
            async with websockets.connect(WS_URI, ssl=ssl_context) as websocket:
                log_to_mongo("info", "Conectado al servidor de NetRunner.")
                reconnect_delay = 1  # Resetear delay en conexión exitosa

                # Tarea de Heartbeat
                async def heartbeat():
                    while True:
                        await asyncio.sleep(HEARTBEAT_INTERVAL)
                        await websocket.send(json.dumps({"type": "ping"}))
                
                heartbeat_task = asyncio.create_task(heartbeat())

                # Loop de mensajes
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        if data.get("command") == "start_sync":
                            await scan_and_upload(websocket)
                        elif data.get("type") == "pong":
                            log_to_mongo("debug", "Heartbeat respondido.")
                    except json.JSONDecodeError:
                        log_to_mongo("warning", f"Mensaje no JSON: {message}")
                
                heartbeat_task.cancel()

        except (websockets.exceptions.ConnectionClosed, ConnectionRefusedError, OSError) as e:
            log_to_mongo("error", f"Conexión perdida: {e}. Reintentando en {reconnect_delay}s.")
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, MAX_RECONNECT_DELAY)
        except Exception as e:
            log_to_mongo("critical", f"Error crítico: {e}. Reintentando en {MAX_RECONNECT_DELAY}s.")
            await asyncio.sleep(MAX_RECONNECT_DELAY)

if __name__ == "__main__":
    try:
        asyncio.run(agent_handler())
    except KeyboardInterrupt:
        log_to_mongo("info", "Agente detenido por el usuario.")
