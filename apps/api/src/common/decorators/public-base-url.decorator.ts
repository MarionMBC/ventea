import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { publicBaseUrl } from '@/modules/media/media-url';

/**
 * Base pública (`https://host`) del request, para devolver URLs absolutas de medios
 * (TASK-016). `MEDIA_PUBLIC_BASE_URL` la fija si está definida.
 */
export const PublicBaseUrl = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return publicBaseUrl(process.env.MEDIA_PUBLIC_BASE_URL, request.protocol, request.get('host'));
});
