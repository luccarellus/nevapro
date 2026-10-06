import { useState, useEffect, useMemo } from 'react';
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

export default function SimuladorSisu({ user }: SimuladorProps) {
  const [coursesCatalog, setCoursesCatalog] = useState<CourseEntry[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>('loading');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedCourseName, setSelectedCourseName] = useState('');
  const [selectedUniversity, setSelectedUniversity] = useState('');
  const [selectedModality, setSelectedModality] = useState(MODALITIES[0].apiValue);
  const [isSimulating, setIsSimulating] = useState(false);

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

  // Catálogo oficial de notas de corte (recarrega ao trocar a modalidade)
  useEffect(() => {
    let active = true;
    const fetchCutoffs = async () => {
      setCatalogStatus('loading');
      setCatalogError(null);
      try {
        const res = await fetch(
          `/api/sisu/cutoffs?modality=${encodeURIComponent(selectedModality)}&limit=300`,
          { headers: { 'X-Requested-With': 'XMLHttpRequest' } },
        );
        if (!res.ok) {
          throw new Error('Não foi possível carregar as notas de corte oficiais.');
        }
        const data = await res.json();
        if (!active) return;

        const cutoffRows: any[] = Array.isArray(data?.cutoffs) ? data.cutoffs : [];
        if (cutoffRows.length === 0) {
          setCoursesCatalog([]);
          setCatalogStatus('empty');
          return;
        }

        setCoursesCatalog(cutoffRows.map((c) => ({
          course: c.course,
          campus: c.campus || 'Campus não informado',
          university: c.university,
          degree: c.degree || 'Bacharelado',
          shift: c.shift ?? null,
          cutoff: Math.round(Number(c.cutoff)),
          category: c.modalityCategory || 'Geral',
          year: c.year,
          edition: c.edition,
        })));
        setCatalogStatus('ready');
      } catch (err: any) {
        if (!active) return;
        console.warn('[SISU] Falha ao carregar notas de corte oficiais.', err);
        setCoursesCatalog([]);
        setCatalogError(err?.message || 'Falha ao carregar as notas de corte oficiais.');
        setCatalogStatus('error');
      }
    };
    fetchCutoffs();
    return () => { active = false; };
  }, [selectedModality, refreshKey]);

  // Cursos únicos disponíveis
  const allCourses = useMemo(() => {
    const list = Array.from(new Set(coursesCatalog.map((c) => c.course)));
    return list.sort((a, b) => a.localeCompare(b));
  }, [coursesCatalog]);

  // Filtro de cursos em tempo real (flexível: permite busca parcial)
  const filteredCourses = useMemo(() => {
    const query = selectedCourseName.trim().toLowerCase();
    if (!query) return allCourses;
    return allCourses.filter((c) => c.toLowerCase().includes(query));
  }, [allCourses, selectedCourseName]);

  // Universidades disponíveis para o curso selecionado (busca flexível)
  const availableUniversities = useMemo(() => {
    const query = selectedCourseName.trim().toLowerCase();
    let matching: typeof coursesCatalog = [];
    if (!query) {
      // Sem curso selecionado: mostra todas as universidades do catálogo
      matching = coursesCatalog;
    } else {
      // Busca flexível: cursos que contêm o termo (não igualdade exata)
      matching = coursesCatalog.filter((c) => c.course.toLowerCase().includes(query));
    }
    return Array.from(new Set(matching.map((c) => c.university))).sort((a, b) => a.localeCompare(b));
  }, [coursesCatalog, selectedCourseName]);

  // Entrada de curso selecionada (busca flexível também)
  const activeCourseEntry = useMemo(() => {
    if (!selectedUniversity) return null;
    const query = selectedCourseName.trim().toLowerCase();
    return coursesCatalog.find(
      (c) =>
        c.course.toLowerCase().includes(query) &&
        c.university.toLowerCase() === selectedUniversity.toLowerCase(),
    ) || null;
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

  const selectedModalityLabel =
    MODALITIES.find((m) => m.apiValue === selectedModality)?.label || selectedModality;

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
                  type="text"
                  value={selectedCourseName}
                  onChange={(e) => {
                    setSelectedCourseName(e.target.value);
                    setSelectedUniversity('');
                  }}
                  onFocus={() => {
                    // Ao focar, se não houver curso selecionado, pré-seleciona o primeiro disponível
                    if (!selectedCourseName && filteredCourses.length > 0) {
                      setSelectedCourseName(filteredCourses[0]);
                    }
                  }}
                  placeholder="Digite para buscar (Ex: Medicina)"
                  disabled={catalogStatus !== 'ready'}
                  className="w-full bg-[#0a0f1d] border border-border-color rounded-xl px-4 py-3 text-text-main font-semibold text-sm focus:outline-none focus:border-brand-primary/60 transition-all placeholder:text-text-secondary/40 disabled:opacity-50"
                />
                {filteredCourses.length > 0 && (
                  <datalist id="courses-options">
                    {filteredCourses.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                )}
              </div>
            </div>

            {/* Campo 2: Universidade */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-2">
                Universidade
              </label>
              <select
                value={selectedUniversity}
                onChange={(e) => setSelectedUniversity(e.target.value)}
                disabled={availableUniversities.length === 0}
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
              Carregando notas de corte oficiais...
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
                Sem notas de corte oficiais para “{selectedModalityLabel}”.
              </p>
              <p className="text-[11px] font-medium text-text-secondary/70 mt-1">
                Os dados oficiais disponíveis hoje são de Ampla Concorrência.
              </p>
            </div>
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
                  Sem notas do TRI calculadas ainda — use “Simular notas” para estimar sua média.
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
