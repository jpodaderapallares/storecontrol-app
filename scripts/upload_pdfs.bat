@echo off
rem ============================================================
rem  Carga masiva de PDFs (biblioteca tecnica + formatos) a Supabase
rem  Uso: doble click sobre este archivo.
rem ============================================================

cd /d "%~dp0"

where py >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python no esta instalado o no esta en el PATH.
  echo  - Descarga Python desde https://www.python.org/downloads/
  echo  - Durante la instalacion, marca "Add Python to PATH".
  pause
  exit /b 1
)

echo === Instalando dependencia 'supabase' (si falta)...
py -m pip install --quiet supabase --user
if errorlevel 1 (
  echo ERROR instalando supabase. Revisa tu conexion a internet.
  pause
  exit /b 1
)

echo.
echo === Subiendo PDFs...
py "%~dp0upload_pdfs.py"
set RC=%errorlevel%

echo.
if %RC%==0 (
  echo OK. Carga completa.
) else (
  echo Termino con errores. Revisa el log de arriba.
)
pause
exit /b %RC%
