# Script para reemplazar DATETIME por TIMESTAMP en todas las migraciones

$migrationsPath = "C:\Users\Windows\Cristian\SISTEMA-DE-GESTION-ESCOLAR\apps\backend\src\prisma\migrations"

Write-Host "Buscando archivos .sql con DATETIME..." -ForegroundColor Cyan

# Buscar todos los archivos .sql que contienen DATETIME
$files = Get-ChildItem -Path $migrationsPath -Filter "*.sql" -Recurse | Where-Object {
    (Get-Content $_.FullName -Raw) -match "DATETIME"
}

Write-Host "Encontrados $($files.Count) archivos con DATETIME" -ForegroundColor Yellow

foreach ($file in $files) {
    Write-Host "Procesando: $($file.Name)" -ForegroundColor Gray
    
    # Leer contenido
    $content = Get-Content $file.FullName -Raw
    
    # Reemplazar DATETIME por TIMESTAMP
    $newContent = $content -replace 'DATETIME', 'TIMESTAMP'
    
    # Guardar
    Set-Content -Path $file.FullName -Value $newContent -NoNewline
}

Write-Host "Reemplazo completado en $($files.Count) archivos" -ForegroundColor Green
