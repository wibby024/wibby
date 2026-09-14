import http from 'http';
import https from 'https';
import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

export interface LinkPreviewData {
  url: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
  mediaType?: 'youtube' | 'spotify' | 'video' | 'audio' | 'article' | 'general';
  embedUrl?: string;
}

function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0' || ip === 'localhost') return true;
  const parts = ip.split('.').map(Number);
  if (parts.length === 4) {
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 127) return true; // 127.0.0.0/8
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
  }
  if (ip.startsWith('fc00:') || ip.startsWith('fe80:') || ip.startsWith('::ffff:127.')) return true;
  return false;
}

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreviewData | null> {
  try {
    let urlObj: URL;
    try {
      urlObj = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    } catch {
      return null;
    }

    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return null;
    }

    // SSRF Protection: Resolve hostname and check for private IPs
    const hostname = urlObj.hostname;
    try {
      const lookupResult = await dnsLookup(hostname);
      if (isPrivateIp(lookupResult.address)) {
        return null;
      }
    } catch {
      return null;
    }

    // Check for YouTube
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      let videoId = '';
      if (hostname.includes('youtu.be')) {
        videoId = urlObj.pathname.slice(1).split('?')[0];
      } else {
        videoId = urlObj.searchParams.get('v') || '';
      }
      if (videoId) {
        return {
          url: urlObj.href,
          title: 'YouTube Video',
          description: `https://www.youtube.com/watch?v=${videoId}`,
          image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          siteName: 'YouTube',
          mediaType: 'youtube',
          embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0`
        };
      }
    }

    // Check for Spotify
    if (hostname.includes('spotify.com')) {
      const parts = urlObj.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const type = parts[0]; // track, album, playlist
        const id = parts[1];
        return {
          url: urlObj.href,
          title: `Spotify ${type.charAt(0).toUpperCase() + type.slice(1)}`,
          description: 'Listen on Spotify',
          siteName: 'Spotify',
          mediaType: 'spotify',
          embedUrl: `https://open.spotify.com/embed/${type}/${id}`
        };
      }
    }

    // Fetch HTML with timeout and size cap
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(urlObj.href, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WibbyBot/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return {
        url: urlObj.href,
        title: urlObj.hostname,
        siteName: urlObj.hostname,
        mediaType: 'general'
      };
    }

    // Read first 200KB of HTML
    const text = (await response.text()).slice(0, 200000);

    const getMeta = (prop: string): string => {
      const match1 = text.match(new RegExp(`<meta[^>]+(?:property|name)=["'](?:og:|twitter:)?${prop}["'][^>]+content=["']([^"']+)["']`, 'i'));
      if (match1 && match1[1]) return match1[1].trim();
      const match2 = text.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:|twitter:)?${prop}["']`, 'i'));
      if (match2 && match2[1]) return match2[1].trim();
      return '';
    };

    let title = getMeta('title');
    if (!title) {
      const titleTag = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      title = titleTag ? titleTag[1].trim() : '';
    }
    if (!title) title = urlObj.hostname;

    let description: string | undefined = getMeta('description') || undefined;
    let image: string | undefined = getMeta('image') || undefined;
    let siteName = getMeta('site_name') || urlObj.hostname || 'Website';

    // Resolve relative image URLs
    if (image && !image.startsWith('http')) {
      try {
        image = new URL(image, urlObj.origin).href;
      } catch {
        image = undefined;
      }
    }

    return {
      url: urlObj.href,
      title: title.slice(0, 300),
      description: description ? description.slice(0, 500) : undefined,
      image: image || undefined,
      siteName: siteName.slice(0, 100),
      mediaType: 'article'
    };
  } catch (err) {
    return null;
  }
}
