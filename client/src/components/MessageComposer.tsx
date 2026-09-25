import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import EmojiPicker from './EmojiPicker';
import AttachmentMenu from './AttachmentMenu';
import MediaPreviewModal, { type InitialMediaFile } from './MediaPreviewModal';
import VoiceRecorder, { type VoiceRecordingResult } from './VoiceRecorder';
import CameraCaptureModal from './CameraCaptureModal';
import { uploadMedia } from '../services/mediaService';
import { validateClientFile, ACCEPT_PATTERNS, type MediaCategory } from '../config/media';

import PollCreateModal from './PollCreateModal';
import LocationShareModal from './LocationShareModal';
import ContactShareModal from './ContactShareModal';

import './MessageComposer.css';

interface MessageComposerProps {
  conversationId?: string;
  onSend: (text: string) => Promise<void>;
  onSendSpecial?: (data: { type: string; poll?: any; location?: any; contact?: any; sticker?: any }) => Promise<void>;
  onMediaSent?: (message: any) => void;
  replyingTo?: { id: string; text: string; sender: string } | null;
  editingMessage?: { id: string; text: string } | null;
  onCancelReplyOrEdit?: () => void;
  onEdit?: (id: string, newText: string) => Promise<void>;
  onTyping?: (isTyping: boolean) => void;
  droppedFiles?: File[] | null;
  onClearDroppedFiles?: () => void;
  onOpenGame?: () => void;
}

