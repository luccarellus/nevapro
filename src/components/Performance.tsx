import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';
import {
  TrendingUp, AlertTriangle, ArrowUpRight, Sparkles,
  ArrowRight, CheckCircle2, Zap, Target, Search,
  Award, Activity, Calculator, Atom, Globe, Languages,
  BarChart3, PieChart as PieChartIcon, ShieldCheck, Filter,
  BookOpen, Check, X
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';
import { performanceService, TriScore, SubjectMastery, MasteryEvolution } from '../services/performanceService';
import Spinner from './Spinner';

interface PerformanceProps {
  user: UserProfile;
  onTabChange?: (tab: string) => void;
}

// Semicircular Gauge Meter Component matching reference image
function SemicircleGauge({
  value,
  max = 1000,
  label,
  color = '#34d399',
  icon: Icon
}: {
  value: number;
  max?: number;
  label: string;
  color?: string;
  icon?: any;
}) {
  const percentage = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  const radius = 38;
  const strokeWidth = 7;
  const arcLength = Math.PI * radius; // 180 degrees arc length

  return (
    <div className="bg-bg-card/90 backdrop-blur-xl p-4 rounded-2xl border border-border-color/60 flex flex-col items-center justify-between transition-all hover:border-brand-primary/40 shadow-sm">
      <div className="flex items-center gap-1.5 mb-2 w-full justify-center">
        {Icon && <Icon size={15} style={{ color }} />}
        <span className="text-xs font-black text-text-main truncate max-w-[140px] tracking-tight">{label}</span>
      </div>

      <div className="relative w-32 h-20 flex items-end justify-center">
        <svg className="w-32 h-32 transform -rotate-180 overflow-visible" viewBox="0 0 100 100">
          {/* Background Track Arc */}
          <path
            d="M 12,50 A 38,38 0 0,1 88,50"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeOpacity={0.2}
          />
          {/* Foreground Progress Arc */}
          <path
            d="M 12,50 A 38,38 0 0,1 88,50"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={arcLength}
            strokeDashoffset={(1 - (percentage / 100)) * arcLength}
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        <div className="absolute bottom-1 text-center">
          <span className="text-2xl font-black text-text-main leading-none block tracking-tight">
            {value > 0 ? value : '---'}
          </span>
          <span className="text-[10px] font-extrabold text-text-secondary">
            {value > 0 ? `meta ${max}` : 'sem dados'}
          </span>
        </div>
      </div>

      <div className="w-full flex justify-between items-center text-[10px] font-black text-text-secondary mt-2 px-2 border-t border-border-color/40 pt-2">
        <span>0</span>
        <span className="font-black text-xs" style={{ color }}>{value > 0 ? `${percentage}%` : '0%'}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export default function Performance({ user, onTabChange }: PerformanceProps) {
  const [latestTriScore, setLatestTriScore] = useState<TriScore | null>(null);
  const [triTarget, setTriTarget] = useState(750);
  const [stats, setStats] = useState({ hit_rate: 0, answered: 0, correct: 0, xp: 0 });
  const [subjectsMastery, setSubjectsMastery] = useState<SubjectMastery[]>([]);
  const [evolution, setEvolution] = useState<MasteryEvolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculatingTri, setCalculatingTri] = useState(false);
  const [triCalculationMessage, setTriCalculationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search States
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      if (!user.email) return;
      setLoading(true);
      setError(null);
      try {
        const [triData, masteryData] = await Promise.all([
          performanceService.getTriScores(),
          performanceService.getSubjectMastery(),
        ]);

        setLatestTriScore(triData.latest_score);
        setTriTarget(triData.tri_target || 750);
        setStats(triData.stats || { hit_rate: 0, answered: 0, correct: 0, xp: 0 });
        setSubjectsMastery(masteryData.subjects || []);
        setEvolution(masteryData.evolution || []);

        // Auto-trigger TRI calculation based on latest answers
        setCalculatingTri(true);
        try {
          const triResult = await performanceService.calculateTri();
          if (triResult.calculated && triResult.overall) {
            setLatestTriScore({
              id: triResult.overall.id,
              estimated_score: triResult.overall.estimated_score,
              math_score: triResult.by_subject?.math_score || null,
              nature_score: triResult.by_subject?.nature_score || null,
              humanities_score: triResult.by_subject?.humanities_score || null,
              languages_score: triResult.by_subject?.languages_score || null,
              calculated_at: triResult.overall.calculated_at,
            });
          } else if (triResult.reason) {
            setTriCalculationMessage(triResult.reason);
          }
        } catch (calcErr) {
          console.error('[Performance] Erro no cálculo TRI:', calcErr);
        } finally {
          setCalculatingTri(false);
        }
      } catch (err) {
        console.error('[Performance] Erro ao carregar dados:', err);
        setError('Não foi possível carregar seus dados de desempenho.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.email]);

  const estimatedTri = latestTriScore?.estimated_score || 0;
  const triGoal = triTarget || 750;
  const triProgress = triGoal > 0 ? Math.min(100, Math.round((estimatedTri / triGoal) * 100)) : 0;

  // Categories list for filtering
  const categoriesList = useMemo(() => {
    const cats = Array.from(new Set(subjectsMastery.map(s => s.category))).filter(Boolean);
    return ['all', ...cats];
  }, [subjectsMastery]);

  // Filtered subjects for table
  const filteredSubjects = useMemo(() => {
    return subjectsMastery.filter(item => {
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const matchesSearch = !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [subjectsMastery, selectedCategory, searchTerm]);

  // Donut Chart Data (Domain Mastery levels)
  const masteryDistributionData = useMemo(() => {
    const high = subjectsMastery.filter(s => s.level === 'high').length;
    const medium = subjectsMastery.filter(s => s.level === 'medium').length;
    const critical = subjectsMastery.filter(s => s.level === 'critical').length;

    if (high === 0 && medium === 0 && critical === 0) {
      return [
        { name: 'Sem dados', value: 1, color: 'var(--border-color)' }
      ];
    }

    return [
      { name: 'Dominado (≥ 70%)', value: high, color: '#34d399' },
      { name: 'Em Progresso (50-69%)', value: medium, color: '#fbbf24' },
      { name: 'Atenção (< 50%)', value: critical, color: '#c9636c' }
    ].filter(item => item.value > 0);
  }, [subjectsMastery]);

  // Bar Chart Data (Correct vs Incorrect by Area)
  const areaBarData = useMemo(() => {
    const areaStats: Record<string, { correct: number; incorrect: number }> = {
      'Matemática': { correct: 0, incorrect: 0 },
      'Ciências da Natureza': { correct: 0, incorrect: 0 },
      'Ciências Humanas': { correct: 0, incorrect: 0 },
      'Linguagens': { correct: 0, incorrect: 0 }
    };

    subjectsMastery.forEach(sub => {
      const catKey = areaStats[sub.category] ? sub.category : 'Outros';
      if (!areaStats[catKey]) {
        areaStats[catKey] = { correct: 0, incorrect: 0 };
      }
      areaStats[catKey].correct += sub.correct || 0;
      areaStats[catKey].incorrect += Math.max(0, (sub.total || 0) - (sub.correct || 0));
    });

    return Object.entries(areaStats).map(([area, data]) => ({
      name: area.replace('Ciências da ', '').replace(' e suas Tecnologias', ''),
      Corretas: data.correct,
      Incorretas: data.incorrect
    }));
  }, [subjectsMastery]);

  // Critical subjects for alert
  const criticalSubjects = useMemo(() => subjectsMastery.filter(s => s.level === 'critical'), [subjectsMastery]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  return (
    <div className="max-w-7xl mx-auto pt-6 pb-24 px-4 md:px-8">
      <motion.div variants={containerVariants} initial="hidden" animate="visible">
        
        {/* Main Header inspired by Dashboard Title */}
        <header className="mb-8 border-b border-border-color/30 pb-6">
          <motion.div variants={itemVariants} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black uppercase tracking-wider mb-2">
                <TrendingUp size={14} /> Relatório Acadêmico Individual
              </div>
              <h1 className="text-2xl md:text-4xl font-black text-text-main tracking-tight">
                Painel de pontuação e avaliação de desempenho do aluno
              </h1>
              <p className="text-text-secondary text-xs md:text-sm font-medium mt-1">
                Visualização consolidada do seu aprendizado no ENEM, notas por área e raio-x por assuntos.
              </p>
            </div>

            {/* Student Info Badge */}
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-bg-card/60 border border-border-color/40">
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-brand-primary flex items-center justify-center text-white font-black text-sm">
                {user.avatarUrl || user.avatar ? (
                  <img src={user.avatarUrl || user.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  user.name?.charAt(0)?.toUpperCase() || 'A'
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-text-main truncate max-w-[150px]">{user.name || 'Aluno Neva'}</p>
                <p className="text-[10px] font-semibold text-emerald-400">Nível {user.level || 1} • {stats.xp} XP</p>
              </div>
            </div>
          </motion.div>
        </header>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24">
            <Spinner size={44} className="text-emerald-400 mb-4" />
            <p className="text-xs font-bold text-text-secondary uppercase tracking-widest animate-pulse">Carregando métricas do painel...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <motion.div variants={itemVariants} className="text-center py-16 px-6 bg-rose-500/5 border border-rose-500/20 rounded-[32px]">
            <AlertTriangle className="mx-auto mb-4 text-rose-500" size={40} />
            <p className="text-rose-400 font-bold text-base md:text-lg mb-2">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 text-xs font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 underline"
            >
              Tentar novamente
            </button>
          </motion.div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LEFT COLUMN: Average Subject Score Gauges (3 cols on desktop) */}
            <motion.div variants={itemVariants} className="lg:col-span-3 space-y-4">
              <div className="bg-bg-card/50 backdrop-blur-xl rounded-[28px] p-5 border border-border-color/40 shadow-xl">
                <div className="mb-4 pb-3 border-b border-border-color/30">
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block">Média por Área</span>
                  <h3 className="text-base font-black text-text-main tracking-tight">Pontuação do Aluno</h3>
                </div>

                <div className="space-y-4">
                  <SemicircleGauge
                    label="Matemática"
                    value={latestTriScore?.math_score || 0}
                    max={1000}
                    color="#38bdf8"
                    icon={Calculator}
                  />

                  <SemicircleGauge
                    label="Ciências da Natureza"
                    value={latestTriScore?.nature_score || 0}
                    max={1000}
                    color="#34d399"
                    icon={Atom}
                  />

                  <SemicircleGauge
                    label="Ciências Humanas"
                    value={latestTriScore?.humanities_score || 0}
                    max={1000}
                    color="#fbbf24"
                    icon={Globe}
                  />

                  <SemicircleGauge
                    label="Linguagens"
                    value={latestTriScore?.languages_score || 0}
                    max={1000}
                    color="#c084fc"
                    icon={Languages}
                  />
                </div>
              </div>
            </motion.div>

            {/* CENTER COLUMN: Top KPIs + Donut Chart + Bar Chart (5 cols on desktop) */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Top KPI Cards (TRI Score & Attendance / Hit Rate) */}
              <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-brand-primary/10 via-bg-card to-bg-card p-4 rounded-2xl border border-brand-primary/30 flex flex-col justify-between shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black text-brand-primary uppercase tracking-wider">Nota TRI Geral</span>
                    <Target size={17} className="text-brand-primary" />
                  </div>
                  <p className="text-3xl font-black text-text-main tracking-tight">
                    {calculatingTri ? '...' : estimatedTri > 0 ? estimatedTri : '---'}
                  </p>
                  <span className="text-xs font-bold text-text-secondary mt-1">
                    Meta: {triTarget} pts
                  </span>
                </div>

                <div className="bg-bg-card p-4 rounded-2xl border border-border-color/60 flex flex-col justify-between shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black text-text-secondary uppercase tracking-wider">Precisão Geral</span>
                    <Activity size={17} className="text-brand-primary" />
                  </div>
                  <p className="text-3xl font-black text-brand-primary tracking-tight">{stats.hit_rate}%</p>
                  <span className="text-xs font-bold text-text-secondary mt-1">
                    {stats.answered} respondidas
                  </span>
                </div>
              </motion.div>

              {/* Donut Chart: Mastery Level Distribution */}
              <motion.div variants={itemVariants} className="bg-bg-card rounded-[28px] p-5 border border-border-color/60 shadow-sm">
                <div className="mb-3">
                  <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest block">Proporção Acadêmica</span>
                  <h3 className="text-base font-black text-text-main tracking-tight">Distribuição por Nível de Domínio</h3>
                </div>

                <div className="h-52 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={masteryDistributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {masteryDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '14px',
                          color: 'var(--text-main)',
                          fontWeight: 'bold',
                          boxShadow: 'var(--card-shadow)'
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconType="circle"
                        formatter={(val) => <span className="text-xs font-bold text-text-secondary">{val}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              {/* Bar Chart: Correct vs Incorrect by Area */}
              <motion.div variants={itemVariants} className="bg-bg-card rounded-[28px] p-5 border border-border-color/60 shadow-sm">
                <div className="mb-3">
                  <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest block">Resultados por Ramo</span>
                  <h3 className="text-base font-black text-text-main tracking-tight">Acertos vs Erros por Área</h3>
                </div>

                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={areaBarData}>
                      <CartesianGrid strokeDasharray="0" stroke="var(--text-secondary)" strokeOpacity={0.15} vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: '700' }} />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '14px',
                          color: 'var(--text-main)',
                          fontWeight: 'bold',
                          boxShadow: 'var(--card-shadow)'
                        }}
                      />
                      <Bar dataKey="Corretas" fill="#34d399" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="Incorretas" fill="#c9636c" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

            </div>

            {/* RIGHT COLUMN: Student Details Table & AI Tutor Diagnostics (4 cols on desktop) */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Spaced Repetition / Critical Warning */}
              {criticalSubjects.length > 0 && (
                <motion.div variants={itemVariants} className="bg-amber-950/30 border border-amber-500/50 rounded-[28px] p-5 backdrop-blur-xl shadow-lg">
                  <div className="flex items-center gap-2 mb-2 text-amber-400">
                    <AlertTriangle size={17} />
                    <h4 className="text-xs font-black uppercase tracking-wider">Atenção Necessária</h4>
                  </div>
                  <p className="text-xs font-black text-text-main mb-1">Revisão Pendente</p>
                  <p className="text-xs font-semibold text-text-secondary mb-3 leading-relaxed">
                    {criticalSubjects.map(s => s.name).join(', ')} — desempenho abaixo de 50%.
                  </p>
                  <button
                    onClick={() => onTabChange?.('errors')}
                    className="w-full bg-amber-500 text-black font-black text-xs py-2.5 rounded-xl hover:bg-amber-400 transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    Revisar no Caderno de Erros <ArrowRight size={14} />
                  </button>
                </motion.div>
              )}

              {/* Table of Student Details (Detalhamento dos Tópicos) */}
              <motion.div variants={itemVariants} className="bg-bg-card/80 backdrop-blur-xl rounded-[28px] p-5 border border-border-color/60 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block">Histórico de Assuntos</span>
                      <h3 className="text-base font-black text-text-main tracking-tight">Detalhamento dos Tópicos</h3>
                    </div>
                  </div>

                  {/* Search and Filters */}
                  <div className="space-y-2 mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={14} />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Filtrar assunto..."
                        className="w-full bg-bg-main/80 border border-border-color/60 rounded-xl py-2 pl-9 pr-3 text-xs font-semibold text-text-main placeholder:text-text-secondary/70 focus:outline-none focus:border-emerald-500 transition-all"
                      />
                    </div>

                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
                      {categoriesList.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-3 py-1 rounded-lg text-[10px] font-black whitespace-nowrap transition-all cursor-pointer ${
                            selectedCategory === cat
                              ? 'bg-emerald-500 text-black font-black shadow-sm'
                              : 'bg-bg-main/60 text-text-secondary hover:text-text-main border border-border-color/40'
                          }`}
                        >
                          {cat === 'all' ? 'Todos' : cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Table View */}
                  <div className="max-h-[360px] overflow-y-auto custom-scrollbar border border-border-color/60 rounded-xl overflow-hidden shadow-inner">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-bg-main text-text-main uppercase text-[10px] font-black tracking-wider sticky top-0 backdrop-blur-md border-b border-border-color/40">
                        <tr>
                          <th className="p-3">Assunto</th>
                          <th className="p-3 text-center">Respostas</th>
                          <th className="p-3 text-right">Precisão</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-color/30 bg-bg-card/40">
                        {filteredSubjects.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="p-6 text-center text-text-secondary font-semibold">
                              Nenhum tópico encontrado.
                            </td>
                          </tr>
                        ) : (
                          filteredSubjects.map((item, idx) => {
                            const isHigh = item.level === 'high';
                            const isMed = item.level === 'medium';

                            return (
                              <tr key={idx} className="hover:bg-text-main/[0.04] transition-colors">
                                <td className="p-3">
                                  <p className="font-extrabold text-text-main line-clamp-1">{item.name}</p>
                                  <p className="text-[10px] font-bold text-text-secondary">{item.category}</p>
                                </td>
                                <td className="p-3 text-center font-extrabold text-text-main">
                                  {item.correct}/{item.total}
                                </td>
                                <td className="p-3 text-right">
                                  <span className={`font-black text-xs px-2.5 py-1 rounded-md inline-block ${
                                    isHigh ? 'bg-emerald-500/25 text-emerald-400 border border-emerald-500/30' : isMed ? 'bg-amber-500/25 text-amber-400 border border-amber-500/30' : 'bg-rose-500/25 text-rose-400 border border-rose-500/30'
                                  }`}>
                                    {item.percentage}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Direct CTA */}
                <button
                  onClick={() => onTabChange?.('questions')}
                  className="w-full mt-4 bg-emerald-500/15 hover:bg-emerald-500 hover:text-black text-emerald-400 font-black text-xs py-3 rounded-xl border border-emerald-500/40 transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  Praticar mais questões <Zap size={14} />
                </button>
              </motion.div>

            </div>

          </div>
        )}
      </motion.div>
    </div>
  );
}
