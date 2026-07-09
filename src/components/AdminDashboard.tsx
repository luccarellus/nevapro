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
  Trophy,
  LogOut
} from 'lucide-react';
import { materialService } from '../services/materialService';
import { muralService } from '../services/muralService';
import { eventService } from '../services/eventService';
import { adminService, AdminActivity, ProductionStat } from '../services/adminService';
import { Material, Notice, StudyEvent, UserProfile } from '../types';
import Logo from './Logo';
import { calculateLevelAndProgression } from '../utils/xpUtils';
import cidadesEscolasData from '../data/cidades_escolas.json';

const normalizeString = (str: string | null | undefined): string => {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const getUniqueNormalized = (items: (string | undefined | null)[]): string[] => {
  const seen = new Set<string>();
  const uniqueItems: string[] = [];
  
  for (const item of items) {
    if (!item) continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    
    const normalized = normalizeString(trimmed);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueItems.push(trimmed);
    } else {
      const index = uniqueItems.findIndex(x => normalizeString(x) === normalized);
      if (index !== -1) {
        const existing = uniqueItems[index];
        const existingUpperCount = (existing.match(/[A-Z]/g) || []).length;
        const newUpperCount = (trimmed.match(/[A-Z]/g) || []).length;
        if (newUpperCount > existingUpperCount) {
          uniqueItems[index] = trimmed;
        }
      }
    }
  }
  
  return uniqueItems.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
};

const getSignificantTokens = (name: string): string[] => {
  const normalized = normalizeString(name);
  const genericWords = new Set([
    'centro', 'de', 'do', 'da', 'em', 'e', 'ensino', 'escola', 'colegio', 
    'municipal', 'estadual', 'unidade', 'escolar', 'ce', 'c.e', 'c.e.', 'u.e', 'u.e.', 'ue'
  ]);
  return normalized
    .split(/[\s,.\-\/]+/)
    .filter(word => word.length > 2 && !genericWords.has(word));
};

const getCanonicalSchoolMap = (rawSchools: (string | null | undefined)[]): Record<string, string> => {
  const canonicalMap: Record<string, string> = {};
  const uniqueRaws = Array.from(new Set(rawSchools.map(s => s?.trim() || '').filter(Boolean)));
  uniqueRaws.sort((a, b) => b.length - a.length);
  
  const clusters: { representative: string; tokens: string[] }[] = [];
  
  for (const raw of uniqueRaws) {
    const tokens = getSignificantTokens(raw);
    if (tokens.length === 0) {
      canonicalMap[raw] = raw;
      continue;
    }
    
    let matchedCluster = null;
    for (const cluster of clusters) {
      const hasOverlap = tokens.some(t => cluster.tokens.includes(t)) || cluster.tokens.some(t => tokens.includes(t));
      if (hasOverlap) {
        matchedCluster = cluster;
        break;
      }
    }
    
    if (matchedCluster) {
      canonicalMap[raw] = matchedCluster.representative;
    } else {
      clusters.push({ representative: raw, tokens });
      canonicalMap[raw] = raw;
    }
  }
  
  return canonicalMap;
};



interface AdminDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export default function AdminDashboard({ user, onLogout }: AdminDashboardProps) {
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

  const schoolMap = useMemo(() => {
    const rawSchools = students.map(s => s.school);
    return getCanonicalSchoolMap(rawSchools);
  }, [students]);

