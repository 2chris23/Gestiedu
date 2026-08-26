# ===================================================
#   SISTEMA DE GESTION ESCOLAR - MENU PRINCIPAL
# ===================================================

function Show-Menu {
    Clear-Host
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host "  SISTEMA DE GESTION ESCOLAR" -ForegroundColor Cyan
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Arquitectura de URLs:" -ForegroundColor DarkCyan
    Write-Host "  ┌─ localhost:3000              Sistema Principal" -ForegroundColor DarkCyan
    Write-Host "  ├─ super-admin.localhost:3000  SuperAdmin" -ForegroundColor DarkCyan
    Write-Host "  └─ [instituto].localhost:3000  Portal del Instituto" -ForegroundColor DarkCyan
    Write-Host ""
    Write-Host "  Selecciona una opcion:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  [1] Inicio Completo (Backend + Frontend)" -ForegroundColor Green
    Write-Host "      └─ Inicia todo el sistema en paralelo" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [2] Solo Backend (API)" -ForegroundColor Cyan
    Write-Host "      └─ http://localhost:3001/api" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [3] Solo Frontend (Web)" -ForegroundColor Cyan
    Write-Host "      └─ http://localhost:3000" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [4] Abrir SuperAdmin en navegador" -ForegroundColor Magenta
    Write-Host "      └─ http://super-admin.localhost:3000" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [5] Setup Completo" -ForegroundColor Yellow
    Write-Host "      └─ Instala dependencias y configura todo" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [6] Reset Base de Datos" -ForegroundColor Red
    Write-Host "      └─ Elimina y recrea la base de datos" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [7] Solo Instalar Dependencias" -ForegroundColor Yellow
    Write-Host "      └─ npm install en todos los workspaces" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [8] Solo Configurar Prisma" -ForegroundColor Yellow
    Write-Host "      └─ Genera cliente y sincroniza BD" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [9] Provisionar Instituto" -ForegroundColor Cyan
    Write-Host "      └─ Crea la BD de un instituto y su admin" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [10] Crear/Resetear SuperAdmin" -ForegroundColor Magenta
    Write-Host "      └─ Crea el superadmin si no existe o resetea su password" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [0] Salir" -ForegroundColor Red
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Start-DevServer {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host "  INICIANDO SISTEMA COMPLETO..." -ForegroundColor Cyan
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Verificar dependencias
    if (-not (Test-Path "node_modules")) {
        Write-Host "[ADVERTENCIA] No se encontraron dependencias" -ForegroundColor Yellow
        Write-Host "Ejecutando instalacion rapida..." -ForegroundColor Yellow
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Fallo la instalacion" -ForegroundColor Red
            Read-Host "Presiona Enter para volver al menu"
            return
        }
    }
    
    # Verificar Prisma
    if (-not (Test-Path "apps\backend\node_modules\.prisma")) {
        Write-Host "[ADVERTENCIA] Cliente Prisma no encontrado" -ForegroundColor Yellow
        Write-Host "Generando cliente Prisma..."
        Push-Location apps\backend
        npx prisma generate
        Pop-Location
    }
    
    Write-Host ""
    Write-Host "  ===================================================" -ForegroundColor Cyan
    Write-Host "  ARQUITECTURA DE URLS" -ForegroundColor Cyan
    Write-Host "  ===================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  ┌─ SISTEMA PRINCIPAL" -ForegroundColor Green
    Write-Host "  │   http://localhost:3000" -ForegroundColor White
    Write-Host "  │   (Login y portal del sistema base)" -ForegroundColor Gray
    Write-Host "  │" -ForegroundColor DarkCyan
    Write-Host "  ├─ SUPERADMIN" -ForegroundColor Magenta
    Write-Host "  │   http://super-admin.localhost:3000" -ForegroundColor White
    Write-Host "  │   (Gestion de institutos)" -ForegroundColor Gray
    Write-Host "  │" -ForegroundColor DarkCyan
    Write-Host "  └─ PORTALES DE INSTITUTOS" -ForegroundColor Yellow
    Write-Host "      http://[slug].localhost:3000" -ForegroundColor White
    Write-Host "      (Ejemplo: http://san-miguel.localhost:3000)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Backend API: http://localhost:3001/api" -ForegroundColor DarkCyan
    Write-Host "  API Docs:    http://localhost:3001/docs" -ForegroundColor DarkCyan
    Write-Host ""
    Write-Host "  Presiona Ctrl+C para detener" -ForegroundColor Yellow
    Write-Host "  ===================================================" -ForegroundColor Cyan
    Write-Host ""
    
    npx turbo dev --parallel
}

function Start-BackendOnly {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host "  INICIANDO BACKEND..." -ForegroundColor Cyan
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Verificar Prisma
    if (-not (Test-Path "apps\backend\node_modules\.prisma")) {
        Write-Host "[ADVERTENCIA] Cliente Prisma no encontrado" -ForegroundColor Yellow
        Write-Host "Generando cliente Prisma..."
        Push-Location apps\backend
        npx prisma generate
        Pop-Location
    }
    
    Write-Host ""
    Write-Host "  Backend:  http://localhost:3001" -ForegroundColor Cyan
    Write-Host "  API Docs: http://localhost:3001/docs" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Presiona Ctrl+C para detener" -ForegroundColor Yellow
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host ""
    
    Push-Location apps\backend
    npm run dev
    Pop-Location
}

