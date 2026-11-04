param([string]$PiAddress='192.168.32.20')
$ErrorActionPreference='Stop'
if($PiAddress -notmatch '^[a-zA-Z0-9.-]+$'){throw 'Ogiltig Pi-adress.'}
$script=Join-Path $PSScriptRoot 'event-tunnel.ps1'
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -File "'+$script+'" -PiAddress '+$PiAddress)
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $user
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'ElRusty Events Tunnel' -Action $action -Trigger $trigger -Settings $settings -Description 'Privat Oxide-eventtunnel till ElRusty på Pi, oberoende av dashboarden.' -Force | Out-Null
Start-ScheduledTask -TaskName 'ElRusty Events Tunnel'
Write-Output 'Eventtunneln startas nu och vid din Windows-inloggning.'
