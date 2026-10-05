
import { Question } from '../types';

export interface EnemQuestion {
  title: string;
  index: number;
  discipline: string;
  year: number;
  context: string;
  alternativesIntroduction: string;
  files: string[];
  alternatives: {
    letter: string;
    text: string;
    file: string | null;
  }[];
}

export interface EnemHubQuestion {
  id: string;
  externalId: string;
  year: number;
  difficulty: string;
  statement: string;
  exam: string;
  subject: { id: string; name: string; area: string };
  alternatives: {
    id: string;
    letter: string;
    text: string;
    image?: string;
  }[];
}

/**
 * Strip de HTML basico convertendo cada <img> em imagem markdown inline.
 * Preserva a POSICAO e a ORDEM de todos os graficos do enunciado — antes,
 * apenas a primeira imagem era mantida e as demais eram descartadas,
 * fazendo questoes com multiplus graficos perderem informacao.
 */
export function stripHtml(html: string): { text: string; images: string[] } {
  const images: string[] = [];
  let out = html || '';
  // Converte <img src> em markdown inline (renderizado via MarkdownImage/ProxiedImage)
  out = out.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/g, (_m, src) => {
    images.push(src);
    const proxied = proxyImageUrl(src) || src;
    return `\n\n![](${proxied})\n\n`;
  });
  // Paragrafos e quebras viram linhas
  out = out.replace(/<\/?p>/g, '\n').replace(/<br\s*\/?>/g, '\n');
  // Remove demais tags
  out = out.replace(/<[^>]+>/g, '');
  out = out
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Colapsa linhas vazias repetidas
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return { text: out, images };
}

const proxyImageUrl = (urlOrObj: any) => {
  if (!urlOrObj) return undefined;
  
  let url = typeof urlOrObj === 'string' ? urlOrObj : urlOrObj.url || urlOrObj.path || urlOrObj.file;
  if (!url || typeof url !== 'string') return undefined;

  // If it's already a proxied URL, don't double proxy it
  if (url.includes('/api/imagem?url=')) return url;

  // Protocol relative
  if (url.startsWith('//')) {
    url = 'https:' + url;
  }
  
  // Resolve relative URLs from the enem.dev API
  let absoluteUrl = url;
  if (url.startsWith('/')) {
    // If it starts with /v1, it's likely already correct relative to api.enem.dev
    absoluteUrl = `https://api.enem.dev${url}`;
  } else if (url.includes('img.enemhub.com.br')) {
    // EnemHub image CDN — absolute, no rewrite
    return `/api/imagem?url=${encodeURIComponent(url)}`;
  } else if (!url.startsWith('http')) {
    // If it's a relative path like "files/abc.jpg", try prefixing with api.enem.dev/v1/
    absoluteUrl = `https://api.enem.dev/v1/${url}`;
  }
  
  return `/api/imagem?url=${encodeURIComponent(absoluteUrl)}`;
};

const normalizeStr = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();

const QUESTION_POOL_CACHE_TTL_MS = 8 * 60_000;
const questionPoolCache = new Map<number, { promise: Promise<Question[]>; expiresAt: number }>();

/** Busca questoes da EnemHub via proxy interno e normaliza para Question. */
const enemhubService = {
  async getQuestionsByYear(year: number): Promise<Question[]> {
    try {
      const batches = [1, 2, 3, 4].map((page) =>
        fetch(`/api/questoes/enemhub?year=${year}&limit=50&page=${page}`)
          .then((res) => (res.ok ? res.json() : { questions: [] }))
          .catch(() => ({ questions: [] })),
      );
      const results = await Promise.all(batches);
      const raw = results.flatMap((r) => r.questions || []) as EnemHubQuestion[];

      // Deduplica por id da EnemHub
      const unique = Array.from(new Map(raw.map((q) => [q.id, q])).values());

      return unique.map((q) => {
        // Todos os graficos ficam inline no texto (markdown); imageUrl fica vazio
        // para nao duplicar a 1a imagem nos componentes que a renderizam em bloco.
        const { text } = stripHtml(q.statement || '');
        const alts = q.alternatives || [];
        const subjectName = q.subject?.name || 'Geral';
        const difficulty = (q.difficulty || 'médio').toLowerCase() as Question['difficulty'];

        return {
          id: `ehub-${year}-${q.externalId || q.id.slice(0, 8)}`,
          subject: subjectName,
          text,
          options: alts.map((a) => a.text || ''),
          optionImages: alts.map((a) => (a.image ? (proxyImageUrl(a.image) ?? null) : null)),
          imageUrl: undefined,
          difficulty: difficulty === 'fácil' || difficulty === 'difícil' ? difficulty : 'médio',
          xpReward: 15,
        };
      });
    } catch (err) {
      console.error('[EnemHub Service] fetch failed (fallback para enem.dev):', err);
      return [];
    }
  },
};

