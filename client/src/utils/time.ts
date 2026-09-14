export function formatMessageTime(dateString: string | Date): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

export function formatLastSeen(dateString: string | Date | null | undefined): string {
  if (!dateString) return 'Offline';
  
  const date = new Date(dateString);
  const now = new Date();
  
  // If difference is less than 1 minute
  if (now.getTime() - date.getTime() < 60000) {
    return 'Last seen just now';
  }
  
  return `Last seen at ${formatMessageTime(date)}`;
}
