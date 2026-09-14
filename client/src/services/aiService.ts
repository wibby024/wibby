/**
 * WIBBY — In-Browser Zero-Cost AI & Smart Intelligence Service
 * 
 * Runs 100% locally in the browser with 0 external API keys & $0 cost:
 * - Web Speech API Voice Transcription
 * - Text-to-Speech Synthesis
 * - Context-Aware Smart Quick Replies
 * - Natural Language Query Tokenizer & Intent Parser
 */

export interface SmartReply {
  id: string;
  text: string;
  emoji?: string;
}

export interface ParsedSearchIntent {
  query: string;
  typeFilter?: 'all' | 'media' | 'files' | 'links';
  senderFilter?: 'me' | 'partner';
  dateFilter?: 'today' | 'yesterday' | 'week' | 'month';
}

class AIService {
  private recognition: any = null;
  private isListening = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        this.recognition = new SpeechRec();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';
      }
    }
  }

  /**
   * Check if in-browser voice transcription is available
   */
  isTranscriptionSupported(): boolean {
    return Boolean(this.recognition);
  }

  /**
   * Transcribe speech directly via browser microphone
   */
  transcribeLive(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        return reject(new Error('Browser Speech Recognition not supported'));
      }

      if (this.isListening) {
        try { this.recognition.stop(); } catch {}
      }

      this.recognition.onresult = (event: any) => {
        this.isListening = false;
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        resolve(transcript.trim());
      };

      this.recognition.onerror = (event: any) => {
        this.isListening = false;
        reject(new Error(event.error || 'Speech recognition failed'));
      };

      this.recognition.onend = () => {
        this.isListening = false;
      };

      try {
        this.isListening = true;
        this.recognition.start();
      } catch (err) {
        this.isListening = false;
        reject(err);
      }
    });
  }

  /**
   * Text-to-Speech audio read-out of a message
   */
  speakText(text: string): boolean {
    if (typeof window === 'undefined' || !window.speechSynthesis) return false;

    try {
      window.speechSynthesis.cancel(); // Stop any pending speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (err) {
      console.warn('[WIBBY AI] TTS error:', err);
      return false;
    }
  }

  /**
   * Generate context-aware smart replies based on partner's last message
   */
  generateSmartReplies(lastMessageText?: string, lastMessageType?: string): SmartReply[] {
    if (!lastMessageText && !lastMessageType) return [];

    const text = (lastMessageText || '').toLowerCase().trim();

    // Image / Video media message
    if (lastMessageType === 'image' || lastMessageType === 'video') {
      return [
        { id: 'sr_1', text: 'Looks amazing!', emoji: '😍' },
        { id: 'sr_2', text: 'Love this!', emoji: '❤️' },
        { id: 'sr_3', text: 'So cool!', emoji: '🔥' }
      ];
    }

    // Call / Meeting intent
    if (text.includes('call') || text.includes('talk') || text.includes('free') || text.includes('ready')) {
      return [
        { id: 'sr_call_1', text: "Let's call!", emoji: '📞' },
        { id: 'sr_call_2', text: 'Give me 5 mins!', emoji: '⏳' },
        { id: 'sr_call_3', text: 'Sounds great!', emoji: '👍' }
      ];
    }

    // Question intent
    if (text.endsWith('?') || text.includes('what') || text.includes('how') || text.includes('where') || text.includes('when')) {
      return [
        { id: 'sr_q_1', text: 'Yes, definitely!', emoji: '✨' },
        { id: 'sr_q_2', text: 'Not sure yet', emoji: '🤔' },
        { id: 'sr_q_3', text: 'Let me check!', emoji: '👀' }
      ];
    }

    // Greeting intent
    if (text.includes('hey') || text.includes('hello') || text.includes('hi') || text.includes('morning') || text.includes('night')) {
      if (text.includes('morning')) {
        return [
          { id: 'sr_m_1', text: 'Good morning! ☀️' },
          { id: 'sr_m_2', text: 'Hope you have a great day! ✨' }
        ];
      }
      if (text.includes('night')) {
        return [
          { id: 'sr_n_1', text: 'Good night! Sleep well 🌙' },
          { id: 'sr_n_2', text: 'Sweet dreams! 💤' }
        ];
      }
      return [
        { id: 'sr_g_1', text: 'Hey there! How are you?' },
        { id: 'sr_g_2', text: 'Hi! Good to hear from you 😊' }
      ];
    }

    // Default conversational smart replies
    return [
      { id: 'sr_def_1', text: 'Sounds good to me!', emoji: '👍' },
      { id: 'sr_def_2', text: 'Thanks! 😊' },
      { id: 'sr_def_3', text: 'Got it! ✨' }
    ];
  }

  /**
   * Parse natural language search queries into structured search parameters
   * E.g. "photos from yesterday" -> { query: '', typeFilter: 'media', dateFilter: 'yesterday' }
   */
  parseNaturalSearch(input: string): ParsedSearchIntent {
    const raw = input.toLowerCase().trim();
    let query = input.trim();
    let typeFilter: ParsedSearchIntent['typeFilter'] = 'all';
    let dateFilter: ParsedSearchIntent['dateFilter'] = undefined;
    let senderFilter: ParsedSearchIntent['senderFilter'] = undefined;

    // Type filters
    if (raw.includes('photo') || raw.includes('image') || raw.includes('picture') || raw.includes('video') || raw.includes('type:media')) {
      typeFilter = 'media';
      query = query.replace(/(photos?|images?|pictures?|videos?|type:media)/gi, '').trim();
    } else if (raw.includes('file') || raw.includes('pdf') || raw.includes('doc') || raw.includes('zip') || raw.includes('type:file')) {
      typeFilter = 'files';
      query = query.replace(/(files?|documents?|pdfs?|zips?|type:files?)/gi, '').trim();
    } else if (raw.includes('link') || raw.includes('url') || raw.includes('http') || raw.includes('type:link')) {
      typeFilter = 'links';
      query = query.replace(/(links?|urls?|type:links?)/gi, '').trim();
    }

    // Date filters
    if (raw.includes('today')) {
      dateFilter = 'today';
      query = query.replace(/today/gi, '').trim();
    } else if (raw.includes('yesterday')) {
      dateFilter = 'yesterday';
      query = query.replace(/yesterday/gi, '').trim();
    } else if (raw.includes('last week') || raw.includes('this week')) {
      dateFilter = 'week';
      query = query.replace(/(last week|this week)/gi, '').trim();
    }

    // Sender filters
    if (raw.includes('from me') || raw.includes('sent by me') || raw.includes('sender:me')) {
      senderFilter = 'me';
      query = query.replace(/(from me|sent by me|sender:me)/gi, '').trim();
    } else if (raw.includes('from partner') || raw.includes('sent by partner') || raw.includes('sender:partner')) {
      senderFilter = 'partner';
      query = query.replace(/(from partner|sent by partner|sender:partner)/gi, '').trim();
    }

    // Clean extraneous filler words
    query = query.replace(/\b(find|show|search for|about|containing|sent)\b/gi, '').trim();

    return {
      query,
      typeFilter,
      dateFilter,
      senderFilter
    };
  }
}

export const aiService = new AIService();
