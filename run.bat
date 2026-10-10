@echo off
chcp 65001 >nul
title Laboratory System
echo.
echo ========================================
echo   Laboratory System - سیستم مدیریت آزمایشگاه
echo ========================================
echo.
echo در حال باز کردن برنامه در مرورگر پیش‌فرض...
echo.

start "" "%CD%\index.html"

echo برنامه باز شد.
echo برای بستن این پنجره کلید Enter را بزنید.
pause >nul
