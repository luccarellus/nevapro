import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Pencil,
  FileText, 
  Video, 
  Loader2, 
  CheckCircle2, 
  LayoutGrid, 
  Calendar, 
  Megaphone, 
  Users, 
  Bell, 
  Send,
  MessageSquare,
  MoreVertical,
  Activity,
  ArrowRight,
  Clock,
  ShieldCheck,
  PanelLeftClose,
  Library,
  Upload,
  Link as LinkIcon,
  BookOpen,
  Trophy
} from 'lucide-react';
import { materialService } from '../services/materialService';
import { muralService } from '../services/muralService';
import { eventService } from '../services/eventService';
import { adminService, AdminActivity, ProductionStat } from '../services/adminService';
import { Material, Notice, StudyEvent, UserProfile } from '../types';
import Logo from './Logo';
import { calculateLevelAndProgression } from '../utils/xpUtils';

interface AdminDashboardProps {
  user: UserProfile;
  onBackToApp: () => void;
}

export default function AdminDashboard({ user, onBackToApp }: AdminDashboardProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [recados, setRecados] = useState<Notice[]>([]);
  const [eventos, setEventos] = useState<StudyEvent[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [liveActivities, setLiveActivities] = useState<AdminActivity[]>([]);
  const [productionStats, setProductionStats] = useState<ProductionStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const nextEvent = useMemo(() => {
    if (!eventos || eventos.length === 0) return null;
    const now = new Date();
    
    const futureEvents = eventos
      .map(evt => {
        if (!evt.date) return null;
        const dateOnly = evt.date.includes('T') ? evt.date.split('T')[0] : evt.date;
        const dateParts = dateOnly.split('-');
        const timeParts = (evt.time || '00:00').split(':');
        
        let eventDate: Date;
        if (dateParts.length === 3) {
          const year = parseInt(dateParts[0], 10);
          const month = parseInt(dateParts[1], 10) - 1;
          const day = parseInt(dateParts[2], 10);
          const hour = parseInt(timeParts[0] || '0', 10);
          const minute = parseInt(timeParts[1] || '0', 10);
          eventDate = new Date(year, month, day, hour, minute);
        } else {
          eventDate = new Date(evt.date);
        }
        return { evt, eventDate };
      })
      .filter((item): item is { evt: StudyEvent; eventDate: Date } => item !== null && item.eventDate >= now)
      .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());

    return futureEvents[0]?.evt || null;
  }, [eventos]);

  const [activeTab, setActiveTab] = useState<'panorama' | 'eventos' | 'materiais' | 'mural' | 'alunos'>('panorama');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [filterGremio, setFilterGremio] = useState('');

  const filteredStudents = students.filter(student => {
    const matchesSearch = (student.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (student.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCity = filterCity ? student.city === filterCity : true;
    const matchesSchool = filterSchool ? student.school === filterSchool : true;
    const matchesGremio = filterGremio ? student.gremio === filterGremio : true;
    return matchesSearch && matchesCity && matchesSchool && matchesGremio;
  });

  const citiesMA = Array.from(new Set(students.map(s => s.city).filter(Boolean))) as string[];
  const schoolsMA = Array.from(new Set(students.map(s => s.school).filter(Boolean))) as string[];
  const gremiosMA = Array.from(new Set(students.map(s => s.gremio).filter(Boolean))) as string[];
  const [showModal, setShowModal] = useState<'material' | 'recado' | 'evento' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [eventForm, setEventForm] = useState({
    title: '',
    releaseDate: '',
    xpReward: '500',
    category: 'Evento',
    observation: ''
  });

  const [materialForm, setMaterialForm] = useState({
    title: '',
    type: 'pdf',
    foco: 'ENEM geral',
    url: '',
    description: ''
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [muralForm, setMuralForm] = useState({
    title: '',
    category: 'importante',
    tag: '',
    content: ''
  });

  const handleCloseModal = () => {
    setShowModal(null);
    setEditingId(null);
    setEventForm({ title: '', releaseDate: '', xpReward: '20', category: 'Evento', observation: '' });
    setMaterialForm({ title: '', type: 'pdf', foco: 'ENEM geral', url: '', description: '' });
    setSelectedFile(null);
    setMuralForm({ title: '', category: 'importante', tag: '', content: '' });
  };

  const handleEditEvent = (evt: StudyEvent) => {
    setEditingId(evt.id);
    setEventForm({
      title: evt.title,
      releaseDate: `${evt.date}T${evt.time || '00:00'}`,
      xpReward: String(evt.xpReward || '20'),
      category: evt.category || 'Evento',
      observation: evt.observation || evt.description || ''
    });
    setShowModal('evento');
  };

  const handleEditMaterial = (mat: Material) => {
    setEditingId(mat.id);
    setMaterialForm({
      title: mat.title,
      type: mat.type,
      foco: mat.subject || 'ENEM geral',
      url: mat.url || '',
      description: mat.description || ''
    });
    setSelectedFile(null);
    setShowModal('material');
  };

  const handleEditMural = (rec: Notice) => {
    setEditingId(rec.id);
    setMuralForm({
      title: rec.title,
      category: rec.category || 'importante',
      tag: rec.tag || '',
      content: rec.content
    });
    setShowModal('recado');
  };

  const handleSaveMural = async () => {
    if (!muralForm.title || !muralForm.content) return;
    
    setIsLoading(true);
    try {
      if (editingId) {
        await muralService.updateRecado(editingId, {
          title: muralForm.title,
          category: muralForm.category as any,
          tag: muralForm.tag,
          content: muralForm.content,
        });
      } else {
        await muralService.addRecado({
          title: muralForm.title,
          category: muralForm.category as any,
          tag: muralForm.tag,
          content: muralForm.content,
          sender: 'Administração',
          date: new Date().toISOString()
        });
      }

      setIsSuccess(true);
      fetchData();
      setTimeout(() => {
        handleCloseModal();
        setIsSuccess(false);
      }, 1500);
    } catch (error) {
      console.error('Failed to save notice:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEvent = async () => {
    if (!eventForm.title || !eventForm.releaseDate) return;
    
    setIsLoading(true);
    try {
      const parts = eventForm.releaseDate.split('T');
      const date = parts[0];
      const time = parts[1] || '00:00';
      
      const payload = {
        title: eventForm.title,
        date: date,
        time: time,
        type: 'evento' as const,
        category: eventForm.category,
        xpReward: parseInt(eventForm.xpReward),
        observation: eventForm.observation
      };

      if (editingId) {
        await eventService.updateEvento(editingId, payload);
      } else {
        await eventService.addEvento(payload);
      }

      setIsSuccess(true);
      fetchData();
      setTimeout(() => {
        handleCloseModal();
        setIsSuccess(false);
      }, 1500);
    } catch (error) {
      console.error('Failed to save event:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    type: 'evento' | 'material' | 'recado';
    title: string;
  } | null>(null);

  const handleDeleteEvent = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const item = eventos.find(evt => evt.id === id);
    setDeleteConfirm({
      id,
      type: 'evento',
      title: item?.title || 'este evento'
    });
  };

  const handleDeleteMaterial = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const item = materials.find(mat => mat.id === id);
    setDeleteConfirm({
      id,
      type: 'material',
      title: item?.title || 'este material'
    });
  };

  const handleDeleteRecado = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const item = recados.find(rec => rec.id === id);
    setDeleteConfirm({
      id,
      type: 'recado',
      title: item?.title || 'este recado'
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    const { id, type } = deleteConfirm;
    
    try {
      if (type === 'evento') {
        await eventService.deleteEvento(id);
      } else if (type === 'material') {
        await materialService.deleteMaterial(id);
      } else if (type === 'recado') {
        await muralService.deleteRecado(id);
      }
      setDeleteConfirm(null);
      await fetchData();
    } catch (error) {
      console.error(`Failed to delete ${type}:`, error);
    }
  };


  const handleSaveMaterial = async () => {
    if (!materialForm.title || (!materialForm.url && !selectedFile)) return;
    
    setIsLoading(true);
    try {
      let finalUrl = materialForm.url;
      
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        if (!uploadRes.ok) {
          throw new Error('Falha no upload do arquivo');
        }
        const uploadData = await uploadRes.json();
        finalUrl = uploadData.url;
      }

      const payload = {
        title: materialForm.title,
        type: materialForm.type as any,
        foco: materialForm.foco,
        url: finalUrl,
        description: materialForm.description
      };

      if (editingId) {
        await materialService.updateMaterial(editingId, payload);
      } else {
        await materialService.addMaterial(payload);
      }

      setIsSuccess(true);
      fetchData();
      setTimeout(() => {
        handleCloseModal();
        setIsSuccess(false);
      }, 1500);
    } catch (error) {
      console.error('Failed to save material:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderModalContent = () => {
    if (showModal === 'evento') {
      return (
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Título do evento</label>
            <input 
              value={eventForm.title}
              onChange={(e) => setEventForm({...eventForm, title: e.target.value})}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all font-sans" 
              placeholder="Ex: Aulão no Cinema" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Data de liberação</label>
            <input 
              type="datetime-local"
              value={eventForm.releaseDate}
              onChange={(e) => setEventForm({...eventForm, releaseDate: e.target.value})}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all [color-scheme:dark]" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">XP de Participação (opcional)</label>
            <input 
              type="number"
              value={eventForm.xpReward}
              onChange={(e) => setEventForm({...eventForm, xpReward: e.target.value})}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all font-sans" 
              placeholder="20" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Categoria</label>
            <div className="relative">
              <select 
                value={eventForm.category}
                onChange={(e) => setEventForm({...eventForm, category: e.target.value})}
                className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all appearance-none"
              >
                <option value="Evento">Evento</option>
                <option value="Aulão">Aulão</option>
                <option value="Simulado">Simulado</option>
                <option value="Entrega">Entrega</option>
              </select>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                <ArrowRight className="rotate-90" size={16} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Observação</label>
            <textarea 
              value={eventForm.observation}
              onChange={(e) => setEventForm({...eventForm, observation: e.target.value})}
              rows={4}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all resize-none" 
              placeholder="Ex: Liberar somente para os alunos do 3º ano"
            />
          </div>

          <div className="flex gap-4 pt-4">
             <button 
              onClick={handleSaveEvent}
              disabled={isLoading}
              className="flex-1 bg-brand-primary hover:bg-brand-secondary text-white py-4 rounded-xl font-black text-[11px] tracking-wide transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
             >
                {isLoading ? <Loader2 className="animate-spin" size={16} /> : isSuccess ? <CheckCircle2 size={16} /> : null}
                {isSuccess ? (editingId ? 'Evento Atualizado' : 'Evento Salvo') : (editingId ? 'Atualizar evento' : 'Salvar evento')}
             </button>
             <button 
              onClick={() => setEventForm({ title: '', releaseDate: '', xpReward: '20', category: 'Evento', observation: '' })}
              className="bg-text-main/5 hover:bg-text-main/10 text-text-secondary px-8 py-4 rounded-xl font-black tracking-wide text-[11px] transition-all border border-border-color"
             >
               Limpar
             </button>
          </div>
        </div>
      );
    }

    if (showModal === 'recado') {
      return (
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Título</label>
            <input 
              value={muralForm.title}
              onChange={(e) => setMuralForm({...muralForm, title: e.target.value})}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all font-sans" 
              placeholder="Ex: Simulado aberto para inscrição" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Categoria</label>
            <div className="relative">
              <select 
                value={muralForm.category}
                onChange={(e) => setMuralForm({...muralForm, category: e.target.value})}
                className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all appearance-none"
              >
                <option value="importante">Aviso oficial</option>
                <option value="estudos">Estudos</option>
                <option value="apoio">Apoio</option>
              </select>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                <ArrowRight className="rotate-90" size={16} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Etiqueta</label>
            <input 
              value={muralForm.tag}
              onChange={(e) => setMuralForm({...muralForm, tag: e.target.value})}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all font-sans" 
              placeholder="Ex: Aviso, Prazo, Destaque" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Texto</label>
            <textarea 
              value={muralForm.content}
              onChange={(e) => setMuralForm({...muralForm, content: e.target.value})}
              rows={4}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all resize-none" 
              placeholder="Escreva o comunicado de forma curta, clara e objetiva."
            />
          </div>

          <div className="flex gap-4 pt-4">
             <button 
              onClick={handleSaveMural}
              disabled={isLoading}
              className="flex-1 bg-brand-primary hover:bg-brand-secondary text-white py-4 rounded-xl font-black text-[11px] tracking-wide transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
             >
                {isLoading ? <Loader2 className="animate-spin" size={16} /> : isSuccess ? <CheckCircle2 size={16} /> : null}
                {isSuccess ? (editingId ? 'Recado Atualizado' : 'Recado Salvo') : (editingId ? 'Atualizar recado' : 'Salvar recado')}
             </button>
             <button 
              onClick={() => setMuralForm({ title: '', category: 'importante', tag: '', content: '' })}
              className="bg-text-main/5 hover:bg-text-main/10 text-text-secondary px-8 py-4 rounded-xl font-black tracking-wide text-[11px] transition-all border border-border-color"
             >
               Limpar
             </button>
          </div>
        </div>
      );
    }

    if (showModal === 'material') {
      return (
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Título</label>
            <input 
              value={materialForm.title}
              onChange={(e) => setMaterialForm({...materialForm, title: e.target.value})}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all" 
              placeholder="Ex: Lista de revisão de Matemática" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Tipo</label>
            <div className="relative">
              <select 
                value={materialForm.type}
                onChange={(e) => setMaterialForm({...materialForm, type: e.target.value})}
                className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all appearance-none"
              >
                <option value="pdf">PDF</option>
                <option value="video">VÍDEO</option>
                <option value="link">LINK EXTERNO</option>
              </select>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                <ArrowRight className="rotate-90" size={16} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Foco</label>
            <div className="relative">
              <select 
                value={materialForm.foco}
                onChange={(e) => setMaterialForm({...materialForm, foco: e.target.value})}
                className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all appearance-none"
              >
                <option value="Turmas Gerais">Turmas Gerais</option>
                <option value="Medicina">Medicina</option>
                <option value="Exatas">Exatas</option>
                <option value="Humanas">Humanas</option>
              </select>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                <ArrowRight className="rotate-90" size={16} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Link / arquivo</label>
            <input 
              value={materialForm.url}
              onChange={(e) => setMaterialForm({...materialForm, url: e.target.value})}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all mb-3" 
              placeholder="link ou arquivo" 
            />
            
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 bg-bg-main border border-border-color rounded-2xl px-4 py-3 flex items-center gap-3 overflow-hidden w-full">
                <input 
                  type="file" 
                  id="file-upload" 
                  className="hidden" 
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
                <label 
                  htmlFor="file-upload" 
                  className="bg-bg-sidebar border border-border-color text-text-main px-4 py-1.5 rounded-lg text-[10px] font-black tracking-wide cursor-pointer hover:bg-bg-card transition-all shrink-0"
                >
                  Escolher arquivo
                </label>
                <span className="text-[10px] font-bold text-text-secondary truncate opacity-50">
                  {selectedFile ? selectedFile.name : 'Nenhum arquivo escolhido'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sans">
            <label className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Descrição</label>
            <textarea 
              value={materialForm.description}
              onChange={(e) => setMaterialForm({...materialForm, description: e.target.value})}
              rows={4}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all resize-none" 
              placeholder="Resumo do conteúdo e instruções de uso."
            />
          </div>

          <div className="flex gap-4 pt-4">
             <button 
              onClick={handleSaveMaterial}
              disabled={isLoading}
              className="flex-1 bg-brand-primary hover:bg-brand-secondary text-white py-4 rounded-xl font-black text-[11px] tracking-wide transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
             >
                {isLoading ? <Loader2 className="animate-spin" size={16} /> : isSuccess ? <CheckCircle2 size={16} /> : null}
                {isSuccess ? (editingId ? 'Material Atualizado' : 'Material Salvo') : (editingId ? 'Atualizar Material' : 'Salvar Material')}
             </button>
             <button 
              onClick={() => {
                setMaterialForm({ title: '', type: 'pdf', foco: 'ENEM geral', url: '', description: '' });
                setSelectedFile(null);
              }}
              className="bg-text-main/5 hover:bg-text-main/10 text-text-secondary px-8 py-4 rounded-xl font-black tracking-wide text-[11px] transition-all border border-border-color"
             >
               Limpar
             </button>
          </div>
        </div>
      );
    }

    return null;
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatDateToBR = (dateStr: string) => {
    if (!dateStr) return '-';
    const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const parts = dateOnly.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const fetchData = async () => {
    try {
      const [mats, recal, evts, studs, actsData] = await Promise.all([
        materialService.getMaterials(),
        muralService.getRecados(),
        eventService.getEventos(),
        adminService.getStudents(),
        adminService.getActivities()
      ]);
      setMaterials(mats);
      setRecados(recal);
      setEventos(evts);
      setStudents(studs);
      setLiveActivities(actsData.activities);
      setProductionStats(actsData.production);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (user.role !== 'admin') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-bg-main text-text-main">
        <div className="text-center">
          <ShieldCheck size={64} className="mx-auto mb-6 text-red-500" />
          <h1 className="text-3xl font-black mb-2">Acesso Restrito</h1>
          <p className="text-text-secondary mb-8">Esta área é exclusiva para administradores.</p>
          <button onClick={onBackToApp} className="bg-brand-primary px-8 py-4 rounded-2xl font-bold text-white">Voltar ao App</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-bg-main text-text-secondary font-sans overflow-hidden">
      {/* Mobile Header Toggle */}
      <div className="lg:hidden fixed top-4 left-4 z-[60]">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-3 bg-bg-card border border-border-color rounded-xl text-brand-primary"
        >
          <PanelLeftClose size={24} />
        </button>
      </div>

      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-[55]"
          />
        )}
      </AnimatePresence>

      <aside className={`
        fixed lg:static inset-y-0 left-0 w-72 md:w-80 bg-bg-sidebar border-r border-border-color flex flex-col z-[60] transition-transform duration-500 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-8 pt-10">
          <div className="flex justify-between items-center mb-10">
             <div className="text-text-main"><Logo className="h-10 md:h-12" /></div>
            <button className="lg:hidden text-text-secondary w-10 h-10 flex items-center justify-center bg-bg-main border border-border-color rounded-xl" onClick={() => setIsSidebarOpen(false)}>
              <PanelLeftClose size={20} className="rotate-180" />
            </button>
          </div>
          
          <div className="mb-12">
            <div className="bg-yellow-500/10 border border-yellow-500/20 px-4 py-2.5 rounded-xl flex items-center gap-2.5">
              <ShieldCheck size={16} className="text-yellow-600 dark:text-yellow-400" />
              <span className="text-[11px] font-black tracking-wide text-yellow-600 dark:text-yellow-400">Admin Mode</span>
            </div>
          </div>

          <nav className="space-y-1.5 font-bold">
            <div className="text-[10px] font-black text-text-secondary opacity-50 tracking-wide mb-4 ml-4">Geral</div>
            
            <SidebarItem 
              active={activeTab === 'panorama'} 
              onClick={() => { setActiveTab('panorama'); setIsSidebarOpen(false); }} 
              icon={<LayoutGrid size={20} />} 
              label="Panorama" 
              activeColor="text-brand-primary"
              activeBgColor="bg-brand-primary/10"
            />
            
            <SidebarItem 
              active={activeTab === 'eventos'} 
              onClick={() => { setActiveTab('eventos'); setIsSidebarOpen(false); }} 
              icon={<Calendar size={20} />} 
              label="Eventos" 
              count={eventos.length}
              activeColor="text-purple-500"
              activeBgColor="bg-purple-500/10"
            />
            
            <SidebarItem 
              active={activeTab === 'materiais'} 
              onClick={() => { setActiveTab('materiais'); setIsSidebarOpen(false); }} 
              icon={<Library size={20} />} 
              label="Materiais" 
              count={materials.length}
              activeColor="text-blue-500"
              activeBgColor="bg-blue-500/10"
            />
            
            <SidebarItem 
              active={activeTab === 'mural'} 
              onClick={() => { setActiveTab('mural'); setIsSidebarOpen(false); }} 
              icon={<Megaphone size={20} />} 
              label="Mural" 
              count={recados.length}
              activeColor="text-orange-500"
              activeBgColor="bg-orange-500/10"
            />
            
            <SidebarItem 
              active={activeTab === 'alunos'} 
              onClick={() => { setActiveTab('alunos'); setIsSidebarOpen(false); }} 
              icon={<Users size={20} />} 
              label="Alunos" 
              activeColor="text-slate-400"
              activeBgColor="bg-slate-400/10"
            />
          </nav>
        </div>

        <div className="mt-auto p-8">
          <button 
            onClick={onBackToApp}
            className="w-full flex items-center gap-3 px-6 py-4 bg-text-main/5 hover:bg-text-main/10 border border-border-color rounded-2xl text-text-main font-bold text-sm transition-all shadow-sm"
          >
            <ArrowRight className="rotate-180" size={18} />
            Voltar ao painel
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-bg-main relative">
        <div className="p-6 md:p-12 max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-8 lg:gap-12">
            <div className="pt-10 lg:pt-0">
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="flex items-center gap-2 bg-brand-primary/10 px-3 py-1.5 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                  <span className="text-[10px] font-black text-brand-primary tracking-wide leading-none">Live</span>
                  <span className="text-[10px] font-bold text-text-secondary tracking-wide leading-none">Admin</span>
                </div>
                <span className="text-[10px] font-bold text-text-secondary opacity-50 tracking-wide whitespace-nowrap">Painel Operacional</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-text-main tracking-tight leading-none mb-4">Backoffice</h1>
              <p className="text-text-secondary font-medium max-w-xl text-sm leading-relaxed opacity-80">
                Coordene estrategicamente o projeto, centralizando eventos, conteúdos e avisos para toda a comunidade estudantil do Neva.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 w-full lg:w-auto">
              <button 
                onClick={() => setShowModal('recado')}
                className="bg-brand-primary hover:bg-brand-secondary text-white px-8 py-4 rounded-2xl font-black text-xs tracking-wide shadow-lg shadow-brand-primary/20 transition-all flex items-center justify-center gap-3 flex-1 sm:flex-none lg:min-w-[220px]"
              >
                <Megaphone size={18} />
                Novo Recado
              </button>
              <div className="flex gap-3 flex-1 sm:flex-none">
                <button 
                  onClick={() => setShowModal('material')}
                  className="flex-1 px-6 py-4 bg-bg-card border border-border-color hover:bg-text-main/5 rounded-2xl text-text-secondary font-bold text-xs flex items-center justify-center gap-3 transition-all"
                >
                  <Plus size={18} />
                  Material
                </button>
                <button 
                  onClick={() => setShowModal('evento')}
                  className="flex-1 px-6 py-4 bg-bg-card border border-border-color hover:bg-text-main/5 rounded-2xl text-text-secondary font-bold text-xs flex items-center justify-center gap-3 transition-all"
                >
                  <Calendar size={18} />
                  Evento
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 md:gap-8 mb-12">
            <StatCard 
              label="Eventos organizados" 
              value={eventos.length} 
              icon={<Calendar className="text-purple-500" size={20} />} 
              tag="Agenda ativa"
            />
            <StatCard 
              label="Materiais disponíveis" 
              value={materials.length} 
              icon={<Library className="text-blue-500" size={20} />} 
              tag="Biblioteca"
            />
            <StatCard 
              label="Recados publicados" 
              value={recados.length} 
              icon={<Megaphone className="text-orange-500" size={20} />} 
              tag="Mural ativo"
            />
            <StatCard 
              label="Próxima ação" 
              value={nextEvent ? nextEvent.title : "--"} 
              icon={<Clock className={nextEvent ? "text-pink-500" : "text-text-secondary opacity-40"} size={20} />} 
              tag={nextEvent ? `Ação: ${formatDateToBR(nextEvent.date)} às ${nextEvent.time}` : "Sem agendamento"}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {activeTab === 'panorama' ? (
              <>
                <div className="lg:col-span-8 space-y-8">
                  <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[32px] md:rounded-[40px] p-6 md:p-10 relative overflow-hidden">
                    <div className="flex flex-col sm:flex-row justify-between items-start mb-12 gap-4">
                      <div>
                        <h3 className="text-xl font-black text-text-main mb-2">Produção dos últimos 7 dias</h3>
                        <p className="text-sm text-text-secondary font-medium">Atividade do time editorial.</p>
                      </div>
                      <div className="bg-brand-primary/10 border border-brand-primary/20 text-brand-primary px-4 py-1.5 rounded-full text-[10px] font-black tracking-wider leading-none">Análise</div>
                    </div>

                    <div className="flex items-end justify-between h-48 gap-2 md:gap-4 px-2 overflow-hidden pt-4">
                      {productionStats.length > 0 ? productionStats.map((stat) => {
                        const maxValue = Math.max(...productionStats.map(s => s.value), 1);
                        const today = new Date().getDay();
                        const dayNames = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
                        const isToday = stat.day === dayNames[today];
                        
                        return (
                          <Bar 
                            key={stat.day} 
                            day={stat.day} 
                            value={Math.max(0.1, stat.value / maxValue)} 
                            label={stat.value.toString()} 
                            active={isToday}
                          />
                        );
                      }) : (
                        ['TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM', 'SEG'].map(day => (
                          <Bar key={day} day={day} value={0.1} label="0" />
                        ))
                      )}
                    </div>
                  </div>

                  <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[32px] md:rounded-[40px] p-6 md:p-10">
                    <div className="flex justify-between items-start mb-10">
                      <div>
                        <h3 className="text-xl font-black text-text-main mb-2">Distribuição editorial</h3>
                        <p className="text-sm text-text-secondary font-medium">Balanço das ações publicadas.</p>
                      </div>
                      <div className="bg-text-main/5 border border-border-color text-text-secondary px-4 py-1.5 rounded-full text-[10px] font-black tracking-wider leading-none">Stats</div>
                    </div>

                    <div className="space-y-4 md:space-y-6">
                      <DistributionRow label="Eventos" info={`${eventos.length} itens no momento`} percent={eventos.length > 0 ? 100 : 0} color={eventos.length > 0 ? "bg-brand-primary" : "bg-text-secondary/20"} />
                      <DistributionRow label="Materiais" info={`${materials.length} itens no momento`} percent={materials.length > 0 ? 100 : 0} color="bg-brand-primary" />
                      <DistributionRow label="Recados" info={`${recados.length} itens no momento`} percent={recados.length > 0 ? 100 : 0} color="bg-brand-primary" />
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-8 pb-10">
                  <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[32px] md:rounded-[40px] p-6 md:p-10">
                    <div className="flex justify-between items-start mb-8">
                      <h3 className="text-xl font-black text-text-main tracking-tight">Recente</h3>
                      <span className="text-[10px] font-black text-brand-primary tracking-wider">Log</span>
                    </div>
                    <p className="text-text-secondary text-[10px] font-bold tracking-[0.1em] mb-8 leading-none opacity-50">Fluxo de edições.</p>

                    <div className="space-y-4">
                      {recados.slice(0, 2).map((rec) => (
                        <ActivityItem key={rec.id} type="Recado" title={rec.title} info={rec.sender} date={rec.date} />
                      ))}
                      {materials.slice(0, 1).map((mat) => (
                        <ActivityItem key={mat.id} type="Material" title={mat.title} info={`${mat.type.toUpperCase()} • ENEM`} date={mat.uploadedAt} />
                      ))}
                    </div>
                  </div>

                  <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[32px] md:rounded-[40px] p-6 md:p-10">
                    <div className="flex justify-between items-start mb-8">
                      <h3 className="text-xl font-black text-text-main tracking-tight">Agendados</h3>
                      <span className="text-[10px] font-black text-orange-500 tracking-wider">Fila</span>
                    </div>
                    <p className="text-text-secondary text-[10px] font-bold tracking-[0.1em] mb-10 leading-none opacity-50">Ações futuras.</p>

                    {eventos.length === 0 ? (
                      <div className="text-text-secondary font-bold text-sm py-8 opacity-40">Nenhum evento agendado.</div>
                    ) : (
                      <div className="space-y-6">
                        {eventos.map((evt) => (
                          <div key={evt.id} className="flex items-center justify-between group gap-4 w-full min-w-0">
                            <div className="flex items-center gap-4 cursor-pointer flex-1 min-w-0">
                              <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-bg-sidebar border border-border-color flex items-center justify-center text-text-secondary group-hover:bg-brand-primary group-hover:text-white transition-all shrink-0">
                                <Clock size={18} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-text-main font-bold text-sm mb-1 truncate group-hover:text-brand-primary transition-colors" title={evt.title}>{evt.title}</div>
                                <div className="text-text-secondary font-bold text-[9px] md:text-[10px] tracking-wider opacity-60 truncate">{formatDateToBR(evt.date)} às {evt.time}</div>
                              </div>
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all relative z-[70]">
                              <button 
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditEvent(evt); }}
                                className="p-2 text-text-secondary hover:text-brand-primary transition-colors cursor-pointer"
                                title="Editar Evento"
                              >
                                <Pencil size={15} />
                              </button>
                              <button 
                                onClick={(e) => handleDeleteEvent(evt.id, e)}
                                className="p-2 text-text-secondary hover:text-red-500 transition-colors cursor-pointer"
                                title="Excluir Evento"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : activeTab === 'eventos' ? (
              <div className="lg:col-span-12">
                <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[32px] md:rounded-[40px] p-8 md:p-12">
                   <div className="flex justify-between items-center mb-10">
                      <div>
                        <h3 className="text-2xl font-black text-text-main tracking-tight">Gerenciar Eventos</h3>
                        <p className="text-sm text-text-secondary font-medium">Cronograma de simulados, aulões e eventos presenciais.</p>
                      </div>
                      <button 
                        onClick={() => setShowModal('evento')}
                        className="bg-brand-primary/10 text-brand-primary px-6 py-3 rounded-xl font-black text-[10px] tracking-wider hover:bg-brand-primary hover:text-white transition-all flex items-center gap-2"
                      >
                        <Plus size={16} />
                        Adicionar Evento
                      </button>
                   </div>

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
                                <span className="bg-brand-primary/10 text-brand-primary text-[10px] font-black tracking-wider px-2 py-1 rounded-lg">
                                  {evt.category}
                                </span>
                              </td>
                              <td className="py-6">
                                <div className="text-text-main font-bold text-sm">{evt.title}</div>
                                <div className="text-text-secondary text-[10px] font-medium opacity-50">{evt.observation || 'Sem observações'}</div>
                              </td>
                              <td className="py-6 font-mono text-[10px] text-text-secondary opacity-60">+{evt.xpReward} XP</td>
                              <td className="py-6 font-mono text-[10px] text-text-secondary opacity-60">{formatDateToBR(evt.date)} às {evt.time}</td>
                              <td className="py-6 text-right pr-4">
                                <div className="flex justify-end gap-1">
                                  <button 
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditEvent(evt); }}
                                    className="p-2 text-text-secondary hover:text-brand-primary transition-colors cursor-pointer relative z-[70]"
                                    title="Editar Evento"
                                  >
                                    <Pencil size={16} />
                                  </button>
                                  <button 
                                    onClick={(e) => handleDeleteEvent(evt.id, e)}
                                    className="p-2 text-text-secondary hover:text-red-500 transition-colors cursor-pointer relative z-[70]"
                                    title="Excluir Evento"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {eventos.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-20 text-center">
                                <Calendar size={48} className="mx-auto mb-4 text-text-secondary opacity-20" />
                                <p className="text-text-secondary font-bold text-[10px] tracking-wider opacity-40">Nenhum evento cadastrado</p>
                              </td>
                            </tr>
                          )}
                        </tbody>
                     </table>
                   </div>

                   {/* Mobile Cards for Eventos */}
                   <div className="lg:hidden space-y-4">
                     {eventos.map((evt) => (
                       <div key={evt.id} className="bg-bg-sidebar/30 border border-border-color rounded-[32px] p-6 relative group">
                         <div className="flex justify-between items-start mb-4">
                           <span className="bg-brand-primary/10 text-brand-primary text-[9px] font-black tracking-wider px-2 py-1 rounded-lg">
                             {evt.category}
                           </span>
                           <span className="text-[10px] font-black text-brand-primary">+{evt.xpReward} XP</span>
                         </div>
                         <h4 className="text-text-main font-black text-base tracking-tight mb-2 leading-tight">{evt.title}</h4>
                         {evt.observation && <p className="text-text-secondary text-xs font-medium opacity-50 mb-4">{evt.observation}</p>}
                         
                         <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/5">
                            <div>
                               <div className="text-[9px] font-black text-text-secondary tracking-wider opacity-40 mb-1">Data</div>
                               <div className="text-text-main font-bold text-xs">{formatDateToBR(evt.date)}</div>
                            </div>
                            <div>
                               <div className="text-[9px] font-black text-text-secondary tracking-wider opacity-40 mb-1">Hora</div>
                               <div className="text-text-main font-bold text-xs">{evt.time}</div>
                            </div>
                         </div>
                         
                         <div className="mt-6 flex justify-end">
                            <button 
                              onClick={(e) => handleDeleteEvent(evt.id, e)}
                              className="flex items-center gap-2 text-red-500 bg-red-500/10 hover:bg-red-500 hover:text-white px-4 py-2 rounded-lg transition-all font-black text-[9px] tracking-wider"
                            >
                              <Trash2 size={12} /> Excluir
                            </button>
                            <button 
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditEvent(evt); }}
                              className="flex items-center gap-2 text-brand-primary bg-brand-primary/10 hover:bg-brand-primary hover:text-white px-4 py-2 rounded-lg transition-all font-black text-[9px] tracking-wider"
                            >
                              <Pencil size={12} /> Editar
                            </button>
                         </div>
                       </div>
                     ))}
                     
                     {eventos.length === 0 && (
                        <div className="py-20 text-center">
                          <Calendar size={40} className="mx-auto mb-4 text-brand-primary opacity-20" />
                          <p className="text-text-secondary font-bold text-[10px] tracking-wider opacity-40">Nenhum evento cadastrado</p>
                        </div>
                     )}
                   </div>
                </div>
              </div>
            ) : activeTab === 'materiais' ? (
              <div className="lg:col-span-12">
                <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[32px] md:rounded-[40px] p-8 md:p-12">
                   <div className="flex justify-between items-center mb-10">
                      <div>
                        <h3 className="text-2xl font-black text-text-main tracking-tight">Gerenciar Materiais</h3>
                        <p className="text-sm text-text-secondary font-medium">Controle de PDFs, videoaulas e links da biblioteca.</p>
                      </div>
                      <button 
                        onClick={() => setShowModal('material')}
                        className="bg-brand-primary/10 text-brand-primary px-6 py-3 rounded-xl font-black text-[10px] tracking-wider hover:bg-brand-primary hover:text-white transition-all flex items-center gap-2"
                      >
                        <Plus size={16} />
                        Novo Material
                      </button>
                   </div>

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
                          {materials.map((mat) => (
                            <tr key={mat.id} className="group hover:bg-text-main/[0.02] transition-colors">
                              <td className="py-6 pl-4">
                                <span className={`text-[10px] font-black tracking-wider px-2 py-1 rounded-lg ${
                                  mat.type === 'pdf' ? 'bg-red-500/10 text-red-500' :
                                  mat.type === 'video' ? 'bg-blue-500/10 text-blue-500' :
                                  'bg-brand-primary/10 text-brand-primary'
                                }`}>
                                  {mat.type}
                                </span>
                              </td>
                              <td className="py-6">
                                <div className="text-text-main font-bold text-sm">{mat.title}</div>
                                <div className="text-text-secondary text-[10px] font-medium opacity-50 truncate max-w-[300px]">{mat.description}</div>
                              </td>
                              <td className="py-6">
                                <div className="text-text-secondary text-[10px] font-bold tracking-wider opacity-60">
                                  {mat.foco}
                                </div>
                              </td>
                              <td className="py-6 font-mono text-[10px] text-text-secondary opacity-60">{formatDateToBR(mat.uploadedAt)}</td>
                              <td className="py-6 text-right pr-4">
                                <div className="flex justify-end gap-1">
                                  <button 
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditMaterial(mat); }}
                                    className="p-2 text-text-secondary hover:text-brand-primary transition-colors cursor-pointer relative z-[70]"
                                    title="Editar Material"
                                  >
                                    <Pencil size={11} className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={(e) => handleDeleteMaterial(mat.id, e)}
                                    className="p-2 text-text-secondary hover:text-red-500 transition-colors cursor-pointer relative z-[70]"
                                    title="Excluir Material"
                                  >
                                    <Trash2 size={11} className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {materials.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-20 text-center">
                                <Library size={48} className="mx-auto mb-4 text-text-secondary opacity-20" />
                                <p className="text-text-secondary font-bold text-[10px] tracking-wider opacity-40">Nenhum material cadastrado</p>
                              </td>
                            </tr>
                          )}
                        </tbody>
                     </table>
                   </div>
                    {/* Mobile Cards for Materiais */}
                    <div className="lg:hidden space-y-4 mt-6">
                      {materials.map((mat) => (
                        <div key={mat.id} className="bg-bg-sidebar/30 border border-border-color rounded-[24px] p-6 relative group">
                          <div className="flex justify-between items-start mb-4">
                            <span className={`text-[9px] font-black tracking-wider px-2.5 py-1 rounded-lg ${
                              mat.type === 'pdf' ? 'bg-red-500/10 text-red-500' :
                              mat.type === 'video' ? 'bg-blue-500/10 text-blue-500' :
                              'bg-brand-primary/10 text-brand-primary'
                            }`}>
                              {mat.type}
                            </span>
                          </div>
                          <h4 className="text-text-main font-black text-sm tracking-tight mb-2 leading-tight">{mat.title}</h4>
                          {mat.description && <p className="text-text-secondary text-xs font-semibold opacity-50 mb-4">{mat.description}</p>}
                          
                          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-text-main/5">
                             <div>
                                <div className="text-[9px] font-black text-text-secondary tracking-wider opacity-40 mb-1">Foco</div>
                                <div className="text-text-main font-bold text-xs tracking-wider">{mat.foco}</div>
                             </div>
                             <div>
                                <div className="text-[9px] font-black text-text-secondary tracking-wider opacity-40 mb-1">Data</div>
                                <div className="text-text-main font-bold text-xs">{formatDateToBR(mat.uploadedAt)}</div>
                             </div>
                          </div>
                          
                          <div className="mt-6 flex justify-end gap-2">
                             <button 
                               onClick={(e) => handleDeleteMaterial(mat.id, e)}
                               className="flex items-center gap-1.5 text-red-500 bg-red-500/10 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded-lg transition-all font-black text-[9px] tracking-wider cursor-pointer"
                             >
                               <Trash2 size={10} /> Excluir
                             </button>
                             <button 
                               onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditMaterial(mat); }}
                               className="flex items-center gap-1.5 text-brand-primary bg-brand-primary/10 hover:bg-brand-primary hover:text-white px-3 py-1.5 rounded-lg transition-all font-black text-[9px] tracking-wider cursor-pointer"
                             >
                               <Pencil size={10} /> Editar
                             </button>
                          </div>
                        </div>
                      ))}
                      
                      {materials.length === 0 && (
                         <div className="py-20 text-center">
                           <Library size={40} className="mx-auto mb-4 text-brand-primary opacity-20" />
                           <p className="text-text-secondary font-bold text-[10px] tracking-wide opacity-40">Nenhum material cadastrado</p>
                         </div>
                      )}
                    </div>
                 </div>
              </div>
            ) : activeTab === 'alunos' ? (
              <div className="lg:col-span-12">
                <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[32px] md:rounded-[40px] p-8 md:p-12">
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-8">
                       <div className="flex-1">
                         <h3 className="text-2xl font-black text-text-main tracking-tight">Estudantes Ativos</h3>
                         <p className="text-sm text-text-secondary font-medium mt-1">Gestão da rede de alunos vinculados ao projeto.</p>
                       </div>
                       
                       <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
                         <div className="relative w-full sm:w-72">
                            <div className="absolute left-6 top-1/2 -translate-y-1/2 pointer-events-none text-brand-primary opacity-40">
                              <Users size={18} />
                            </div>
                            <input 
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="w-full bg-bg-main/40 border border-border-color rounded-2xl pl-14 pr-6 py-4 text-sm font-bold text-text-main placeholder:opacity-30 focus:outline-none focus:border-brand-primary/50 transition-all font-sans backdrop-blur-md" 
                              placeholder="Buscar por nome ou email..."
                            />
                         </div>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-secondary tracking-wider opacity-40 ml-4">Cidades</label>
                        <div className="relative">
                           <select 
                             value={filterCity}
                             onChange={(e) => setFilterCity(e.target.value)}
                             className="w-full bg-bg-main/30 border border-border-color rounded-2xl px-6 py-4 text-sm font-bold text-text-main focus:outline-none focus:border-brand-primary/50 transition-all appearance-none backdrop-blur-md"
                           >
                             <option value="">Todas as cidades</option>
                             {citiesMA.map(city => (
                               <option key={city} value={city}>{city}</option>
                             ))}
                           </select>
                           <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none opacity-30">
                             <ArrowRight className="rotate-90" size={16} />
                           </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-secondary tracking-wider opacity-40 ml-4">Escolas</label>
                        <div className="relative">
                           <select 
                             value={filterSchool}
                             onChange={(e) => setFilterSchool(e.target.value)}
                             className="w-full bg-bg-main/30 border border-border-color rounded-2xl px-6 py-4 text-sm font-bold text-text-main focus:outline-none focus:border-brand-primary/50 transition-all appearance-none backdrop-blur-md"
                           >
                             <option value="">Todas as escolas</option>
                             {schoolsMA.map(school => (
                               <option key={school} value={school}>{school}</option>
                             ))}
                           </select>
                           <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none opacity-30">
                             <ArrowRight className="rotate-90" size={16} />
                           </div>
                        </div>
                      </div>

                      <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                        <label className="text-[10px] font-black text-text-secondary tracking-wider opacity-40 ml-4">Grêmios</label>
                        <div className="relative">
                           <select 
                             value={filterGremio}
                             onChange={(e) => setFilterGremio(e.target.value)}
                             className="w-full bg-bg-main/30 border border-border-color rounded-2xl px-6 py-4 text-sm font-bold text-text-main focus:outline-none focus:border-brand-primary/50 transition-all appearance-none backdrop-blur-md"
                           >
                             <option value="">Todos os grêmios</option>
                             {gremiosMA.map(gremio => (
                               <option key={gremio} value={gremio}>{gremio}</option>
                             ))}
                           </select>
                           <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none opacity-30">
                             <ArrowRight className="rotate-90" size={16} />
                           </div>
                        </div>
                     </div>
                   </div>

                   <div className="hidden lg:block overflow-x-auto">
                     <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-border-color">
                            <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 pl-4 w-[30%]">Aluno</th>
                            <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 w-[20%]">Localização</th>
                            <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 w-[20%]">Escola / Grêmio</th>
                            <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 w-[20%]">Progresso</th>
                            <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 text-right pr-4 w-[10%]">Nível</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-color/50">
                          {filteredStudents.map((student) => (
                            <tr key={student.id} className="group hover:bg-text-main/[0.02] transition-colors relative">
                              <td className="py-6 pl-4">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary font-black text-sm shrink-0">
                                    {student.name?.charAt(0) || '?'}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-text-main font-bold text-sm truncate">{student.name}</div>
                                    <div className="text-text-secondary text-[10px] font-medium opacity-40 truncate">{student.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-6">
                                <div className="text-text-main font-bold text-sm">{student.city}</div>
                                <div className="text-text-secondary text-[10px] font-bold tracking-wider opacity-60">MA</div>
                              </td>
                              <td className="py-6">
                                <div className="text-text-main font-bold text-sm">{student.school}</div>
                                <div className="text-brand-primary text-[10px] font-black tracking-wider leading-none mt-1">{student.gremio}</div>
                              </td>
                              <td className="py-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-32 h-1.5 bg-text-main/5 rounded-full overflow-hidden">
                                     {(() => {
                                       const { currentLevelMinXp, nextLevelXp } = calculateLevelAndProgression(student.xp || 0);
                                       const xpInCurrentLevel = (student.xp || 0) - currentLevelMinXp;
                                       const xpNeededInCurrentLevel = nextLevelXp - currentLevelMinXp;
                                       const xpPercentage = xpNeededInCurrentLevel > 0 
                                         ? Math.min((xpInCurrentLevel / xpNeededInCurrentLevel) * 100, 100) 
                                         : 0;
                                       return (
                                         <div 
                                          className="h-full bg-brand-primary rounded-full transition-all duration-1000" 
                                          style={{ width: `${xpPercentage}%` }}
                                         />
                                       );
                                     })()}
                                  </div>
                                  <span className="text-[10px] font-black text-text-secondary opacity-60">{student.xp} XP</span>
                                </div>
                              </td>
                              <td className="py-6 text-right pr-4">
                                <span className="text-xl font-black text-text-main">{calculateLevelAndProgression(student.xp || 0).level}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                     </table>
                   </div>

                   {/* Mobile Cards for Students */}
                   <div className="lg:hidden space-y-4">
                     {filteredStudents.map((student) => (
                       <div key={student.id} className="bg-bg-sidebar/30 border border-border-color rounded-[32px] p-6">
                         <div className="flex items-center gap-4 mb-6">
                           <div className="w-12 h-12 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary font-black text-lg shrink-0">
                             {student.name?.charAt(0) || '?'}
                           </div>
                           <div className="min-w-0">
                             <div className="text-text-main font-black text-base truncate">{student.name}</div>
                             <div className="text-text-secondary text-[11px] font-medium opacity-40 truncate">{student.email}</div>
                           </div>
                         </div>
                         
                         <div className="grid grid-cols-2 gap-4 mb-6">
                           <div>
                             <div className="text-[9px] font-black text-text-secondary tracking-wider opacity-40 mb-1">Localização</div>
                             <div className="text-text-main font-bold text-xs">{student.city}, MA</div>
                           </div>
                           <div>
                             <div className="text-[9px] font-black text-text-secondary tracking-wider opacity-40 mb-1">Escola / Grêmio</div>
                             <div className="text-text-main font-bold text-xs truncate">{student.school}</div>
                             <div className="text-brand-primary text-[8px] font-black tracking-wider">{student.gremio}</div>
                           </div>
                         </div>

                         <div className="flex items-end justify-between border-t border-white/5 pt-6">
                           <div className="flex-1 mr-4">
                              <div className="text-[9px] font-black text-text-secondary tracking-wider opacity-40 mb-2">Progresso</div>
                              <div className="flex items-center gap-3">
                                 <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                   {(() => {
                                     const { currentLevelMinXp, nextLevelXp } = calculateLevelAndProgression(student.xp || 0);
                                     const xpInCurrentLevel = (student.xp || 0) - currentLevelMinXp;
                                     const xpNeededInCurrentLevel = nextLevelXp - currentLevelMinXp;
                                     const xpPercentage = xpNeededInCurrentLevel > 0 
                                       ? Math.min((xpInCurrentLevel / xpNeededInCurrentLevel) * 100, 100) 
                                       : 0;
                                     return (
                                       <div 
                                         className="h-full bg-brand-primary rounded-full transition-all duration-1000" 
                                         style={{ width: `${xpPercentage}%` }}
                                       />
                                     );
                                   })()}
                                 </div>
                                 <span className="text-[9px] font-black text-text-secondary opacity-60 shrink-0">{student.xp} XP</span>
                              </div>
                           </div>
                           <div className="text-right shrink-0">
                              <div className="text-[9px] font-black text-text-secondary tracking-wider opacity-40 mb-1 leading-none">Nível</div>
                              <div className="text-2xl font-black text-text-main leading-none">{calculateLevelAndProgression(student.xp || 0).level}</div>
                           </div>
                         </div>
                         

                       </div>
                     ))}
                   </div>

                   {filteredStudents.length === 0 && (
                     <div className="py-20 text-center">
                       <Users size={40} className="mx-auto mb-4 text-brand-primary opacity-20" />
                       <p className="text-text-secondary font-bold text-[10px] tracking-wider opacity-40">Nenhum aluno encontrado</p>
                     </div>
                   )}
                </div>
              </div>
            ) : activeTab === 'mural' ? (
              <div className="lg:col-span-12">
                <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[32px] md:rounded-[40px] p-8 md:p-12">
                   <div className="flex justify-between items-center mb-10">
                      <div>
                        <h3 className="text-2xl font-black text-text-main tracking-tight">Mural de Recados</h3>
                        <p className="text-sm text-text-secondary font-medium">Gerencie os comunicados e avisos da plataforma.</p>
                      </div>
                      <button 
                        onClick={() => setShowModal('recado')}
                        className="bg-brand-primary/10 text-brand-primary px-6 py-3 rounded-xl font-black text-[10px] tracking-wider hover:bg-brand-primary hover:text-white transition-all flex items-center gap-2"
                      >
                        <Plus size={16} />
                        Novo Recado
                      </button>
                   </div>

                   <div className="hidden lg:block overflow-x-auto">
                     <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-border-color">
                            <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 pl-4">Categoria</th>
                            <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40">Título</th>
                            <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40">Etiqueta</th>
                            <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40">Data</th>
                            <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 text-right pr-4">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-color/50">
                          {recados.map((rec) => (
                            <tr key={rec.id} className="group hover:bg-text-main/[0.02] transition-colors">
                              <td className="py-6 pl-4">
                                <span className={`text-[10px] font-black tracking-wider px-2 py-1 rounded-lg ${
                                  rec.category === 'importante' ? 'bg-red-500/10 text-red-500' :
                                  rec.category === 'estudos' ? 'bg-blue-500/10 text-blue-500' :
                                  'bg-brand-primary/10 text-brand-primary'
                                }`}>
                                  {rec.category}
                                </span>
                              </td>
                              <td className="py-6">
                                <div className="text-text-main font-bold text-sm">{rec.title}</div>
                                <div className="text-text-secondary text-[10px] font-medium opacity-50 truncate max-w-[300px]">{rec.content}</div>
                              </td>
                              <td className="py-6">
                                <div className="text-text-secondary text-[10px] font-bold tracking-wider opacity-60">
                                  {rec.tag || '-'}
                                </div>
                              </td>
                              <td className="py-6 font-mono text-[10px] text-text-secondary opacity-60">{formatDateToBR(rec.date)}</td>
                              <td className="py-6 text-right pr-4">
                                <div className="flex justify-end gap-1">
                                  <button 
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditMural(rec); }}
                                    className="p-2 text-text-secondary hover:text-brand-primary transition-colors cursor-pointer relative z-[70]"
                                    title="Editar Recado"
                                  >
                                    <Pencil size={11} className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={(e) => handleDeleteRecado(rec.id, e)}
                                    className="p-2 text-text-secondary hover:text-red-500 transition-colors cursor-pointer relative z-[70]"
                                    title="Excluir Recado"
                                  >
                                    <Trash2 size={11} className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {recados.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-20 text-center">
                                <MessageSquare size={48} className="mx-auto mb-4 text-text-secondary opacity-20" />
                                <p className="text-text-secondary font-bold text-[10px] tracking-wider opacity-40">Nenhum recado cadastrado</p>
                              </td>
                            </tr>
                          )}
                        </tbody>
                     </table>
                   </div>

                   {/* Mobile Cards for Mural */}
                   <div className="lg:hidden space-y-4">
                      {recados.map((rec) => (
                        <div key={rec.id} className="bg-bg-sidebar/30 border border-border-color rounded-[32px] p-6 relative group">
                          <div className="flex justify-between items-start mb-4">
                            <span className={`text-[9px] font-black tracking-wider px-2 py-1 rounded-lg ${
                              rec.category === 'importante' ? 'bg-red-500/10 text-red-500' :
                              rec.category === 'estudos' ? 'bg-blue-500/10 text-blue-500' :
                              'bg-brand-primary/10 text-brand-primary'
                            }`}>
                              {rec.category}
                            </span>
                            <span className="text-[9px] font-black text-text-secondary opacity-40">{rec.tag || 'Recado'}</span>
                          </div>
                          <h4 className="text-text-main font-black text-base tracking-tight mb-2 leading-tight">{rec.title}</h4>
                          <p className="text-text-secondary text-xs font-medium opacity-50 mb-4">{rec.content}</p>
                          
                          <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-4">
                            <span className="text-[9px] font-black text-text-secondary opacity-40 tracking-wider">{formatDateToBR(rec.date)}</span>
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditMural(rec); }}
                                className="text-brand-primary hover:text-brand-primary/80 transition-all font-black text-[9px] tracking-wider flex items-center gap-1.5"
                              >
                                <Pencil size={12} /> Editar
                              </button>
                              <button 
                                onClick={(e) => handleDeleteRecado(rec.id, e)}
                                className="text-red-400 hover:text-red-500 transition-all font-black text-[9px] tracking-wider flex items-center gap-1.5"
                              >
                                <Trash2 size={12} /> Excluir
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {recados.length === 0 && (
                        <div className="py-20 text-center">
                          <MessageSquare size={40} className="mx-auto mb-4 text-brand-primary opacity-20" />
                          <p className="text-text-secondary font-bold text-[10px] tracking-wider opacity-40">Nenhum recado encontrado</p>
                        </div>
                      )}
                   </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-bg-card border border-border-color rounded-[32px] md:rounded-[40px] w-full max-w-xl p-8 md:p-12 shadow-2xl relative"
            >
              <button 
                onClick={handleCloseModal}
                className="absolute top-6 right-6 md:top-10 md:right-10 text-text-secondary hover:text-text-main p-2"
              >
                <ArrowRight size={24} />
              </button>

              <div className="mb-8 md:mb-10">
                <span className="text-brand-primary text-[10px] font-black tracking-wider mb-2 block">
                  {editingId ? 'Edição' : (showModal === 'evento' ? 'Publicação' : showModal === 'material' ? 'Biblioteca' : showModal === 'recado' ? 'Comunicação' : `Novo ${String(showModal)}`)}
                </span>
                <h2 className="text-2xl md:text-3xl font-black text-text-main leading-none tracking-tight mb-3">
                  {editingId ? 'Editar ' : 'Adicionar '}{showModal === 'evento' ? 'Evento' : showModal === 'material' ? 'Material' : showModal === 'recado' ? 'Recado' : String(showModal)}
                </h2>
                <p className="text-text-secondary font-medium text-xs md:text-sm leading-relaxed opacity-70">
                  {showModal === 'evento' 
                    ? 'Organize eventos por data, tamanho e público. O que salvar aqui já fica pronto para o painel do aluno.'
                    : showModal === 'material'
                    ? 'Cadastre conteúdos de apoio para a biblioteca do aluno, sem bagunçar a tela.'
                    : showModal === 'recado'
                    ? 'Use para comunicados importantes, orientações de estudo e avisos institucionais.'
                    : 'Preencha os campos abaixo para atualizar a plataforma.'
                  }
                </p>
              </div>

              {renderModalContent()}
            </motion.div>
          </div>
        )}

        {deleteConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-bg-card border border-border-color rounded-[24px] w-full max-w-md p-6 shadow-2xl relative"
            >
              <h3 className="text-xl font-black text-text-main tracking-tight mb-3">Confirmar Exclusão</h3>
              <p className="text-text-secondary font-medium text-sm leading-relaxed mb-6">
                Tem certeza que deseja excluir o item <strong className="text-text-main">{deleteConfirm.title}</strong>? Esta ação não pode ser desfeita.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 bg-text-secondary/10 hover:bg-text-secondary/20 text-text-main font-bold rounded-xl text-xs tracking-wide transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-xs tracking-wide transition-all cursor-pointer"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarItem({ 
  active, 
  onClick, 
  icon, 
  label, 
  count,
  activeColor = 'text-brand-primary',
  activeBgColor = 'bg-brand-primary/10'
}: { 
  active?: boolean; 
  onClick: () => void; 
  icon: React.ReactNode; 
  label: string; 
  count?: number;
  activeColor?: string;
  activeBgColor?: string;
}) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between px-6 py-3.5 rounded-2xl transition-all duration-300 group relative ${
        active 
          ? `${activeColor} ${activeBgColor}` 
          : 'text-text-secondary hover:bg-white/5 hover:text-text-main'
      }`}
    >
      <div className="flex items-center gap-4 relative z-10">
        <div className={`transition-colors duration-300 ${active ? activeColor : 'text-text-secondary opacity-50 group-hover:opacity-100'}`}>
          {icon}
        </div>
        <span className={`text-sm tracking-tight transition-all duration-300 ${active ? 'font-black' : 'font-bold'}`}>
          {label}
        </span>
      </div>
      
      {count !== undefined && (
        <span className={`relative z-10 text-[10px] font-black px-2.5 py-0.5 rounded-lg transition-colors duration-300 ${active ? `${activeBgColor} ${activeColor}` : 'bg-white/5 text-text-secondary opacity-50'}`}>
          {count}
        </span>
      )}

      {active && (
        <motion.div
          layoutId="activeAdminTab"
          className={`absolute left-0 w-1.5 h-6 rounded-r-full ${activeColor.replace('text-', 'bg-')}`}
          style={{ 
            boxShadow: `0 0 15px currentColor`
          }}
          transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
        />
      )}
    </button>
  );
}

function StatCard({ label, value, icon, tag }: { label: string; value: string | number; icon: React.ReactNode; tag: string }) {
  const isLongValue = typeof value === 'string' && value.length > 10;
  
  return (
    <div className="bg-bg-card/40 backdrop-blur-xl border border-border-color rounded-[40px] p-8 group transition-all hover:shadow-lg">
      <div className="flex justify-between items-start mb-8">
        <div className="w-12 h-12 rounded-2xl bg-bg-sidebar border border-border-color flex items-center justify-center">
          {icon}
        </div>
        <div className="bg-text-main/5 p-2 rounded-xl text-text-secondary opacity-40">
          <MoreVertical size={16} />
        </div>
      </div>
      <div className="mb-8">
        <div className="text-[11px] font-bold text-text-secondary tracking-wide mb-1 leading-none opacity-60">{label}</div>
        <div className={`font-black text-text-main leading-tight tracking-tight ${
          isLongValue 
            ? value.length > 18 ? 'text-lg' : 'text-xl'
            : 'text-4xl'
        }`}>
          {value}
        </div>
      </div>
      <div className="flex">
        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-wide ${
           tag.includes('Agenda') ? 'bg-brand-primary/10 text-brand-primary' : 
           tag.includes('Biblio') ? 'bg-blue-500/10 text-blue-500' :
           tag.includes('Mural') ? 'bg-orange-500/10 text-orange-500' :
           tag.includes('Ação') ? 'bg-pink-500/10 text-pink-500' :
           'bg-text-main/5 text-text-secondary opacity-40'
        }`}>
          {tag}
        </span>
      </div>
    </div>
  );
}

function Bar({ day, value, label, active }: { day: string; value: number; label: string; active?: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center">
      <div className="mb-4 text-xs font-black text-text-main opacity-80">{label}</div>
      <div className="w-full relative group">
        <div 
          className={`w-full rounded-t-xl transition-all duration-700 ${active ? 'bg-brand-primary' : 'bg-text-main/5 border border-border-color'}`}
          style={{ height: `${value * 160}px` }}
        />
        {active && (
          <div className="absolute inset-0 bg-brand-primary/10 blur-xl opacity-50" />
        )}
      </div>
      <div className={`mt-6 text-[10px] font-black tracking-wide ${active ? 'text-brand-primary' : 'text-text-secondary opacity-40'}`}>{day}</div>
    </div>
  );
}

function DistributionRow({ label, info, percent, color }: { label: string; info: string; percent: number; color: string }) {
  return (
    <div className="bg-bg-sidebar/50 border border-border-color p-6 md:p-8 rounded-[24px] md:rounded-[32px] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div>
        <div className="text-text-main font-black text-sm mb-1 tracking-tight">{label}</div>
        <div className="text-text-secondary font-bold text-[10px] tracking-wide opacity-60">{info}</div>
      </div>
      <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto">
        <div className="flex-1 md:w-48 h-1.5 md:h-2 bg-text-main/5 rounded-full overflow-hidden">
          <div 
            className={`h-full ${color} transition-all duration-1000`} 
            style={{ width: `${percent}%` }} 
          />
        </div>
        <span className="text-text-main font-black text-lg md:text-xl leading-none shrink-0">{percent}%</span>
      </div>
    </div>
  );
}

function ActivityItem({ type, title, info, date }: { type: string; title: string; info: string; date: string }) {
  const formatDateToBR = (dateStr: string) => {
    if (!dateStr) return '-';
    const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const parts = dateOnly.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  return (
    <div className="bg-bg-sidebar/50 border border-border-color p-6 rounded-[28px] group transition-all cursor-pointer hover:bg-bg-main">
      <div className="flex items-center gap-4">
        <div className={`w-2 h-2 rounded-full ${type === 'Recado' ? 'bg-brand-primary' : 'bg-blue-500'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-4 mb-1">
            <div className="text-text-main font-black text-sm truncate opacity-80 flex-1 min-w-0" title={`${type}: ${title}`}>{type}: {title}</div>
            <span className="text-[9px] font-bold text-text-secondary opacity-40 shrink-0">{formatDateToBR(date)}</span>
          </div>
          <div className="text-text-secondary font-bold text-[10px] tracking-wide truncate opacity-50" title={info}>{info}</div>
        </div>
      </div>
    </div>
  );
}
