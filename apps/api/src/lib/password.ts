import crypto from 'crypto';

/**
 * Generates a secure scrypt password hash with a random 16-byte salt.
 * Output format: scrypt:<salt_hex>:<hash_hex>
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

/**
 * Securely verifies a plain password against an scrypt or salt:hash password string
 * using constant-time comparison (crypto.timingSafeEqual).
 */
export function verifyPassword(password: string, storedHash?: string | null): boolean {
  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }

  let salt: string;
  let expectedHashHex: string;

  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    salt = parts[1];
    expectedHashHex = parts[2];
  } else if (storedHash.includes(':')) {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    salt = parts[0];
    expectedHashHex = parts[1];
  } else {
    return false;
  }

  try {
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const expectedKey = Buffer.from(expectedHashHex, 'hex');

    if (derivedKey.length !== expectedKey.length) {
      return false;
    }

    return crypto.timingSafeEqual(derivedKey, expectedKey);
  } catch {
    return false;
  }
}
