# SystemBridge ClientNode - Windows Installer
# Ejecutar como usuario normal (sin admin)

param(
    [string]$ExePath = "$PSScriptRoot\SystemBridge_Installer.exe"
)

$ErrorActionPreference = "Stop"

Write-Host "=== SystemBridge ClientNode Installer ===" -ForegroundColor Cyan

$TargetDir = "$env:LOCALAPPDATA\SystemBridge"
$TaskName = "SystemBridgeSync"

if (-not (Test-Path $ExePath)) {
    Write-Host "[ERROR] No se encontró SystemBridge_Installer.exe en $ExePath" -ForegroundColor Red
    exit 1
}

Write-Host "[1/4] Creando directorio de instalación..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $TargetDir -Force -ErrorAction SilentlyContinue | Out-Null

Write-Host "[2/4] Copiando ejecutable..." -ForegroundColor Yellow
Copy-Item -Path $ExePath -Destination $TargetDir -Force

$ExeFullPath = Join-Path $TargetDir "SystemBridge_Installer.exe"

Write-Host "[3/4] Configurando tarea programada..." -ForegroundColor Yellow

$TaskDescription = "SystemBridge ClientNode Service"

$Action = New-ScheduledTaskAction -Execute $ExeFullPath -WorkingDirectory $TargetDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

try {
    $ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($ExistingTask) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }

    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description $TaskDescription -RunLevel Limited | Out-Null
    Write-Host "    Tarea creada" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] $_" -ForegroundColor Red
    exit 1
}

Write-Host "[4/4] Verificando..." -ForegroundColor Yellow
Start-Sleep -Seconds 1
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Host "=== Instalación completada ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Ejecutable: $ExeFullPath"
    Write-Host "Datos: $TargetDir"
    Write-Host "Tarea: $TaskName (inicia con sesión)"
} else {
    Write-Host "[ERROR] Falló verificación" -ForegroundColor Red
    exit 1
}
