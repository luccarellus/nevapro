import { Notice } from '../../types';
import { Plus, Pencil, Trash2, Megaphone } from 'lucide-react';
import { formatDateToBR } from './AdminUtils';

interface AdminMuralProps {
  recados: Notice[];
  onEdit: (rec: Notice) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onAdd: () => void;
}

const categoryConfig: Record<string, { label: string; color: string }> = {
  importante: { label: 'Aviso oficial', color: 'bg-text-main/10 text-text-main border border-border-color font-bold' },
  estudos: { label: 'Estudos', color: 'bg-text-main/5 text-text-secondary border border-border-color' },
  apoio: { label: 'Apoio', color: 'bg-text-main/5 text-text-secondary border border-border-color' },
};

export default function AdminMural({ recados, onEdit, onDelete, onAdd }: AdminMuralProps) {
  return (
    <div className="bg-bg-card border border-border-color rounded-2xl md:rounded-3xl p-5 sm:p-6 lg:p-8 shadow-sm">
        <div className="flex justify-between items-center mb-8 pb-4 border-b border-border-color">
          <div>
            <h3 className="text-xl font-black text-text-main tracking-tight">Mural de Recados</h3>
            <p className="text-xs text-text-secondary font-medium mt-0.5">Comunicados e avisos oficiais do projeto.</p>
          </div>
          <button onClick={onAdd}
            className="bg-brand-primary text-white hover:opacity-90 transition-all px-4 py-2.5 rounded-full font-bold text-xs flex items-center gap-2 cursor-pointer shadow-sm shadow-brand-primary/20">
            <Plus size={15} />
            Adicionar Recado
          </button>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-color">
                <th className="pb-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60 pl-3">Categoria</th>
                <th className="pb-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Título</th>
                <th className="pb-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Etiqueta</th>
                <th className="pb-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Data</th>
                <th className="pb-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60 text-right pr-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color/60">
              {recados.map((rec) => {
                const cat = categoryConfig[rec.category || 'apoio'] || categoryConfig.apoio;
                return (
                  <tr key={rec.id} className="group hover:bg-text-main/[0.02] transition-colors">
                    <td className="py-4 pl-3">
                      <span className={`text-[10px] tracking-wide px-2.5 py-1 rounded-lg inline-block ${cat.color}`}>{cat.label}</span>
                    </td>
                    <td className="py-4">
                      <div className="text-text-main font-bold text-sm">{rec.title}</div>
                      <div className="text-text-secondary text-[11px] font-medium opacity-60 truncate max-w-[300px]">{rec.content}</div>
                    </td>
                    <td className="py-4">
                      <div className="text-text-secondary text-xs font-semibold">{rec.tag || '-'}</div>
                    </td>
                    <td className="py-4 text-xs font-medium text-text-secondary opacity-70">{formatDateToBR(rec.date || '')}</td>
                    <td className="py-4 text-right pr-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(rec); }}
                          className="p-2 text-text-secondary hover:text-text-main transition-colors cursor-pointer relative z-[70] rounded-full" title="Editar Recado">
                          <Pencil size={15} />
                        </button>
                        <button onClick={(e) => onDelete(rec.id, e)}
                          className="p-2 text-text-secondary hover:text-red-400 transition-colors cursor-pointer relative z-[70] rounded-full" title="Excluir Recado">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {recados.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-xs font-medium text-text-secondary opacity-50">Nenhum recado cadastrado</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden space-y-3">
          {recados.map((rec) => {
            const cat = categoryConfig[rec.category || 'apoio'] || categoryConfig.apoio;
            return (
              <div key={rec.id} className="bg-bg-main/30 border border-border-color rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <Megaphone size={14} className="text-text-secondary opacity-70 shrink-0" />
                    <span className={`text-[10px] tracking-wide px-2 py-0.5 rounded-md ${cat.color}`}>{cat.label}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => onEdit(rec)} className="p-1.5 text-text-secondary hover:text-text-main transition-colors cursor-pointer rounded-full"><Pencil size={14} /></button>
                    <button onClick={(e) => onDelete(rec.id, e)} className="p-1.5 text-text-secondary hover:text-red-400 transition-colors cursor-pointer rounded-full"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="text-text-main font-bold text-sm mb-1">{rec.title}</div>
                <div className="text-[11px] font-medium text-text-secondary opacity-60 mb-2">{rec.content}</div>
                {rec.tag && <span className="text-[10px] font-semibold text-text-secondary opacity-60 bg-text-main/5 px-2 py-0.5 rounded border border-border-color">{rec.tag}</span>}
                <div className="text-[10px] font-medium text-text-secondary opacity-50 tracking-wider mt-2">{formatDateToBR(rec.date || '')}</div>
              </div>
            );
          })}
          {recados.length === 0 && (
            <div className="py-12 text-center text-xs font-medium text-text-secondary opacity-50">Nenhum recado cadastrado</div>
          )}
        </div>
      </div>
  );
}
