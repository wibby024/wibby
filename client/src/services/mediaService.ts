import { auth } from '../lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';

export interface UploadProgressEvent {
  loaded: number;
  total: number;
  percent: number;
  phase: 'uploading' | 'uploaded' | 'sending' | 'sent';
}

export interface UploadMediaOptions {
  conversationId: string;
  file: File;
  caption?: string;
  clientMessageId?: string;
  replyToMessageId?: string | null;
  forwardedFromMessageId?: string | null;
  duration?: number;
  waveform?: number[] | string;
  onProgress?: (progress: UploadProgressEvent) => void;
}

export interface UploadMediaHandle {
  promise: Promise<any>;
  abort: () => void;
}

const blobUrlCache = new Map<string, string>();
const inFlightPromises = new Map<string, Promise<string>>();

/**
 * Resolves the active backend API URL based on environment or current window location.
 */
export function getApiUrl(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined' && window.location) {
    const port = '3000';
    return `${window.location.protocol}//${window.location.hostname}:${port}`;
  }
  return 'http://localhost:3000';
}

/**
 * Ensures Firebase auth state is ready and returns the current user.
 * Resolves race conditions when components mount before auth initialization.
 */
async function getReadyAuthUser(): Promise<User> {
  let currentUser = auth.currentUser;
  if (!currentUser && typeof auth.authStateReady === 'function') {
    try {
      await auth.authStateReady();
      currentUser = auth.currentUser;
    } catch {
      // fallback to onAuthStateChanged listener
    }
  }

  if (currentUser) return currentUser;

  return new Promise<User>((resolve, reject) => {
    let settled = false;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !settled) {
        settled = true;
        unsubscribe();
        resolve(user);
      }
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        unsubscribe();
        if (auth.currentUser) {
          resolve(auth.currentUser);
        } else {
          reject(new Error('Authentication timeout: User not logged in'));
        }
      }
    }, 4000);
  });
}

/**
 * Uploads media with genuine XMLHttpRequest upload progress tracking and cancellation.
 */
export function uploadMedia({
  conversationId,
  file,
  caption,
  clientMessageId,
  replyToMessageId,
  forwardedFromMessageId,
  duration,
  waveform,
  onProgress
}: UploadMediaOptions): UploadMediaHandle {
  let activeXhr: XMLHttpRequest | null = null;
  let isAborted = false;

  const performUpload = async (forceRefreshToken = false): Promise<any> => {
    return new Promise<any>(async (resolve, reject) => {
      try {
        console.log('[WIBBY MEDIA] upload starting for file:', file.name, 'type:', file.type, 'size:', file.size);
        const currentUser = await getReadyAuthUser();
        const token = await currentUser.getIdToken(forceRefreshToken);
        const formData = new FormData();
        formData.append('file', file);
        if (caption) formData.append('caption', caption);
        if (clientMessageId) formData.append('clientMessageId', clientMessageId);
        if (replyToMessageId) formData.append('replyToMessageId', replyToMessageId);
        if (forwardedFromMessageId) formData.append('forwardedFromMessageId', forwardedFromMessageId);
        if (duration !== undefined && duration !== null && !isNaN(duration)) formData.append('duration', String(duration));
        if (waveform) {
          formData.append('waveform', typeof waveform === 'string' ? waveform : JSON.stringify(waveform));
        }

        const API_URL = getApiUrl();
        const endpoint = `${API_URL}/api/conversations/${conversationId}/media`;

        console.log('[WIBBY MEDIA] POSTing to endpoint:', endpoint);
        const xhr = new XMLHttpRequest();
        activeXhr = xhr;

        xhr.open('POST', endpoint, true);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        // Track genuine upload progress
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress && !isAborted) {
            const percent = Math.min(Math.round((event.loaded / event.total) * 100), 99);
            console.log('[WIBBY MEDIA] upload progress:', percent, '%');
            onProgress({
              loaded: event.loaded,
              total: event.total,
              percent,
              phase: 'uploading'
            });
          }
        };

        xhr.upload.onload = () => {
          if (onProgress && !isAborted) {
            onProgress({
              loaded: file.size,
              total: file.size,
              percent: 100,
              phase: 'uploaded'
            });
          }
        };

        xhr.onload = async () => {
          if (isAborted) return;
          console.log('[WIBBY MEDIA] upload response status:', xhr.status);

          // If 401 and we haven't forced refresh yet, retry once with refreshed token
          if (xhr.status === 401 && !forceRefreshToken) {
            console.log('[WIBBY MEDIA] Received 401 during upload, refreshing Firebase token and retrying...');
            try {
              const retryResult = await performUpload(true);
              resolve(retryResult);
              return;
            } catch (retryErr) {
              reject(retryErr);
              return;
            }
          }

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              console.log('[WIBBY MEDIA] upload response data:', data);
              if (onProgress) {
                onProgress({
                  loaded: file.size,
                  total: file.size,
                  percent: 100,
                  phase: 'sent'
                });
              }
              resolve(data.message);
            } catch (e) {
              console.error('[WIBBY MEDIA] JSON parse error:', e, xhr.responseText);
              reject(new Error('Invalid response from server'));
            }
          } else {
            try {
              const errData = JSON.parse(xhr.responseText);
              console.error('[WIBBY MEDIA] upload failed with server error:', errData);
              reject(new Error(errData.error || `Upload failed with status ${xhr.status}`));
            } catch {
              console.error('[WIBBY MEDIA] upload failed with status:', xhr.status);
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };

        xhr.onerror = (e) => {
          if (!isAborted) {
            console.error('[WIBBY MEDIA] XHR onerror triggered:', e);
            reject(new Error('Network error during upload'));
          }
        };

        xhr.onabort = () => {
          console.log('[WIBBY MEDIA] XHR upload aborted');
          reject(new Error('Upload cancelled'));
        };

        xhr.send(formData);
      } catch (err) {
        console.error('[WIBBY MEDIA] uploadMedia outer error:', err);
        reject(err);
      }
    });
  };

  const promise = performUpload(false);

  return {
    promise,
    abort: () => {
      isAborted = true;
      if (activeXhr) {
        activeXhr.abort();
      }
    }
  };
}

