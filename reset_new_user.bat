@echo off
title JARVIS - RESET NUEVO USUARIO
color 0c
if exist "%SystemRoot%\system32\chcp.com" chcp 65001 >nul

echo ====================================================
echo      JARVIS - RESET A NUEVO USUARIO
echo ====================================================
echo.
echo [!] Esto borrara todos los datos del usuario local:
echo     - API Key guardada
echo     - Nombre y configuracion
echo     - Historial de sesion
echo.
echo Presiona cualquier tecla para continuar o CTRL+C para cancelar...
pause >nul

echo.
echo [*] Iniciando JARVIS en modo reset...
npm start -- --reset

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Ocurrio un fallo al iniciar JARVIS.
    pause
)
