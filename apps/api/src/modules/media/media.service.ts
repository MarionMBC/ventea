import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MEDIA_MAX_WIDTH,
  MEDIA_THUMB_WIDTH,
  MEDIA_UPLOAD_TYPES,
  type MediaAsset,
  type MediaList,
  type MediaUploadResponse,
} from '@ventea/shared';
import sharp from 'sharp';

import type { PrismaClientExtended, PrismaDb } from '@/prisma/prisma.client';
import { isUniqueViolation } from '@/prisma/prisma-errors';
import { PRISMA } from '@/prisma/prisma.module';

import { detectImageFormat } from './image-signature';
import { MediaStorage } from './media-storage';
import { absoluteMediaUrl, mediaFileName, mediaPath, parseMediaRef } from './media-url';
import { ProcessingGate, ProcessingGateBusyError } from './processing-gate';

/** Lo que deja multer (memoryStorage) del archivo subido. */
export interface UploadedImage {
  buffer: Buffer;
  size: number;
  mimetype: string;
}

const DEFAULT_QUOTA_MB = 200;
/**
 * Píxeles máximos al decodificar: corta las "bombas" (un PNG de 100 KB que se expande a cientos
 * de MB en memoria). 24 MP cubre la cámara de un teléfono (4000 × 6000) y acota cada
 * decodificación a ~100 MB.
 */
const MAX_INPUT_PIXELS = 24_000_000;
/** Procesamientos sharp a la vez por proceso, espera máxima y tope de la fila (configurables). */
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_WAIT_MS = 20_000;
const MAX_WAITING = 20;

// Sin caché de libvips (no se reprocesa la misma imagen) y un hilo por imagen: el semáforo
// decide cuántas a la vez, sin que una sola se quede con todo el threadpool.
sharp.cache(false);
sharp.concurrency(1);

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Medios de la marca (TASK-016). La subida se valida por magic number y se RE-CODIFICA con
 * sharp a WebP: lo que se guarda es una imagen generada por nosotros, no el archivo del
 * cliente. Así se van el EXIF/GPS, los bytes extra de un polyglot (PNG + HTML/ZIP pegado) y
 * cualquier chunk raro, y el archivo servido siempre es un WebP válido.
 */