export default function MessageComposer({ 
  conversationId,
  onSend,
  onSendSpecial,
  onMediaSent,
  replyingTo,
  editingMessage,
  onCancelReplyOrEdit,
  onEdit,
  onTyping,
  droppedFiles,
  onClearDroppedFiles,
  onOpenGame
}: MessageComposerProps) {
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiAnchorRect, setEmojiAnchorRect] = useState<DOMRect | undefined>(undefined);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [attachmentAnchorRect, setAttachmentAnchorRect] = useState<DOMRect | undefined>(undefined);
  const [selectedFilesForPreview, setSelectedFilesForPreview] = useState<InitialMediaFile[] | null>(null);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const attachButtonRef = useRef<HTMLButtonElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const allFileInputRef = useRef<HTMLInputElement>(null);

  const isTypingRef = useRef<boolean>(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposingRef = useRef<boolean>(false);
  const cursorPosRef = useRef<number | null>(null);

  const showComposerToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3500);
  }, []);

  const handleFilesSelected = useCallback((files: File[], defaultCategory?: MediaCategory) => {
    console.log('[WIBBY MEDIA] file selected', files.map(f => ({ name: f.name, size: f.size, type: f.type })));
    if (!files || files.length === 0) return;

    const validItems: InitialMediaFile[] = [];
    const rejections: string[] = [];

    Array.from(files).forEach(file => {
      console.log('[WIBBY MEDIA] validating file', file.name, file.type, file.size);
      const validation = validateClientFile(file, defaultCategory);
      if (!validation.valid) {
        console.warn('[WIBBY MEDIA] validation failed for', file.name, validation.error);
        rejections.push(`${file.name}: ${validation.error}`);
      } else {
        console.log('[WIBBY MEDIA] validation passed for', file.name, 'category:', validation.category);
        validItems.push({
          file,
          category: validation.category
        });
      }
    });

    if (rejections.length > 0) {
      showComposerToast(rejections[0]);
    }

    if (validItems.length > 0) {
      console.log('[WIBBY MEDIA] preview opened with', validItems.length, 'file(s)');
      setShowAttachmentMenu(false);
      setSelectedFilesForPreview(validItems);
    }
  }, [showComposerToast]);

  // Handle files dropped anywhere over chat
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      handleFilesSelected(droppedFiles);
      onClearDroppedFiles?.();
    }
  }, [droppedFiles, handleFilesSelected, onClearDroppedFiles]);

  // Set initial text if editing
  useEffect(() => {
    if (editingMessage) {
      setMessage(editingMessage.text);
    } else if (!replyingTo) {
      setMessage('');
    }
    textareaRef.current?.focus();
  }, [editingMessage, replyingTo]);

  // Auto-resize textarea with strict cursor/caret preservation for mobile IME/virtual keyboards
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Do not disrupt active IME composition on mobile
    if (isComposingRef.current) return;

    const isFocused = document.activeElement === textarea;

    if (!message) {
      textarea.style.height = '';
      return;
    }

    // Save active selection before any style adjustments
    const savedStart = textarea.selectionStart;
    const savedEnd = textarea.selectionEnd;

    // Only adjust height if needed (avoids collapsing height to 'auto' on every keystroke which resets Android caret to 0)
    const currentHeight = textarea.offsetHeight;
    const currentScrollHeight = textarea.scrollHeight;

    if (currentScrollHeight > currentHeight || message.includes('\n')) {
      textarea.style.height = 'auto';
      const targetHeight = Math.min(textarea.scrollHeight, 120);
      textarea.style.height = `${targetHeight}px`;
    }

    // Restore caret position to ensure mobile Android/iOS keyboards never reset to index 0
    if (isFocused) {
      const preferredPos = cursorPosRef.current ?? savedEnd ?? message.length;
      // If the browser glitched and snapped selection to 0 while message has length and user was typing ahead
      if (textarea.selectionEnd === 0 && message.length > 0 && preferredPos > 0) {
        textarea.setSelectionRange(preferredPos, preferredPos);
      } else if (savedStart !== null && savedEnd !== null) {
        textarea.setSelectionRange(savedStart, savedEnd);
      }
    }
  }, [message]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTyping?.(false);
      }
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [onTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const target = e.target;
    // Capture user's real cursor position from the DOM event before state update
    const selEnd = target.selectionEnd;
    cursorPosRef.current = typeof selEnd === 'number' ? selEnd : val.length;

    setMessage(val);

    if (!val.trim()) {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTyping?.(false);
      }
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      return;
    }

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping?.(true);
    }

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onTyping?.(false);
      typingTimerRef.current = null;
    }, 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape') {
      if (showEmojiPicker) {
        setShowEmojiPicker(false);
      } else if (showAttachmentMenu) {
        setShowAttachmentMenu(false);
      } else if (onCancelReplyOrEdit) {
        onCancelReplyOrEdit();
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      handleFilesSelected(Array.from(e.clipboardData.files));
    }
  };

  const handleSend = async () => {
    const text = message.trim();
    if (!text) return;

    // Immediately stop typing indicator on send
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTyping?.(false);
    }
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    
    const prevMessage = text;
    setMessage('');
    setShowEmojiPicker(false);
    setShowAttachmentMenu(false);
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }

    try {
      if (editingMessage && onEdit) {
        await onEdit(editingMessage.id, text);
        if (onCancelReplyOrEdit) onCancelReplyOrEdit();
      } else {
        await onSend(text);
        if (onCancelReplyOrEdit) onCancelReplyOrEdit();
      }
    } catch (err) {
      console.error('Error sending message:', err);
      // Restore the message so the user can try again
      if (editingMessage) {
        setMessage(prevMessage);
      }
    } finally {
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  };

  const toggleAttachmentMenu = () => {
    if (!showAttachmentMenu) {
      if (attachButtonRef.current) {
        setAttachmentAnchorRect(attachButtonRef.current.getBoundingClientRect());
      }
      setShowAttachmentMenu(true);
      setShowEmojiPicker(false);
    } else {
      setShowAttachmentMenu(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>, category?: MediaCategory) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) return;
    // Capture actual File objects to plain array BEFORE resetting input value
    const filesArray = Array.from(rawFiles);
    // Reset input to allow re-selecting same file in the future
    e.target.value = '';
    handleFilesSelected(filesArray, category);
  };

  const toggleEmojiPicker = () => {
    if (!showEmojiPicker) {
      if (emojiButtonRef.current) {
        setEmojiAnchorRect(emojiButtonRef.current.getBoundingClientRect());
      }
      setShowEmojiPicker(true);
      setShowAttachmentMenu(false);
    } else {
      setShowEmojiPicker(false);
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart ?? message.length;
      const end = textarea.selectionEnd ?? message.length;
      const newMessage = message.substring(0, start) + emoji + message.substring(end);
      setMessage(newMessage);

      if (!isTypingRef.current && newMessage.trim().length > 0) {
        isTypingRef.current = true;
        onTyping?.(true);
      }

      // Preserve cursor position directly after the inserted emoji
      requestAnimationFrame(() => {
        textarea.focus();
        const nextPos = start + emoji.length;
        textarea.setSelectionRange(nextPos, nextPos);
      });
    } else {
      setMessage(prev => prev + emoji);
    }
  };

  const handleSendVoice = async (result: VoiceRecordingResult) => {
    if (!conversationId) {
      showComposerToast('No active conversation');
      return;
    }

    try {
      const voiceFile = new File([result.audioBlob], result.fileName, {
        type: result.mimeType
      });
      const clientMessageId = `voice_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const handle = uploadMedia({
        conversationId,
        file: voiceFile,
        clientMessageId,
        replyToMessageId: replyingTo?.id,
        duration: result.duration,
        waveform: result.waveform
      });

      const sentMsg = await handle.promise;
      if (onCancelReplyOrEdit) onCancelReplyOrEdit();
      onMediaSent?.(sentMsg);
      setShowVoiceRecorder(false);
    } catch (err: any) {
      console.error('[WIBBY VOICE] Send error:', err);
      showComposerToast(err.message || 'Failed to send voice message');
      throw err;
    }
  };

  const hasText = message.trim().length > 0;

  return (
    <div className="composer-container">
      {(replyingTo || editingMessage) && (
        <div className="composer-context-bar">
          <div className="context-info">
            {replyingTo && (
              <>
                <span className="context-label">Replying to {replyingTo.sender}</span>
                <span className="context-preview">{replyingTo.text}</span>
              </>
            )}
            {editingMessage && (
              <>
                <span className="context-label">Editing Message</span>
                <span className="context-preview">{editingMessage.text}</span>
              </>
            )}
          </div>
          <button className="context-cancel" onClick={onCancelReplyOrEdit} aria-label="Cancel reply or edit">×</button>
        </div>
      )}

      {toastMessage && (
        <div className="composer-toast-notification" role="status">
          {toastMessage}
        </div>
      )}

      {/* Hidden file inputs for attachment categories with multiple support */}
      <input
        type="file"
        ref={photoInputRef}
        multiple
        accept={ACCEPT_PATTERNS.image}
        style={{ display: 'none' }}
        onChange={(e) => handleFileInputChange(e, 'image')}
      />
      <input
        type="file"
        ref={videoInputRef}
        multiple
        accept={ACCEPT_PATTERNS.video}
        style={{ display: 'none' }}
        onChange={(e) => handleFileInputChange(e, 'video')}
      />
      <input
        type="file"
        ref={docInputRef}
        multiple
        accept={ACCEPT_PATTERNS.file}
        style={{ display: 'none' }}
        onChange={(e) => handleFileInputChange(e, 'file')}
      />
      <input
        type="file"
        ref={allFileInputRef}
        multiple
        accept={ACCEPT_PATTERNS.all}
        style={{ display: 'none' }}
        onChange={(e) => handleFileInputChange(e)}
      />

      {/* Main Composer Area */}
      <div className="composer">
        <div className="composer-inner">
          {/* Attachment */}
          <button 
            ref={attachButtonRef}
            className={`composer-btn composer-attach ${showAttachmentMenu ? 'active' : ''}`}
            onClick={toggleAttachmentMenu}
            aria-label="Attach file"
            aria-haspopup="true"
            aria-expanded={showAttachmentMenu}
            title="Attach file"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          {/* Input area */}
          <div className="composer-input-wrapper">
            <textarea
              ref={textareaRef}
              className="composer-input"
              placeholder="Type a message..."
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={(e) => {
                isComposingRef.current = false;
                const target = e.currentTarget;
                cursorPosRef.current = target.selectionEnd ?? target.value.length;
              }}
              rows={1}
              dir="ltr"
              inputMode="text"
              autoComplete="off"
              autoCorrect="on"
              spellCheck={true}
              aria-label="Type a message"
            />
          </div>

          {/* Emoji */}
          <button 
            ref={emojiButtonRef}
            className={`composer-btn composer-emoji ${showEmojiPicker ? 'active' : ''}`}
            onClick={toggleEmojiPicker}
            aria-label="Add emoji"
            aria-haspopup="true"
            aria-expanded={showEmojiPicker}
            title="Add emoji"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>

          {/* Send or Voice */}
          {hasText ? (
            <button
              className="composer-send"
              onClick={handleSend}
              aria-label="Send message"
              title="Send message"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          ) : (
            <button 
              className="composer-btn composer-voice" 
              onClick={() => setShowVoiceRecorder(true)}
              aria-label="Record voice message"
              title="Voice message"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Attachment Menu Popup */}
      {showAttachmentMenu && (
        <AttachmentMenu
          isOpen={showAttachmentMenu}
          anchorRect={attachmentAnchorRect}
          onSelectCamera={() => setShowCameraModal(true)}
          onSelectPhoto={() => photoInputRef.current?.click()}
          onSelectVideo={() => videoInputRef.current?.click()}
          onSelectDocument={() => docInputRef.current?.click()}
          onSelectPoll={() => setShowPollModal(true)}
          onSelectLocation={() => setShowLocationModal(true)}
          onSelectContact={() => setShowContactModal(true)}
          onSelectGame={onOpenGame}
          onBrowseAll={() => allFileInputRef.current?.click()}
          onFilesDropped={(files) => handleFilesSelected(files)}
          onClose={() => setShowAttachmentMenu(false)}
        />
      )}

      {/* Instant Camera Capture Modal */}
      {showCameraModal && (
        <CameraCaptureModal
          isOpen={showCameraModal}
          onCapture={(photoFile) => {
            setShowCameraModal(false);
            setSelectedFilesForPreview([{
              file: photoFile,
              category: 'image'
            }]);
          }}
          onSelectPhotoFallback={() => {
            setShowCameraModal(false);
            photoInputRef.current?.click();
          }}
          onClose={() => setShowCameraModal(false)}
        />
      )}

      {/* Poll Creation Modal */}
      {showPollModal && (
        <PollCreateModal
          isOpen={showPollModal}
          onClose={() => setShowPollModal(false)}
          onCreatePoll={(pollData) => {
            if (onSendSpecial) {
              onSendSpecial({ type: 'poll', poll: pollData });
            }
          }}
        />
      )}

      {/* Location Share Modal */}
      {showLocationModal && (
        <LocationShareModal
          isOpen={showLocationModal}
          onClose={() => setShowLocationModal(false)}
          onSendLocation={(loc) => {
            if (onSendSpecial) {
              onSendSpecial({ type: 'location', location: loc });
            }
          }}
        />
      )}

      {/* Contact Share Modal */}
      {showContactModal && (
        <ContactShareModal
          isOpen={showContactModal}
          onClose={() => setShowContactModal(false)}
          onSendContact={(contact) => {
            if (onSendSpecial) {
              onSendSpecial({ type: 'contact', contact });
            }
          }}
        />
      )}

      {/* Reusable Emoji Picker for Composer */}
      {showEmojiPicker && (
        <EmojiPicker
          anchorRect={emojiAnchorRect}
          isOwn={true}
          onSelect={handleSelectEmoji}
          onSelectSticker={(sticker) => {
            if (onSendSpecial) {
              onSendSpecial({ type: 'sticker', sticker });
            }
          }}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}

      {/* Media Preview Modal before sending */}
      {selectedFilesForPreview && selectedFilesForPreview.length > 0 && conversationId && (
        <MediaPreviewModal
          conversationId={conversationId}
          initialFiles={selectedFilesForPreview}
          replyToMessageId={replyingTo?.id}
          onSuccess={(newMediaMsg) => {
            if (onCancelReplyOrEdit) onCancelReplyOrEdit();
            onMediaSent?.(newMediaMsg);
          }}
          onCancel={() => setSelectedFilesForPreview(null)}
        />
      )}

      {/* Voice Recorder Modal */}
      {showVoiceRecorder && (
        <VoiceRecorder
          isOpen={showVoiceRecorder}
          onSend={handleSendVoice}
          onCancel={() => setShowVoiceRecorder(false)}
        />
      )}
    </div>
  );
}
