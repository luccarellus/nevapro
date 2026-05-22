import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Question, UserProfile } from '../types';
import { ENEM_YEARS, ENEM_SUBJECTS } from '../data/mockData';
import { enemService } from '../services/enemService';
import { Check, X, ArrowRight, Info, Award, Loader2, BookOpen } from 'lucide-react';

interface QuestionsProps {
  onEarnXp: (xp: number, correct?: number, answered?: number, isFlashQuiz?: boolean, activityName?: string) => void;
  user: UserProfile;
}

export default function Questions({ onEarnXp, user }: QuestionsProps) {
  const [view, setView] = useState<'selection' | 'study'>('selection');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);

  const currentQuestion = questions[currentIndex];

  const handleStartStudy = async () => {
    if (selectedYear && selectedSubject) {
      setLoading(true);
      setError(null);
      try {
        const fetchedQuestions = await enemService.getLimitedQuestions(
          selectedYear, 
          selectedSubject, 
          50,
          user.languagePreference || 'ingles'
        );
        if (fetchedQuestions.length === 0) {
          setError('Nenhuma questão encontrada para os filtros selecionados.');
        } else {
          setQuestions(fetchedQuestions);
          setCurrentIndex(0);
          setUserAnswers({});
          setView('study');
        }
      } catch (err: any) {
        console.error('Error fetching questions:', err);
        setError('Ocorreu um erro ao carregar as questões. Tente novamente mais tarde.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleOptionSelect = (index: number) => {
    setUserAnswers(prev => ({
      ...prev,
      [currentIndex]: index
    }));
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleFinish = async () => {
    let correctOnes = 0;
    let totalXp = 0;

    questions.forEach((q, idx) => {
      const isCorrect = userAnswers[idx] === q.correctOptionIndex;
      if (isCorrect) {
        correctOnes++;
        totalXp += q.xpReward;
      }
      
      // Log individual answer to server (fire and forget for now, or use Promise.all)
      fetch('/api/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id || 'u1',
          questionId: q.id,
          selectedOption: userAnswers[idx],
          isCorrect,
          xpReward: q.xpReward
        })
      }).catch(err => console.error('Failed to log answer:', err));
    });

    setScore(correctOnes);
    onEarnXp(totalXp, correctOnes, questions.length, false, 'Treinamento de Questões');
    setShowResult(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="relative mb-6">
            <Loader2 className="w-16 h-16 text-[#00b094] animate-spin mx-auto" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 bg-[#00b094] rounded-full animate-ping" />
            </div>
          </div>
          <p className="text-white font-bold text-xs">Sincronizando banco de dados</p>
          <p className="text-zinc-500 text-[10px] mt-2 font-bold">Buscando questões do ENEM {selectedYear}...</p>
        </div>
      </div>
    );
  }

  if (view === 'selection') {
    return (
      <div className="max-w-6xl mx-auto pt-10 md:pt-24 pb-32 px-4 md:px-6">
        <header className="mb-10 text-center">
          <span className="text-[#00b094] text-[10px] font-bold mb-2 block">Treinamento</span>
          <h1 className="text-3xl md:text-4xl font-black text-text-main tracking-tight mb-3">Banco de questões</h1>
          <p className="text-text-secondary font-bold text-[11px] md:text-sm leading-relaxed">Milhares de edições reais do ENEM de 2009 a 2025.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          <div className="bg-bg-card/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-5 md:p-8 border border-border-color shadow-sm">
            <h3 className="text-[10px] font-bold text-text-secondary opacity-50 mb-6 md:mb-10">Escolha a edição</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {ENEM_YEARS.map(year => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`py-3 rounded-xl md:rounded-2xl font-bold text-[11px] transition-all cursor-pointer active:scale-95 ${
                    selectedYear === year
                      ? 'bg-brand-primary text-white'
                      : 'bg-text-main/5 text-text-secondary hover:bg-brand-primary/10 hover:text-brand-primary'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-bg-card/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-5 md:p-8 border border-border-color shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[10px] font-bold text-text-secondary opacity-50">Disciplina</h3>
              <span className="text-[8px] font-bold bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-full">LIMITADO</span>
            </div>
            <div className="space-y-2.5">
              {ENEM_SUBJECTS.map(subject => (
                <button
                  key={subject}
                  onClick={() => setSelectedSubject(subject)}
                  className={`w-full text-left px-4 py-3.5 md:px-5 md:py-4 rounded-xl md:rounded-2xl font-bold text-[11px] transition-all cursor-pointer active:scale-95 ${
                    selectedSubject === subject
                      ? 'bg-brand-primary text-white'
                      : 'bg-text-main/5 text-text-secondary hover:bg-brand-primary/10 hover:text-brand-primary'
                  }`}
                >
                  {subject}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleStartStudy}
          disabled={!selectedYear || !selectedSubject || loading}
          className="w-full mt-8 bg-brand-primary hover:bg-brand-secondary text-white py-4 md:py-6 rounded-2xl md:rounded-[28px] font-bold text-xs md:text-sm shadow-lg shadow-brand-primary/20 transition-all flex items-center justify-center gap-3 disabled:opacity-20 disabled:cursor-not-allowed group active:scale-[0.98]"
        >
          {loading ? 'Sincronizando...' : 'Iniciar treinamento'}
          <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
        </button>


        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 p-6 bg-red-500/10 text-red-500 rounded-3xl text-center font-black text-[10px] uppercase tracking-widest"
          >
            {error}
          </motion.div>
        )}
      </div>
    );
  }

  if (showResult) {
    return (
      <div className="max-w-2xl mx-auto pt-32 px-6 text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="apple-card py-12"
        >
          <div className="w-20 h-20 bg-apple-blue/10 text-apple-blue rounded-full flex items-center justify-center mx-auto mb-6">
            <Award size={40} />
          </div>
          <h2 className="text-3xl font-bold mb-2">Simulado concluído!</h2>
          <div className="flex justify-center gap-8 my-8">
            <div className="text-center">
              <p className="text-[10px] font-bold text-apple-secondary-text mb-1">Acertos</p>
              <p className="text-4xl font-bold text-emerald-500">{score}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-apple-secondary-text mb-1">Total</p>
              <p className="text-4xl font-bold text-apple-text">{questions.length}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-apple-secondary-text mb-1">Aproveitamento</p>
              <p className="text-4xl font-bold text-apple-blue">{questions.length > 0 ? Math.round((score / questions.length) * 100) : 0}%</p>
            </div>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="apple-button-primary w-full max-w-xs"
          >
            Voltar ao início
          </button>
        </motion.div>
      </div>
    );
  }

  if (view === 'study' && !currentQuestion) {
    return (
      <div className="max-w-2xl mx-auto pt-32 px-6 text-center">
        <div className="apple-card py-12">
          <p className="text-apple-secondary-text mb-4">Carregando questões ou nenhuma encontrada.</p>
          <button onClick={() => setView('selection')} className="apple-button-primary">Voltar para Seleção</button>
        </div>
      </div>
    );
  }

   return (
    <div className="max-w-4xl mx-auto pt-24 pb-32 px-4 md:px-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion.id}
          layout
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="px-4 py-2 bg-brand-primary/10 rounded-2xl text-[10px] font-bold text-brand-primary border border-brand-primary/20 shadow-sm">
                {currentQuestion.subject}
              </div>
              <div className="px-4 py-2 bg-text-main/5 rounded-2xl text-[10px] font-bold text-text-secondary border border-border-color shadow-sm">
                ENEM {selectedYear}
              </div>
            </div>
            <div className="text-[10px] font-bold text-text-secondary bg-bg-card/50 px-4 py-2 rounded-2xl border border-border-color">
              Questão <span className="text-brand-primary">{currentIndex + 1}</span> <span className="text-text-main/20 mx-1">/</span> {questions.length}
            </div>
          </div>

          <div className="bg-bg-card/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-5 md:p-14 shadow-2xl mb-8 relative overflow-hidden border border-border-color group">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
              <BookOpen size={120} />
            </div>

            <div className="prose prose-invert max-w-none mb-10 relative z-10 font-sans">
              <div className="text-base md:text-xl lg:text-2xl leading-relaxed text-text-main font-medium tracking-tight">
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
                        <div className="my-6 md:my-14 flex justify-center">
                          <img 
                            src={fullUrl} 
                            alt={alt || 'Imagem da questão'} 
                            className="max-w-full h-auto rounded-2xl md:rounded-3xl bg-bg-sidebar p-3 md:p-6 shadow-2xl ring-1 ring-border-color" 
                            referrerPolicy="no-referrer"
                            loading="lazy"
                          />
                        </div>
                      );
                    },
                    p: ({ children }) => <p className="mb-6 last:mb-0 leading-relaxed opacity-95">{children}</p>
                  }}
                >
                  {currentQuestion.text}
                </ReactMarkdown>
              </div>
            </div>

            <div className="space-y-3.5 md:space-y-5 relative z-10">
              {currentQuestion.options.map((option, index) => {
                const isSelected = userAnswers[currentIndex] === index;
                const optionImage = currentQuestion.optionImages?.[index];

                return (
                  <button
                    key={index}
                    onClick={() => handleOptionSelect(index)}
                    className={`w-full text-left p-4 md:p-6 rounded-2xl md:rounded-[32px] border transition-all duration-500 group/opt relative overflow-hidden ${
                      isSelected 
                      ? 'bg-brand-primary/10 border-brand-primary/30 shadow-xl shadow-brand-primary/10' 
                      : 'bg-bg-main/30 border-transparent hover:border-border-color hover:bg-bg-main/50'
                    }`}
                  >
                    <div className="flex items-start gap-4 md:gap-6 relative z-10">
                      <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center font-black text-xs md:text-sm shrink-0 transition-all duration-500 ${
                        isSelected 
                        ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/40 rotate-[360deg] scale-110' 
                        : 'bg-bg-sidebar text-text-secondary group-hover/opt:text-brand-primary border border-border-color'
                      }`}>
                        {String.fromCharCode(64 + index + 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        {option && (
                          <p className={`font-bold text-sm sm:text-base md:text-lg leading-snug transition-colors ${isSelected ? 'text-text-main' : 'text-text-secondary group-hover/opt:text-text-main'}`}>
                            {option}
                          </p>
                        )}
                        
                        {optionImage && (
                          <div className="mt-4 sm:mt-6 rounded-2xl bg-bg-sidebar p-3 ring-1 ring-border-color inline-block overflow-hidden max-w-full">
                            <img 
                               src={optionImage} 
                              alt={`Opção ${String.fromCharCode(65 + index)}`} 
                              className="max-h-64 object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                       <motion.div 
                         layoutId="check-bg"
                         className="absolute inset-0 bg-gradient-to-r from-brand-primary/5 to-transparent pointer-events-none"
                       />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="apple-button-secondary py-4 md:py-5 px-10 text-xs font-bold group w-full sm:w-auto"
            >
              Anterior
            </button>
            
            {currentIndex < questions.length - 1 ? (
              <button
                onClick={handleNext}
                className="flex-1 py-4 md:py-5 bg-bg-card/40 hover:bg-bg-card text-brand-primary rounded-2xl md:rounded-[28px] font-bold text-xs transition-all flex items-center justify-center gap-4 border border-border-color shadow-xl active:scale-[0.98] group cursor-pointer"
              >
                Próxima questão
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                className="flex-1 py-4 md:py-5 bg-brand-primary hover:bg-brand-secondary text-white rounded-2xl md:rounded-[28px] font-bold text-xs transition-all flex items-center justify-center gap-4 shadow-2xl shadow-brand-primary/20 active:scale-[0.98] cursor-pointer"
              >
                Finalizar desafio
                <Award size={20} />
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
