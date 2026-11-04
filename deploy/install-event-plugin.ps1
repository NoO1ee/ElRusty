param([Parameter(Mandatory=$true)][string]$ProfileId,[string]$RustServerPath='C:\rustserver',[string]$PiAddress='192.168.32.20')
$ErrorActionPreference='Stop'
if($ProfileId -notmatch '^[a-fA-F0-9-]{36}$' -or $PiAddress -notmatch '^[a-zA-Z0-9.-]+$'){throw 'Ogiltig profil eller Pi-adress.'}
$serverRoot=[IO.Path]::GetFullPath($RustServerPath)
$oxide=Join-Path $serverRoot 'oxide'
if(-not(Test-Path -LiteralPath $oxide -PathType Container)){throw 'Oxide saknas i vald servermapp. Installera och starta Oxide först.'}
$private=Join-Path $PSScriptRoot '..\.private\event-plugins'
New-Item -ItemType Directory -Path $private -Force | Out-Null
$target=Join-Path $private ($ProfileId+'.json')
$key=Join-Path $PSScriptRoot '..\.private\pi-access'
$raw=& ssh.exe -i $key -o BatchMode=yes -o StrictHostKeyChecking=yes ('noone@'+$PiAddress) ('sudo -n cat /var/lib/elrusty/event-plugins/'+$ProfileId+'.json') 2>$null
if($LASTEXITCODE -ne 0){throw 'Privat pluginfil kunde inte hämtas. Skapa den i ElRusty och kontrollera SSH/sudo-åtkomst.'}
try{$settings=($raw -join "`n")|ConvertFrom-Json}catch{throw 'Pluginfilen är ogiltig.'}
if($settings.ProfileId -ne $ProfileId -or $settings.Key -notmatch '^[a-f0-9]{64}$' -or $settings.Endpoint -ne 'http://127.0.0.1:5184/ingest'){throw 'Plugininställningen har fel profil eller format.'}
[IO.File]::WriteAllText($target,($raw -join "`n"))
New-Item -ItemType Directory -Path (Join-Path $oxide 'config'),(Join-Path $oxide 'plugins') -Force | Out-Null
Copy-Item -LiteralPath $target -Destination (Join-Path $oxide 'config\ElRustyEvents.json') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\plugins\ElRustyEvents.cs') -Destination (Join-Path $oxide 'plugins\ElRustyEvents.cs') -Force
$raw=$null;$settings=$null
Write-Output 'Privat plugininställning och ElRustyEvents är installerade. Starta eventtunneln och kontrollera status i ElRusty.'
