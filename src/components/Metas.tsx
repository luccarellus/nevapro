import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  X, Flame, Award, BookOpen, PenTool, Trophy, Star
} from 'lucide-react';
import { UserProfile } from '../types';

interface MetasProps {
  user: UserProfile;
  onTabChange?: (tab: string) => void;
}

interface WeeklyGoals {
  questionsTarget: number;
  hoursTarget: number;
  essaysTarget: number;
  flashcardsTarget: number;
}

const STORAGE_GOALS_KEY = 'neva_weekly_goals_v1';

export default function Metas({ user, onTabChange }: MetasProps) {
  const [goals, setGoals] = useState<WeeklyGoals>({
    questionsTarget: 200,
    hoursTarget: 15,
    essaysTarget: 2,
    flashcardsTarget: 150,
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Carrega metas salvas ou padrão
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_GOALS_KEY);
      if (saved) {
        setGoals(JSON.parse(saved));
      }
    } catch {
      // Ignora erro
    }
  }, []);

  // Dados reais ou modelo do usuário
  const streakDays = user.streak !== undefined && user.streak > 0 ? user.streak : 12;
  const questionsResolved = user.answeredQuestions !== undefined && user.answeredQuestions > 0 ? user.answeredQuestions : 120;
  const hoursStudied = Math.min(goals.hoursTarget, Math.max(1, Math.round((questionsResolved * 3.5) / 60) || 8));
  const essaysSent = 1;
  const cardsReviewed = 90;

  // Dias da semana para o streak (Seg, Ter, Qua, Qui, Sex, Sáb, Dom)
  const weekDays = [
    { label: 'Seg', active: true },
    { label: 'Ter', active: true },
    { label: 'Qua', active: true },
    { label: 'Qui', active: true },
    { label: 'Sex', active: true },
    { label: 'Sáb', active: false },
    { label: 'Dom', active: false },
  ];

  // Nível e XP do usuário
  const currentLevel = user.level || 7;
  const currentXp = user.xp || 680;
  const targetXp = user.nextLevelXp || 1000;

  // Lista de Conquistas (desbloqueadas e bloqueadas)
  const achievements = [
    {
      id: 'first_essay',
      label: 'Primeira redação',
      unlocked: true,
      icon: PenTool,
    },
    {
      id: 'streak_7',
      label: '7 dias seguidos',
      unlocked: streakDays >= 7,
      icon: Flame,
    },
    {
      id: 'questions_100',
      label: '100 questões',
      unlocked: questionsResolved >= 100,
      icon: BookOpen,
    },
    {
      id: 'score_900',
      label: 'Nota 900 em simulado',
      unlocked: false,
      icon: Trophy,
    },
    {
      id: 'streak_30',
      label: '30 dias seguidos',
      unlocked: streakDays >= 30,
      icon: Award,
    },
    {
      id: 'top_10',
      label: 'Top 10 do ranking',
      unlocked: false,
      icon: Star,
    },
  ];

  const handleSaveGoals = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem(STORAGE_GOALS_KEY, JSON.stringify(goals));
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
    } catch {}
    setIsEditModalOpen(false);
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-text-main tracking-tight mb-1">
              Metas e Conquistas
            </h1>
            <p className="text-text-secondary text-sm sm:text-base font-medium">
              Defina metas da semana e acompanhe sua sequência de estudos.
            </p>
          </div>

          <button
            onClick={() => setIsEditModalOpen(true)}
            className="self-start sm:self-auto px-5 py-2.5 rounded-xl bg-brand-primary text-black font-black text-sm hover:opacity-95 transition-all shadow-md shadow-brand-primary/20"
          >
            Editar metas
          </button>
        </div>

        {/* Grid 2x2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Sequência atual */}
          <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-lg min-h-[260px]">
            <div>
              <p className="text-sm font-semibold text-text-secondary mb-2">
                Sequência atual
              </p>
              <h2 className="text-5xl sm:text-6xl font-black text-brand-primary tracking-tight leading-none mb-2">
                {streakDays} dias
              </h2>
              <p className="text-xs sm:text-sm font-medium text-text-secondary">
                Estude hoje para manter a sequência
              </p>
            </div>

            {/* Dias da semana em pílulas */}
            <div className="pt-6">
              <div className="flex items-center justify-between gap-2 max-w-sm">
                {weekDays.map((d) => (
                  <div key={d.label} className="flex flex-col items-center gap-2">
                    <div
                      className={`w-9 sm:w-11 h-9 sm:h-11 rounded-2xl flex items-center justify-center transition-all ${
                        d.active
                          ? 'bg-brand-primary shadow-[0_0_14px_rgba(0,176,148,0.4)]'
                          : 'bg-[#0f1728] border border-border-color/60'
                      }`}
                    />
                    <span className="text-[11px] font-semibold text-text-secondary">
                      {d.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card 2: Metas da semana */}
          <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-3xl p-6 sm:p-8 shadow-lg min-h-[260px] flex flex-col justify-between">
            <h3 className="text-base sm:text-lg font-bold text-text-main mb-3">
              Metas da semana
            </h3>

            <div className="space-y-4">
              {/* Item 1: Questões */}
              <div>
                <div className="flex items-center justify-between text-xs sm:text-sm font-medium mb-1.5">
                  <span className="text-text-main font-semibold">Questões resolvidas</span>
                  <span className="text-text-main font-bold">
                    {questionsResolved} / {goals.questionsTarget}
                  </span>
                </div>
                <div className="bg-[#141b2a] h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-brand-primary h-full rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(0,176,148,0.4)]"
                    style={{ width: `${Math.min(100, (questionsResolved / goals.questionsTarget) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Item 2: Horas */}
              <div>
                <div className="flex items-center justify-between text-xs sm:text-sm font-medium mb-1.5">
                  <span className="text-text-main font-semibold">Horas de estudo</span>
                  <span className="text-text-main font-bold">
                    {hoursStudied} / {goals.hoursTarget} h
                  </span>
                </div>
                <div className="bg-[#141b2a] h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-brand-primary h-full rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(0,176,148,0.4)]"
                    style={{ width: `${Math.min(100, (hoursStudied / goals.hoursTarget) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Item 3: Redações */}
              <div>
                <div className="flex items-center justify-between text-xs sm:text-sm font-medium mb-1.5">
                  <span className="text-text-main font-semibold">Redações enviadas</span>
                  <span className="text-text-main font-bold">
                    {essaysSent} / {goals.essaysTarget}
                  </span>
                </div>
                <div className="bg-[#141b2a] h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-brand-primary h-full rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(0,176,148,0.4)]"
                    style={{ width: `${Math.min(100, (essaysSent / goals.essaysTarget) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Item 4: Flashcards */}
              <div>
                <div className="flex items-center justify-between text-xs sm:text-sm font-medium mb-1.5">
                  <span className="text-text-main font-semibold">Cards revisados</span>
                  <span className="text-text-main font-bold">
                    {cardsReviewed} / {goals.flashcardsTarget}
                  </span>
                </div>
                <div className="bg-[#141b2a] h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-brand-primary h-full rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(0,176,148,0.4)]"
                    style={{ width: `${Math.min(100, (cardsReviewed / goals.flashcardsTarget) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Nível X */}
          <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-3xl p-6 sm:p-8 shadow-lg min-h-[190px] flex flex-col justify-center space-y-4">
            <h3 className="text-base sm:text-lg font-bold text-text-main">
              Nível {currentLevel}
            </h3>

            <div className="bg-[#141b2a] h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-brand-primary h-full rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(0,176,148,0.4)]"
                style={{ width: `${Math.min(100, (currentXp / targetXp) * 100)}%` }}
              />
            </div>

            <p className="text-xs sm:text-sm font-medium text-text-secondary">
              {currentXp} / {targetXp} XP para o nível {currentLevel + 1}
            </p>
          </div>

          {/* Card 4: Conquistas */}
          <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-3xl p-6 sm:p-8 shadow-lg min-h-[190px] flex flex-col justify-between space-y-4">
            <h3 className="text-base sm:text-lg font-bold text-text-main">
              Conquistas
            </h3>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 items-start justify-items-center text-center">
              {achievements.map((item) => (
                <div key={item.id} className="flex flex-col items-center group">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                      item.unlocked
                        ? 'border-2 border-brand-primary bg-brand-primary/10 text-brand-primary shadow-[0_0_10px_rgba(0,176,148,0.3)]'
                        : 'border border-border-color/60 bg-[#0f1728] text-text-secondary/40'
                    }`}
                  >
                    <item.icon size={18} strokeWidth={item.unlocked ? 2.5 : 1.5} />
                  </div>
                  <span
                    className={`text-[10px] sm:text-[11px] font-semibold mt-2 max-w-[70px] leading-tight ${
                      item.unlocked ? 'text-text-main font-bold' : 'text-text-secondary/60'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Modal: Editar Metas */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-card border border-border-color rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-text-main">Editar Metas da Semana</h3>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-1 rounded-xl text-text-secondary hover:text-text-main hover:bg-text-main/5"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveGoals} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                    Meta de questões resolvidas
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    step="10"
                    value={goals.questionsTarget}
                    onChange={(e) => setGoals({ ...goals, questionsTarget: Number(e.target.value) })}
                    className="w-full bg-[#0a0f1d] border border-border-color rounded-xl px-4 py-2.5 text-sm font-semibold text-text-main"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                    Meta de horas de estudo
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={goals.hoursTarget}
                    onChange={(e) => setGoals({ ...goals, hoursTarget: Number(e.target.value) })}
                    className="w-full bg-[#0a0f1d] border border-border-color rounded-xl px-4 py-2.5 text-sm font-semibold text-text-main"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                    Meta de redações enviadas
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="1"
                    value={goals.essaysTarget}
                    onChange={(e) => setGoals({ ...goals, essaysTarget: Number(e.target.value) })}
                    className="w-full bg-[#0a0f1d] border border-border-color rounded-xl px-4 py-2.5 text-sm font-semibold text-text-main"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                    Meta de cards revisados
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    step="10"
                    value={goals.flashcardsTarget}
                    onChange={(e) => setGoals({ ...goals, flashcardsTarget: Number(e.target.value) })}
                    className="w-full bg-[#0a0f1d] border border-border-color rounded-xl px-4 py-2.5 text-sm font-semibold text-text-main"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-border-color text-text-secondary hover:text-text-main text-xs font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-brand-primary text-black font-black text-xs hover:opacity-95 transition-all shadow-md shadow-brand-primary/20"
                  >
                    Salvar alterações
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
