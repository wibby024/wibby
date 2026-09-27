import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Legally usable, high-quality animated GIFs indexed by categories and keywords
// ₹0 infrastructure guaranteed with zero required external API keys
interface GifItem {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  category: string;
  tags: string[];
}

const CURATED_GIFS: GifItem[] = [
  // Trending / Reactions
  {
    id: 'gif-party-popper',
    title: 'Party Celebration',
    url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/200w.gif',
    width: 480,
    height: 480,
    category: 'celebrate',
    tags: ['party', 'celebrate', 'confetti', 'woohoo', 'yay', 'birthday', 'congrats']
  },
  {
    id: 'gif-thumbs-up',
    title: 'Thumbs Up Good Job',
    url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/111ebonMs90YLu/200w.gif',
    width: 480,
    height: 360,
    category: 'reactions',
    tags: ['thumbs up', 'yes', 'ok', 'approve', 'agree', 'nice', 'great', 'cool']
  },
  {
    id: 'gif-dance-happy',
    title: 'Happy Dance',
    url: 'https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/blSTtZehjAZ8I/200w.gif',
    width: 480,
    height: 360,
    category: 'dance',
    tags: ['dance', 'groove', 'happy', 'excited', 'party', 'moves', 'music']
  },
  {
    id: 'gif-laugh-hard',
    title: 'Laughing Out Loud',
    url: 'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/10JhviFuU2gWD6/200w.gif',
    width: 480,
    height: 360,
    category: 'funny',
    tags: ['laugh', 'lol', 'rofl', 'haha', 'funny', 'hilarious', 'joke', 'giggle']
  },
  {
    id: 'gif-warm-hug',
    title: 'Warm Hug',
    url: 'https://media.giphy.com/media/od5H3PmEG5EVq/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/od5H3PmEG5EVq/200w.gif',
    width: 480,
    height: 360,
    category: 'love',
    tags: ['hug', 'cuddle', 'love', 'comfort', 'friendship', 'care', 'miss you']
  },
  {
    id: 'gif-sparkle-heart',
    title: 'Heart Love',
    url: 'https://media.giphy.com/media/M90mJvfWfd5mbUuULX/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/M90mJvfWfd5mbUuULX/200w.gif',
    width: 480,
    height: 480,
    category: 'love',
    tags: ['heart', 'love', 'romantic', 'crush', 'sweet', 'kisses', 'bae', 'sparkle']
  },
  {
    id: 'gif-cat-vibe',
    title: 'Vibing Cat',
    url: 'https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/200w.gif',
    width: 480,
    height: 360,
    category: 'cats',
    tags: ['cat', 'vibe', 'jamming', 'bop', 'nodding', 'cute', 'kitten', 'music']
  },
  {
    id: 'gif-mind-blown',
    title: 'Mind Blown Shocked',
    url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/200w.gif',
    width: 480,
    height: 360,
    category: 'reactions',
    tags: ['mind blown', 'shocked', 'wow', 'omg', 'what', 'unbelievable', 'boom']
  },
  {
    id: 'gif-popcorn-drama',
    title: 'Eating Popcorn',
    url: 'https://media.giphy.com/media/GLbiGvv9RiNpK/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/GLbiGvv9RiNpK/200w.gif',
    width: 480,
    height: 270,
    category: 'reactions',
    tags: ['popcorn', 'drama', 'watching', 'tea', 'spill', 'ready', 'listening']
  },
  {
    id: 'gif-nod-yes',
    title: 'Nodding In Agreement',
    url: 'https://media.giphy.com/media/NEvPzZ8bd1V4Y/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/NEvPzZ8bd1V4Y/200w.gif',
    width: 480,
    height: 270,
    category: 'reactions',
    tags: ['yes', 'agree', 'nod', 'exactly', 'correct', 'yep', 'indeed']
  },
  {
    id: 'gif-facepalm-sigh',
    title: 'Facepalm',
    url: 'https://media.giphy.com/media/xsF1FSDbjguis/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/xsF1FSDbjguis/200w.gif',
    width: 480,
    height: 360,
    category: 'reactions',
    tags: ['facepalm', 'sigh', 'smh', 'why', 'disappointed', 'oops', 'embarrassed']
  },
  {
    id: 'gif-cheers-drink',
    title: 'Cheers Toast',
    url: 'https://media.giphy.com/media/GCLlQnV7dXZ2E/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/GCLlQnV7dXZ2E/200w.gif',
    width: 480,
    height: 360,
    category: 'celebrate',
    tags: ['cheers', 'drink', 'toast', 'celebrate', 'glass', 'champagne', 'friend']
  },
  {
    id: 'gif-bye-wave',
    title: 'Waving Goodbye',
    url: 'https://media.giphy.com/media/m9eG1qVjvNINHgvPxF/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/m9eG1qVjvNINHgvPxF/200w.gif',
    width: 480,
    height: 360,
    category: 'reactions',
    tags: ['bye', 'goodbye', 'wave', 'see you', 'cya', 'farewell', 'later']
  },
  {
    id: 'gif-excited-jump',
    title: 'Super Excited',
    url: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/5GoVLqeAOo6PK/200w.gif',
    width: 480,
    height: 360,
    category: 'happy',
    tags: ['excited', 'happy', 'yay', 'jumping', 'thrilled', 'omg', 'hype']
  },
  {
    id: 'gif-pleading-eyes',
    title: 'Pleading Puppy Eyes',
    url: 'https://media.giphy.com/media/qUIm5IsE22N1K/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/qUIm5IsE22N1K/200w.gif',
    width: 480,
    height: 360,
    category: 'reactions',
    tags: ['please', 'pleading', 'puppy eyes', 'begging', 'cute', 'sorry']
  },
  {
    id: 'gif-coffee-morning',
    title: 'Morning Coffee',
    url: 'https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/200w.gif',
    width: 480,
    height: 360,
    category: 'reactions',
    tags: ['coffee', 'morning', 'wake up', 'tea', 'tired', 'energy', 'caffeine']
  },
  {
    id: 'gif-sleeping-zzz',
    title: 'Sleepy Zzz',
    url: 'https://media.giphy.com/media/mkhMTALSJYJWU/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/mkhMTALSJYJWU/200w.gif',
    width: 480,
    height: 360,
    category: 'reactions',
    tags: ['sleep', 'tired', 'bed', 'goodnight', 'nap', 'zzz', 'exhausted']
  },
  {
    id: 'gif-dog-happy',
    title: 'Happy Puppy',
    url: 'https://media.giphy.com/media/4Zo41lhzKt6iZ8xff9/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/4Zo41lhzKt6iZ8xff9/200w.gif',
    width: 480,
    height: 360,
    category: 'happy',
    tags: ['dog', 'puppy', 'cute', 'happy', 'wagging', 'pets', 'joy']
  },
  {
    id: 'gif-fire-lit',
    title: 'This Is Fire',
    url: 'https://media.giphy.com/media/yr7n0u3qzO9nG/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/yr7n0u3qzO9nG/200w.gif',
    width: 480,
    height: 360,
    category: 'reactions',
    tags: ['fire', 'lit', 'flames', 'epic', 'wild', 'burn', 'hot']
  },
  {
    id: 'gif-mic-drop',
    title: 'Mic Drop',
    url: 'https://media.giphy.com/media/3o7qDSOvfaCO9b3MlO/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3o7qDSOvfaCO9b3MlO/200w.gif',
    width: 480,
    height: 270,
    category: 'reactions',
    tags: ['mic drop', 'done', 'won', 'boom', 'period', 'over', 'boss']
  }
];

