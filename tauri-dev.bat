@echo off
chcp 65001 >nul
cd /d "%~dp0"
call "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
if errorlevel 1 (
  echo [CoreFTP] 未找到 VS Build Tools，请安装或使用: npm run tauri:dev
  pause
  exit /b 1
)
echo [CoreFTP] 正在启动开发模式...
npx tauri dev
pause
