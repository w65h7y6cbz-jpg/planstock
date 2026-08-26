@echo off
rem ============================================================================
rem  PlanStock — lance le serveur local et ouvre le navigateur.
rem  Double-cliquez sur ce fichier. Fermez cette fenetre pour arreter PlanStock.
rem ============================================================================
setlocal
cd /d "%~dp0"
title PlanStock - serveur local (fermer cette fenetre pour arreter)

rem --- Node.js est-il installe ? -------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js n'est pas installe sur ce PC.
  echo   Telechargez la version LTS sur https://nodejs.org/fr puis relancez ce fichier.
  echo.
  pause
  exit /b 1
)

rem --- PlanStock tourne-t-il deja ? ----------------------------------------
powershell -NoProfile -Command "try{Invoke-WebRequest -UseBasicParsing 'http://localhost:4823/api/health' -TimeoutSec 2|Out-Null;exit 0}catch{exit 1}" >nul 2>nul
if not errorlevel 1 (
  echo   PlanStock tourne deja : ouverture du navigateur.
  start "" http://localhost:4823
  exit /b 0
)

rem --- Premiere utilisation : dependances et interface ----------------------
if not exist "node_modules\" (
  echo   Premiere utilisation : installation des composants ^(quelques minutes^)...
  call npm install || goto :erreur
)
if not exist "web\dist\index.html" (
  echo   Preparation de l'interface...
  call npm run build || goto :erreur
)

rem --- Ouvre le navigateur des que le serveur repond ------------------------
start "" /b powershell -NoProfile -WindowStyle Hidden -Command ^
  "for($i=0;$i -lt 60;$i++){try{Invoke-WebRequest -UseBasicParsing 'http://localhost:4823/api/health' -TimeoutSec 1|Out-Null;Start-Process 'http://localhost:4823';break}catch{Start-Sleep -Milliseconds 500}}"

echo.
echo   PlanStock demarre sur http://localhost:4823
echo   Gardez cette fenetre ouverte pendant l'utilisation.
echo.
node server\index.js
goto :fin

:erreur
echo.
echo   L'installation a echoue. Verifiez la connexion Internet ^(necessaire
echo   uniquement pour cette premiere installation^) et relancez ce fichier.
echo.
pause
exit /b 1

:fin
echo.
echo   PlanStock est arrete.
pause
