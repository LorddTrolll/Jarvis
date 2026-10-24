@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" goto setup
if not exist "frontend\dist\index.html" goto setup
goto run
:setup
py -3 scripts\setup.py
if errorlevel 1 goto failed
:run
py -3 scripts\launch.py
if errorlevel 1 goto failed
exit /b 0
:failed
echo Nao foi possivel iniciar o Jarvis. Confira a mensagem acima.
pause
exit /b 1
