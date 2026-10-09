import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MEDIA_FILE_PATTERN, TENANT_ID_PATTERN } from './media-url';

/**
 * Archivos de medios en disco: `MEDIA_DIR/<tenantId>/<archivo>`. En producción es el volumen
 * Docker `media` (entra en el respaldo, ver docs/deployment.md).
 *
 * Toda ruta se arma desde un tenantId con forma de UUID y un nombre que cumple
 * `MEDIA_FILE_PATTERN`, y se comprueba que quede dentro de la raíz: nada que venga del
 * cliente puede apuntar fuera (path traversal).
 */
@Injectable()
export class MediaStorage {
  private readonly logger = new Logger(MediaStorage.name);
  readonly root: string;

  constructor(config: ConfigService) {
    const configured = config.get<string>('MEDIA_DIR')?.trim();
    const fallback = config.get<string>('NODE_ENV') === 'production' ? '/data/media' : './media';
    this.root = path.resolve(configured || fallback);
  }

  /** Ruta absoluta del archivo, o `null` si los componentes no son válidos. */
  filePath(tenantId: string, fileName: string): string | null {
    if (!TENANT_ID_PATTERN.test(tenantId) || !MEDIA_FILE_PATTERN.test(fileName)) return null;
    const full = path.resolve(this.root, tenantId, fileName);
    return full.startsWith(this.root + path.sep) ? full : null;
  }

  /** Escribe de forma atómica (temporal + rename). Si ya existe (mismo hash), no hace nada. */
  async write(tenantId: string, fileName: string, data: Buffer): Promise<void> {
    const target = this.requirePath(tenantId, fileName);
    if (await this.exists(target)) return;
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, data, { flag: 'wx' });
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  async remove(tenantId: string, fileName: string): Promise<void> {
    try {
      await rm(this.requirePath(tenantId, fileName), { force: true });
    } catch (error) {
      // El registro ya se borró: un archivo huérfano no rompe nada, solo ocupa disco.
      this.logger.warn(`No se pudo borrar ${tenantId}/${fileName}: ${String(error)}`);
    }
  }

  private requirePath(tenantId: string, fileName: string): string {
    const full = this.filePath(tenantId, fileName);
    if (!full) throw new Error(`Ruta de medio inválida: ${tenantId}/${fileName}`);
    return full;
  }

  private async exists(file: string): Promise<boolean> {
    try {
      await stat(file);
      return true;
    } catch {
      return false;
    }
  }
}
