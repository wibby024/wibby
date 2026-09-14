export const MEDIA_LIMITS = {
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10 MB
  MAX_VIDEO_SIZE: 50 * 1024 * 1024, // 50 MB
  MAX_DOCUMENT_SIZE: 25 * 1024 * 1024, // 25 MB
  MAX_AUDIO_SIZE: 16 * 1024 * 1024, // 16 MB (Voice Messages)

  ALLOWED_IMAGE_MIMES: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ],

  ALLOWED_VIDEO_MIMES: [
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ],

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
  ],

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
  ],

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
  ],

  ALLOWED_AUDIO_EXTENSIONS: [
    '.webm',
    '.ogg',
    '.mp4',
    '.m4a',
    '.aac',
    '.wav',
    '.mp3'
  ]
};

export type MediaCategory = 'image' | 'video' | 'file' | 'audio';

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatAudioDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Capability detector that selects the highest-quality audio recording format supported by the current browser.
 */
export function getBestAudioRecorderMimeType(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return 'audio/webm';
  }

  const candidateMimes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ];

  for (const mime of candidateMimes) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }

  return ''; // Browser default
}

export const ACCEPT_PATTERNS = {
  image: 'image/*,.jpg,.jpeg,.png,.webp,.gif,.JPG,.JPEG,.PNG,.WEBP,.GIF',
  video: 'video/*,.mp4,.webm,.mov,.MP4,.WEBM,.MOV',
  file: '.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.PDF,.TXT,.DOC,.DOCX,.XLS,.XLSX,.PPT,.PPTX,.ZIP,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip,application/x-zip-compressed',
  all: 'image/*,video/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.mov,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip,application/x-zip-compressed'
};

export function validateClientFile(file: File, requestedCategory?: MediaCategory): { valid: boolean; category: MediaCategory; error?: string } {
  if (!file || file.size === 0) {
    return { valid: false, category: requestedCategory || 'file', error: 'File is empty or corrupted' };
  }

  const mime = file.type ? file.type.toLowerCase().trim() : '';
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase().trim();

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const imageMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/pjpeg', 'image/x-png', 'image/webp', 'image/gif'];
  const videoExtensions = ['.mp4', '.webm', '.mov', '.qt'];
  const videoMimes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];
  const audioExtensions = ['.webm', '.ogg', '.mp4', '.m4a', '.aac', '.wav', '.mp3'];

  let detectedCategory: MediaCategory | null = null;

  if (mime.startsWith('audio/')) {
    detectedCategory = 'audio';
  } else if (mime.startsWith('video/')) {
    detectedCategory = 'video';
  } else if (mime.startsWith('image/')) {
    detectedCategory = 'image';
  } else if (imageMimes.includes(mime) || imageExtensions.includes(ext)) {
    detectedCategory = 'image';
  } else if (videoMimes.includes(mime) || videoExtensions.includes(ext)) {
    detectedCategory = 'video';
  } else if (audioExtensions.includes(ext)) {
    detectedCategory = 'audio';
  } else if (
    MEDIA_LIMITS.ALLOWED_DOCUMENT_MIMES.includes(mime) ||
    MEDIA_LIMITS.ALLOWED_DOCUMENT_EXTENSIONS.includes(ext)
  ) {
    detectedCategory = 'file';
  }

  if (!detectedCategory) {
    return {
      valid: false,
      category: requestedCategory || 'file',
      error: 'Unsupported file type. Supported: Photos (PNG, JPG, WEBP, GIF), Videos (MP4, WEBM, MOV), Voice notes (WebM, MP4, AAC, OGG), Documents (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, ZIP)'
    };
  }

  // If user requested a specific category (e.g. Photo button), check for compatibility
  if (requestedCategory && requestedCategory !== detectedCategory) {
    console.log(`[WIBBY MEDIA] User selected ${detectedCategory} via ${requestedCategory} picker, auto-routing to ${detectedCategory}`);
  }

  if (detectedCategory === 'image') {
    if (file.size > MEDIA_LIMITS.MAX_IMAGE_SIZE) {
      return {
        valid: false,
        category: 'image',
        error: `Photo "${file.name}" (${formatFileSize(file.size)}) exceeds the 10MB limit`
      };
    }
  } else if (detectedCategory === 'video') {
    if (file.size > MEDIA_LIMITS.MAX_VIDEO_SIZE) {
      return {
        valid: false,
        category: 'video',
        error: `Video "${file.name}" (${formatFileSize(file.size)}) exceeds the 50MB limit`
      };
    }
  } else if (detectedCategory === 'audio') {
    if (file.size > MEDIA_LIMITS.MAX_AUDIO_SIZE) {
      return {
        valid: false,
        category: 'audio',
        error: `Voice message (${formatFileSize(file.size)}) exceeds the 16MB limit`
      };
    }
  } else if (detectedCategory === 'file') {
    if (file.size > MEDIA_LIMITS.MAX_DOCUMENT_SIZE) {
      return {
        valid: false,
        category: 'file',
        error: `Document "${file.name}" (${formatFileSize(file.size)}) exceeds the 25MB limit`
      };
    }
  }

  return { valid: true, category: detectedCategory };
}


