/**
 * Cryptographic primitives for VGU Pulse Next:
 * 1. 256-bit Capability Tokens & SHA-256 Hashing
 * 2. Authenticated AES-256-GCM Encryption at Rest for Private Coordination Notes
 */

export const DEV_DEFAULT_ENCRYPTION_SECRET =
  'dev-only-vgu-pulse-coordination-secret-key-32b!';

const ENCRYPTED_PREFIX = 'enc:v1:';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return null;
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

export function generateCapabilityToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToHex(new Uint8Array(digest));
}

export function generateRecordId(prefix: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `${prefix}-${bytesToHex(bytes)}`;
}

export function resolveEncryptionSecret(
  appEnv: string,
  configuredKey?: string
): { ok: true; secret: string } | { ok: false; code: string; message: string } {
  const isProd = appEnv === 'production';
  const trimmed = configuredKey?.trim() ?? '';

  if (isProd) {
    if (
      trimmed.length < 32 ||
      trimmed === DEV_DEFAULT_ENCRYPTION_SECRET
    ) {
      return {
        ok: false,
        code: 'ENCRYPTION_MISCONFIGURED',
        message:
          'Server encryption key is not configured for production. Private coordination notes cannot be stored safely.',
      };
    }
    return { ok: true, secret: trimmed };
  }

  if (trimmed && trimmed.length < 16) {
    return {
      ok: false,
      code: 'ENCRYPTION_KEY_TOO_SHORT',
      message: 'Configured COORDINATION_ENCRYPTION_KEY must be at least 16 characters.',
    };
  }

  return {
    ok: true,
    secret: trimmed || DEV_DEFAULT_ENCRYPTION_SECRET,
  };
}

async function deriveAesGcmKey(secret: string): Promise<CryptoKey> {
  const rawMaterial = new TextEncoder().encode(secret);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    rawMaterial,
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('vgu-pulse-next:coordination-note:v1'),
      info: new TextEncoder().encode('AES-256-GCM'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plaintext coordination note using AES-256-GCM with a unique 96-bit random IV.
 * Output format: `enc:v1:<24-char-iv-hex>:<ciphertext+tag-hex>`
 * Fitting well within the D1 500-char storage bound for <=200 char notes.
 */
export async function encryptCoordinationNote(
  plaintext: string,
  secret: string
): Promise<string> {
  const key = await deriveAesGcmKey(secret);
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(iv);

  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  return `${ENCRYPTED_PREFIX}${bytesToHex(iv)}:${bytesToHex(
    new Uint8Array(cipherBuffer)
  )}`;
}

/**
 * Decrypts an `enc:v1:<iv>:<cipher>` coordination note.
 * Legacy plaintext compatibility: In non-production or pre-existing rows without `enc:v1:`,
 * returns a clearly marked legacy value or throws if decryption of an `enc:v1:` payload fails.
 */
export async function decryptCoordinationNote(
  storedValue: string,
  secret: string
): Promise<{ ok: true; plaintext: string } | { ok: false; error: string }> {
  if (!storedValue.startsWith(ENCRYPTED_PREFIX)) {
    // Never silently treat a legacy plaintext database value as an encrypted note.
    // Re-encrypt legacy rows with the configured key before exposing this capability.
    return {
      ok: false,
      error: 'Legacy plaintext coordination note requires secure backfill.',
    };
  }

  const remainder = storedValue.slice(ENCRYPTED_PREFIX.length);
  const parts = remainder.split(':');
  if (parts.length !== 2) {
    return { ok: false, error: 'Malformed encrypted coordination note.' };
  }

  const iv = hexToBytes(parts[0]);
  const cipherBytes = hexToBytes(parts[1]);
  if (!iv || iv.byteLength !== 12 || !cipherBytes || cipherBytes.byteLength < 17) {
    return { ok: false, error: 'Invalid IV or ciphertext in coordination note.' };
  }

  try {
    const key = await deriveAesGcmKey(secret);
    // Copy the parsed IV into a definite ArrayBuffer for Web Crypto's BufferSource types.
    const ivBuffer = new ArrayBuffer(iv.byteLength);
    new Uint8Array(ivBuffer).set(iv);
    const cipherBuffer = new ArrayBuffer(cipherBytes.byteLength);
    new Uint8Array(cipherBuffer).set(cipherBytes);
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      key,
      cipherBuffer
    );
    const plaintext = new TextDecoder().decode(plainBuffer);
    return { ok: true, plaintext };
  } catch {
    return {
      ok: false,
      error: 'Unable to decrypt coordination note with current key.',
    };
  }
}
