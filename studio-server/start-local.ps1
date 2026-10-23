$ErrorActionPreference = 'Stop'
$studioPort = 4317
try {
    $studioConfig = Invoke-RestMethod -Uri "http://127.0.0.1:$studioPort/api/config" -TimeoutSec 2
    if ($studioConfig.local) { Write-Output "BUYEST Studio: http://127.0.0.1:$studioPort/studio-next/"; exit 0 }
} catch { }
$studioRuntime = Join-Path $PSScriptRoot '.runtime'
New-Item -ItemType Directory -Path $studioRuntime -Force | Out-Null
$studioNode = (Get-Command node -ErrorAction Stop).Source
$studioProcess = Start-Process -FilePath $studioNode -ArgumentList @('--env-file-if-exists=.env', 'server.mjs') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $studioRuntime 'server.log') -RedirectStandardError (Join-Path $studioRuntime 'error.log')
Set-Content -LiteralPath (Join-Path $studioRuntime 'server.pid') -Value $studioProcess.Id
Write-Output "BUYEST Studio: http://127.0.0.1:$studioPort/studio-next/ (PID $($studioProcess.Id))"
