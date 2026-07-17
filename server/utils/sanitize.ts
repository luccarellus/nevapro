/**
 * Sanitizes user input by escaping HTML special characters to prevent XSS.
 * Truncates to maxLength (default 100) to prevent abuse.
 */
export const sanitizeInput = (input: string, maxLength = 100): string => {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim()
    .substring(0, maxLength);
};

/**
 * Normalizes an email to lowercase trimmed form.
 */
export const normalizeEmail = (email: string): string => {
  return email.toLowerCase().trim();
};
