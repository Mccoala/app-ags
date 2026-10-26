@echo off
cd /d "%~dp0"
echo ========================================================
echo SINCRONIZACAO FORCADA - AGS IND
echo ========================================================

:: Limpa travas do git
git rebase --abort 2>nul
git merge --abort 2>nul

echo [1/2] Adicionando arquivos...
git add src/App.jsx

echo [2/2] Criando commit de seguranca...
git commit -m "Update: Forced synchronization for Netlify deploy"

echo Enviando para o GitHub...
git push origin main --force

echo.
echo ========================================================
echo PRONTO! Verifique o Netlify em 1 minuto.
pause
