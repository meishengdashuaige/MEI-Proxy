@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo ============================================
echo  MEIProxy 认证注入代理 - 一键启动
echo  自动测速选择最快 Ghelper 节点
echo  本地端口: 8899
echo ============================================
echo.
node demo/auth-proxy.js --node auto --port 8899
echo.
echo 代理已停止。按任意键关闭窗口...
pause >nul
