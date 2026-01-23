/**
 * UUID generation utility
 *
 * Uses crypto.randomUUID() when available, falls back to a polyfill.
 */

export function generateUUID(): string {
  // Use native crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a short ID (8 chars) for display purposes
 * Full UUID is still stored, this is just for UI
 */
export function shortId(uuid: string): string {
  return uuid.substring(0, 8);
}
