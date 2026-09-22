// Centralized Media & File Upload Configuration for Wibby

export const MEDIA_LIMITS = {
  // Max file sizes in bytes
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10 MB
  MAX_VIDEO_SIZE: 50 * 1024 * 1024, // 50 MB
  MAX_DOCUMENT_SIZE: 25 * 1024 * 1024, // 25 MB
  MAX_AUDIO_SIZE: 16 * 1024 * 1024, // 16 MB (Voice Messages)
  MAX_TOTAL_FILE_SIZE: 50 * 1024 * 1024, // 50 MB absolute max for any single upload

  // Allowed MIME types
  ALLOWED_IMAGE_MIMES: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ] as const,

  ALLOWED_VIDEO_MIMES: [
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ] as const,

  ALLOWED_AUDIO_MIMES: [
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/ogg',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/aac',
    'audio/m4a',
    'audio/x-m4a',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/mpeg',
    'audio/mp3'
  ] as const,

  ALLOWED_DOCUMENT_MIMES: [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed'
  ] as const,

  // Allowed file extensions for documents
  ALLOWED_DOCUMENT_EXTENSIONS: [
    '.pdf',
    '.txt',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.zip'
  ] as const,

  // Allowed file extensions for audio
  ALLOWED_AUDIO_EXTENSIONS: [
    '.webm',
    '.ogg',
    '.mp4',
    '.m4a',
    '.aac',
    '.wav',
    '.mp3'
  ] as const
};

export type MediaType = 'image' | 'video' | 'file' | 'audio';

export function determineMediaType(mimeType: string, fileName: string): MediaType | null {
  const normalizedMime = mimeType ? mimeType.toLowerCase().trim() : '';
  const ext = '.' + (fileName.split('.').pop() || '').toLowerCase().trim();

  // 1. Explicit MIME check takes highest priority
  if (normalizedMime.startsWith('audio/')) {
    return 'audio';
  }
  if (normalizedMime.startsWith('video/')) {
    return 'video';
  }
  if (normalizedMime.startsWith('image/')) {
    return 'image';
  }

  // 2. Audio extensions & explicit audio MIME lists
  const audioExtensions = (MEDIA_LIMITS.ALLOWED_AUDIO_EXTENSIONS as readonly string[]);
  const audioMimes = (MEDIA_LIMITS.ALLOWED_AUDIO_MIMES as readonly string[]);
  if (audioMimes.some(m => normalizedMime === m || normalizedMime.startsWith(m))) {
    return 'audio';
  }

  // 3. Image extensions
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif'];
  if (imageExtensions.includes(ext)) {
    return 'image';
  }

  // 4. Video extensions
  const videoExtensions = ['.mp4', '.webm', '.mov', '.qt', '.m4v'];
  if (videoExtensions.includes(ext)) {
    return 'video';
  }

  // 5. Audio-only extensions (m4a, aac, wav, mp3, ogg)
  const audioOnlyExtensions = ['.m4a', '.aac', '.wav', '.mp3', '.ogg'];
  if (audioOnlyExtensions.includes(ext)) {
    return 'audio';
  }

  // 6. Documents
  if (
    (MEDIA_LIMITS.ALLOWED_DOCUMENT_MIMES as readonly string[]).includes(normalizedMime) ||
    (MEDIA_LIMITS.ALLOWED_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)
  ) {
    return 'file';
  }

  return null;
}

export function validateFileSize(type: MediaType, sizeInBytes: number): { valid: boolean; error?: string } {
  if (sizeInBytes <= 0) {
    return { valid: false, error: 'File is empty or corrupted' };
  }

  switch (type) {
    case 'image':
      if (sizeInBytes > MEDIA_LIMITS.MAX_IMAGE_SIZE) {
        return { valid: false, error: `Image size exceeds the ${MEDIA_LIMITS.MAX_IMAGE_SIZE / (1024 * 1024)}MB limit` };
      }
      break;
    case 'video':
      if (sizeInBytes > MEDIA_LIMITS.MAX_VIDEO_SIZE) {
        return { valid: false, error: `Video size exceeds the ${MEDIA_LIMITS.MAX_VIDEO_SIZE / (1024 * 1024)}MB limit` };
      }
      break;
    case 'audio':
      if (sizeInBytes > MEDIA_LIMITS.MAX_AUDIO_SIZE) {
        return { valid: false, error: `Audio size exceeds the ${MEDIA_LIMITS.MAX_AUDIO_SIZE / (1024 * 1024)}MB limit` };
      }
      break;
    case 'file':
      if (sizeInBytes > MEDIA_LIMITS.MAX_DOCUMENT_SIZE) {
        return { valid: false, error: `Document size exceeds the ${MEDIA_LIMITS.MAX_DOCUMENT_SIZE / (1024 * 1024)}MB limit` };
      }
      break;
    default:
      return { valid: false, error: 'Unsupported media type' };
  }

  return { valid: true };
}

export function sanitizeFileName(fileName: string): string {
  // Strip path traversal characters and non-printable characters
  const basename = fileName.replace(/^.*[\\\/]/, '');
  return basename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 150); // limit length
}
