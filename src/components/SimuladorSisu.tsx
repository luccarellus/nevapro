import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles, SlidersHorizontal, RotateCcw
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
  cutoffFull: number;
  cutoffPvp: number;
  category: string;
  year?: number;
  edition?: string;
}

const FALLBACK_CATALOG: CourseEntry[] = [
  { course: 'Medicina', campus: 'Campus Praia Vermelha', university: 'UFRJ - Universidade Federal do Rio de Janeiro', degree: 'Bacharelado', cutoffFull: 795, cutoffPvp: 760, category: 'Saúde' },
  { course: 'Medicina', campus: 'Campus Darcy Ribeiro', university: 'UnB - Universidade de Brasília', degree: 'Bacharelado', cutoffFull: 790, cutoffPvp: 755, category: 'Saúde' },
  { course: 'Medicina', campus: 'Campus Saúde', university: 'UFMG - Universidade Federal de Minas Gerais', degree: 'Bacharelado', cutoffFull: 798, cutoffPvp: 762, category: 'Saúde' },
  { course: 'Medicina', campus: 'Campus Butantã', university: 'USP - Universidade de São Paulo', degree: 'Bacharelado', cutoffFull: 812, cutoffPvp: 775, category: 'Saúde' },
  { course: 'Medicina', campus: 'Campus Barbalha', university: 'UFCA - Universidade Federal do Cariri', degree: 'Bacharelado', cutoffFull: 778, cutoffPvp: 742, category: 'Saúde' },

  { course: 'Direito', campus: 'Faculdade de Direito', university: 'USP - Universidade de São Paulo', degree: 'Bacharelado', cutoffFull: 770, cutoffPvp: 740, category: 'Humanas' },
  { course: 'Direito', campus: 'Faculdade Nacional de Direito', university: 'UFRJ - Universidade Federal do Rio de Janeiro', degree: 'Bacharelado', cutoffFull: 745, cutoffPvp: 710, category: 'Humanas' },
  { course: 'Direito', campus: 'Campus Pampulha', university: 'UFMG - Universidade Federal de Minas Gerais', degree: 'Bacharelado', cutoffFull: 752, cutoffPvp: 718, category: 'Humanas' },

  { course: 'Engenharia de Computação', campus: 'Campus Barão Geraldo', university: 'UNICAMP - Universidade Estadual de Campinas', degree: 'Bacharelado', cutoffFull: 748, cutoffPvp: 712, category: 'Exatas' },
  { course: 'Engenharia de Computação', campus: 'Campus Politécnica', university: 'USP - Universidade de São Paulo', degree: 'Bacharelado', cutoffFull: 780, cutoffPvp: 745, category: 'Exatas' },
  { course: 'Ciência da Computação', campus: 'Campus Pampulha', university: 'UFMG - Universidade Federal de Minas Gerais', degree: 'Bacharelado', cutoffFull: 735, cutoffPvp: 700, category: 'Exatas' },
  { course: 'Ciência da Computação', campus: 'Campus Ilha do Fundão', university: 'UFRJ - Universidade Federal do Rio de Janeiro', degree: 'Bacharelado', cutoffFull: 742, cutoffPvp: 708, category: 'Exatas' },

  { course: 'Psicologia', campus: 'Campus Pampulha', university: 'UFMG - Universidade Federal de Minas Gerais', degree: 'Bacharelado', cutoffFull: 718, cutoffPvp: 685, category: 'Humanas' },
  { course: 'Psicologia', campus: 'Campus Praia Vermelha', university: 'UFRJ - Universidade Federal do Rio de Janeiro', degree: 'Bacharelado', cutoffFull: 724, cutoffPvp: 690, category: 'Humanas' },

  { course: 'Odontologia', campus: 'Campus Araçatuba', university: 'UNESP - Universidade Estadual Paulista', degree: 'Bacharelado', cutoffFull: 705, cutoffPvp: 672, category: 'Saúde' },
  { course: 'Odontologia', campus: 'Campus Butantã', university: 'USP - Universidade de São Paulo', degree: 'Bacharelado', cutoffFull: 740, cutoffPvp: 708, category: 'Saúde' },

  { course: 'Administração', campus: 'Campus Curitiba', university: 'UFPR - Universidade Federal do Paraná', degree: 'Bacharelado', cutoffFull: 660, cutoffPvp: 625, category: 'Humanas' },
  { course: 'Enfermagem', campus: 'Campus Canela', university: 'UFBA - Universidade Federal da Bahia', degree: 'Bacharelado', cutoffFull: 668, cutoffPvp: 632, category: 'Saúde' },
  { course: 'Arquitetura e Urbanismo', campus: 'Campus Ilha do Fundão', university: 'UFRJ - Universidade Federal do Rio de Janeiro', degree: 'Bacharelado', cutoffFull: 712, cutoffPvp: 680, category: 'Exatas' },
];

