import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import confetti from 'canvas-confetti';
import { 
  AlertOctagon, ArrowRight, Award, 
  Check, X, ChevronDown, MessageSquare, 
  BarChart2, CheckCircle2, Frown, Sparkles, Search, RotateCcw
} from 'lucide-react';
import { MarkdownImage } from './ProxiedImage';
import QuestionOption from './QuestionOption';
import { UserProfile } from '../types';
import Spinner from './Spinner';

interface ErrorQuestion {
  id: string;
  subject: string;
  text: string;
  imageUrl: string | null;
  correctOptionIndex: number;
  explanation: string;
  difficulty: string;
  year: number;
  index: number;
  selectedOptionIndex: number;
  answeredAt: string;
  options: string[];
  optionImages: (string | null)[];
}

interface ErrorsBookProps {
  user: UserProfile;
  onEarnXp: (amount: number, correct?: number, answered?: number, isFlash?: boolean, actionName?: string) => void;
}

export default function ErrorsBook({ user, onEarnXp }: ErrorsBookProps) {
  const [errors, setErrors] = useState<ErrorQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');

  // Controle de estado interativo por questão
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTabInQuestion, setActiveTabInQuestion] = useState<Record<string, 'comment' | 'stats' | 'none'>>({});
  const [retrySelectedOption, setRetrySelectedOption] = useState<Record<string, number>>({});
  const [retryStatus, setRetryStatus] = useState<Record<string, 'correct' | 'wrong' | 'idle' | 'interactive'>>({});
  const [solvedIds, setSolvedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchErrors();
  }, [user.email]);

  const fetchErrors = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/user/errors?email=${encodeURIComponent(user.email || '')}`);
      if (!res.ok) {
        throw new Error('Falha ao carregar os dados.');
      }
      const data = await res.json();
      setErrors(data);
    } catch (err) {
      console.error(err);
      setErrorMsg('Não foi possível carregar o seu caderno de erros. Tente novamente mais tarde.');
    } finally {
      setLoading(false);
    }
  };

  // Coleta anos únicos disponíveis para os filtros
  const availableYears = useMemo(() => {
    const years = errors.map(e => e.year);
    return Array.from(new Set(years)).sort((a, b) => b - a);
  }, [errors]);

  // Coleta disciplinas únicas
  const availableSubjects = useMemo(() => {
    const subjects = errors.map(e => e.subject);
    return Array.from(new Set(subjects)).sort();
  }, [errors]);

  // Estatísticas gerais
  const stats = useMemo(() => {
    const total = errors.length;
    const solvedCount = solvedIds.size;
    const remaining = Math.max(0, total - solvedCount);

    const subjectCounts: Record<string, { total: number; solved: number }> = {};
    errors.forEach(err => {
      if (!subjectCounts[err.subject]) {
        subjectCounts[err.subject] = { total: 0, solved: 0 };
      }
      subjectCounts[err.subject].total++;
      if (solvedIds.has(err.id)) {
        subjectCounts[err.subject].solved++;
      }
    });

    return {
      total,
      remaining,
      solvedCount,
      subjectCounts
    };
  }, [errors, solvedIds]);

  // Filtragem local
  const filteredQuestions = useMemo(() => {
    return errors.filter(q => {
      // Remover do filtro as questões que já foram resolvidas com sucesso nesta sessão
      if (solvedIds.has(q.id)) return false;

      const matchesSearch = q.text.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (q.subject || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesYear = selectedYear === 'all' || q.year.toString() === selectedYear;
      const matchesSubject = selectedSubject === 'all' || q.subject === selectedSubject;

      return matchesSearch && matchesYear && matchesSubject;
    });
  }, [errors, searchTerm, selectedYear, selectedSubject, solvedIds]);

  // Função para abrir o painel de Comentários ou Estatísticas embaixo da questão
  const toggleQuestionTab = (questionId: string, tab: 'comment' | 'stats') => {
    setActiveTabInQuestion(prev => {
      const current = prev[questionId] || 'none';
      return {
        ...prev,
        [questionId]: current === tab ? 'none' : tab
      };
    });
  };

  // Executa tentativa de refazer a questão
  const handleRetryQuestion = async (question: ErrorQuestion) => {
    const selected = retrySelectedOption[question.id];
    if (selected === undefined) return;

    const isCorrect = selected === question.correctOptionIndex;

    try {
      setRetryStatus(prev => ({ ...prev, [question.id]: isCorrect ? 'correct' : 'wrong' }));

      // Envia resposta para a API
      const res = await fetch('/api/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id || 'u1',
          questionId: question.id,
          selectedOption: selected,
          isCorrect,
          xpReward: 10 // Recompensa menor por refazer erro
        })
      });

      if (isCorrect) {
        // Animação de confetes premium
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#00b094', '#4fb99b', '#ddb46f', '#ffffff']
        });

        // Concede XP e pontos de acerto
        onEarnXp(15, 1, 1, false, `Corrigiu erro: Questão ${question.index} (${question.year})`);

        // Agenda remoção com animação suave de saída
        setTimeout(() => {
          setSolvedIds(prev => {
            const next = new Set(prev);
            next.add(question.id);
            return next;
          });
          // Fecha expansão
          setExpandedId(null);
        }, 1500);
      } else {
        // Vibração física/visual no erro (feedback imediato)
        if (navigator.vibrate) navigator.vibrate(200);
        
        setTimeout(() => {
          setRetryStatus(prev => ({ ...prev, [question.id]: 'idle' }));
        }, 2000);
      }
    } catch (err) {
      console.error('Falha ao enviar resposta de correção:', err);
    }
  };

  const formatLetter = (idx: number) => String.fromCharCode(65 + idx); // A, B, C, D, E

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Spinner className="w-16 h-16 text-rose-500 mx-auto mb-6" />
          <p className="text-text-main font-black uppercase tracking-widest text-sm">Carregando Erros</p>
          <p className="text-text-secondary text-[10px] mt-2 font-bold uppercase opacity-60">Sincronizando seu desempenho...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pt-16 sm:pt-24 pb-20 sm:pb-32 px-4 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-10"
      >
        {/* Header */}
        <header className="text-center">
          <span className="text-rose-500 text-[10px] font-black tracking-[0.3em] uppercase mb-2 block">PEDAGÓGICO</span>
          <h1 className="text-3xl sm:text-4xl font-black text-text-main tracking-tight mb-3">Caderno de Erros</h1>
          <p className="text-text-secondary text-xs sm:text-base font-medium max-w-2xl mx-auto">
            Revise seus erros em simulados e questões, entenda as resoluções e tente respondê-las novamente para fixar o conteúdo.
          </p>
        </header>

        {/* Dashboard de Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Quantidade */}
          <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[32px] p-6 flex items-center justify-between shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-[0.03] text-rose-500">
              <AlertOctagon size={100} />
            </div>
            <div>
              <p className="text-[10px] font-black text-text-secondary uppercase tracking-wider mb-1 opacity-60">Erros Pendentes</p>
              <h3 className="text-4xl font-black text-rose-500 leading-none">{stats.remaining}</h3>
              <p className="text-[10px] font-bold text-text-secondary/70 mt-2">
                Total registrado: {stats.total}
              </p>
            </div>
            <div className="w-14 h-14 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center shrink-0">
              <AlertOctagon className="w-7 h-7" />
            </div>
          </div>

          {/* Card 2: Resolvidos */}
          <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[32px] p-6 flex items-center justify-between shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-[0.03] text-brand-primary">
              <CheckCircle2 size={100} />
            </div>
            <div>
              <p className="text-[10px] font-black text-text-secondary uppercase tracking-wider mb-1 opacity-60">Erros Corrigidos</p>
              <h3 className="text-4xl font-black text-brand-primary leading-none">{stats.solvedCount}</h3>
              <p className="text-[10px] font-bold text-text-secondary/70 mt-2">
                Taxa de recuperação: {stats.total > 0 ? Math.round((stats.solvedCount / stats.total) * 100) : 0}%
              </p>
            </div>
            <div className="w-14 h-14 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
          </div>

          {/* Card 3: Resumo por Área */}
          <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[32px] p-6 shadow-lg relative overflow-hidden">
            <p className="text-[10px] font-black text-text-secondary uppercase tracking-wider mb-3 opacity-60 block">Erros por Disciplina</p>
            <div className="space-y-2">
              {Object.keys(stats.subjectCounts).length === 0 ? (
                <p className="text-[10px] text-text-secondary/50 font-bold italic py-4">Sem dados para análise.</p>
              ) : (
                Object.entries(stats.subjectCounts).slice(0, 3).map(([subj, count]) => {
                  const percent = Math.round((count.solved / count.total) * 100) || 0;
                  return (
                    <div key={subj} className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold text-text-secondary">
                        <span className="truncate max-w-[150px]">{subj}</span>
                        <span>{count.total - count.solved} restantes</span>
                      </div>
                      <div className="h-1.5 bg-bg-main rounded-full overflow-hidden">
                        <div 
                          className={`h-full bg-rose-500 rounded-full ${
                            (() => {
                              const ratio = (count.total - count.solved) / stats.total;
                              if (ratio >= 0.95) return 'w-full';
                              if (ratio >= 0.90) return 'w-11/12';
                              if (ratio >= 0.80) return 'w-10/12';
                              if (ratio >= 0.75) return 'w-9/12';
                              if (ratio >= 0.70) return 'w-8/12';
                              if (ratio >= 0.60) return 'w-7/12';
                              if (ratio >= 0.50) return 'w-6/12';
                              if (ratio >= 0.40) return 'w-5/12';
                              if (ratio >= 0.30) return 'w-4/12';
                              if (ratio >= 0.25) return 'w-3/12';
                              if (ratio >= 0.16) return 'w-2/12';
                              return 'w-1/12';
                            })()
                          }`}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-bg-card/30 backdrop-blur-xl border border-border-color rounded-3xl p-5 md:p-6 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
          {/* Busca por texto */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/50 w-4.5 h-4.5" />
            <input
              type="text"
              placeholder="Buscar pelo enunciado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-bg-main border border-border-color rounded-2xl pl-12 pr-4 py-3 text-text-main font-bold text-xs focus:outline-none focus:border-rose-500/50 transition-all font-sans"
            />
          </div>

          {/* Seletores Dropdowns */}
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {/* Filtro de Disciplina */}
            <div className="relative flex-1 sm:flex-none sm:w-52">
              <select
                title="Selecionar Matéria"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="select-pill w-full text-center text-text-secondary uppercase tracking-wider"
              >
                <option value="all">Todas as Matérias</option>
                {availableSubjects.map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
              <div className="select-pill-chevron">
                <ChevronDown size={14} />
              </div>
            </div>

            {/* Filtro de Edição (Ano) */}
            <div className="relative flex-1 sm:flex-none sm:w-44">
              <select
                title="Selecionar Ano"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="select-pill w-full text-center text-text-secondary uppercase tracking-wider"
              >
                <option value="all">Todos os Anos</option>
                {availableYears.map(yr => (
                  <option key={yr} value={yr}>ENEM {yr}</option>
                ))}
              </select>
              <div className="select-pill-chevron">
                <ChevronDown size={14} />
              </div>
            </div>
          </div>
        </div>

        {/* Lista de Questões Erradas */}
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {filteredQuestions.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-bg-card/20 border border-border-color rounded-[32px] p-16 text-center shadow-inner"
              >
                {searchTerm || selectedYear !== 'all' || selectedSubject !== 'all' ? (
                  <>
                    <Frown className="w-16 h-16 text-text-secondary/40 mx-auto mb-6" />
                    <h4 className="text-lg font-black text-text-main uppercase tracking-wider mb-2">Nenhuma questão encontrada</h4>
                    <p className="text-text-secondary text-xs font-bold leading-relaxed max-w-sm mx-auto">
                      Experimente alterar os filtros ou limpar a barra de buscas para visualizar outros erros.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 bg-brand-primary/10 text-brand-primary rounded-full flex items-center justify-center mx-auto mb-6">
                      <Sparkles className="w-10 h-10 animate-bounce" />
                    </div>
                    <h4 className="text-xl font-black text-text-main uppercase tracking-wider mb-2">Seu caderno está limpo!</h4>
                    <p className="text-text-secondary text-xs sm:text-sm font-bold leading-relaxed max-w-md mx-auto">
                      Parabéns! Você não tem nenhum erro pendente no momento. Continue praticando simulados e respondendo questões para testar seus limites.
                    </p>
                  </>
                )}
              </motion.div>
            ) : (
              filteredQuestions.map((q) => {
                const isExpanded = expandedId === q.id;
                const activeTab = activeTabInQuestion[q.id] || 'none';
                const selectedRetry = retrySelectedOption[q.id];
                const status = retryStatus[q.id] || 'idle';

                return (
                  <motion.div
                    key={q.id}
                    layout
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[24px] overflow-hidden shadow-sm hover:border-rose-500/20 transition-all duration-300"
                  >
                    {/* Header do Card compactado */}
                    <div 
                      onClick={() => setExpandedId(isExpanded ? null : q.id)}
                      className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 cursor-pointer select-none"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="px-3 py-1.5 bg-rose-500/10 rounded-xl text-[9px] font-black text-rose-500 border border-rose-500/20 shadow-sm uppercase tracking-wider">
                          {q.subject}
                        </span>
                        <span className="px-3 py-1.5 bg-text-main/5 rounded-xl text-[9px] font-black text-text-secondary border border-border-color shadow-sm uppercase">
                          ENEM {q.year}
                        </span>
                        <span className="text-[10px] font-bold text-text-secondary/70">
                          Questão {q.index}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <span className="text-[9px] font-bold text-text-secondary/40 uppercase tracking-widest font-sans">
                          {new Date(q.answeredAt).toLocaleDateString('pt-BR')}
                        </span>
                        <ChevronDown 
                          size={18} 
                          className={`text-text-secondary transition-transform duration-300 ${isExpanded ? 'rotate-180 text-rose-500' : ''}`} 
                        />
                      </div>
                    </div>

                    {/* Conteúdo Expandido (Mockup Exact Match & Refazer) */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden border-t border-border-color/30"
                        >
                          <div className="p-5 md:p-8 space-y-8 bg-bg-sidebar/10">
                            
                            {/* Tags do Mockup */}
                            <div className="flex flex-wrap gap-2.5">
                              <span className="px-4 py-1.5 bg-blue-500/10 rounded-full text-[10px] font-bold text-blue-400 leading-none">
                                {q.subject}
                              </span>
                              <span className="px-4 py-1.5 bg-[#1F2937] text-white rounded-full text-[10px] font-bold leading-none">
                                Questão {q.index}
                              </span>
                            </div>

                            {/* Enunciado */}
                            <div className="prose prose-invert max-w-none font-sans text-text-main/90 leading-relaxed text-sm sm:text-base">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw]}
                                components={{
                                  img: MarkdownImage,
                                  p: ({ children }) => <p className="mb-4 last:mb-0 whitespace-pre-wrap">{children}</p>
                                }}
                              >
                                {q.text}
                              </ReactMarkdown>
                            </div>

                            {/* Imagem Central (se houver) */}
                            {q.imageUrl && (
                              <div className="rounded-2xl overflow-hidden bg-bg-sidebar p-3 ring-1 ring-border-color shadow-inner max-w-lg mx-auto">
                                <img 
                                  src={q.imageUrl} 
                                  alt="Questão" 
                                  className="w-full h-auto object-contain mx-auto"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            )}

                            {/* Lista de Alternativas Estilizada */}
                            <div className="grid grid-cols-1 gap-3.5">
                              {q.options.map((option, optIdx) => (
                                <QuestionOption
                                  key={optIdx}
                                  index={optIdx}
                                  text={option}
                                  imageUrl={q.optionImages?.[optIdx]}
                                  isSelected={status !== 'idle' ? selectedRetry === optIdx : optIdx === q.selectedOptionIndex}
                                  isCorrectOption={optIdx === q.correctOptionIndex}
                                  isUserWrong={status === 'idle' && optIdx === q.selectedOptionIndex && optIdx !== q.correctOptionIndex}
                                  interactive={true}
                                  size="md"
                                  onSelect={(idx) => {
                                    setRetrySelectedOption(prev => ({ ...prev, [q.id]: idx }));
                                    setRetryStatus(prev => ({ ...prev, [q.id]: 'interactive' }));
                                  }}
                                />
                              ))}
                            </div>

                            {/* Barra de Status e Ações do Mockup */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border-color/30">
                              
                              {/* Rodapé do Mockup: Opção correta vs marcada */}
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold w-full sm:w-auto">
                                <span className="text-emerald-500">
                                  Opção correta: {formatLetter(q.correctOptionIndex)}
                                </span>
                                <span className="bg-border-color w-[1px] h-3 hidden sm:block" />
                                <span className="text-rose-500">
                                  Opção marcada: {formatLetter(q.selectedOptionIndex)}
                                </span>
                              </div>

                              {/* Rodapé do Mockup: Badge da direita */}
                              <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end shrink-0">
                                <div className="px-4 py-1.5 bg-blue-500/10 text-blue-400 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm">
                                  Resposta: {formatLetter(q.selectedOptionIndex)}
                                </div>
                                
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => toggleQuestionTab(q.id, 'comment')}
                                    className={`px-4 py-2 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                      activeTab === 'comment'
                                        ? 'bg-rose-500/10 border-rose-500 text-rose-500'
                                        : 'bg-text-main/5 border-border-color text-text-secondary hover:bg-text-main/10 hover:text-text-main'
                                    }`}
                                  >
                                    Comentários
                                  </button>
                                  <button
                                    onClick={() => toggleQuestionTab(q.id, 'stats')}
                                    className={`px-4 py-2 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                      activeTab === 'stats'
                                        ? 'bg-rose-500/10 border-rose-500 text-rose-500'
                                        : 'bg-text-main/5 border-border-color text-text-secondary hover:bg-text-main/10 hover:text-text-main'
                                    }`}
                                  >
                                    Estatísticas
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Modo Refazer (Botões de Ação) */}
                            {status === 'interactive' && (
                              <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex flex-col sm:flex-row gap-3 p-4 bg-rose-500/5 border border-rose-500/25 rounded-2xl items-center"
                              >
                                <div className="flex items-center gap-2 text-[10px] font-black text-rose-500 uppercase tracking-widest flex-1">
                                  <RotateCcw size={14} className="animate-spin" />
                                  <span>Respondendo Novamente...</span>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                  <button
                                    onClick={() => handleRetryQuestion(q)}
                                    className="px-6 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] w-full sm:w-auto"
                                  >
                                    Confirmar Resposta
                                  </button>
                                  <button
                                    onClick={() => {
                                      setRetryStatus(prev => ({ ...prev, [q.id]: 'idle' }));
                                      setRetrySelectedOption(prev => {
                                        const next = { ...prev };
                                        delete next[q.id];
                                        return next;
                                      });
                                    }}
                                    className="px-6 py-2.5 bg-text-main/5 border border-border-color hover:bg-text-main/10 text-text-secondary rounded-xl text-[10px] font-black uppercase tracking-widest transition-all w-full sm:w-auto"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </motion.div>
                            )}

                            {/* Alerta de Feedback no Modo Refazer */}
                            {status === 'correct' && (
                              <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 rounded-2xl font-black text-[10px] uppercase tracking-widest text-center flex items-center justify-center gap-2"
                              >
                                <CheckCircle2 size={16} />
                                <span>Resposta Correta! Removendo do caderno de erros...</span>
                              </motion.div>
                            )}

                            {status === 'wrong' && (
                              <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="p-4 bg-red-500/10 border border-red-500/30 text-red-500 rounded-2xl font-black text-[10px] uppercase tracking-widest text-center flex items-center justify-center gap-2 animate-shake"
                              >
                                <X size={16} />
                                <span>Resposta Incorreta! Continue tentando.</span>
                              </motion.div>
                            )}

                            {/* TABS EXPANSÍVEIS (COMENTÁRIOS E ESTATÍSTICAS) */}
                            {activeTab === 'comment' && (
                              <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-6 bg-bg-main/50 border border-border-color rounded-2xl space-y-3"
                              >
                                <h5 className="text-[10px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-1.5">
                                  <MessageSquare size={13} /> Resolução Pedagógica
                                </h5>
                                <p className="text-xs sm:text-sm text-text-secondary leading-relaxed font-sans font-medium whitespace-pre-wrap">
                                  {q.explanation}
                                </p>
                              </motion.div>
                            )}

                            {activeTab === 'stats' && (
                              <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-6 bg-bg-main/50 border border-border-color rounded-2xl space-y-4"
                              >
                                <h5 className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                                  <BarChart2 size={13} /> Dados da Questão
                                </h5>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                  <div className="bg-bg-sidebar/50 p-3.5 rounded-xl border border-border-color/50">
                                    <span className="block text-[8px] font-black text-text-secondary uppercase opacity-60">Dificuldade</span>
                                    <span className="text-xs font-black text-text-main capitalize">{q.difficulty}</span>
                                  </div>
                                  <div className="bg-bg-sidebar/50 p-3.5 rounded-xl border border-border-color/50">
                                    <span className="block text-[8px] font-black text-text-secondary uppercase opacity-60">Recompensa</span>
                                    <span className="text-xs font-black text-brand-primary">50 XP</span>
                                  </div>
                                  <div className="bg-bg-sidebar/50 p-3.5 rounded-xl border border-border-color/50">
                                    <span className="block text-[8px] font-black text-text-secondary uppercase opacity-60">Edição</span>
                                    <span className="text-xs font-black text-text-main">ENEM {q.year}</span>
                                  </div>
                                  <div className="bg-bg-sidebar/50 p-3.5 rounded-xl border border-border-color/50">
                                    <span className="block text-[8px] font-black text-text-secondary uppercase opacity-60">Matéria</span>
                                    <span className="text-xs font-black text-blue-400 truncate block">{q.subject}</span>
                                  </div>
                                </div>
                              </motion.div>
                            )}

                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