// Simple in-memory search across the catalog
function searchLocalGifs(query: string, category?: string): GifItem[] {
  let list = CURATED_GIFS;
  if (category && category !== 'trending') {
    list = list.filter(g => g.category.toLowerCase() === category.toLowerCase());
  }
  if (!query || query.trim() === '') {
    return list;
  }
  const cleanQ = query.trim().toLowerCase();
  const words = cleanQ.split(/\s+/).filter(Boolean);

  return list.filter(g => {
    const textToMatch = `${g.title} ${g.category} ${g.tags.join(' ')}`.toLowerCase();
    return words.every(w => textToMatch.includes(w));
  });
}

// In-memory cache for optional live external search results
const externalCache = new Map<string, { timestamp: number; results: GifItem[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

router.use(requireAuth);

/**
 * GET /api/gifs/trending
 * Return popular trending GIFs with categories
 */
router.get('/trending', async (req: Request, res: Response) => {
  try {
    const category = (req.query.category as string) || 'trending';
    const results = searchLocalGifs('', category);

    res.json({
      category,
      results,
      categories: [
        { id: 'trending', name: 'Trending', icon: '🔥' },
        { id: 'reactions', name: 'Reactions', icon: '👀' },
        { id: 'happy', name: 'Happy', icon: '😄' },
        { id: 'love', name: 'Love', icon: '❤️' },
        { id: 'celebrate', name: 'Celebrate', icon: '🎉' },
        { id: 'dance', name: 'Dance', icon: '💃' },
        { id: 'funny', name: 'Funny', icon: '😂' },
        { id: 'cats', name: 'Cats & Pets', icon: '🐱' }
      ]
    });
  } catch (error) {
    console.error('Error fetching trending GIFs:', error);
    res.status(500).json({ error: 'Failed to fetch trending GIFs' });
  }
});

/**
 * GET /api/gifs/search?q=...&category=...
 * Search GIFs by query or category
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = ((req.query.q as string) || '').trim();
    const category = (req.query.category as string) || '';

    // Check optional Tenor API key if configured
    const tenorKey = process.env.TENOR_API_KEY;
    if (tenorKey && query.length > 0) {
      const cacheKey = `tenor:${query}:${category}`;
      const cached = externalCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return res.json({ results: cached.results, source: 'tenor' });
      }

      try {
        const tenorUrl = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${tenorKey}&limit=20&client_key=wibby_web`;
        const fetchRes = await fetch(tenorUrl, { signal: AbortSignal.timeout(3000) });
        if (fetchRes.ok) {
          const tenorData = await fetchRes.json();
          if (Array.isArray(tenorData.results)) {
            const mapped: GifItem[] = tenorData.results.map((r: any) => {
              const gifMedia = r.media_formats?.gif || r.media_formats?.mediumgif || r.media_formats?.tinygif;
              return {
                id: r.id,
                title: r.content_description || query,
                url: gifMedia?.url || '',
                previewUrl: r.media_formats?.tinygif?.url || gifMedia?.url || '',
                width: gifMedia?.dims?.[0] || 320,
                height: gifMedia?.dims?.[1] || 240,
                category: category || 'search',
                tags: [query]
              };
            }).filter((g: GifItem) => Boolean(g.url));

            if (mapped.length > 0) {
              externalCache.set(cacheKey, { timestamp: Date.now(), results: mapped });
              return res.json({ results: mapped, source: 'tenor' });
            }
          }
        }
      } catch (externalErr) {
        console.warn('Tenor API fetch failed or timed out, falling back to local catalog:', externalErr);
      }
    }

    // Curated catalog fallback (instant, zero cost, completely robust)
    const results = searchLocalGifs(query, category);
    res.json({ results, source: 'catalog' });
  } catch (error) {
    console.error('Error searching GIFs:', error);
    res.status(500).json({ error: 'Failed to search GIFs' });
  }
});

export default router;
