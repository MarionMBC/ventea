import { Module } from '@nestjs/common';

import { PlatformAuthGuard } from '@/common/guards/platform-auth.guard';
import { MediaModule } from '@/modules/media/media.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { PushModule } from '@/modules/push/push.module';

import { AppConfigStore } from './app-config.store';
import { BrandService } from './brand.service';
import {
  PlatformAppRequestsController,
  PlatformTenantAppController,
  StaffBrandController,
} from './branding.controller';
import { PlatformAppService } from './platform-app.service';

/**
 * Mi marca y la app nativa por marca (TASK-016). Las rutas `platform/*` quedan fuera del
 * TenantMiddleware por la exclusión del AppModule.
 */
@Module({
  imports: [MediaModule, PushModule, NotificationsModule],
  controllers: [StaffBrandController, PlatformAppRequestsController, PlatformTenantAppController],
  providers: [AppConfigStore, BrandService, PlatformAppService, PlatformAuthGuard],
})
export class BrandingModule {}
