import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [TokenService, PasswordService, JwtAuthGuard, RolesGuard],
  exports: [JwtModule, TokenService, PasswordService, JwtAuthGuard, RolesGuard],
})
export class SecurityModule {}
