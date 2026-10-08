import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { RewardsModule } from '@/modules/rewards/rewards.module';

import { AuthController, StaffAuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

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
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('Falta JWT_SECRET');
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
  exports: [TokenService],
})
export class AuthModule {}
