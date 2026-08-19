import { calculateLevelAndProgression } from '../../utils/xpUtils';

export const normalizeString = (str: string | null | undefined): string => {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

export const getUniqueNormalized = (items: (string | undefined | null)[]): string[] => {
  const seen = new Set<string>();
  const uniqueItems: string[] = [];
  
  for (const item of items) {
    if (!item) continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    
    const normalized = normalizeString(trimmed);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueItems.push(trimmed);
    } else {
      const index = uniqueItems.findIndex(x => normalizeString(x) === normalized);
      if (index !== -1) {
        const existing = uniqueItems[index];
        const existingUpperCount = (existing.match(/[A-Z]/g) || []).length;
        const newUpperCount = (trimmed.match(/[A-Z]/g) || []).length;
        if (newUpperCount > existingUpperCount) {
          uniqueItems[index] = trimmed;
        }
      }
    }
  }
  
  return uniqueItems.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
};

export const toTimestamp = (value?: string): number => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const formatShortDate = (value?: string): string => {
  const timestamp = toTimestamp(value);
  if (!timestamp) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(timestamp));
};

export const getSignificantTokens = (name: string): string[] => {
  const normalized = normalizeString(name);
  const genericWords = new Set([
    'centro', 'de', 'do', 'da', 'em', 'e', 'ensino', 'escola', 'colegio', 
    'municipal', 'estadual', 'unidade', 'escolar', 'ce', 'c.e', 'c.e.', 'u.e', 'u.e.', 'ue'
  ]);
  return normalized
    .split(/[\s,.\-\/]+/)
    .filter(word => word.length > 2 && !genericWords.has(word));
};

export const getCanonicalSchoolMap = (rawSchools: (string | null | undefined)[]): Record<string, string> => {
  const canonicalMap: Record<string, string> = {};
  const uniqueRaws = Array.from(new Set(rawSchools.map(s => s?.trim() || '').filter(Boolean)));
  uniqueRaws.sort((a, b) => b.length - a.length);
  
  const clusters: { representative: string; tokens: string[] }[] = [];
  
  for (const raw of uniqueRaws) {
    const tokens = getSignificantTokens(raw);
    if (tokens.length === 0) {
      canonicalMap[raw] = raw;
      continue;
    }
    
    let matchedCluster = null;
    for (const cluster of clusters) {
      const hasOverlap = tokens.some(t => cluster.tokens.includes(t)) || cluster.tokens.some(t => tokens.includes(t));
      if (hasOverlap) {
        matchedCluster = cluster;
        break;
      }
    }
    
    if (matchedCluster) {
      canonicalMap[raw] = matchedCluster.representative;
    } else {
      clusters.push({ representative: raw, tokens });
      canonicalMap[raw] = raw;
    }
  }
  
  return canonicalMap;
};

export const getStudentRankInfo = (level: number) => {
  if (level >= 15) return { label: 'Mestre', classes: 'bg-text-main/10 text-text-main border border-border-color font-black' };
  if (level >= 10) return { label: 'Diamante', classes: 'bg-text-main/10 text-text-main border border-border-color font-bold' };
  if (level >= 7) return { label: 'Platina', classes: 'bg-text-main/5 text-text-main border border-border-color' };
  if (level >= 4) return { label: 'Ouro', classes: 'bg-text-main/5 text-text-secondary border border-border-color' };
  if (level >= 2) return { label: 'Prata', classes: 'bg-text-main/5 text-text-secondary border border-border-color' };
  return { label: 'Bronze', classes: 'bg-text-main/5 text-text-secondary border border-border-color opacity-80' };
};

export const formatDateToBR = (dateStr: string): string => {
  if (!dateStr) return '-';
  const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parts = dateOnly.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};
