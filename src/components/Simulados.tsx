import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { MOCK_SIMULADOS, ENEM_YEARS } from '../data/mockData';
import { Question, UserProfile } from '../types';
import { enemService } from '../services/enemService';
import { ClipboardList, Clock, ArrowRight, Loader2, Award, Check, X, Info, ChevronDown } from 'lucide-react';

interface SimuladosProps {
  onEarnXp: (xp: number, correct?: number, answered?: number) => void;
  user: UserProfile;
}

export default function Simulados({ onEarnXp, user }: SimuladosProps) {
  const [view, setView] = useState<'selection' | 'simulation' | 'result'>('selection');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState(0);
  const [selectedSim, setSelectedSim] = useState<typeof MOCK_SIMULADOS[0] | null>(null);
  const [timer, setTimer] = useState(0);

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

  useEffect(() => {
    let interval: any;
    if (view === 'simulation' && timer > 0) {
      interval = setInterval(() => {
        setTimer(prev => prev - 1);
      }, 1000); // Decréscimo a cada segundo para o cronômetro realista do ENEM!
    } else if (view === 'simulation' && timer === 0) {
      handleFinishSimulation();
    }
    return () => clearInterval(interval);
  }, [view, timer]);

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

  const handleFinishSimulation = () => {
    let correctOnes = 0;
    questions.forEach((q, idx) => {
      if (userAnswers[idx] === q.correctOptionIndex) {
        correctOnes++;
      }
    });

    setScore(correctOnes);
    if (selectedSim) {
      onEarnXp(selectedSim.xpReward, correctOnes, questions.length || selectedSim.totalQuestions || 90);
    }
    setView('result');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-brand-primary animate-spin mx-auto mb-6" />
          <p className="text-text-main font-black uppercase tracking-widest text-sm">Preparando Simulado</p>
          <p className="text-text-secondary text-[10px] mt-2 font-bold uppercase opacity-60">Sincronizando 90 questões oficiais...</p>
        </div>
      </div>
    );
  }

  if (view === 'result') {
    return (
      <div className="max-w-2xl mx-auto pt-32 px-6 text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[40px] p-12 shadow-2xl"
        >
          <div className="w-20 h-20 bg-brand-primary/10 text-brand-primary rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Award size={40} />
          </div>
          <h2 className="text-3xl font-black text-text-main tracking-tight mb-2">Simulado finalizado</h2>
          <p className="text-text-secondary font-bold text-[10px] mb-10 opacity-60">Confira seu desempenho global</p>
          
          <div className="flex justify-center gap-8 md:gap-12 mb-12">
            <div className="text-center">
              <p className="text-[10px] font-bold text-text-secondary mb-1 opacity-50">Acertos</p>
              <p className="text-4xl font-black text-brand-primary">{score}</p>
            </div>
            <div className="bg-border-color w-[1px] h-12 my-auto" />
            <div className="text-center">
              <p className="text-[10px] font-bold text-text-secondary mb-1 opacity-50">Questões</p>
              <p className="text-4xl font-black text-text-main">{questions.length}</p>
            </div>
            <div className="bg-border-color w-[1px] h-12 my-auto" />
            <div className="text-center">
              <p className="text-[10px] font-bold text-text-secondary mb-1 opacity-50">Desempenho</p>
              <p className="text-4xl font-black text-blue-500">{questions.length > 0 ? Math.round((score / questions.length) * 100) : 0}%</p>
            </div>
          </div>

          <button 
            onClick={() => setView('selection')}
            className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-brand-primary/20 transition-all active:scale-95"
          >
            Voltar para Simulados
          </button>
        </motion.div>
      </div>
    );
  }

  if (view === 'simulation' && currentQuestion) {
    return (
      <div className="max-w-4xl mx-auto pt-10 md:pt-24 pb-32 px-4 md:px-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div className="flex flex-wrap items-center gap-3">
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
          <span className="text-[11px] font-black text-text-secondary uppercase tracking-tighter">
            Questão <span className="text-text-main text-sm">{currentIndex + 1}</span> de <span className="opacity-40">{questions.length}</span>
          </span>
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
                   img: (props) => {
                     const { src, alt } = props;
                     if (!src) return null;
                     
                     const isProxy = src.startsWith('/api/imagem');
                     const fullUrl = isProxy ? src : `/api/imagem?url=${encodeURIComponent(src)}`;

                     return (
                       <span className="block my-8 md:my-10">
                         <img 
                           src={fullUrl} 
                           alt={alt || 'Imagem da questão'} 
                           className="max-w-full h-auto rounded-3xl mx-auto bg-bg-sidebar p-4 shadow-inner ring-1 ring-border-color" 
                           referrerPolicy="no-referrer"
                           loading="lazy"
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
                       </span>
                     );
                   },
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
             {currentQuestion.options.map((option, index) => {
                const isSelected = userAnswers[currentIndex] === index;
                const optionImage = currentQuestion.optionImages?.[index];

                return (
                  <button
                    key={index}
                    onClick={() => handleOptionSelect(index)}
                    className={`w-full text-left p-5 md:p-6 rounded-[24px] border-transparent transition-all duration-300 flex flex-col gap-4 group/opt ${
                      isSelected 
                      ? 'bg-brand-primary/10 ring-2 ring-brand-primary shadow-lg shadow-brand-primary/5' 
                      : 'bg-text-main/5 hover:bg-text-main/10'
                    }`}
                  >
                    <div className="flex items-start md:items-center gap-4 md:gap-5">
                      <span className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center font-black text-xs md:text-sm shrink-0 transition-all ${
                        isSelected 
                        ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20 scale-105 md:scale-110' 
                        : 'bg-text-main/10 text-text-secondary group-hover/opt:text-text-main'
                      }`}>
                        {String.fromCharCode(65 + index)}
                      </span>
                      {option && (
                        <span className={`font-bold text-sm md:text-base leading-snug mt-1 md:mt-0 transition-colors ${isSelected ? 'text-text-main' : 'text-text-secondary group-hover/opt:text-text-main'}`}>
                          {option}
                        </span>
                      )}
                    </div>
                    
                    {optionImage && (
                      <div className="ml-12 md:ml-14 rounded-xl overflow-hidden max-w-full md:max-w-md bg-bg-sidebar p-2 md:p-3 ring-1 ring-border-color">
                        <img 
                          src={optionImage} 
                          alt={`Opção ${String.fromCharCode(65 + index)}`}
                          className="w-full h-auto object-contain"
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
                  </button>
                );
             })}
          </div>
        </motion.div>

        <div className="flex gap-4">
          <button
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="px-8 py-5 bg-text-main/5 border border-border-color rounded-2xl text-text-secondary font-black text-xs uppercase tracking-widest disabled:opacity-30 transition-all hover:bg-text-main/10"
          >
            Anterior
          </button>
          
          <div className="flex-1" />

          {currentIndex < questions.length - 1 ? (
            <button
              onClick={() => setCurrentIndex(prev => prev + 1)}
              className="px-10 py-5 bg-text-main/5 border border-border-color rounded-2xl text-brand-primary font-black text-xs uppercase tracking-widest transition-all hover:bg-brand-primary/10"
            >
              Próxima
            </button>
          ) : (
            <button
              onClick={handleFinishSimulation}
              className="px-10 py-5 bg-brand-primary hover:bg-brand-secondary text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-brand-primary/20 transition-all active:scale-95"
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
    );
  }

  return (
    <div className="max-w-6xl mx-auto pt-24 pb-32 px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <header className="mb-12 text-center">
          <span className="text-brand-primary text-[10px] font-black tracking-[0.3em] uppercase mb-2 block">AVALIAÇÃO</span>
          <h1 className="text-4xl font-black text-text-main tracking-tight mb-3">Simulados Oficiais</h1>
          <p className="text-text-secondary font-medium">Prepare-se com testes nos moldes reais do ENEM e cronometragem oficial.</p>
          {error && <div className="mt-4 p-4 bg-red-500/10 text-red-500 rounded-2xl font-bold text-sm uppercase tracking-widest ring-1 ring-red-500/20">{error}</div>}
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {MOCK_SIMULADOS.map((sim, i) => (
            <motion.div
              key={sim.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="group bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[40px] p-8 transition-all hover:shadow-[0_20px_50px_rgba(0,176,148,0.05)] relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-8">
                <div className="w-14 h-14 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center group-hover:bg-brand-primary group-hover:text-white transition-all">
                  <ClipboardList size={28} />
                </div>
                <div className="relative flex items-center select-none">
                  <select
                    value={selectedYears[sim.id] || 2023}
                    onChange={(e) => setSelectedYears(prev => ({ ...prev, [sim.id]: parseInt(e.target.value, 10) }))}
                    className="pl-5 pr-10 py-2 bg-text-main/5 hover:bg-text-main/10 border-none rounded-full text-[10px] font-black text-text-secondary uppercase tracking-widest cursor-pointer focus:outline-none ring-1 ring-border-color hover:ring-brand-primary/40 focus:ring-brand-primary text-center appearance-none [color-scheme:dark] transition-all duration-200"
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
                  <div className="absolute right-4 pointer-events-none text-brand-primary/75">
                    <ChevronDown size={12} className="transition-transform duration-200 group-hover:scale-110" />
                  </div>
                </div>
              </div>
              
              <h3 className="text-2xl font-black text-text-main mb-3 uppercase tracking-tight leading-none group-hover:text-brand-primary transition-colors">{sim.title}</h3>
              <p className="text-text-secondary text-sm mb-8 leading-relaxed font-medium">{sim.description}</p>
              
              <div className="flex items-center gap-8 mb-10">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-text-secondary mb-1">Questões</span>
                  <span className="text-text-main font-black text-xl">{sim.totalQuestions}</span>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-secondary mb-1">
                    <Clock size={12} className="text-brand-primary" />
                    <span>Duração Oficial de Prova</span>
                  </div>
                  <span className="text-text-main font-black text-xl">
                    {sim.id === 's1' ? '5h 30min' : '5h 00min'}
                    <span className="text-xs text-text-secondary opacity-50 ml-1.5 font-bold">({sim.durationMinutes} min)</span>
                  </span>
                </div>
                <div className="flex flex-col ml-auto text-right">
                  <span className="text-[10px] font-bold text-brand-primary mb-1">Recompensa</span>
                  <span className="text-brand-primary font-black text-xl">+{sim.xpReward} <span className="text-xs opacity-70">XP</span></span>
                </div>
              </div>
              
              <button 
                onClick={() => handleStartSimulation(sim)}
                className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-brand-primary/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                Começar agora
                <ArrowRight size={18} />
              </button>

              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-[#00b094]/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
