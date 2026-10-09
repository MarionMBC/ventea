import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PushCredentialsInput } from '@ventea/shared';

import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { decryptCredentials, encryptCredentials, parseCredentialsKey } from './push-crypto';
import type { FcmCredentials } from './push-transport';

/**
 * Cifra y descifra la service account de FCM de cada marca (`AppConfig.pushCredentialsEnc`).
 * Sin `PUSH_CREDENTIALS_KEY` la API arranca igual, pero no acepta credenciales (503) y el push
 * queda apagado; con la variable mal formada NO arranca: es un error de despliegue.
 */
@Injectable()
export class PushCredentialsService {
  private readonly logger = new Logger(PushCredentialsService.name);
  private readonly key: Buffer | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    config: ConfigService,
  ) {
    const raw = config.get<string>('PUSH_CREDENTIALS_KEY');
    this.key = parseCredentialsKey(raw);
    if (raw?.trim() && !this.key) {
      throw new Error('PUSH_CREDENTIALS_KEY inválida: 32 bytes en base64 o 64 caracteres hex');
    }
  }

  get enabled(): boolean {
    return this.key !== null;
  }

  /** Texto cifrado para guardar. Solo los tres campos que usa FCM; el resto del JSON se descarta. */
  encrypt(tenantId: string, input: PushCredentialsInput): string {
    if (!this.key) {
      throw new ServiceUnavailableException(
        'Push no configurado en el servidor (PUSH_CREDENTIALS_KEY)',
      );
    }
    const plain: FcmCredentials = {
      projectId: input.project_id,
      clientEmail: input.client_email,
      privateKey: input.private_key,
    };
    return encryptCredentials(JSON.stringify(plain), this.key, tenantId);
  }

  /** Credenciales de la marca, o `null` si no tiene, no hay clave o no descifran (se loguea). */
  async load(tenantId: string): Promise<FcmCredentials | null> {
    const config = await this.prisma.appConfig.findUnique({
      where: { tenantId },
      select: { pushCredentialsEnc: true },
    });
    if (!config?.pushCredentialsEnc) return null;
    if (!this.key) {
      this.logger.warn(
        `Push: la marca ${tenantId} tiene credenciales pero falta PUSH_CREDENTIALS_KEY`,
      );
      return null;
    }
    try {
      return JSON.parse(
        decryptCredentials(config.pushCredentialsEnc, this.key, tenantId),
      ) as FcmCredentials;
    } catch {
      // Clave rotada sin recifrar, o fila copiada de otra marca (AAD distinta).
      this.logger.error(`Push: las credenciales de la marca ${tenantId} no descifran`);
      return null;
    }
  }
}
