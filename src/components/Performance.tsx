import { motion } from 'motion/react';
import { UserProfile } from '../types';
import { 
  TrendingUp, AlertTriangle, ArrowUpRight, Sparkles, 
  ArrowRight, ShieldCheck, Zap
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PerformanceProps {
  user: UserProfile;
  onTabChange?: (tab: string) => void;
}

export default function Performance({ user, onTabChange }: PerformanceProps) {
  // Demo historical accuracy data for 30 days
  const evolutionData = [
    { day: '01 Jul', precision: 58 },
    { day: '05 Jul', precision: 61 },
    { day: '10 Jul', precision: 63 },
    { day: '15 Jul', precision: 60 },
    { day: '18 Jul', precision: 68 },
    { day: '21 Jul', precision: 71 },
    { day: 'Hoje', precision: 74 },
  ];

  const subjectsMastery = [
    {
      category: 'Matemática e Suas Tecnologias',
      items: [
        { name: 'Funções', level: 'high', percentage: 88 },
        { name: 'Progressão Aritmética', level: 'high', percentage: 82 },
        { name: 'Estatística', level: 'medium', percentage: 64 },
        { name: 'Geometria Espacial', level: 'critical', percentage: 42 },
        { name: 'Trigonometria', level: 'critical', percentage: 38 }
      ]
    },
    {
      category: 'Ciências da Natureza',
      items: [
        { name: 'Ecologia & Biomas', level: 'high', percentage: 91 },
        { name: 'Estequiometria', level: 'medium', percentage: 66 },
        { name: 'Cinemática', level: 'critical', percentage: 45 }
      ]
    }
  ];

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

  const estimatedTri = 638;
  const triGoal = 750;
  const triProgress = Math.min(100, Math.round((estimatedTri / triGoal) * 100));

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
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1">
                  <ArrowUpRight size={14} /> +18 pts 7d
                </span>
              </div>

              <div className="mb-8">
                <p className="text-6xl md:text-7xl font-black text-text-main tracking-tighter leading-none mb-2">
                  {estimatedTri}
                </p>
                <p className="text-xs font-semibold text-text-secondary opacity-70">
                  Calculada com base na coerência pedagógica dos seus simulados e questões.
                </p>
              </div>
            </div>

            <div className="bg-bg-main/50 p-4 rounded-2xl border border-border-color/40">
              <div className="flex justify-between items-center text-xs font-bold mb-2">
                <span className="text-text-secondary opacity-70">Rumo à meta (750+)</span>
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
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block mb-1">Últimos 30 Dias</span>
                  <h3 className="text-2xl font-black text-text-main tracking-tight">Evolução de Precisão</h3>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-text-secondary opacity-60">Taxa de Acertos</span>
                  <p className="text-lg font-black text-emerald-400">61% → 74%</p>
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
                      dataKey="day" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 'bold'}}
                    />
                    <YAxis hide domain={[40, 100]} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'var(--bg-sidebar)', 
                        border: '1px border var(--border-color)', 
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

            <div className="space-y-6">
              {subjectsMastery.map((cat, idx) => (
                <div key={idx} className="space-y-3">
                  <p className="text-xs font-bold text-text-secondary opacity-60 uppercase tracking-wider">{cat.category}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {cat.items.map((item, i) => {
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
          </motion.div>

          {/* Right Column: Spaced Repetition & Tutor Diagnosis (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Spaced Repetition Warning */}
            <motion.div 
              variants={itemVariants}
              className="bg-amber-950/20 border border-amber-500/30 rounded-3xl md:rounded-[40px] p-6 backdrop-blur-xl"
            >
              <div className="flex items-center gap-3 mb-3 text-amber-400">
                <AlertTriangle size={20} />
                <h4 className="text-sm font-black uppercase tracking-wider">⚠️ Você está esquecendo</h4>
              </div>
              <p className="text-xs font-bold text-text-main mb-1">Revisões pendentes da curva de esquecimento</p>
              <p className="text-xs font-medium text-text-secondary opacity-80 mb-4">
                Geografia, Biologia e Química acumularam <span className="text-amber-400 font-bold">12 questões</span> que precisam de revisão urgente.
              </p>
              <button 
                onClick={() => onTabChange?.('errors')}
                className="w-full bg-amber-500 text-black font-black text-xs py-3.5 rounded-2xl shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-all flex items-center justify-center gap-2"
              >
                Revisar agora <ArrowRight size={14} />
              </button>
            </motion.div>

            {/* AI Tutor Diagnostic Analysis */}
            <motion.div 
              variants={itemVariants}
              className="bg-bg-card/40 border border-border-color rounded-3xl md:rounded-[40px] p-6 backdrop-blur-xl"
            >
              <div className="flex items-center gap-2 text-brand-primary text-xs font-bold uppercase tracking-wider mb-3">
                <Sparkles size={16} /> Análise IA • Professor Virtual
              </div>
              <div className="space-y-3 text-xs font-medium text-text-secondary leading-relaxed mb-4">
                <p>
                  "Percebi que você melhorou em <strong className="text-emerald-400">Biologia (+15%)</strong>. Por outro lado, errou <strong className="text-rose-400">8 das últimas 10 questões</strong> de Geometria."
                </p>
                <p className="text-text-main font-bold">Minha sugestão:</p>
                <ul className="space-y-1.5 list-disc list-inside text-text-secondary opacity-90">
                  <li>Resolver 25 questões de Geometria</li>
                  <li>Assistir à aula de revisão</li>
                  <li>Fazer mini simulado de fixação</li>
                </ul>
              </div>

              <button 
                onClick={() => onTabChange?.('questions')}
                className="w-full bg-text-main/5 hover:bg-text-main/10 text-text-main font-bold text-xs py-3 rounded-xl border border-border-color transition-colors flex items-center justify-center gap-2"
              >
                Executar recomendação <Zap size={14} className="text-brand-primary" />
              </button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
