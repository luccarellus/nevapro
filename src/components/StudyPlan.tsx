import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';
import { 
  Target, CheckCircle2, Clock, Sparkles, ArrowRight, 
  Calendar, Award, BookOpen, RotateCcw, Flame, Check,
  PenTool, Calculator, Plus, Trash2, Zap, Play, RefreshCw,
  Trophy, TrendingUp, Bot, ChevronDown, ChevronUp, Lightbulb
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { studyPlanService, StudyTask } from '../services/studyPlanService';

interface StudyPlanProps {
  user: UserProfile;
  onTabChange?: (tab: string) => void;
  onEarnXp?: (amount: number, correct?: number, answered?: number, isFlashQuiz?: boolean, activityName?: string) => void;
}

// Sub-steps generator for each task
interface SubStep {
  id: string;
  label: string;
  done: boolean;
  xp: number;
}

export default function StudyPlan({ user, onTabChange, onEarnXp }: StudyPlanProps) {
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingTaskId, setSyncingTaskId] = useState<string | null>(null);
  const [claimedTaskIds, setClaimedTaskIds] = useState<Set<string>>(new Set());

  // Gamification & UI States
  const [showCelebrationModal, setShowCelebrationModal] = useState(false);
  const [celebrationClaimed, setCelebrationClaimed] = useState(false);
  const [aiAdjusted, setAiAdjusted] = useState(false);
  const [aiAdjusting, setAiAdjusting] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // Sub-steps state per task
  const [subStepsMap, setSubStepsMap] = useState<Record<string, SubStep[]>>({});

  // Form for inline custom task creation
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskTime, setNewTaskTime] = useState('30 min');
  const [newTaskCategory, setNewTaskCategory] = useState<'main' | 'review' | 'essay'>('main');
  const [creatingTask, setCreatingTask] = useState(false);

  // Fetch study plan tasks
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

        // Initialize sub-steps map
        const initialSubSteps: Record<string, SubStep[]> = {};
        loadedTasks.forEach(t => {
          initialSubSteps[t.id] = generateDefaultSubSteps(t.title, t.done);
        });
        setSubStepsMap(initialSubSteps);
      } catch (err) {
        console.error('[StudyPlan] Erro ao carregar tarefas:', err);
        setError('Não foi possível carregar seu plano de estudos.');
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, [user.email]);

  // Generate sub-steps per task
  function generateDefaultSubSteps(title: string, isDone: boolean): SubStep[] {
    const lower = title.toLowerCase();
    if (lower.includes('redação')) {
      return [
        { id: '1', label: 'Ler a proposta e mapear repertórios', done: isDone, xp: 5 },
        { id: '2', label: 'Elaborar o rascunho da estrutura D1/D2', done: isDone, xp: 10 },
        { id: '3', label: 'Revisar conectivos e proposta de intervenção', done: isDone, xp: 10 },
      ];
    }
    if (lower.includes('revisar') || lower.includes('erro')) {
      return [
        { id: '1', label: 'Filtrar últimas questões erradas', done: isDone, xp: 5 },
        { id: '2', label: 'Refazer resolução passo a passo', done: isDone, xp: 10 },
        { id: '3', label: 'Anotar pegadinhas no Caderno de Erros', done: isDone, xp: 5 },
      ];
    }
    return [
      { id: '1', label: 'Revisar teoria principal (5 min)', done: isDone, xp: 5 },
      { id: '2', label: 'Resolver lote de questões fixação', done: isDone, xp: 10 },
      { id: '3', label: 'Analisar gabarito comentado', done: isDone, xp: 5 },
    ];
  }

  // Toggle main task
  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const nextDone = !task.done;
    const isAlreadyClaimed = claimedTaskIds.has(id);

    // Optimistically update main task & its sub-steps
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: nextDone } : t));
    setSubStepsMap(prev => ({
      ...prev,
      [id]: (prev[id] || []).map(s => ({ ...s, done: nextDone }))
    }));

    setSyncingTaskId(id);

    try {
      const { xpEarned } = await studyPlanService.toggleTask(id, nextDone);

      if (nextDone && xpEarned > 0 && !isAlreadyClaimed && onEarnXp) {
        setClaimedTaskIds(prev => new Set(prev).add(id));
        onEarnXp(xpEarned, 0, 0, false, `Missão diária: ${task.title.split('-')[0]}`);
        
        confetti({
          particleCount: 45,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#06b6d4', '#10b981', '#f59e0b', '#ffffff'],
        });
      }

      // Check if ALL tasks are completed to fire Celebration Modal
      const remainingPending = tasks.filter(t => t.id !== id && !t.done);
      if (nextDone && remainingPending.length === 0 && !celebrationClaimed) {
        setTimeout(() => {
          setShowCelebrationModal(true);
          setCelebrationClaimed(true);
          // Award +50 XP bonus for completing entire daily mission
          if (onEarnXp) {
            onEarnXp(50, 0, 0, false, 'Bônus: Missão Diária Concluída!');
          }
          confetti({
            particleCount: 120,
            spread: 100,
            origin: { y: 0.5 },
            colors: ['#06b6d4', '#10b981', '#fbbf24', '#a855f7', '#ffffff'],
          });
        }, 500);
      }
    } catch (err) {
      console.error('[StudyPlan] Erro ao atualizar tarefa:', err);
      // Rollback
      setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !nextDone } : t));
    } finally {
      setSyncingTaskId(null);
    }
  };

  // Toggle single sub-step
  const toggleSubStep = (taskId: string, subStepId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSubStepsMap(prev => {
      const steps = prev[taskId] || [];
      const updated = steps.map(s => s.id === subStepId ? { ...s, done: !s.done } : s);
      const allSubDone = updated.every(s => s.done);
      
      // If all sub-steps completed, complete the parent task as well!
      if (allSubDone && !tasks.find(t => t.id === taskId)?.done) {
        toggleTask(taskId);
      }
      return { ...prev, [taskId]: updated };
    });
  };

  // Create custom task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setCreatingTask(true);
    try {
      const created = await studyPlanService.createTask({
        title: newTaskTitle.trim(),
        estimated_time: newTaskTime,
        target_tab: newTaskCategory === 'essay' ? 'redacao' : newTaskCategory === 'review' ? 'errors' : 'questions',
      });
      setTasks(prev => [...prev, created]);
      setSubStepsMap(prev => ({
        ...prev,
        [created.id]: generateDefaultSubSteps(created.title, false)
      }));
      setNewTaskTitle('');
      setShowAddTask(false);
    } catch (err) {
      console.error('[StudyPlan] Erro ao criar tarefa:', err);
    } finally {
      setCreatingTask(false);
    }
  };

  // Delete task
  const handleDeleteTask = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await studyPlanService.deleteTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('[StudyPlan] Erro ao deletar tarefa:', err);
    }
  };

  // AI Auto-Adjust Plan action
  const handleAiAutoAdjust = () => {
    setAiAdjusting(true);
    setTimeout(() => {
      setAiAdjusting(false);
      setAiAdjusted(true);
      confetti({
        particleCount: 35,
        spread: 50,
        origin: { y: 0.6 },
        colors: ['#a855f7', '#06b6d4', '#ffffff'],
      });
    }, 1200);
  };

  // Calculated Metrics
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

  const earnedXpToday = completedCount * 15 + (allCompleted ? 50 : 0);

  // Approval Rate & Forecast score calculation
  const userQuestions = user.answeredQuestions || 0;
  const userCorrect = user.correctAnswers || 0;
  const userAccuracy = userQuestions > 0 ? Math.round((userCorrect / userQuestions) * 100) : 70;
  const estimatedScore = Math.min(840, Math.max(560, 620 + Math.round(userQuestions * 0.4) + Math.round((userAccuracy - 50) * 2.5)));
  const targetScore = 760;

  // Task Categorization Helper
  const getTaskCategoryInfo = (title: string) => {
    const lower = title.toLowerCase();
    if (lower.includes('redação') || lower.includes('português') || lower.includes('literatura') || lower.includes('linguagens')) {
      return {
        block: 'essay',
        blockTitle: '✍️ Redação & Prática',
        icon: PenTool,
        difficulty: '🟡 Médio',
        difficultyBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        badgeBg: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
        reason: 'Sua pontuação na última redação esteve próxima da meta. Manter a prática garante 900+.',
        xp: '+25 XP',
      };
    }
    if (lower.includes('erro') || lower.includes('revisar') || lower.includes('pendência')) {
      return {
        block: 'review',
        blockTitle: '📚 Revisão & Pendências',
        icon: RotateCcw,
        difficulty: '🔴 Prioridade Alta',
        difficultyBg: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        reason: 'Você perdeu 38% das questões dessa área nesta semana. Revisar agora fixa o aprendizado.',
        xp: '+20 XP',
      };
    }
    if (lower.includes('matemática') || lower.includes('geometria') || lower.includes('pa') || lower.includes('física') || lower.includes('exatas')) {
      return {
        block: 'main',
        blockTitle: '🎯 Missão Principal',
        icon: Calculator,
        difficulty: '🟡 Médio',
        difficultyBg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
        badgeBg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
        reason: 'Matemática tem o maior peso TRI no ENEM. Domine a Geometria e PA hoje.',
        xp: '+15 XP',
      };
    }
    return {
      block: 'main',
      blockTitle: '🎯 Missão Principal',
      icon: Target,
      difficulty: '🟢 Fácil',
      difficultyBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      badgeBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      reason: 'Foco na consolidação de matérias de alta incidência na prova.',
      xp: '+15 XP',
    };
  };

  // Group tasks into blocks
  const categorizedTasks = useMemo(() => {
    const main: StudyTask[] = [];
    const review: StudyTask[] = [];
    const essay: StudyTask[] = [];

    tasks.forEach(task => {
      const cat = getTaskCategoryInfo(task.title).block;
      if (cat === 'essay') essay.push(task);
      else if (cat === 'review') review.push(task);
      else main.push(task);
    });

    return { main, review, essay };
  }, [tasks]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35 } }
  };

  // Weekly Schedule Days with Status
  const weekDays = [
    { day: 'SEG', label: 'Segunda', stars: '★★★★★', done: true },
    { day: 'TER', label: 'Terça', stars: '★★★★★', done: true },
    { day: 'QUA', label: 'Quarta', stars: '★★★★☆', done: true },
    { day: 'QUI', label: 'Quinta (Hoje)', stars: progressPercent > 50 ? '★★★★★' : '★★★☆☆', isToday: true, done: allCompleted },
    { day: 'SEX', label: 'Sexta', stars: '☆☆☆☆☆', isUpcoming: true },
    { day: 'SÁB', label: 'Sábado', stars: '☆☆☆☆☆', isUpcoming: true },
    { day: 'DOM', label: 'Domingo', stars: '☆☆☆☆☆', isUpcoming: true },
  ];

  return (
    <div className="max-w-6xl mx-auto pt-20 pb-32 px-4 md:px-8 font-sans">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* ================= 13. TOP STATS BAR ================= */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
          <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-2xl flex items-center gap-3 backdrop-blur-xl shadow-md">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
              <Clock size={18} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Estudo Hoje</p>
              <p className="text-sm font-black text-white">{completedMinutes} / {totalMinutes} min</p>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-2xl flex items-center gap-3 backdrop-blur-xl shadow-md">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20">
              <Zap size={18} fill="currentColor" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">XP Ganho Hoje</p>
              <p className="text-sm font-black text-amber-300">+{earnedXpToday} XP</p>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-2xl flex items-center gap-3 backdrop-blur-xl shadow-md">
            <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20">
              <Flame size={18} fill="currentColor" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Sequência</p>
              <p className="text-sm font-black text-white">{user.streak || 1} dias 🔥</p>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-2xl flex items-center gap-3 backdrop-blur-xl shadow-md">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              <BookOpen size={18} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Matérias Hoje</p>
              <p className="text-sm font-black text-white">3 Áreas</p>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-2xl flex items-center gap-3 backdrop-blur-xl col-span-2 sm:col-span-1 shadow-md">
            <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/20">
              <Target size={18} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Meta Diária</p>
              <p className="text-sm font-black text-purple-300">{progressPercent}% Concluída</p>
            </div>
          </div>
        </motion.div>

        {/* ================= 8. ROTA DE APROVAÇÃO (SCORE PREDICTION CARD) ================= */}
        <motion.div 
          variants={itemVariants}
          className="bg-gradient-to-r from-indigo-950/70 via-slate-900/90 to-cyan-950/70 border border-indigo-500/30 backdrop-blur-2xl rounded-3xl p-6 md:p-7 mb-8 shadow-xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-indigo-300 text-xs font-black uppercase tracking-widest">
                <Trophy size={16} className="text-amber-400" /> Rota para Aprovação no ENEM
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                Nota Prevista: <span className="text-cyan-300 font-extrabold text-3xl md:text-4xl">{estimatedScore} pts</span>
                <span className="text-xs font-bold text-slate-400 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700">
                  Meta: <strong className="text-emerald-400">{targetScore} pts</strong>
                </span>
              </h2>
              <p className="text-xs font-medium text-slate-300/90 flex items-center gap-2">
                <TrendingUp size={14} className="text-emerald-400" />
                Mantendo o ritmo atual, você está estudando **acima de 68% dos concorrentes** no ENEM.
              </p>
            </div>

            {/* Visual Gauge */}
            <div className="w-full lg:w-72 bg-slate-950/80 p-4 rounded-2xl border border-slate-800/90 shadow-inner">
              <div className="flex justify-between items-center text-xs font-bold mb-2">
                <span className="text-slate-400">Prontidão para Aprovação</span>
                <span className="text-cyan-400 font-black">{Math.round((estimatedScore / targetScore) * 100)}%</span>
              </div>
              <div className="h-3 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800 relative">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 rounded-full shadow-[0_0_12px_rgba(34,211,238,0.5)] transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.round((estimatedScore / targetScore) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ================= 14. MASCOTE / PERSONALIZED AI TUTOR BANNER ================= */}
        <motion.div 
          variants={itemVariants}
          className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 md:p-5 mb-8 flex items-start gap-4 backdrop-blur-xl shadow-md"
        >
          <div className="p-3 rounded-2xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex-shrink-0">
            <Bot size={26} />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-black text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🤖</span> Tutor IA Personalizado
            </h4>
            <p className="text-xs md:text-sm font-medium text-slate-200 leading-relaxed">
              Olá, <strong className="text-white">{user.name || 'Estudante'}</strong>! Analisei o seu histórico recente. Hoje foquei o seu plano em <strong>Matemática (Geometria)</strong> e na <strong>Revisão de Erros</strong> para consolidar sua aprovação.
            </p>
          </div>
        </motion.div>

        {/* ================= 1 & 2. HERO CARD: DAILY MISSION HEADER & REAL PROGRESS ================= */}
        <motion.div 
          variants={itemVariants}
          className="bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-cyan-950/40 backdrop-blur-2xl rounded-3xl md:rounded-[36px] p-6 md:p-9 border border-cyan-500/25 shadow-[0_0_40px_rgba(6,182,212,0.12)] mb-10 relative overflow-hidden"
        >
          <div className="relative z-10">
            {/* Header Title & Bonus Badge */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-7 pb-6 border-b border-slate-800/80">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 border px-3 py-1 rounded-full text-[11px] font-black tracking-wide ${
                    allCompleted 
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)]' 
                      : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                  }`}>
                    <Sparkles size={13} className={allCompleted ? 'text-emerald-400' : 'text-cyan-400 animate-pulse'} /> 
                    {allCompleted ? '🎉 Dia Concluído!' : `🎯 Missão de Hoje • ${completedCount}/${tasks.length} Concluídas`}
                  </span>

                  <span className="bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-black px-3 py-1 rounded-full flex items-center gap-1">
                    <Award size={12} className="text-amber-400" /> +50 XP Bônus ao Concluir Tudo
                  </span>
                </div>

                <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                  Complete {totalMinutes} minutos de estudo para manter sua sequência de {user.streak || 1} dias.
                </h2>
                <p className="text-xs font-semibold text-slate-400">
                  {tasks.length} tarefas agendadas • +15 XP cada • Ganho potencial: +{tasks.length * 15 + 50} XP hoje
                </p>
              </div>

              {/* Real Detailed Progress Bar */}
              <div className="w-full lg:w-80 bg-slate-950/80 p-4.5 rounded-2xl border border-slate-800 shadow-inner space-y-2.5">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-slate-300">{completedMinutes} / {totalMinutes} minutos</span>
                  <span className="text-cyan-400 font-black text-sm">{progressPercent}%</span>
                </div>
                
                <div className="h-3.5 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800 relative">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.5)] relative overflow-hidden"
                  />
                </div>

                <div className="flex justify-between items-center text-[10px] font-extrabold text-slate-400">
                  <span>{completedCount} de {tasks.length} tarefas</span>
                  <span className="text-amber-300">+{earnedXpToday} XP acumulados</span>
                </div>
              </div>
            </div>

            {/* Loading / Error States */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-14 gap-3">
                <div className="animate-spin rounded-full h-9 w-9 border-2 border-cyan-400 border-t-transparent" />
                <p className="text-xs font-bold text-slate-400">Montando missões personalizadas...</p>
              </div>
            )}

            {error && !loading && (
              <div className="text-center py-10 bg-rose-500/10 border border-rose-500/30 rounded-2xl">
                <p className="text-rose-300 font-bold text-sm">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-3 text-xs font-black text-cyan-400 hover:text-cyan-300 underline flex items-center justify-center gap-1.5 mx-auto"
                >
                  <RefreshCw size={14} /> Tentar novamente
                </button>
              </div>
            )}

            {/* ================= 6. CATEGORIZED TASK BLOCKS ================= */}
            {!loading && !error && tasks.length > 0 && (
              <div className="space-y-8 mb-8">
                {/* BLOCK 1: MISSÃO PRINCIPAL */}
                {categorizedTasks.main.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-cyan-300 pb-1 border-b border-slate-800">
                      <Target size={15} /> Missão Principal
                    </div>
                    {categorizedTasks.main.map((task) => renderTaskCard(task))}
                  </div>
                )}

                {/* BLOCK 2: REVISÃO */}
                {categorizedTasks.review.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300 pb-1 border-b border-slate-800">
                      <RotateCcw size={15} /> Revisão & Pendências
                    </div>
                    {categorizedTasks.review.map((task) => renderTaskCard(task))}
                  </div>
                )}

                {/* BLOCK 3: REDAÇÃO */}
                {categorizedTasks.essay.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-300 pb-1 border-b border-slate-800">
                      <PenTool size={15} /> Redação & Prática
                    </div>
                    {categorizedTasks.essay.map((task) => renderTaskCard(task))}
                  </div>
                )}
              </div>
            )}

            {/* Custom Task Inline Form Toggle */}
            <div className="mb-6">
              {!showAddTask ? (
                <button
                  onClick={() => setShowAddTask(true)}
                  className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 px-4 py-2.5 rounded-xl transition-all shadow-sm"
                >
                  <Plus size={14} /> Adicionar meta personalizada ao plano
                </button>
              ) : (
                <form onSubmit={handleCreateTask} className="bg-slate-950/90 p-4 md:p-5 rounded-2xl border border-slate-800 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white flex items-center gap-2">
                      <Plus size={14} className="text-cyan-400" /> Nova Meta de Estudo
                    </span>
                    <button 
                      type="button" 
                      onClick={() => setShowAddTask(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <input 
                      type="text"
                      placeholder="Ex: Resolver 20 questões de Física sobre Mecânica..."
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="sm:col-span-6 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                      required
                    />
                    <select
                      value={newTaskCategory}
                      onChange={(e) => setNewTaskCategory(e.target.value as any)}
                      className="sm:col-span-3 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-400"
                    >
                      <option value="main">Missão Principal</option>
                      <option value="review">Revisão</option>
                      <option value="essay">Redação</option>
                    </select>
                    <select
                      value={newTaskTime}
                      onChange={(e) => setNewTaskTime(e.target.value)}
                      className="sm:col-span-3 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-400"
                    >
                      <option value="15 min">15 min</option>
                      <option value="30 min">30 min</option>
                      <option value="45 min">45 min</option>
                      <option value="60 min">60 min</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={creatingTask}
                    className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs py-2.5 rounded-xl transition-all disabled:opacity-50"
                  >
                    {creatingTask ? 'Salving...' : 'Adicionar ao Plano'}
                  </button>
                </form>
              )}
            </div>

            {/* ================= 7. IMPACT OF COMPLETION FOOTER & MAIN CTA ================= */}
            {!loading && tasks.length > 0 && (
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pt-5 border-t border-slate-800/80">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Impacto de Conclusão da Missão:</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-300">
                    <span className="bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <Zap size={13} className="text-amber-400 fill-amber-400" /> +{tasks.length * 15 + 50} XP
                    </span>
                    <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <TrendingUp size={13} className="text-emerald-400" /> +0,8% Progresso Semanal
                    </span>
                    <span className="bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <Flame size={13} className="text-rose-400 fill-rose-400" /> +1 Dia de Streak
                    </span>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    const firstPending = tasks.find(t => !t.done);
                    if (firstPending) {
                      onTabChange?.(firstPending.target_tab);
                    } else {
                      onTabChange?.('questions');
                    }
                  }}
                  className="w-full lg:w-auto bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 font-black text-sm px-8 py-3.5 rounded-2xl transition-all shadow-[0_0_20px_rgba(34,211,238,0.35)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  {allCompleted ? (
                    <>
                      <span>Treinar Questões Extras</span>
                      <ArrowRight size={18} />
                    </>
                  ) : (
                    <>
                      <span>Continuar missão do dia</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </motion.div>

        {/* ================= 9, 10, 11. LOWER GRID: GAMIFIED WEEKLY CALENDAR & AI ADVICE & NEXT BADGE ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10">
          {/* ================= 9. CRONOGRAMA SEMANAL GAMIFICADO (8 cols) ================= */}
          <motion.div 
            variants={itemVariants}
            className="lg:col-span-8 bg-slate-900/70 backdrop-blur-xl rounded-3xl p-6 md:p-8 border border-slate-800 shadow-xl"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="text-xs font-black text-cyan-400 uppercase tracking-widest block mb-1">Rotina Semanal Gamificada</span>
                <h3 className="text-2xl font-black text-white tracking-tight">Calendário de Desempenho</h3>
              </div>
              <span className="text-xs font-bold bg-slate-800 text-slate-300 px-3 py-1.5 rounded-full border border-slate-700 flex items-center gap-1.5">
                <Calendar size={14} className="text-cyan-400" /> Semana Atual
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-7 gap-2.5">
              {weekDays.map((item, i) => (
                <div 
                  key={i}
                  className={`p-3 rounded-2xl border flex sm:flex-col justify-between items-center text-center transition-all ${
                    item.done
                      ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                      : item.isToday
                      ? 'bg-cyan-500/15 border-cyan-500/50 ring-1 ring-cyan-500/40 text-white'
                      : 'bg-slate-950/40 border-slate-800 text-slate-500'
                  }`}
                >
                  <span className="text-xs font-black uppercase tracking-wider">{item.day}</span>
                  <div className="my-1.5 text-xs text-amber-400 tracking-tighter">
                    {item.stars}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    item.done ? 'bg-emerald-500/20 text-emerald-400' : item.isToday ? 'bg-cyan-400 text-slate-950 font-black' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {item.done ? '✓ Feito' : item.isToday ? `${progressPercent}%` : '🔒'}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* RIGHT COLUMN (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* ================= 10. CARTÃO DA IA COM AJUSTE AUTOMÁTICO ================= */}
            <motion.div 
              variants={itemVariants}
              className="bg-indigo-950/30 border border-indigo-500/30 rounded-3xl p-6 backdrop-blur-xl shadow-xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-300">
                  <Bot size={20} className="text-indigo-400" />
                  <h4 className="text-xs font-black uppercase tracking-wider">Tutor IA Recomenda</h4>
                </div>
                <span className="text-[10px] font-extrabold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-md">Ativo</span>
              </div>

              <p className="text-xs font-medium text-slate-200 leading-relaxed">
                {aiAdjusted ? (
                  <span className="text-emerald-300 font-bold">
                    ✨ Plano otimizado com sucesso! Biologia recebeu mais foco para amanhã.
                  </span>
                ) : (
                  <>
                    Você está evoluindo bem em Matemática. Amanhã reduziremos Geometria e aumentaremos a carga de <strong>Biologia</strong> para equilibrar o simulado.
                  </>
                )}
              </p>

              <button 
                type="button"
                onClick={handleAiAutoAdjust}
                disabled={aiAdjusting || aiAdjusted}
                className="w-full bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 font-bold text-xs py-3 rounded-xl border border-indigo-500/40 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {aiAdjusting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Ajustando o plano...</span>
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

            {/* ================= 11. PRÓXIMA CONQUISTA / MEDALHA ================= */}
            <motion.div 
              variants={itemVariants}
              className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 backdrop-blur-xl shadow-xl"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Award size={14} /> Próxima Conquista
                </span>
                <span className="text-xs font-black text-amber-300">Faltam 35 XP</span>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 flex items-center gap-3">
                <div className="p-3 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Trophy size={22} />
                </div>
                <div>
                  <h5 className="text-xs font-black text-white">Mestre da Geometria</h5>
                  <p className="text-[10px] font-semibold text-slate-400">Complete 3 missões de exatas</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* ================= 15. CELEBRATION MODAL (ON MISSION COMPLETED) ================= */}
        <AnimatePresence>
          {showCelebrationModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
            >
              <motion.div
                initial={{ scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.8, y: 20 }}
                className="bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/90 border border-cyan-500/40 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl shadow-cyan-500/20 text-center space-y-6 relative overflow-hidden"
              >
                <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-tr from-cyan-400 to-emerald-400 p-0.5 shadow-[0_0_30px_rgba(34,211,238,0.6)]">
                  <div className="w-full h-full bg-slate-950 rounded-full flex items-center justify-center text-4xl">
                    🎉
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-white">MISSÃO DIÁRIA CONCLUÍDA!</h3>
                  <p className="text-xs font-medium text-slate-300">
                    Você executou 100% das tarefas de hoje e garantiu a sua evolução para o ENEM.
                  </p>
                </div>

                {/* Reward breakdown */}
                <div className="grid grid-cols-2 gap-3 text-left">
                  <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-2xl">
                    <p className="text-[10px] font-black text-amber-400 uppercase">XP Total Hoje</p>
                    <p className="text-lg font-black text-white">+{earnedXpToday} XP</p>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-2xl">
                    <p className="text-[10px] font-black text-rose-400 uppercase">Streak Manter</p>
                    <p className="text-lg font-black text-white">{user.streak || 1} Dias 🔥</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 pt-2">
                  <button
                    onClick={() => {
                      setShowCelebrationModal(false);
                      onTabChange?.('questions');
                    }}
                    className="w-full bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 font-black text-sm py-3.5 rounded-2xl transition-all shadow-lg shadow-cyan-500/20"
                  >
                    Continuar Estudando (Questões Extras)
                  </button>
                  <button
                    onClick={() => setShowCelebrationModal(false)}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs py-3 rounded-2xl transition-colors"
                  >
                    Encerrar o Dia por Hoje
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );

  // Helper render for single task card
  function renderTaskCard(task: StudyTask) {
    const info = getTaskCategoryInfo(task.title);
    const TaskIcon = info.icon;
    const isExpanded = expandedTaskId === task.id;
    const subSteps = subStepsMap[task.id] || [];

    return (
      <motion.div 
        key={task.id}
        whileHover={{ scale: 1.006 }}
        transition={{ duration: 0.15 }}
        className={`group rounded-2xl border transition-all duration-200 shadow-md ${
          task.done 
            ? 'bg-cyan-950/20 border-cyan-500/20 text-slate-300/80' 
            : 'bg-slate-950/80 border-slate-800 hover:border-cyan-500/40 text-white'
        }`}
      >
        <div 
          className="p-4 md:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer"
          onClick={() => toggleTask(task.id)}
        >
          {/* Left Checkbox + Subject Icon + Title */}
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleTask(task.id);
              }}
              className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all duration-200 flex-shrink-0 ${
                task.done 
                  ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.4)] scale-105' 
                  : 'bg-slate-900/90 border-2 border-slate-600 hover:border-cyan-400 group-hover:bg-cyan-500/10'
              }`}
            >
              {task.done && <Check size={16} strokeWidth={3.5} />}
            </button>

            <div className={`p-2 rounded-xl border flex-shrink-0 hidden sm:flex items-center justify-center ${info.badgeBg}`}>
              <TaskIcon size={18} />
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Dificuldade Badge */}
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${info.difficultyBg}`}>
                  {info.difficulty}
                </span>

                {/* Recompensas Chips */}
                <span className="text-[10px] font-black bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Zap size={10} className="fill-amber-400" /> {info.xp}
                </span>

                <span className="text-[10px] font-black bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                  +3 Consistência
                </span>

                {task.done && (
                  <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <CheckCircle2 size={10} /> Concluída
                  </span>
                )}
              </div>

              <p className={`text-sm md:text-base font-bold truncate transition-colors ${
                task.done ? 'line-through opacity-50 text-slate-400' : 'text-white group-hover:text-cyan-200'
              }`}>
                {task.title}
              </p>

              {/* 5. RAZÃO DA IA (POR QUE APARECEU?) */}
              <p className="text-[11px] font-medium text-slate-400/90 flex items-center gap-1.5 pt-0.5">
                <Lightbulb size={12} className="text-amber-400 flex-shrink-0" />
                <span className="truncate">{info.reason}</span>
              </p>
            </div>
          </div>

          {/* Right Action & Controls */}
          <div className="flex items-center justify-between sm:justify-end gap-2.5 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
            {syncingTaskId === task.id && (
              <div className="animate-spin w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full" />
            )}

            <span className="text-xs font-bold text-slate-300 bg-slate-900/90 border border-slate-700/60 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
              <Clock size={13} className="text-cyan-400" />
              {task.estimated_time || '30 min'}
            </span>

            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTabChange?.(task.target_tab);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 font-bold text-xs transition-all flex items-center gap-1.5 hover:translate-x-0.5"
              title="Iniciar Atividade"
            >
              <span className="hidden md:inline">Praticar</span>
              <Play size={12} fill="currentColor" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedTaskId(isExpanded ? null : task.id);
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-900 border border-slate-800"
              title="Ver sub-etapas"
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            <button
              type="button"
              onClick={(e) => handleDeleteTask(task.id, e)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
              title="Remover tarefa"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* 12. SUB-ETAPAS / CHECKLIST EM ETAPAS */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-4 pb-4 pt-1 border-t border-slate-800/60 bg-slate-950/40 space-y-2 rounded-b-2xl"
            >
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Etapas de Execução:</p>
              <div className="space-y-1.5">
                {subSteps.map((sub) => (
                  <div
                    key={sub.id}
                    onClick={(e) => toggleSubStep(task.id, sub.id, e)}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/60 cursor-pointer text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded-md flex items-center justify-center ${
                        sub.done ? 'bg-emerald-400 text-slate-950 font-bold' : 'border border-slate-600'
                      }`}>
                        {sub.done && <Check size={12} strokeWidth={3} />}
                      </div>
                      <span className={sub.done ? 'line-through text-slate-500' : 'text-slate-200'}>
                        {sub.label}
                      </span>
                    </div>
                    <span className="text-[10px] font-extrabold text-amber-300">+{sub.xp} XP</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }
}