function Start-FrontendOnly {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host "  INICIANDO FRONTEND..." -ForegroundColor Cyan
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Frontend: http://localhost:3000" -ForegroundColor Cyan
    Write-Host "  SuperAdmin: http://localhost:3000/superadmin/login" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "Presiona Ctrl+C para detener" -ForegroundColor Yellow
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host ""
    
    Push-Location apps\web
    npm run dev
    Pop-Location
}

function Open-SuperAdmin {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host "  ABRIENDO SUPERADMIN..." -ForegroundColor Cyan
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host ""
    
    $url = "http://super-admin.localhost:3000"
    
    # Verificar si el frontend está corriendo
    try {
        Invoke-WebRequest -Uri "http://localhost:3000" -Method Head -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
        Write-Host "[OK] Frontend detectado en http://localhost:3000" -ForegroundColor Green
        Write-Host ""
        Write-Host "Abriendo SuperAdmin: $url" -ForegroundColor Yellow
        Start-Process $url
        Write-Host ""
        Write-Host "SuperAdmin abierto en: $url" -ForegroundColor Green
    }
    catch {
        Write-Host "[ADVERTENCIA] Frontend no está corriendo" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "¿Deseas iniciar el frontend ahora? (S/N)" -ForegroundColor Yellow
        $start = Read-Host
        if ($start -eq "S" -or $start -eq "s") {
            Start-FrontendOnly
        }
        else {
            Write-Host ""
            Write-Host "Usa la opcion [3] para iniciar el frontend primero" -ForegroundColor Yellow
        }
    }
    
    Read-Host "Presiona Enter para volver al menu"
}

function Start-FullSetup {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host "  SETUP COMPLETO" -ForegroundColor Cyan
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Validar Node.js
    Write-Host "[1/5] Validando requisitos..." -ForegroundColor Yellow
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "[ERROR] Node.js no esta instalado" -ForegroundColor Red
        Read-Host "Presiona Enter para volver al menu"
        return
    }
    $nodeVersion = node -v
    Write-Host "[OK] Node.js $nodeVersion" -ForegroundColor Green
    
    # Verificar .env
    if (-not (Test-Path "apps\backend\.env")) {
        Write-Host "[ADVERTENCIA] Creando archivo .env..." -ForegroundColor Yellow
        if (Test-Path ".env.example") {
            Copy-Item .env.example apps\backend\.env
            Write-Host "[OK] Archivo .env creado" -ForegroundColor Green
        }
        else {
            Write-Host "[ERROR] No se encontro .env.example" -ForegroundColor Red
            Read-Host "Presiona Enter para volver al menu"
            return
        }
    }
    
    # Instalar dependencias
    Write-Host ""
    Write-Host "[2/5] Instalando dependencias..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Fallo la instalacion" -ForegroundColor Red
        Read-Host "Presiona Enter para volver al menu"
        return
    }
    Write-Host "[OK] Dependencias instaladas" -ForegroundColor Green
    
    # Configurar Prisma
    Write-Host ""
    Write-Host "[3/5] Configurando Prisma..." -ForegroundColor Yellow
    Push-Location apps\backend
    
    npx prisma generate
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Fallo Prisma generate" -ForegroundColor Red
        Pop-Location
        Read-Host "Presiona Enter para volver al menu"
        return
    }
    
    npx prisma db push
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Fallo Prisma db push" -ForegroundColor Red
        Pop-Location
        Read-Host "Presiona Enter para volver al menu"
        return
    }
    Write-Host "[OK] Prisma configurado" -ForegroundColor Green
    
    Pop-Location
    
    # Seed
    Write-Host ""
    Write-Host "[4/5] Datos iniciales..." -ForegroundColor Yellow
    $seed = Read-Host "¿Cargar datos de prueba? (S/N)"
    if ($seed -eq "S" -or $seed -eq "s") {
        Push-Location apps\backend
        npx prisma db seed
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Datos cargados" -ForegroundColor Green
        }
        Pop-Location
    }
    
    # Iniciar
    Write-Host ""
    Write-Host "[5/5] ¿Iniciar el sistema ahora? (S/N)" -ForegroundColor Yellow
    $start = Read-Host
    if ($start -eq "S" -or $start -eq "s") {
        Start-DevServer
    }
    else {
        Write-Host ""
        Write-Host "Setup completado! Usa la opcion [1] para iniciar." -ForegroundColor Green
        Read-Host "Presiona Enter para volver al menu"
    }
}

