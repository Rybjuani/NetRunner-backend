# setup_windows_task.ps1

$scriptPath = (Get-Item -Path ".").FullName + "\sync_agent.py"
$pythonPath = (Get-Command python).Source

$action = New-ScheduledTaskAction -Execute $pythonPath -Argument $scriptPath
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -GroupId "BUILTIN\Administrators" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -Action $action -Trigger $trigger -TaskName "NetRunnerSyncNode" -Description "Agente de sincronizacion de NetRunner" -Principal $principal -Settings $settings
