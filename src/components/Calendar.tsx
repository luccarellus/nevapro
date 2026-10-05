import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar as CalendarIcon, Clock, Video, FileText, Send, ArrowRight } from 'lucide-react';
import { eventService } from '../services/crudService';
import { StudyEvent } from '../types';
import Spinner from './Spinner';

export default function Calendar() {
  const [eventos, setEventos] = useState<StudyEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<StudyEvent | null>(null);

  useEffect(() => {
    const fetchEventos = async () => {
      try {
        const data = await eventService.list();
        setEventos(data);
      } catch (error) {
        console.error('Failed to fetch eventos:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchEventos();
  }, []);

  const sortedEvents = [...eventos].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center pt-20">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pt-24 pb-32 px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <header className="mb-12">
          <span className="text-brand-primary text-[10px] font-black tracking-[0.3em] uppercase mb-2 block">AGENDA DE ATIVIDADES</span>
          <h1 className="text-4xl font-black text-text-main tracking-tight mb-3">Linha do Tempo</h1>
          <p className="text-text-secondary font-medium">Acompanhe aulas ao vivo, simulados e prazos de entrega.</p>
        </header>

        <div className="space-y-4">
          {sortedEvents.length === 0 ? (
            <div className="bg-bg-card/20 backdrop-blur-sm border border-border-color rounded-[32px] p-12 text-center">
              <CalendarIcon className="mx-auto mb-4 text-text-secondary opacity-20" size={48} />
              <p className="text-text-secondary font-bold uppercase tracking-widest text-xs opacity-50">Nenhum evento agendado para os próximos dias.</p>
            </div>
          ) : (
            sortedEvents.map((event, i) => {
              let day = '--';
              let monthName = '---';
              try {
                const dateObj = new Date(event.date + 'T12:00:00'); // Use midday to avoid timezone shifts
                if (!isNaN(dateObj.getTime())) {
                  day = dateObj.getDate().toString();
                  monthName = dateObj.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
                }
              } catch (e) {
                console.error("Invalid date in calendar:", event.date);
              }
              
              const typeIcons: Record<string, React.ReactNode> = {
                live: <Video size={20} />,
                simulado: <FileText size={20} />,
                entrega: <Send size={20} />,
                evento: <CalendarIcon size={20} />,
              };

              const typeColors: Record<string, string> = {
                live: 'text-brand-primary bg-brand-primary/10',
                simulado: 'text-purple-500 bg-purple-500/10',
                entrega: 'text-orange-500 bg-orange-500/10',
                evento: 'text-emerald-500 bg-emerald-500/10',
              };

              const typeLabels: Record<string, string> = {
                live: 'AULA AO VIVO',
                simulado: 'SIMULADO OFICIAL',
                entrega: 'PRAZO FINAL',
                evento: (event.category || 'EVENTO').toUpperCase(),
              };

              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex flex-col sm:flex-row gap-4 sm:gap-6 group"
                >
                  {/* Date column */}
                  <div className="flex flex-row sm:flex-col items-center sm:w-20 shrink-0 gap-3 sm:gap-0">
                    <div className="w-full sm:w-20 h-14 sm:h-20 bg-bg-card/50 backdrop-blur-xl border border-border-color rounded-2xl sm:rounded-[24px] flex flex-row sm:flex-col items-center justify-center gap-2 sm:gap-0 p-3 sm:p-0 transition-all shadow-xl group-hover:shadow-brand-primary/5">
                      <span className="text-text-main font-black text-xl sm:text-2xl leading-none">{day}</span>
                      <span className="text-[10px] font-black text-text-secondary sm:mt-1 uppercase tracking-widest">{monthName}</span>
                    </div>
                    <div className="hidden sm:block w-px flex-1 bg-gradient-to-b from-border-color to-transparent my-4" />
                  </div>

                  {/* Content column */}
                  <div className="flex-grow pb-8 sm:pb-12">
                    <div className="bg-bg-card/20 backdrop-blur-sm border border-border-color rounded-3xl p-5 sm:p-8 hover:bg-bg-card/40 transition-all group-hover:translate-x-1 duration-300">
                      <div className="flex items-center justify-between mb-4">
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${typeColors[event.type] || typeColors.evento}`}>
                          {typeIcons[event.type] || typeIcons.evento}
                          <span className="text-[9px] font-black tracking-[0.1em]">
                            {typeLabels[event.type] || 'EVENTO'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-text-secondary font-black text-[10px] tracking-widest opacity-60">
                          <Clock size={14} />
                          <span>{event.time}</span>
                        </div>
                      </div>
                      
                      <h3 className="text-xl sm:text-2xl font-black text-text-main mb-2 leading-none uppercase tracking-tight group-hover:text-brand-primary transition-colors">{event.title}</h3>
                      <p className="text-text-secondary text-sm mb-6 leading-relaxed font-medium opacity-70">{event.observation || event.description}</p>
                      
                      <div className="flex items-center justify-between">
                        <button 
                          onClick={() => setSelectedEvent(event)}
                          className="flex items-center gap-2 text-brand-primary font-black text-[10px] uppercase tracking-widest group/btn hover:translate-x-1 transition-all cursor-pointer"
                        >
                          {event.type === 'live' ? 'Acessar sala' : 'Ver detalhes'}
                          <ArrowRight size={14} className="transition-transform group-hover/btn:translate-x-1" />
                        </button>
                        
                        {event.xpReward && (
                          <div className="px-3 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[10px] font-black uppercase tracking-widest">
                            +{event.xpReward} XP
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

      </motion.div>

      <AnimatePresence>
        {selectedEvent && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#18181b] border border-zinc-800 rounded-[32px] w-full max-w-lg p-8 shadow-2xl relative"
            >
              <div className="flex items-center gap-3 mb-6">
                <span className={`text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest leading-none ${
                  selectedEvent.type === 'live' ? 'text-brand-primary bg-brand-primary/10' : 
                  selectedEvent.type === 'simulado' ? 'text-purple-500 bg-purple-500/10' :
                  selectedEvent.type === 'entrega' ? 'text-orange-500 bg-orange-500/10' : 'text-emerald-500 bg-emerald-500/10'
                }`}>
                  {(() => {
                    if (selectedEvent.type === 'live') return 'AULA AO VIVO';
                    if (selectedEvent.type === 'simulado') return 'SIMULADO OFICIAL';
                    if (selectedEvent.type === 'entrega') return 'PRAZO FINAL';
                    return (selectedEvent.category || 'EVENTO').toUpperCase();
                  })()}
                </span>
                
                <span className="text-[10px] font-bold text-text-secondary opacity-60 flex items-center gap-1">
                  <Clock size={12} />
                  {selectedEvent.time}
                </span>
              </div>

              <h3 className="text-2xl font-black text-text-main mb-2 leading-tight uppercase tracking-tight">
                {selectedEvent.title}
              </h3>

              <div className="text-[10px] text-text-secondary opacity-60 font-black uppercase tracking-wider mb-6">
                Agendado para: {(() => {
                  try {
                    const d = new Date(selectedEvent.date + 'T12:00:00');
                    if (isNaN(d.getTime())) return selectedEvent.date;
                    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
                  } catch { return selectedEvent.date; }
                })()}
              </div>

              <div className="border-t border-zinc-800/80 pt-6 mb-6">
                <p className="text-text-secondary font-medium text-sm leading-relaxed whitespace-pre-line">
                  {selectedEvent.description || selectedEvent.observation || "Sem descrição disponível para este evento."}
                </p>
                {selectedEvent.observation && selectedEvent.description && (
                  <p className="text-text-secondary font-medium text-xs leading-relaxed mt-4 bg-zinc-800/30 p-4 rounded-2xl border border-zinc-800/50">
                    <strong className="text-text-main block text-[10px] uppercase tracking-wider mb-1 opacity-60">Observações adicionais:</strong>
                    {selectedEvent.observation}
                  </p>
                )}
              </div>

              {/* Reward indicator */}
              {selectedEvent.xpReward && (
                <div className="mb-6 bg-brand-primary/10 border border-brand-primary/20 rounded-2xl p-4 flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-primary uppercase tracking-wider">Recompensa por Participação</span>
                  <span className="text-xs font-black text-brand-primary bg-brand-primary/10 px-3 py-1.5 rounded-full">+{selectedEvent.xpReward} XP</span>
                </div>
              )}

              {/* URL detection and button generation */}
              {(() => {
                const combinedText = `${selectedEvent.description || ''} ${selectedEvent.observation || ''}`;
                const urlRegex = /(https?:\/\/[^\s]+)/gi;
                const match = combinedText.match(urlRegex);
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
                        {selectedEvent.type === 'live' ? 'Entrar na Sala Virtual' : 'Acessar Link Anexo'}
                        <ArrowRight size={14} />
                      </a>
                    </div>
                  );
                } else if (selectedEvent.type === 'live') {
                  return (
                    <div className="mb-6 bg-zinc-800/30 border border-zinc-800/50 p-4 rounded-2xl text-center">
                      <p className="text-brand-primary text-[10px] font-black uppercase tracking-widest">Link em breve</p>
                      <p className="text-text-secondary text-xs mt-1 font-semibold">O link da aula ou transmissão síncrona estará ativo logo antes do início planejado ({selectedEvent.time}).</p>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="w-full sm:w-auto px-6 py-3 bg-text-secondary/10 hover:bg-text-secondary/20 text-text-main font-bold rounded-xl text-xs uppercase tracking-widest transition-all cursor-pointer text-center"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

