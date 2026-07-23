import { useState } from 'react';
import { motion } from 'motion/react';
import { UserProfile } from '../types';
import { 
  Target, CheckCircle2, Clock, Sparkles, ArrowRight, 
  Calendar, Award, BookOpen, RotateCcw, Flame, Check, ChevronRight
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface StudyPlanProps {
  user: UserProfile;
  onTabChange?: (tab: string) => void;
  onEarnXp?: (amount: number, correct?: number, answered?: number, isFlashQuiz?: boolean, activityName?: string) => void;
}

export default function StudyPlan({ user, onTabChange, onEarnXp }: StudyPlanProps) {
  const [dailyTasks, setDailyTasks] = useState([
    { id: 'math', title: 'Matemática - 15 questões de Geometria e PA', time: '45 min', done: false, targetTab: 'questions' },
    { id: 'errors', title: 'Revisar 8 erros pendentes no Caderno', time: '20 min', done: false, targetTab: 'errors' },
    { id: 'essay', title: 'Praticar Redação: Eixo Temático Meio Ambiente', time: '30 min', done: false, targetTab: 'redacao' }
  ]);

  const [weeklyGoal] = useState({
    questions: { current: 182, target: 250 },
    essays: { current: 2, target: 2 },
    simulations: { current: 1, target: 1 }
  });

  const toggleTask = (id: string) => {
    setDailyTasks(prev => prev.map(t => {
      if (t.id === id) {
        const nextState = !t.done;
        if (nextState && onEarnXp) {
          onEarnXp(25, 1, 1, false, `Missão diária: ${t.title.split('-')[0]}`);
          confetti({
            particleCount: 40,
            spread: 50,
            origin: { y: 0.7 },
            colors: ['#00b094', '#22d3ee', '#ffffff']
          });
        }
        return { ...t, done: nextState };
      }
      return t;
    }));
  };

  const completedCount = dailyTasks.filter(t => t.done).length;
  const progressPercent = Math.round((completedCount / dailyTasks.length) * 100);

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

  const weeklyDays = [
    { day: 'Segunda', subject: 'Matemática & Física', topics: 'Funções & Cinemática', status: 'completed' },
    { day: 'Terça', subject: 'Química & Biologia', topics: 'Estequiometria & Ecologia', status: 'completed' },
    { day: 'Quarta', subject: 'História & Geografia', topics: 'Brasil Colônia & Geopolítica', status: 'active' },
    { day: 'Quinta', subject: 'Linguagens & Filosofia', topics: 'Interpretação & Ética', status: 'pending' },
    { day: 'Sexta', subject: 'Matemática & Redação', topics: 'Geometria Espacial & Tese', status: 'pending' },
    { day: 'Sábado', subject: 'Simulado ENEM Dia 1', topics: 'Humanas e Linguagens', status: 'pending' },
    { day: 'Domingo', subject: 'Revisão de Erros', topics: 'Análise de Desempenho', status: 'pending' }
  ];

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
            <div className="flex items-center gap-3 text-cyan-400 text-xs font-bold mb-3 uppercase tracking-wider">
              <Target size={16} /> Plano de Estudos Personalizado
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-text-main leading-tight">
              Sua rota de aprovação no <span className="text-cyan-400">ENEM</span>
            </h1>
            <p className="text-text-secondary text-xs md:text-sm font-medium mt-2 max-w-xl">
              Organize seus estudos diários, acompanhe metas semanais e execute o plano ajustado pelo tutor IA.
            </p>
          </motion.div>

          <motion.div variants={itemVariants} className="flex items-center gap-3 bg-bg-card/60 backdrop-blur-xl p-4 rounded-2xl border border-border-color">
            <div className="bg-cyan-500/10 p-3 rounded-xl text-cyan-400">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-text-secondary opacity-60 uppercase">Tempo Estimado Hoje</p>
              <p className="text-xl font-black text-text-main">1h 35 min</p>
            </div>
          </motion.div>
        </header>

        {/* Hero Section: Today's Mission */}
        <motion.div 
          variants={itemVariants}
          className="bg-gradient-to-br from-cyan-950/40 via-bg-card/60 to-bg-card/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-6 md:p-10 border border-cyan-500/20 shadow-2xl shadow-cyan-950/20 mb-10 relative overflow-hidden group"
        >
          <div className="relative z-10">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8">
              <div>
                <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 rounded-full text-cyan-400 text-[11px] font-black w-fit mb-3">
                  <Sparkles size={12} /> Missão de Hoje • {completedCount}/{dailyTasks.length} Concluídas
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-text-main tracking-tight">🎯 Continue seus estudos</h2>
              </div>

              {/* Progress Bar */}
              <div className="w-full lg:w-64 bg-bg-main/50 p-3 rounded-2xl border border-border-color/40">
                <div className="flex justify-between items-center text-xs font-bold mb-2">
                  <span className="text-text-secondary opacity-70">Progresso diário</span>
                  <span className="text-cyan-400 font-black">{progressPercent}%</span>
                </div>
                <div className="h-2.5 bg-bg-main rounded-full overflow-hidden p-0.5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.8 }}
                    className="h-full bg-gradient-to-r from-cyan-500 to-brand-primary rounded-full shadow-[0_0_12px_rgba(34,211,238,0.4)]"
                  />
                </div>
              </div>
            </div>

            {/* Daily Task Checklist */}
            <div className="space-y-4 mb-8">
              {dailyTasks.map((task) => (
                <motion.div 
                  key={task.id}
                  whileHover={{ scale: 1.01 }}
                  className={`p-4 md:p-5 rounded-2xl border transition-all flex items-center justify-between gap-4 cursor-pointer ${
                    task.done 
                      ? 'bg-cyan-500/10 border-cyan-500/30 text-text-secondary' 
                      : 'bg-bg-main/40 border-border-color/60 hover:border-cyan-500/50 text-text-main'
                  }`}
                  onClick={() => toggleTask(task.id)}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <button 
                      className={`w-6 h-6 rounded-xl flex items-center justify-center transition-all ${
                        task.done 
                          ? 'bg-cyan-400 text-black shadow-[0_0_10px_rgba(34,211,238,0.5)]' 
                          : 'border-2 border-text-secondary/40 hover:border-cyan-400'
                      }`}
                    >
                      {task.done && <Check size={14} strokeWidth={3} />}
                    </button>
                    <span className={`text-sm md:text-base font-bold truncate ${task.done ? 'line-through opacity-60' : ''}`}>
                      {task.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs font-semibold opacity-60 text-text-secondary bg-text-main/5 px-3 py-1 rounded-xl">
                      {task.time}
                    </span>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onTabChange?.(task.targetTab);
                      }}
                      className="p-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 transition-colors"
                      title="Ir para atividade"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Primary Action CTA */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-border-color/40">
              <p className="text-xs font-medium text-text-secondary opacity-70">
                Concluir tarefas gera <span className="text-brand-primary font-bold">+25 XP cada</span>
              </p>

              <button 
                onClick={() => {
                  const firstPending = dailyTasks.find(t => !t.done);
                  if (firstPending) {
                    onTabChange?.(firstPending.targetTab);
                  } else {
                    onTabChange?.('questions');
                  }
                }}
                className="w-full sm:w-auto bg-gradient-to-r from-cyan-500 to-brand-primary hover:from-cyan-400 hover:to-brand-primary text-black font-black text-sm px-8 py-4 rounded-2xl transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-3"
              >
                Continuar missão do dia <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10">
          {/* Weekly Schedule Timeline (8 cols) */}
          <motion.div 
            variants={itemVariants}
            className="lg:col-span-8 bg-bg-card/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-6 md:p-8 border border-border-color shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider block mb-1">Rotina Semanal</span>
                <h3 className="text-2xl font-black text-text-main tracking-tight">Cronograma das Disciplinas</h3>
              </div>
              <span className="text-xs font-bold bg-text-main/5 text-text-secondary px-3 py-1.5 rounded-full flex items-center gap-1.5">
                <Calendar size={14} className="text-cyan-400" /> Semana 28
              </span>
            </div>

            <div className="space-y-3">
              {weeklyDays.map((item, i) => (
                <div 
                  key={i}
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    item.status === 'completed'
                      ? 'bg-brand-primary/5 border-brand-primary/20'
                      : item.status === 'active'
                      ? 'bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-500/30'
                      : 'bg-bg-main/30 border-border-color/30 opacity-75'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                      item.status === 'completed'
                        ? 'bg-brand-primary/20 text-brand-primary'
                        : item.status === 'active'
                        ? 'bg-cyan-500 text-black font-black'
                        : 'bg-text-main/5 text-text-secondary'
                    }`}>
                      {item.status === 'completed' ? <CheckCircle2 size={16} /> : i + 1}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-text-main flex items-center gap-2">
                        {item.day}
                        {item.status === 'active' && (
                          <span className="text-[9px] uppercase font-black bg-cyan-400 text-black px-2 py-0.5 rounded-full">
                            Hoje
                          </span>
                        )}
                      </h4>
                      <p className="text-xs font-medium text-text-secondary opacity-70">{item.subject}</p>
                    </div>
                  </div>

                  <span className="text-xs font-semibold text-text-secondary opacity-60 bg-text-main/5 px-3 py-1 rounded-xl self-start sm:self-auto">
                    {item.topics}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right Column: Weekly Challenge & AI Tutor Suggestion (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Weekly Goal Challenge */}
            <motion.div 
              variants={itemVariants}
              className="bg-bg-card/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-6 border border-border-color shadow-2xl relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">Desafio Especial</span>
                  <h3 className="text-xl font-black text-text-main tracking-tight">Missão da Semana</h3>
                </div>
                <div className="bg-amber-500/10 p-2.5 rounded-2xl text-amber-400">
                  <Award size={20} />
                </div>
              </div>

              <div className="space-y-3 mb-6 text-xs font-bold text-text-secondary">
                <div className="flex justify-between items-center p-3 rounded-xl bg-bg-main/40 border border-border-color/30">
                  <span className="flex items-center gap-2"><BookOpen size={14} className="text-cyan-400" /> 250 Questões</span>
                  <span className="text-text-main">{weeklyGoal.questions.current}/{weeklyGoal.questions.target}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-bg-main/40 border border-border-color/30">
                  <span className="flex items-center gap-2"><RotateCcw size={14} className="text-rose-400" /> 2 Redações</span>
                  <span className="text-text-main">{weeklyGoal.essays.current}/{weeklyGoal.essays.target}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-bg-main/40 border border-border-color/30">
                  <span className="flex items-center gap-2"><Flame size={14} className="text-amber-400" /> 1 Simulado</span>
                  <span className="text-text-main">{weeklyGoal.simulations.current}/{weeklyGoal.simulations.target}</span>
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-amber-400 uppercase">Recompensa</p>
                  <p className="text-sm font-black text-text-main">+500 XP • Medalha Ouro</p>
                </div>
                <span className="text-xs font-black bg-amber-400 text-black px-3 py-1.5 rounded-xl">
                  73%
                </span>
              </div>
            </motion.div>

            {/* AI Tutor Diagnostic Advice */}
            <motion.div 
              variants={itemVariants}
              className="bg-indigo-950/20 border border-indigo-500/30 rounded-3xl md:rounded-[40px] p-6 backdrop-blur-xl"
            >
              <div className="flex items-center gap-3 mb-3 text-indigo-400">
                <Sparkles size={20} />
                <h4 className="text-sm font-black uppercase tracking-wider">Ajuste Inteligente da IA</h4>
              </div>
              <p className="text-xs font-medium text-text-secondary leading-relaxed mb-4">
                "Percebi que seu tempo de resposta em Geometria Espacial caiu 20%. Ajustei seu plano para priorizar 15 exercícios com gabarito comentado nesta sexta-feira."
              </p>
              <button 
                onClick={() => onTabChange?.('questions')}
                className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-bold text-xs py-3 rounded-xl border border-indigo-500/30 transition-colors flex items-center justify-center gap-2"
              >
                Praticar sugestão <ArrowRight size={14} />
              </button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
