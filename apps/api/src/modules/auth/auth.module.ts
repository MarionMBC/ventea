import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { RewardsModule } from '@/modules/rewards/rewards.module';

import { AuthController, StaffAuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { assertJwtSecret, TokenService } from './token.service';

/**
 * Global porque `JwtAuthGuard` (que aplican `@CustomerAuth()`/`@StaffAuth()` en
 * cualquier módulo) necesita `TokenService`.
 */
@Global()
@Module({
  imports: [
    RewardsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Falla el arranque si el secreto no sirve para el entorno (ver assertJwtSecret).
        const secret = assertJwtSecret(
          config.get<string>('JWT_SECRET'),
          config.get<string>('NODE_ENV'),
        );
        return {
          secret,
          signOptions: { algorithm: 'HS256' },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
  ],
  controllers: [AuthController, StaffAuthController],
  providers: [AuthService, TokenService],
  exports: [TokenService, AuthService],
})
export class AuthModule {}
