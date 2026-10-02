/**
 * Ingestão de notas de corte do SISU → tabela public.sisu_cutoffs
 *
 * Fonte primária: CSVs oficiais "listagem de aprovados" do SISU
 * (sisu.mec.gov.br), espelhados no dataset MIT
 * https://github.com/maiakanegae/sisu-data
 * (data/<ano>/listagem_alunos_aprovados_csv/*.csv — um arquivo por IES).
 *
 * Campos relevantes do CSV oficial (2024+):
 *   NO_IES; SG_UF_IES; NO_CAMPUS; NO_CURSO; DS_TURNO; DS_FORMACAO;
 *   QT_VAGAS_CONCORRENCIA; NO_MODALIDADE_CONCORRÊNCIA; NU_NOTACORTE_CONCORRIDA; TIPO_CONCORRENCIA
 * A nota de corte real da modalidade é a MENOR NU_NOTACORTE_CONCORRIDA
 * dentro do grupo (IES+curso+turno+modalidade).
 *
 * Uso:
 *   npm run sisu:ingest -- 2024                     # importa todos os CSVs de 2024
 *   SISU_EDITION=2024.1 npm run sisu:ingest -- 2024 # força a edição
 *   npm run sisu:ingest -- 2024 --file caminho.csv  # CSV único local
 */
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true });

import fs from 'fs';
import path from 'path';
import { query } from '../../src/lib/db';
import pool from '../../src/lib/db';
import { log } from '../utils/logger';

// Linhas do CSV de "listagem aprovados / notas de corte" do SISU.
// Formato oficial (colunas variam por edição — mapeamos por cabeçalho flexível):
// CO_IES;NO_IES;SG_UF_IES;CO_CAMPUS;NO_CAMPUS;NO_CURSO;DS_GRAU;DS_TURNO;
// DS_MODULIDADE_CONCORRÊNCIA;NU_NOTACORTE;NU_VAGACONCORRÊNCIA;CO_ETAPA;...
const DATASET_BASE = 'https://raw.githubusercontent.com/maiakanegae/sisu-data/main/data';
const DATASET_API = 'https://api.github.com/repos/maiakanegae/sisu-data/contents';

interface RawRow {
  [key: string]: string;
}

/** Parse simples de CSV com separador ; ou , e aspas duplas.
 *  Os CSVs oficiais do SISU usam CR (\r) isolado como quebra de linha. */
function parseCsv(text: string): RawRow[] {
  const clean = text.replace(/^\uFEFF/, '');
  const delimiter = (clean.split('\r')[0].match(/;/g)?.length || 0) >= (clean.split('\r')[0].match(/,/g)?.length || 0) ? ';' : ',';
  const rows: string[][] = [];
  let cur = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cur); cur = '';
    } else if (ch === '\n' || ch === '\r') {
      row.push(cur); rows.push(row); row = []; cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }

  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim().toUpperCase());
  return rows.slice(1)
    .filter(r => r.some(c => c.trim() !== ''))
    .map(r => {
      const obj: RawRow = {};
      headers.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
      return obj;
    });
}

function pick(row: RawRow, candidates: string[]): string {
  for (const c of candidates) {
    const key = Object.keys(row).find(k => k === c || k.startsWith(c));
    if (key && row[key] !== undefined && row[key] !== '') return row[key];
  }
  return '';
}

function normalizeModality(raw: string): { modality: string; category: string } {
  const s = raw.trim();
  const upper = s.toUpperCase();
  if (upper.includes('AMPLA')) return { modality: 'Ampla Concorrência', category: 'Ampla' };
  if (/^L\d+/.test(upper)) return { modality: s, category: 'Cota racial (Lei 12.711)' };
  if (upper.startsWith('LB')) return { modality: s, category: 'Cota renda (Lei 12.711)' };
  if (upper.includes('PCD')) return { modality: s, category: 'PcD' };
  if (upper.includes('ESC') || upper.startsWith('EP')) return { modality: s, category: 'Escola pública' };
  if (upper.includes('IND') || upper.includes('QUILO')) return { modality: s, category: 'Indígena/Quilombola' };
  return { modality: s || 'Outras', category: 'Outras' };
}

