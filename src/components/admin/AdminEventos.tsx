import { StudyEvent } from '../../types';
import { Plus, Pencil, Trash2, Calendar } from 'lucide-react';
import { formatDateToBR } from './AdminUtils';

interface AdminEventosProps {
  eventos: StudyEvent[];
  onEdit: (evt: StudyEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onAdd: () => void;
}

export default function AdminEventos({ eventos, onEdit, onDelete, onAdd }: AdminEventosProps) {
  return (
    <div className="lg:col-span-12">
      <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[32px] md:rounded-[40px] p-8 md:p-12">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h3 className="text-2xl font-black text-text-main tracking-tight">Gerenciar Eventos</h3>
            <p className="text-sm text-text-secondary font-medium">Cronograma de simulados, aulões e eventos presenciais.</p>
          </div>
          <button onClick={onAdd}
            className="bg-brand-primary/10 text-brand-primary px-6 py-3 rounded-xl font-black text-[10px] tracking-wider hover:bg-brand-primary hover:text-white transition-all flex items-center gap-2">
            <Plus size={16} />
            Adicionar Evento
          </button>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-color">
                <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 pl-4">Tipo</th>
                <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40">Título</th>
                <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40">XP</th>
                <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40">Data</th>
                <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 text-right pr-4">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color/50">
              {eventos.map((evt) => (
                <tr key={evt.id} className="group hover:bg-text-main/[0.02] transition-colors">
                  <td className="py-6 pl-4">
                    <span className="bg-brand-primary/10 text-brand-primary text-[10px] font-black tracking-wider px-2 py-1 rounded-lg">{evt.category}</span>
                  </td>
                  <td className="py-6">
                    <div className="text-text-main font-bold text-sm">{evt.title}</div>
                    <div className="text-text-secondary text-[10px] font-medium opacity-50">{evt.observation || 'Sem observações'}</div>
                  </td>
                  <td className="py-6 font-mono text-[10px] text-text-secondary opacity-60">+{evt.xpReward} XP</td>
                  <td className="py-6 font-mono text-[10px] text-text-secondary opacity-60">{formatDateToBR(evt.date)} às {evt.time}</td>
                  <td className="py-6 text-right pr-4">
                    <div className="flex justify-end gap-1">
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(evt); }}
                        className="p-2 text-text-secondary hover:text-brand-primary transition-colors cursor-pointer relative z-[70]" title="Editar Evento">
                        <Pencil size={15} />
                      </button>
                      <button onClick={(e) => onDelete(evt.id, e)}
                        className="p-2 text-text-secondary hover:text-red-500 transition-colors cursor-pointer relative z-[70]" title="Excluir Evento">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {eventos.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-[10px] font-black text-text-secondary opacity-50">Nenhum evento cadastrado</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden space-y-4">
          {eventos.map((evt) => (
            <div key={evt.id} className="bg-bg-main/50 border border-border-color rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-brand-primary shrink-0" />
                  <span className="bg-brand-primary/10 text-brand-primary text-[9px] font-black tracking-wider px-2 py-0.5 rounded">{evt.category}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => onEdit(evt)} className="p-1.5 text-text-secondary hover:text-brand-primary transition-colors cursor-pointer"><Pencil size={14} /></button>
                  <button onClick={(e) => onDelete(evt.id, e)} className="p-1.5 text-text-secondary hover:text-red-500 transition-colors cursor-pointer"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="text-text-main font-bold text-sm mb-1">{evt.title}</div>
              <div className="text-[10px] font-bold text-text-secondary opacity-60 mb-1">{formatDateToBR(evt.date)}</div>
              <div className="text-[10px] font-bold text-text-secondary opacity-50">{evt.observation || 'Sem observações'}</div>
              <div className="mt-2 text-[11px] font-black text-brand-primary">+{evt.xpReward} XP</div>
            </div>
          ))}
          {eventos.length === 0 && (
            <div className="py-12 text-center text-[10px] font-black text-text-secondary opacity-50">Nenhum evento cadastrado</div>
          )}
        </div>
      </div>
    </div>
  );
}
