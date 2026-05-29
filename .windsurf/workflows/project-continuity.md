---
description: Como continuar el desarrollo del proyecto Motors ApliSmart desde cualquier PC
---

# Workflow de Continuidad - Motors ApliSmart

## Prerrequisitos

- Node.js 20+
- PostgreSQL 15+ (opcional: usar DB del VPS)
- Git (si aplica)
- Acceso SSH al VPS: llave en `.ssh-aplismart-motors-temp`

## Setup inicial en nueva PC

1. **Navegar al proyecto**:
   ```
   cd "C:\ApliSmart\Proyectos App\motors-aplismart"
   ```

2. **Instalar dependencias del backend**:
   ```
   cd apps/api
   npm install
   ```

3. **Instalar dependencias del frontend**:
   ```
   cd ../web
   npm install
   ```

4. **Configurar variables de entorno**:
   - Copiar `apps/api/.env.example` a `apps/api/.env`
   - Completar `DB_PASSWORD` y `MASTER_PASSWORD` (solicitar al admin)
   - Crear `apps/web/.env.local`:
     ```
     NEXT_PUBLIC_API_URL=http://localhost:3300
     ```

5. **Base de datos**:
   - Opcion A: Instalar PostgreSQL local y crear DB `aplismart_motors`
   - Opcion B: Conectar a la DB del VPS (configurar DB_HOST con IP del VPS)

## Desarrollo diario

### Iniciar backend
```
cd apps/api
npm run start:dev
```
Servidor en http://localhost:3300

### Iniciar frontend
```
cd apps/web
npm run dev
```
Servidor en http://localhost:3000

## Despliegue al VPS

1. **Build local**:
   ```
   cd apps/web
   npm run build
   ```

2. **Crear paquete de deploy**:
   ```
   # En Windows PowerShell (desde raiz del proyecto)
   cd apps/web
   npm run build
   cd ..
   tar -czf web-deploy.tar.gz web/dist web/package.json web/.next
   ```

3. **Subir al VPS**:
   ```
   scp -i .ssh-aplismart-motors-temp web-deploy.tar.gz root@86.48.20.113:/tmp/
   ```

4. **Extraer y reiniciar en VPS**:
   ```
   ssh -i .ssh-aplismart-motors-temp root@86.48.20.113
   cd /www/wwwroot/motors.aplismart.com
   tar -xzf /tmp/web-deploy.tar.gz
   # Reiniciar el proceso PM2
   pm2 restart aplismart-motors-web
   ```

## Conexion SSH al VPS

```bash
ssh -i .ssh-aplismart-motors-temp root@86.48.20.113
```

Rutas importantes en el VPS:
- Proyecto: `/www/wwwroot/motors.aplismart.com`
- PM2 logs: `pm2 logs aplismart-motors-web`

## Notas de seguridad

- NUNCA commitear `.env` ni `.ssh-aplismart-motors-temp`
- Mantener la llave SSH segura; no compartir
- Cambiar contrasenas por defecto antes de deploy

## Troubleshooting

| Problema | Solucion |
|----------|----------|
| Error de symlink en Windows al extraer tar.gz | Excluir `node_modules` y reinstalar con `npm install` |
| Puerto 3300 ocupado | Cambiar `PORT` en `apps/api/.env` |
| Error de conexion a DB | Verificar `DB_HOST`, `DB_PORT`, credenciales |
| Build de web falla | Verificar `NEXT_PUBLIC_API_URL` en `.env.local` |

## Contacto y soporte

- Admin: aplicrm@gmail.com
- VPS: 86.48.20.113
- URL produccion: https://motors.aplismart.com
