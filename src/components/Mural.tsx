import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mail, 
  Bell, 
  Calendar as CalendarIcon, 
  BookOpen, 
  HelpCircle, 
  Layers,
  MessageSquare,
  ArrowRight,
  Info,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { muralService } from '../services/muralService';
import { Notice } from '../types';

type NoticeCategory = 'tudo' | 'importante' | 'agenda' | 'estudos' | 'apoio';

export default function Mural() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<NoticeCategory>('tudo');
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const fetchNotices = async () => {
      try {
        const data = await muralService.getRecados();
        setNotices(data);
      } catch (error) {
        console.error('Failed to fetch notices:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchNotices();
  }, []);

  const categories = [
    { 
      id: 'tudo', 
      label: 'Tudo', 
      description: 'Visão geral com todos os comunicados.', 
      icon: <Layers size={18} />,
      longDesc: 'Acompanhe os recados institucionais e as orientações do projeto em um só lugar.'
    },
    { 
      id: 'importante', 
      label: 'Avisos oficiais', 
      description: 'Inscrições, mudanças e prazos da plataforma.', 
      icon: <Bell size={18} />,
      longDesc: 'Fique por dentro de prazos críticos, editais e atualizações importantes da coordenação.'
    },
    { 
      id: 'agenda', 
      label: 'Agenda', 
      description: 'Simulados, aulas ao vivo e entregas da semana.', 
      icon: <CalendarIcon size={18} />,
      longDesc: 'Planeje sua semana com as datas de eventos síncronos e prazos de atividades.'
    },
    { 
      id: 'estudos', 
      label: 'Estudos', 
      description: 'Roteiros de revisão e orientações de estudo.', 
      icon: <BookOpen size={18} />,
      longDesc: 'Dicas pedagógicas e roteiros sugeridos para otimizar seu aprendizado.'
    },
    { 
      id: 'apoio', 
      label: 'Apoio', 
      description: 'Dicas rápidas, dúvidas frequentes e suporte.', 
      icon: <HelpCircle size={18} />,
      longDesc: 'Precisa de ajuda? Aqui você encontra links úteis e canais de comunicação com o time.'
    },
  ];

  const filteredNotices = useMemo(() => {
    if (activeCategory === 'tudo') return notices;
    return notices.filter(n => n.category === activeCategory);
  }, [activeCategory, notices]);

  const currentCategoryData = categories.find(c => c.id === activeCategory);

  return (
    <div className="max-w-7xl mx-auto pt-24 pb-32 px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Mail className="text-brand-primary" size={28} />
            <h1 className="text-3xl font-black text-text-main tracking-tight">Mural de recados</h1>
          </div>
          <p className="text-text-secondary font-medium">
            Comunicados oficiais, prazos e orientações importantes para a sua rotina.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8">
          {/* Sidebar Column */}
          <div className="space-y-6">
            {/* Categories List */}
            <div className="bg-bg-card/50 backdrop-blur-xl border border-border-color shadow-sm rounded-3xl p-6">
              <span className="text-[10px] font-bold text-text-secondary opacity-50 mb-6 block">
                Categorias
              </span>
              <div className="space-y-2">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id as NoticeCategory)}
                    className={`w-full flex items-start gap-4 p-4 rounded-2xl transition-all text-left ${
                      activeCategory === cat.id 
                        ? 'bg-brand-primary/10 shadow-lg shadow-brand-primary/5' 
                        : 'hover:bg-text-main/5'
                    }`}
                  >
                    <div className={`mt-1 flex-shrink-0 ${activeCategory === cat.id ? 'text-brand-primary' : 'text-text-secondary'}`}>
                      {cat.icon}
                    </div>
                    <div>
                      <div className={`text-sm font-bold transition-colors ${activeCategory === cat.id ? 'text-brand-primary' : 'text-text-main/80'}`}>
                        {cat.label}
                      </div>
                      <div className="text-[10px] text-text-secondary/60 leading-tight mt-1 font-medium">
                        {cat.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Category Summary Card */}
            <div className="bg-bg-card/50 backdrop-blur-xl border border-border-color shadow-sm rounded-3xl p-6 space-y-4">
              <div className="space-y-2">
                <h3 className="text-text-main font-black text-lg">{currentCategoryData?.label}</h3>
                <p className="text-[11px] text-text-secondary leading-relaxed font-semibold">
                  {currentCategoryData?.longDesc}
                </p>
              </div>

              <div className="flex gap-2">
                <div className="flex-1 bg-bg-sidebar/50 border border-border-color rounded-2xl p-3 flex flex-col justify-center">
                  <span className="text-text-main font-black text-xl">{filteredNotices.length}</span>
                  <span className="text-[10px] text-text-secondary/60 font-bold uppercase tracking-widest">Recados</span>
                </div>
                <div className="flex-1 bg-brand-primary/10 border border-brand-primary/20 rounded-2xl p-3 flex flex-col justify-center">
                  <span className="text-brand-primary font-black text-[10px] uppercase">Oficial</span>
                  <span className="text-[10px] text-brand-primary/60 font-bold uppercase tracking-widest leading-none mt-1">Direto</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => setActiveCategory('tudo')}
                  className="flex-[2] bg-brand-primary text-white py-3 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-brand-primary/20 hover:bg-brand-secondary transition-all cursor-pointer"
                >
                  Abrir painel
                </button>
                <button 
                  onClick={() => setActiveCategory('tudo')}
                  className="flex-1 bg-text-main/5 hover:bg-text-main/10 text-text-secondary py-3 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer"
                >
                  Ver tudo
                </button>
              </div>
            </div>
          </div>

          {/* Main Content Column */}
          <div className="bg-bg-card/20 backdrop-blur-sm border border-border-color rounded-[40px] relative min-h-[500px] overflow-hidden">
             {isLoading ? (
               <div className="absolute inset-0 flex items-center justify-center">
                 <Loader2 className="text-brand-primary animate-spin" size={48} />
               </div>
             ) : (
               <AnimatePresence mode="popLayout">
                {filteredNotices.length > 0 ? (
                  <div className="p-8 space-y-6">
                    {filteredNotices.map((notice, i) => (
                      <motion.div
                        key={notice.id}
                        layout
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ delay: i * 0.05 }}
                        className="bg-bg-card/40 backdrop-blur-xl border border-border-color shadow-sm rounded-[32px] p-8 transition-all flex flex-col md:flex-row gap-8 relative group"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-4 mb-6">
                            <div className="bg-brand-primary/10 group-hover:bg-brand-primary group-hover:text-white p-3 rounded-2xl text-brand-primary transition-all duration-300">
                              <Info size={24} />
                            </div>
                            <div className="flex flex-col">
                              <h3 className="text-xl font-black text-text-main group-hover:text-brand-primary transition-colors leading-none mb-2 uppercase tracking-tight">{notice.title}</h3>
                              <p className="text-[10px] text-text-secondary opacity-50 font-black uppercase tracking-[0.2em]">
                                {notice.sender} • {(() => {
                                  try {
                                    const date = new Date(notice.date);
                                    return isNaN(date.getTime()) 
                                      ? "Data indisponível" 
                                      : format(date, "dd 'de' MMMM", { locale: ptBR });
                                  } catch (e) {
                                    return "Data indisponível";
                                  }
                                })()}
                              </p>
                            </div>
                          </div>
                          <p className="text-text-secondary font-medium leading-relaxed group-hover:text-text-main/80 transition-colors">
                            {notice.content}
                          </p>
                        </div>
                        <div className="flex items-center md:pl-8">
                           <button 
                             onClick={() => setSelectedNotice(notice)}
                             className="w-full md:w-16 md:h-16 bg-bg-sidebar hover:bg-brand-primary text-brand-primary hover:text-white p-4 rounded-[20px] border border-border-color transition-all flex items-center justify-center group/btn active:scale-95 shadow-xl cursor-pointer"
                           >
                             <ArrowRight size={24} className="group-hover/btn:translate-x-1 transition-transform" />
                           </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center space-y-6"
                  >
                    <div className="relative">
                      <div className="bg-brand-primary/10 p-8 rounded-full">
                        <Mail className="text-brand-primary/40" size={64} />
                      </div>
                      <div className="absolute -top-2 -right-2 bg-brand-primary w-6 h-6 rounded-full flex items-center justify-center border-4 border-bg-main">
                        <span className="w-2 h-2 bg-white rounded-full" />
                      </div>
                    </div>
                    
                    <div className="max-w-xs">
                      <h2 className="text-xl font-black text-text-main mb-2">Nenhum recado por aqui</h2>
                      <p className="text-text-secondary text-sm font-medium leading-relaxed opacity-60">
                        Tudo limpo! Quando houver novos avisos ou orientações para <span className="text-text-main">"{currentCategoryData?.label}"</span>, eles aparecerão aqui.
                      </p>
                    </div>

                    <button 
                      onClick={() => setActiveCategory('tudo')}
                      className="bg-text-main/5 hover:bg-text-main/10 text-text-secondary px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ring-1 ring-border-color"
                    >
                      Ver todos os recados
                    </button>
                  </motion.div>
                )}
             </AnimatePresence>
             )}
          </div>
        </div>

      </motion.div>

      <AnimatePresence>
        {selectedNotice && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#18181b] border border-zinc-800 rounded-[32px] w-full max-w-lg p-8 shadow-2xl relative"
            >
              <div className="flex items-center gap-3 mb-6">
                <span className="text-[10px] font-black bg-brand-primary/15 text-brand-primary px-3 py-1.5 rounded-full uppercase tracking-widest leading-none">
                  {(selectedNotice.category || 'GERAL').toUpperCase()}
                </span>
                <span className="text-[10px] font-bold text-text-secondary opacity-60">
                  {(() => {
                    try {
                      const dateObj = new Date(selectedNotice.date);
                      return isNaN(dateObj.getTime())
                        ? "Data indisponível"
                        : format(dateObj, "dd 'de' MMMM", { locale: ptBR });
                    } catch { return "Data indisponível"; }
                  })()}
                </span>
              </div>

              <h3 className="text-2xl font-black text-text-main mb-2 leading-tight uppercase tracking-tight">
                {selectedNotice.title}
              </h3>

              <div className="text-[10px] text-text-secondary opacity-60 font-black uppercase tracking-wider mb-6">
                Enviado por: {selectedNotice.sender || 'Administração'}
              </div>

              <div className="border-t border-zinc-800/80 pt-6 mb-6">
                <p className="text-text-secondary font-medium text-sm leading-relaxed whitespace-pre-line">
                  {selectedNotice.content}
                </p>
              </div>

              {/* URL detection and button generation */}
              {(() => {
                const urlRegex = /(https?:\/\/[^\s]+)/gi;
                const match = selectedNotice.content.match(urlRegex);
                const foundUrl = match ? match[0] : null;
                
                if (foundUrl) {
                  return (
                    <div className="mb-6">
                      <a 
                        href={foundUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-4 rounded-xl text-xs font-black uppercase tracking-widest text-center shadow-lg shadow-brand-primary/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        Acessar Link Anexo
                        <ArrowRight size={14} />
                      </a>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setSelectedNotice(null)}
                  className="w-full sm:w-auto px-6 py-3 bg-text-secondary/10 hover:bg-text-secondary/20 text-text-main font-bold rounded-xl text-xs uppercase tracking-widest transition-all cursor-pointer text-center"
                >
                  Fechar recado
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
