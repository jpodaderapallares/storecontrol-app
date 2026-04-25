@echo off
cd /d "%~dp0\.."
del /F /Q .git\index.lock 2>nul

git add vercel.json src\components\ui\Badge.tsx src\lib\database.types.ts src\pages\admin\Alertas.tsx src\pages\admin\BaseDetail.tsx src\pages\admin\Config.tsx src\pages\admin\Dashboard.tsx supabase\functions\send-recordatorios\index.ts docs\PASOS_PENDIENTES_NOTIFICACIONES.md scripts\upload_pdfs.py scripts\upload_pdfs.bat scripts\deploy_fix.bat package-lock.json

git commit -m "fix(deploy): SPA rewrite Vercel + matriz notificaciones + cleanup"
git push origin main

echo.
echo Push enviado. Vercel desplegara en 60-90s.
pause
