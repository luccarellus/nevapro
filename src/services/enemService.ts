
import { Question } from '../types';

const BASE_URL = '/api';

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
    isCorrect: boolean;
  }[];
  correctAlternative: string;
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
  } else if (!url.startsWith('http')) {
    // If it's a relative path like "files/abc.jpg", try prefixing with api.enem.dev/v1/
    absoluteUrl = `https://api.enem.dev/v1/${url}`;
  }
  
  return `/api/imagem?url=${encodeURIComponent(absoluteUrl)}`;
};

const normalizeStr = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const enemService = {
  async getQuestionsByYear(year: number): Promise<Question[]> {
    console.log(`[ENEM Service] Starting fetch for year ${year}`);
    const BATCH_SIZE = 50;
    const TOTAL_REQUESTS = 5; // Fetch 250 items to be safe for 180 questions

    try {
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

      console.log(`[ENEM Service] Total questions collected: ${allApiQuestions.length}`);
      
      if (allApiQuestions.length === 0) {
        console.warn(`[ENEM Service] No questions were collected for year ${year}. Check server proxy logs.`);
      }

      return allApiQuestions.map(q => {
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
        const isEng = discNorm.includes('ing') || discNorm.includes('english');
        const isEsp = discNorm.includes('esp') || discNorm.includes('spanish');

        return {
          id: `${year}-${q.index || 0}-${discNorm}`,
          subject: q.discipline || 'Geral',
          text: cleanedText,
          options: (q.alternatives || []).map(opt => opt.text || ''),
          optionImages: (q.alternatives || []).map(opt => proxyImageUrl(opt.file) || null),
          imageUrl: q.files && q.files.length > 0 ? proxyImageUrl(q.files[0]) : undefined,
          correctOptionIndex: (q.alternatives || []).findIndex(opt => opt.letter === q.correctAlternative),
          explanation: 'Resolução baseada nos critérios oficiais do ENEM.',
          difficulty: 'médio',
          xpReward: 50
        };
      });
    } catch (error) {
      console.error('[ENEM Service] Critical error in getQuestionsByYear:', error);
      return [];
    }
  },

  async getLimitedQuestions(year: number, subject: string, limit: number = 50, preferredLanguage: 'ingles' | 'espanhol' = 'ingles'): Promise<Question[]> {
    console.log(`[ENEM Service] getLimitedQuestions(year: ${year}, subject: ${subject}, limit: ${limit}, lang: ${preferredLanguage})`);
    
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

      // Remove duplicates by internal index for this batch
      return Array.from(new Map<string, Question>(filtered.map(q => [q.id.split('-')[1], q])).values());
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
      let filtered = allQuestions.filter(q => {
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
      return Array.from(uniqueMap.values());
    };

    let questions = await fetchQuestionsPool(year);
    
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
          questions.push({...q, id: `${q.id}-fallback-${questions.length}`});
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
