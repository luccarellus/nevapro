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
      <div className="bg-bg-card border border-border-color rounded-2xl md:rounded-3xl p-6 md:p-10 shadow-sm">
        <div className="flex justify-between items-center mb-8 pb-4 border-b border-border-color">
          <div>
            <h3 className="text-xl font-black text-text-main tracking-tight">Gerenciar Eventos</h3>
            <p className="text-xs text-text-secondary font-medium mt-0.5">Cronograma de simulados, aulões e eventos presenciais.</p>
          </div>
          <button onClick={onAdd}
            className="bg-text-main text-bg-main hover:opacity-90 transition-all px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer shadow-sm">
            <Plus size={15} />
            Adicionar Evento
          </button>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-color">
                <th className="pb-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60 pl-3">Tipo</th>
                <th className="pb-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Título</th>
                <th className="pb-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">XP</th>
                <th className="pb-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Data</th>
                <th className="pb-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60 text-right pr-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color/60">
              {eventos.map((evt) => (
                <tr key={evt.id} className="group hover:bg-text-main/[0.02] transition-colors">
                  <td className="py-4 pl-3">
                    <span className="bg-text-main/5 text-text-secondary border border-border-color text-[10px] font-semibold tracking-wide px-2.5 py-1 rounded-lg inline-block">{evt.category}</span>
                  </td>
                  <td className="py-4">
                    <div className="text-text-main font-bold text-sm">{evt.title}</div>
                    <div className="text-text-secondary text-[11px] font-medium opacity-60">{evt.observation || 'Sem observações'}</div>
                  </td>
                  <td className="py-4 text-xs font-bold text-text-main">+{evt.xpReward} XP</td>
                  <td className="py-4 text-xs font-medium text-text-secondary opacity-70">{formatDateToBR(evt.date)} às {evt.time}</td>
                  <td className="py-4 text-right pr-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(evt); }}
                        className="p-2 text-text-secondary hover:text-text-main transition-colors cursor-pointer relative z-[70]" title="Editar Evento">
                        <Pencil size={15} />
                      </button>
                      <button onClick={(e) => onDelete(evt.id, e)}
                        className="p-2 text-text-secondary hover:text-red-400 transition-colors cursor-pointer relative z-[70]" title="Excluir Evento">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {eventos.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-xs font-medium text-text-secondary opacity-50">Nenhum evento cadastrado</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden space-y-3">
          {eventos.map((evt) => (
            <div key={evt.id} className="bg-bg-main/30 border border-border-color rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-text-secondary opacity-70 shrink-0" />
                  <span className="bg-text-main/5 text-text-secondary border border-border-color text-[10px] font-semibold px-2 py-0.5 rounded-md">{evt.category}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => onEdit(evt)} className="p-1.5 text-text-secondary hover:text-text-main transition-colors cursor-pointer"><Pencil size={14} /></button>
                  <button onClick={(e) => onDelete(evt.id, e)} className="p-1.5 text-text-secondary hover:text-red-400 transition-colors cursor-pointer"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="text-text-main font-bold text-sm mb-1">{evt.title}</div>
              <div className="text-[11px] font-medium text-text-secondary opacity-70 mb-1">{formatDateToBR(evt.date)}</div>
              <div className="text-[11px] font-medium text-text-secondary opacity-50">{evt.observation || 'Sem observações'}</div>
              <div className="mt-2 text-xs font-bold text-text-main">+{evt.xpReward} XP</div>
            </div>
          ))}
          {eventos.length === 0 && (
            <div className="py-12 text-center text-xs font-medium text-text-secondary opacity-50">Nenhum evento cadastrado</div>
          )}
        </div>
      </div>
    </div>
  );
}
