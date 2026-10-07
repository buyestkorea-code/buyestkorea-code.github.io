# BUYEST 영상 스튜디오 원클릭 설치 (Windows PowerShell 5.1 이상)
# 이 파일은 BUYEST-Studio-Install.bat 이 내려받아 실행합니다. 다시 실행하면 최신 버전으로 갱신됩니다.
$ErrorActionPreference = "Stop"
$Base = if ($env:BUYEST_STUDIO_BASE) { $env:BUYEST_STUDIO_BASE } else { "https://buyestkorea-code.github.io/studio" }
$Dir  = if ($env:BUYEST_STUDIO_DIR)  { $env:BUYEST_STUDIO_DIR }  else { Join-Path $env:LOCALAPPDATA "BUYEST-Studio" }
$Desktop = if ($env:BUYEST_DESKTOP_DIR) { $env:BUYEST_DESKTOP_DIR } else { [Environment]::GetFolderPath("Desktop") }
$Startup = if ($env:BUYEST_STARTUP_DIR) { $env:BUYEST_STARTUP_DIR } else { [Environment]::GetFolderPath("Startup") }
$NoLaunch = [bool]$env:BUYEST_NO_LAUNCH
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Step($m) { Write-Host ""; Write-Host "▶ $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host ""; Write-Host "✗ $m" -ForegroundColor Red; Write-Host "  이 화면을 캡처해서 담당자에게 보내주세요."; Read-Host "Enter 를 누르면 닫힙니다"; exit 1 }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User") }
function Has($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function Winget-Install($id) {
  if (-not (Has "winget")) { throw "winget 이 없습니다. Microsoft Store 에서 '앱 설치 관리자'를 업데이트한 뒤 다시 실행하세요." }
  winget install -e --id $id --accept-source-agreements --accept-package-agreements
  Refresh-Path
}

try {
  Write-Host "BUYEST 영상 스튜디오 설치를 시작합니다." -ForegroundColor Cyan
  Write-Host "인터넷이 연결돼 있어야 하고, 5~10분 걸립니다. 중간에 '허용하시겠습니까?' 창이 뜨면 '예'를 누르세요."

  Step "1/5  Node.js 확인"
  $needNode = $true
  if (Has "node") { $major = [int](((node -v) -replace "v","").Split(".")[0]); if ($major -ge 22) { $needNode = $false } }
  if ($needNode) { Winget-Install "OpenJS.NodeJS.LTS" }
  if (-not (Has "node")) { Fail "Node.js 설치 후 이 창을 닫고 설치 파일을 다시 실행해 주세요." }
  Write-Host "Node $(node -v)"

  Step "2/5  FFmpeg 확인"
  if (-not (Has "ffmpeg")) { try { Winget-Install "Gyan.FFmpeg" } catch { Write-Host "FFmpeg 설치는 건너뜁니다 (릴스 만들기에는 필요 없습니다)." } }

  Step "3/5  스튜디오 내려받기"
  $latest = Invoke-RestMethod "$Base/latest.json?t=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
  $zip = Join-Path $env:TEMP "buyest-studio-$($latest.version).zip"
  Invoke-WebRequest "$Base/$($latest.file)" -OutFile $zip -UseBasicParsing
  if ($latest.sha256 -and ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLower() -ne $latest.sha256.ToLower())) { Fail "내려받은 파일이 손상되었습니다. 다시 실행해 주세요." }
  $stage = Join-Path $env:TEMP "buyest-studio-stage"
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::ExtractToDirectory($zip, $stage)
  New-Item -ItemType Directory -Force $Dir | Out-Null
  # 이미 설치돼 있으면 작업물(jobs, out)·로그인(sessions.json)·설치된 패키지(node_modules)는 그대로 둡니다
  Get-ChildItem (Join-Path $stage "buyest-video-studio") -Force | Where-Object { $_.Name -notin @("node_modules","jobs","out","vendor","sessions.json") } | Copy-Item -Destination $Dir -Recurse -Force
  Remove-Item $stage -Recurse -Force; Remove-Item $zip -Force
  Write-Host "설치 위치: $Dir  (버전 $($latest.version))"

  Step "4/5  필요한 부품 설치 (가장 오래 걸립니다)"
  Push-Location $Dir
  npm install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail "부품 설치(npm install)에 실패했습니다." }
  npx remotion browser ensure
  try { npx --yes hyperframes browser ensure } catch { Write-Host "자막 합성용 브라우저는 건너뜁니다." }
  Pop-Location

  Step "5/5  바탕화면 아이콘 만들기"
  $sh = New-Object -ComObject WScript.Shell
  foreach ($spec in @(@{Dir=$Desktop; Args=""}, @{Dir=$Startup; Args="auto"})) {
    if (-not (Test-Path $spec.Dir)) { New-Item -ItemType Directory -Force $spec.Dir | Out-Null }
    $lnk = $sh.CreateShortcut((Join-Path $spec.Dir "BUYEST 영상 스튜디오.lnk"))
    $lnk.TargetPath = Join-Path $Dir "start.bat"
    $lnk.Arguments = $spec.Args
    $lnk.WorkingDirectory = $Dir
    $lnk.WindowStyle = 7   # 최소화로 실행
    $lnk.Save()
  }
  Write-Host "바탕화면에 'BUYEST 영상 스튜디오' 아이콘을 만들었습니다. (PC를 켜면 자동으로 준비됩니다)"

  Write-Host ""
  Write-Host "✓ 설치 완료!" -ForegroundColor Green
  if (-not $NoLaunch) {
    Write-Host "잠시 후 브라우저에서 스튜디오가 열립니다. 아래 최소화된 검은 창은 닫지 마세요."
    Start-Process (Join-Path $Dir "start.bat") -WorkingDirectory $Dir -WindowStyle Minimized
    Start-Sleep 4
  }
} catch {
  Fail $_.Exception.Message
}