function mapYearFolderRows(rows: RawRow[], year: number, edition: string) {
  const records: Record<string, unknown>[] = [];
  for (const row of rows) {
    const course = pick(row, ['NO_CURSO', 'NO_CURSO_SEM_AJUSTE', 'CURSO']);
    const university = pick(row, ['NO_IES', 'NOME_IES', 'IES']);
    // Nota de corte real da modalidade (menor nota do classificado) ou fallback p/ nota do candidato
    const cutoffStr = pick(row, ['NU_NOTACORTE_CONCORRIDA', 'NU_NOTA_CORTE', 'NU_NOTACORTE', 'NOTA_DE_CORTE'])
      || pick(row, ['NU_NOTA_CANDIDATO']);
    const cutoff = parseFloat((cutoffStr || '').replace(/\./g, '.').replace(',', '.'));
    if (!course || !university || !Number.isFinite(cutoff)) continue;

    const modalityRaw = pick(row, ['NO_MODALIDADE_CONCORRENCIA', 'NO_MODALIDADE_CONCORRÊNCIA', 'DS_MODULIDADE_CONCORRENCIA', 'TIPO_CONCORRENCIA', 'MODALIDADE'])
      || pick(row, ['TIPO_CONCORRENCIA']);
    const { modality, category } = normalizeModality(modalityRaw);

    records.push({
      year,
      edition,
      course: course.trim(),
      campus: (pick(row, ['NO_CAMPUS', 'CAMPUS']) || null),
      university: university.trim(),
      uf: pick(row, ['SG_UF_IES', 'SG_UF_CAMPUS', 'UF']) || null,
      degree: pick(row, ['DS_FORMACAO', 'DS_GRAU', 'GRAU']) || null,
      shift: pick(row, ['DS_TURNO', 'TURNO']) || null,
      modality,
      modality_category: category,
      cutoff_score: cutoff,
      seats: parseInt(pick(row, ['QT_VAGAS_CONCORRENCIA', 'NU_VAGACONCORRÊNCIA', 'NU_VAGAS_CONCORRENCIA', 'VAGAS']), 10) || null,
      source: 'sisu.mec.gov.br',
    });
  }
  return records;
}

/** Reduz registros duplicados (mesma IES+curso+turno+modalidade) para o MENOR corte
 *  (a nota de corte oficial é a menor nota do último classificado dentro do grupo). */
function dedupeMinCutoff(records: Record<string, unknown>[]): Record<string, unknown>[] {
  const best = new Map<string, Record<string, unknown>>();
  for (const r of records) {
    const key = `${r.university}|${r.course}|${r.shift}|${r.modality}`;
    const prev = best.get(key);
    if (!prev || Number(r.cutoff_score) < Number(prev.cutoff_score)) {
      best.set(key, r);
    }
  }
  return Array.from(best.values());
}

async function fetchWithRetry(url: string, attempts = 3): Promise<string> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'nevapro-sisu-ingest' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err: any) {
      if (i === attempts) throw err;
      await new Promise(r => setTimeout(r, 500 * i));
    }
  }
  throw new Error('unreachable');
}

/** Lista os CSVs oficiais de aprovados de um ano no dataset espelho. */
async function listDatasetCsvs(year: number): Promise<string[]> {
  const listing = await fetchWithRetry(`${DATASET_API}/data/${year}/listagem_alunos_aprovados_csv`);
  const files = JSON.parse(listing) as { name: string; download_url?: string }[];
  return files.filter(f => f.name.endsWith('.csv') && f.download_url).map(f => f.download_url!);
}

