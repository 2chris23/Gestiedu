# 🚀 Scripts de Inicio - Sistema de Gestión Escolar

## 🖥️ Versiones Disponibles

Este proyecto incluye scripts tanto para **CMD** (`.bat`) como para **PowerShell** (`.ps1`).

### ¿Cuál usar?

- **PowerShell** (`.ps1`) - ✅ **Recomendado** - Mejor experiencia con colores y manejo de errores
- **CMD** (`.bat`) - Compatible con Command Prompt tradicional

---

## 📋 Scripts Disponibles

### 1. Setup Inicial Completo
**Cuándo usar:** Primera vez que configuras el proyecto o después de clonar el repositorio

**Qué hace:**
- ✅ Valida que Node.js y npm estén instalados
- ✅ Verifica versiones de Node.js y npm
- ✅ Crea archivo `.env` si no existe
- ✅ Instala todas las dependencias (optimizado con workspaces)
- ✅ Genera el cliente Prisma
- ✅ Sincroniza el esquema de base de datos
- ✅ Opcionalmente carga datos de prueba
- ✅ Inicia el sistema completo

**Uso:**

**PowerShell (Recomendado):**
```powershell
.\setup.ps1
```

**CMD:**
```cmd
setup_mvp_optimizado.bat
```

---

### 2. Inicio Rápido para Desarrollo
**Cuándo usar:** Día a día cuando ya tienes todo configurado

**Qué hace:**
- ✅ Verifica que las dependencias estén instaladas
- ✅ Verifica que Prisma esté configurado
- ✅ Inicia el sistema inmediatamente

**Uso:**

**PowerShell (Recomendado):**
```powershell
.\dev.ps1
```

**CMD:**
```cmd
dev.bat
```

---

### 3. Reset de Base de Datos
**Cuándo usar:** Cuando necesitas limpiar y recrear la base de datos

**Qué hace:**
- ⚠️ Elimina la base de datos actual
- ✅ Crea una nueva base de datos limpia
- ✅ Opcionalmente carga datos de prueba

**Uso:**

**PowerShell (Recomendado):**
```powershell
.\reset-db.ps1
```

**CMD:**
```cmd
reset-db.bat
```

---

### 4. Script Original (No Recomendado)
**Archivo:** `setup_mvp.bat`  
**Estado:** Obsoleto - Usar las versiones optimizadas

---

## 🔧 Mejoras Implementadas

### ❌ Problemas del Script Original

1. **Instalaciones redundantes**
   - Ejecutaba `npm install` 3 veces (raíz, backend, web)
   - Con workspaces solo se necesita 1 vez

2. **Sin validación de errores**
   - Continuaba ejecutándose aunque fallara algo
   - No verificaba requisitos previos

3. **Puerto incorrecto**
   - Documentaba puerto 3002 pero usa 3001

4. **Sin manejo de .env**
   - No verificaba si existía el archivo de configuración

### ✅ Soluciones Implementadas

1. **Instalación optimizada**
   - Una sola ejecución de `npm install` en la raíz
   - Aprovecha el sistema de workspaces de npm

2. **Validación completa**
   - Verifica Node.js y npm instalados
   - Valida versiones
   - Crea `.env` automáticamente si falta
   - Maneja errores en cada paso

3. **Información correcta**
   - Puertos correctos (3001 para backend, 3000 para frontend)
   - Incluye URL de documentación API

4. **Mejor experiencia**
   - Mensajes claros y organizados
   - Indicadores de progreso [1/5], [2/5], etc.
   - Códigos de salida apropiados

---

## 🌐 URLs del Sistema

Después de iniciar el sistema, accede a:

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Documentación API (Swagger):** http://localhost:3001/docs

---

## 📦 Requisitos Previos

- **Node.js:** v18.0.0 o superior
- **npm:** v8.0.0 o superior
- **Sistema Operativo:** Windows

---

## 🔄 Flujo de Trabajo Recomendado

### Primera Vez

**PowerShell (Recomendado):**
```powershell
# 1. Clonar el repositorio
git clone <url-del-repo>
cd SISTEMA-DE-GESTION-ESCOLAR

# 2. Ejecutar setup completo
.\setup.ps1
```

**CMD:**
```cmd
# 1. Clonar el repositorio
git clone <url-del-repo>
cd SISTEMA-DE-GESTION-ESCOLAR

# 2. Ejecutar setup completo
setup_mvp_optimizado.bat
```

### Desarrollo Diario

**PowerShell:**
```powershell
.\dev.ps1
```

**CMD:**
```cmd
dev.bat
```

### Cuando Necesites Limpiar la BD

**PowerShell:**
```powershell
.\reset-db.ps1
```

**CMD:**
```cmd
reset-db.bat
```

---

## 🐛 Solución de Problemas

### Error: "Node.js no está instalado"
**Solución:** Instala Node.js desde https://nodejs.org/ (versión LTS recomendada)

### Error: "No se encontró .env"
**Solución:** El script lo crea automáticamente desde `.env.example`. Si persiste, crea manualmente:
```bash
copy .env.example apps\backend\.env
```

### Error: "Fallo la instalación de dependencias"
**Solución:** 
1. Elimina `node_modules` y `package-lock.json`
2. Ejecuta `npm cache clean --force`
3. Vuelve a ejecutar `setup_mvp_optimizado.bat`

### El backend no inicia
**Solución:**
1. Verifica que el puerto 3001 no esté en uso
2. Revisa el archivo `apps\backend\.env`
3. Ejecuta `reset-db.bat` para recrear la base de datos

---

## 📊 Comparación de Rendimiento

| Aspecto | Script Original | Script Optimizado |
|---------|----------------|-------------------|
| Tiempo de instalación | ~5-8 min | ~3-5 min |
| Instalaciones npm | 3 veces | 1 vez |
| Validaciones | 0 | 5+ |
| Manejo de errores | No | Sí |
| Creación de .env | Manual | Automática |
| Mensajes de progreso | Básicos | Detallados |

---

## 💡 Consejos

1. **Usa `dev.bat` para desarrollo diario** - Es mucho más rápido
2. **Ejecuta `reset-db.bat` si los datos están corruptos** - Soluciona muchos problemas
3. **Revisa el archivo `.env`** - Asegúrate de que las variables estén correctas
4. **Mantén Node.js actualizado** - Usa la versión LTS más reciente

---

## 📝 Notas Adicionales

- Los scripts están optimizados para Windows
- Usan `npx turbo dev --parallel` para iniciar frontend y backend simultáneamente
- La base de datos es SQLite por defecto (archivo local)
- Los datos de seed son opcionales pero recomendados para desarrollo

---

## 🤝 Contribuir

Si encuentras algún problema o tienes sugerencias de mejora, por favor:
1. Documenta el problema
2. Propón una solución
3. Crea un pull request

---

**Última actualización:** 2026-01-05