export default function SimuladorSisu({ user }: SimuladorProps) {
  const [coursesCatalog, setCoursesCatalog] = useState<CourseEntry[]>(FALLBACK_CATALOG);
  const [selectedCourseName, setSelectedCourseName] = useState('Medicina');
  const [selectedUniversity, setSelectedUniversity] = useState('');
  const [selectedModality, setSelectedModality] = useState('Ampla concorrência');
  const [isSimulating, setIsSimulating] = useState(false);

  // Notas por área
  const [scores, setScores] = useState({
    linguagens: 680,
    humanas: 710,
    natureza: 640,
    matematica: 610,
    redacao: 760,
  });

  // Tenta sincronizar notas reais calculadas pelo TRI no backend caso o aluno tenha dados
  useEffect(() => {
    let active = true;
    const loadRealScores = async () => {
      try {
        const triData = await performanceService.getTriScores();
        if (active && triData?.latest_score) {
          const s = triData.latest_score;
          setScores(prev => ({
            linguagens: s.languages_score ? Math.round(s.languages_score) : prev.linguagens,
            humanas: s.humanities_score ? Math.round(s.humanities_score) : prev.humanas,
            natureza: s.nature_score ? Math.round(s.nature_score) : prev.natureza,
            matematica: s.math_score ? Math.round(s.math_score) : prev.matematica,
            redacao: prev.redacao,
          }));
        }
      } catch {
        // Usa as notas modelo padrão
      }
    };
    loadRealScores();
    return () => { active = false; };
  }, [user.email]);

  // Carrega lista oficial de notas da API se disponível
  useEffect(() => {
    let active = true;
    const fetchCutoffs = async () => {
      try {
        const res = await fetch('/api/sisu/cutoffs?modality=Ampla%20Concorr%C3%AAncia&limit=300');
        if (res.ok) {
          const data = await res.json();
          if (active && data.cutoffs && data.cutoffs.length > 0) {
            const mapped: CourseEntry[] = data.cutoffs.map((c: any) => ({
              course: c.course,
              campus: c.campus || 'Campus Principal',
              university: c.university,
              degree: c.degree || 'Bacharelado',
              cutoffFull: Math.round(c.cutoff),
              cutoffPvp: Math.round(c.cutoff * 0.955),
              category: 'Geral',
              year: c.year,
              edition: c.edition,
            }));
            setCoursesCatalog(mapped);
          }
        }
      } catch {
        // Fallback silencioso para o catálogo curado
      }
    };
    fetchCutoffs();
    return () => { active = false; };
  }, []);

  // Cursos únicos disponíveis
  const availableCourses = useMemo(() => {
    const list = Array.from(new Set(coursesCatalog.map(c => c.course)));
    return list.sort((a, b) => a.localeCompare(b));
  }, [coursesCatalog]);

  // Universidades disponíveis para o curso selecionado
  const availableUniversities = useMemo(() => {
    const matching = coursesCatalog.filter(
      c => c.course.toLowerCase() === selectedCourseName.toLowerCase()
    );
    const set = new Set(matching.map(c => c.university));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [coursesCatalog, selectedCourseName]);

  // Entrada de curso selecionada
  const activeCourseEntry = useMemo(() => {
    if (!selectedUniversity) return null;
    return coursesCatalog.find(
      c =>
        c.course.toLowerCase() === selectedCourseName.toLowerCase() &&
        c.university.toLowerCase() === selectedUniversity.toLowerCase()
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

  // Nota de corte efetiva baseada na modalidade
  const effectiveCutoff = useMemo(() => {
    if (!activeCourseEntry) return null;
    if (selectedModality === 'Ampla concorrência') {
      return activeCourseEntry.cutoffFull;
    }
    // Cotas (EP/PPI/Renda) historicamente têm corte um pouco mais suave
    return activeCourseEntry.cutoffPvp;
  }, [activeCourseEntry, selectedModality]);

  const diffPoints = effectiveCutoff !== null ? userAverage - effectiveCutoff : null;
  const missingPoints = diffPoints !== null ? Math.max(0, -diffPoints) : null;

  // Dica dinâmica do Professor IA baseada nas menores notas
  const aiTip = useMemo(() => {
    const entries = [
      { name: 'Matemática', score: scores.matematica },
      { name: 'Natureza', score: scores.natureza },
      { name: 'Linguagens', score: scores.linguagens },
      { name: 'Humanas', score: scores.humanas },
      { name: 'Redação', score: scores.redacao },
    ];
    entries.sort((a, b) => a.score - b.score);
    const lowestOne = entries[0].name;
    const lowestTwo = entries[1].name;
    return `foque em ${lowestOne} e ${lowestTwo} para encurtar a distância.`;
  }, [scores]);

  const handleScoreChange = (area: keyof typeof scores, val: number) => {
    const clamped = Math.max(0, Math.min(1000, val));
    setScores(prev => ({ ...prev, [area]: clamped }));
  };

  const handleResetScores = () => {
    setScores({
      linguagens: 680,
      humanas: 710,
      natureza: 640,
      matematica: 610,
      redacao: 760,
    });
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
                  list="courses-options"
                  value={selectedCourseName}
                  onChange={(e) => {
                    setSelectedCourseName(e.target.value);
                    setSelectedUniversity('');
                  }}
                  placeholder="Ex: Medicina"
                  className="w-full bg-[#0a0f1d] border border-border-color rounded-xl px-4 py-3 text-text-main font-semibold text-sm focus:outline-none focus:border-brand-primary/60 transition-all placeholder:text-text-secondary/40"
                />
                <datalist id="courses-options">
                  {availableCourses.map((c) => (
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
                onChange={(e) => setSelectedUniversity(e.target.value)}
                className="w-full bg-[#0a0f1d] border border-border-color rounded-xl px-4 py-3 text-text-main font-semibold text-sm focus:outline-none focus:border-brand-primary/60 transition-all cursor-pointer"
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
                onChange={(e) => setSelectedModality(e.target.value)}
                className="w-full bg-[#0a0f1d] border border-border-color rounded-xl px-4 py-3 text-text-main font-semibold text-sm focus:outline-none focus:border-brand-primary/60 transition-all cursor-pointer"
              >
                <option value="Ampla concorrência">Ampla concorrência</option>
                <option value="Cotas - Escola Pública">Cotas - Escola Pública (L1/L5)</option>
                <option value="Cotas - PPI / Renda">Cotas - PPI / Renda (L2/L6)</option>
                <option value="Cotas - PCD">Cotas - PCD</option>
              </select>
            </div>
          </div>
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
                {effectiveCutoff !== null ? `${effectiveCutoff.toFixed(1)}` : '[000,0]'}
              </h2>
            </div>

            {/* Pill de status */}
            <div className="mt-8">
              {!selectedUniversity ? (
                <div className="w-full py-3.5 px-4 rounded-2xl bg-text-main/5 border border-border-color text-text-secondary font-bold text-xs sm:text-sm text-center">
                  Escolha uma universidade acima
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
                          min="300"
                          max="1000"
                          step="5"
                          value={item.score}
                          onChange={(e) => handleScoreChange(item.key as keyof typeof scores, Number(e.target.value))}
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
                    <RotateCcw size={12} /> Restaurar notas padrão
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
