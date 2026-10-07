@echo off
title BUYEST Video Studio Install
echo.
echo  Installing BUYEST Video Studio. Please wait 5-10 minutes.
echo  Do not close this window.
echo.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$u='https://buyestkorea-code.github.io/studio/install.ps1'; if($env:BUYEST_STUDIO_BASE){$u=$env:BUYEST_STUDIO_BASE+'/install.ps1'}; $f=Join-Path $env:TEMP 'buyest-install.ps1'; try{ Invoke-WebRequest $u -OutFile $f -UseBasicParsing }catch{ Write-Host 'Could not download the installer. Check your internet connection.' -ForegroundColor Red; Read-Host 'Press Enter'; exit 1 }; & $f"
if errorlevel 1 pause
