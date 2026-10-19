# Crear el proyecto de Google para la copia en Drive

Pasos para hacer juntos (Cristian y Claude) cuando se monte la copia automática en el Drive de cada liceo (`docs/RESPALDOS-Y-PAPELERA.md`). Todo es gratis.

## Lo que ya está listo

- La página de **privacidad**: `https://<tu-dominio>/legal/privacidad`. Ya dice cómo se usa Drive y menciona la política de uso limitado de Google.
- Los **términos**: `https://<tu-dominio>/legal/terminos`.
- La **página principal**: `https://<tu-dominio>/`.

Google pide esas tres direcciones. Para eso **hace falta un dominio propio** (`gestiedu.com` o similar). Con la dirección del túnel (`*.ts.net`) Google no verifica la app.

## Los pasos

1. **Entrar** a [console.cloud.google.com](https://console.cloud.google.com) con la cuenta de Google que será la «dueña» de Gestiedu. Mejor una cuenta solo para Gestiedu, no la personal.
2. **Crear el proyecto:** «Nuevo proyecto», con el nombre `Gestiedu`.
3. **Activar la API de Drive:** «APIs y servicios» → «Biblioteca» → *Google Drive API* → Habilitar.
4. **Pantalla de consentimiento de OAuth** («APIs y servicios» → «Pantalla de consentimiento»):
   - **Tipo:** externo.
   - **Datos de la app:**
     - nombre: Gestiedu;
     - correo de soporte;
     - logo de Gestiedu (120×120).
   - **Direcciones:**
     - página principal;
     - política de privacidad (`/legal/privacidad`);
     - términos (`/legal/terminos`).
   - **Dominios autorizados:** el dominio de Gestiedu.
   - **Permisos (scopes):** solo `https://www.googleapis.com/auth/drive.file`. No añadir `drive` (el Drive entero): es un permiso **restringido** y exige una auditoría de seguridad anual de pago.
5. **Crear las credenciales** («Credenciales» → «Crear credenciales» → «ID de cliente de OAuth»):
   - **Tipo:** aplicación web.
   - **URI de redirección autorizada:** `https://<tu-dominio>/api/drive/vuelta`. La crea Claude en el código y debe coincidir exacto.
   - Se guardan el **ID de cliente** y el **secreto** en el `.env` del servidor (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`), **nunca en el código ni en el chat**.
6. **Publicar la app:** en la pantalla de consentimiento, pasar de «Prueba» a **«En producción»**. En modo de prueba las autorizaciones **caducan a los 7 días**, y la copia dejaría de subirse a la semana sin avisar.
7. **Verificación de Google:**
   - **Qué pide:** con `drive.file` (permiso no sensible) basta la verificación de la marca: el dominio verificado en Google Search Console y las páginas de arriba.
   - **Cuánto tarda:** suele tardar unos días.
   - **Hasta entonces:** la app funciona, pero Google enseña un aviso de «app no verificada».

## Lo que hará Claude después

- **Conectar el Drive:** en Configuración → «Descargar todos los datos», el botón «Conectar el Drive del liceo» (lo pulsa el director con la cuenta de Google del liceo).
- **La copia semanal:** el mismo ZIP con contraseña de «Descargar todos los datos», subido solo cada semana. Se guardan las últimas copias y se borran las viejas.
- **El aviso por correo** de que la copia se hizo, o de que falló.
- **En el panel de Salud:** «última copia en Drive» por liceo, en rojo con más de 2 días.

## Fuentes

- [Elegir los permisos de la API de Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google Workspace: seguridad de las apps de terceros en Drive](https://workspace.google.com/blog/product-announcements/enhancing-security-controls-for-google-drive-third-party-apps?e=48754805)
- [Configurar Google Cloud y OAuth (llaves que caducan en modo de prueba)](https://developers.google.com/health/setup)
