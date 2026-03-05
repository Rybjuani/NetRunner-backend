@echo off
title NetRunner Loader
echo [NetRunner] Inicializando protocolos de seguridad...

:: 1. Verificación de entorno
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no detectado. NetRunner requiere Node.js para operar.
    pause
    exit
)

:: 2. Instalación silenciosa de dependencias
if not exist "node_modules" (
    echo [NetRunner] Desplegando modulos...
    call npm install --silent
)

:: 3. Arranque del Núcleo en Segundo Plano (Invisible)
echo [NetRunner] Conectando con el nucleo del sistema...
start /B npm start > nul 2>&1

:: 4. Espera tactica para arranque del servidor
timeout /t 3 /nobreak > nul

:: 5. Lanzar Interfaz
echo [NetRunner] Acceso concedido.
start http://localhost:3000

:: Cierra esta ventana terminal, el servidor sigue corriendo
exit