export const enemService = {
  async getQuestionsByYear(year: number): Promise<Question[]> {
    const cached = questionPoolCache.get(year);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;
    if (cached) questionPoolCache.delete(year);

    const promise = this.fetchQuestionsByYear(year);
    questionPoolCache.set(year, { promise, expiresAt: Date.now() + QUESTION_POOL_CACHE_TTL_MS });
    void promise.then((questions) => {
      if (questions.length === 0 && questionPoolCache.get(year)?.promise === promise) {
        questionPoolCache.delete(year);
      }
    }, () => {
      if (questionPoolCache.get(year)?.promise === promise) questionPoolCache.delete(year);
    });
    return promise;
  },

  async fetchQuestionsByYear(year: number): Promise<Question[]> {
    console.log(`[ENEM Service] Starting fetch for year ${year}`);
    const BATCH_SIZE = 50;
    const TOTAL_REQUESTS = 4; // 200 slots cover all 180 official questions

    try {
      // Fonte 2 (EnemHub) em paralelo — falha nao quebra o fluxo (fallback interno)
      const hubPromise = enemhubService.getQuestionsByYear(year).catch(() => [] as Question[]);
      const fetchPromises = Array.from({ length: TOTAL_REQUESTS }, (_, i) => {
        const offset = i * BATCH_SIZE;
        const url = `/api/questoes?year=${year}&limit=${BATCH_SIZE}&offset=${offset}`;
        return fetch(url).then(async res => {
          if (!res.ok) {
            console.error(`[ENEM Service] Batch ${i+1} failed (${res.status})`);
            return [];
          }
          const data = await res.json();
          return data.questions || [];
        }).catch(err => {
          console.error(`[ENEM Service] Network error in batch ${i+1}:`, err);
          return [];
        });
      });

      const results = await Promise.all(fetchPromises);
      const allApiQuestions: EnemQuestion[] = results.flat();

      // Merge com EnemHub (fonte 2): converte e concatena
      const hubQuestions = await hubPromise;
      console.log(`[ENEM Service] Total questions collected: ${allApiQuestions.length}`);
      
      if (allApiQuestions.length === 0) {
        console.warn(`[ENEM Service] No questions were collected for year ${year}. Check server proxy logs.`);
      }

      // EnemHub ja vem no formato Question; injeta no pool final dedup por id
      const mappedDev = allApiQuestions.map(q => {
        const rawText = `${q.context || ''}\n\n${q.alternativesIntroduction || ''}`.trim();
        // Corrige links de imagem com espaço e alt text
        let cleanedText = rawText.replace(/!\[(.*?)\]\s+\((.*?)\)/g, '![$1]($2)');
        
        // Resolve and proxy relative image paths inside markdown
        cleanedText = cleanedText.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
          if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('/api/imagem')) {
            // Even if absolute, proxy it via our API for CORS/Referrer reasons if it's from enem.dev
            if (src.includes('enem.dev') && !src.startsWith('/api/imagem')) {
              return `![${alt}](${proxyImageUrl(src)})`;
            }
            return match;
          }
          const absoluteSrc = src.startsWith('/') ? `https://api.enem.dev${src}` : `https://api.enem.dev/v1/${src}`;
          return `![${alt}](${proxyImageUrl(absoluteSrc)})`;
        });

        // Adiciona informações de língua estrangeira se detectado para ajudar no filtro
        const disc = q.discipline || 'geral';
        const discNorm = normalizeStr(disc);
        // Se a imagem principal já está inline no markdown do texto, não seta
        // imageUrl — os componentes renderizam imageUrl em bloco e a imagem duplicaria.
        // Compara pelo basename do arquivo (sobrevive ao URL-encoding do proxy).
        const mainImage = q.files && q.files.length > 0 ? proxyImageUrl(q.files[0]) : undefined;
        const mainFileBasename = q.files?.[0]?.split('/').pop()?.split('?')[0];
        const alreadyInline = !!mainFileBasename && cleanedText.includes(mainFileBasename);

        return {
          id: `${year}-${q.index || 0}-${discNorm}`,
          subject: q.discipline || 'Geral',
          text: cleanedText,
          options: (q.alternatives || []).map(opt => opt.text || ''),
          optionImages: (q.alternatives || []).map(opt => proxyImageUrl(opt.file) || null),
          imageUrl: mainImage && !alreadyInline ? mainImage : undefined,
          difficulty: 'médio',
          xpReward: 15
        };
      });

      // Merge das duas fontes: dedup por id + embaralha para variar o pool
      const typedDev = mappedDev as Question[];
      const merged = [...typedDev, ...hubQuestions];
      const seen = new Set<string>();
      const deduped = merged.filter((q) => {
        if (seen.has(q.id)) return false;
        seen.add(q.id);
        return true;
      });
      return deduped.sort(() => Math.random() - 0.5);
    } catch (error) {
      console.error('[ENEM Service] Critical error in getQuestionsByYear:', error);
      return [];
    }
  },

  async getLimitedQuestions(year: number, subject: string, limit: number = 50, preferredLanguage: 'ingles' | 'espanhol' = 'ingles'): Promise<Question[]> {
    console.log(`[ENEM Service] getLimitedQuestions(year: ${year}, subject: ${subject}, limit: ${limit}, lang: ${preferredLanguage})`);
    // REGRA DO SISTEMA: treino livre entrega exatamente 50 questões.
    // Clamp defensivo: nunca mais que 50, mesmo se a chamada pedir outro valor.
    limit = Math.min(limit, 50);
    
    const fetchQuestionsPool = async (targetYear: number) => {
      const questions = await this.getQuestionsByYear(targetYear);
      
      const subjectMap: Record<string, string[]> = {
        'Linguagens': ['linguagens', 'portugues', 'codigos'],
        'Matemática': ['matematica'],
        'Ciências da Natureza': ['natureza', 'biologia', 'fisica', 'quimica'],
        'Ciências Humanas': ['humanas', 'historia', 'geografia', 'sociologia', 'filosofia']
      };

      const targetSlugs = subjectMap[subject] || [subject.toLowerCase()];
      
      let filtered = questions.filter(q => {
        const qSubject = normalizeStr(q.subject || '');
        
        if (subject === 'Matemática') {
          return qSubject === 'matematica' || qSubject === 'tecnologia';
        }

        if (subject === 'Linguagens') {
          const isIngles = qSubject.includes('ing') || qSubject.includes('english');
          const isEspanhol = qSubject.includes('esp') || qSubject.includes('spanish');
          const isLinguagemGeral = (qSubject.includes('linguagens') || qSubject.includes('portugues')) && !isIngles && !isEspanhol;
          
          if (isIngles || isEspanhol) {
            if (preferredLanguage === 'ingles') {
              return isIngles && !isEspanhol;
            } else {
              return isEspanhol && !isIngles;
            }
          }
          return isLinguagemGeral;
        }

        return targetSlugs.some(slug => qSubject.includes(normalizeStr(slug)) || normalizeStr(slug).includes(qSubject));
      });

      // Deduplica pelo id completo (preserva questoes ehub- e dev- separadamente)
      return Array.from(new Map<string, Question>(filtered.map(q => [q.id, q])).values());
    };

    let pool = await fetchQuestionsPool(year);
    
    // If we don't have enough (ENEM usually has 45 per subject), fetch from the previous year too
    if (pool.length < limit && year > 2009) {
      console.log(`[ENEM Service] Only ${pool.length} questions found for ${year}. Fetching from ${year - 1} to reach limit of ${limit}.`);
      const extraQuestions = await fetchQuestionsPool(year - 1);
      pool = [...pool, ...extraQuestions];
    }

    // Shuffle and slice to exactly the requested limit
    return pool.sort(() => Math.random() - 0.5).slice(0, limit);
  },

  async getSimulationQuestions(year: number, day: 1 | 2, preferredLanguage: 'ingles' | 'espanhol' = 'ingles'): Promise<Question[]> {
    console.log(`[ENEM Service] getSimulationQuestions(year: ${year}, day: ${day}, lang: ${preferredLanguage})`);
    
    const fetchQuestionsPool = async (targetYear: number) => {
      const allQuestions = await this.getQuestionsByYear(targetYear);
      // Questoes ehub (ehub-{year}-{externalId}) nao tem indice oficial de prova:
      // ficam no final do pool, usadas apenas para completar 90 questoes/dia
      const official = allQuestions.filter(q => !q.id.startsWith('ehub-'));
      const extras = allQuestions.filter(q => q.id.startsWith('ehub-'));
      let filtered = official.filter(q => {
        const parts = q.id.split('-');
        const idx = parseInt(parts[1]);
        const discipline = parts[2] || ''; 
        
        if (day === 1) {
          if (idx >= 1 && idx <= 5) {
            const isIngles = discipline.includes('ing') || discipline.includes('english');
            const isEspanhol = discipline.includes('esp') || discipline.includes('spanish');
            if (preferredLanguage === 'ingles') return isIngles && !isEspanhol;
            return isEspanhol && !isIngles;
          }
          return idx >= 6 && idx <= 90;
        } else {
          return idx >= 91 && idx <= 180;
        }
      });

      const uniqueMap = new Map<string, Question>();
      filtered.forEach(q => {
        const idx = q.id.split('-')[1];
        if (!uniqueMap.has(idx)) uniqueMap.set(idx, q);
      });
      const officialPool = Array.from(uniqueMap.values());
      // Extras ehub mantidos em pool separado para preencher lacunas abaixo
      return officialPool.length > 0 ? officialPool : Array.from(new Map(extras.map(q => [q.id, q])).values());
    };

    let questions = await fetchQuestionsPool(year);

    // REGRA DO SISTEMA: simulado entrega exatamente 90 questões por dia.
    // Nos anos 2024/2025 (só EnemHub, sem índice oficial) o pool oficial é vazio
    // e o próprio fetchQuestionsPool já retorna os extras ehub.

    // If we have gaps (ENEM should have 90), fetch some from previous year to fill up
    if (questions.length < 90 && year > 2009) {
      console.log(`[ENEM Service] Only ${questions.length} questions found for ${year} day ${day}. Filling gaps from ${year - 1}.`);
      const backup = await fetchQuestionsPool(year - 1);
      // We only add from backup what's missing to preserve as many original year questions as possible
      const currentIndices = new Set(questions.map(q => q.id.split('-')[1]));
      for (const q of backup) {
        if (questions.length >= 90) break;
        const idx = q.id.split('-')[1];
        if (!currentIndices.has(idx)) {
          questions.push(q);
          currentIndices.add(idx);
        }
      }
      
      // If even then we are missing, just add any from backup
      if (questions.length < 90) {
        for (const q of backup) {
          if (questions.length >= 90) break;
          // Use a new unique index to avoid UI collisions
          questions.push(q);
        }
      }
    }

    // Final sort by index for simulation feel
    return questions.sort((a, b) => {
      const idxA = parseInt(a.id.split('-')[1] || '0');
      const idxB = parseInt(b.id.split('-')[1] || '0');
      return idxA - idxB;
    }).slice(0, 90);
  }
};
