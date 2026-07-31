import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Video, 
  Link as LinkIcon, 
  Search, 
  X, 
  Folder, 
  Library,
  ArrowRight,
  Database,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { materialService } from '../services/materialService';
import { Material } from '../types';
import PdfVisualizer from './PdfVisualizer';
import Spinner from './Spinner';

type MaterialType = 'all' | 'pdf' | 'video' | 'link';

export default function Materiais() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<MaterialType>('all');
  const [selectedPdf, setSelectedPdf] = useState<Material | null>(null);

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    try {
      const data = await materialService.getMaterials();
      setMaterials(data);
    } catch (error) {
      console.error('Failed to fetch materials:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMaterials = useMemo(() => {
    return materials.filter((mat) => {
      const searchStr = `${mat.title} ${mat.subject || ''} ${mat.foco || ''} ${mat.description || ''}`.toLowerCase();
      const matchesSearch = searchStr.includes(searchTerm.toLowerCase());
      const matchesFilter = activeFilter === 'all' || mat.type === activeFilter;
      return matchesSearch && matchesFilter;
    });
  }, [materials, searchTerm, activeFilter]);

  const typeLabels = {
    all: 'TODOS',
    pdf: 'PDFS',
    video: 'VÍDEOS',
    link: 'LINKS'
  };

  const typeIcons = {
    all: <Database size={16} />,
    pdf: <FileText size={16} />,
    video: <Video size={16} />,
    link: <LinkIcon size={16} />
  };

  return (
    <div className="max-w-6xl mx-auto pt-10 md:pt-24 pb-32 px-4 md:px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {/* Header Library Card */}
        <div className="bg-bg-card/50 backdrop-blur-xl border border-border-color shadow-sm rounded-[32px] md:rounded-3xl p-6 md:p-8 relative overflow-hidden group">
          <div className="absolute top-4 right-6 md:top-0 md:right-0 md:p-8">
            <span className="text-text-secondary/40 text-[10px] md:text-sm font-medium">
              <span className="text-brand-primary font-bold">{materials.length}</span> disponíveis
            </span>
          </div>
          
          <div className="relative z-10">
            <span className="text-brand-primary text-[9px] md:text-[10px] font-bold mb-4 block">
              Biblioteca
            </span>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-3">
              <div className="bg-brand-primary/10 p-3 rounded-xl md:rounded-2xl shrink-0">
                <Folder className="text-brand-primary" size={28} />
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-text-main tracking-tight leading-none">
                Estudos <span className="text-brand-primary">&</span> Materiais
              </h1>
            </div>
            <p className="text-text-secondary text-xs md:text-sm max-w-sm font-medium leading-relaxed">
              Conteúdos complementares para a sua preparação.
            </p>
          </div>

          <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl" />
        </div>

        {/* Filters & Search Section */}
        <div className="bg-bg-card/30 backdrop-blur-lg border border-border-color rounded-[24px] p-4 flex flex-col md:flex-row gap-4 items-stretch md:items-center">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-brand-primary transition-colors" size={18} />
            <input 
              type="text"
              placeholder="Pesquisar materiais..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-bg-main/50 rounded-xl py-3.5 pl-12 pr-10 text-text-main text-xs placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-bold"
            />
          </div>

          <div className="flex p-1 bg-bg-main/50 rounded-xl gap-1 overflow-x-auto no-scrollbar scroll-smooth ring-1 ring-border-color">
            {(['all', 'pdf', 'video', 'link'] as MaterialType[]).map((type) => (
              <button
                key={type}
                onClick={() => setActiveFilter(type)}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[9px] md:text-[10px] font-bold transition-all whitespace-nowrap flex-1 min-w-[80px] ${
                  activeFilter === type 
                    ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' 
                    : 'text-text-secondary hover:bg-brand-primary/10 hover:text-brand-primary'
                }`}
              >
                {typeIcons[type]}
                {typeLabels[type]}
              </button>
            ))}
          </div>
        </div>


        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Spinner size={40} className="mb-4" />
            <p className="text-zinc-600 font-bold uppercase text-[9px] tracking-widest">Carregando...</p>
          </div>
        ) : (
          <>
            <div className="text-zinc-600 text-[10px] font-bold px-2">
              {filteredMaterials.length} material{filteredMaterials.length !== 1 ? 's' : ''} 
              {activeFilter !== 'all' ? ` em ${typeLabels[activeFilter]}` : ' no total'}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              <AnimatePresence mode="popLayout">
                {filteredMaterials.map((mat, i) => (
                  <motion.div
                    key={mat.id}
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2, delay: i * 0.05 }}
                    className="group bg-[#1e293b]/40 rounded-[32px] md:rounded-[40px] overflow-hidden transition-all flex flex-col"
                  >
                    <div className="p-6 md:p-8 pb-4 flex-1">
                      <div className="flex justify-between items-start mb-6 md:mb-8">
                        <div className="bg-brand-primary/10 p-4 rounded-2xl text-brand-primary group-hover:bg-brand-primary group-hover:text-white transition-all shadow-sm">
                          {mat.type === 'pdf' ? <FileText size={20} /> : mat.type === 'video' ? <Video size={20} /> : <LinkIcon size={20} />}
                        </div>
                        <span className="text-[9px] font-bold text-text-secondary bg-text-main/5 px-3 py-1 rounded-full ring-1 ring-border-color">
                          {mat.type}
                        </span>
                      </div>
                      
                      <h3 className="text-lg font-bold text-text-main mb-2 leading-tight group-hover:text-brand-primary transition-colors">
                        {mat.title}
                      </h3>
                      <p className="text-xs text-text-secondary font-medium leading-relaxed line-clamp-2">
                        {mat.foco && <span className="text-brand-primary">{mat.foco}</span>}
                        {mat.foco && mat.description && " • "}
                        {mat.description || mat.subject || "Material educacional."}
                      </p>
                    </div>

                    <div className="p-6 md:p-8 pt-0 mt-auto">
                       <div className="bg-bg-sidebar/50 rounded-[20px] md:rounded-[28px] p-4 flex items-center justify-between border border-border-color">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-text-main/60 leading-none">
                              {(() => {
                                try {
                                  const date = new Date(mat.uploadedAt);
                                  return isNaN(date.getTime()) ? "S/D" : format(date, "dd MMM", { locale: ptBR });
                                } catch { return "S/D"; }
                              })()}
                            </span>
                            <span className="text-[8px] font-bold text-text-secondary/50 uppercase tracking-widest mt-1">
                              PUBLICADO
                            </span>
                          </div>
                          {mat.url && mat.url !== '#' ? (
                            mat.type === 'pdf' ? (
                              <button 
                                onClick={() => setSelectedPdf(mat)}
                                className="bg-brand-primary hover:bg-brand-secondary text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-primary/20 transition-all flex items-center gap-2 active:scale-95 cursor-pointer text-center"
                              >
                                Abrir
                                <ArrowRight size={14} />
                              </button>
                            ) : (
                              <a 
                                href={mat.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="bg-brand-primary hover:bg-brand-secondary text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-primary/20 transition-all flex items-center gap-2 active:scale-95 cursor-pointer text-center"
                              >
                                Abrir
                                <ArrowRight size={14} />
                              </a>
                            )
                          ) : (
                            <button 
                              disabled
                              className="bg-zinc-800 text-zinc-500 cursor-not-allowed px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                            >
                              Sem link
                            </button>
                          )}
                       </div>
                    </div>

                  </motion.div>
                ))}
              </AnimatePresence>

              {filteredMaterials.length === 0 && (
                <div className="col-span-full py-20 text-center flex flex-col items-center gap-4">
                  <Library size={48} className="text-zinc-800" />
                  <p className="text-zinc-600 font-black uppercase tracking-widest text-xs">Vazio</p>
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>

      <AnimatePresence>
        {selectedPdf && (() => {
          const absoluteUrl = selectedPdf.url.startsWith('/') 
            ? window.location.origin + selectedPdf.url 
            : selectedPdf.url;
            
          return (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-[#18181b] border border-zinc-800 rounded-[32px] w-full max-w-5xl h-[85vh] p-6 shadow-2xl relative flex flex-col animate-in fade-in duration-300"
              >
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-800/80">
                  <div>
                    <span className="text-[10px] font-black bg-brand-primary/10 text-brand-primary px-3 py-1.5 rounded-full uppercase tracking-widest mb-1.5 inline-block">
                      {selectedPdf.subject || 'Material de Estudos'}
                    </span>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight leading-none">
                      {selectedPdf.title}
                    </h3>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <a 
                      href={absoluteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 bg-zinc-800/80 hover:bg-brand-primary text-text-secondary hover:text-white rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-wider cursor-pointer decoration-none"
                      title="Abrir em Nova Aba"
                    >
                      <ExternalLink size={14} />
                      <span className="hidden sm:inline">Nova Aba</span>
                    </a>
                    
                    <button
                      onClick={() => setSelectedPdf(null)}
                      className="p-3 bg-zinc-800/80 hover:bg-red-500/10 hover:text-red-500 text-text-secondary rounded-xl transition-all cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Informative user banner for PDF browser restrictions */}
                <div className="flex items-start gap-3 bg-brand-primary/5 border border-brand-primary/10 rounded-2xl p-4 mb-4 text-xs font-medium text-text-secondary">
                  <span className="text-sm mt-0.5">💡</span>
                  <p className="flex-1 leading-normal">
                    Se o documento não carregar no visualizador abaixo devido às configurações de segurança ou restrições do seu navegador, você pode 
                    <a 
                      href={absoluteUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-brand-primary font-black underline hover:text-brand-secondary ml-1 cursor-pointer inline-flex items-center gap-1"
                    >
                      abrir o PDF em uma nova aba <ExternalLink size={12} />
                    </a> para ler ou fazer o download.
                  </p>
                </div>

                <div className="flex-1 bg-black/40 rounded-2xl overflow-hidden relative border border-zinc-800/50 flex flex-col justify-stretch">
                  {absoluteUrl.includes('drive.google.com') ? (
                    <iframe 
                      src={absoluteUrl.replace('/view', '/preview').replace('/edit', '/preview')}
                      className="w-full h-full border-0 font-sans"
                      title={selectedPdf.title}
                      allow="autoplay"
                    />
                  ) : (
                    <PdfVisualizer url={selectedPdf.url} title={selectedPdf.title} />
                  )}
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
