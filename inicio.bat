@echo off
setlocal enabledelayedexpansion

:MENU
cls
echo.
echo ===================================================
echo   SISTEMA DE GESTION ESCOLAR
echo ===================================================
echo.
echo   Selecciona una opcion:
echo.
echo   [1] Inicio Rapido (dev)
echo       - Inicia el sistema (uso diario)
echo.
echo   [2] Setup Completo
echo       - Instala dependencias y configura todo
echo.
echo   [3] Reset Base de Datos
echo       - Elimina y recrea la base de datos
echo.
echo   [4] Solo Instalar Dependencias
echo       - npm install en todos los workspaces
echo.
echo   [5] Solo Configurar Prisma
echo       - Genera cliente y sincroniza BD
echo.
echo   [0] Salir
echo.
echo ===================================================
echo.

set /p CHOICE="Opcion: "

if "%CHOICE%"=="1" goto DEV
if "%CHOICE%"=="2" goto SETUP
if "%CHOICE%"=="3" goto RESET
if "%CHOICE%"=="4" goto INSTALL
if "%CHOICE%"=="5" goto PRISMA
if "%CHOICE%"=="0" goto EXIT

echo.
echo Opcion invalida
timeout /t 2 >nul
goto MENU

:DEV
cls
echo.
echo ===================================================
echo   INICIANDO SISTEMA...
echo ===================================================
echo.

REM Verificar dependencias
if not exist "node_modules" (
    echo [ADVERTENCIA] No se encontraron dependencias
    echo Ejecutando instalacion rapida...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Fallo la instalacion
        pause
        goto MENU
    )
)

REM Verificar Prisma
if not exist "apps\backend\node_modules\.prisma" (
    echo [ADVERTENCIA] Cliente Prisma no encontrado
    echo Generando cliente Prisma...
    cd apps\backend
    call npx prisma generate
    cd ..\..
)

echo.
echo   Backend:  http://localhost:3001
echo   Frontend: http://localhost:3000
echo   API Docs: http://localhost:3001/docs
echo.
echo Presiona Ctrl+C para detener
echo ===================================================
echo.

npx turbo dev --parallel
goto MENU

:SETUP
cls
echo.
echo ===================================================
echo   SETUP COMPLETO
echo ===================================================
echo.

echo [1/5] Validando requisitos...
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no esta instalado
    pause
    goto MENU
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [OK] Node.js %NODE_VERSION%

REM Verificar .env
if not exist "apps\backend\.env" (
    echo [ADVERTENCIA] Creando archivo .env...
    if exist ".env.example" (
        copy .env.example apps\backend\.env >nul
        echo [OK] Archivo .env creado
    ) else (
        echo [ERROR] No se encontro .env.example
        pause
        goto MENU
    )
)

echo.
echo [2/5] Instalando dependencias...
call npm install
if errorlevel 1 (
    echo [ERROR] Fallo la instalacion
    pause
    goto MENU
)
echo [OK] Dependencias instaladas

echo.
echo [3/5] Configurando Prisma...
cd apps\backend

call npx prisma generate
if errorlevel 1 (
    echo [ERROR] Fallo Prisma generate
    cd ..\..
    pause
    goto MENU
)

call npx prisma db push
if errorlevel 1 (
    echo [ERROR] Fallo Prisma db push
    cd ..\..
    pause
    goto MENU
)
echo [OK] Prisma configurado

cd ..\..

echo.
echo [4/5] Datos iniciales...
set /p SEED="¿Cargar datos de prueba? (S/N): "
if /i "%SEED%"=="S" (
    cd apps\backend
    call npx prisma db seed
    if not errorlevel 1 echo [OK] Datos cargados
    cd ..\..
)

echo.
echo [5/5] Setup completado!
set /p START="¿Iniciar el sistema ahora? (S/N): "
if /i "%START%"=="S" goto DEV

echo.
echo Setup completado! Usa la opcion [1] para iniciar.
pause
goto MENU

:RESET
cls
echo.
echo ===================================================
echo   RESET DE BASE DE DATOS
echo ===================================================
echo.
echo [ADVERTENCIA] Esto eliminara TODOS los datos
echo.
set /p CONFIRM="¿Continuar? (S/N): "

if /i not "%CONFIRM%"=="S" (
    echo Operacion cancelada
    pause
    goto MENU
)

cd apps\backend

if exist "prisma\dev.db" (
    del /f /q prisma\dev.db
    echo [OK] Base de datos eliminada
)

call npx prisma db push --force-reset
if errorlevel 1 (
    echo [ERROR] Fallo la creacion
    cd ..\..
    pause
    goto MENU
)
echo [OK] Base de datos creada

echo.
set /p SEED="¿Cargar datos de prueba? (S/N): "
if /i "%SEED%"=="S" (
    call npx prisma db seed
    if not errorlevel 1 echo [OK] Datos cargados
)

cd ..\..

echo.
echo Reset completado!
pause
goto MENU

:INSTALL
cls
echo.
echo Instalando dependencias...
call npm install
if not errorlevel 1 (
    echo [OK] Dependencias instaladas
) else (
    echo [ERROR] Fallo la instalacion
)
pause
goto MENU

:PRISMA
cls
echo.
echo Configurando Prisma...
cd apps\backend

call npx prisma generate
if not errorlevel 1 echo [OK] Cliente generado

call npx prisma db push
if not errorlevel 1 echo [OK] Base de datos sincronizada

cd ..\..
pause
goto MENU

:EXIT
echo.
echo Hasta luego!
exit /b 0
