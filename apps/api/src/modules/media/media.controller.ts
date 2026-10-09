import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { MEDIA_MAX_UPLOAD_BYTES, type MediaList, type MediaUploadResponse } from '@ventea/shared';
import type { Response } from 'express';

import type { StaffPrincipal } from '@/common/auth/auth.context';
import { CurrentStaff, StaffAuth } from '@/common/decorators/auth.decorators';
import { PublicBaseUrl } from '@/common/decorators/public-base-url.decorator';
import { RateLimit, RateLimitGuard } from '@/modules/platform/rate-limit.guard';

import { MediaStorage } from './media-storage';
import { MEDIA_FILE_PATTERN } from './media-url';
import { MediaService, type UploadedImage } from './media.service';

/** Un año: el nombre es el hash del contenido, el archivo nunca cambia. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * Subida y administración de imágenes de la marca. Owner y manager (los que editan el menú).
 * `@StaffAuth` va en la clase: sus guards corren antes que el rate limit y que multer, así
 * que una petición sin sesión no lee el cuerpo ni gasta el cupo de la marca.
 */
@ApiTags('media')
@StaffAuth('owner', 'manager')
@Controller('staff/media')
export class StaffMediaController {
  constructor(private readonly media: MediaService) {}

  /**
   * `multipart/form-data` con un único campo `file`. multer corta el stream al pasar 5 MB
   * (413) sin juntar el resto en memoria; ningún otro campo se admite.
   */
  @Post()
  @ApiConsumes('multipart/form-data')
  @RateLimit({
    bucket: 'media-upload',
    envKey: 'MEDIA_UPLOAD_RATE_LIMIT_PER_HOUR',
    defaultPerHour: 60,
    key: 'tenant',
  })
  @UseGuards(RateLimitGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MEDIA_MAX_UPLOAD_BYTES, files: 1, fields: 0 },
    }),
  )
  upload(
    @CurrentStaff() staff: StaffPrincipal,
    @UploadedFile() file: UploadedImage | undefined,
    @PublicBaseUrl() base: string,
  ): Promise<MediaUploadResponse> {
    return this.media.upload(staff.tenantId, file, base);
  }

  @Get()
  list(@CurrentStaff() staff: StaffPrincipal, @PublicBaseUrl() base: string): Promise<MediaList> {
    return this.media.list(staff.tenantId, base);
  }

  @Delete(':hash')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentStaff() staff: StaffPrincipal, @Param('hash') hash: string): Promise<void> {
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new NotFoundException('Imagen no encontrada');
    await this.media.remove(staff.tenantId, hash);
  }
}

/**
 * Archivos públicos: `GET /api/media/<tenantId>/<hash>.webp` (o `.thumb.webp`). Fuera del
 * TenantMiddleware (la marca va en la ruta; un `<img>` de la app nativa no manda
 * `X-Tenant-Slug`). Solo se sirven nombres con forma de hash: nada de rutas arbitrarias.
 */
@ApiTags('media')
@Controller('media')
export class PublicMediaController {
  constructor(private readonly storage: MediaStorage) {}

  @Get(':tenantId/:file')
  serve(
    @Param('tenantId') tenantId: string,
    @Param('file') file: string,
    @Res() res: Response,
  ): void {
    const full = MEDIA_FILE_PATTERN.test(file) ? this.storage.filePath(tenantId, file) : null;
    if (!full) throw new NotFoundException('Imagen no encontrada');

    res.sendFile(
      full,
      {
        dotfiles: 'deny',
        headers: {
          // Fijo: lo que hay en disco siempre es un WebP generado por la API.
          'Content-Type': 'image/webp',
          'Cache-Control': IMMUTABLE,
          'X-Content-Type-Options': 'nosniff',
          // helmet pone `same-origin`: la app nativa y el panel cargan estas imágenes desde
          // otro origen (capacitor://localhost, app.ventea.tech).
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      },
      (error?: Error) => {
        if (!error || res.headersSent) return;
        res
          .status(HttpStatus.NOT_FOUND)
          .json({ statusCode: 404, message: 'Imagen no encontrada', error: 'Not Found' });
      },
    );
  }
}