  const filteredStudents = useMemo(() => {
    return students
      .filter(student => {
        const matchesSearch = (student.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                             (student.email || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesCity = filterCity 
          ? (student.city && normalizeString(student.city) === normalizeString(filterCity)) 
          : true;
          
        let matchesSchool = true;
        if (filterSchool) {
          const studentRawSchool = student.school || '';
          const studentCanonical = schoolMap[studentRawSchool] || studentRawSchool;
          matchesSchool = normalizeString(studentCanonical) === normalizeString(filterSchool);
        }
          
        const matchesGremio = filterGremio 
          ? (student.gremio && normalizeString(student.gremio) === normalizeString(filterGremio)) 
          : true;
          
        return matchesSearch && matchesCity && matchesSchool && matchesGremio;
      })
      .sort((a, b) => (b.xp || 0) - (a.xp || 0));
  }, [students, searchTerm, filterCity, filterSchool, filterGremio, schoolMap]);

  const citiesMA = useMemo(() => {
    const cities = cidadesEscolasData.map(item => item.city);
    return Array.from(new Set(cities)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, []);
  
  const schoolsMA = useMemo(() => {
    let filtered = cidadesEscolasData;
    if (filterCity) {
      filtered = cidadesEscolasData.filter(item => item.city === filterCity);
    }
    const canonicalNames = filtered.map(item => item.school);
    return Array.from(new Set(canonicalNames)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [filterCity]);

  const gremiosMA = useMemo(() => getUniqueNormalized(students.map(s => s.gremio)), [students]);

  const mostEngagedCity = useMemo(() => {
    if (!students.length) return { name: '-', xp: 0 };
    const cityXp: Record<string, number> = {};
    students.forEach(s => {
      if (s.city) {
        const cityNormalized = s.city.trim();
        cityXp[cityNormalized] = (cityXp[cityNormalized] || 0) + (s.xp || 0);
      }
    });
    let bestCity = '-';
    let maxXp = -1;
    Object.entries(cityXp).forEach(([city, xp]) => {
      if (xp > maxXp) {
        maxXp = xp;
        bestCity = city;
      }
    });
    return { name: bestCity, xp: maxXp };
  }, [students]);

  const mostEngagedSchool = useMemo(() => {
    if (!students.length) return { name: '-', xp: 0 };
    const schoolXp: Record<string, number> = {};
    students.forEach(s => {
      if (s.school) {
        const canonical = schoolMap[s.school] || s.school;
        schoolXp[canonical] = (schoolXp[canonical] || 0) + (s.xp || 0);
      }
    });
    let bestSchool = '-';
    let maxXp = -1;
    Object.entries(schoolXp).forEach(([school, xp]) => {
      if (xp > maxXp) {
        maxXp = xp;
        bestSchool = school;
      }
    });
    return { name: bestSchool, xp: maxXp };
  }, [students, schoolMap]);

  const schoolRanking = useMemo(() => {
    const schoolData: Record<string, { name: string; xp: number; city: string; studentsCount: number }> = {};
    students.forEach(s => {
      if (s.school) {
        const canonical = schoolMap[s.school] || s.school;
        if (!schoolData[canonical]) {
          schoolData[canonical] = {
            name: canonical,
            xp: 0,
            city: s.city || '-',
            studentsCount: 0
          };
        }
        schoolData[canonical].xp += (s.xp || 0);
        schoolData[canonical].studentsCount += 1;
      }
    });
    return Object.values(schoolData).sort((a, b) => b.xp - a.xp);
  }, [students, schoolMap]);

  const topStudents = useMemo(() => {
    return [...students]
      .sort((a, b) => (b.xp || 0) - (a.xp || 0))
      .slice(0, 6);
  }, [students]);

  const totalXp = useMemo(() => students.reduce((sum, student) => sum + (student.xp || 0), 0), [students]);
  const activeStudentsCount = useMemo(() => students.filter(student => (student.xp || 0) > 0).length, [students]);
  const averageXp = students.length ? Math.round(totalXp / students.length) : 0;
  const activeStudentsPercentage = students.length ? Math.round((activeStudentsCount / students.length) * 100) : 0;
  const topStudent = topStudents[0];

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
            <label htmlFor="eventTitle" className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Título do evento</label>
            <input 
              id="eventTitle"
              value={eventForm.title}
              onChange={(e) => setEventForm({...eventForm, title: e.target.value})}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all font-sans" 
              placeholder="Ex: Aulão no Cinema" 
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="eventReleaseDate" className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Data de liberação</label>
            <input 
              id="eventReleaseDate"
              type="datetime-local"
              title="Data de liberação"
              value={eventForm.releaseDate}
              onChange={(e) => setEventForm({...eventForm, releaseDate: e.target.value})}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all [color-scheme:dark]" 
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="eventXpReward" className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">XP de Participação (opcional)</label>
            <input 
              id="eventXpReward"
              type="number"
              value={eventForm.xpReward}
              onChange={(e) => setEventForm({...eventForm, xpReward: e.target.value})}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all font-sans" 
              placeholder="20" 
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="eventCategory" className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Categoria</label>
            <div className="relative">
              <select 
                id="eventCategory"
                title="Categoria do evento"
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
            <label htmlFor="eventObservation" className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Observação</label>
            <textarea 
              id="eventObservation"
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
            <label htmlFor="muralTitle" className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Título</label>
            <input 
              id="muralTitle"
              value={muralForm.title}
              onChange={(e) => setMuralForm({...muralForm, title: e.target.value})}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all font-sans" 
              placeholder="Ex: Simulado aberto para inscrição" 
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="muralCategory" className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Categoria</label>
            <div className="relative">
              <select 
                id="muralCategory"
                title="Categoria do recado"
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
            <label htmlFor="muralTag" className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Etiqueta</label>
            <input 
              id="muralTag"
              value={muralForm.tag}
              onChange={(e) => setMuralForm({...muralForm, tag: e.target.value})}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all font-sans" 
              placeholder="Ex: Aviso, Prazo, Destaque" 
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="muralContent" className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Texto</label>
            <textarea 
              id="muralContent"
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
            <label htmlFor="materialTitle" className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Título</label>
            <input 
              id="materialTitle"
              value={materialForm.title}
              onChange={(e) => setMaterialForm({...materialForm, title: e.target.value})}
              className="w-full bg-bg-main border border-border-color rounded-2xl px-6 py-4 text-text-main font-bold text-sm focus:outline-none focus:border-brand-primary/50 transition-all" 
              placeholder="Ex: Lista de revisão de Matemática" 
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="materialType" className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Tipo</label>
            <div className="relative">
              <select 
                id="materialType"
                title="Tipo de material"
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
            <label htmlFor="materialFoco" className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Foco</label>
            <div className="relative">
              <select 
                id="materialFoco"
                title="Foco do material"
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
            <label htmlFor="materialUrl" className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Link / arquivo</label>
            <input 
              id="materialUrl"
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
            <label htmlFor="materialDescription" className="text-[10px] font-black text-text-secondary tracking-wide ml-1 opacity-50">Descrição</label>
            <textarea 
              id="materialDescription"
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
          <button onClick={onLogout} className="bg-brand-primary px-8 py-4 rounded-2xl font-bold text-white">Sair do sistema</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-bg-main text-text-secondary font-sans overflow-hidden">
      {/* Top Header Bar (Navy Blue) */}
      <header className="h-16 md:h-20 bg-[#0b192c] border-b border-white/5 flex items-center justify-between px-6 md:px-12 shrink-0 z-50">
        <div className="flex items-center gap-6">
          <div className="text-white flex items-center">
            <Logo className="h-8 md:h-10 justify-start" />
          </div>
          {/* Admin Mode Badge */}
          <div className="hidden sm:flex bg-yellow-500/10 border border-yellow-500/20 px-3 py-1 rounded-lg items-center gap-1.5">
            <ShieldCheck size={14} className="text-yellow-500" />
            <span className="text-[10px] font-black tracking-wide text-yellow-500">Super-admin Neva Pro</span>
          </div>
        </div>

        {/* Navigation Tabs (Horizontal Menu) */}
        <nav className="hidden md:flex items-center gap-1.5 font-bold">
          <button 
            onClick={() => setActiveTab('panorama')} 
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'panorama' 
                ? 'bg-white/10 text-white' 
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <LayoutGrid size={16} />
            Painel
          </button>
          <button 
            onClick={() => setActiveTab('eventos')} 
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'eventos' 
                ? 'bg-white/10 text-white' 
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Calendar size={16} />
            Eventos
            {eventos.length > 0 && (
              <span className="bg-white/10 text-white text-[9px] px-1.5 py-0.5 rounded-md">{eventos.length}</span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('materiais')} 
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'materiais' 
                ? 'bg-white/10 text-white' 
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Library size={16} />
            Materiais
            {materials.length > 0 && (
              <span className="bg-white/10 text-white text-[9px] px-1.5 py-0.5 rounded-md">{materials.length}</span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('mural')} 
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'mural' 
                ? 'bg-white/10 text-white' 
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Megaphone size={16} />
            Mural
            {recados.length > 0 && (
              <span className="bg-white/10 text-white text-[9px] px-1.5 py-0.5 rounded-md">{recados.length}</span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('alunos')} 
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'alunos' 
                ? 'bg-white/10 text-white' 
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Users size={16} />
            Alunos
          </button>
        </nav>

        {/* User Info / Profile & Logout */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center font-black text-xs text-white">
              {user.name?.charAt(0) || 'A'}
            </div>
            <span className="hidden sm:inline text-xs font-bold text-slate-200">{user.name}</span>
          </div>

          <button 
            onClick={onLogout}
            className="p-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-red-500 transition-all cursor-pointer"
            title="Sair do sistema"
          >
            <LogOut size={16} />
          </button>

          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="md:hidden p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 hover:text-white cursor-pointer"
            title="Alternar menu"
            aria-label="Alternar menu"
          >
            <PanelLeftClose size={18} className={isSidebarOpen ? "" : "rotate-180"} />
          </button>
        </div>
      </header>

      {/* Mobile Drawer (Sidebar on mobile when clicked hamburger) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] mt-16 md:mt-20"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="md:hidden fixed inset-y-0 left-0 w-72 bg-[#0b192c] border-r border-white/5 flex flex-col z-[60] mt-16 md:mt-20 p-6 space-y-4"
            >
              <div className="text-[10px] font-black text-slate-400 opacity-50 tracking-wide uppercase mb-2">Navegação</div>
              <button 
                onClick={() => { setActiveTab('panorama'); setIsSidebarOpen(false); }} 
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm cursor-pointer ${activeTab === 'panorama' ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'}`}
              >
                <LayoutGrid size={18} /> Panorama
              </button>
              <button 
                onClick={() => { setActiveTab('eventos'); setIsSidebarOpen(false); }} 
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm cursor-pointer ${activeTab === 'eventos' ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'}`}
              >
                <Calendar size={18} /> Eventos
              </button>
              <button 
                onClick={() => { setActiveTab('materiais'); setIsSidebarOpen(false); }} 
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm cursor-pointer ${activeTab === 'materiais' ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'}`}
              >
                <Library size={18} /> Materiais
              </button>
              <button 
                onClick={() => { setActiveTab('mural'); setIsSidebarOpen(false); }} 
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm cursor-pointer ${activeTab === 'mural' ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'}`}
              >
                <Megaphone size={18} /> Mural
              </button>
              <button 
                onClick={() => { setActiveTab('alunos'); setIsSidebarOpen(false); }} 
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm cursor-pointer ${activeTab === 'alunos' ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'}`}
              >
                <Users size={18} /> Alunos
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 overflow-y-auto bg-bg-main relative">
        <div className="p-6 md:p-12 max-w-7xl mx-auto">
          {activeTab === 'panorama' ? (
            <>
              {/* Header Title Section */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0 shadow-sm">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <h1 className="text-3xl font-black text-text-main tracking-tight leading-none mb-1.5 flex items-center gap-2">Painel Neva Pro</h1>
                    <p className="text-xs text-text-secondary font-medium">Visao geral de alunos, engajamento e conteudos do projeto.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveTab('alunos')}
                  className="bg-bg-card border border-border-color hover:bg-slate-50 dark:hover:bg-slate-800 text-text-main px-6 py-3 rounded-2xl font-bold text-xs shadow-sm flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Users size={15} />
                  Ver alunos
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
                <div className="lg:col-span-5 bg-bg-card/70 border border-border-color rounded-[24px] p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-black text-text-main mb-1.5">Publicacao para alunos</h3>
                    <p className="text-[11px] text-text-secondary font-medium opacity-80 mb-6">Atalhos para atualizar biblioteca, mural e agenda.</p>
                    <div className="flex gap-3 bg-bg-main/60 p-1.5 rounded-xl border border-border-color mb-6">
                      <button
                        onClick={() => setShowModal('material')}
                        className="flex-1 bg-bg-card border border-border-color py-2.5 rounded-lg text-xs font-black text-text-main shadow-sm flex items-center justify-center gap-2 hover:bg-bg-sidebar transition-all cursor-pointer"
                      >
                        <Library size={14} className="text-brand-primary" />
                        Material
                      </button>
                      <button
                        onClick={() => setShowModal('recado')}
                        className="flex-1 bg-brand-primary/10 border border-brand-primary/20 py-2.5 rounded-lg text-xs font-black text-brand-primary flex items-center justify-center gap-2 hover:bg-brand-primary/20 transition-all cursor-pointer"
                      >
                        <Megaphone size={14} />
                        Mural
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-text-secondary leading-relaxed font-semibold opacity-70">
                    Use estes atalhos para publicar conteudos e comunicados sem sair do panorama.
                  </p>
                </div>

                <div className="lg:col-span-7 bg-bg-card/70 border border-border-color rounded-[24px] p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row justify-between gap-6 mb-6">
                    <div>
                      <h3 className="text-base font-black text-text-main mb-1.5">Resumo academico</h3>
                      <p className="text-[11px] text-text-secondary font-medium opacity-80">Dados operacionais do backoffice educacional.</p>
                    </div>
                    <button
                      onClick={() => setShowModal('evento')}
                      className="bg-brand-primary/10 text-brand-primary border border-brand-primary/20 px-4 py-2.5 rounded-xl font-black text-[10px] tracking-wider hover:bg-brand-primary hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Calendar size={14} />
                      Novo evento
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-bg-main/50 border border-border-color rounded-2xl p-4">
                      <p className="text-[10px] font-black text-text-secondary uppercase opacity-60 mb-2">Materiais</p>
                      <p className="text-2xl font-black text-text-main">{materials.length}</p>
                    </div>
                    <div className="bg-bg-main/50 border border-border-color rounded-2xl p-4">
                      <p className="text-[10px] font-black text-text-secondary uppercase opacity-60 mb-2">Avisos</p>
                      <p className="text-2xl font-black text-text-main">{recados.length}</p>
                    </div>
                    <div className="bg-bg-main/50 border border-border-color rounded-2xl p-4">
                      <p className="text-[10px] font-black text-text-secondary uppercase opacity-60 mb-2">Eventos</p>
                      <p className="text-2xl font-black text-text-main">{eventos.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden">
                {/* Column 1 (Left - 40% width / lg:col-span-5) */}
                <div className="lg:col-span-5 bg-bg-card border border-border-color rounded-[24px] p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-black text-text-main mb-1.5">Cobrança de assinaturas</h3>
                    <p className="text-[11px] text-text-secondary font-medium opacity-80 mb-6">Provedor das NOVAS assinaturas — não afeta as já criadas</p>
                    
                    {/* Sub-selector pills mimicking photo */}
                    <div className="flex gap-3 bg-bg-main p-1.5 rounded-xl border border-border-color mb-6">
                      <button 
                        onClick={() => setShowModal('material')}
                        className="flex-1 bg-bg-card border border-border-color py-2.5 rounded-lg text-xs font-black text-text-main shadow-sm flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                      >
                        <Library size={14} className="text-blue-500" />
                        Material / Biblioteca
                      </button>
                      <button 
                        onClick={() => setShowModal('recado')}
                        className="flex-1 bg-brand-primary/10 border border-brand-primary/20 py-2.5 rounded-lg text-xs font-black text-brand-primary flex items-center justify-center gap-2 hover:bg-brand-primary/20 transition-all cursor-pointer"
                      >
                        <Megaphone size={14} />
                        Mural / Avisos
                      </button>
                    </div>
                  </div>
                  
                  <p className="text-[11px] text-text-secondary leading-relaxed font-semibold opacity-70">
                    PIX Automático (Pluggy) é o padrão. Trocar para Pagar.me reativa cartão/boleto nas próximas assinaturas.
                  </p>
                </div>

                {/* Column 2 (Right - 60% width / lg:col-span-7) */}
                <div className="lg:col-span-7 bg-bg-card border border-border-color rounded-[24px] p-6 shadow-sm">
                  <h3 className="text-base font-black text-text-main mb-1.5">Recebedor master (assinatura via PIX)</h3>
                  <p className="text-[11px] text-text-secondary font-medium opacity-80 mb-4">Conta da Mytia que recebe as mensalidades dos clientes</p>

                  {/* Warning Box */}
                  <div className="bg-yellow-500/10 border border-yellow-500/20 px-4 py-2 rounded-lg flex items-center gap-2 mb-4 w-fit">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                    <span className="text-[10px] font-black text-yellow-600 dark:text-yellow-400">Recebedor não configurado</span>
                  </div>

                  {/* Form Fields styled like the photo */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="space-y-1">
                      <label htmlFor="master-cnpj" className="text-[10px] font-black text-text-secondary uppercase opacity-70 tracking-wider">CNPJ</label>
                      <input 
                        id="master-cnpj"
                        type="text" 
                        readOnly 
                        value="00.000.000/0001-00" 
                        placeholder="CNPJ"
                        title="CNPJ do Recebedor"
                        className="w-full bg-bg-main border border-border-color rounded-xl px-4 py-2.5 text-xs text-text-main font-bold focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="master-titular" className="text-[10px] font-black text-text-secondary uppercase opacity-70 tracking-wider">Titular</label>
                      <input 
                        id="master-titular"
                        type="text" 
                        readOnly 
                        value="Razão social" 
                        placeholder="Titular"
                        title="Titular da Conta"
                        className="w-full bg-bg-main border border-border-color rounded-xl px-4 py-2.5 text-xs text-text-secondary font-bold focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label htmlFor="master-banco" className="text-[10px] font-black text-text-secondary uppercase opacity-70 tracking-wider">Banco (instituição)</label>
                      <select 
                        id="master-banco"
                        disabled 
                        title="Banco da Conta"
                        className="w-full bg-bg-main border border-border-color rounded-xl px-4 py-2.5 text-xs text-text-secondary font-bold focus:outline-none appearance-none"
                      >
                        <option>Selecione o banco...</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="master-agencia" className="text-[10px] font-black text-text-secondary uppercase opacity-70 tracking-wider">Agência</label>
                      <input 
                        id="master-agencia"
                        type="text" 
                        readOnly 
                        value="0001" 
                        placeholder="Agência"
                        title="Agência do Banco"
                        className="w-full bg-bg-main border border-border-color rounded-xl px-4 py-2.5 text-xs text-text-main font-bold focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="master-conta" className="text-[10px] font-black text-text-secondary uppercase opacity-70 tracking-wider">Conta</label>
                      <input 
                        id="master-conta"
                        type="text" 
                        readOnly 
                        value="12345-6" 
                        placeholder="Número da conta"
                        title="Número da Conta Bancária"
                        className="w-full bg-bg-main border border-border-color rounded-xl px-4 py-2.5 text-xs text-text-main font-bold focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label htmlFor="master-tipo" className="text-[10px] font-black text-text-secondary uppercase opacity-70 tracking-wider">Tipo de conta</label>
                      <input 
                        id="master-tipo"
                        type="text" 
                        readOnly 
                        value="Conta corrente" 
                        placeholder="Tipo de conta"
                        title="Tipo de Conta Bancária"
                        className="w-full bg-bg-main border border-border-color rounded-xl px-4 py-2.5 text-xs text-text-main font-bold focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-3">
                    <button className="bg-bg-main border border-border-color hover:bg-slate-100 dark:hover:bg-slate-800 text-text-main font-black text-[10px] tracking-wide uppercase px-6 py-3 rounded-xl transition-all cursor-not-allowed opacity-50">
                      Salvar dados
                    </button>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] tracking-wide uppercase px-6 py-3 rounded-xl transition-all cursor-not-allowed shadow-sm">
                      Criar/validar recebedor
                    </button>
                  </div>
                </div>
              </div>

              {/* Stat Cards Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
                {/* KPI 1: Alunos ativos */}
                <div className="bg-bg-card/70 border border-border-color rounded-[20px] p-5 shadow-sm relative flex flex-col justify-between h-[150px]">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-black text-text-secondary uppercase opacity-60 tracking-wider block mb-1">ALUNOS ATIVOS</span>
                      <span className="text-2xl font-black text-text-main leading-none block">{activeStudentsCount}</span>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
                      <Users size={18} />
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold text-text-secondary opacity-60 pt-4 border-t border-border-color/30">
                    <span>{students.length} alunos cadastrados</span>
                  </div>
                </div>

                {/* KPI 2: XP total */}
                <div className="bg-bg-card/70 border border-border-color rounded-[20px] p-5 shadow-sm relative flex flex-col justify-between h-[150px]">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-black text-text-secondary uppercase opacity-60 tracking-wider block mb-1">XP TOTAL</span>
                      <span className="text-2xl font-black text-text-main leading-none block">{totalXp.toLocaleString()}</span>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
                      <Trophy size={18} />
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-border-color/30">
                    <span className="text-[10px] font-bold text-text-secondary opacity-60">{averageXp.toLocaleString()} XP de media</span>
                    <span className="bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5">
                      REDE
                    </span>
                  </div>
                </div>

                {/* KPI 3: Top aluno */}
                <div className="bg-bg-card/70 border border-border-color rounded-[20px] p-5 shadow-sm relative flex flex-col justify-between h-[150px]">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-black text-text-secondary uppercase opacity-60 tracking-wider block mb-1">TOP ALUNO</span>
                      <span className="text-2xl font-black text-text-main leading-none block truncate max-w-[170px]" title={topStudent?.name || '-'}>{topStudent?.name || '-'}</span>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
                      <Activity size={18} />
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-border-color/30">
                    <span className="text-[10px] font-bold text-text-secondary opacity-60">{(topStudent?.xp || 0).toLocaleString()} XP acumulado</span>
                  </div>
                </div>

                {/* KPI 4: Escolas */}
                <div className="bg-bg-card/70 border border-border-color rounded-[20px] p-5 shadow-sm relative flex flex-col justify-between h-[150px]">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-black text-text-secondary uppercase opacity-60 tracking-wider block mb-1">ESCOLAS</span>
                      <span className="text-2xl font-black text-text-main leading-none block">{schoolRanking.length}</span>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-bg-sidebar border border-border-color flex items-center justify-center text-brand-primary shrink-0">
                      <Library size={18} />
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold text-text-secondary opacity-60 pt-4 border-t border-border-color/30">
                    <span>{mostEngagedSchool.name} lidera em XP</span>
                  </div>
                </div>
              </div>

              {/* Bottom Charts & Rankings Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
                {/* Column 1 (Left - 8 cols) */}
                <div className="lg:col-span-8 space-y-8">
                  {/* Chart 1: Alunos mais engajados */}
                  <div className="bg-bg-card/70 border border-border-color rounded-[24px] p-6 shadow-sm">
                    <div className="mb-6">
                      <h3 className="text-sm font-black text-text-main mb-1">Alunos mais engajados</h3>
                      <p className="text-[10px] text-text-secondary font-medium opacity-60">Ranking por XP acumulado</p>
                    </div>

                    <div className="space-y-4">
                      {topStudents.map((student, idx) => {
                        const percentage = topStudent?.xp ? Math.max(((student.xp || 0) / topStudent.xp) * 100, 4) : 4;
                        return (
                          <button
                            key={student.id}
                            onClick={() => {
                              setActiveTab('alunos');
                              setSearchTerm(student.name || '');
                            }}
                            className="w-full text-left group"
                          >
                            <div className="flex items-center justify-between gap-4 mb-2">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="w-7 h-7 rounded-lg bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[10px] font-black flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs font-black text-text-main truncate">{student.name || 'Aluno sem nome'}</p>
                                  <p className="text-[9px] font-bold text-text-secondary opacity-60 truncate">{student.city || 'MA'} • {student.school || 'Escola nao informada'}</p>
                                </div>
                              </div>
                              <span className="text-[10px] font-black text-brand-primary shrink-0">{(student.xp || 0).toLocaleString()} XP</span>
                            </div>
                            <div className="h-2 bg-bg-sidebar rounded-full overflow-hidden border border-border-color/40">
                              <div className="h-full bg-brand-primary rounded-full transition-all group-hover:bg-brand-secondary" style={{ width: `${percentage}%` }} />
                            </div>
                          </button>
                        );
                      })}
                      {topStudents.length === 0 && (
                        <div className="h-48 flex items-center justify-center text-[10px] font-black text-text-secondary opacity-50">
                          Nenhum aluno cadastrado
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Chart 2: Escolas mais engajadas */}
                  <div className="bg-bg-card/70 border border-border-color rounded-[24px] p-6 shadow-sm">
                    <div className="mb-6">
                      <h3 className="text-sm font-black text-text-main mb-1">Escolas mais engajadas</h3>
                      <p className="text-[10px] text-text-secondary font-medium opacity-60">Soma de XP dos alunos por escola</p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 h-56 items-end">
                      {schoolRanking.slice(0, 6).map((school, idx) => {
                        const topSchoolXp = schoolRanking[0]?.xp || 1;
                        const height = Math.max((school.xp / topSchoolXp) * 100, 10);
                        return (
                          <button
                            key={school.name}
                            onClick={() => {
                              setActiveTab('alunos');
                              setFilterSchool(school.name);
                            }}
                            className="h-full flex flex-col justify-end gap-3 group min-w-0"
                          >
                            <div className="flex-1 w-full flex items-end">
                              <div className="w-full bg-bg-sidebar rounded-xl border border-border-color overflow-hidden flex items-end min-h-[44px]">
                                <div className="w-full bg-brand-primary/80 group-hover:bg-brand-primary transition-colors" style={{ height: `${height}%` }} />
                              </div>
                            </div>
                            <div className="min-h-[48px]">
                              <p className="text-[10px] font-black text-text-main truncate" title={school.name}>{idx + 1}. {school.name}</p>
                              <p className="text-[9px] font-bold text-text-secondary opacity-60">{school.xp.toLocaleString()} XP • {school.studentsCount} alunos</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Column 2 (Right - 4 cols) */}
                <div className="lg:col-span-4 space-y-8">
                  {/* Chart 3: Distribuicao de engajamento */}
                  <div className="bg-bg-card/70 border border-border-color rounded-[24px] p-6 shadow-sm">
                    <div className="mb-6">
                      <h3 className="text-sm font-black text-text-main mb-1">Distribuicao de engajamento</h3>
                      <p className="text-[10px] text-text-secondary font-medium opacity-60">Alunos com XP registrado na plataforma</p>
                    </div>

                    <div className="flex justify-center items-center h-40">
                      <svg width="120" height="120" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="35" fill="none" stroke="rgb(var(--text-main-rgb) / 0.05)" strokeWidth="12" />
                        <circle 
                          cx="50" 
                          cy="50" 
                          r="35" 
                          fill="none" 
                          stroke="var(--brand-primary)"
                          strokeWidth="12" 
                          strokeDasharray={`${activeStudentsPercentage * 2.2} 220`}
                          strokeDashoffset="0"
                          transform="rotate(-90 50 50)" 
                          strokeLinecap="round"
                        />
                        <text x="50" y="47" textAnchor="middle" fill="var(--text-main)" fontSize="18" fontWeight="900">{activeStudentsPercentage}%</text>
                        <text x="50" y="60" textAnchor="middle" fill="var(--text-secondary)" fontSize="7" fontWeight="800">ATIVOS</text>
                      </svg>
                    </div>

                    <div className="flex justify-center gap-4 text-[10px] font-bold text-text-secondary opacity-80 mt-4">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 bg-brand-primary rounded-sm shrink-0" />
                        <span>{activeStudentsCount} ativos</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 bg-text-main/10 rounded-sm shrink-0" />
                        <span>{students.length - activeStudentsCount} sem XP</span>
                      </div>
                    </div>
                  </div>

                  {/* List 4: Rankings */}
                  <div className="bg-bg-card/70 border border-border-color rounded-[24px] p-6 shadow-sm">
                    <div className="mb-6 flex justify-between items-start">
                      <div>
                        <h3 className="text-sm font-black text-text-main mb-1">Destaques da rede</h3>
                        <p className="text-[10px] text-text-secondary font-medium opacity-60">Atalhos para os maiores engajamentos</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Top Students */}
                      {filteredStudents.slice(0, 3).map((student, idx) => (
                        <div key={student.id} className="flex items-center justify-between group gap-4 w-full min-w-0 pb-3 border-b border-border-color/30 last:border-0 last:pb-0">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="w-2 h-2 rounded-full bg-brand-primary shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-text-main font-black text-xs truncate uppercase tracking-tight">{student.name}</div>
                              <div className="text-[9px] font-semibold text-text-secondary opacity-60 mt-0.5">
                                {idx + 1}º Lugar • {student.xp?.toLocaleString()} XP • {student.city || 'MA'}
                              </div>
                            </div>
                          </div>
                          <button 
                            onClick={() => {
                              setActiveTab('alunos');
                              setSearchTerm(student.name || '');
                            }}
                            className="text-brand-primary hover:text-brand-secondary transition-colors font-black text-[10px] uppercase tracking-wider shrink-0 flex items-center gap-0.5 cursor-pointer"
                          >
                            Ver aluno
                          </button>
                        </div>
                      ))}

                      {/* Top Schools */}
                      {schoolRanking.slice(0, 2).map((school) => (
                        <div key={school.name} className="flex items-center justify-between group gap-4 w-full min-w-0 pb-3 border-b border-border-color/30 last:border-0 last:pb-0">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="w-2 h-2 rounded-full bg-brand-primary/60 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-text-main font-black text-xs truncate uppercase tracking-tight">{school.name}</div>
                              <div className="text-[9px] font-semibold text-text-secondary opacity-60 mt-0.5">
                                Escola Destaque • {school.xp?.toLocaleString()} XP • {school.city}
                              </div>
                            </div>
                          </div>
                          <button 
                            onClick={() => {
                              setActiveTab('alunos');
                              setFilterSchool(school.name);
                            }}
                            className="text-brand-primary hover:text-brand-secondary transition-colors font-black text-[10px] uppercase tracking-wider shrink-0 flex items-center gap-0.5 cursor-pointer"
                          >
                            Ver escola
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {activeTab === 'eventos' ? (
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
                              id="searchTerm"
                              title="Buscar aluno"
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="w-full bg-bg-main/40 border border-border-color rounded-2xl pl-14 pr-6 py-4 text-sm font-bold text-text-main placeholder:opacity-30 focus:outline-none focus:border-brand-primary/50 transition-all font-sans backdrop-blur-md" 
                              placeholder="Buscar por nome ou email..."
                            />
                         </div>
                       </div>
                     </div>

                     {/* Destaques de engajamento */}
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10 mt-6">
                       <div className="bg-bg-sidebar/40 border border-border-color rounded-2xl p-6 flex items-center gap-6 shadow-sm relative overflow-hidden group">
                         <div className="w-12 h-12 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
                           <Trophy size={24} />
                         </div>
                         <div>
                           <p className="text-[10px] font-black text-text-secondary uppercase tracking-wider opacity-50 mb-1">Cidade mais engajada</p>
                           <h4 className="text-lg font-black text-text-main leading-tight">{mostEngagedCity.name}</h4>
                           <p className="text-[10px] font-bold text-brand-primary mt-1">{mostEngagedCity.xp.toLocaleString()} XP Total</p>
                         </div>
                       </div>
                       <div className="bg-bg-sidebar/40 border border-border-color rounded-2xl p-6 flex items-center gap-6 shadow-sm relative overflow-hidden group">
                         <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500 shrink-0">
                           <Library size={24} />
                         </div>
                         <div>
                           <p className="text-[10px] font-black text-text-secondary uppercase tracking-wider opacity-50 mb-1">Escola mais engajada</p>
                           <h4 className="text-lg font-black text-text-main leading-tight truncate max-w-[200px]" title={mostEngagedSchool.name}>{mostEngagedSchool.name}</h4>
                           <p className="text-[10px] font-bold text-purple-500 mt-1">{mostEngagedSchool.xp.toLocaleString()} XP Total</p>
                         </div>
                       </div>
                     </div>

                     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                      <div className="space-y-2">
                        <label htmlFor="filterCity" className="text-[10px] font-black text-text-secondary tracking-wider opacity-40 ml-4">Cidades</label>
                        <div className="relative">
                           <select 
                             id="filterCity"
                             title="Filtrar por cidade"
                             value={filterCity}
                             onChange={(e) => {
                               setFilterCity(e.target.value);
                               setFilterSchool('');
                             }}
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
                        <label htmlFor="filterSchool" className="text-[10px] font-black text-text-secondary tracking-wider opacity-40 ml-4">Escolas</label>
                        <div className="relative">
                           <select 
                             id="filterSchool"
                             title="Filtrar por escola"
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
                        <label htmlFor="filterGremio" className="text-[10px] font-black text-text-secondary tracking-wider opacity-40 ml-4">Grêmios</label>
                        <div className="relative">
                           <select 
                             id="filterGremio"
                             title="Filtrar por grêmio"
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
                                          ref={(el) => { if (el) el.style.width = `${xpPercentage}%`; }}
                                          className="h-full bg-brand-primary rounded-full transition-all duration-1000" 
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
                                         ref={(el) => { if (el) el.style.width = `${xpPercentage}%`; }}
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
          )}
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
                title="Fechar"
                aria-label="Fechar"
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
          ref={(el) => { if (el) el.style.height = `${value * 160}px`; }}
          className={`w-full rounded-t-xl transition-all duration-700 ${active ? 'bg-brand-primary' : 'bg-text-main/5 border border-border-color'}`}
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
            ref={(el) => { if (el) el.style.width = `${percent}%`; }}
            className={`h-full ${color} transition-all duration-1000`} 
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
