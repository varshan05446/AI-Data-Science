@echo off
echo ====================================
echo   DataMind AI - Development Server
====================================

echo.
echo [1/2] Starting Backend API (port 8000)...
start "DataMind API" /D "%~dp0services\api" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"

echo [2/2] Waiting for backend...
timeout /t 8 /nobreak >/dev/null

echo.
echo [2/2] Starting Frontend (port 3000)...
start "DataMind Web" /D "%~dp0apps\web" cmd /k "npx pnpm dev"

echo.
echo ====================================
echo   Servers starting!
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:3000
====================================
start http://localhost:3000
