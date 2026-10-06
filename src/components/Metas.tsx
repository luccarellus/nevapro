import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  X, Flame, Award, BookOpen, PenTool, Trophy, Star
} from 'lucide-react';
import { UserProfile } from '../types';
import { performanceService } from '../services/performanceService';

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
const WEEK_DAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export default function Metas({ user, onTabChange }: MetasProps) {
  const [goals, setGoals] = useState<WeeklyGoals>({
    questionsTarget: 200,
    hoursTarget: 15,
    essaysTarget: 2,
    flashcardsTarget: 150,
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [weeklyActivity, setWeeklyActivity] = useState<{ day: string; xp: number; fullDate: string }[]>([]);
  const [triScore, setTriScore] = useState<number | null>(null);

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

  // Atividade real da semana (XP por dia) vinda do servidor
  useEffect(() => {
    let active = true;
    const loadWeeklyActivity = async () => {
      try {
        const res = await fetch(`/api/user/stats?email=${encodeURIComponent(user.email || '')}`, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (active && Array.isArray(data?.weekly)) {
          setWeeklyActivity(data.weekly);
        }
      } catch {
        // Sem atividade registrada: nenhum dia fica marcado
      }
    };
    loadWeeklyActivity();
    return () => { active = false; };
  }, [user.email]);

  // Nota TRI mais recente (base da conquista de nota 900)
  useEffect(() => {
    let active = true;
    const loadTri = async () => {
      try {
        const data = await performanceService.getTriScores();
        if (active && data?.latest_score) {
          setTriScore(data.latest_score.estimated_score);
        }
      } catch {
        // Sem TRI calculado: conquista permanece bloqueada
      }
    };
    loadTri();
    return () => { active = false; };
  }, [user.email]);

  // Métricas reais do aluno (sem valores de exemplo)
  const streakDays = user.streak ?? 0;
  const questionsResolved = user.answeredQuestions ?? 0;
  // Horas de estudo, redações enviadas e cards revisados ainda não são
  // registrados pela plataforma — não inventamos progresso (ficam em 0).
  const hoursStudied = 0;
  const essaysSent = 0;
  const cardsReviewed = 0;

  // Dias da semana (Seg–Dom) marcados conforme atividade real (XP do dia)
  const weekDays = useMemo(() => {
    const xpByDate = new Map(weeklyActivity.map((w) => [w.fullDate, w.xp]));
    const today = new Date();
    const offsetFromMonday = (today.getDay() + 6) % 7; // 0 = segunda
    const monday = new Date(today);
    monday.setDate(today.getDate() - offsetFromMonday);

    return WEEK_DAY_LABELS.map((label, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const key = date.toISOString().split('T')[0];
      return { label, active: (xpByDate.get(key) || 0) > 0 };
    });
  }, [weeklyActivity]);

  // Nível e XP reais do usuário
  const currentLevel = user.level || 1;
  const currentXp = user.xp || 0;
  const targetXp = user.nextLevelXp || 1;
  const levelMinXp = user.currentLevelMinXp ?? 0;
  const levelRange = Math.max(1, targetXp - levelMinXp);
  const xpInLevel = Math.max(0, Math.min(levelRange, currentXp - levelMinXp));

  // Conquistas derivadas de dados reais
  const achievements = [
    { id: 'first_essay', label: 'Primeira redação', unlocked: essaysSent >= 1, icon: PenTool },
    { id: 'streak_7', label: '7 dias seguidos', unlocked: streakDays >= 7, icon: Flame },
    { id: 'questions_100', label: '100 questões', unlocked: questionsResolved >= 100, icon: BookOpen },
    { id: 'score_900', label: 'Nota 900 em simulado', unlocked: (triScore ?? 0) >= 900, icon: Trophy },
    { id: 'streak_30', label: '30 dias seguidos', unlocked: streakDays >= 30, icon: Award },
    { id: 'top_10', label: 'Top 10 do ranking', unlocked: (user.rank ?? 0) > 0 && (user.rank ?? 0) <= 10, icon: Star },
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

              {(hoursStudied === 0 || essaysSent === 0 || cardsReviewed === 0) && (
                <p className="text-[11px] font-medium text-text-secondary/60 leading-relaxed pt-1">
                  Horas de estudo, redações e cards revisados aparecem zerados enquanto essas atividades não são registradas pela plataforma.
                </p>
              )}
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
                style={{ width: `${Math.min(100, (xpInLevel / levelRange) * 100)}%` }}
              />
            </div>

            <p className="text-xs sm:text-sm font-medium text-text-secondary">
              {xpInLevel} / {levelRange} XP para o nível {currentLevel + 1}
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
