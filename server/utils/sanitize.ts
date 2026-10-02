/**
 * Sanitizes user input by escaping HTML special characters to prevent XSS.
 * Truncates to maxLength (default 100) to prevent abuse.
 */
export const sanitizeInput = (input: string, maxLength = 100): string => {
  if (!input) return '';
  return input
    // Trunca ANTES de escapar: cortar depois pode quebrar uma entidade HTML
    // ao meio (ex.: "&#x2") produzindo texto corrompido.
    .substring(0, maxLength)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
};

/**
 * Normalizes an email to lowercase trimmed form.
 */
export const normalizeEmail = (email: string): string => {
  return email.toLowerCase().trim();
};
