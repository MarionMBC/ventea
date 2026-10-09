import { z } from 'zod';

/**
 * Medios de la marca (TASK-016): imágenes de producto, logo e ícono. Se suben a
 * `POST /api/staff/media` (multipart, campo `file`) y se sirven en
 * `GET /api/media/<tenantId>/<hash>.webp` (público, inmutable).
 */

/** Tamaño máximo del archivo subido (antes de normalizar). */
export const MEDIA_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Tipos admitidos al subir. Siempre se guardan como WebP. */
export const MEDIA_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
/** Ancho máximo de la imagen normalizada y de la miniatura. */
export const MEDIA_MAX_WIDTH = 1600;
export const MEDIA_THUMB_WIDTH = 400;

export const mediaUploadResponseSchema = z.object({
  /** URL absoluta de la imagen (WebP, ≤ 1600 px de ancho). */
  url: z.string().url(),
  /** URL absoluta de la miniatura (WebP, ≤ 400 px de ancho). */
  thumbUrl: z.string().url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const mediaAssetSchema = mediaUploadResponseSchema.extend({
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
});

export const mediaListSchema = z.object({
  items: z.array(mediaAssetSchema),
  usedBytes: z.number().int().nonnegative(),
  quotaBytes: z.number().int().positive(),
});

/**
 * Referencia a un medio propio en un body (`imageUrl`, `logoUrl`, `iconUrl`): la URL que
 * devolvió la subida (absoluta) o su ruta `/api/media/…`. La API verifica que sea de la marca.
 */
export const mediaRefSchema = z.string().trim().min(1).max(500);

export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type MediaList = z.infer<typeof mediaListSchema>;
