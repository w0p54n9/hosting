import 'server-only';
import { createHash, randomBytes } from 'crypto';

/** Secret bearer token handed to the browser once; only its hash is stored. */
export const newToken = () => randomBytes(24).toString('base64url');

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
/** Short, unguessable-enough event code for invite links, e.g. /e/k7mq2xpa */
export function newSlug(len = 8): string {
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  return s;
}
