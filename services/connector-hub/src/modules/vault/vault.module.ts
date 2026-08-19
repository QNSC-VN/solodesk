import { Module } from '@nestjs/common';
import { VaultService } from './application/vault.service';
import { VaultController } from './api/vault.controller';
import { InternalOnboardingVaultController } from './api/internal-onboarding.controller';
import { EncryptionService } from '../../platform/crypto/encryption.service';
import { CredentialDrizzleRepository } from './infrastructure/persistence/credential.drizzle-repository';
import { WebhookTokenDrizzleRepository } from './infrastructure/persistence/webhook-token.drizzle-repository';
import { CREDENTIAL_REPOSITORY } from './domain/ports/credential.repository';
import { WEBHOOK_TOKEN_REPOSITORY } from './domain/ports/webhook-token.repository';

@Module({
  controllers: [VaultController, InternalOnboardingVaultController],
  providers: [
    VaultService,
    EncryptionService,
    { provide: CREDENTIAL_REPOSITORY, useClass: CredentialDrizzleRepository },
    { provide: WEBHOOK_TOKEN_REPOSITORY, useClass: WebhookTokenDrizzleRepository },
  ],
  exports: [VaultService],
})
export class VaultModule {}
