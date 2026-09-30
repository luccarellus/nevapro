import sanitizeHtmlLib from 'sanitize-html';

/**
 * Sanitização de HTML no servidor para conteúdo rich-text enviado pelo cliente
 * (enunciados, alternativas, explicações de questões).
 *
 * O frontend renderiza esse conteúdo com react-markdown + rehype-raw, que NÃO
 * sanitiza. Sem esta camada, um usuário autenticado consegue persistir HTML/JS
 * malicioso que será executado no navegador de todos que visualizarem a questão.
 *
 * Allowlist restrita: formatação inline, links (após sanitização, sem
 * javascript:), imagens apenas de hosts confiáveis.
 */

const ALLOWED_TAGS = [
  // Formatação
  'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'mark', 'br', 'hr', 'p', 'span', 'div',
  // Listas
  'ul', 'ol', 'li',
  // Tabelas (enunciados longos)
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  // Código e citação
  'code', 'pre', 'blockquote',
  // Imagem (src restrito a hosts confiáveis no pós-processamento abaixo)
  'img',
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  span: ['class'],
  div: ['class'],
  p: ['class'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  '*': ['style'],
};

const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

/**
 * Hosts de imagem permitidos em conteúdo de questões (espelha o proxy
 * /api/imagem). Lido por chamada para respeitar mudanças no env em testes.
 */
function getAllowedImageHosts(): string[] {
  return [
    'api.enem.dev',
    'img.enemhub.com.br',
    ...(process.env.ALLOWED_IMAGE_HOSTS || '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  ];
}

/**
 * Remove todo o HTML, preservando apenas o texto — para campos que devem ser
 * texto puro (ex.: título, cidade, escola).
 */
export function stripAllHtml(input: unknown): string {
  if (typeof input !== 'string') return '';
  return sanitizeHtmlLib(input, { allowedTags: [], allowedAttributes: {} }).trim();
}

/**
 * Transforma texto/HTML livre em HTML seguro para renderização com rehype-raw:
 * escapa entidades e remove qualquer tag/script fora da allowlist.
 */
export function sanitizeRichText(input: unknown, maxLength = 20_000): string {
  if (typeof input !== 'string') return '';
  const cleaned = sanitizeHtmlLib(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ALLOWED_SCHEMES,
    // Transforma tags/atributos desconhecidos em texto, em vez de descartar
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
    },
    // <img src> restrito a hosts confiáveis
    allowedSchemesByTag: { img: ['https', 'http'] },
  });

  // Pós-verificação de hosts de imagem (sanitize-html não filtra por host)
  const allowedHosts = getAllowedImageHosts();
  const html = cleaned.replace(/<img\s[^>]*src=["']([^"']+)["'][^>]*>/gi, (match, src: string) => {
    try {
      const url = new URL(src, 'https://placeholder.local');
      if (!allowedHosts.includes(url.hostname.toLowerCase())) {
        // Remove a tag inteira: host não confiável
        return '';
      }
      return match;
    } catch {
      return '';
    }
  });

  return html.length > maxLength ? html.slice(0, maxLength) : html;
}

/**
 * Sanitiza texto que será exibido como texto simples (sem HTML). Escapa
 * entidades para segurança em profundidade sem persistir markup.
 */
export function sanitizePlainText(input: unknown, maxLength = 5_000): string {
  if (typeof input !== 'string') return '';
  const text = stripAllHtml(input);
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}
