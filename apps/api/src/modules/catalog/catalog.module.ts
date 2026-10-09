import { Module } from '@nestjs/common';

import { MediaModule } from '@/modules/media/media.module';

import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { StaffMenuController } from './staff-menu.controller';
import { StaffMenuService } from './staff-menu.service';

/** Menú público (`/api/menu`) y su edición desde el panel (`/api/staff/menu`, TASK-016). */
@Module({
  imports: [MediaModule],
  controllers: [MenuController, StaffMenuController],
  providers: [MenuService, StaffMenuService],
})
export class CatalogModule {}