/**
 * Fetches private media with the user's Firebase token and creates an Object URL for rendering.
 * Uses caching, deduplication, and automatic token refresh on 401.
 */
export async function getAuthenticatedMediaBlobUrl(_conversationId: string, mediaUrl: string): Promise<string> {
  if (!mediaUrl) return '';

  const cacheKey = mediaUrl;
  if (blobUrlCache.has(cacheKey)) {
    return blobUrlCache.get(cacheKey)!;
  }

  if (inFlightPromises.has(cacheKey)) {
    return inFlightPromises.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    try {
      const currentUser = await getReadyAuthUser();
      let token = await currentUser.getIdToken();
      const API_URL = getApiUrl();
      const fullUrl = mediaUrl.startsWith('http') ? mediaUrl : `${API_URL}${mediaUrl}`;

      let response = await fetch(fullUrl, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      // If token expired or invalid, force refresh token and retry
      if (response.status === 401) {
        token = await currentUser.getIdToken(true);
        response = await fetch(fullUrl, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      }

      if (!response.ok) {
        throw new Error(`Failed to load media (HTTP ${response.status})`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      blobUrlCache.set(cacheKey, blobUrl);
      return blobUrl;
    } finally {
      inFlightPromises.delete(cacheKey);
    }
  })();

  inFlightPromises.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Generates an authenticated URL with token query parameter for video/audio streaming.
 */
export async function getAuthenticatedStreamUrl(_conversationId: string, mediaUrl: string): Promise<string> {
  if (!mediaUrl) return '';
  try {
    const currentUser = await getReadyAuthUser();
    const token = await currentUser.getIdToken();
    const API_URL = getApiUrl();
    const fullUrl = mediaUrl.startsWith('http') ? mediaUrl : `${API_URL}${mediaUrl}`;
    const separator = fullUrl.includes('?') ? '&' : '?';
    return `${fullUrl}${separator}token=${encodeURIComponent(token)}`;
  } catch {
    return mediaUrl;
  }
}

/**
 * Downloads a file privately by fetching with Firebase token and triggering a browser download.
 */
export async function downloadMediaFile(_conversationId: string, mediaUrl: string, fileName: string): Promise<void> {
  const currentUser = await getReadyAuthUser();
  let token = await currentUser.getIdToken();
  const API_URL = getApiUrl();
  const fullUrl = mediaUrl.startsWith('http') ? mediaUrl : `${API_URL}${mediaUrl}?download=true`;

  let response = await fetch(fullUrl, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    token = await currentUser.getIdToken(true);
    response = await fetch(fullUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(blobUrl);
}
