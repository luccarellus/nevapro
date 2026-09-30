import { describe, it, expect } from 'vitest';
import { sanitizeRichText, stripAllHtml, sanitizePlainText } from './sanitizeHtml';

describe('sanitizeRichText (XSS em conteúdo de questões)', () => {
  it('remove <script> injetado', () => {
    const result = sanitizeRichText('<p>Texto</p><script>alert(1)</script>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert(1)');
    expect(result).toContain('Texto');
  });

  it('remove event handlers (onerror/onclick)', () => {
    const result = sanitizeRichText('<img src="https://api.enem.dev/a.png" onerror="alert(1)">');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert(1)');
  });

  it('remove javascript: URLs', () => {
    const result = sanitizeRichText('<a href="javascript:alert(1)">link</a>');
    expect(result).not.toContain('javascript:');
  });

  it('remove iframes e objetos embutidos', () => {
    const result = sanitizeRichText('<iframe src="https://evil.com"></iframe><object data="x"></object>');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('<object');
  });

  it('mantém formatação permitida (b, i, p, ul, table)', () => {
    const result = sanitizeRichText('<p><b>negrito</b> e <i>itálico</i></p><ul><li>item</li></ul>');
    expect(result).toContain('<b>negrito</b>');
    expect(result).toContain('<i>itálico</i>');
    expect(result).toContain('<li>item</li>');
  });

  it('mantém imagem de host confiável (api.enem.dev)', () => {
    const result = sanitizeRichText('<img src="https://api.enem.dev/questao.png">');
    expect(result).toContain('api.enem.dev');
  });

  it('remove imagem de host NÃO confiável', () => {
    const result = sanitizeRichText('<img src="https://evil.com/steal.png">');
    expect(result).not.toContain('evil.com');
  });

  it('permite hosts extra via ALLOWED_IMAGE_HOSTS', () => {
    process.env.ALLOWED_IMAGE_HOSTS = 'cdn.exemplo.com.br';
    const result = sanitizeRichText('<img src="https://cdn.exemplo.com.br/img.png">');
    expect(result).toContain('cdn.exemplo.com.br');
    delete process.env.ALLOWED_IMAGE_HOSTS;
  });

  it('respeita o maxLength', () => {
    const result = sanitizeRichText('a'.repeat(100), 10);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('retorna string vazia para entrada não-string', () => {
    expect(sanitizeRichText(undefined)).toBe('');
    expect(sanitizeRichText(null)).toBe('');
    expect(sanitizeRichText(42 as any)).toBe('');
    expect(sanitizeRichText({} as any)).toBe('');
  });
});

describe('stripAllHtml', () => {
  it('remove todas as tags mantendo o texto', () => {
    expect(stripAllHtml('<p>Olá <b>mundo</b></p>')).toBe('Olá mundo');
  });

  it('escapa/remove conteúdo perigoso', () => {
    expect(stripAllHtml('<script>x</script>seguro')).toBe('seguro');
  });
});

describe('sanitizePlainText', () => {
  it('produz texto puro sem markup', () => {
    const result = sanitizePlainText('<b>Matemática</b>');
    expect(result).toBe('Matemática');
    expect(result).not.toContain('<');
  });

  it('trunca no maxLength', () => {
    expect(sanitizePlainText('abcdefghij', 5)).toBe('abcde');
  });
});
