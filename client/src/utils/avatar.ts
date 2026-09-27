/**
 * Resolves an avatar URL into a fully-qualified URL against the production API URL.
 */
export function resolveAvatarUrl(url?: string | null): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return undefined;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  const apiUrl = import.meta.env.VITE_API_URL || 'https://wibby.onrender.com';
  return `${apiUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}
