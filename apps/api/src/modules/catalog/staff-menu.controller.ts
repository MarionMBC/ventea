import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createMenuCategorySchema,
  createMenuItemSchema,
  createModifierGroupSchema,
  createModifierOptionSchema,
  menuChangesQuerySchema,
  menuItemAvailabilitySchema,
  reorderSchema,
  updateMenuCategorySchema,
  updateMenuItemSchema,
  updateModifierGroupSchema,
  updateModifierOptionSchema,
  type CreateMenuCategoryInput,
  type CreateMenuItemInput,
  type CreateModifierGroupInput,
  type CreateModifierOptionInput,
  type DeleteMenuItemResult,
  type MenuChange,
  type MenuChangesQuery,
  type MenuItemAvailabilityInput,
  type ReorderInput,
  type StaffMenu,
  type UpdateMenuCategoryInput,
  type UpdateMenuItemInput,
  type UpdateModifierGroupInput,
  type UpdateModifierOptionInput,
} from '@ventea/shared';

import type { StaffPrincipal } from '@/common/auth/auth.context';
import { CurrentStaff, StaffAuth } from '@/common/decorators/auth.decorators';
import { PublicBaseUrl } from '@/common/decorators/public-base-url.decorator';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';

import { StaffMenuService, type MenuActor } from './staff-menu.service';

const ID = new ParseUUIDPipe({ version: '4' });

function actor(staff: StaffPrincipal): MenuActor {
  return { tenantId: staff.tenantId, staffId: staff.staffId };
}

/**
 * Menú desde el panel (TASK-016). Lee cualquier staff; escriben owner y manager. Las rutas
 * `reorder` se declaran antes que las `:id` para que Nest no las tome como un id.
 */
@ApiTags('staff-menu')
@Controller('staff/menu')
export class StaffMenuController {
  constructor(private readonly menu: StaffMenuService) {}

  @Get()
  @StaffAuth()
  tree(@CurrentStaff() staff: StaffPrincipal, @PublicBaseUrl() base: string): Promise<StaffMenu> {
    return this.menu.tree(staff.tenantId, base);
  }

  @Get('changes')
  @StaffAuth('owner', 'manager')
  changes(
    @CurrentStaff() staff: StaffPrincipal,
    @Query(new ZodValidationPipe(menuChangesQuerySchema)) query: MenuChangesQuery,
  ): Promise<MenuChange[]> {
    return this.menu.changes(staff.tenantId, query.limit);
  }

  // ─── Categorías ─────────────────────────────────────────────────────────────

  @Post('categories')
  @StaffAuth('owner', 'manager')
  createCategory(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodValidationPipe(createMenuCategorySchema)) input: CreateMenuCategoryInput,
  ): Promise<{ id: string }> {
    return this.menu.createCategory(actor(staff), input);
  }

  @Patch('categories/reorder')
  @StaffAuth('owner', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderCategories(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodValidationPipe(reorderSchema)) input: ReorderInput,
  ): Promise<void> {
    return this.menu.reorderCategories(actor(staff), input);
  }

  @Patch('categories/:id')
  @StaffAuth('owner', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  updateCategory(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
    @Body(new ZodValidationPipe(updateMenuCategorySchema)) input: UpdateMenuCategoryInput,
  ): Promise<void> {
    return this.menu.updateCategory(actor(staff), id, input);
  }

  @Delete('categories/:id')
  @StaffAuth('owner', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCategory(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
  ): Promise<void> {
    return this.menu.deleteCategory(actor(staff), id);
  }

  // ─── Ítems ──────────────────────────────────────────────────────────────────

  @Post('items')
  @StaffAuth('owner', 'manager')
  createItem(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodValidationPipe(createMenuItemSchema)) input: CreateMenuItemInput,
  ): Promise<{ id: string }> {
    return this.menu.createItem(actor(staff), input);
  }

  @Patch('items/reorder')
  @StaffAuth('owner', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderItems(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodValidationPipe(reorderSchema)) input: ReorderInput,
  ): Promise<void> {
    return this.menu.reorderItems(actor(staff), input);
  }

  @Patch('items/:id/availability')
  @StaffAuth('owner', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  setAvailability(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
    @Body(new ZodValidationPipe(menuItemAvailabilitySchema)) input: MenuItemAvailabilityInput,
  ): Promise<void> {
    return this.menu.setAvailability(actor(staff), id, input.isAvailable);
  }

  @Patch('items/:id')
  @StaffAuth('owner', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  updateItem(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
    @Body(new ZodValidationPipe(updateMenuItemSchema)) input: UpdateMenuItemInput,
  ): Promise<void> {
    return this.menu.updateItem(actor(staff), id, input);
  }

  @Delete('items/:id')
  @StaffAuth('owner', 'manager')
  deleteItem(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
  ): Promise<DeleteMenuItemResult> {
    return this.menu.deleteItem(actor(staff), id);
  }

  // ─── Modificadores ──────────────────────────────────────────────────────────

  @Post('modifier-groups')
  @StaffAuth('owner', 'manager')
  createGroup(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodValidationPipe(createModifierGroupSchema)) input: CreateModifierGroupInput,
  ): Promise<{ id: string }> {
    return this.menu.createGroup(actor(staff), input);
  }

  @Patch('modifier-groups/:id')
  @StaffAuth('owner', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  updateGroup(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
    @Body(new ZodValidationPipe(updateModifierGroupSchema)) input: UpdateModifierGroupInput,
  ): Promise<void> {
    return this.menu.updateGroup(actor(staff), id, input);
  }

  @Delete('modifier-groups/:id')
  @StaffAuth('owner', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGroup(@CurrentStaff() staff: StaffPrincipal, @Param('id', ID) id: string): Promise<void> {
    return this.menu.deleteGroup(actor(staff), id);
  }

  @Post('modifier-groups/:id/options')
  @StaffAuth('owner', 'manager')
  createOption(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) groupId: string,
    @Body(new ZodValidationPipe(createModifierOptionSchema)) input: CreateModifierOptionInput,
  ): Promise<{ id: string }> {
    return this.menu.createOption(actor(staff), groupId, input);
  }

  @Patch('modifier-groups/:id/options/reorder')
  @StaffAuth('owner', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderOptions(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) groupId: string,
    @Body(new ZodValidationPipe(reorderSchema)) input: ReorderInput,
  ): Promise<void> {
    return this.menu.reorderOptions(actor(staff), groupId, input);
  }

  @Patch('modifier-options/:id')
  @StaffAuth('owner', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  updateOption(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
    @Body(new ZodValidationPipe(updateModifierOptionSchema)) input: UpdateModifierOptionInput,
  ): Promise<void> {
    return this.menu.updateOption(actor(staff), id, input);
  }

  @Delete('modifier-options/:id')
  @StaffAuth('owner', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteOption(@CurrentStaff() staff: StaffPrincipal, @Param('id', ID) id: string): Promise<void> {
    return this.menu.deleteOption(actor(staff), id);
  }
}
