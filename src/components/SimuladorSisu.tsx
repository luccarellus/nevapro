import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles, SlidersHorizontal, RotateCcw, AlertTriangle, RefreshCw
} from 'lucide-react';
import { UserProfile } from '../types';
import { performanceService } from '../services/performanceService';

interface SimuladorProps {
  user: UserProfile;
}

interface CourseEntry {
  course: string;
  campus: string;
  university: string;
  degree: string;
  shift: string | null;
  cutoff: number;
  category: string;
  year?: number;
  edition?: string;
  uf?: string;
}

interface Scores {
  linguagens: number;
  humanas: number;
  natureza: number;
  matematica: number;
  redacao: number;
}

const EMPTY_SCORES: Scores = {
  linguagens: 0,
  humanas: 0,
  natureza: 0,
  matematica: 0,
  redacao: 0,
};

// A API aceita o valor exato de `modality` gravado na base. Como o dataset
// oficial ingerido cobre Ampla Concorrência, as demais opções retornam vazio
// e a tela informa isso explicitamente (sem inventar corte por cota).
const MODALITIES = [
  { label: 'Ampla concorrência', apiValue: 'Ampla Concorrência' },
  { label: 'Cotas - Escola Pública (L1/L5)', apiValue: 'Cotas - Escola Pública' },
  { label: 'Cotas - PPI / Renda (L2/L6)', apiValue: 'Cotas - PPI / Renda' },
  { label: 'Cotas - PCD', apiValue: 'Cotas - PCD' },
];

type CatalogStatus = 'loading' | 'ready' | 'empty' | 'error';

interface SisuApiResponse {
  edition: { year: number; edition: string } | null;
  source: string;
  count: number;
  cutoffs: CourseEntry[];
}

const SISU_API_BASE = '/api/sisu/cutoffs';
const DEBOUNCE_MS = 300;