function Reset-Database {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host "  RESET DE BASE DE DATOS" -ForegroundColor Cyan
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[ADVERTENCIA] Esto eliminara TODOS los datos" -ForegroundColor Red
    Write-Host ""
    $confirm = Read-Host "¿Continuar? (S/N)"
    
    if ($confirm -ne "S" -and $confirm -ne "s") {
        Write-Host "Operacion cancelada" -ForegroundColor Yellow
        Read-Host "Presiona Enter para volver al menu"
        return
    }
    
    Push-Location apps\backend
    
    if (Test-Path "prisma\dev.db") {
        Remove-Item -Force prisma\dev.db
        Write-Host "[OK] Base de datos eliminada" -ForegroundColor Green
    }
    
    npx prisma db push --force-reset
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Fallo la creacion" -ForegroundColor Red
        Pop-Location
        Read-Host "Presiona Enter para volver al menu"
        return
    }
    Write-Host "[OK] Base de datos creada" -ForegroundColor Green
    
    Write-Host ""
    $seed = Read-Host "¿Cargar datos de prueba? (S/N)"
    if ($seed -eq "S" -or $seed -eq "s") {
        npx prisma db seed
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Datos cargados" -ForegroundColor Green
        }
    }
    
    Pop-Location
    
    Write-Host ""
    Write-Host "Reset completado!" -ForegroundColor Green
    Read-Host "Presiona Enter para volver al menu"
}

function Install-Dependencies {
    Write-Host ""
    Write-Host "Instalando dependencias..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Dependencias instaladas" -ForegroundColor Green
    }
    else {
        Write-Host "[ERROR] Fallo la instalacion" -ForegroundColor Red
    }
    Read-Host "Presiona Enter para volver al menu"
}

function Initialize-Prisma {
    Write-Host ""
    Write-Host "Configurando Prisma..." -ForegroundColor Yellow
    Push-Location apps\backend
    
    npx prisma generate
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Cliente generado" -ForegroundColor Green
    }
    
    npx prisma db push
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Base de datos sincronizada" -ForegroundColor Green
    }
    
    Pop-Location
    Read-Host "Presiona Enter para volver al menu"
}

function Seed-SuperAdmin {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Magenta
    Write-Host "  CREAR / RESETEAR SUPERADMIN" -ForegroundColor Magenta
    Write-Host "===================================================" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "  Esto crea el SuperAdmin en la platform DB" -ForegroundColor Gray
    Write-Host "  o resetea su contraseña si ya existe." -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Email: admin@tuapp.com" -ForegroundColor Cyan
    Write-Host "  Pass:  SuperAdmin2026!" -ForegroundColor Cyan
    Write-Host ""

    npx tsx apps/backend/src/scripts/seed-superadmin.ts

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "[OK] SuperAdmin listo!" -ForegroundColor Green
        Write-Host "  URL:   http://super-admin.localhost:3000" -ForegroundColor Cyan
        Write-Host "  Email: admin@tuapp.com" -ForegroundColor Cyan
        Write-Host "  Pass:  SuperAdmin2026!" -ForegroundColor Cyan
    } else {
        Write-Host "[ERROR] Fallo el seed del SuperAdmin" -ForegroundColor Red
    }

    Read-Host "Presiona Enter para volver al menu"
}

function Provision-Institute {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host "  PROVISIONAR INSTITUTO" -ForegroundColor Cyan
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Esto crea la base de datos del instituto y su admin." -ForegroundColor Gray
    Write-Host "  Usa el slug del instituto (ej: san-miguel)" -ForegroundColor Gray
    Write-Host ""
    $slug = Read-Host "Slug del instituto"
    if (-not $slug) {
        Write-Host "[ERROR] Slug requerido" -ForegroundColor Red
        Read-Host "Presiona Enter para volver al menu"
        return
    }

    Write-Host ""
    Write-Host "Provisionando '$slug'..." -ForegroundColor Yellow
    Write-Host ""

    npx tsx apps/backend/src/scripts/reprovision-institute.ts $slug

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "[OK] Instituto '$slug' provisionado!" -ForegroundColor Green
        Write-Host "  URL: http://$slug.localhost:3000" -ForegroundColor Cyan
        Write-Host "  Login: admin@$slug.com / Admin2026!" -ForegroundColor Cyan
    } else {
        Write-Host "[ERROR] Fallo el provisioning" -ForegroundColor Red
    }

    Read-Host "Presiona Enter para volver al menu"
}

# ===================================================
# MENU PRINCIPAL
# ===================================================

while ($true) {
    Show-Menu
    $choice = Read-Host "Opcion"
    
    switch ($choice) {
        "1" { Start-DevServer }
        "2" { Start-BackendOnly }
        "3" { Start-FrontendOnly }
        "4" { Open-SuperAdmin }
        "5" { Start-FullSetup }
        "6" { Reset-Database }
        "7" { Install-Dependencies }
        "8" { Initialize-Prisma }
        "9" { Provision-Institute }
        "10" { Seed-SuperAdmin }
        "0" { 
            Write-Host ""
            Write-Host "Hasta luego!" -ForegroundColor Cyan
            exit 
        }
        default { 
            Write-Host ""
            Write-Host "Opcion invalida" -ForegroundColor Red
            Start-Sleep -Seconds 1
        }
    }
}
