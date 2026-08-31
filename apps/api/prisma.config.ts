import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Configuración de Prisma 7.
 *
 * Desde la versión 7 la URL de conexión ya no vive en `schema.prisma`: Migrate la
 * lee de acá y el cliente la recibe por adapter (ver src/prisma/prisma.service.ts).
 * Un solo lugar define la conexión, y no queda una credencial embebida en un archivo
 * que se lee como si fuera solo esquema.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
