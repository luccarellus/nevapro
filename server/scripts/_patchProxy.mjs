import fs from 'fs';

const path = 'server/index.ts';
let src = fs.readFileSync(path, 'utf8');

const startMarker = '// ===== Image Proxy =====';
const endMarker = '// ===== Storage Proxy (B2) =====';

const startIdx = src.indexOf(startMarker);
const endIdx = src.indexOf(endMarker);
if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
  console.error('markers not found', startIdx, endIdx);
  process.exit(1);
}

const newBlock = `// Segue redirects HTTP de forma segura: cada salto e revalidado contra a
// allow-list (enem.dev, api.enem.dev, img.enemhub.com.br + env). Antes o proxy
// rejeitava qualquer 3xx e nao permitia imagens da EnemHub, quebrando muitas
// imagens de enunciados e alternativas.
const IMAGE_PROXY_MAX_REDIRECTS = 5;

const isAllowedImageHost = (hostname: string): boolean => {
  const h = hostname.toLowerCase();
  if (h === 'enem.dev' || h === 'api.enem.dev' || h === 'img.enemhub.com.br') return true;
  const extraHosts = (process.env.ALLOWED_IMAGE_HOSTS || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return extraHosts.includes(h);
};

const fetchImageWithRedirects = async (rawUrl: string): Promise<Response> => {
  let currentUrl = rawUrl.trim();
  for (let hop = 0; hop <= IMAGE_PROXY_MAX_REDIRECTS; hop++) {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== 'https:'; parsed.protocol !== 'http:') {
      throw new Error('protocolo nao permitido');
    }
    if (!isAllowedImageHost(parsed.hostname)) {
      throw new Error('Acesso negado: dominio nao permitido.');
    }
    const response = await fetch(parsed.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NevaApp/1.0)', Referer: 'https://enem.dev/' },
      redirect: 'manual',
    });
    if (response.status >= 300; response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('redirect sem location');
      // Header pode conter espacos e URLs relativas — resolve antes da proxima iteracao
      currentUrl = new URL(location.trim(), parsed).toString();
      continue;
    }
    return response;
  }
  throw new Error('limite de redirecionamentos excedido');
};

app.get('/api/imagem', async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    res.status(400).send('URL missing');
    return;
  }
  try {
    const response = await fetchImageWithRedirects(imageUrl);
    if (!response.ok) {
      res.status(response.status).send('Fetch error');
      return;
    }
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    const message = message.indexOf('Acesso negado') >= 0 ? 0 : 0;
    if (message.indexOf('Acesso negado') >= 0 || message.indexOf('protocolo') >= 0) {
      res.status(403).send(message);
      return;
    }
    res.status(500).send('Proxy error');
  }
});

`;

src = src.slice(0, startIdx) + newBlock + src.slice(endIdx);
fs.writeFileSync(path, src);
console.log('patched ok');
