#!/bin/bash

echo "[*] NetRunner v5.0 - Inicializando..."

# 1. Comprobar Node.js
if ! command -v node &> /dev/null; then
    echo "[!] Error: Node.js no encontrado."
    exit 1
fi

# 2. Instalación (Si es necesaria)
if [ ! -d "node_modules" ]; then
    echo "[*] Instalando dependencias..."
    npm install --silent
fi

# 3. Matar instancias previas (Limpieza)
pkill -f "node server.js" 2>/dev/null

# 4. Arranque Fantasma (Detached)
echo "[*] Levantando Native Core..."
nohup npm start > /dev/null 2>&1 &

# Esperar a que levante
sleep 2

# 5. Abrir Navegador
echo "[*] Lanzando Interfaz..."
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000
elif command -v gnome-open &> /dev/null; then
    gnome-open http://localhost:3000
else
    echo "Abre manualmente: http://localhost:3000"
fi

exit 0
