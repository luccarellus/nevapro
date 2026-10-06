import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { Plus, X } from 'lucide-react';
import { UserProfile } from '../types';

interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  hint?: string;
  subject: string;
  deck: string;
  source: 'errors' | 'curated' | 'custom';
  stage?: number;
}

interface FlashcardsProps {
  user: UserProfile;
}

const DEFAULT_CURATED_CARDS: FlashcardItem[] = [
  {
    id: 'bio-1',
    deck: 'Biologia · Citologia',
    subject: 'Biologia',
    front: 'Qual é a principal função da mitocôndria na célula?',
    back: 'Produção de energia celular através da respiração celular aeróbica (síntese de ATP).',
    hint: 'Possui DNA próprio e dupla membrana.',
    source: 'curated',
  },
  {
    id: 'bio-2',
    deck: 'Biologia · Citologia',
    subject: 'Biologia',
    front: 'Qual a diferença entre retículo endoplasmático rugoso e liso?',
    back: 'O rugoso possui ribossomos aderidos e sintetiza proteínas; o liso sintetiza lipídios e atua na desintoxicação.',
    source: 'curated',
  },
  {
    id: 'quim-1',
    deck: 'Química · Estequiometria',
    subject: 'Química',
    front: 'Qual é o volume ocupado por 1 mol de gás ideal nas CNTP?',
    back: '22,4 litros (a 0 °C e 1 atm).',
    source: 'curated',
  },
  {
    id: 'quim-2',
    deck: 'Química · Estequiometria',
    subject: 'Química',
    front: 'O que define o reagente limitante em uma reação química?',
    back: 'É o reagente consumido primeiro por completo, determinando a quantidade máxima de produto formado.',
    source: 'curated',
  },
  {
    id: 'hist-1',
    deck: 'História · Era Vargas',
    subject: 'História',
    front: 'Qual documento instaurou a ditadura do Estado Novo em 1937?',
    back: 'A Constituição de 1937 (conhecida como "A Polaca"), outorgada por Getúlio Vargas.',
    source: 'curated',
  },
  {
    id: 'hist-2',
    deck: 'História · Era Vargas',
    subject: 'História',
    front: 'O que foi a CLT criada no governo de Vargas?',
    back: 'A Consolidação das Leis do Trabalho (1943), unificando leis trabalhistas como salário mínimo e jornada de 8h.',
    source: 'curated',
  },
  {
    id: 'mat-1',
    deck: 'Matemática · Fórmulas',
    subject: 'Matemática',
    front: 'Qual é a fórmula do volume de um cone reto?',
    back: 'V = (1/3) · π · r² · h (um terço da área da base pela altura).',
    source: 'curated',
  },
  {
    id: 'mat-2',
    deck: 'Matemática · Fórmulas',
    subject: 'Matemática',
    front: 'Como calcular o vértice de uma parábola (Xv e Yv)?',
    back: 'Xv = -b / (2a)  e  Yv = -Δ / (4a).',
    source: 'curated',
  },
];

const STORAGE_CUSTOM_KEY = 'neva_custom_flashcards';

