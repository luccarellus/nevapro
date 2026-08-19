import { Material } from '../../types';
import { Plus, Pencil, Trash2, FileText, Video, Link as LinkIcon } from 'lucide-react';
import { formatDateToBR } from './AdminUtils';

interface AdminMateriaisProps {
  materials: Material[];
  onEdit: (mat: Material) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onAdd: () => void;
}

const typeConfig: Record<string, { icon: typeof FileText; color: string }> = {
  pdf: { icon: FileText, color: 'bg-text-main/5 text-text-secondary border border-border-color' },
  video: { icon: Video, color: 'bg-text-main/5 text-text-secondary border border-border-color' },
  link: { icon: LinkIcon, color: 'bg-text-main/5 text-text-secondary border border-border-color' },
};

export default function AdminMateriais({ materials, onEdit, onDelete, onAdd }: AdminMateriaisProps) {
  return (
    <div className="lg:col-span-12">
      <div className="bg-bg-card border border-border-color rounded-2xl md:rounded-3xl p-6 md:p-10 shadow-sm">
        <div className="flex justify-between items-center mb-8 pb-4 border-b border-border-color">
          <div>
            <h3 className="text-xl font-black text-text-main tracking-tight">Gerenciar Materiais</h3>
            <p className="text-xs text-text-secondary font-medium mt-0.5">Biblioteca de PDFs, vídeos e links externos para os alunos.</p>
          </div>
          <button onClick={onAdd}
            className="bg-text-main text-bg-main hover:opacity-90 transition-all px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer shadow-sm">
            <Plus size={15} />
            Adicionar Material
          </button>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-color">
                <th className="pb-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60 pl-3">Tipo</th>
                <th className="pb-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Título</th>
                <th className="pb-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Foco</th>
                <th className="pb-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Data</th>
                <th className="pb-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60 text-right pr-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color/60">
              {materials.map((mat) => {
                const TypeIcon = typeConfig[mat.type]?.icon || FileText;
                const typeColor = typeConfig[mat.type]?.color || 'bg-text-main/5 text-text-secondary border border-border-color';
                return (
                  <tr key={mat.id} className="group hover:bg-text-main/[0.02] transition-colors">
                    <td className="py-4 pl-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 ${typeColor}`}>
                        <TypeIcon size={12} />
                        {mat.type}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="text-text-main font-bold text-sm">{mat.title}</div>
                      <div className="text-text-secondary text-[11px] font-medium opacity-60 truncate max-w-[300px]">{mat.description}</div>
                    </td>
                    <td className="py-4">
                      <div className="text-text-secondary text-xs font-semibold">{mat.foco}</div>
                    </td>
                    <td className="py-4 text-xs font-medium text-text-secondary opacity-70">{formatDateToBR(mat.uploadedAt || '')}</td>
                    <td className="py-4 text-right pr-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(mat); }}
                          className="p-2 text-text-secondary hover:text-text-main transition-colors cursor-pointer relative z-[70]" title="Editar Material">
                          <Pencil size={15} />
                        </button>
                        <button onClick={(e) => onDelete(mat.id, e)}
                          className="p-2 text-text-secondary hover:text-red-400 transition-colors cursor-pointer relative z-[70]" title="Excluir Material">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {materials.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-xs font-medium text-text-secondary opacity-50">Nenhum material cadastrado</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden space-y-3">
          {materials.map((mat) => {
            const TypeIcon = typeConfig[mat.type]?.icon || FileText;
            const typeColor = typeConfig[mat.type]?.color || 'bg-text-main/5 text-text-secondary border border-border-color';
            return (
              <div key={mat.id} className="bg-bg-main/30 border border-border-color rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded inline-flex items-center gap-1 ${typeColor}`}>
                    <TypeIcon size={11} />
                    {mat.type}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => onEdit(mat)} className="p-1.5 text-text-secondary hover:text-text-main transition-colors cursor-pointer"><Pencil size={14} /></button>
                    <button onClick={(e) => onDelete(mat.id, e)} className="p-1.5 text-text-secondary hover:text-red-400 transition-colors cursor-pointer"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="text-text-main font-bold text-sm mb-1">{mat.title}</div>
                <div className="text-text-secondary text-[11px] font-medium opacity-60 mb-1">{mat.description}</div>
                <div className="text-[11px] font-semibold text-text-secondary opacity-70">{mat.foco}</div>
                <div className="text-[10px] font-medium text-text-secondary opacity-50 mt-1">{formatDateToBR(mat.uploadedAt || '')}</div>
              </div>
            );
          })}
          {materials.length === 0 && (
            <div className="py-12 text-center text-xs font-medium text-text-secondary opacity-50">Nenhum material cadastrado</div>
          )}
        </div>
      </div>
    </div>
  );
}
