/**
 * Canonical Message Serializer for Wibby.
 * Guarantees identical message shape across REST endpoints (GET /messages, POST /messages, POST /media)
 * and Socket.IO broadcasts ('new_message', 'message:update').
 */
export function serializeMessage(doc: any): any {
  if (!doc) return null;
  
  const _id = doc._id?.toString ? doc._id.toString() : String(doc._id || '');
  const conversationId = doc.conversationId?.toString ? doc.conversationId.toString() : String(doc.conversationId || '');
  const replyToMessageId = doc.replyToMessageId ? (doc.replyToMessageId?.toString ? doc.replyToMessageId.toString() : String(doc.replyToMessageId)) : null;
  const forwardedFromMessageId = doc.forwardedFromMessageId ? (doc.forwardedFromMessageId?.toString ? doc.forwardedFromMessageId.toString() : String(doc.forwardedFromMessageId)) : null;

  // Infer canonical type if missing or ambiguous
  let type = doc.type;
  if (!type) {
    if (doc.mediaUrl?.includes('voice_') || doc.mimeType?.startsWith('audio/')) {
      type = 'audio';
    } else if (doc.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(doc.fileName || '')) {
      type = 'image';
    } else if (doc.mimeType?.startsWith('video/') || /\.(mp4|webm|mov|qt)$/i.test(doc.fileName || '')) {
      type = 'video';
    } else if (doc.mediaUrl) {
      type = 'file';
    } else {
      type = 'text';
    }
  }

  return {
    _id,
    id: _id, // Alias for legacy/convenience
    clientMessageId: doc.clientMessageId || null,
    conversationId,
    senderId: doc.senderId,
    type,
    text: typeof doc.text === 'string' ? doc.text : '',
    mediaUrl: doc.mediaUrl || null,
    mediaKey: doc.mediaKey || null,
    mimeType: doc.mimeType || null,
    fileName: doc.fileName || null,
    fileSize: typeof doc.fileSize === 'number' ? doc.fileSize : (doc.fileSize ? Number(doc.fileSize) : null),
    duration: doc.duration !== undefined && doc.duration !== null && !isNaN(doc.duration) ? Number(doc.duration) : null,
    waveform: Array.isArray(doc.waveform) ? doc.waveform : null,
    thumbnailUrl: doc.thumbnailUrl || null,
    reactions: Array.isArray(doc.reactions) ? doc.reactions : [],
    deletedFor: Array.isArray(doc.deletedFor) ? doc.deletedFor : [],
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : (doc.createdAt || new Date().toISOString()),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : (doc.updatedAt || new Date().toISOString()),
    editedAt: doc.editedAt instanceof Date ? doc.editedAt.toISOString() : (doc.editedAt || null),
    deletedAt: doc.deletedAt instanceof Date ? doc.deletedAt.toISOString() : (doc.deletedAt || null),
    status: doc.status || 'sent',
    deliveredAt: doc.deliveredAt instanceof Date ? doc.deliveredAt.toISOString() : (doc.deliveredAt || null),
    seenAt: doc.seenAt instanceof Date ? doc.seenAt.toISOString() : (doc.seenAt || null),
    replyToMessageId,
    forwardedFromMessageId,
    starredBy: Array.isArray(doc.starredBy) ? doc.starredBy : [],
    isPinned: Boolean(doc.isPinned),
    pinnedAt: doc.pinnedAt instanceof Date ? doc.pinnedAt.toISOString() : (doc.pinnedAt || null),
    pinnedBy: doc.pinnedBy || null,
    expiresAt: doc.expiresAt instanceof Date ? doc.expiresAt.toISOString() : (doc.expiresAt || null),
    poll: doc.poll || null,
    location: doc.location || null,
    contact: doc.contact || null,
    sticker: doc.sticker || null,
    linkPreview: doc.linkPreview || null
  };
}
