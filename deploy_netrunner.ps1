# NetRunner Sync-Node - Deployment Script
# Descarga, instala y configura el agente de sincronización

param(
    [string]$ServerUrl = "https://netrunner-pro.up.railway.app",
    [switch]$Silent = $false
)

$ErrorActionPreference = "Stop"

# Colores para output
function Write-Step { param([string]$Msg) Write-Host "[SETUP] $Msg" -ForegroundColor Cyan }
function Write-Success { param([string]$Msg) Write-Host "[OK] $Msg" -ForegroundColor Green }
function Write-Warn { param([string]$Msg) Write-Host "[WARN] $Msg" -ForegroundColor Yellow }
function Write-Fail { param([string]$Msg) Write-Host "[ERROR] $Msg" -ForegroundColor Red }

# Configuración
$AppName = "NetRunnerAgent"
$InstallDir = "$env:LOCALAPPDATA\$AppName"
$TaskName = "NetRunnerSync"
$DownloadUrl = "$ServerUrl/api/download/agent"
$LogFile = "$InstallDir\install.log"

# Crear directorio de instalación
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# Función de logging
function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $Message" | Out-File -FilePath $LogFile -Append -Encoding UTF8
}

# Iniciar log
Write-Log "========================================="
Write-Log "NetRunner Sync-Node Deployment"
Write-Log "========================================="
Write-Log "Install Directory: $InstallDir"
Write-Log "Server: $ServerUrl"

Write-Step "Iniciando instalación..."

# Descargar binario
$BinaryPath = Join-Path $InstallDir "netrunner_agent.exe"

try {
    Write-Step "Descargando agente desde $DownloadUrl..."
    Write-Log "Descargando binario..."
    
    # Usar WebClient para descarga
    $WebClient = New-Object System.Net.WebClient
    $WebClient.DownloadFile($DownloadUrl, $BinaryPath)
    $WebClient.Dispose()
    
    Write-Log "Descarga completada: $BinaryPath"
    
} catch {
    Write-Fail "Error descargando el agente: $_"
    Write-Log "ERROR: $_"
    exit 1
}

# Verificar descarga
if (-not (Test-Path $BinaryPath)) {
    Write-Fail "El archivo descargado no existe"
    exit 1
}

$FileSize = (Get-Item $BinaryPath).Length
Write-Log "Archivo descargado: $FileSize bytes"

# Desbloquear archivo
Write-Step "Desbloqueando archivo..."
try {
    Unblock-File -Path $BinaryPath -ErrorAction SilentlyContinue
    Write-Log "Archivo desbloqueado"
} catch {
    Write-Warn "No se pudo desbloquear (puede requerir admin)"
}

# Configurar tarea programada
Write-Step "Configurando tarea programada..."

$TaskDescription = "NetRunner Sync-Node Asset Synchronization"
$Action = New-ScheduledTaskAction -Execute $BinaryPath -WorkingDirectory $InstallDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

try {
    # Eliminar tarea anterior si existe
    $ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($ExistingTask) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Log "Tarea anterior eliminada"
    }
    
    # Registrar nueva tarea
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description $TaskDescription -RunLevel Limited | Out-Null
    
    Write-Log "Tarea programada creada: $TaskName"
    Write-Success "Tarea programada configurada"
    
} catch {
    Write-Fail "Error configurando tarea: $_"
    Write-Log "ERROR: $_"
    exit 1
}

# Iniciar el servicio inmediatamente (opcional)
Write-Step "Iniciando agente..."
try {
    Start-ScheduledTask -TaskName $TaskName
    Write-Log "Agente iniciado manualmente"
    Write-Success "Agente iniciado"
} catch {
    Write-Warn "No se pudo iniciar automáticamente (se ejecutará al reiniciar)"
}

# Verificar instalación
Write-Step "Verificando instalación..."
Start-Sleep -Seconds 2

$TaskCheck = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($TaskCheck) {
    Write-Log "Verificación: INSTALACIÓN EXITOSA"
    Write-Success "NetRunner Sync-Node instalado correctamente"
    Write-Host ""
    Write-Host "Información de instalación:" -ForegroundColor White
    Write-Host "  - Ejecutable: $BinaryPath" -ForegroundColor Gray
    Write-Host "  - Tarea: $TaskName (inicia con sesión)" -ForegroundColor Gray
    Write-Host "  - Log: $LogFile" -ForegroundColor Gray
    Write-Host ""
    Write-Host "El agente se conectará automáticamente al servidor." -ForegroundColor Green
    
    exit 0
} else {
    Write-Fail "Verificación fallida"
    Write-Log "VERIFICACIÓN FALLIDA"
    exit 1
}
