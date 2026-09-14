import React, { useState } from 'react';
import './PollCreateModal.css';

interface PollCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePoll: (pollData: { question: string; options: Array<{ id: string; text: string; votes: string[] }>; allowMultiple: boolean }) => void;
}

export default function PollCreateModal({ isOpen, onClose, onCreatePoll }: PollCreateModalProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleOptionChange = (index: number, value: string) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  };

  const handleAddOption = () => {
    if (options.length < 6) {
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) {
      setError('Please enter a question');
      return;
    }

    const validOptions = options.map(o => o.trim()).filter(Boolean);
    if (validOptions.length < 2) {
      setError('Please provide at least 2 options');
      return;
    }

    const pollOptions = validOptions.map((text, i) => ({
      id: `opt_${Date.now()}_${i}`,
      text,
      votes: []
    }));

    onCreatePoll({
      question: question.trim(),
      options: pollOptions,
      allowMultiple
    });

    onClose();
    setQuestion('');
    setOptions(['', '']);
    setError('');
  };

  return (
    <div className="poll-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Create a poll">
      <div className="poll-modal-card" onClick={e => e.stopPropagation()}>
        <div className="poll-modal-header">
          <div className="poll-modal-title-wrap">
            <span className="poll-modal-icon">📊</span>
            <h3 className="poll-modal-title">Create a Poll</h3>
          </div>
          <button className="poll-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="poll-modal-form">
          {error && <div className="poll-modal-error">{error}</div>}

          <div className="poll-field-group">
            <label className="poll-label">Question</label>
            <input
              type="text"
              className="poll-input"
              placeholder="Ask a question..."
              value={question}
              onChange={e => setQuestion(e.target.value)}
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="poll-field-group">
            <label className="poll-label">Options</label>
            <div className="poll-options-list">
              {options.map((opt, index) => (
                <div key={index} className="poll-option-row">
                  <span className="poll-option-num">{index + 1}</span>
                  <input
                    type="text"
                    className="poll-input option-input"
                    placeholder={`Option ${index + 1}`}
                    value={opt}
                    onChange={e => handleOptionChange(index, e.target.value)}
                    maxLength={100}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      className="poll-remove-opt-btn"
                      onClick={() => handleRemoveOption(index)}
                      title="Remove option"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 6 && (
              <button type="button" className="poll-add-opt-btn" onClick={handleAddOption}>
                + Add Option
              </button>
            )}
          </div>

          <div className="poll-toggle-group">
            <label className="poll-toggle-label">
              <span>Allow multiple answers</span>
              <input
                type="checkbox"
                className="poll-checkbox"
                checked={allowMultiple}
                onChange={e => setAllowMultiple(e.target.checked)}
              />
            </label>
          </div>

          <div className="poll-modal-actions">
            <button type="button" className="poll-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="poll-btn-submit">
              Create Poll
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
