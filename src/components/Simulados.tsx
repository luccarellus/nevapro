import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { MOCK_SIMULADOS, ENEM_YEARS } from '../data/mockData';
import { Question, UserProfile } from '../types';
import { enemService } from '../services/enemService';
import { ClipboardList, Clock, ArrowRight, Award, Check, X, Info, ChevronDown, AlertTriangle } from 'lucide-react';
import { MarkdownImage } from './ProxiedImage';
import QuestionOption from './QuestionOption';
import Spinner from './Spinner';

interface SimuladosProps {
  onEarnXp: (xp: number, correct?: number, answered?: number, isFlashQuiz?: boolean, activityName?: string) => void;
  user: UserProfile;
  onSimulationActiveChange?: (isActive: boolean) => void;
  pendingTab?: string | null;
  onCancelExit?: () => void;
  onConfirmExit?: () => void;
}

export default function Simulados({ 
  onEarnXp, 
  user,
  onSimulationActiveChange,
  pendingTab,
  onCancelExit,
  onConfirmExit
}: SimuladosProps) {
  const [view, setView] = useState<'selection' | 'simulation' | 'result'>('selection');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState(0);
  const [selectedSim, setSelectedSim] = useState<typeof MOCK_SIMULADOS[0] | null>(null);
  const [timer, setTimer] = useState(0);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [selectedReviewIndex, setSelectedReviewIndex] = useState<number | null>(0);
  const [resultsCache, setResultsCache] = useState<Record<string, any>>({});

  const [selectedYears, setSelectedYears] = useState<Record<string, number>>(() => {
    const years: Record<string, number> = {};
    MOCK_SIMULADOS.forEach(sim => {
      years[sim.id] = sim.year || 2023;
    });
    return years;
  });

  const currentQuestion = questions[currentIndex];

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  };

  // Timer baseado em Date.now() para precisão
  const timerStartRef = useRef<number | null>(null);
  
  useEffect(() => {
    let interval: any;
    if (view === 'simulation' && timer > 0) {
      if (!timerStartRef.current) {
        timerStartRef.current = Date.now();
      }
      const totalSeconds = (selectedSim?.durationMinutes || 330) * 60;
      interval = setInterval(() => {
        if (timerStartRef.current) {
          const elapsedMs = Date.now() - timerStartRef.current;
          const expectedSecondsPassed = Math.floor(elapsedMs / 1000);
          // Recalcula o timer baseado no tempo real decorrido
          const remainingSeconds = Math.max(0, totalSeconds - expectedSecondsPassed);
          setTimer(remainingSeconds);
          
          // Auto-finaliza quando o tempo acabar
          if (remainingSeconds <= 0) {
            clearInterval(interval);
            timerStartRef.current = null;
            handleFinishSimulation(true);
          }
        }
      }, 250); // Verifica 4x/segundo para precisão
    } else if (view === 'simulation') {
      timerStartRef.current = null;
    }
    return () => clearInterval(interval);
  }, [view]); // Só depende de view, não de timer

  useEffect(() => {
    if (onSimulationActiveChange) {
      onSimulationActiveChange(view === 'simulation');
    }
  }, [view, onSimulationActiveChange]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (view === 'simulation') {
        e.preventDefault();
        e.returnValue = 'Você tem certeza que quer sair? O progresso do simulado será perdido.';
        return 'Você tem certeza que quer sair? O progresso do simulado será perdido.';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [view]);

  useEffect(() => {
    if (view === 'selection') {
      const cache: Record<string, any> = {};
      MOCK_SIMULADOS.forEach(sim => {
        const selectedYear = selectedYears[sim.id] || 2023;
        const stored = localStorage.getItem(`neva_sim_result_${user.id}_${sim.id}_${selectedYear}`);
        if (stored) {
          try {
            cache[`${sim.id}_${selectedYear}`] = JSON.parse(stored);
          } catch (e) {
            // ignore
          }
        }
      });
      setResultsCache(cache);
    }
  }, [view, selectedYears, user.id]);

  const handleLoadSavedResult = (sim: typeof MOCK_SIMULADOS[0], savedData: any) => {
    setSelectedSim(sim);
    setQuestions(savedData.questions);
    setUserAnswers(savedData.userAnswers);
    setScore(savedData.score);
    setSelectedReviewIndex(0);
    setView('result');
  };

  const handleStartSimulation = async (sim: typeof MOCK_SIMULADOS[0]) => {
    setSelectedSim(sim);
    setLoading(true);
    setError(null);
    try {
      const day: 1 | 2 = sim.id === 's1' ? 1 : 2;
      const selectedYear = selectedYears[sim.id] || sim.year || 2023;
      const fetchedQuestions = await enemService.getSimulationQuestions(
        selectedYear, 
        day, 
        user.languagePreference || 'ingles'
      );
      
      if (fetchedQuestions.length === 0) {
        setError('Nenhuma questão encontrada para este simulado.');
      } else {
        setQuestions(fetchedQuestions);
        setCurrentIndex(0);
        setUserAnswers({});
        setTimer(sim.durationMinutes * 60); // Converte minutos para segundos
        setView('simulation');
      }
    } catch (err: any) {
      console.error('Error fetching simulation questions:', err);
      setError('Erro ao carregar o simulado. Tente novamente mais tarde.');
    } finally {
      setLoading(false);
    }
  };

  const handleOptionSelect = (index: number) => {
    setUserAnswers(prev => ({
      ...prev,
      [currentIndex]: index
    }));
  };

  const handleFinishSimulation = (isCompleted: boolean = false) => {
    let correctOnes = 0;
    questions.forEach((q, idx) => {
      if (userAnswers[idx] === q.correctOptionIndex) {
        correctOnes++;
      }
    });

    setScore(correctOnes);
    if (selectedSim) {
      const totalQ = questions.length || selectedSim.totalQuestions || 90;
      // Ganha XP proporcional aos acertos em relação ao total de questões do simulado.
      const xpEarned = Math.round((correctOnes / totalQ) * selectedSim.xpReward);

      onEarnXp(xpEarned, correctOnes, totalQ, false, `Simulado: ${selectedSim.title}`);
      const selectedYear = selectedYears[selectedSim.id] || selectedSim.year || 2023;
      localStorage.setItem(`neva_sim_result_${user.id}_${selectedSim.id}_${selectedYear}`, JSON.stringify({
        questions,
        userAnswers,
        score: correctOnes,
        timestamp: new Date().toISOString()
      }));

      const answerBatch = questions.map((q, idx) => {
        const isCorrect = userAnswers[idx] === q.correctOptionIndex;
        // Para o simulado, se o aluno não respondeu, conta como incorreto no caderno de erros
        const selectedOption = userAnswers[idx];
        return {
            userId: user.id,
            questionId: q.id,
            selectedOption: selectedOption !== undefined ? selectedOption : null,
            isCorrect: selectedOption !== undefined ? isCorrect : false,
            questionData: {
              subject: q.subject,
              text: q.text,
              options: q.options,
              optionImages: q.optionImages || [],
              imageUrl: q.imageUrl || null,
              correctOptionIndex: q.correctOptionIndex,
              explanation: q.explanation || 'Resolução baseada nos critérios oficiais do ENEM.',
              difficulty: q.difficulty || 'médio',
              xpReward: q.xpReward || 50,
              year: Number(selectedYear),
              index: Number(q.id.split('-')[1] || idx + 1)
            },
          };
      });
      fetch('/api/answers/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ answers: answerBatch }),
      }).catch(err => console.error('Failed to log simulated answers:', err));
    }
    setView('result');
  };

  const renderExitConfirmModal = () => (
    <AnimatePresence>
      {(showExitConfirm || pendingTab !== null) && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-[#111827] border border-border-color rounded-[32px] p-8 max-w-md w-full shadow-2xl relative overflow-hidden text-center"
          >
            <div className="w-16 h-16 bg-red-500/15 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-xl font-black text-text-main mb-3 uppercase tracking-tight">
              Deseja mesmo sair do simulado?
            </h3>
            <p className="text-text-secondary text-xs font-bold leading-relaxed mb-8">
              Se você sair agora, o simulado será finalizado. Suas respostas atuais serão computadas e as não respondidas ficarão em branco. Você poderá ver o seu progresso final de acertos e erros.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  handleFinishSimulation();
                  setShowExitConfirm(false);
                  if (pendingTab && onConfirmExit) {
                    onConfirmExit();
                  } else if (onCancelExit) {
                    onCancelExit();
                  }
                }}
                className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-[0.98]"
              >
                Finalizar e ver resultados
              </button>
              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  if (onCancelExit) onCancelExit();
                }}
                className="w-full bg-text-main/5 hover:bg-text-main/10 text-text-secondary py-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all"
              >
                Continuar respondendo
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Spinner className="w-16 h-16 mx-auto mb-6" />
          <p className="text-text-main font-black uppercase tracking-widest text-sm">Preparando Simulado</p>
          <p className="text-text-secondary text-[10px] mt-2 font-bold uppercase opacity-60">Sincronizando 90 questões oficiais...</p>
        </div>
      </div>
    );
  }

  if (view === 'result') {
    const totalQuestions = questions.length;
    let blankAnswersCount = 0;
    questions.forEach((q, idx) => {
      if (userAnswers[idx] === undefined) {
        blankAnswersCount++;
      }
    });
    const wrongAnswersCount = totalQuestions - score - blankAnswersCount;

    return (
      <div className="max-w-4xl mx-auto pt-20 md:pt-28 pb-32 px-4 md:px-6">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[40px] p-8 md:p-12 shadow-2xl text-center mb-10"
        >
          <div className="w-20 h-20 bg-brand-primary/10 text-brand-primary rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Award size={40} />
          </div>
          <h2 className="text-3xl font-black text-text-main tracking-tight mb-2">Simulado finalizado</h2>
          <p className="text-text-secondary font-bold text-[10px] mb-10 opacity-60 uppercase tracking-wider">Confira seu desempenho global</p>
          
          <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:flex sm:flex-wrap justify-center items-center gap-6 md:gap-10 mb-10">
            <div className="text-center min-w-[80px]">
              <p className="text-[10px] font-bold text-text-secondary mb-1 opacity-50 uppercase tracking-wider">Acertos</p>
              <p className="text-3xl sm:text-4xl font-black text-brand-primary">{score}</p>
            </div>
            <div className="bg-border-color w-[1px] h-12 my-auto hidden sm:block" />
            <div className="text-center min-w-[80px]">
              <p className="text-[10px] font-bold text-text-secondary mb-1 opacity-50 uppercase tracking-wider">Erros</p>
              <p className="text-3xl sm:text-4xl font-black text-red-500">{wrongAnswersCount}</p>
            </div>
            <div className="bg-border-color w-[1px] h-12 my-auto hidden sm:block" />
            <div className="text-center min-w-[80px]">
              <p className="text-[10px] font-bold text-text-secondary mb-1 opacity-50 uppercase tracking-wider">Em Branco</p>
              <p className="text-3xl sm:text-4xl font-black text-zinc-400">{blankAnswersCount}</p>
            </div>
            <div className="bg-border-color w-[1px] h-12 my-auto hidden sm:block" />
            <div className="text-center min-w-[80px]">
              <p className="text-[10px] font-bold text-text-secondary mb-1 opacity-50 uppercase tracking-wider">Total</p>
              <p className="text-3xl sm:text-4xl font-black text-text-main">{totalQuestions}</p>
            </div>
            <div className="bg-border-color w-[1px] h-12 my-auto hidden sm:block" />
            <div className="text-center min-w-[80px]">
              <p className="text-[10px] font-bold text-text-secondary mb-1 opacity-50 uppercase tracking-wider">Desempenho</p>
              <p className="text-3xl sm:text-4xl font-black text-blue-500">{totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0}%</p>
            </div>
          </div>

          <button 
            onClick={() => setView('selection')}
            className="w-full max-w-sm bg-brand-primary hover:bg-brand-secondary text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-brand-primary/20 transition-all active:scale-95"
          >
            Voltar para Simulados
          </button>
        </motion.div>

        {/* Section: Revisão de Questões */}
        {totalQuestions > 0 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-bg-card/30 backdrop-blur-xl border border-border-color rounded-[40px] p-6 md:p-10 shadow-xl"
          >
            <h3 className="text-xl font-black text-text-main uppercase tracking-wider mb-2">Revisão das Questões</h3>
            <p className="text-text-secondary text-xs font-medium mb-8 leading-relaxed">
              Clique em uma questão na grade abaixo para visualizar os detalhes, sua resposta e o gabarito oficial.
            </p>

            {/* Grid of question numbers */}
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5 sm:gap-2.5 mb-10">
              {questions.map((q, idx) => {
                const answer = userAnswers[idx];
                const isCorrect = answer === q.correctOptionIndex;
                const isBlank = answer === undefined;
                const isSelected = selectedReviewIndex === idx;

                let statusClass = "";
                if (isBlank) {
                  statusClass = "bg-zinc-500/10 text-zinc-400 border-zinc-500/20 hover:bg-zinc-500/20";
                } else if (isCorrect) {
                  statusClass = "bg-brand-primary/10 text-brand-primary border-brand-primary/20 hover:bg-brand-primary/20";
                } else {
                  statusClass = "bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20";
                }

                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedReviewIndex(idx)}
                    className={`h-9 sm:h-11 rounded-lg sm:rounded-xl font-black text-xs border transition-all duration-200 select-none ${statusClass} ${
                      isSelected ? 'ring-2 ring-brand-primary scale-105 shadow-md shadow-brand-primary/10' : ''
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Detailed Question Review Container */}
            {selectedReviewIndex !== null && questions[selectedReviewIndex] && (() => {
              const q = questions[selectedReviewIndex];
              const answer = userAnswers[selectedReviewIndex];
              const isCorrect = answer === q.correctOptionIndex;
              const isBlank = answer === undefined;

              return (
                <motion.div
                  key={selectedReviewIndex}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="bg-bg-sidebar/40 border border-border-color rounded-[32px] p-6 md:p-8"
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-4 border-b border-border-color/50">
                    <div>
                      <span className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] block mb-1">
                        Questão {selectedReviewIndex + 1}
                      </span>
                      <span className="text-[9px] font-bold text-text-secondary uppercase tracking-widest opacity-60">
                        {q.subject || "Conhecimentos Gerais"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isBlank ? (
                        <div className="px-3.5 py-1.5 bg-zinc-500/10 text-zinc-400 rounded-full text-[10px] font-black uppercase tracking-wider border border-zinc-500/25 flex items-center gap-1.5 shadow-sm">
                          <Info size={13} />
                          <span>Em Branco</span>
                        </div>
                      ) : isCorrect ? (
                        <div className="px-3.5 py-1.5 bg-brand-primary/10 text-brand-primary rounded-full text-[10px] font-black uppercase tracking-wider border border-brand-primary/25 flex items-center gap-1.5 shadow-sm">
                          <Check size={13} />
                          <span>Correta</span>
                        </div>
                      ) : (
                        <div className="px-3.5 py-1.5 bg-red-500/10 text-red-500 rounded-full text-[10px] font-black uppercase tracking-wider border border-red-500/25 flex items-center gap-1.5 shadow-sm">
                          <X size={13} />
                          <span>Incorreta</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Question Text */}
                  <div className="prose prose-invert max-w-none mb-10 font-sans">
                    <div className="text-sm md:text-base leading-relaxed text-text-main font-medium whitespace-pre-wrap">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw]}
                        components={{
                          img: MarkdownImage,
                          p: ({ children }) => <p className="mb-4 last:mb-0 leading-relaxed whitespace-pre-wrap">{children}</p>
                        }}
                      >
                        {q.text as string}
                      </ReactMarkdown>
                    </div>

                    {q.imageUrl && (
                      <div className="mt-6 rounded-2xl overflow-hidden bg-bg-sidebar p-4 ring-1 ring-border-color shadow-inner max-w-lg mx-auto">
                        <img 
                          src={q.imageUrl} 
                          alt="Questão" 
                          className="w-full h-auto object-contain mx-auto"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                  </div>

                  {/* Options List */}
                  <div className="grid grid-cols-1 gap-3.5">
                    {q.options.map((option, optIdx) => (
                      <QuestionOption
                        key={optIdx}
                        index={optIdx}
                        text={option}
                        imageUrl={q.optionImages?.[optIdx]}
                        isSelected={answer === optIdx}
                        isCorrectOption={optIdx === q.correctOptionIndex}
                        isUserWrong={answer === optIdx && answer !== q.correctOptionIndex}
                        interactive={false}
                        size="md"
                      />
                    ))}
                  </div>
                </motion.div>
              );
            })()}
          </motion.div>
        )}
      </div>
    );
  }

  if (view === 'simulation' && currentQuestion) {
    return (
      <>
        <div className="max-w-4xl mx-auto pt-6 sm:pt-24 pb-20 sm:pb-32 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 w-full">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
             <div className="flex items-center gap-2 bg-brand-primary/10 px-4 py-2 rounded-full ring-1 ring-brand-primary/20">
               <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
               <span className="text-[10px] font-bold text-brand-primary leading-none">Simulado ativo</span>
             </div>
             <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-red-500/10 ring-2 ring-red-500/30 text-red-500 font-black shadow-lg shadow-red-500/10 animate-pulse">
               <Clock size={15} className="text-red-500" />
               <span className="text-sm font-extrabold tracking-wider leading-none font-mono text-red-500 select-none">
                 {formatTime(timer)}
               </span>
               <span className="text-[9px] uppercase tracking-wider opacity-80 font-extrabold">restantes</span>
             </div>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
            <button
              onClick={() => setShowExitConfirm(true)}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 rounded-xl text-red-500 font-black text-[10px] uppercase tracking-widest transition-all duration-200"
            >
              Sair do Simulado
            </button>
            <span className="text-[11px] font-black text-text-secondary uppercase tracking-tighter shrink-0">
              Questão <span className="text-text-main text-sm">{currentIndex + 1}</span> de <span className="opacity-40">{questions.length}</span>
            </span>
          </div>
        </div>

        <motion.div
           key={currentQuestion.id}
           initial={{ opacity: 0, x: 20 }}
           animate={{ opacity: 1, x: 0 }}
           transition={{ duration: 0.3 }}
           className="bg-bg-card/40 backdrop-blur-xl rounded-[32px] md:rounded-[40px] p-6 md:p-10 shadow-2xl mb-8 border border-border-color relative overflow-hidden"
        >
          <div className="prose prose-invert max-w-none mb-10">
            <div className="text-base md:text-lg lg:text-xl leading-relaxed text-text-main font-medium whitespace-pre-wrap">
              <ReactMarkdown
                 remarkPlugins={[remarkGfm]}
                 rehypePlugins={[rehypeRaw]}
                 components={{
                   img: MarkdownImage,
                   p: ({ children }) => <p className="mb-6 last:mb-0 leading-relaxed opacity-95 whitespace-pre-wrap">{children}</p>
                 }}
              >
                {currentQuestion.text as string}
              </ReactMarkdown>
            </div>
            
            {currentQuestion.imageUrl && (
              <div className="mt-8 rounded-3xl overflow-hidden bg-bg-sidebar p-4 md:p-6 ring-1 ring-border-color shadow-inner">
                <img 
                  src={currentQuestion.imageUrl} 
                  alt="Questão" 
                  className="w-full h-auto object-contain mx-auto"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (target.src.includes('/api/imagem')) {
                      const urlParams = new URLSearchParams(target.src.split('?')[1]);
                      const original = urlParams.get('url');
                      if (original && !target.dataset.triedOriginal) {
                        target.dataset.triedOriginal = 'true';
                        target.src = original;
                        return;
                      }
                    }
                    target.style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:gap-4">
             {currentQuestion.options.map((option, index) => (
                <QuestionOption
                  key={index}
                  index={index}
                  text={option}
                  imageUrl={currentQuestion.optionImages?.[index]}
                  isSelected={userAnswers[currentIndex] === index}
                  interactive
                  size="md"
                  onSelect={handleOptionSelect}
                />
             ))}
          </div>
        </motion.div>

        <div className="flex justify-between items-center gap-4">
          <button
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="px-6 sm:px-8 py-4 sm:py-5 bg-text-main/5 border border-border-color rounded-2xl text-text-secondary font-black text-xs uppercase tracking-widest disabled:opacity-30 transition-all hover:bg-text-main/10"
          >
            Anterior
          </button>

          {currentIndex < questions.length - 1 ? (
            <button
              onClick={() => setCurrentIndex(prev => prev + 1)}
              className="px-6 sm:px-10 py-4 sm:py-5 bg-text-main/5 border border-border-color rounded-2xl text-brand-primary font-black text-xs uppercase tracking-widest transition-all hover:bg-brand-primary/10"
            >
              Próxima
            </button>
          ) : (
            <button
              onClick={() => handleFinishSimulation(true)}
              className="px-6 sm:px-10 py-4 sm:py-5 bg-brand-primary hover:bg-brand-secondary text-white rounded-2xl font-black text-xs uppercase tracking-[0.15em] sm:tracking-[0.2em] shadow-lg shadow-brand-primary/20 transition-all active:scale-95"
            >
              Finalizar Simulado
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mt-12 h-1 bg-text-main/5 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-brand-primary shadow-[0_0_10px_#00b094]"
            initial={{ width: 0 }}
            animate={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>
      {renderExitConfirmModal()}
    </>
  );
}

  return (
    <>
    <div className="max-w-6xl mx-auto pt-16 sm:pt-24 pb-20 sm:pb-32 px-4 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <header className="mb-8 sm:mb-12 text-center">
          <span className="text-brand-primary text-[10px] font-black tracking-[0.3em] uppercase mb-2 block">AVALIAÇÃO</span>
          <h1 className="text-2xl sm:text-4xl font-black text-text-main tracking-tight mb-3">Simulados Oficiais</h1>
          <p className="text-text-secondary text-xs sm:text-base font-medium">Prepare-se com testes nos moldes reais do ENEM e cronometragem oficial.</p>
          {error && <div className="mt-4 p-4 bg-red-500/10 text-red-500 rounded-2xl font-bold text-sm uppercase tracking-widest ring-1 ring-red-500/20">{error}</div>}
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
          {MOCK_SIMULADOS.map((sim, i) => {
            const selectedYear = selectedYears[sim.id] || 2023;
            const savedResult = resultsCache[`${sim.id}_${selectedYear}`];
            return (
              <motion.div
                key={sim.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                className="group bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[32px] sm:rounded-[40px] p-5 sm:p-8 transition-all hover:shadow-[0_20px_50px_rgba(0,176,148,0.05)] relative overflow-hidden"
              >
                <div className="flex justify-between items-start mb-6 sm:mb-8">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-brand-primary/10 text-brand-primary rounded-xl sm:rounded-2xl flex items-center justify-center group-hover:bg-brand-primary group-hover:text-white transition-all shrink-0">
                    <ClipboardList className="w-6 h-6 sm:w-7 sm:h-7" />
                  </div>
                  <div className="relative flex items-center select-none ml-2">
                    <select
                      value={selectedYears[sim.id] || 2023}
                      onChange={(e) => setSelectedYears(prev => ({ ...prev, [sim.id]: parseInt(e.target.value, 10) }))}
                      className="pl-4 sm:pl-5 pr-8 sm:pr-10 py-1.5 sm:py-2 bg-text-main/5 hover:bg-text-main/10 border-none rounded-full text-[9px] sm:text-[10px] font-black text-text-secondary uppercase tracking-wider sm:tracking-widest cursor-pointer focus:outline-none ring-1 ring-border-color hover:ring-brand-primary/40 focus:ring-brand-primary text-center appearance-none [color-scheme:dark] transition-all duration-200"
                      title="Selecionar ano do ENEM"
                      aria-label="Selecionar ano do ENEM"
                    >
                      {ENEM_YEARS.map(year => (
                        <option 
                          key={year} 
                          value={year} 
                          className="bg-[#111827] text-white dark:bg-[#111827] dark:text-white [data-theme=light]:bg-white [data-theme=light]:text-black font-bold text-xs"
                        >
                          ENEM {year}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 pointer-events-none text-brand-primary/75">
                      <ChevronDown size={12} className="transition-transform duration-200 group-hover:scale-110" />
                    </div>
                  </div>
                </div>
                
                <h3 className="text-xl sm:text-2xl font-black text-text-main mb-3 uppercase tracking-tight leading-none group-hover:text-brand-primary transition-colors">{sim.title}</h3>
                <p className="text-text-secondary text-xs sm:text-sm mb-6 sm:mb-8 leading-relaxed font-medium">{sim.description}</p>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-10">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-text-secondary mb-1">Questões</span>
                    <span className="text-text-main font-black text-lg sm:text-xl">{sim.totalQuestions}</span>
                  </div>
                  <div className="flex flex-col text-left sm:text-center order-3 sm:order-2 col-span-2 sm:col-span-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-secondary mb-1 sm:justify-center">
                      <Clock size={12} className="text-brand-primary" />
                      <span>Duração Oficial</span>
                    </div>
                    <span className="text-text-main font-black text-lg sm:text-xl block">
                      {sim.id === 's1' ? '5h 30min' : '5h 00min'}
                      <span className="text-xs text-text-secondary opacity-50 ml-1.5 font-bold">({sim.durationMinutes} min)</span>
                    </span>
                  </div>
                  <div className="flex flex-col text-right sm:text-right order-2 sm:order-3">
                    <span className="text-[10px] font-bold text-brand-primary mb-1">Recompensa</span>
                    <span className="text-brand-primary font-black text-lg sm:text-xl">+{sim.xpReward} <span className="text-xs opacity-70">XP</span></span>
                  </div>
                </div>

                {savedResult ? (
                  <div className="flex items-center gap-2.5 p-3.5 bg-brand-primary/5 border border-brand-primary/10 rounded-2xl mb-6 text-left">
                    <Award size={18} className="text-brand-primary shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-text-secondary uppercase tracking-widest opacity-60">Última Tentativa</span>
                      <span className="text-xs font-black text-brand-primary">
                        {savedResult.score} / {savedResult.questions?.length || 90} Acertos ({savedResult.questions?.length > 0 ? Math.round((savedResult.score / savedResult.questions.length) * 100) : 0}%)
                      </span>
                    </div>
                  </div>
                ) : null}
                
                {savedResult ? (
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <button 
                      onClick={() => handleLoadSavedResult(sim, savedResult)}
                      className="flex-1 bg-text-main/5 hover:bg-brand-primary/10 border border-border-color hover:border-brand-primary/30 text-text-main hover:text-brand-primary py-4 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      Revisar Respostas
                    </button>
                    <button 
                      onClick={() => handleStartSimulation(sim)}
                      className="flex-1 bg-brand-primary hover:bg-brand-secondary text-white py-4 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      Refazer
                      <ArrowRight size={14} />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => handleStartSimulation(sim)}
                    className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-brand-primary/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                  >
                    Começar agora
                    <ArrowRight size={18} />
                  </button>
                )}

                <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-[#00b094]/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>

      {renderExitConfirmModal()}
    </>
  );
}
