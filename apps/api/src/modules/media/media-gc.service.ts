import { Inject, Injectable, Logger } from '@nestjs/common';

import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { MediaStorage, TEMP_FILE_PATTERN } from './media-storage';
import { MEDIA_FILE_PATTERN } from './media-url';

/**
 * Un archivo sin registro más nuevo que esto puede ser de una subida en curso (el registro se
 * crea en la misma transacción, antes de escribir): no se toca.
 */
export const ORPHAN_MIN_AGE_MS = 60 * 60_000;

export interface MediaGcRun {
  /** Marcas revisadas y salteadas (una subida o un borrado tenía el lock de medios). */
  tenants: number;
  skipped: number;
  removedFiles: number;
  removedBytes: number;
}

/**
 * GC de archivos huérfanos de medios (TASK-025): si la transacción de una subida falla después
 * de escribir, el archivo queda en el volumen (o bucket) sin registro. Borra, por marca, los `<hash>.webp`
 * y `<hash>.thumb.webp` sin `MediaAsset` y los temporales de escrituras cortadas, siempre que
 * tengan más de `ORPHAN_MIN_AGE_MS`.
 *
 * Listar la carpeta, mirar fechas y descartar lo registrado se hace SIN lock. Solo para borrar
 * se toma el lock de medios de la marca (el mismo que subidas, borrados y referencias) con try,
 * y adentro se vuelve a mirar el registro y la fecha de cada candidato: el lock dura una consulta
 * y unos `rm`, así una subida de la marca no espera un barrido entero (su transacción tiene 5 s).
 * Ocupado → la marca queda para la próxima vuelta. Con el lock tomado ninguna subida puede estar
 * entre «el archivo ya existe» y su registro. Solo mira carpetas con forma de tenantId y archivos
 * con forma de medio: nada más del volumen se borra.
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
    for (const tenantId of await this.storage.listTenants()) {
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

  /** `null` si el lock de medios de la marca estaba tomado. */
  private async sweepTenant(
    tenantId: string,
    olderThan: number,
  ): Promise<{ files: number; bytes: number } | null> {
    // 1 · Sin lock: candidatos por nombre y fecha, menos los que tienen registro.
    let candidates: { file: string; hash: string | null }[] = [];
    for (const { name, mtimeMs } of await this.storage.listFiles(tenantId)) {
      const media = MEDIA_FILE_PATTERN.exec(name);
      if (!media && !TEMP_FILE_PATTERN.test(name)) continue;
      if (mtimeMs > olderThan) continue;
      candidates.push({ file: name, hash: media ? media[1]! : null });
    }
    candidates = await this.withoutRecord(this.prisma, tenantId, candidates);
    if (candidates.length === 0) return { files: 0, bytes: 0 };

    // 2 · Con el lock, corto: se re-chequea registro y fecha de cada uno y se borra.
    return this.prisma.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${`media:${tenantId}`})) AS locked`;
        if (!row?.locked) return null;
        const doomed: string[] = [];
        let bytes = 0;
        for (const { file } of await this.withoutRecord(tx, tenantId, candidates)) {
          const info = await this.storage.stat(tenantId, file);
          if (!info || info.mtimeMs > olderThan) continue;
          doomed.push(file);
          bytes += info.size;
        }
        await this.storage.removeMany(tenantId, doomed);
        return { files: doomed.length, bytes };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  /** Los candidatos cuyo hash no tiene `MediaAsset` (los temporales nunca tienen). */
  private async withoutRecord<T extends { hash: string | null }>(
    db: Pick<PrismaClientExtended, 'mediaAsset'>,
    tenantId: string,
    candidates: T[],
  ): Promise<T[]> {
    const hashes = [...new Set(candidates.flatMap((c) => (c.hash ? [c.hash] : [])))];
    if (hashes.length === 0) return candidates;
    const known = new Set(
      (
        await db.mediaAsset.findMany({
          where: { tenantId, hash: { in: hashes } },
          select: { hash: true },
        })
      ).map((asset) => asset.hash),
    );
    return candidates.filter((c) => !c.hash || !known.has(c.hash));
  }
}
