import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { Inject, Injectable, Logger } from '@nestjs/common';

import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { MediaStorage } from './media-storage';
import { MEDIA_FILE_PATTERN, TENANT_ID_PATTERN } from './media-url';

/**
 * Un archivo sin registro más nuevo que esto puede ser de una subida en curso (el registro se
 * crea en la misma transacción, antes de escribir): no se toca.
 */
export const ORPHAN_MIN_AGE_MS = 60 * 60_000;

/** Temporal de `MediaStorage.write` que quedó de un proceso cortado a mitad. */
const TEMP_FILE_PATTERN =
  /^[0-9a-f]{64}(\.thumb)?\.webp\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/;

export interface MediaGcRun {
  /** Marcas revisadas y salteadas (una subida o un borrado tenía el lock de medios). */
  tenants: number;
  skipped: number;
  removedFiles: number;
  removedBytes: number;
}

/**
 * GC de archivos huérfanos de medios (TASK-025): si la transacción de una subida falla después
 * de escribir, el archivo queda en el volumen sin registro. Borra, por marca, los `<hash>.webp`
 * y `<hash>.thumb.webp` sin `MediaAsset` y los temporales de escrituras cortadas, siempre que
 * tengan más de `ORPHAN_MIN_AGE_MS`.
 *
 * Cada marca se revisa con su lock de medios (el mismo que subidas, borrados y referencias)
 * tomado con try: si está ocupado, la marca queda para la próxima vuelta. Con el lock tomado
 * ninguna subida puede estar entre «el archivo ya existe» y su registro, y dos réplicas nunca
 * revisan la misma marca a la vez. Solo mira carpetas con forma de tenantId y archivos con forma
 * de medio: nada más del volumen se borra.
 */
@Injectable()
export class MediaGc {
  private readonly logger = new Logger(MediaGc.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly storage: MediaStorage,
  ) {}

  /** `shouldStop`: el apagado corta entre marcas, nunca a mitad de una. */
  async run(now = new Date(), shouldStop: () => boolean = () => false): Promise<MediaGcRun> {
    const run: MediaGcRun = { tenants: 0, skipped: 0, removedFiles: 0, removedBytes: 0 };
    for (const tenantId of await this.tenantDirs()) {
      if (shouldStop()) break;
      run.tenants += 1;
      const swept = await this.sweepTenant(tenantId, now.getTime() - ORPHAN_MIN_AGE_MS);
      if (!swept) {
        run.skipped += 1;
        continue;
      }
      run.removedFiles += swept.files;
      run.removedBytes += swept.bytes;
    }
    if (run.removedFiles > 0) {
      this.logger.log(
        `Medios huérfanos borrados: ${run.removedFiles} archivos (${run.removedBytes} bytes)`,
      );
    }
    return run;
  }

  private async tenantDirs(): Promise<string[]> {
    try {
      const entries = await readdir(this.storage.root, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && TENANT_ID_PATTERN.test(entry.name))
        .map((entry) => entry.name);
    } catch (error) {
      // Sin carpeta de medios todavía (nadie subió nada): no hay qué limpiar.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  /** `null` si el lock de medios de la marca estaba tomado. */
  private async sweepTenant(
    tenantId: string,
    olderThan: number,
  ): Promise<{ files: number; bytes: number } | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${`media:${tenantId}`})) AS locked`;
        if (!row?.locked) return null;

        const dir = path.join(this.storage.root, tenantId);
        const names = await readdir(dir);
        const known = new Set(
          (await tx.mediaAsset.findMany({ where: { tenantId }, select: { hash: true } })).map(
            (asset) => asset.hash,
          ),
        );

        let files = 0;
        let bytes = 0;
        for (const name of names) {
          const media = MEDIA_FILE_PATTERN.exec(name);
          const orphan = media ? !known.has(media[1]!) : TEMP_FILE_PATTERN.test(name);
          if (!orphan) continue;
          const file = path.join(dir, name);
          const info = await stat(file).catch(() => null);
          if (!info?.isFile() || info.mtimeMs > olderThan) continue;
          await rm(file, { force: true });
          files += 1;
          bytes += info.size;
        }
        return { files, bytes };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }
}
