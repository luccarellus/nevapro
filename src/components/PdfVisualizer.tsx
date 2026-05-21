import { ExternalLink, Download, FileText } from 'lucide-react';

interface PdfVisualizerProps {
  url: string;
  title: string;
}

export default function PdfVisualizer({ url, title }: PdfVisualizerProps) {
  // Parse relative to absolute URLs correctly
  const absoluteUrl = url.startsWith('/') 
    ? window.location.origin + url 
    : url;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#18181b] rounded-2xl overflow-hidden border border-zinc-800/50">
      {/* Top Controller Bar */}
      <div className="bg-zinc-900/90 border-b border-zinc-800 p-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-brand-primary/15 p-2 rounded-lg text-brand-primary">
            <FileText size={16} />
          </div>
          <span className="text-xs font-bold text-zinc-300 truncate max-w-[200px] md:max-w-md">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={absoluteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary hover:bg-brand-secondary text-white rounded-xl transition-all text-[10px] font-black uppercase tracking-widest cursor-pointer decoration-none shadow-md shadow-brand-primary/10 active:scale-95"
            title="Abrir em Nova Aba"
          >
            <ExternalLink size={12} />
            <span>Abrir Externa</span>
          </a>
          <a
            href={absoluteUrl}
            download
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl transition-all text-[10px] font-black uppercase tracking-widest cursor-pointer decoration-none active:scale-95"
            title="Baixar PDF"
          >
            <Download size={12} />
            <span>Baixar</span>
          </a>
        </div>
      </div>

      {/* Main Embed iFrame Container */}
      <div className="flex-1 bg-zinc-950 flex flex-col justify-stretch h-full relative">
        <iframe
          src={absoluteUrl}
          className="w-full h-full border-0 bg-zinc-950"
          title={title}
          allow="autoplay"
        />
      </div>

      {/* Footer status bar */}
      <div className="bg-zinc-900/90 border-t border-zinc-800/80 px-4 py-2.5 flex items-center justify-between text-[9px] font-mono text-zinc-500 shrink-0 select-none">
        <span>Foco: PDF do Estudante</span>
        <span className="text-[#00b094] font-bold font-sans">● Visualizador do Navegador</span>
      </div>
    </div>
  );
}
