import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';
import { 
  Target, CheckCircle2, Clock, Sparkles, ArrowRight, 
  Calendar, Award, BookOpen, RotateCcw, Flame, Check,
  Calculator, Plus, Trash2, Zap, Play, RefreshCw,
  Trophy, TrendingUp, Bot, Lightbulb, Globe, FileText
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { studyPlanService, StudyTask } from '../services/studyPlanService';
import Spinner from './Spinner';

interface StudyPlanProps {
  user: UserProfile;
  onTabChange?: (tab: string) => void;
  onEarnXp?: (amount: number, correct?: number, answered?: number, isFlashQuiz?: boolean, activityName?: string) => void;
}

export default function StudyPlan({ user, onTabChange, onEarnXp }: StudyPlanProps) {
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingTaskId, setSyncingTaskId] = useState<string | null>(null);
  const [claimedTaskIds, setClaimedTaskIds] = useState<Set<string>>(new Set());

  // Celebration Modal
  const [showCelebrationModal, setShowCelebrationModal] = useState(false);
  const [celebrationClaimed, setCelebrationClaimed] = useState(false);
  const [aiAdjusted, setAiAdjusted] = useState(false);
  const [aiAdjusting, setAiAdjusting] = useState(false);

  // Inline custom task creation
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskTime, setNewTaskTime] = useState('30 min');
  const [creatingTask, setCreatingTask] = useState(false);

  useEffect(() => {
    const fetchTasks = async () => {
      if (!user.email) return;
      setLoading(true);
      setError(null);
      try {
        const data = await studyPlanService.getTasks();
        const loadedTasks = data.tasks || [];
        setTasks(loadedTasks);
        const initialClaimed = new Set(loadedTasks.filter(t => t.done).map(t => t.id));
        setClaimedTaskIds(initialClaimed);
      } catch (err) {
        console.error('[StudyPlan] Erro ao carregar tarefas:', err);
        setError('Não foi possível carregar seu plano de estudos.');
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, [user.email]);

  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const nextDone = !task.done;
    const isAlreadyClaimed = claimedTaskIds.has(id);

    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: nextDone } : t));
    setSyncingTaskId(id);

    try {
      const { xpEarned } = await studyPlanService.toggleTask(id, nextDone);

      if (nextDone && xpEarned > 0 && !isAlreadyClaimed && onEarnXp) {
        setClaimedTaskIds(prev => new Set(prev).add(id));
        onEarnXp(xpEarned, 0, 0, false, `Missão diária: ${task.title.split('-')[0]}`);
        
        confetti({
          particleCount: 40,
          spread: 50,
          origin: { y: 0.7 },
          colors: ['#00b094', '#10b981', '#34d399', '#ffffff'],
        });
      }

      // Check if all completed
      const remainingPending = tasks.filter(t => t.id !== id && !t.done);
      if (nextDone && remainingPending.length === 0 && !celebrationClaimed) {
        setTimeout(() => {
          setShowCelebrationModal(true);
          setCelebrationClaimed(true);
          if (onEarnXp) {
            onEarnXp(50, 0, 0, false, 'Bônus: Missão Diária Concluída!');
          }
          confetti({
            particleCount: 90,
            spread: 80,
            origin: { y: 0.5 },
            colors: ['#00b094', '#10b981', '#fbbf24', '#ffffff'],
          });
        }, 400);
      }
    } catch (err) {
      console.error('[StudyPlan] Erro ao atualizar tarefa:', err);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !nextDone } : t));
    } finally {
      setSyncingTaskId(null);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setCreatingTask(true);
    try {
      const created = await studyPlanService.createTask({
        title: newTaskTitle.trim(),
        estimated_time: newTaskTime,
        target_tab: 'questions',
      });
      setTasks(prev => [...prev, created]);
      setNewTaskTitle('');
      setShowAddTask(false);
    } catch (err) {
      console.error('[StudyPlan] Erro ao criar tarefa:', err);
    } finally {
      setCreatingTask(false);
    }
  };

  const handleDeleteTask = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await studyPlanService.deleteTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('[StudyPlan] Erro ao deletar tarefa:', err);
    }
  };

  const handleAiAutoAdjust = () => {
    setAiAdjusting(true);
    setTimeout(() => {
      setAiAdjusting(false);
      setAiAdjusted(true);
      confetti({
        particleCount: 30,
        spread: 40,
        origin: { y: 0.6 },
        colors: ['#00b094', '#10b981', '#ffffff'],
      });
    }, 1000);
  };

  const completedCount = tasks.filter(t => t.done).length;
  const progressPercent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const allCompleted = tasks.length > 0 && completedCount === tasks.length;

  const totalMinutes = useMemo(() => {
    return tasks.reduce((sum, task) => {
      const match = (task.estimated_time || '30 min').match(/(\d+)/);
      return sum + (match ? parseInt(match[1], 10) : 30);
    }, 0);
  }, [tasks]);

  const completedMinutes = useMemo(() => {
    return tasks.filter(t => t.done).reduce((sum, task) => {
      const match = (task.estimated_time || '30 min').match(/(\d+)/);
      return sum + (match ? parseInt(match[1], 10) : 30);
    }, 0);
  }, [tasks]);

  // Approval forecast score calculation
  const userQuestions = user.answeredQuestions || 0;
  const userCorrect = user.correctAnswers || 0;
  const userAccuracy = userQuestions > 0 ? Math.round((userCorrect / userQuestions) * 100) : 70;
  const estimatedScore = Math.min(840, Math.max(560, 620 + Math.round(userQuestions * 0.35) + Math.round((userAccuracy - 50) * 2.2)));
  const targetScore = 760;

  // Task Subject Theme Helper (Visão Geral das Áreas do ENEM)
  const getTaskMeta = (title: string) => {
    const lower = title.toLowerCase();
    if (lower.includes('matemática') || lower.includes('exatas')) {
      return {
        icon: Calculator,
        category: 'Matemática & Tecnologias',
        reason: 'Área com maior impacto e variância de TRI no ENEM.',
      };
    }
    if (lower.includes('natureza') || lower.includes('biologia') || lower.includes('física') || lower.includes('química')) {
      return {
        icon: Flame,
        category: 'Ciências da Natureza',
        reason: 'Visão integrada de Biologia, Física e Química no ENEM.',
      };
    }
    if (lower.includes('humanas') || lower.includes('história') || lower.includes('geografia') || lower.includes('filosofia') || lower.includes('sociologia')) {
      return {
        icon: Globe,
        category: 'Ciências Humanas',
        reason: 'Análise crítica de contextos sociais, históricos e geográficos.',
      };
    }
    if (lower.includes('linguagens') || lower.includes('português') || lower.includes('literatura') || lower.includes('interpretação')) {
      return {
        icon: BookOpen,
        category: 'Linguagens & Códigos',
        reason: 'Interpretação textual, gêneros e repertório para a prova.',
      };
    }
    if (lower.includes('erro') || lower.includes('revisar') || lower.includes('pendência')) {
      return {
        icon: RotateCcw,
        category: 'Revisão Geral ENEM',
        reason: 'Fixação ativa dos erros cometidos nos simulados do ENEM.',
      };
    }
    return {
      icon: Target,
      category: 'Visão Geral ENEM',
      reason: 'Treino integrativo de questões para a matriz da prova.',
    };
  };

  const enemAreasOverview = [
    {
      id: 'matematica',
      title: 'Matemática e suas Tecnologias',
      day: 'Dia 2 da Prova',
      dayColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      questions: '45 Questões',
      weight: 'TRI Elevada',
      icon: Calculator,
      targetTab: 'questions',
      description: 'Álgebra, Geometria, Matemática Financeira, Estatística e Proporcionalidade.',
    },
    {
      id: 'natureza',
      title: 'Ciências da Natureza e suas Tecnologias',
      day: 'Dia 2 da Prova',
      dayColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      questions: '45 Questões',
      weight: 'Interdisciplinar',
      icon: Flame,
      targetTab: 'questions',
      description: 'Biologia (Ecologia/Genética), Química (Físico-Química) e Física (Mecânica/Eletricidade).',
    },
    {
      id: 'linguagens',
      title: 'Linguagens, Códigos e suas Tecnologias',
      day: 'Dia 1 da Prova',
      dayColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
      questions: '45 Questões + Redação',
      weight: 'Base Textual',
      icon: BookOpen,
      targetTab: 'questions',
      description: 'Interpretação textual, Literatura, Artes, Língua Estrangeira e Tecnologias da Informação.',
    },
    {
      id: 'humanas',
      title: 'Ciências Humanas e suas Tecnologias',
      day: 'Dia 1 da Prova',
      dayColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
      questions: '45 Questões',
      weight: 'Análise Crítica',
      icon: Globe,
      targetTab: 'questions',
      description: 'História do Brasil/Geral, Geografia, Filosofia e Sociologia.',
    },
    {
      id: 'redacao',
      title: 'Redação Dissertativa-Argumentativa',
      day: 'Dia 1 da Prova',
      dayColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      questions: '1000 Pontos',
      weight: 'Decisivo',
      icon: FileText,
      targetTab: 'redacao',
      description: 'Estrutura em 4 parágrafos, 5 Competências oficiais e Proposta de Intervenção.',
    },
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

  const weekDayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const todayIndex = new Date().getDay();
  const weeklyDays = weekDayNames.map((day, i) => ({
    day,
    status: i < todayIndex ? 'past' as const : i === todayIndex ? 'today' as const : 'upcoming' as const,
  }));

  return (
    <div className="max-w-6xl mx-auto pt-24 pb-32 px-4 md:px-8">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <header className="mb-10 md:mb-14 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <motion.div variants={itemVariants}>
            <div className="flex items-center gap-2.5 text-brand-primary text-xs font-black mb-3 uppercase tracking-wider bg-brand-primary/10 border border-brand-primary/20 px-3 py-1 rounded-full w-fit">
              <Target size={15} /> Plano de Estudos • Visão Geral do ENEM
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-text-main leading-tight">
              Sua rota de aprovação no <span className="text-brand-primary drop-shadow-[0_0_15px_rgba(0,176,148,0.3)]">ENEM</span>
            </h1>
            <p className="text-text-secondary text-sm font-semibold mt-2.5 max-w-xl leading-relaxed">
              Organize seus estudos com foco na visão geral das 4 Áreas do Conhecimento do ENEM + Redação, acompanhando suas metas diárias.
            </p>
          </motion.div>

          <motion.div variants={itemVariants} className="flex items-center gap-3.5 bg-bg-card/90 backdrop-blur-xl p-4 rounded-2xl border border-border-color/60 shadow-lg">
            <div className="bg-brand-primary/15 p-3 rounded-xl text-brand-primary border border-brand-primary/30">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-[11px] font-black text-text-secondary uppercase tracking-wider">Tempo Estimado Hoje</p>
              <p className="text-2xl font-black text-text-main tracking-tight">{completedMinutes} / {totalMinutes} min</p>
            </div>
          </motion.div>
        </header>

        {/* HERO CARD: TODAY'S MISSION */}
        <motion.div 
          variants={itemVariants}
          className="bg-bg-card rounded-3xl md:rounded-[40px] p-6 md:p-10 border border-border-color/60 shadow-xl mb-10 relative overflow-hidden"
        >
          <div className="relative z-10">
            {/* Top Info Bar */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8">
              <div>
                <div className="flex items-center gap-2 bg-brand-primary/10 border border-brand-primary/30 px-3.5 py-1 rounded-full text-brand-primary text-xs font-black w-fit mb-3">
                  <Sparkles size={13} /> {allCompleted ? '🎉 Dia Concluído!' : `Missão de Hoje • ${completedCount}/${tasks.length} Concluídas`}
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-text-main tracking-tight">
                  🎯 Complete {totalMinutes} min de estudo hoje
                </h2>
                <p className="text-xs text-text-secondary font-semibold mt-1.5 flex items-center gap-1.5">
                  <Flame size={14} className="text-amber-400 fill-amber-400" />
                  Mantenha sua sequência de <strong className="text-text-main font-black">{user.streak || 1} dias</strong> de estudos seguidos.
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full lg:w-72 bg-bg-main/60 p-4 rounded-2xl border border-border-color/40">
                <div className="flex justify-between items-center text-xs font-bold mb-2">
                  <span className="text-text-secondary font-bold uppercase tracking-wider text-[10px]">Progresso diário</span>
                  <span className="text-brand-primary font-black text-sm">{progressPercent}%</span>
                </div>
                <div className="h-3 bg-bg-main rounded-full overflow-hidden p-0.5 border border-border-color/30">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.8 }}
                    className="h-full bg-gradient-to-r from-brand-primary via-emerald-400 to-teal-300 rounded-full shadow-[0_0_12px_rgba(0,176,148,0.3)]"
                  />
                </div>
              </div>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="flex justify-center py-12">
                <Spinner size={32} />
              </div>
            )}

            {/* Error State */}
            {error && !loading && (
              <div className="text-center py-12 bg-rose-500/10 border border-rose-500/30 rounded-3xl">
                <p className="text-rose-400 font-black text-sm">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 text-xs font-black uppercase tracking-wider text-brand-primary hover:underline"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {/* Tasks List */}
            {!loading && !error && tasks.length > 0 && (
              <div className="space-y-3.5 mb-8">
                {tasks.map((task) => {
                  const meta = getTaskMeta(task.title);
                  const TaskIcon = meta.icon;

                  return (
                    <motion.div 
                      key={task.id}
                      whileHover={{ scale: 1.005 }}
                      className={`p-4 md:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group ${
                        task.done 
                          ? 'bg-brand-primary/10 border-brand-primary/30 text-text-secondary' 
                          : 'bg-bg-card border-border-color/60 hover:border-brand-primary/60 text-text-main shadow-sm'
                      }`}
                      onClick={() => toggleTask(task.id)}
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTask(task.id);
                          }}
                          className={`w-6 h-6 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
                            task.done 
                              ? 'bg-brand-primary text-black font-black shadow-[0_0_12px_rgba(0,176,148,0.5)]' 
                              : 'border-2 border-text-secondary/60 hover:border-brand-primary bg-bg-card'
                          }`}
                        >
                          {task.done && <Check size={15} strokeWidth={3.5} />}
                        </button>

                        <div className="p-2.5 rounded-xl bg-brand-primary/15 text-brand-primary border border-brand-primary/30 flex-shrink-0 hidden sm:flex">
                          <TaskIcon size={18} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[10px] font-black px-2.5 py-0.5 rounded-md bg-brand-primary/15 text-brand-primary border border-brand-primary/30">
                              {meta.category}
                            </span>
                            <span className="text-[10px] font-black text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md">
                              +15 XP
                            </span>
                          </div>
                          <p className={`text-sm md:text-base font-extrabold truncate ${task.done ? 'line-through text-text-secondary opacity-70' : 'text-text-main'}`}>
                            {task.title}
                          </p>
                          <p className="text-xs font-semibold text-text-secondary flex items-center gap-1.5 mt-1">
                            <Lightbulb size={12} className="text-amber-400 flex-shrink-0" />
                            <span className="truncate">{meta.reason}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0">
                        {syncingTaskId === task.id && (
                          <Spinner size={16} />
                        )}
                        <span className="text-xs font-bold text-text-main bg-text-main/10 border border-text-main/10 px-3 py-1 rounded-xl">
                          {task.estimated_time || '30 min'}
                        </span>
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onTabChange?.(task.target_tab);
                          }}
                          className="px-4 py-2 rounded-xl bg-brand-primary/15 hover:bg-brand-primary hover:text-black text-brand-primary font-black text-xs border border-brand-primary/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                          title="Ir para atividade"
                        >
                          <span>Iniciar</span>
                          <Play size={12} fill="currentColor" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTask(task.id, e)}
                          className="p-1.5 rounded-lg text-text-secondary hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Custom Task Toggle */}
            <div className="mb-6">
              {!showAddTask ? (
                <button
                  onClick={() => setShowAddTask(true)}
                  className="text-xs font-bold text-brand-primary hover:opacity-80 flex items-center gap-1.5 bg-brand-primary/10 border border-brand-primary/20 px-3.5 py-2 rounded-xl transition-all"
                >
                  <Plus size={14} /> Adicionar tarefa personalizada
                </button>
              ) : (
                <form onSubmit={handleCreateTask} className="bg-bg-main/60 p-4 rounded-2xl border border-border-color space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text-main">Nova Tarefa para Hoje</span>
                    <button type="button" onClick={() => setShowAddTask(false)} className="text-xs text-text-secondary">Cancelar</button>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input 
                      type="text"
                      placeholder="Ex: Resolver 15 questões de Biologia..."
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="flex-1 bg-bg-main border border-border-color rounded-xl px-3.5 py-2 text-xs text-text-main focus:outline-none focus:border-brand-primary"
                      required
                    />
                    <select
                      value={newTaskTime}
                      onChange={(e) => setNewTaskTime(e.target.value)}
                      className="bg-bg-main border border-border-color rounded-xl px-3 py-2 text-xs text-text-secondary focus:outline-none focus:border-brand-primary"
                    >
                      <option value="15 min">15 min</option>
                      <option value="30 min">30 min</option>
                      <option value="45 min">45 min</option>
                      <option value="60 min">60 min</option>
                    </select>
                    <button
                      type="submit"
                      disabled={creatingTask}
                      className="bg-brand-primary hover:bg-emerald-400 text-black font-bold text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-50"
                    >
                      {creatingTask ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Bottom CTA */}
            {!loading && tasks.length > 0 && (
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-border-color/40">
                <p className="text-xs font-medium text-text-secondary opacity-70 flex items-center gap-1.5">
                  <Zap size={14} className="text-amber-400 fill-amber-400" />
                  Concluir todas as tarefas concede <span className="text-brand-primary font-bold">+50 XP bônus</span>
                </p>

                <button 
                  onClick={() => {
                    const firstPending = tasks.find(t => !t.done);
                    if (firstPending) {
                      onTabChange?.(firstPending.target_tab);
                    } else {
                      onTabChange?.('questions');
                    }
                  }}
                  className="w-full sm:w-auto bg-gradient-to-r from-brand-primary to-emerald-400 hover:from-emerald-400 hover:to-brand-primary text-black font-black text-sm px-8 py-4 rounded-2xl transition-all shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-3 cursor-pointer"
                >
                  Continuar missão do dia <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </motion.div>

        {/* LOWER SECTION: ENEM OVERVIEW & AI DIAGNOSTIC */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10">
          {/* ENEM Areas Overview (8 cols) */}
          <motion.div 
            variants={itemVariants}
            className="lg:col-span-8 bg-bg-card/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-6 md:p-8 border border-border-color shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="text-xs font-bold text-brand-primary uppercase tracking-wider block mb-1">Visão Geral do Exame</span>
                <h3 className="text-2xl font-black text-text-main tracking-tight">Áreas do Conhecimento ENEM</h3>
              </div>
              <span className="text-xs font-bold bg-text-main/5 text-text-secondary px-3 py-1.5 rounded-full flex items-center gap-1.5">
                <Target size={14} className="text-brand-primary" /> Matriz de Referência
              </span>
            </div>

            <div className="space-y-3">
              {enemAreasOverview.map((area) => {
                const AreaIcon = area.icon;
                return (
                  <div 
                    key={area.id}
                    className="p-4 rounded-2xl border bg-bg-main/30 border-border-color/40 hover:border-brand-primary/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold flex-shrink-0 group-hover:scale-105 transition-transform">
                        <AreaIcon size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className="text-sm font-bold text-text-main truncate">
                            {area.title}
                          </h4>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${area.dayColor}`}>
                            {area.day}
                          </span>
                          <span className="text-[10px] font-bold text-text-secondary bg-text-main/5 px-2 py-0.5 rounded-md">
                            {area.questions}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-text-secondary opacity-75 line-clamp-1">
                          {area.description}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onTabChange?.(area.targetTab)}
                      className="px-3.5 py-2 rounded-xl bg-brand-primary/10 hover:bg-brand-primary text-brand-primary hover:text-black font-bold text-xs transition-all flex items-center justify-center gap-1.5 flex-shrink-0 cursor-pointer"
                    >
                      <span>Praticar Área</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Right Column: AI Tutor & Approval Forecast (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Approval Forecast Card */}
            <motion.div 
              variants={itemVariants}
              className="bg-bg-card/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-6 border border-border-color shadow-2xl relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-[10px] font-bold text-brand-primary uppercase tracking-wider block mb-1">Rota para Aprovação</span>
                  <h3 className="text-xl font-black text-text-main tracking-tight">Previsão de Nota</h3>
                </div>
                <div className="bg-brand-primary/10 p-2.5 rounded-2xl text-brand-primary">
                  <Trophy size={20} />
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-3xl font-black text-brand-primary">{estimatedScore} pts</span>
                  <span className="text-xs font-bold text-text-secondary opacity-60">Meta: {targetScore}</span>
                </div>
                <p className="text-xs text-text-secondary opacity-75 font-medium">
                  Mantendo seu ritmo, você está estudando acima de 68% dos concorrentes no ENEM.
                </p>
              </div>

              <div className="h-2 bg-bg-main rounded-full overflow-hidden p-0.5">
                <div 
                  className="h-full bg-brand-primary rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.round((estimatedScore / targetScore) * 100))}%` }}
                />
              </div>
            </motion.div>

            {/* AI Tutor Advice Card */}
            <motion.div 
              variants={itemVariants}
              className="bg-emerald-950/20 border border-brand-primary/30 rounded-3xl md:rounded-[40px] p-6 backdrop-blur-xl"
            >
              <div className="flex items-center gap-3 mb-3 text-brand-primary">
                <Bot size={22} />
                <h4 className="text-sm font-black uppercase tracking-wider">Ajuste Inteligente da IA</h4>
              </div>
              <p className="text-xs font-medium text-text-secondary leading-relaxed mb-4">
                {aiAdjusted ? (
                  <span className="text-emerald-400 font-bold">
                    Plano ajustado com sucesso! Amanhã aumentaremos o foco em Biologia.
                  </span>
                ) : (
                  <>
                    Você está evoluindo bem em Matemática. Amanhã podemos reduzir Geometria e aumentar Biologia para equilibrar o simulado.
                  </>
                )}
              </p>

              <button 
                type="button"
                onClick={handleAiAutoAdjust}
                disabled={aiAdjusting || aiAdjusted}
                className="w-full bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary font-bold text-xs py-3 rounded-xl border border-brand-primary/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {aiAdjusting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Ajustando...</span>
                  </>
                ) : aiAdjusted ? (
                  <>
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span>Plano Ajustado</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Aplicar plano automaticamente</span>
                  </>
                )}
              </button>
            </motion.div>
          </div>
        </div>

        {/* CELEBRATION MODAL */}
        <AnimatePresence>
          {showCelebrationModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.8, y: 20 }}
                className="bg-bg-card border border-brand-primary/30 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl text-center space-y-5 relative overflow-hidden"
              >
                <div className="w-16 h-16 mx-auto rounded-full bg-brand-primary/20 text-brand-primary flex items-center justify-center text-3xl">
                  🎉
                </div>

                <div>
                  <h3 className="text-2xl font-black text-text-main">MISSÃO DIÁRIA CONCLUÍDA!</h3>
                  <p className="text-xs font-medium text-text-secondary mt-1">
                    Você concluiu todas as tarefas do seu plano de hoje e garantiu +50 XP bônus!
                  </p>
                </div>

                <div className="bg-bg-main/60 p-4 rounded-2xl border border-border-color text-left space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-secondary font-bold">XP Ganho:</span>
                    <span className="text-brand-primary font-black">+{tasks.length * 15 + 50} XP</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-text-secondary font-bold">Sequência:</span>
                    <span className="text-amber-400 font-black">{user.streak || 1} dias 🔥</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={() => {
                      setShowCelebrationModal(false);
                      onTabChange?.('questions');
                    }}
                    className="w-full bg-gradient-to-r from-brand-primary to-emerald-400 text-black font-black text-xs py-3.5 rounded-xl transition-all shadow-lg shadow-brand-primary/20"
                  >
                    Continuar Estudando (Questões Extras)
                  </button>
                  <button
                    onClick={() => setShowCelebrationModal(false)}
                    className="w-full bg-bg-main text-text-secondary font-bold text-xs py-3 rounded-xl border border-border-color"
                  >
                    Encerrar o Dia
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
