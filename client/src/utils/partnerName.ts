/**
 * Centralized, foolproof utility for partner & user display name resolution.
 * Guarantees that generic placeholder strings like "Partner", "Unknown", or "User"
 * are NEVER displayed when any personal name, username, email prefix, or identifier is available.
 */

const GENERIC_PLACEHOLDERS = new Set([
  '',
  'partner',
  'unknown',
  'wibby user',
  'wibby_user',
  'wibbyuser',
  'user',
  'you',
  'null',
  'undefined'
]);

/**
 * Checks whether a candidate name string is null, empty, or a generic placeholder.
 */
export function isGenericPlaceholder(name: string | null | undefined): boolean {
  if (!name || typeof name !== 'string') return true;
  return GENERIC_PLACEHOLDERS.has(name.trim().toLowerCase());
}

/**
 * Capitalizes the first letter of a string.
 */
export function capitalize(str: string): string {
  if (!str) return '';
  const trimmed = str.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Resolves a human-friendly personal display name for the connected partner.
 * Hierarchy:
 *  1. Clean, non-generic displayName / display_name
 *  2. Clean, non-generic name property
 *  3. Clean, non-generic username (capitalized e.g. "rahul" -> "Rahul")
 *  4. Email prefix (e.g. "rahul024@gmail.com" -> "Rahul024")
 *  5. Caller name if present
 *  6. Short UID identifier (e.g. "User 3F8A")
 *  7. Fallback string
 */
export function resolvePartnerName(partner: any, fallback: string = 'Partner'): string {
  if (!partner) return fallback;

  // 1. Check displayName / display_name
  const rawDisplayName = partner.displayName || partner.display_name;
  if (!isGenericPlaceholder(rawDisplayName)) {
    return rawDisplayName.trim();
  }

  // 2. Check name
  if (!isGenericPlaceholder(partner.name)) {
    return partner.name.trim();
  }

  // 3. Check username
  if (!isGenericPlaceholder(partner.username)) {
    const cleanUser = partner.username.trim().replace(/^@+/, '');
    if (!isGenericPlaceholder(cleanUser)) {
      return capitalize(cleanUser);
    }
  }

  // 4. Check email prefix
  const email = partner.email;
  if (email && typeof email === 'string' && email.includes('@')) {
    const prefix = email.split('@')[0].trim();
    if (!isGenericPlaceholder(prefix)) {
      return capitalize(prefix);
    }
  }

  // 5. Check callerName
  if (!isGenericPlaceholder(partner.callerName)) {
    return partner.callerName.trim();
  }

  // 6. Identifier based on UID if available
  const uid = partner.firebaseUid || partner.uid || partner.id;
  if (uid && typeof uid === 'string' && uid.length >= 4) {
    return `User ${uid.slice(0, 4).toUpperCase()}`;
  }

  return fallback;
}

/**
 * Resolves a clean username for the partner (without '@' prefix).
 */
export function resolvePartnerUsername(partner: any, fallback: string = ''): string {
  if (!partner) return fallback;

  if (!isGenericPlaceholder(partner.username)) {
    return partner.username.trim().replace(/^@+/, '').toLowerCase();
  }

  const email = partner.email;
  if (email && typeof email === 'string' && email.includes('@')) {
    const prefix = email.split('@')[0].trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!isGenericPlaceholder(prefix)) {
      return prefix;
    }
  }

  const uid = partner.firebaseUid || partner.uid || partner.id;
  if (uid && typeof uid === 'string') {
    return `user_${uid.slice(0, 6).toLowerCase()}`;
  }

  return fallback;
}