export default function Flashcards({ user }: FlashcardsProps) {
  const [activeTab, setActiveTab] = useState<'today' | 'decks' | 'errors'>('today');
  const [selectedDeckFilter, setSelectedDeckFilter] = useState<string | null>(null);
  const [customCards, setCustomCards] = useState<FlashcardItem[]>([]);
  const [errorCards, setErrorCards] = useState<FlashcardItem[]>([]);
  const [isLoadingErrors, setIsLoadingErrors] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Formulário de novo card
  const [newSubject, setNewSubject] = useState('Biologia');
  const [newTopic, setNewTopic] = useState('Citologia');
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [newHint, setNewHint] = useState('');

  // Carrega cards customizados salvos localmente
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CUSTOM_KEY);
      if (saved) {
        const parsed: FlashcardItem[] = JSON.parse(saved);
        setCustomCards(Array.isArray(parsed) ? parsed.filter((c) => c?.source === 'custom') : []);
      }
    } catch {
      // Ignora erro de storage corrompido
    }
  }, []);

  // Carrega erros do caderno de erros do aluno (viram cards automaticamente)
  useEffect(() => {
    let active = true;
    const fetchErrors = async () => {
      setIsLoadingErrors(true);
      try {
        const res = await fetch(`/api/user/errors?email=${encodeURIComponent(user.email || '')}`);
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data)) {
            const converted: FlashcardItem[] = data.map((e: any) => {
              const correctOption = Array.isArray(e?.options) && typeof e?.correctOptionIndex === 'number'
                ? e.options[e.correctOptionIndex]
                : '';
              return {
                id: `error-${e.id}`,
                deck: `${e.subject || 'Geral'} · Caderno de Erros`,
                subject: e.subject || 'Geral',
                front: e.text || 'Pergunta do Caderno de Erros',
                back: correctOption || 'Abra a questão no Caderno de Erros para ver a resolução.',
                hint: e.explanation || '',
                source: 'errors' as const,
              };
            });
            setErrorCards(converted);
          }
        }
      } catch {
        if (active) setErrorCards([]);
      } finally {
        if (active) setIsLoadingErrors(false);
      }
    };
    fetchErrors();
    return () => { active = false; };
  }, [user.email]);

  // Deck curado (conteúdo base) + cards criados pelo aluno
  const allCards = useMemo(() => [...DEFAULT_CURATED_CARDS, ...customCards], [customCards]);

  // Baralho ativo de acordo com a aba e o filtro de deck
  const activeDeck = useMemo(() => {
    const pool: FlashcardItem[] = activeTab === 'errors'
      ? errorCards
      : [...allCards, ...errorCards];

    if (selectedDeckFilter) {
      return pool.filter((c) => c.deck === selectedDeckFilter);
    }
    return pool;
  }, [activeTab, allCards, errorCards, selectedDeckFilter]);

  const currentCard = activeDeck.length > 0 ? activeDeck[currentIndex % activeDeck.length] : null;

  const handleFlip = () => {
    setIsFlipped(prev => !prev);
  };

  const handleReviewAnswer = () => {
    if (activeDeck.length === 0) return;
    setIsFlipped(false);

    if (currentIndex + 1 >= activeDeck.length) {
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      setCurrentIndex(0);
    } else {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handleSaveNewCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFront.trim() || !newBack.trim()) return;

    const newCard: FlashcardItem = {
      id: `custom-${Date.now()}`,
      deck: `${newSubject} · ${newTopic || 'Geral'}`,
      subject: newSubject,
      front: newFront.trim(),
      back: newBack.trim(),
      hint: newHint.trim() || undefined,
      source: 'custom',
    };

    const updated = [newCard, ...customCards];
    setCustomCards(updated);
    try {
      localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(updated));
    } catch {}

    setNewFront('');
    setNewBack('');
    setNewHint('');
    setIsCreateModalOpen(false);
  };

  // Decks reais derivados dos cards (curado + criados + vindos de erros)
  const decksList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of [...allCards, ...errorCards]) {
      counts.set(card.deck, (counts.get(card.deck) || 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allCards, errorCards]);

  return (
    <div className="max-w-6xl mx-auto pt-6 sm:pt-10 pb-20 px-4 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-text-main tracking-tight mb-1">
              Flashcards
            </h1>
            <p className="text-text-secondary text-sm sm:text-base font-medium">
              Revisão espaçada: o app mostra cada card no momento certo.
            </p>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="self-start sm:self-auto flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-primary text-black font-black text-sm hover:opacity-95 transition-all shadow-md shadow-brand-primary/20"
          >
            <Plus size={16} strokeWidth={3} />
            <span>Novo card</span>
          </button>
        </div>

        {/* Abas / Filtros */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => {
              setActiveTab('today');
              setSelectedDeckFilter(null);
              setCurrentIndex(0);
              setIsFlipped(false);
            }}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
              activeTab === 'today' && !selectedDeckFilter
                ? 'bg-brand-primary text-black shadow-md'
                : 'bg-bg-card/60 hover:bg-bg-card border border-border-color text-text-secondary hover:text-text-main'
            }`}
          >
            Revisar hoje · {allCards.length + errorCards.length}
          </button>

          <button
            onClick={() => {
              setActiveTab('decks');
              setSelectedDeckFilter(null);
              setCurrentIndex(0);
              setIsFlipped(false);
            }}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
              activeTab === 'decks'
                ? 'bg-brand-primary text-black shadow-md'
                : 'bg-bg-card/60 hover:bg-bg-card border border-border-color text-text-secondary hover:text-text-main'
            }`}
          >
            Meus decks
          </button>

          <button
            onClick={() => {
              setActiveTab('errors');
              setSelectedDeckFilter(null);
              setCurrentIndex(0);
              setIsFlipped(false);
            }}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
              activeTab === 'errors'
                ? 'bg-brand-primary text-black shadow-md'
                : 'bg-bg-card/60 hover:bg-bg-card border border-border-color text-text-secondary hover:text-text-main'
            }`}
          >
            Vindos do Caderno de Erros · {errorCards.length}
          </button>
        </div>

        {/* Grid Principal: Card + Painel Lateral */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Coluna da Esquerda: Flashcard Interativo */}
          <div className="lg:col-span-8 bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-3xl p-6 sm:p-10 flex flex-col justify-between min-h-[440px] shadow-lg relative">
            {activeDeck.length === 0 ? (
              <div className="my-auto text-center flex flex-col items-center justify-center py-10 px-4">
                <p className="text-sm font-bold text-text-main mb-2">
                  {activeTab === 'errors'
                    ? (isLoadingErrors ? 'Carregando seus erros...' : 'Nenhum erro virou card ainda')
                    : 'Nenhum card disponível'}
                </p>
                <p className="text-xs font-medium text-text-secondary max-w-sm leading-relaxed">
                  {activeTab === 'errors'
                    ? 'Marque questões no Caderno de Erros e elas aparecerão aqui automaticamente para revisão.'
                    : 'Crie um card novo para começar a revisar.'}
                </p>
              </div>
            ) : (
            <>
            {/* Topo do card */}
            <div className="flex items-center justify-between text-xs sm:text-sm font-medium text-text-secondary">
              <span className="truncate max-w-[200px] sm:max-w-xs">
                {currentCard?.deck || 'Geral'}
              </span>
              <span>
                Card {((currentIndex % activeDeck.length) + 1)} de {activeDeck.length}
              </span>
            </div>

            {/* Conteúdo Central (Pergunta / Resposta) */}
            <div className="my-auto py-8 text-center flex flex-col items-center justify-center">
              <AnimatePresence mode="wait">
                {!isFlipped ? (
                  <motion.div
                    key="front"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    className="max-w-xl mx-auto"
                  >
                    <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-text-main leading-relaxed">
                      {currentCard?.front}
                    </h2>
                  </motion.div>
                ) : (
                  <motion.div
                    key="back"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    className="max-w-xl mx-auto space-y-4"
                  >
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
                      Resposta
                    </p>
                    <h3 className="text-lg sm:text-xl font-bold text-text-main leading-relaxed">
                      {currentCard?.back}
                    </h3>
                    {currentCard?.hint && (
                      <p className="text-xs font-medium text-text-secondary/70 italic pt-2">
                        {currentCard.hint}
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Rodapé do card: Ações */}
            <div className="pt-4">
              {!isFlipped ? (
                <div className="flex justify-center">
                  <button
                    onClick={handleFlip}
                    className="px-8 py-3 rounded-2xl bg-brand-primary text-black font-black text-sm hover:brightness-110 transition-all shadow-lg shadow-brand-primary/20 cursor-pointer"
                  >
                    Mostrar resposta
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <button
                    onClick={handleReviewAnswer}
                    className="bg-[#0a0f1d] hover:bg-[#141b2a] border border-border-color hover:border-red-500/50 rounded-2xl py-3 px-2 flex flex-col items-center justify-center transition-all cursor-pointer group"
                  >
                    <span className="text-sm font-bold text-text-main group-hover:text-red-400">Errei</span>
                    <span className="text-[11px] font-medium text-text-secondary">1 min</span>
                  </button>

                  <button
                    onClick={handleReviewAnswer}
                    className="bg-[#0a0f1d] hover:bg-[#141b2a] border border-border-color hover:border-amber-500/50 rounded-2xl py-3 px-2 flex flex-col items-center justify-center transition-all cursor-pointer group"
                  >
                    <span className="text-sm font-bold text-text-main group-hover:text-amber-400">Difícil</span>
                    <span className="text-[11px] font-medium text-text-secondary">1 dia</span>
                  </button>

                  <button
                    onClick={handleReviewAnswer}
                    className="bg-[#0a0f1d] hover:bg-[#141b2a] border border-border-color hover:border-brand-primary/50 rounded-2xl py-3 px-2 flex flex-col items-center justify-center transition-all cursor-pointer group"
                  >
                    <span className="text-sm font-bold text-text-main group-hover:text-brand-primary">Bom</span>
                    <span className="text-[11px] font-medium text-text-secondary">3 dias</span>
                  </button>

                  <button
                    onClick={handleReviewAnswer}
                    className="bg-[#0a0f1d] hover:bg-[#141b2a] border border-border-color hover:border-emerald-400/50 rounded-2xl py-3 px-2 flex flex-col items-center justify-center transition-all cursor-pointer group"
                  >
                    <span className="text-sm font-bold text-text-main group-hover:text-emerald-400">Fácil</span>
                    <span className="text-[11px] font-medium text-text-secondary">7 dias</span>
                  </button>
                </div>
              )}
            </div>
            </>
            )}
          </div>

          {/* Coluna da Direita: Decks e Info */}
          <div className="lg:col-span-4 space-y-6">
            {/* Card 1: Decks com cards para hoje */}
            <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-3xl p-6 shadow-lg">
              <h3 className="text-base font-bold text-text-main mb-4">
                Decks com cards para hoje
              </h3>
              <div className="space-y-3">
                {decksList.map((d) => (
                  <button
                    key={d.name}
                    onClick={() => {
                      setSelectedDeckFilter(selectedDeckFilter === d.name ? null : d.name);
                      setCurrentIndex(0);
                      setIsFlipped(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all text-left ${
                      selectedDeckFilter === d.name
                        ? 'bg-brand-primary/15 border border-brand-primary/30 text-text-main'
                        : 'hover:bg-text-main/5 text-text-secondary hover:text-text-main'
                    }`}
                  >
                    <span className="text-xs sm:text-sm font-semibold truncate pr-2">
                      {d.name}
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-brand-primary">
                      {d.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Card 2: Erro vira card */}
            <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-3xl p-6 shadow-lg space-y-2">
              <h3 className="text-base font-bold text-text-main">
                Erro vira card
              </h3>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed font-medium">
                Ao marcar uma questão no Caderno de Erros, o sistema cria o flashcard automaticamente.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Modal: Novo Card */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-card border border-border-color rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-text-main">Criar Novo Flashcard</h3>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 rounded-xl text-text-secondary hover:text-text-main hover:bg-text-main/5"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveNewCard} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                      Matéria
                    </label>
                    <select
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      className="w-full bg-[#0a0f1d] border border-border-color rounded-xl px-3 py-2.5 text-xs font-semibold text-text-main"
                    >
                      <option value="Biologia">Biologia</option>
                      <option value="Química">Química</option>
                      <option value="Física">Física</option>
                      <option value="Matemática">Matemática</option>
                      <option value="História">História</option>
                      <option value="Geografia">Geografia</option>
                      <option value="Linguagens">Linguagens</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                      Assunto / Tópico
                    </label>
                    <input
                      type="text"
                      value={newTopic}
                      onChange={(e) => setNewTopic(e.target.value)}
                      placeholder="Ex: Citologia"
                      className="w-full bg-[#0a0f1d] border border-border-color rounded-xl px-3 py-2.5 text-xs font-semibold text-text-main"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                    Frente (Pergunta)
                  </label>
                  <textarea
                    rows={3}
                    value={newFront}
                    onChange={(e) => setNewFront(e.target.value)}
                    placeholder="Ex: Qual a principal função da mitocôndria?"
                    className="w-full bg-[#0a0f1d] border border-border-color rounded-xl p-3 text-xs font-semibold text-text-main"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                    Verso (Resposta)
                  </label>
                  <textarea
                    rows={3}
                    value={newBack}
                    onChange={(e) => setNewBack(e.target.value)}
                    placeholder="Ex: Produção de ATP através da respiração celular..."
                    className="w-full bg-[#0a0f1d] border border-border-color rounded-xl p-3 text-xs font-semibold text-text-main"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                    Dica ou explicação (opcional)
                  </label>
                  <input
                    type="text"
                    value={newHint}
                    onChange={(e) => setNewHint(e.target.value)}
                    placeholder="Ex: Teoria endossimbiótica..."
                    className="w-full bg-[#0a0f1d] border border-border-color rounded-xl px-3 py-2 text-xs font-semibold text-text-main"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-border-color text-text-secondary hover:text-text-main text-xs font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-brand-primary text-black font-black text-xs hover:opacity-95 transition-all shadow-md shadow-brand-primary/20"
                  >
                    Salvar card
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