export default function SimuladorSisu({ user }: SimuladorProps) {
  const [coursesCatalog, setCoursesCatalog] = useState<CourseEntry[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>('loading');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogEmptyReason, setCatalogEmptyReason] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedCourseName, setSelectedCourseName] = useState('');
  const [selectedUniversity, setSelectedUniversity] = useState('');
  const [selectedModality, setSelectedModality] = useState(MODALITIES[0].apiValue);
  const [isSimulating, setIsSimulating] = useState(false);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'searching' | 'no-results'>('idle');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Notas por área — preenchidas apenas com valores reais do TRI
  const [scores, setScores] = useState<Scores>(EMPTY_SCORES);
  const [baselineScores, setBaselineScores] = useState<Scores>(EMPTY_SCORES);
  const [hasTriScores, setHasTriScores] = useState(false);

  // Sincroniza notas reais calculadas pelo TRI no backend
  useEffect(() => {
    let active = true;
    const loadRealScores = async () => {
      try {
        const triData = await performanceService.getTriScores();
        const s = triData?.latest_score;
        if (active && s) {
          const loaded: Scores = {
            linguagens: s.languages_score ? Math.round(s.languages_score) : 0,
            humanas: s.humanities_score ? Math.round(s.humanities_score) : 0,
            natureza: s.nature_score ? Math.round(s.nature_score) : 0,
            matematica: s.math_score ? Math.round(s.math_score) : 0,
            // A redação não faz parte do cálculo do TRI: fica em 0 até o aluno
            // informar manualmente no simulador.
            redacao: 0,
          };
          setScores(loaded);
          setBaselineScores(loaded);
          setHasTriScores(true);
        }
      } catch {
        // Sem TRI calculado: segue com 0 e exibe o aviso
      }
    };
    loadRealScores();
    return () => { active = false; };
  }, [user.email]);

  // Cancela debounce pendente em caso de desmontagem
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Filtros que são repassados como query params na API
  const courseFilterParam = useMemo(() => {
    const v = selectedCourseName.trim();
    return v.length > 0 ? v : '';
  }, [selectedCourseName]);

  const universityFilterParam = useMemo(() => {
    const v = selectedUniversity.trim();
    return v.length > 0 ? v : '';
  }, [selectedUniversity]);

  const selectedModalityLabel =
    MODALITIES.find((m) => m.apiValue === selectedModality)?.label || selectedModality;

  // Catálogo oficial de notas de corte (recarrega ao trocar a modalidade,
  // ou ao digitar/alterar curso ou universidade — agora com filtro server-side)
  useEffect(() => {
    let active = true;
    let cancelled = false;

    const fetchCutoffs = async () => {
      setCatalogStatus('loading');
      setCatalogError(null);
      setCatalogEmptyReason(null);
      setSearchStatus('idle');

      const params = new URLSearchParams({
        modality: selectedModality,
        limit: '300',
      });
      if (courseFilterParam) params.set('course', courseFilterParam);
      if (universityFilterParam) params.set('university', universityFilterParam);

      try {
        const res = await fetch(`${SISU_API_BASE}?${params.toString()}`, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (!res.ok) {
          throw new Error('Não foi possível carregar as notas de corte oficiais.');
        }
        const data: SisuApiResponse = await res.json();
        if (cancelled) return;

        const rawRows: Array<{
          course: string;
          campus: string | null;
          university: string;
          degree: string | null;
          shift: string | null;
          cutoff: number | string;
          modalityCategory?: string | null;
          year?: number | string;
          edition?: string;
          uf?: string | null;
        }> = Array.isArray(data?.cutoffs) ? data.cutoffs : [];

        // Popula o catálogo com os resultados (dados reais do servidor)
        setCoursesCatalog(
          rawRows.map((c) => ({
            course: c.course,
            campus: c.campus || 'Campus não informado',
            university: c.university,
            degree: c.degree || 'Bacharelado',
            shift: c.shift ?? null,
            cutoff: Math.round(Number(c.cutoff)),
            category: (c as any).modalityCategory || 'Geral',
            year: c.year ? Number(c.year) : undefined,
            edition: c.edition ?? undefined,
            uf: c.uf ?? undefined,
          }))
        );

        if (rawRows.length === 0) {
          // Diferenciar: foi filtro vazio ou modalidade sem dados?
          if (courseFilterParam || universityFilterParam) {
            setCatalogStatus('empty');
            setCatalogEmptyReason(
              !courseFilterParam
                ? 'Nenhuma instituição encontrada para este filtro.'
                : !universityFilterParam
                  ? 'Nenhum curso encontrado para este filtro.'
                  : 'Nenhum curso encontrado para este curso e instituição.'
            );
          } else {
            setCatalogStatus('empty');
            setCatalogEmptyReason(
              'Sem notas de corte oficiais para "' + selectedModalityLabel + '".'
            );
          }
          return;
        }

        setCatalogStatus('ready');
      } catch (err: any) {
        if (cancelled) return;
        console.warn('[SISU] Falha ao carregar notas de corte oficiais.', err);
        setCoursesCatalog([]);
        setCatalogError(err?.message || 'Falha ao carregar as notas de corte oficiais.');
        setCatalogStatus('error');
      }
    };

    fetchCutoffs();
    return () => { cancelled = true; };
  }, [selectedModality, courseFilterParam, universityFilterParam, refreshKey, selectedModalityLabel]);

  // Cursos únicos disponíveis no catálogo atual (já filtrado pela API)
  const allCourses = useMemo(() => {
    const list = Array.from(new Set(coursesCatalog.map((c) => c.course)));
    return list.sort((a, b) => a.localeCompare(b));
  }, [coursesCatalog]);

  // Universidades disponíveis para o curso digitado (após filtro de servidor).
  // Quando não há curso filtrado, mostra universidades do catálogo inteiro.
  const availableUniversities = useMemo(() => {
    if (selectedCourseName.trim().length === 0) {
      return Array.from(new Set(coursesCatalog.map((c) => c.university)))
        .sort((a, b) => a.localeCompare(b));
    }

    // Quando há curso digitado, filtramos os cursos que CONTÉM o termo (case-insensitive)
    // e listamos as universidades desses cursos.
    const q = selectedCourseName.trim().toLowerCase();
    const universities = Array.from(
      new Set(
        coursesCatalog
          .filter((c) => c.course.toLowerCase().includes(q))
          .map((c) => c.university)
      )
    );
    return universities.sort((a, b) => a.localeCompare(b));
  }, [coursesCatalog, selectedCourseName]);

  // Entrada de curso+universidade selecionada.
  // Usa correspondência de CURSO exato (mesmo nome) + universidade exata para evitar
  // falso-positivo (ex.: 'Medicina' não deve corresponder a 'Medicina Veterinária').
  const activeCourseEntry = useMemo(() => {
    if (!selectedUniversity || selectedCourseName.trim().length === 0) return null;

    const courseName = selectedCourseName.trim();
    const universityName = selectedUniversity.trim();

    // Primeiro tenta correspondência exata de curso + universidade
    let entry = coursesCatalog.find(
      (c) =>
        c.course.toLowerCase() === courseName.toLowerCase() &&
        c.university.toLowerCase() === universityName.toLowerCase()
    );

    // Se não achou exato, tenta correspondência parcial do curso (mas universidade exata)
    if (!entry) {
      entry = coursesCatalog.find(
        (c) =>
          c.course.toLowerCase().includes(courseName.toLowerCase()) &&
          c.university.toLowerCase() === universityName.toLowerCase()
      );
    }

    return entry || null;
  }, [coursesCatalog, selectedCourseName, selectedUniversity]);

  // Cálculo da média aritmética simples das 5 notas do ENEM
  const userAverage = useMemo(() => {
    const sum =
      scores.linguagens +
      scores.humanas +
      scores.natureza +
      scores.matematica +
      scores.redacao;
    return Math.round(sum / 5);
  }, [scores]);

  // Nota de corte efetiva: sempre a nota oficial da modalidade selecionada
  const effectiveCutoff = activeCourseEntry ? activeCourseEntry.cutoff : null;

  const diffPoints = effectiveCutoff !== null ? userAverage - effectiveCutoff : null;
  const missingPoints = diffPoints !== null ? Math.max(0, -diffPoints) : null;

  // Busca de cursos com debounce — atualiza o catálogo via API (course param)
  const handleCourseInputChange = useCallback(
    (value: string) => {
      setSelectedCourseName(value);
      setSelectedUniversity('');
      setCatalogEmptyReason(null);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Estado imediato: idle (busca ainda não começou)
      setSearchStatus('idle');

      if (value.trim().length === 0) {
        // Sem valor: o efeito recarregará o catálogo completo da modalidade
        return;
      }

      // Debounce: espera DEBOUNCE_MS ms antes de marcar como searching
      debounceTimerRef.current = setTimeout(() => {
        // O efeito já reexecuta quando courseFilterParam muda — apenas atualiza estado visual
        setSearchStatus('searching');
      }, DEBOUNCE_MS);
    },
    []
  );

  // Efeito colateral: quando o usuário digita um curso e a busca retorna zero,
  // mostramos feedback visual de "sem resultados".
  useEffect(() => {
    if (catalogStatus === 'empty' && courseFilterParam.length > 0) {
      setSearchStatus('no-results');
    } else if (catalogStatus === 'ready') {
      setSearchStatus('idle');
    }
  }, [catalogStatus, courseFilterParam]);

  // Efeito: quando a busca termina em erro, voltamos para idle
  useEffect(() => {
    if (catalogStatus === 'error') {
      setSearchStatus('idle');
    }
  }, [catalogStatus]);

  // Dica dinâmica do Professor IA baseada nas menores notas
  const aiTip = useMemo(() => {
    const entries = [
      { name: 'Matemática', score: scores.matematica },
      { name: 'Natureza', score: scores.natureza },
      { name: 'Linguagens', score: scores.linguagens },
      { name: 'Humanas', score: scores.humanas },
      { name: 'Redação', score: scores.redacao },
    ];
    if (!entries.some((e) => e.score > 0)) {
      return 'informe suas notas no simulador para ver onde focar.';
    }
    entries.sort((a, b) => a.score - b.score);
    return `foque em ${entries[0].name} e ${entries[1].name} para encurtar a distância.`;
  }, [scores]);

  const handleScoreChange = (area: keyof Scores, val: number) => {
    const clamped = Math.max(0, Math.min(1000, val));
    setScores((prev) => ({ ...prev, [area]: clamped }));
  };

  const handleResetScores = () => {
    setScores(baselineScores);
  };

  const handleModalityChange = (value: string) => {
    setSelectedModality(value);
    setSelectedCourseName('');
    setSelectedUniversity('');
    setSearchStatus('idle');
    setCatalogEmptyReason(null);
  };

  // Ao escolher uma universidade, o efeito de busca já reexecuta com university param.
  const handleUniversityChange = (value: string) => {
    setSelectedUniversity(value);
    setCatalogEmptyReason(null);
    setSearchStatus('idle');
  };

  return (
    <div className="max-w-6xl mx-auto pt-6 sm:pt-10 pb-20 px-4 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-8"
      >
        {/* Cabeçalho */}
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-text-main tracking-tight mb-1">
            Simulador SISU
          </h1>
          <p className="text-text-secondary text-sm sm:text-base font-medium">
            Compare sua nota atual com a nota de corte do curso.
          </p>
        </div>

        {/* Barra superior de seleção / formulário */}
        <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-2xl md:rounded-3xl p-5 md:p-6 shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {/* Campo 1: Curso */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-2">
                Curso
              </label>
              <div className="relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={selectedCourseName}
                  onChange={(e) => handleCourseInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter confirma o curso digitado sem esperar debounce final
                    if (e.key === 'Enter' && selectedCourseName.trim().length > 0) {
                      e.preventDefault();
                      searchInputRef.current?.blur();
                    }
                  }}
                  onFocus={() => {
                    // Ao focar, se não houver curso selecionado e houver cursos disponíveis,
                    // pré-seleciona o primeiro para facilitar
                    if (!selectedCourseName && allCourses.length > 0) {
                      setSelectedCourseName(allCourses[0]);
                    }
                  }}
                  placeholder="Digite para buscar (Ex: Medicina)"
                  disabled={catalogStatus === 'loading' || catalogStatus === 'error'}
                  className="w-full bg-[#0a0f1d] border border-border-color rounded-xl px-4 py-3 text-text-main font-semibold text-sm focus:outline-none focus:border-brand-primary/60 transition-all placeholder:text-text-secondary/40 disabled:opacity-50"
                />
                <datalist id="courses-options">
                  {allCourses.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Campo 2: Universidade */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-2">
                Universidade
              </label>
              <select
                value={selectedUniversity}
                onChange={(e) => handleUniversityChange(e.target.value)}
                disabled={availableUniversities.length === 0 || catalogStatus === 'loading'}
                className="w-full bg-[#0a0f1d] border border-border-color rounded-xl px-4 py-3 text-text-main font-semibold text-sm focus:outline-none focus:border-brand-primary/60 transition-all cursor-pointer disabled:opacity-50"
              >
                <option value="">[Escolha a universidade]</option>
                {availableUniversities.map((uni) => (
                  <option key={uni} value={uni}>
                    {uni}
                  </option>
                ))}
              </select>
            </div>

            {/* Campo 3: Modalidade */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-2">
                Modalidade
              </label>
              <select
                value={selectedModality}
                onChange={(e) => handleModalityChange(e.target.value)}
                className="w-full bg-[#0a0f1d] border border-border-color rounded-xl px-4 py-3 text-text-main font-semibold text-sm focus:outline-none focus:border-brand-primary/60 transition-all cursor-pointer"
              >
                {MODALITIES.map((m) => (
                  <option key={m.apiValue} value={m.apiValue}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Aviso de carga das notas oficiais */}
          {catalogStatus === 'loading' && (
            <p className="mt-4 text-xs font-semibold text-text-secondary flex items-center gap-2">
              <RefreshCw size={13} className="animate-spin" />
              {courseFilterParam || universityFilterParam
                ? 'Buscando resultados para "' + (courseFilterParam || selectedUniversity) + '"…'
                : 'Carregando notas de corte oficiais...'
              }
            </p>
          )}

          {catalogStatus === 'error' && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-[#2a1e12] border border-[#a17e49]/40 px-4 py-3">
              <p className="text-xs font-semibold text-[#f5caa1] flex items-center gap-2">
                <AlertTriangle size={14} />
                {catalogError || 'Falha ao carregar as notas de corte oficiais.'}
              </p>
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-brand-primary text-black text-[11px] font-black"
              >
                Tentar de novo
              </button>
            </div>
          )}

          {catalogStatus === 'empty' && (
            <div className="mt-4 rounded-xl bg-bg-main/40 border border-border-color px-4 py-3">
              <p className="text-xs font-semibold text-text-secondary flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400" />
                {catalogEmptyReason || 'Sem notas de corte oficiais para "' + selectedModalityLabel + '".'}
              </p>
              {!courseFilterParam && !universityFilterParam && (
                <p className="text-[11px] font-medium text-text-secondary/70 mt-1">
                  Os dados oficiais disponíveis hoje são de Ampla Concorrência.
                </p>
              )}
              {(courseFilterParam || universityFilterParam) && (
                <button
                  onClick={() => {
                    setSelectedCourseName('');
                    setSelectedUniversity('');
                    setCatalogEmptyReason(null);
                  }}
                  className="mt-2 text-[11px] font-semibold text-brand-primary hover:underline"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}

          {/* Feedback visual da busca em tempo real */}
          {searchStatus === 'searching' && (
            <p className="mt-2 text-[11px] font-semibold text-text-secondary/70 flex items-center gap-1">
              <RefreshCw size={10} className="animate-spin" />
              Buscando cursos…
            </p>
          )}

          {searchStatus === 'no-results' && courseFilterParam.length > 0 && (
            <p className="mt-2 text-[11px] font-semibold text-amber-400/90 flex items-center gap-1">
              <AlertTriangle size={10} />
              Nenhum curso encontrado para "{courseFilterParam}".
            </p>
          )}
        </div>

        {/* Grid dos dois cards principais */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Card Esquerdo: Média e Corte */}
          <div className="lg:col-span-5 bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-3xl p-6 sm:p-8 flex flex-col justify-between min-h-[380px] shadow-lg relative overflow-hidden">
            <div>
              <p className="text-sm font-semibold text-text-secondary mb-2">
                Sua média
              </p>
              <h2 className="text-5xl sm:text-6xl font-black text-text-main tracking-tight leading-none mb-8">
                {userAverage}
              </h2>

              <p className="text-sm font-semibold text-text-secondary mb-2">
                Nota de corte
              </p>
              <h2 className="text-4xl sm:text-5xl font-black text-text-main tracking-tight leading-none">
                {effectiveCutoff !== null ? effectiveCutoff.toFixed(1) : '—'}
              </h2>
            </div>

            {/* Pill de status */}
            <div className="mt-8">
              {effectiveCutoff === null ? (
                <div className="w-full py-3.5 px-4 rounded-2xl bg-text-main/5 border border-border-color text-text-secondary font-bold text-xs sm:text-sm text-center">
                  {catalogStatus === 'empty'
                    ? 'Sem dados oficiais para esta modalidade'
                    : 'Escolha uma universidade acima'}
                </div>
              ) : diffPoints !== null && diffPoints < 0 ? (
                <div className="w-full py-3.5 px-4 rounded-2xl bg-[#2a1e12] border border-[#a17e49]/40 text-[#f5caa1] font-bold text-xs sm:text-sm text-center shadow-inner">
                  Faltam {missingPoints} pontos
                </div>
              ) : (
                <div className="w-full py-3.5 px-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-bold text-xs sm:text-sm text-center shadow-inner">
                  Parabéns! Você tem {diffPoints} pontos acima do corte
                </div>
              )}
            </div>
          </div>

          {/* Card Direito: Nota por Área */}
          <div className="lg:col-span-7 bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-3xl p-6 sm:p-8 flex flex-col justify-between min-h-[380px] shadow-lg">
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-base sm:text-lg font-bold text-text-main">
                  Sua nota por área
                </h3>
                <button
                  onClick={() => setIsSimulating(!isSimulating)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-text-main/5 hover:bg-text-main/10 border border-border-color text-text-secondary hover:text-text-main text-xs font-bold transition-all"
                >
                  <SlidersHorizontal size={13} />
                  <span>{isSimulating ? 'Fechar simulador' : 'Simular notas'}</span>
                </button>
              </div>

              {!hasTriScores && (
                <p className="text-[11px] font-semibold text-text-secondary/70 mb-4">
                  Sem notas do TRI calculadas ainda — use "Simular notas" para estimar sua média.
                </p>
              )}

              {/* Lista das 5 áreas */}
              <div className="space-y-4">
                {[
                  { key: 'linguagens', label: 'Linguagens', score: scores.linguagens },
                  { key: 'humanas', label: 'Ciências Humanas', score: scores.humanas },
                  { key: 'natureza', label: 'Ciências da Natureza', score: scores.natureza },
                  { key: 'matematica', label: 'Matemática', score: scores.matematica },
                  { key: 'redacao', label: 'Redação', score: scores.redacao },
                ].map((item) => (
                  <div key={item.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-xs sm:text-sm font-medium text-text-secondary w-36 sm:w-44 shrink-0">
                        {item.label}
                      </span>
                      <div className="flex-1 bg-[#141b2a] h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-brand-primary h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(0,176,148,0.4)]"
                          style={{ width: `${Math.min(100, Math.max(0, (item.score / 1000) * 100))}%` }}
                        />
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-text-main w-10 text-right">
                        {item.score}
                      </span>
                    </div>

                    {isSimulating && (
                      <div className="pl-36 sm:pl-44 pr-10 pt-1">
                        <input
                          type="range"
                          min="0"
                          max="1000"
                          step="5"
                          value={item.score}
                          onChange={(e) => handleScoreChange(item.key as keyof Scores, Number(e.target.value))}
                          className="w-full accent-brand-primary h-1 bg-[#141b2a] rounded-lg cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {isSimulating && (
                <div className="flex justify-end pt-3">
                  <button
                    onClick={handleResetScores}
                    className="flex items-center gap-1 text-[11px] font-bold text-text-secondary hover:text-brand-primary transition-colors"
                  >
                    <RotateCcw size={12} /> Restaurar notas
                  </button>
                </div>
              )}
            </div>

            {/* Dica do Professor IA */}
            <div className="pt-6 mt-6 border-t border-border-color/30 flex items-start gap-2.5">
              <Sparkles size={16} className="text-brand-primary shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-text-secondary font-medium leading-relaxed">
                <span className="text-text-main font-semibold">Dica do Professor IA:</span>{' '}
                {aiTip}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
