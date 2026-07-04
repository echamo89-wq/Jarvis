@echo off
title JARVIS - SISTEMA CENTRAL
color 0b
if exist "%SystemRoot%\system32\chcp.com" chcp 65001 >nul

echo ====================================================
echo      INICIALIZANDO SISTEMAS CENTRALES DE JARVIS
echo ====================================================
echo.
echo [*] Cargando variables de entorno (.env)...
echo [*] Iniciando interfaz de usuario y proceso Electron...
echo.
npm start
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Ocurrio un fallo al iniciar JARVIS.
    echo Verifique que Node.js y las dependencias esten correctamente instaladas.
    echo.
    pause
)
