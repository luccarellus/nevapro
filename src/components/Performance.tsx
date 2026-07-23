import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { UserProfile } from '../types';
import { 
  TrendingUp, AlertTriangle, ArrowUpRight, Sparkles, 
  ArrowRight, ShieldCheck, Zap
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { performanceService, TriScore, SubjectMastery, MasteryEvolution } from '../services/performanceService';

interface PerformanceProps {
  user: UserProfile;
  onTabChange?: (tab: string) => void;
}

export default function Performance({ user, onTabChange }: PerformanceProps) {
  const [latestTriScore, setLatestTriScore] = useState<TriScore | null>(null);
  const [triTarget, setTriTarget] = useState(750);
  const [stats, setStats] = useState({ hit_rate: 0, answered: 0, correct: 0, xp: 0 });
  const [subjectsMastery, setSubjectsMastery] = useState<SubjectMastery[]>([]);
  const [evolution, setEvolution] = useState<MasteryEvolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setTriTarget(triData.tri_target);
        setStats(triData.stats);
        setSubjectsMastery(masteryData.subjects);
        setEvolution(masteryData.evolution);
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

  // Build evolution chart data
  const evolutionData = evolution.length > 0
    ? evolution
    : [
        { label: 'Início', precision: 50, day: null },
        { label: 'Hoje', precision: stats.hit_rate || 50, day: null },
      ];

  // Group subjects by category for the heatmap
  const groupedSubjects = subjectsMastery.reduce<Record<string, SubjectMastery[]>>((acc, subject) => {
    if (!acc[subject.category]) acc[subject.category] = [];
    acc[subject.category].push(subject);
    return acc;
  }, {});

  // Find critical subjects for the spaced repetition warning
  const criticalSubjects = subjectsMastery.filter(s => s.level === 'critical');
  const totalCriticalQuestions = criticalSubjects.reduce((sum, s) => sum + (s.total || 0), 0);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  // Calculate 7-day trend
  const trendPts = evolution.length >= 2
    ? evolution.slice(-2)
    : null;
  const trendDiff = trendPts && trendPts.length === 2
    ? trendPts[1].precision - trendPts[0].precision
    : 0;

  return (
    <div className="max-w-6xl mx-auto pt-24 pb-32 px-4 md:px-8">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <header className="mb-10 md:mb-14">
          <motion.div variants={itemVariants}>
            <div className="flex items-center gap-3 text-emerald-400 text-xs font-bold mb-3 uppercase tracking-wider">
              <TrendingUp size={16} /> Central de Desempenho & Inteligência TRI
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-text-main leading-tight">
              Sua evolução em <span className="text-emerald-400">dados reais</span>
            </h1>
            <p className="text-text-secondary text-xs md:text-sm font-medium mt-2 max-w-xl">
              Análise contínua do seu desempenho no ENEM, projeção de nota TRI e diagnóstico por assuntos.
            </p>
          </motion.div>
        </header>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-400" />
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <motion.div variants={itemVariants} className="text-center py-20 bg-rose-500/5 border border-rose-500/20 rounded-[40px]">
            <p className="text-rose-400 font-bold text-lg">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 text-sm font-bold text-emerald-400 hover:text-emerald-300 underline"
            >
              Tentar novamente
            </button>
          </motion.div>
        )}

        {/* Main Content */}
        {!loading && !error && (
          <>
            {/* Top Grid: TRI Score Card + 30 Days Evolution */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10">
              {/* Estimated TRI Score Card (5 cols) */}
              <motion.div 
                variants={itemVariants}
                className="lg:col-span-5 bg-gradient-to-br from-emerald-950/40 via-bg-card/60 to-bg-card/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-6 md:p-8 border border-emerald-500/30 shadow-2xl relative overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">Métrica ENEM</span>
                      <h3 className="text-xl font-black text-text-main">Nota TRI Estimada</h3>
                    </div>
                    {trendDiff !== 0 && (
                      <span className={`${trendDiff > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'} border ${trendDiff > 0 ? 'border-emerald-500/30' : 'border-rose-500/30'} px-3 py-1 rounded-full text-xs font-black flex items-center gap-1`}>
                        <ArrowUpRight size={14} className={trendDiff < 0 ? 'rotate-90' : ''} /> {trendDiff > 0 ? '+' : ''}{trendDiff} pts
                      </span>
                    )}
                  </div>

                  <div className="mb-8">
                    <p className="text-6xl md:text-7xl font-black text-text-main tracking-tighter leading-none mb-2">
                      {estimatedTri > 0 ? estimatedTri : '---'}
                    </p>
                    <p className="text-xs font-semibold text-text-secondary opacity-70">
                      {estimatedTri > 0
                        ? 'Calculada com base na coerência pedagógica dos seus simulados e questões.'
                        : 'Responda questões para gerar sua estimativa TRI.'}
                    </p>
                  </div>
                </div>

                <div className="bg-bg-main/50 p-4 rounded-2xl border border-border-color/40">
                  <div className="flex justify-between items-center text-xs font-bold mb-2">
                    <span className="text-text-secondary opacity-70">Rumo à meta ({triTarget}+)</span>
                    <span className="text-emerald-400 font-black">{triProgress}%</span>
                  </div>
                  <div className="h-2.5 bg-bg-main rounded-full overflow-hidden p-0.5">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${triProgress}%` }}
                      transition={{ duration: 1.2 }}
                      className="h-full bg-gradient-to-r from-emerald-500 to-brand-primary rounded-full shadow-[0_0_12px_rgba(52,211,153,0.4)]"
                    />
                  </div>
                </div>
              </motion.div>

              {/* 30-Day Evolution Chart (7 cols) */}
              <motion.div 
                variants={itemVariants}
                className="lg:col-span-7 bg-bg-card/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-6 md:p-8 border border-border-color shadow-2xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block mb-1">
                        {evolution.length > 0 ? 'Evolução Contínua' : 'Últimos 30 Dias'}
                      </span>
                      <h3 className="text-2xl font-black text-text-main tracking-tight">Evolução de Precisão</h3>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-text-secondary opacity-60">Taxa de Acertos</span>
                      <p className="text-lg font-black text-emerald-400">{stats.hit_rate}%</p>
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={evolutionData}>
                        <defs>
                          <linearGradient id="colorPrec" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#34d399" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="0" stroke="var(--text-main)" strokeOpacity={0.05} vertical={false} />
                        <XAxis 
                          dataKey="label" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 'bold'}}
                        />
                        <YAxis hide domain={[30, 100]} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'var(--bg-sidebar)', 
                            border: '1px solid var(--border-color)', 
                            borderRadius: '16px',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                            color: 'var(--text-main)'
                          }}
                          itemStyle={{ color: '#34d399', fontWeight: '900', fontSize: '14px' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="precision" 
                          stroke="#34d399" 
                          strokeWidth={3} 
                          fillOpacity={1} 
                          fill="url(#colorPrec)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border-color/30">
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-text-secondary opacity-60">Respondidas</p>
                    <p className="text-lg font-black text-text-main">{stats.answered}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-text-secondary opacity-60">Acertos</p>
                    <p className="text-lg font-black text-emerald-400">{stats.correct}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-text-secondary opacity-60">Precisão</p>
                    <p className="text-lg font-black text-text-main">{stats.hit_rate}%</p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Second Row: Subject Heatmap & Spaced Repetition Warning */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10">
              {/* Subject Heatmap (8 cols) */}
              <motion.div 
                variants={itemVariants}
                className="lg:col-span-8 bg-bg-card/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-6 md:p-8 border border-border-color shadow-2xl"
              >
                <div className="mb-6">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block mb-1">Mapa dos Assuntos</span>
                  <h3 className="text-2xl font-black text-text-main tracking-tight">Nível de Domínio por Conteúdo</h3>
                </div>

                {subjectsMastery.length === 0 ? (
                  <div className="py-12 text-center bg-bg-main/30 border border-dashed border-border-color rounded-3xl">
                    <p className="text-text-secondary font-bold text-sm">Nenhum dado de assunto disponível</p>
                    <p className="text-text-secondary text-xs mt-2 opacity-60">Responda questões para ver seu nível de domínio.</p>
                    <button
                      onClick={() => onTabChange?.('questions')}
                      className="mt-4 bg-emerald-500/10 text-emerald-400 font-bold text-xs px-6 py-3 rounded-xl border border-emerald-500/30 hover:bg-emerald-500/20 transition-all"
                    >
                      Responder questões
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedSubjects).map(([category, items]) => (
                      <div key={category} className="space-y-3">
                        <p className="text-xs font-bold text-text-secondary opacity-60 uppercase tracking-wider">{category}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {items.map((item, i) => {
                            const isHigh = item.level === 'high';
                            const isMed = item.level === 'medium';
                            return (
                              <div 
                                key={i} 
                                className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                                  isHigh 
                                    ? 'bg-emerald-500/10 border-emerald-500/30' 
                                    : isMed 
                                    ? 'bg-amber-500/10 border-amber-500/30' 
                                    : 'bg-rose-500/10 border-rose-500/30'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <span className={`w-3 h-3 rounded-full ${
                                    isHigh ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : isMed ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                                  }`} />
                                  <span className="text-xs font-bold text-text-main">{item.name}</span>
                                  <span className="text-[9px] font-semibold text-text-secondary opacity-40">({item.total}q)</span>
                                </div>
                                <span className={`text-xs font-black ${
                                  isHigh ? 'text-emerald-400' : isMed ? 'text-amber-400' : 'text-rose-400'
                                }`}>
                                  {item.percentage}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Right Column: Spaced Repetition & Tutor Diagnosis (4 cols) */}
              <div className="lg:col-span-4 space-y-6">
                {/* Spaced Repetition Warning */}
                {criticalSubjects.length > 0 && (
                  <motion.div 
                    variants={itemVariants}
                    className="bg-amber-950/20 border border-amber-500/30 rounded-3xl md:rounded-[40px] p-6 backdrop-blur-xl"
                  >
                    <div className="flex items-center gap-3 mb-3 text-amber-400">
                      <AlertTriangle size={20} />
                      <h4 className="text-sm font-black uppercase tracking-wider">⚠️ Precisa de atenção</h4>
                    </div>
                    <p className="text-xs font-bold text-text-main mb-1">Revisões pendentes</p>
                    <p className="text-xs font-medium text-text-secondary opacity-80 mb-4">
                      {criticalSubjects.map(s => s.name).join(', ')} — {totalCriticalQuestions} questões com desempenho abaixo de 50%.
                    </p>
                    <button 
                      onClick={() => onTabChange?.('errors')}
                      className="w-full bg-amber-500 text-black font-black text-xs py-3.5 rounded-2xl shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-all flex items-center justify-center gap-2"
                    >
                      Revisar agora <ArrowRight size={14} />
                    </button>
                  </motion.div>
                )}

                {/* Empty state when no critical subjects */}
                {criticalSubjects.length === 0 && stats.answered > 0 && (
                  <motion.div 
                    variants={itemVariants}
                    className="bg-emerald-950/20 border border-emerald-500/30 rounded-3xl md:rounded-[40px] p-6 backdrop-blur-xl"
                  >
                    <div className="flex items-center gap-3 mb-3 text-emerald-400">
                      <ShieldCheck size={20} />
                      <h4 className="text-sm font-black uppercase tracking-wider">✅ Tudo em dia!</h4>
                    </div>
                    <p className="text-xs font-medium text-text-secondary leading-relaxed">
                      Seu desempenho está equilibrado. Continue praticando para manter o ritmo.
                    </p>
                  </motion.div>
                )}

                {/* Onboarding state for new users */}
                {stats.answered === 0 && (
                  <motion.div 
                    variants={itemVariants}
                    className="bg-indigo-950/20 border border-indigo-500/30 rounded-3xl md:rounded-[40px] p-6 backdrop-blur-xl"
                  >
                    <div className="flex items-center gap-3 mb-3 text-indigo-400">
                      <TrendingUp size={20} />
                      <h4 className="text-sm font-black uppercase tracking-wider">📊 Comece agora!</h4>
                    </div>
                    <p className="text-xs font-medium text-text-secondary leading-relaxed mb-4">
                      Responda suas primeiras questões para começarmos a analisar seu desempenho e identificar seus pontos fortes.
                    </p>
                    <button 
                      onClick={() => onTabChange?.('questions')}
                      className="w-full bg-indigo-500 text-white font-black text-xs py-3.5 rounded-2xl shadow-lg shadow-indigo-500/20 hover:bg-indigo-400 transition-all flex items-center justify-center gap-2"
                    >
                      Responder questões <ArrowRight size={14} />
                    </button>
                  </motion.div>
                )}

                {/* AI Tutor Diagnostic Analysis */}
                <motion.div 
                  variants={itemVariants}
                  className="bg-bg-card/40 border border-border-color rounded-3xl md:rounded-[40px] p-6 backdrop-blur-xl"
                >
                  <div className="flex items-center gap-2 text-brand-primary text-xs font-bold uppercase tracking-wider mb-3">
                    <Sparkles size={16} /> Análise IA • Professor Virtual
                  </div>
                  <div className="space-y-3 text-xs font-medium text-text-secondary leading-relaxed mb-4">
                    {stats.answered > 0 ? (
                      <>
                        <p>
                          {stats.hit_rate >= 70
                            ? `Continue assim! Sua precisão de ${stats.hit_rate}% mostra que você está no caminho certo.`
                            : stats.hit_rate >= 50
                            ? `Seu desempenho está evoluindo com ${stats.hit_rate}% de acertos. Foque nos assuntos com desempenho crítico para acelerar.`
                            : `Você está no início da jornada com ${stats.hit_rate}% de acertos. O importante é manter a consistência!`}
                        </p>
                        {criticalSubjects.length > 0 && (
                          <>
                            <p className="text-text-main font-bold">Minha sugestão:</p>
                            <ul className="space-y-1.5 list-disc list-inside text-text-secondary opacity-90">
                              <li>Resolver {Math.min(25, totalCriticalQuestions + 10)} questões de {criticalSubjects[0].name}</li>
                              <li>Revisar a teoria dos assuntos com menor desempenho</li>
                              <li>Fazer mini simulado de fixação</li>
                            </ul>
                          </>
                        )}
                      </>
                    ) : (
                      <p>
                        Comece a responder questões para que eu possa analisar seu desempenho e dar recomendações personalizadas!
                      </p>
                    )}
                  </div>

                  <button 
                    onClick={() => onTabChange?.('questions')}
                    className="w-full bg-text-main/5 hover:bg-text-main/10 text-text-main font-bold text-xs py-3 rounded-xl border border-border-color transition-colors flex items-center justify-center gap-2"
                  >
                    {stats.answered > 0 ? 'Executar recomendação' : 'Começar agora'} <Zap size={14} className="text-brand-primary" />
                  </button>
                </motion.div>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
