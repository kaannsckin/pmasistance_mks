@echo off
setlocal
chcp 65001 >nul
title PlanAsistan
cd /d "%~dp0"

rem Kaynak koddan yerel başlatma (Node.js gerekir). Node kurulu değilse hazır exe'yi
rem GitHub sayfasındaki "Releases" bölümünden indirin: PlanAsistan-win-x64.zip

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi.
  echo Hazir exe icin GitHub sayfasindaki Releases bolumunden PlanAsistan-win-x64.zip dosyasini indirin
  echo ya da https://nodejs.org adresinden Node.js 22 LTS kurup bu dosyayi yeniden calistirin.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Bagimliliklar kuruluyor ^(ilk acilista bir kez^)...
  call npm ci --no-audit --no-fund || goto :hata
)
if not exist dist\index.html (
  echo Arayuz derleniyor ^(ilk acilista bir kez^)...
  call npm run build || goto :hata
)
if not exist dist-local\planasistan.cjs (
  call npm run build:local || goto :hata
)
node dist-local\planasistan.cjs
exit /b 0

:hata
echo Bir hata olustu; yukaridaki iletiye bakin.
pause
exit /b 1
