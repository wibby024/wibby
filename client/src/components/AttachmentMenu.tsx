import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './AttachmentMenu.css';
import {
  IconCamera,
  IconImage,
  IconVideo,
  IconDocument,
  IconPoll,
  IconLocation,
  IconUser,
  IconGamepad,
  IconFolder,
  IconClose
} from './common/Icons';

interface AttachmentMenuProps {
  isOpen: boolean;
  anchorRect?: DOMRect;
  onSelectCamera: () => void;
  onSelectPhoto: () => void;
  onSelectVideo: () => void;
  onSelectDocument: () => void;
  onSelectPoll?: () => void;
  onSelectLocation?: () => void;
  onSelectContact?: () => void;
  onSelectGame?: () => void;
  onBrowseAll: () => void;
  onFilesDropped: (files: File[]) => void;
  onClose: () => void;
}

export default function AttachmentMenu({
  isOpen,
  anchorRect,
  onSelectCamera,
  onSelectPhoto,
  onSelectVideo,
  onSelectDocument,
  onSelectPoll,
  onSelectLocation,
  onSelectContact,
  onSelectGame,
  onBrowseAll,
  onFilesDropped,
  onClose
}: AttachmentMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  let style: React.CSSProperties = {};
  if (anchorRect) {
    const chatPanel = document.querySelector('.chat-panel') as HTMLElement | null;
    const chatRect = chatPanel
      ? chatPanel.getBoundingClientRect()
      : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight, width: window.innerWidth };

    const menuWidth = Math.min(290, chatRect.width - 24);
    // Menu strictly belongs to the chat area and must never escape into the sidebar
    const minLeft = chatRect.left + 12;
    const maxLeft = Math.max(minLeft, chatRect.right - menuWidth - 12);
    let left = anchorRect.left;
    left = Math.max(minLeft, Math.min(left, maxLeft));

    const bottom = Math.max(12, window.innerHeight - anchorRect.top + 8);
    style = {
      position: 'fixed',
      bottom: `${bottom}px`,
      left: `${left}px`,
      width: `${menuWidth}px`,
      zIndex: 150
    };
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      onClose();
      onFilesDropped(files);
    }
  };

  const menuContent = (
    <div 
      className="attachment-menu-popover" 
      ref={menuRef} 
      style={style}
      role="dialog"
      aria-modal="true"
      aria-label="Attach media or documents"
    >
      {/* Header with Title and Close Button */}
      <div className="attachment-menu-header">
        <span className="attachment-menu-title">Attach</span>
        <button 
          className="attachment-menu-close-btn"
          onClick={onClose}
          aria-label="Close attachment menu"
          title="Close (Esc)"
        >
          <IconClose size={16} />
        </button>
      </div>

      {/* Drag and Drop Zone */}
      <div 
        className={`attachment-dropzone ${isDraggingOver ? 'drag-over' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => {
          onClose();
          onBrowseAll();
        }}
        role="button"
        tabIndex={0}
        aria-label="Drag and drop files here or click to browse from device"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClose();
            onBrowseAll();
          }
        }}
      >
        <div className="dropzone-icon-wrap">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div className="dropzone-text">
          <span className="dropzone-primary">Drag & drop files here</span>
          <span className="dropzone-secondary">or <span className="dropzone-highlight">browse from device</span></span>
        </div>
      </div>

      {/* Quick Action Grid */}
      <div className="attachment-quick-grid">
        <button
          className="attachment-quick-btn camera-btn"
          onClick={() => {
            onClose();
            onSelectCamera();
          }}
          type="button"
          tabIndex={0}
        >
          <div className="quick-btn-icon-bg camera-bg">
            <IconCamera size={22} color="currentColor" />
          </div>
          <span className="quick-btn-label">Camera</span>
        </button>

        <button
          className="attachment-quick-btn photo-btn"
          onClick={() => {
            onClose();
            onSelectPhoto();
          }}
          type="button"
          tabIndex={0}
        >
          <div className="quick-btn-icon-bg photo-bg">
            <IconImage size={22} color="currentColor" />
          </div>
          <span className="quick-btn-label">Photo</span>
        </button>

        <button
          className="attachment-quick-btn video-btn"
          onClick={() => {
            onClose();
            onSelectVideo();
          }}
          type="button"
          tabIndex={0}
        >
          <div className="quick-btn-icon-bg video-bg">
            <IconVideo size={22} color="currentColor" />
          </div>
          <span className="quick-btn-label">Video</span>
        </button>

        <button
          className="attachment-quick-btn doc-btn"
          onClick={() => {
            onClose();
            onSelectDocument();
          }}
          type="button"
          tabIndex={0}
        >
          <div className="quick-btn-icon-bg doc-bg">
            <IconDocument size={22} color="currentColor" />
          </div>
          <span className="quick-btn-label">Document</span>
        </button>

        {onSelectPoll && (
          <button
            className="attachment-quick-btn poll-btn"
            onClick={() => {
              onClose();
              onSelectPoll();
            }}
            type="button"
            tabIndex={0}
          >
            <div className="quick-btn-icon-bg poll-bg">
              <IconPoll size={22} color="currentColor" />
            </div>
            <span className="quick-btn-label">Poll</span>
          </button>
        )}

        {onSelectLocation && (
          <button
            className="attachment-quick-btn loc-btn"
            onClick={() => {
              onClose();
              onSelectLocation();
            }}
            type="button"
            tabIndex={0}
          >
            <div className="quick-btn-icon-bg loc-bg">
              <IconLocation size={22} color="currentColor" />
            </div>
            <span className="quick-btn-label">Location</span>
          </button>
        )}

        {onSelectContact && (
          <button
            className="attachment-quick-btn contact-btn"
            onClick={() => {
              onClose();
              onSelectContact();
            }}
            type="button"
            tabIndex={0}
          >
            <div className="quick-btn-icon-bg contact-bg">
              <IconUser size={22} color="currentColor" />
            </div>
            <span className="quick-btn-label">Contact</span>
          </button>
        )}

        {onSelectGame && (
          <button
            className="attachment-quick-btn game-btn"
            onClick={() => {
              onClose();
              onSelectGame();
            }}
            type="button"
            tabIndex={0}
          >
            <div className="quick-btn-icon-bg game-bg">
              <IconGamepad size={22} color="currentColor" />
            </div>
            <span className="quick-btn-label">Game</span>
          </button>
        )}
      </div>

      {/* Browse All Files Row */}
      <button
        className="attachment-browse-all-btn"
        onClick={() => {
          onClose();
          onBrowseAll();
        }}
        type="button"
        tabIndex={0}
      >
        <span className="browse-all-icon">
          <IconFolder size={18} color="currentColor" />
        </span>
        <span className="browse-all-text">Browse all files</span>
      </button>
    </div>
  );

  return createPortal(menuContent, document.body);
}
