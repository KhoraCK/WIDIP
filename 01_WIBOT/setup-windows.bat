@echo off
:: ===========================================
:: WIBOT - Lanceur du script d'installation
:: ===========================================
:: Double-cliquez sur ce fichier pour installer
:: ===========================================

echo.
echo Lancement de l'installation WIBOT...
echo.

:: Lance PowerShell avec les bonnes permissions
powershell -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1"

:: Si PowerShell n'est pas disponible
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERREUR: Impossible de lancer PowerShell.
    echo Lancez manuellement: powershell -ExecutionPolicy Bypass -File setup-windows.ps1
    pause
)
