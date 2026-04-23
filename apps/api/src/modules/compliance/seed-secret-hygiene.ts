export type SeedSecretEncryptor = {
  encrypt(plaintext: string): string;
};

export type ProtectedSeedComplianceSecrets = {
  privateKeyPem: string;
  certificateSecret: string;
};

export function protectSeedComplianceSecrets(
  input: {
    privateKeyPem: string;
    certificateSecret: string;
  },
  encryptor: SeedSecretEncryptor,
): ProtectedSeedComplianceSecrets {
  const encryptedPrivateKeyPem = encryptor.encrypt(input.privateKeyPem);
  const encryptedCertificateSecret = encryptor.encrypt(input.certificateSecret);

  if (
    !encryptedPrivateKeyPem.startsWith("enc:v1:") ||
    !encryptedCertificateSecret.startsWith("enc:v1:")
  ) {
    throw new Error(
      "Seed compliance secrets must be encrypted at rest before insertion.",
    );
  }

  return {
    privateKeyPem: encryptedPrivateKeyPem,
    certificateSecret: encryptedCertificateSecret,
  };
}

