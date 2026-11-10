import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MEDIA_FILE_PATTERN, TENANT_ID_PATTERN } from './media-url';

/** Un archivo guardado: nombre dentro de la carpeta de la marca, tamaño y última escritura. */
export interface StoredFile {
  name: string;
  size: number;
  mtimeMs: number;
}

/**
 * Archivos de medios: `<tenantId>/<archivo>`, en disco o en un bucket S3/MinIO.
 *
 * - Disco (por defecto): `MEDIA_DIR/<tenantId>/<archivo>`. En producción es el volumen Docker
 *   `media` (entra en el respaldo, ver docs/deployment.md).
 * - S3/MinIO: con `MEDIA_S3_ENDPOINT` y `MEDIA_S3_BUCKET` (más `MEDIA_S3_ACCESS_KEY`,
 *   `MEDIA_S3_SECRET_KEY` y opcional `MEDIA_S3_REGION`), la clave del objeto es
 *   `<tenantId>/<archivo>`. El bucket es privado: la API sirve los archivos (mismas URLs que en
 *   disco), así que cambiar de driver no toca las referencias guardadas.
 *
 * Toda ruta/clave se arma desde un tenantId con forma de UUID y un nombre que cumple
 * `MEDIA_FILE_PATTERN` (o el temporal de una escritura en disco): nada que venga del cliente
 * puede apuntar fuera de la carpeta de la marca (path traversal).
 */
@Injectable()
export class MediaStorage {
  private readonly logger = new Logger(MediaStorage.name);
  readonly root: string;
  private readonly s3: { client: S3Client; bucket: string } | null;

