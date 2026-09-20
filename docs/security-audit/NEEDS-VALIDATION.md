# Aspectos Pendientes de Validación en Despliegue (Needs Validation)
**Sistema de Gestión Escolar Multi-Liceo**  
**ID de Ejecución**: `run-20260919-01`

Los siguientes elementos fueron analizados en el código fuente pero dependen decisivamente de configuraciones en la infraestructura de producción que residen fuera del repositorio local.

---

### 1. needs-val-cloud-tls-and-reverse-proxy
* **Título**: Terminación TLS en Producción y Protección del Servidor de Origen
* **Hipótesis**: La configuración de Nginx (`docker/nginx/nginx.conf`) incluye reglas de redirección HTTPS, HSTS y cifrados modernos. Sin embargo, los certificados SSL (`fullchain.pem` y `privkey.pem`) y la configuración de Cloudflare (WAF y túneles) residen en el entorno de despliegue.
* **Riesgo Potencial**: Si el puerto del servidor de origen está expuesto a Internet sin pasar por Cloudflare, los atacantes podrían eludir las reglas de WAF o enviar tráfico HTTP sin cifrar.
* **Bloqueador**: Los certificados y reglas de red perimetrales son externos al código fuente.
* **Plan de Validación**:
  1. **Verificación Local**: Inspeccionar los volúmenes en `docker-compose.prod.yml` y confirmar la existencia de certificados válidos en `/etc/nginx/certs`.
  2. **Verificación en Producción**: Comprobar que el firewall del host (AWS Security Groups / Hetzner / iptables) bloquee el tráfico directo al puerto 443/80 proveniente de IPs que no pertenezcan al rango oficial de Cloudflare, o utilizar Cloudflare Authenticated Origin Pulls (AOP).

---

### 2. needs-val-database-per-tenant-isolation-permissions
* **Título**: Restricción de Privilegios de Usuario PostgreSQL por Base de Datos de Inquilino
* **Hipótesis**: La arquitectura del sistema asigna una base de datos física independiente para cada liceo. Sin embargo, la cadena de conexión `DATABASE_URL` suele utilizar un usuario global configurado en el servidor PostgreSQL.
* **Riesgo Potencial**: Si el usuario configurado en PostgreSQL posee privilegios de superusuario (`SUPERUSER`) o permisos de lectura global sobre todas las bases de datos del cluster, un fallo en el backend podría permitir lecturas cruzadas entre bases de datos de distintos liceos.
* **Bloqueador**: Los roles de PostgreSQL y los permisos de `pg_hba.conf` se gestionan en la instancia del servidor de base de datos en tiempo de ejecución.
* **Plan de Validación**:
  1. **Verificación Local**: Ejecutar `\du` en `psql` para auditar los roles asignados al usuario de la aplicación.
  2. **Verificación en Producción**: Asegurar que cada base de datos de inquilino posea un usuario restringido sin privilegios sobre `pg_database` ni sobre bases de datos de otros liceos.
