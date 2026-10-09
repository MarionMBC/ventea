import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  platformEmailsQuerySchema,
  type PlatformEmail,
  type PlatformEmailList,
  type PlatformEmailsQuery,
} from '@ventea/shared';

import { PlatformAuth } from '@/common/decorators/auth.decorators';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';

import { MailService } from './mail.service';

/** Registro de correos (TASK-021). Solo plataforma; nunca devuelve el cuerpo. */
@ApiTags('platform')
@PlatformAuth()
@Controller('platform/emails')
export class PlatformEmailsController {
  constructor(private readonly mail: MailService) {}

  /** Últimos correos (`?status=failed|sent|…&limit=50`), el más nuevo primero. */
  @Get()
  list(
    @Query(new ZodValidationPipe(platformEmailsQuerySchema)) query: PlatformEmailsQuery,
  ): Promise<PlatformEmailList> {
    return this.mail.list(query);
  }

  /** Reenvía un correo `failed`. `409` si no está fallido. */
  @Post(':id/resend')
  @HttpCode(HttpStatus.OK)
  resend(@Param('id', new ParseUUIDPipe()) id: string): Promise<PlatformEmail> {
    return this.mail.resend(id);
  }
}
