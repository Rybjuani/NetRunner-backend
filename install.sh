#!/bin/bash
# NetRunner Sync-Node - Linux Installer

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXE_NAME="netrunner_agent"
TARGET_DIR="$HOME/.local/bin"
DATA_DIR="$HOME/.local/share/netrunner"
SERVICE_NAME="netrunner-sync.service"

echo "=== NetRunner Sync-Node Installer ==="

if [ ! -f "$SCRIPT_DIR/$EXE_NAME" ]; then
    echo "[ERROR] No se encontró $EXE_NAME"
    exit 1
fi

echo "[1/4] Creando directorios..."
mkdir -p "$TARGET_DIR"
mkdir -p "$DATA_DIR"

echo "[2/4] Copiando ejecutable..."
cp "$SCRIPT_DIR/$EXE_NAME" "$TARGET_DIR/"
chmod +x "$TARGET_DIR/$EXE_NAME"

echo "[3/4] Configurando servicio systemd..."
mkdir -p "$HOME/.config/systemd/user"

cat > "$HOME/.config/systemd/user/$SERVICE_NAME" << EOF
[Unit]
Description=NetRunner Sync-Node Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$TARGET_DIR/$EXE_NAME
Restart=on-failure
RestartSec=10
Environment=XDG_DATA_HOME=$DATA_DIR

[Install]
WantedBy=default.target
EOF

echo "[4/4] Habilitando servicio..."
systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME" 2>/dev/null || true
systemctl --user start "$SERVICE_NAME"

sleep 1

if systemctl --user is-active --quiet "$SERVICE_NAME"; then
    echo "=== Completado ==="
    echo "Ejecutable: $TARGET_DIR/$EXE_NAME"
    echo "Datos: $DATA_DIR"
    echo "Servicio: $SERVICE_NAME"
else
    echo "[WARN] Verificar con: systemctl --user status $SERVICE_NAME"
fi
