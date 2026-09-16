import {sha256} from '@noble/hashes/sha256';

// HTTP intranet origins have getRandomValues, but not randomUUID or SubtleCrypto.
export function uuid(): string {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export async function digest(bytes: Uint8Array): Promise<Uint8Array> {
  return globalThis.crypto.subtle
    ? new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes.slice().buffer))
    : sha256(bytes);
}
