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
  pdf: { icon: FileText, color: 'bg-red-500/10 text-red-500' },
  video: { icon: Video, color: 'bg-blue-500/10 text-blue-500' },
  link: { icon: LinkIcon, color: 'bg-brand-primary/10 text-brand-primary' },
};

export default function AdminMateriais({ materials, onEdit, onDelete, onAdd }: AdminMateriaisProps) {
  return (
    <div className="lg:col-span-12">
      <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[32px] md:rounded-[40px] p-8 md:p-12">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h3 className="text-2xl font-black text-text-main tracking-tight">Gerenciar Materiais</h3>
            <p className="text-sm text-text-secondary font-medium">Biblioteca de PDFs, vídeos e links externos para os alunos.</p>
          </div>
          <button onClick={onAdd}
            className="bg-brand-primary/10 text-brand-primary px-6 py-3 rounded-xl font-black text-[10px] tracking-wider hover:bg-brand-primary hover:text-white transition-all flex items-center gap-2">
            <Plus size={16} />
            Adicionar Material
          </button>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-color">
                <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 pl-4">Tipo</th>
                <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40">Título</th>
                <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40">Foco</th>
                <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40">Data</th>
                <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 text-right pr-4">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color/50">
              {materials.map((mat) => {
                const TypeIcon = typeConfig[mat.type]?.icon || FileText;
                const typeColor = typeConfig[mat.type]?.color || 'bg-brand-primary/10 text-brand-primary';
                return (
                  <tr key={mat.id} className="group hover:bg-text-main/[0.02] transition-colors">
                    <td className="py-6 pl-4">
                      <span className={`text-[10px] font-black tracking-wider px-2 py-1 rounded-lg inline-flex items-center gap-1.5 ${typeColor}`}>
                        <TypeIcon size={12} />
                        {mat.type}
                      </span>
                    </td>
                    <td className="py-6">
                      <div className="text-text-main font-bold text-sm">{mat.title}</div>
                      <div className="text-text-secondary text-[10px] font-medium opacity-50 truncate max-w-[300px]">{mat.description}</div>
                    </td>
                    <td className="py-6">
                      <div className="text-text-secondary text-[10px] font-bold tracking-wider opacity-60">{mat.foco}</div>
                    </td>
                    <td className="py-6 font-mono text-[10px] text-text-secondary opacity-60">{formatDateToBR(mat.uploadedAt || '')}</td>
                    <td className="py-6 text-right pr-4">
                      <div className="flex justify-end gap-1">
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(mat); }}
                          className="p-2 text-text-secondary hover:text-brand-primary transition-colors cursor-pointer relative z-[70]" title="Editar Material">
                          <Pencil size={15} />
                        </button>
                        <button onClick={(e) => onDelete(mat.id, e)}
                          className="p-2 text-text-secondary hover:text-red-500 transition-colors cursor-pointer relative z-[70]" title="Excluir Material">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {materials.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-[10px] font-black text-text-secondary opacity-50">Nenhum material cadastrado</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden space-y-4">
          {materials.map((mat) => {
            const TypeIcon = typeConfig[mat.type]?.icon || FileText;
            const typeColor = typeConfig[mat.type]?.color || 'bg-brand-primary/10 text-brand-primary';
            return (
              <div key={mat.id} className="bg-bg-main/50 border border-border-color rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span className={`text-[9px] font-black tracking-wider px-2 py-0.5 rounded inline-flex items-center gap-1 ${typeColor}`}>
                    <TypeIcon size={11} />
                    {mat.type}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => onEdit(mat)} className="p-1.5 text-text-secondary hover:text-brand-primary transition-colors cursor-pointer"><Pencil size={14} /></button>
                    <button onClick={(e) => onDelete(mat.id, e)} className="p-1.5 text-text-secondary hover:text-red-500 transition-colors cursor-pointer"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="text-text-main font-bold text-sm mb-1">{mat.title}</div>
                <div className="text-text-secondary text-[10px] font-medium opacity-60 mb-1">{mat.description}</div>
                <div className="text-[10px] font-bold text-text-secondary opacity-50">{mat.foco}</div>                  <div className="text-[10px] font-bold text-text-secondary opacity-40 mt-1">{formatDateToBR(mat.uploadedAt || '')}</div>
              </div>
            );
          })}
          {materials.length === 0 && (
            <div className="py-12 text-center text-[10px] font-black text-text-secondary opacity-50">Nenhum material cadastrado</div>
          )}
        </div>
      </div>
    </div>
  );
}