async function main() {
  const yearArg = parseInt(process.argv[2] || '', 10);
  const year = Number.isFinite(yearArg) ? yearArg : new Date().getFullYear() - 1;
  const edition = process.env.SISU_EDITION || `${year}.1`;
  const localFile = process.argv.includes('--file') ? process.argv[process.argv.indexOf('--file') + 1] : null;
  const singleUrl = process.env.SISU_CSV_URL || null;

  let csvSources: string[];
  if (localFile) {
    csvSources = [path.resolve(localFile)];
  } else if (singleUrl) {
    csvSources = [singleUrl];
  } else {
    csvSources = await listDatasetCsvs(year);
    if (csvSources.length === 0) {
      throw new Error(`Nenhum CSV encontrado para ${year} no dataset. Use --file com um CSV local.`);
    }
    log.info(`[SISU] ${csvSources.length} arquivos de IES encontrados para ${year}.`);
  }

  let allRecords: Record<string, unknown>[] = [];
  let processed = 0;
  for (const src of csvSources) {
    try {
      const csvText = src.startsWith('http')
        ? await fetchWithRetry(src)
        : fs.readFileSync(path.resolve(src), 'utf-8');
      const rows = parseCsv(csvText);
      const mapped = mapYearFolderRows(rows, year, edition).filter(r => r.modality === 'Ampla Concorrência');
      allRecords.push(...mapped);
      processed++;
      if (processed % 25 === 0) log.info(`[SISU] ${processed}/${csvSources.length} arquivos processados...`);
    } catch (err: any) {
      log.warn(`[SISU] Ignorando fonte com falha (${src}): ${err.message}`);
    }
  }
  log.info(`[SISU] ${processed}/${csvSources.length} fontes lidas; ${allRecords.length} linhas brutas.`);

  // Nota de corte oficial = menor nota do último classificado por grupo
  allRecords = dedupeMinCutoff(allRecords);
  if (allRecords.length === 0) {
    throw new Error('Nenhum registro válido extraído — verifique o formato do CSV (cabeçalhos esperados: NO_IES, NO_CURSO, NU_NOTACORTE_CONCORRIDA...).');
  }
  log.info(`[SISU] ${allRecords.length} registros únicos após deduplicação (edição ${edition}).`);

  // Inserção em lote (mais rápido que linha a linha)
  const BATCH = 500;
  let count = 0;
  for (let i = 0; i < allRecords.length; i += BATCH) {
    const batch = allRecords.slice(i, i + BATCH);
    const values: unknown[] = [];
    const tuples = batch.map((r, j) => {
      const b = j * 13;
      values.push(r.year, r.edition, r.course, r.campus, r.university, r.uf, r.degree, r.shift, r.modality, r.modality_category, r.cutoff_score, r.seats, r.source);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13})`;
    }).join(',');
    const sql = `
      INSERT INTO sisu_cutoffs
        (year, edition, course, campus, university, uf, degree, shift,
         modality, modality_category, cutoff_score, seats, source)
      VALUES ${tuples}
      ON CONFLICT (year, edition, university, course, shift, modality)
      DO UPDATE SET
        campus = EXCLUDED.campus,
        uf = EXCLUDED.uf,
        degree = EXCLUDED.degree,
        modality_category = EXCLUDED.modality_category,
        cutoff_score = EXCLUDED.cutoff_score,
        seats = EXCLUDED.seats,
        ingested_at = NOW()
    `;
    const res = await query(sql, values);
    count += res.rowCount || 0;
  }
  log.info(`[SISU] Ingestão concluída: ${count} registros upserted na edição ${edition}.`);

  const summary = await query(
    `SELECT modality_category, COUNT(*)::int AS n, ROUND(AVG(cutoff_score)::numeric, 1) AS avg_cut
     FROM sisu_cutoffs WHERE year = $1 GROUP BY 1 ORDER BY n DESC`,
    [year]
  );
  for (const r of summary.rows) {
    log.info(`[SISU] ${r.modality_category}: ${r.n} registros (corte médio ${r.avg_cut})`);
  }
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    log.error('[SISU] Falha na ingestão:', err);
    pool.end().finally(() => process.exit(1));
  });
