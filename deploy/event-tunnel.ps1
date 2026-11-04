param([string]$PiAddress='192.168.32.20')
$ErrorActionPreference='Stop'
$key=Join-Path $PSScriptRoot '..\.private\pi-access'
if(-not(Test-Path -LiteralPath $key)){throw 'SSH-nyckeln saknas i .private/pi-access.'}
if($PiAddress -notmatch '^[a-zA-Z0-9.-]+$'){throw 'Ogiltig Pi-adress.'}
$mutex=New-Object Threading.Mutex($false,'Local\ElRustyEventsTunnel')
if(-not $mutex.WaitOne(0)){exit 0}
try {
 while($true) {
  & ssh.exe -NT -i $key -o BatchMode=yes -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=2 -L '127.0.0.1:5184:127.0.0.1:5184' ('noone@'+$PiAddress) 2>$null
  Start-Sleep -Seconds 5
 }
} finally {$mutex.ReleaseMutex();$mutex.Dispose()}
