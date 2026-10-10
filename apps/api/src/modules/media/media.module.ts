import { Module } from '@nestjs/common';

import { RateLimitGuard, RateLimitStore } from '@/modules/platform/rate-limit.guard';

import { PublicMediaController, StaffMediaController } from './media.controller';
import { MediaGc } from './media-gc.service';
import { MediaStorage } from './media-storage';
import { MediaService } from './media.service';

/** Imágenes de la marca (TASK-016): subida, cuota, servido público y verificación de propiedad. */
@Module({
  controllers: [StaffMediaController, PublicMediaController],
  providers: [MediaStorage, MediaService, MediaGc, RateLimitStore, RateLimitGuard],
  exports: [MediaService, MediaStorage, MediaGc],
})
export class MediaModule {}