@Injectable()
export class MediaService {
  private readonly quotaBytes: number;
  private readonly gate: ProcessingGate;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly storage: MediaStorage,
    config: ConfigService,
  ) {
    this.quotaBytes =
      positiveInt(config.get<string>('MEDIA_QUOTA_MB'), DEFAULT_QUOTA_MB) * 1024 * 1024;
    this.gate = new ProcessingGate(
      positiveInt(config.get<string>('MEDIA_PROCESSING_CONCURRENCY'), DEFAULT_CONCURRENCY),
      positiveInt(config.get<string>('MEDIA_PROCESSING_WAIT_MS'), DEFAULT_WAIT_MS),
      MAX_WAITING,
    );
  }

  async upload(
    tenantId: string,
    file: UploadedImage | undefined,
    base: string,
  ): Promise<MediaUploadResponse> {
    if (!file) throw new BadRequestException('Falta el archivo (campo "file")');
    if (!(MEDIA_UPLOAD_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException('Solo se aceptan imágenes PNG, JPEG o WebP');
    }
    const format = detectImageFormat(file.buffer);
    if (!format) {
      throw new UnsupportedMediaTypeException('El archivo no es una imagen PNG, JPEG o WebP');
    }

    let normalized: Awaited<ReturnType<typeof normalize>>;
    try {
      normalized = await this.gate.run(() => normalize(file.buffer, format));
    } catch (error) {
      if (error instanceof ProcessingGateBusyError) {
        throw new ServiceUnavailableException(
          'Hay muchas imágenes procesándose; intenta de nuevo en unos segundos',
        );
      }
      throw error;
    }
    const { main, thumb, width, height } = normalized;
    const hash = createHash('sha256').update(main).digest('hex');
    const bytes = main.length + thumb.length;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Serializa las subidas de la marca: dos en paralelo no pueden pasar la cuota juntas.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`media:${tenantId}`}))`;
        const existing = await tx.mediaAsset.findFirst({
          where: { tenantId, hash },
          select: { id: true },
        });
        if (existing) return;

        const used = await this.usedBytes(tenantId, tx);
        if (used + bytes > this.quotaBytes) {
          throw new ForbiddenException(
            `Tu marca llegó al límite de ${Math.round(this.quotaBytes / 1024 / 1024)} MB de imágenes. ` +
              'Borra imágenes que no uses.',
          );
        }
        await this.storage.write(tenantId, mediaFileName(hash), main);
        await this.storage.write(tenantId, mediaFileName(hash, true), thumb);
        await tx.mediaAsset.create({ data: { tenantId, hash, bytes, width, height } });
      });
    } catch (error) {
      // Carrera con la misma imagen: la otra subida ya la registró.
      if (!isUniqueViolation(error)) throw error;
    }

    return {
      url: `${base}${mediaPath(tenantId, hash)}`,
      thumbUrl: `${base}${mediaPath(tenantId, hash, true)}`,
      width,
      height,
    };
  }

  async list(tenantId: string, base: string): Promise<MediaList> {
    const [rows, usedBytes] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where: { tenantId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 500,
      }),
      this.usedBytes(tenantId),
    ]);
    return {
      items: rows.map((row) => this.toAsset(row, base)),
      usedBytes,
      quotaBytes: this.quotaBytes,
    };
  }

  /** Borra un medio propio. `409` si un ítem del menú o la marca todavía lo usan. */
  async remove(tenantId: string, hash: string): Promise<void> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { tenantId, hash },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException('Imagen no encontrada');

    const ref = mediaPath(tenantId, hash);
    const [items, branding] = await Promise.all([
      this.prisma.menuItem.count({ where: { tenantId, imageUrl: ref, deletedAt: null } }),
      this.prisma.tenantBranding.count({
        where: { tenantId, OR: [{ logoUrl: ref }, { iconUrl: ref }] },
      }),
    ]);
    if (items > 0 || branding > 0) {
      throw new ConflictException('La imagen está en uso (menú o marca): quítala primero');
    }

    await this.prisma.mediaAsset.deleteMany({ where: { tenantId, hash } });
    await this.storage.remove(tenantId, mediaFileName(hash));
    await this.storage.remove(tenantId, mediaFileName(hash, true));
  }

  /**
   * Valida que `ref` sea un medio subido por ESTA marca y devuelve su ruta canónica para
   * guardar. `400` si es una URL externa, de otra marca o de un medio que no existe.
   */
  async resolveOwnedRef(
    tenantId: string,
    ref: string,
    field: string,
    db: PrismaDb = this.prisma,
  ): Promise<string> {
    const parsed = parseMediaRef(ref);
    if (!parsed) {
      throw new BadRequestException(`${field}: debe ser una imagen subida en Mi marca o el menú`);
    }
    if (parsed.tenantId !== tenantId) {
      throw new BadRequestException(`${field}: la imagen no pertenece a esta marca`);
    }
    const asset = await db.mediaAsset.findFirst({
      where: { tenantId, hash: parsed.hash },
      select: { id: true },
    });
    if (!asset) throw new BadRequestException(`${field}: la imagen no existe`);
    return mediaPath(tenantId, parsed.hash);
  }

  private async usedBytes(tenantId: string, db: PrismaDb = this.prisma): Promise<number> {
    const sum = await db.mediaAsset.aggregate({ where: { tenantId }, _sum: { bytes: true } });
    return sum._sum.bytes ?? 0;
  }

  private toAsset(
    row: {
      tenantId: string;
      hash: string;
      bytes: number;
      width: number;
      height: number;
      createdAt: Date;
    },
    base: string,
  ): MediaAsset {
    return {
      hash: row.hash,
      url: absoluteMediaUrl(mediaPath(row.tenantId, row.hash), base)!,
      thumbUrl: absoluteMediaUrl(mediaPath(row.tenantId, row.hash, true), base)!,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      createdAt: row.createdAt,
    };
  }
}

/**
 * Decodifica y re-codifica: orientación EXIF aplicada (`rotate()`), ≤ 1600 px de ancho, WebP sin
 * metadatos (sharp no copia EXIF/ICC/XMP salvo `withMetadata`), más una miniatura de 400 px.
 * Exige que sharp lea el mismo formato que dicen los magic bytes.
 */
async function normalize(
  input: Buffer,
  expected: 'png' | 'jpeg' | 'webp',
): Promise<{ main: Buffer; thumb: Buffer; width: number; height: number }> {
  const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' as const };
  try {
    // `metadata()` lee solo la cabecera: el tamaño se rechaza antes de decodificar nada.
    const metadata = await sharp(input, { failOn: 'error', limitInputPixels: false }).metadata();
    if (metadata.format !== expected) {
      throw new UnsupportedMediaTypeException('El contenido no coincide con el tipo de imagen');
    }
    if ((metadata.width ?? 0) * (metadata.height ?? 0) > MAX_INPUT_PIXELS) {
      throw new PayloadTooLargeException(
        `La imagen tiene demasiados píxeles (máximo ${MAX_INPUT_PIXELS / 1_000_000} MP)`,
      );
    }
    const { data: main, info } = await sharp(input, options)
      .rotate()
      .resize({ width: MEDIA_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await sharp(main)
      .resize({ width: MEDIA_THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    return { main, thumb, width: info.width, height: info.height };
  } catch (error) {
    if (
      error instanceof UnsupportedMediaTypeException ||
      error instanceof PayloadTooLargeException
    ) {
      throw error;
    }
    // Imagen truncada, corrupta o demasiado grande en píxeles: el detalle de libvips no sale.
    throw new UnsupportedMediaTypeException(
      'No se pudo leer la imagen (dañada o demasiado grande)',
    );
  }
}
