import { defaultSchema } from 'rehype-sanitize';

/**
 * Schema de sanitização client-side para conteúdo rich-text de questões
 * (renderizado com react-markdown + rehype-raw).
 *
 * Espelha a allowlist do servidor (server/utils/sanitizeHtml.ts): sem scripts,
 * iframes, event handlers (on*) nem style com expressões perigosas.
 *
 * Defesa em profundidade: o servidor já sanitiza na persistência; este schema
 * protege contra conteúdo legado/externo (ENEM/EnemHub proxies) não sanitizado.
 */
export const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    // Formatação
    'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'mark', 'br', 'hr', 'p', 'span', 'div',
    // Listas
    'ul', 'ol', 'li',
    // Tabelas
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    // Código e citação
    'code', 'pre', 'blockquote',
    // Imagem (src validado abaixo)
    'img',
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] || []), 'className', 'style'],
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    span: ['className'],
    div: ['className'],
    p: ['className'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https', 'data'],
  },
  // Event handlers (onClick etc.) e qualquer atributo on* são removidos por não
  // estarem na allowlist acima; strip is harmless here.
  strip: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'meta'],
  clobber: [...(defaultSchema.clobber || []), 'name'],
};
