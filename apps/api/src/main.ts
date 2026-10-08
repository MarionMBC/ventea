import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { RedactingLogger } from './common/logging/redacting-logger';

/**
 * Orígenes que pueden llamar a la API en producción.
 *
 * - Los subdominios de `TENANT_BASE_DOMAIN` (modo multi): cada tenant nuevo queda
 *   habilitado sin redeploy.
 * - `PUBLIC_ORIGIN` (modo single): el dominio propio del cliente.
 * - El WebView de Capacitor: `https://localhost` en Android y `capacitor://localhost`
 *   en iOS. Sin esto la app nativa no puede llamar a su propia API.
 */
function productionOrigins(config: ConfigService): (string | RegExp)[] {
  const origins: (string | RegExp)[] = ['https://localhost', 'capacitor://localhost'];

  const baseDomain = config.get<string>('TENANT_BASE_DOMAIN');
  if (baseDomain) {
    const escaped = baseDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    origins.push(new RegExp(`^https://([a-z0-9-]+\\.)?${escaped}$`));
  }

  const publicOrigin = config.get<string>('PUBLIC_ORIGIN');
  if (publicOrigin) origins.push(publicOrigin);

  return origins;
}

async function bootstrap(): Promise<void> {
  // Logger con redacción de PAN/CVV (TASK-005): red de seguridad para cualquier log.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new RedactingLogger(),
  });
  const config = app.get(ConfigService);

  app.use(helmet());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  // El subdominio identifica al tenant: sin trust proxy, detrás de un balanceador
  // se lee el host interno y TODOS los requests caen en el mismo tenant.
  app.set('trust proxy', 1);

  app.enableCors({
    origin: config.get<string>('NODE_ENV') === 'production' ? productionOrigins(config) : true,
    credentials: true,
  });

  if (config.get<string>('NODE_ENV') !== 'production') {
    const doc = new DocumentBuilder()
      .setTitle('Ventea API')
      .setDescription('API multi-tenant de pedidos')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }

  const port = config.get<number>('API_PORT') ?? 3000;
  await app.listen(port);
}

void bootstrap();
