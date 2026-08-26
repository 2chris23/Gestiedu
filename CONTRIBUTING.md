# Contribuyendo al Sistema de Gestión Escolar

¡Gracias por tu interés en contribuir! Este documento te guiará en el proceso.

## 📋 Código de Conducta

- Sé respetuoso con todos los colaboradores
- Acepta críticas constructivas
- Enfócate en lo mejor para el proyecto

## 🚀 Cómo Contribuir

### 1. Fork y Clone

```bash
# Fork el repositorio en GitHub
# Luego clona tu fork
git clone https://github.com/TU-USUARIO/Cristian.git
cd SISTEMA-DE-GESTION-ESCOLAR
```

### 2. Crea una Rama

```bash
git checkout -b feature/mi-nueva-funcionalidad
# o
git checkout -b fix/correccion-de-bug
```

### 3. Haz tus Cambios

- Escribe código limpio y bien documentado
- Sigue las convenciones de código del proyecto
- Agrega pruebas si es posible

### 4. Commit

```bash
git add .
git commit -m "feat: descripción clara del cambio"
```

**Convenciones de commits:**
- `feat:` Nueva funcionalidad
- `fix:` Corrección de bug
- `docs:` Cambios en documentación
- `style:` Cambios de formato (no afectan el código)
- `refactor:` Refactorización de código
- `test:` Agregar o modificar tests
- `chore:` Tareas de mantenimiento

### 5. Push y Pull Request

```bash
git push origin feature/mi-nueva-funcionalidad
```

Luego crea un Pull Request en GitHub con:
- Descripción clara de los cambios
- Referencias a issues relacionados
- Screenshots si aplica

## 🐛 Reportar Bugs

Crea un issue con:
- Descripción del problema
- Pasos para reproducir
- Comportamiento esperado vs actual
- Screenshots o logs si aplica
- Información del sistema (OS, versión de Node, etc.)

## 💡 Sugerir Funcionalidades

Crea un issue con:
- Descripción de la funcionalidad
- Casos de uso
- Beneficios para el proyecto

## 📝 Estándares de Código

### TypeScript
- Usa tipos explícitos
- Evita `any` cuando sea posible
- Documenta funciones complejas

### React/Next.js
- Componentes funcionales con hooks
- Props tipadas con TypeScript
- Nombres descriptivos para componentes

### Backend/Fastify
- Validación de datos con DTOs
- Manejo de errores apropiado
- Documentación de endpoints

## ✅ Checklist antes de PR

- [ ] El código compila sin errores
- [ ] Los tests pasan
- [ ] La documentación está actualizada
- [ ] El código sigue las convenciones del proyecto
- [ ] Los commits tienen mensajes descriptivos

## 🤝 ¿Necesitas Ayuda?

- Abre un issue con la etiqueta `question`
- Revisa issues existentes
- Contacta a los mantenedores

¡Gracias por contribuir! 🎉