  constructor(config: ConfigService) {
    const configured = config.get<string>('MEDIA_DIR')?.trim();
    const fallback = config.get<string>('NODE_ENV') === 'production' ? '/data/media' : './media';
    this.root = path.resolve(configured || fallback);

    const endpoint = config.get<string>('MEDIA_S3_ENDPOINT')?.trim();
    const bucket = config.get<string>('MEDIA_S3_BUCKET')?.trim();
    if (endpoint) {
      if (!bucket) throw new Error('MEDIA_S3_ENDPOINT sin MEDIA_S3_BUCKET');
      this.s3 = {
        bucket,
        client: new S3Client({
          endpoint,
          region: config.get<string>('MEDIA_S3_REGION')?.trim() || 'us-east-1',
          // MinIO: bucket en la ruta, no en el subdominio.
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.get<string>('MEDIA_S3_ACCESS_KEY') ?? '',
            secretAccessKey: config.get<string>('MEDIA_S3_SECRET_KEY') ?? '',
          },
        }),
      };
    } else {
      this.s3 = null;
    }
  }

  get driver(): 'disk' | 's3' {
    return this.s3 ? 's3' : 'disk';
  }

  /** Ruta absoluta del archivo en disco, o `null` si los componentes no son válidos. */
  filePath(tenantId: string, fileName: string): string | null {
    if (!TENANT_ID_PATTERN.test(tenantId) || !MEDIA_FILE_PATTERN.test(fileName)) return null;
    const full = path.resolve(this.root, tenantId, fileName);
    return full.startsWith(this.root + path.sep) ? full : null;
  }

  /**
   * Para servir con `res.sendFile(file, { root })` (driver disco): Express vuelve a verificar
   * que el archivo quede dentro de `root` (la carpeta de la marca), además de las validaciones
   * de acá.
   */
  servable(tenantId: string, fileName: string): { root: string; file: string } | null {
    const full = this.filePath(tenantId, fileName);
    return full ? { root: path.dirname(full), file: path.basename(full) } : null;
  }

  /** Stream del archivo, o `null` si no existe o el nombre no es válido. */
  async open(
    tenantId: string,
    fileName: string,
  ): Promise<{ body: Readable; size?: number } | null> {
    const key = this.key(tenantId, fileName);
    if (!key) return null;
    if (!this.s3) {
      const full = this.filePath(tenantId, fileName)!;
      const info = await stat(full).catch(() => null);
      if (!info?.isFile()) return null;
      return { body: createReadStream(full), size: info.size };
    }
    try {
      const out = await this.s3.client.send(
        new GetObjectCommand({ Bucket: this.s3.bucket, Key: key }),
      );
      return { body: out.Body as Readable, size: out.ContentLength };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** Escribe de forma atómica. Si ya existe (mismo hash), no hace nada. */
  async write(tenantId: string, fileName: string, data: Buffer): Promise<void> {
    const key = this.requireKey(tenantId, fileName);
    if (this.s3) {
      if (await this.stat(tenantId, fileName)) return;
      // Un PUT de S3 es atómico: el objeto aparece entero o no aparece.
      await this.s3.client.send(
        new PutObjectCommand({
          Bucket: this.s3.bucket,
          Key: key,
          Body: data,
          ContentType: 'image/webp',
        }),
      );
      return;
    }
    const target = this.filePath(tenantId, fileName)!;
    if (await existsOnDisk(target)) return;
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
    await this.removeMany(tenantId, [fileName]);
  }

  /**
   * Borra varios archivos de la marca. Nombres de medio o temporales de escritura en disco.
   * Nunca lanza: el registro ya se borró y un huérfano no rompe nada (lo limpia el GC).
   */
  async removeMany(tenantId: string, fileNames: string[]): Promise<void> {
    if (fileNames.length === 0) return;
    try {
      if (this.s3) {
        const keys = fileNames.map((name) => ({ Key: this.requireKey(tenantId, name, true) }));
        await this.s3.client.send(
          new DeleteObjectsCommand({
            Bucket: this.s3.bucket,
            Delete: { Objects: keys, Quiet: true },
          }),
        );
        return;
      }
      for (const name of fileNames) {
        await rm(this.requireDiskPath(tenantId, name), { force: true });
      }
    } catch (error) {
      this.logger.warn(`No se pudo borrar ${tenantId}/{${fileNames.join(',')}}: ${String(error)}`);
    }
  }

  /** Tamaño y fecha de un archivo, o `null` si no existe. */
  async stat(tenantId: string, fileName: string): Promise<StoredFile | null> {
    const key = this.requireKey(tenantId, fileName, true);
    if (this.s3) {
      try {
        const head = await this.s3.client.send(
          new HeadObjectCommand({ Bucket: this.s3.bucket, Key: key }),
        );
        return {
          name: fileName,
          size: head.ContentLength ?? 0,
          mtimeMs: head.LastModified?.getTime() ?? Date.now(),
        };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    }
    const info = await stat(this.requireDiskPath(tenantId, fileName)).catch(() => null);
    return info?.isFile() ? { name: fileName, size: info.size, mtimeMs: info.mtimeMs } : null;
  }

  /** Marcas con al menos un archivo (carpetas con forma de tenantId). */
  async listTenants(): Promise<string[]> {
    if (this.s3) {
      const tenants: string[] = [];
      let token: string | undefined;
      do {
        const page = await this.s3.client.send(
          new ListObjectsV2Command({
            Bucket: this.s3.bucket,
            Delimiter: '/',
            ContinuationToken: token,
          }),
        );
        for (const prefix of page.CommonPrefixes ?? []) {
          const name = prefix.Prefix?.replace(/\/$/, '') ?? '';
          if (TENANT_ID_PATTERN.test(name)) tenants.push(name);
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return tenants;
    }
    try {
      const entries = await readdir(this.root, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && TENANT_ID_PATTERN.test(entry.name))
        .map((entry) => entry.name);
    } catch (error) {
      // Sin carpeta de medios todavía (nadie subió nada).
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  /** Archivos de la marca (solo el primer nivel de su carpeta). */
  async listFiles(tenantId: string): Promise<StoredFile[]> {
    if (!TENANT_ID_PATTERN.test(tenantId)) return [];
    if (this.s3) {
      const files: StoredFile[] = [];
      let token: string | undefined;
      do {
        const page = await this.s3.client.send(
          new ListObjectsV2Command({
            Bucket: this.s3.bucket,
            Prefix: `${tenantId}/`,
            Delimiter: '/',
            ContinuationToken: token,
          }),
        );
        for (const object of page.Contents ?? []) {
          const name = object.Key?.slice(tenantId.length + 1) ?? '';
          if (!name) continue;
          files.push({
            name,
            size: object.Size ?? 0,
            mtimeMs: object.LastModified?.getTime() ?? Date.now(),
          });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return files;
    }
    const dir = path.join(this.root, tenantId);
    const names = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [] as string[];
      throw error;
    });
    const files: StoredFile[] = [];
    for (const name of names) {
      const info = await stat(path.join(dir, name)).catch(() => null);
      if (info?.isFile()) files.push({ name, size: info.size, mtimeMs: info.mtimeMs });
    }
    return files;
  }

  /** Clave `<tenantId>/<archivo>`; `allowTemp` acepta el temporal de una escritura en disco. */
  private key(tenantId: string, fileName: string, allowTemp = false): string | null {
    if (!TENANT_ID_PATTERN.test(tenantId)) return null;
    if (!MEDIA_FILE_PATTERN.test(fileName) && !(allowTemp && TEMP_FILE_PATTERN.test(fileName))) {
      return null;
    }
    return `${tenantId}/${fileName}`;
  }

  private requireKey(tenantId: string, fileName: string, allowTemp = false): string {
    const key = this.key(tenantId, fileName, allowTemp);
    if (!key) throw new Error(`Ruta de medio inválida: ${tenantId}/${fileName}`);
    return key;
  }

  private requireDiskPath(tenantId: string, fileName: string): string {
    this.requireKey(tenantId, fileName, true);
    const full = path.resolve(this.root, tenantId, fileName);
    if (!full.startsWith(this.root + path.sep)) {
      throw new Error(`Ruta de medio inválida: ${tenantId}/${fileName}`);
    }
    return full;
  }
}

/** Temporal de una escritura en disco que quedó de un proceso cortado a mitad. */
export const TEMP_FILE_PATTERN =
  /^[0-9a-f]{64}(\.thumb)?\.webp\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/;

async function existsOnDisk(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;
}
