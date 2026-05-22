import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';
import { calculateLevelAndProgression } from '../utils/xpUtils';
import { 
  TrendingUp, Award, Flame, CheckCircle2, X, BookOpen, MessageSquare, 
  Zap, Trophy, MapPin, Users, ArrowRight, Star, FileText, Lightbulb
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import confetti from 'canvas-confetti';

interface DashboardProps {
  user: UserProfile;
  onTabChange?: (tab: string) => void;
  onEarnXp?: (amount: number, correct?: number, answered?: number, isFlashQuiz?: boolean, activityName?: string) => void;
}

const WEEKLY_DATA = [
  { day: 'Seg', xp: 520 },
  { day: 'Ter', xp: 890 },
  { day: 'Qua', xp: 1200 },
  { day: 'Qui', xp: 900 },
  { day: 'Sex', xp: 1450 },
  { day: 'Sáb', xp: 2100 },
  { day: 'Dom', xp: 1100 },
];

const DAILY_QUESTIONS = [
  {
    question: "Qual cidade maranhense é conhecida como a \"Princesa do Sertão\"?",
    options: ["Bacabal", "Caxias", "Imperatriz", "Codó"],
    answer: "Caxias",
    hint: "Fica às margens do Rio Itapecuru e é o lar dos ilustres poetas Gonçalves Dias e Coelho Neto."
  },
  {
    question: "Qual importante parque nacional maranhense é famoso por suas imensas dunas e lagoas sazonais de água doce?",
    options: ["Serras Gerais", "Chapada das Mesas", "Lençóis Maranhenses", "Delta do Parnaíba"],
    answer: "Lençóis Maranhenses",
    hint: "É considerado um dos maiores santuários naturais do ecoturismo global, tendo Barreirinhas como principal portal."
  },
  {
    question: "O centro histórico de qual cidade maranhense é tombado pela UNESCO por seus casarões revestidos de azulejos portugueses?",
    options: ["Alcântara", "São Luís", "Rosário", "Viana"],
    answer: "São Luís",
    hint: "Trata-se da única capital de estado no Brasil fundada originalmente por colonizadores franceses."
  }
];

export default function Dashboard({ user, onTabChange, onEarnXp }: DashboardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [dailyChallengeDone, setDailyChallengeDone] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [selectedWrongCity, setSelectedWrongCity] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [rankingTab, setRankingTab] = useState<'geral' | 'local'>('geral');
  const [recentMaterials, setRecentMaterials] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    weekly: [
      { day: 'Dom', xp: 0 }, { day: 'Seg', xp: 0 }, { day: 'Ter', xp: 0 }, 
      { day: 'Qua', xp: 0 }, { day: 'Qui', xp: 0 }, { day: 'Sex', xp: 0 }, { day: 'Sáb', xp: 0 }
    ],
    summary: { average: 0, best: 0, total: 0 }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Carregar materiais de maneira isolada
        try {
          const matRes = await fetch('/api/materials');
          if (matRes.ok) {
            const mats = await matRes.json();
            setRecentMaterials(mats.slice(0, 4));
          }
        } catch (e) {
          console.error('Erro ao buscar materiais do dashboard:', e);
        }

        // 2. Carregar estatísticas do usuário de maneira isolada
        try {
          const statsRes = await fetch(`/api/user/stats?email=${encodeURIComponent(user.email)}`);
          if (statsRes.ok) {
            const statsData = await statsRes.json();
            if (statsData.weekly?.length > 0) {
              setStats(statsData);
            }
            if (statsData.flashQuizCompleted) {
              setDailyChallengeDone(true);
            }
          }
        } catch (e) {
          console.error('Erro ao buscar estatísticas do dashboard:', e);
        }

        // 3. Carregar leaderboard de maneira isolada com dados reais
        try {
          const leadRes = await fetch('/api/leaderboard');
          if (leadRes.ok) {
            const leadData = await leadRes.json();
            if (Array.isArray(leadData) && leadData.length > 0) {
              setLeaderboard(leadData);
            } else {
              throw new Error('Ranking vazio ou inválido');
            }
          } else {
            throw new Error('Resposta de rede do ranking inválida');
          }
        } catch (e) {
          console.warn('Erro ao carregar leaderboard oficial:', e);
          // Sem dados mockados, colocamos apenas o próprio usuário caso queira se ver no painel real
          setLeaderboard([
            { name: user.name || 'Você', city: user.city || 'Maranhão', xp: user.xp || 0, level: user.level || 1, isMe: true }
          ]);
        }
      } catch (err) {
        console.error('Erro geral ao carregar dados do dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    if (user.email) {
      fetchData();
    }
  }, [user.email, user.name, user.city, user.xp, user.level]);
  
  // Safe defaults if user metadata is missing
  const currentXp = user?.xp || 0;
  const { currentLevelMinXp, nextLevelXp } = calculateLevelAndProgression(currentXp);
  const xpInCurrentLevel = currentXp - currentLevelMinXp;
  const xpNeededInCurrentLevel = nextLevelXp - currentLevelMinXp;
  const xpPercentage = xpNeededInCurrentLevel > 0 
    ? Math.min((xpInCurrentLevel / xpNeededInCurrentLevel) * 100, 100) 
    : 0;
  const userName = user?.name?.split(' ')[0] || 'Estudante';
  const streak = user?.streak || 0;
  const answeredQuestions = user?.answeredQuestions || 0;
  const correctAnswers = user?.correctAnswers || 0;

  const handleQuizComplete = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#00b094', '#00ffd5', '#ffffff']
    });
    setDailyChallengeDone(true);
    setShowQuiz(false);
    if (onEarnXp) {
      onEarnXp(50, 1, 1, true, 'Flash Quiz: Maranhão');
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <div className="max-w-6xl mx-auto pt-24 pb-32 px-4 md:px-8">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <header className="mb-10 md:mb-16 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
          <motion.div variants={itemVariants}>
            <p className="text-brand-primary font-bold mb-2 text-[10px]">Portal de Alta Performance</p>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-text-main leading-none">
              Olá, <span className="text-brand-primary">{userName}</span>
            </h1>
            {(user.city || user.school) && (
              <p className="text-text-secondary text-[10px] font-bold mt-4 opacity-50 flex items-center gap-2">
                <MapPin size={10} className="text-brand-primary" />
                {user.city}{user.city && user.school ? ' • ' : ''}{user.school}
              </p>
            )}
          </motion.div>
          <motion.button 
            variants={itemVariants}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowDetails(true)}
            className="apple-button-secondary py-3 px-8 text-xs font-bold w-full sm:w-auto"
          >
            Métricas de evolução <TrendingUp size={14} />
          </motion.button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-12">
            <motion.div 
              variants={itemVariants}
              className="bg-bg-card/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-6 md:p-12 md:col-span-8 lg:col-span-8 relative overflow-hidden group border border-border-color shadow-2xl shadow-black/5"
            >
            <div className="relative z-10">
              <div className="flex flex-col lg:flex-row justify-between items-start mb-12 gap-8">
                <div>
                  <span className="text-brand-primary text-[10px] font-bold mb-3 block opacity-60">Status de progresso</span>
                  <h2 className="text-5xl md:text-6xl font-black text-text-main tracking-tighter leading-none">Nível {user?.level || 0}</h2>
                </div>
                <div className="lg:text-right">
                  <p className="text-3xl md:text-4xl font-black text-brand-primary leading-none mb-2">{(currentXp).toLocaleString()} <span className="text-text-secondary text-xs opacity-40">XP acumulado</span></p>
                  <p className="text-[10px] text-text-secondary font-bold opacity-50">Faltam {Math.max(0, nextLevelXp - currentXp)} XP para o próximo estágio</p>
                </div>
              </div>
              
              <div className="h-6 md:h-8 bg-bg-main/50 rounded-full overflow-hidden p-1.5 relative ring-1 ring-border-color/50">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${xpPercentage}%` }}
                  transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-primary rounded-full shadow-[0_0_40px_rgba(0,176,148,0.3)] relative"
                >
                  <div className="absolute top-0 right-0 bottom-0 w-32 bg-gradient-to-l from-white/20 to-transparent" />
                </motion.div>
              </div>
            </div>
            {/* Decoration */}
            <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-brand-primary/5 rounded-full blur-[100px] group-hover:bg-brand-primary/10 transition-all duration-1000" />
            <div className="absolute top-6 right-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <Zap size={64} className="text-brand-primary" />
            </div>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-1 md:grid-cols-2 md:col-span-4 gap-6">
            <motion.div 
              variants={itemVariants} 
              whileHover={{ y: -5 }}
              className="bg-bg-card/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-6 md:p-8 relative overflow-hidden group transition-all border border-border-color shadow-2xl shadow-black/5 flex flex-col justify-between h-full"
            >
              <div className="bg-orange-500/10 w-12 h-12 flex items-center justify-center rounded-2xl text-orange-500 mb-6 group-hover:scale-110 transition-transform">
                <Flame size={24} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-text-secondary mb-1 opacity-50">Frequência</p>
                <p className="text-3xl font-black text-text-main leading-none">{streak} <span className="text-xs text-text-secondary opacity-50">Dias</span></p>
              </div>
            </motion.div>

            <motion.div 
              variants={itemVariants}
              whileHover={{ y: -5 }}
              className="bg-bg-card/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-6 md:p-8 relative overflow-hidden group transition-all border border-border-color shadow-2xl shadow-black/5 flex flex-col justify-between h-full"
            >
              <div className="bg-blue-500/10 w-12 h-12 flex items-center justify-center rounded-2xl text-blue-500 mb-6 group-hover:scale-110 transition-transform">
                <Award size={24} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-text-secondary mb-1 opacity-50">Precisão</p>
                <p className="text-3xl font-black text-text-main leading-none">{answeredQuestions ? ((correctAnswers / answeredQuestions) * 100).toFixed(0) : 0}<span className="text-xs text-text-secondary ml-1">%</span></p>
              </div>
            </motion.div>
          </div>
        </div>

        {/* New Interactive Section: Daily Challenge & Maranhão Ranking */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
          {/* Daily Challenge Interactive Card */}
          <motion.div 
            variants={itemVariants}
            className="lg:col-span-7 bg-brand-primary/5 border border-brand-primary/20 rounded-3xl md:rounded-[40px] p-6 md:p-10 relative overflow-hidden group"
          >
            <div className="relative z-10">
              {!dailyChallengeDone ? (
                (() => {
                  const dayOfMonth = new Date().getDate();
                  const quizQuest = DAILY_QUESTIONS[dayOfMonth % DAILY_QUESTIONS.length];
                  return (
                    <>
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <span className="flex items-center gap-2 text-brand-primary text-[10px] font-bold mb-2">
                            <Star size={12} fill="currentColor" /> Desafio do dia
                          </span>
                          <h3 className="text-3xl font-black text-text-main tracking-tight leading-none">Flash Quiz Maranhão</h3>
                        </div>
                        <div className="text-right flex flex-col items-end gap-2">
                          <span className="text-[10px] font-bold text-brand-primary bg-brand-primary/20 px-3 py-1.5 rounded-full">+50 XP</span>
                          <button 
                            onClick={() => setShowHint(!showHint)}
                            className="text-[9px] font-black uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors flex items-center gap-1 opacity-80"
                          >
                            <Lightbulb size={10} className={showHint ? "text-yellow-400 animate-pulse fill-yellow-400/20" : ""} />
                            {showHint ? 'Ocultar Dica' : 'Ver Dica'}
                          </button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {showHint && (
                          <motion.div
                            initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                            animate={{ height: 'auto', opacity: 1, marginBottom: 16 }}
                            exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                            className="overflow-hidden bg-brand-primary/10 border border-brand-primary/25 rounded-2xl p-4 text-[11px] font-medium leading-relaxed text-text-secondary"
                          >
                            💡 <span className="text-brand-primary font-bold">Dica histórica</span>: {quizQuest.hint}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {!showQuiz ? (
                        <div>
                          <p className="text-text-secondary text-sm font-medium mb-8 max-w-md">Uma pergunta rápida sobre a história do nosso estado para aquecer seus motores hoje.</p>
                          <button 
                            onClick={() => setShowQuiz(true)}
                            className="bg-brand-primary text-white font-bold text-[10px] px-8 py-4 rounded-2xl hover:bg-brand-primary/80 transition-all flex items-center gap-3"
                          >
                            Começar agora <ArrowRight size={16} />
                          </button>
                        </div>
                      ) : (
                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="space-y-3"
                        >
                          <p className="text-text-main font-bold text-base md:text-lg mb-6 leading-tight">{quizQuest.question}</p>
                          {quizQuest.options.map((option) => {
                            const isWrong = selectedWrongCity === option;
                            return (
                              <motion.button 
                                key={option}
                                animate={isWrong ? { x: [-10, 10, -10, 10, 0] } : {}}
                                transition={{ duration: 0.4 }}
                                onClick={() => {
                                  if (option === quizQuest.answer) {
                                    handleQuizComplete();
                                  } else {
                                    setSelectedWrongCity(option);
                                    setTimeout(() => {
                                      setSelectedWrongCity(null);
                                    }, 1200);
                                  }
                                }}
                                className={`w-full text-left p-4 rounded-2xl border transition-all text-xs font-bold flex justify-between items-center group/btn relative ${
                                  isWrong 
                                  ? 'border-red-500 bg-red-500/10 text-red-500' 
                                  : 'border-border-color bg-bg-card/50 hover:border-brand-primary hover:bg-brand-primary/5 text-text-main'
                                }`}
                              >
                                <span>{option}</span>
                                {isWrong ? (
                                  <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">Incorreto ❌</span>
                                ) : (
                                  <ArrowRight size={12} className="opacity-0 group-hover/btn:opacity-100 -translate-x-2 group-hover/btn:translate-x-0 transition-all text-brand-primary" />
                                )}
                              </motion.button>
                            );
                          })}
                        </motion.div>
                      )}
                    </>
                  );
                })()
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-20 h-20 bg-brand-primary/20 rounded-full flex items-center justify-center text-brand-primary mb-6 animate-bounce">
                    <CheckCircle2 size={40} />
                  </div>
                  <h3 className="text-2xl font-black text-text-main mb-2">Desafio concluído!</h3>
                  <p className="text-text-secondary text-sm font-medium">+50 XP adicionados ao seu perfil.</p>
                  <button 
                    disabled
                    className="mt-8 bg-text-main/5 text-text-secondary font-bold text-[10px] px-8 py-4 rounded-2xl cursor-not-allowed"
                  >
                    Próximo em 14h : 22m
                  </button>
                </div>
              )}
            </div>
            
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 p-10 text-brand-primary/10 -rotate-12">
               <Trophy size={180} />
            </div>
          </motion.div>

          {/* Ranking Teaser Card */}
          <motion.div 
            variants={itemVariants}
            className="lg:col-span-5 bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-3xl md:rounded-[40px] p-6 md:p-10 relative overflow-hidden group flex flex-col justify-between"
          >
            <div className="flex flex-col h-full justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-text-secondary text-[10px] font-bold mb-1 block opacity-40">Ranking Maranhão</span>
                    <h3 className="text-2xl font-black text-text-main tracking-tight flex items-center gap-2 leading-none">
                      Sua posição <Trophy size={18} className="text-orange-500" />
                    </h3>
                  </div>
                </div>

                {/* Micro Pill for Ranking Navigation Filter */}
                <div className="flex bg-bg-main/50 p-1 rounded-full border border-border-color/60 mt-4 mb-6 w-fit scale-90 origin-left">
                  <button 
                    onClick={() => setRankingTab('geral')}
                    className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all ${rankingTab === 'geral' ? 'bg-brand-primary text-white shadow-md' : 'text-text-secondary hover:text-text-main'}`}
                  >
                    Geral
                  </button>
                  <button 
                    onClick={() => setRankingTab('local')}
                    className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all ${rankingTab === 'local' ? 'bg-brand-primary text-white shadow-md' : 'text-text-secondary hover:text-text-main'}`}
                  >
                    {user.city || 'Minha Cidade'}
                  </button>
                </div>

                <div className="space-y-3">
                  {leaderboard.length > 0 ? (
                    (() => {
                      const userCity = user.city || 'Caxias';
                      
                      let displayList = [];
                      if (rankingTab === 'geral') {
                        displayList = [...leaderboard];
                      } else {
                        // Mantém apenas usuários que pertencem à mesma cidade (case-insensitive)
                        displayList = leaderboard.filter(rank => {
                          const rCity = rank.city || '';
                          return rCity.toLowerCase().trim() === userCity.toLowerCase().trim();
                        });
                      }

                      // Garante que o próprio usuário logado seja incluído na lista para ver sua posição real (se não for admin)
                      const hasUserInList = displayList.some(rank => rank.name === user.name);
                      if (!hasUserInList && user.role !== 'admin') {
                        const userCityMatch = (user.city || '').toLowerCase().trim() === userCity.toLowerCase().trim();
                        if (rankingTab === 'geral' || (rankingTab === 'local' && userCityMatch)) {
                          displayList.push({
                            name: user.name || 'Você',
                            city: user.city || 'Maranhão',
                            xp: user.xp || 0,
                            level: user.level || 1,
                            isMe: true
                          });
                        }
                      }

                      // Ordena de forma decrescente pelo XP real acumulado do banco e exibe os top 4
                      const competitiveLeaderboard = displayList
                        .sort((a, b) => (b.xp || 0) - (a.xp || 0))
                        .slice(0, 4);

                      return competitiveLeaderboard.map((rank, i) => {
                        const isCurrentUser = user.role !== 'admin' && (rank.isMe || rank.name === user.name);
                        return (
                          <motion.div 
                            key={i} 
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            whileHover={{ scale: 1.01, x: 2 }}
                            className={`flex items-center justify-between p-3.5 rounded-2xl transition-all border ${
                              isCurrentUser 
                                ? 'bg-brand-primary/10 border-brand-primary/30 shadow-[0_4px_20px_rgba(0,176,148,0.1)]' 
                                : 'bg-bg-main/20 border-border-color/10 hover:border-border-color/30'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`text-xs font-black w-4 text-center ${isCurrentUser ? 'text-brand-primary' : 'text-text-secondary opacity-40'}`}>
                                #{i + 1}
                              </span>
                              <div>
                                <p className={`text-xs font-bold leading-tight ${isCurrentUser ? 'text-text-main' : 'text-text-secondary'}`}>
                                  {rank.name} {isCurrentUser && '(Você)'}
                                </p>
                                <p className="text-[9px] font-semibold text-text-secondary opacity-40 leading-none mt-1">
                                  {rank.city || 'Maranhão'}
                                </p>
                              </div>
                            </div>
                            <span className={`text-[10px] font-black ${isCurrentUser ? 'text-brand-primary' : 'text-text-secondary opacity-85'}`}>
                              {rank.xp >= 1000 ? (rank.xp / 1000).toFixed(1) + 'k' : rank.xp} XP
                            </span>
                          </motion.div>
                        );
                      });
                    })()
                  ) : (
                    /* Beautiful interactive loading skeleton */
                    <div className="space-y-3">
                      {[1, 2, 3, 4].map((n) => (
                        <div key={n} className="flex items-center justify-between p-4 rounded-2xl bg-bg-main/25 animate-pulse border border-border-color/10">
                          <div className="flex items-center gap-4">
                            <div className="w-5 h-5 bg-text-secondary/10 rounded-full" />
                            <div className="space-y-2">
                              <div className="w-24 h-3 bg-text-secondary/10 rounded animate-pulse" />
                              <div className="w-12 h-2 bg-text-secondary/10 rounded opacity-50 animate-pulse" />
                            </div>
                          </div>
                          <div className="w-10 h-3 bg-text-secondary/10 rounded animate-pulse" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button 
                onClick={() => onTabChange?.('ranking')}
                className="mt-6 text-[10px] font-bold text-brand-primary flex items-center gap-2 group-hover:gap-4 transition-all w-fit"
              >
                Ver ranking completo <ArrowRight size={14} />
              </button>
            </div>
            
            <div className="absolute -bottom-10 -right-10 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
              <Users size={120} />
            </div>
          </motion.div>
        </div>


        <section>
          <motion.div variants={itemVariants} className="flex items-center gap-3 mb-8">
            <div className="h-px flex-1 bg-text-main/5" />
            <h3 className="text-text-secondary text-[10px] font-bold">Novos materiais de estudo</h3>
            <div className="h-px flex-1 bg-text-main/5" />
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {recentMaterials.length > 0 ? (
              recentMaterials.map((material, i) => (
                <motion.div
                  key={material.id}
                  variants={itemVariants}
                  whileHover={{ y: -5, scale: 1.02 }}
                  onClick={() => onTabChange?.('materiais')}
                  className="bg-bg-card/50 backdrop-blur-xl rounded-3xl p-6 md:p-8 group transition-all cursor-pointer shadow-xl shadow-black/5 border border-border-color/50"
                >
                  <div className="flex justify-between items-start mb-10">
                    <div className="bg-text-main/5 p-4 rounded-2xl text-brand-primary group-hover:bg-brand-primary/10 transition-colors">
                      {material.type === 'video' ? <Zap size={20} /> : <FileText size={20} />}
                    </div>
                    <span className="text-[9px] font-bold text-brand-primary bg-brand-primary/10 px-3 py-1.5 rounded-full">
                      Novo
                    </span>
                  </div>
                  <h4 className="text-text-main font-bold text-lg group-hover:text-brand-primary transition-colors mb-2 leading-tight line-clamp-2">
                    {material.title}
                  </h4>
                  <div className="flex items-center gap-3 text-text-secondary text-[10px] font-bold opacity-60">
                    <span>{material.subject}</span>
                    <span className="w-1 h-1 bg-text-secondary rounded-full" />
                    <span>{material.uploadedAt}</span>
                  </div>
                  
                  <div className="mt-8 pt-8 border-t border-border-color/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between">
                    <span className="text-[9px] font-bold text-brand-primary">Ver material</span>
                    <ArrowRight size={14} className="text-brand-primary" />
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="col-span-full py-12 text-center bg-bg-card/30 rounded-[40px] border border-dashed border-border-color">
                <p className="text-text-secondary text-sm font-medium italic">Nenhum material novo postado recentemente.</p>
              </div>
            )}
          </div>
        </section>

      </motion.div>

      <AnimatePresence>
        {showDetails && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-bg-card w-full max-w-3xl p-6 sm:p-10 rounded-3xl sm:rounded-[40px] relative shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <button 
                onClick={() => setShowDetails(false)}
                className="absolute top-4 right-4 sm:top-8 sm:right-8 p-2.5 sm:p-3 text-text-secondary hover:text-text-main transition-colors bg-text-main/5 rounded-full hover:bg-text-main/10"
                title="Fechar detalhes"
                aria-label="Fechar detalhes"
              >
                <X size={18} />
              </button>

              <div className="mb-6 sm:mb-10 pr-8">
                <span className="text-brand-primary text-[10px] font-bold mb-2 block">Análise de desempenho</span>
                <h2 className="text-3xl sm:text-4xl font-black text-text-main tracking-tight">Evolução semanal</h2>
                <p className="text-text-secondary font-medium text-xs sm:text-sm">Acompanhe seu ganho de XP e frequência de estudos.</p>
              </div>

              <div className="h-48 sm:h-72 w-full mb-6 sm:mb-10 min-h-[192px] sm:min-h-[288px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={stats.weekly}>
                    <defs>
                      <linearGradient id="colorXp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00b094" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#00b094" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="0" stroke="var(--text-main)" strokeOpacity={0.05} vertical={false} />
                    <XAxis 
                      dataKey="day" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 'bold'}}
                      dy={10}
                    />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'var(--bg-sidebar)', 
                        border: 'none', 
                        borderRadius: '20px',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                        color: 'var(--text-main)',
                        padding: '12px'
                      }}
                      itemStyle={{ color: '#00b094', fontWeight: '900', fontSize: '14px' }}
                      cursor={{ stroke: '#00b094', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="xp" 
                      stroke="#00b094" 
                      strokeWidth={4}
                      fillOpacity={1} 
                      fill="url(#colorXp)" 
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 sm:p-6 bg-bg-main/50 rounded-2xl sm:rounded-3xl">
                  <p className="text-[10px] font-bold text-text-secondary mb-1">Média diária</p>
                  <p className="text-xl sm:text-2xl font-black text-text-main">{stats.summary.average} <span className="text-text-secondary text-xs sm:text-sm">XP</span></p>
                </div>
                <div className="p-4 sm:p-6 bg-bg-main/50 rounded-2xl sm:rounded-3xl">
                  <p className="text-[10px] font-bold text-text-secondary mb-1">Melhor dia</p>
                  <p className="text-xl sm:text-2xl font-black text-text-main">{stats.summary.best} <span className="text-text-secondary text-xs sm:text-sm">XP</span></p>
                </div>
                <div className="p-4 sm:p-6 bg-brand-primary rounded-2xl sm:rounded-3xl shadow-lg shadow-brand-primary/20">
                  <p className="text-[10px] font-bold text-white/70 mb-1">Total semana</p>
                  <p className="text-xl sm:text-2xl font-black text-white">{stats.summary.total >= 1000 ? (stats.summary.total / 1000).toFixed(1) + 'k' : stats.summary.total} <span className="text-white/70 text-xs sm:text-sm">XP</span></p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}


