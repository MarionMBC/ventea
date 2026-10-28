# Carolina Hot Chicken: instalación dedicada (TASK-027)

Primer cliente, fuera del SaaS: `TENANT_MODE=single`, Postgres, `JWT_SECRET` y medios propios.
Misma VPS compartida de VIAJU (`37.60.228.46`) y mismo host (`carolina-hot-chicken.ventea.tech`)
**por ahora**; cuando tenga servidor o dominio propios se mueve el compose y se cambia `HOST`.
Código idéntico al del SaaS (ADR 0006, `docs/deployment.md#instalación-dedicada`); no hay fork.

| Qué                          | Dónde                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| Compose                      | `~/carolina-prod/docker-compose.yml` (proyecto `carolina-prod`)                        |
| Secretos                     | `~/carolina-prod/.env` (0600, generado en la VPS, nunca en el repo)                    |
| Contraseña inicial del dueño | `~/carolina-prod/owner-password.txt` (0600): cambiarla al entrar y borrar el archivo   |
| Ruta Traefik                 | `/etc/traefik/dynamic/carolina-prod.yml` (plantilla: `carolina-prod.route.yml`)        |
| Panel                        | `https://carolina-hot-chicken.ventea.tech/admin` (dueño `demo@admin.com`, provisional) |

## Puesta en marcha

```bash
mkdir -p ~/carolina-prod && cd ~/carolina-prod       # copiar acá docker-compose.yml y copy-users.sh
# .env: IMAGE_API, IMAGE_WEB (etiquetas concretas, nunca latest), HOST, TENANT_SLUG,
#       POSTGRES_USER/DB/PASSWORD, DATABASE_URL, JWT_SECRET (openssl rand -base64 48, distinto al de ventea-test)
docker compose up -d
docker compose exec -T api node apps/api/dist/scripts/create-tenant.js \
  --slug carolina-hot-chicken --name "Carolina Hot Chicken" --owner-email demo@admin.com --currency USD
./copy-users.sh                                      # cuentas de la base de pruebas (sin pedidos)
docker cp carolina-hot-chicken-menu.json carolina-prod-api-1:/tmp/menu.json
docker compose exec -T api node apps/api/dist/scripts/import-menu.js --tenant carolina-hot-chicken --file /tmp/menu.json
# fotos: desde el repo, contra la API pública (ver tools/brand-app/maps/carolina-hot-chicken-dedicated.json)
```

## Cambio de ruta sin cortar el host

1. Publicar `carolina-prod.route.yml` (prioridades 200/150 > las 100/10 de la ruta vieja): el host pasa al stack nuevo.
2. En `~/ventea-test/.env` agregar `EXCLUDE_SLUGS=carolina-hot-chicken`: el cron de `sync-routes.sh` deja de
   publicar la ruta vieja de Carolina (solo ese slug; las otras marcas no se tocan).
3. Verificar contra el sitio, no contra el comando: `/api/health`, panel y menú.

## Rollback

La base de pruebas (con el tenant y sus datos viejos) no se borra. Para volver: quitar `EXCLUDE_SLUGS`,
borrar `/etc/traefik/dynamic/carolina-prod.yml` (Traefik recarga solo; el cron republica la ruta vieja en ≤ 1 min)
y `docker compose -p carolina-prod stop`. No usar `down -v` hasta decidir descartar la base nueva.

## Actualizar

`IMAGE_API` / `IMAGE_WEB` a la etiqueta nueva en `.env` → `docker compose up -d` (migra solo: el servicio
`migrate` corre antes de la API). Respaldo previo: `docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backup-$(date +%F-%H%M).sql.gz`.
