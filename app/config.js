export const COMFY_URL = globalThis.location?.protocol?.startsWith('http')
  ? globalThis.location.origin : 'http://127.0.0.1:8188';

export function randomUuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // getRandomValues доступен и по HTTP в локальной сети.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
