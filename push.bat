@echo off
cd /d "%~dp0"
echo ========================================================
echo INICIANDO ATUALIZACAO DO GITHUB E NETLIFY...
echo ========================================================
git add .
git commit -m "Dashboard and Map Overhaul with AI Insights"

echo.
echo [1/2] Sincronizando e resolvendo conflitos do GitHub...
git pull origin main --rebase

echo.
echo [2/2] Enviando a versao final corrigida (App.jsx)...
git push origin main

echo.
echo ========================================================
echo FINALIZADO! O Netlify vai processar a versao correta agora.
echo Pressione qualquer tecla para fechar.
pause
