import React, { useState } from 'react';
import './ContactShareModal.css';

interface ContactShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendContact: (contact: { name: string; phone?: string; email?: string }) => void;
}

export default function ContactShareModal({ isOpen, onClose, onSendContact }: ContactShareModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Contact name is required');
      return;
    }

    if (!phone.trim() && !email.trim()) {
      setError('Please provide at least a phone number or email');
      return;
    }

    onSendContact({
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined
    });

    onClose();
    setName('');
    setPhone('');
    setEmail('');
    setError('');
  };

  return (
    <div className="contact-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Share contact">
      <div className="contact-modal-card" onClick={e => e.stopPropagation()}>
        <div className="contact-modal-header">
          <div className="contact-modal-title-wrap">
            <span className="contact-modal-icon">👤</span>
            <h3 className="contact-modal-title">Share Contact</h3>
          </div>
          <button className="contact-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="contact-modal-form">
          {error && <div className="contact-modal-error">{error}</div>}

          <div className="contact-field-group">
            <label className="contact-label">Full Name *</label>
            <input
              type="text"
              className="contact-input"
              placeholder="e.g. Jane Doe"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>

          <div className="contact-field-group">
            <label className="contact-label">Phone Number</label>
            <input
              type="tel"
              className="contact-input"
              placeholder="e.g. +1 555 123 4567"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              maxLength={50}
            />
          </div>

          <div className="contact-field-group">
            <label className="contact-label">Email Address</label>
            <input
              type="email"
              className="contact-input"
              placeholder="e.g. jane@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="contact-modal-actions">
            <button type="button" className="contact-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="contact-btn-submit">
              Send Contact
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
