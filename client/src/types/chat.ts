export interface PollOption {
  id: string;
  text: string;
  votes: string[];
}

export interface PollData {
  question: string;
  options: PollOption[];
  allowMultiple?: boolean;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  isLive?: boolean;
  liveUntil?: string;
  stoppedAt?: string | null;
  accuracy?: number;
  speed?: number | null;
  heading?: number | null;
}

export interface ContactData {
  name: string;
  phone?: string;
  email?: string;
}

export interface StickerData {
  packId?: string;
  stickerId?: string;
  url?: string;
  emoji?: string;
  name?: string;
  label?: string;
}

export interface LinkPreviewData {
  url: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
  mediaType?: 'youtube' | 'spotify' | 'video' | 'audio' | 'article' | 'general';
  embedUrl?: string;
}

export interface Message {
  _id: string;
  id?: string;
  seq?: number | null;
  clientMessageId?: string;
  clientCreatedAt?: string | null;
  serverReceivedAt?: string | null;
  conversationId: string;
  senderId: string;
  type?: 'text' | 'image' | 'video' | 'file' | 'audio' | 'call' | 'poll' | 'location' | 'contact' | 'sticker' | 'gif';
  text?: string;
  mediaUrl?: string;
  mediaKey?: string;
  mimeType?: string;
  fileName?: string;
  caption?: string | null;
  fileSize?: number;
  duration?: number | null;
  waveform?: number[] | null;
  thumbnailUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  deletedFor?: string[];
  deletedForEveryone?: boolean;
  deletedForSelf?: boolean;
  replyToMessageId?: string | null;
  forwardedFromMessageId?: string | null;
  reactions?: { senderId: string; emoji: string }[];
  status: 'sending' | 'sent' | 'delivered' | 'seen' | 'failed';
  starredBy?: string[];
  isPinned?: boolean;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
  expiresAt?: string | null;
  poll?: PollData | null;
  location?: LocationData | null;
  contact?: ContactData | null;
  sticker?: StickerData | null;
  linkPreview?: LinkPreviewData | null;
  gifUrl?: string | null;
  e2ee?: { ciphertext: string; iv: string; version: number } | null;
}

export interface Story {
  _id: string;
  conversationId: string;
  creatorId: string;
  type: 'image' | 'video' | 'text';
  mediaUrl?: string | null;
  mediaKey?: string | null;
  text?: string;
  caption?: string;
  backgroundColor?: string;
  textStyle?: { font?: string; color?: string };
  duration?: number;
  viewers: Array<{ uid: string; viewedAt: string }>;
  reactions: Array<{ uid: string; emoji: string; createdAt: string }>;
  createdAt: string;
  expiresAt: string;
}

export interface TogetherSession {
  sessionId?: string;
  conversationId: string;
  mediaUrl: string;
  mediaType: 'youtube' | 'direct' | 'custom' | 'spotify';
  title?: string;
  hostUserId?: string;
  hostUid?: string;
  state?: 'playing' | 'paused' | 'stopped';
  position?: number;
  playing?: boolean;
  isPlaying?: boolean;
  currentTime?: number;
  updatedAt?: string;
  sentAt?: number;
  lastActionUid?: string;
  version?: number;
}

export type ThemeFamily =
  | 'classic'
  | 'sunset'
  | 'ocean'
  | 'emerald'
  | 'rose'
  | 'midnight'
  | 'cyberpunk'
  | 'sage'
  | 'monochrome';

export type ChatThemePreset =
  | ThemeFamily
  | 'ig-classic'
  | 'ig-cyberpunk'
  | 'ig-ocean'
  | 'ig-golden-hour'
  | 'ig-sage'
  | 'ig-love'
  | 'ig-midnight'
  | 'ig-monochrome'
  | 'classic-purple'
  | 'midnight-velvet'
  | 'sunset-glow'
  | 'emerald-forest'
  | 'rose-quartz'
  | 'slate-minimal'
  | 'wibby-whatsapp'
  | 'wibby-instagram';

export type GameType =
  | 'tictactoe'
  | 'dotsandboxes'
  | 'wordimposter'
  | 'connectfour'
  | 'rockpaperscissors'
  | 'memorymatch'
  | 'gomoku'
  | 'checkers'
  | 'battleship'
  | 'reversi'
  | 'coopwordle';

export interface GameState {
  gameId: string;
  conversationId: string;
  gameType: GameType;
  players: { [uid: string]: { name?: string; symbol?: string; color?: string } };
  playerOrder: string[];
  currentTurn: string;
  status: 'waiting' | 'in_progress' | 'won' | 'draw' | 'declined' | 'ended';
  winnerId?: string | null;
  scores: { [uid: string]: number };
  stateData: any;
  updatedAt: string;
}

