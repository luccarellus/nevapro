import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Trash2, CheckCircle2,
  ShieldCheck, X, ArrowRight
} from 'lucide-react';
import Spinner from './Spinner';
import { materialService } from '../services/materialService';
import { muralService } from '../services/muralService';
import { eventService } from '../services/eventService';
import { adminService } from '../services/adminService';
import { userService } from '../services/userService';
import { uploadService } from '../services/uploadService';
import { Material, Notice, StudyEvent, UserProfile } from '../types';
import { calculateLevelAndProgression } from '../utils/xpUtils';
import cidadesEscolasData from '../data/cidades_escolas.json';
import AdminHeader from './admin/AdminHeader';
import AdminPanorama from './admin/AdminPanorama';
import AdminEventos from './admin/AdminEventos';
import AdminMateriais from './admin/AdminMateriais';
import AdminMural from './admin/AdminMural';
import AdminAlunos from './admin/AdminAlunos';
import { normalizeString, getCanonicalSchoolMap, getUniqueNormalized } from './admin/AdminUtils';

interface AdminDashboardProps {
  user: UserProfile;
  onLogout: () => void;
  onUpdateUser: (user: UserProfile) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  /** @deprecated No longer used — theme picker was removed */
  theme?: string;
  /** @deprecated No longer used — theme picker was removed */
  onThemeChange?: (theme: string) => void;
}

export default function AdminDashboard({
  user,
  onLogout,
  onUpdateUser,
  isDarkMode,
  onToggleDarkMode
}: AdminDashboardProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [recados, setRecados] = useState<Notice[]>([]);
  const [eventos, setEventos] = useState<StudyEvent[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'panorama' | 'eventos' | 'materiais' | 'mural' | 'alunos'>('panorama');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [filterGremio, setFilterGremio] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'top10' | 'new' | 'inactive'>('all');

  const [showModal, setShowModal] = useState<'material' | 'recado' | 'evento' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; type: 'evento' | 'material' | 'recado'; title: string } | null>(null);

  const [eventForm, setEventForm] = useState({ title: '', releaseDate: '', xpReward: '500', category: 'Evento', observation: '' });
  const [materialForm, setMaterialForm] = useState({ title: '', type: 'pdf', foco: 'ENEM geral', url: '', description: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [muralForm, setMuralForm] = useState({ title: '', category: 'importante', tag: '', content: '' });

  const schoolMap = useMemo(() => getCanonicalSchoolMap(students.map(s => s.school)), [students]);

  const filteredStudents = useMemo(() => {
    let result = students.filter(student => {
      const matchesSearch = (student.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (student.email || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCity = filterCity ? (student.city && normalizeString(student.city) === normalizeString(filterCity)) : true;
      let matchesSchool = true;
      if (filterSchool) {
        const studentRawSchool = student.school || '';
        const studentCanonical = schoolMap[studentRawSchool] || studentRawSchool;
        matchesSchool = normalizeString(studentCanonical) === normalizeString(filterSchool);
      }
      const matchesGremio = filterGremio ? (student.gremio && normalizeString(student.gremio) === normalizeString(filterGremio)) : true;
      const matchesInactive = filterType === 'inactive' ? (student.xp || 0) === 0 : true;
      return matchesSearch && matchesCity && matchesSchool && matchesGremio && matchesInactive;
    });
    if (filterType === 'new') {
      result.sort((a, b) => {
        const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tB - tA;
      });
    } else {
      result.sort((a, b) => (b.xp || 0) - (a.xp || 0));
    }
    if (filterType === 'top10') result = result.slice(0, 10);
    return result;
  }, [students, searchTerm, filterCity, filterSchool, filterGremio, filterType, schoolMap]);

  const citiesMA = useMemo(() =>
    Array.from(new Set(cidadesEscolasData.map(item => item.city))).sort((a, b) => a.localeCompare(b, 'pt-BR')), []);
  const schoolsMA = useMemo(() => {
    let filtered = cidadesEscolasData;
    if (filterCity) filtered = cidadesEscolasData.filter(item => item.city === filterCity);
    return Array.from(new Set(filtered.map(item => item.school))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [filterCity]);
  const gremiosMA = useMemo(() => getUniqueNormalized(students.map(s => s.gremio)), [students]);

  const fetchData = async () => {
    try {
      const [mats, recal, evts, studs] = await Promise.all([
        materialService.getMaterials(), muralService.getRecados(), eventService.getEventos(),
        adminService.getStudents()
      ]);
      setMaterials(mats); setRecados(recal); setEventos(evts); setStudents(studs);
    } catch (error) { console.error('Failed to fetch data:', error); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCloseModal = () => {
    setShowModal(null); setEditingId(null);
    setEventForm({ title: '', releaseDate: '', xpReward: '20', category: 'Evento', observation: '' });
    setMaterialForm({ title: '', type: 'pdf', foco: 'ENEM geral', url: '', description: '' });
    setSelectedFile(null);
    setMuralForm({ title: '', category: 'importante', tag: '', content: '' });
  };

  const handleEditEvent = (evt: StudyEvent) => {
    setEditingId(evt.id);
    setEventForm({
      title: evt.title,
      releaseDate: evt.date + 'T' + (evt.time || '00:00'),
      xpReward: String(evt.xpReward || '20'),
      category: evt.category || 'Evento',
      observation: evt.observation || evt.description || ''
    });
    setShowModal('evento');
  };

  const handleEditMaterial = (mat: Material) => {
    setEditingId(mat.id);
    setMaterialForm({ title: mat.title, type: mat.type, foco: mat.subject || 'ENEM geral', url: mat.url || '', description: mat.description || '' });
    setSelectedFile(null);
    setShowModal('material');
  };

  const handleEditMural = (rec: Notice) => {
    setEditingId(rec.id);
    setMuralForm({ title: rec.title, category: rec.category || 'importante', tag: rec.tag || '', content: rec.content });
    setShowModal('recado');
  };

  const handleSaveMural = async () => {
    if (!muralForm.title || !muralForm.content) return;
    setIsLoading(true);
    try {
      if (editingId) {
        await muralService.updateRecado(editingId, { title: muralForm.title, category: muralForm.category as any, tag: muralForm.tag, content: muralForm.content });
      } else {
        await muralService.addRecado({ title: muralForm.title, category: muralForm.category as any, tag: muralForm.tag, content: muralForm.content, sender: 'Administração', date: new Date().toISOString() });
      }
      setIsSuccess(true); fetchData();
      setTimeout(() => { handleCloseModal(); setIsSuccess(false); }, 1500);
    } catch (error: any) {
      console.error('Failed to save notice:', error);
      alert(`Erro ao salvar recado: ${error?.message || 'Falha ao salvar recado'}`);
    } finally { setIsLoading(false); }
  };

  const handleSaveEvent = async () => {
    if (!eventForm.title || !eventForm.releaseDate) return;
    setIsLoading(true);
    try {
      const parts = eventForm.releaseDate.split('T');
      const payload = { title: eventForm.title, date: parts[0], time: parts[1] || '00:00', type: 'evento' as const, category: eventForm.category, xpReward: parseInt(eventForm.xpReward), observation: eventForm.observation };
      if (editingId) { await eventService.updateEvento(editingId, payload); }
      else { await eventService.addEvento(payload); }
      setIsSuccess(true); fetchData();
      setTimeout(() => { handleCloseModal(); setIsSuccess(false); }, 1500);
    } catch (error: any) {
      console.error('Failed to save event:', error);
      alert(`Erro ao salvar evento: ${error?.message || 'Falha ao salvar evento'}`);
    } finally { setIsLoading(false); }
  };

  const handleSaveMaterial = async () => {
    if (!materialForm.title || (!materialForm.url && !selectedFile)) return;
    setIsLoading(true);
    try {
      let finalUrl = materialForm.url;
      if (selectedFile) {
        finalUrl = await uploadService.uploadFile(selectedFile, 'Falha no upload', true, 'material');
      }
      const payload = { title: materialForm.title, type: materialForm.type as any, foco: materialForm.foco, url: finalUrl, description: materialForm.description };
      if (editingId) { await materialService.updateMaterial(editingId, payload); }
      else { await materialService.addMaterial(payload); }
      setIsSuccess(true); fetchData();
      setTimeout(() => { handleCloseModal(); setIsSuccess(false); }, 1500);
    } catch (error: any) {
      console.error('Failed to save material:', error);
      alert(`Erro ao salvar material: ${error?.message || 'Falha ao salvar material'}`);
    } finally { setIsLoading(false); }
  };

  const handleDeleteEvent = (id: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDeleteConfirm({ id, type: 'evento', title: (eventos.find(evt => evt.id === id)?.title) || 'este evento' });
  };
  const handleDeleteMaterial = (id: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDeleteConfirm({ id, type: 'material', title: (materials.find(mat => mat.id === id)?.title) || 'este material' });
  };
  const handleDeleteRecado = (id: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDeleteConfirm({ id, type: 'recado', title: (recados.find(rec => rec.id === id)?.title) || 'este recado' });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    const { id, type } = deleteConfirm;
    try {
      if (type === 'evento') await eventService.deleteEvento(id);
      else if (type === 'material') await materialService.deleteMaterial(id);
      else if (type === 'recado') await muralService.deleteRecado(id);
      setDeleteConfirm(null); await fetchData();
    } catch (error) { console.error('Failed to delete ' + type + ':', error); }
  };



  const handleUpdateAccuracy = async (student: UserProfile, answeredQuestions: number, correctAnswers: number): Promise<void> => {
    const response = await userService.updateProfile({
      email: student.email,
      answeredQuestions,
      correctAnswers
    });
    if (response.success) {
      setStudents(prev => prev.map(s => s.id === student.id ? { ...s, answeredQuestions, correctAnswers } : s));
    } else {
      throw new Error('Falha ao atualizar precisao');
    }
  };

  const handleDeleteStudent = async (student: UserProfile): Promise<void> => {
    const response = await userService.deleteProfile(student.email);
    if (response.success) { setStudents(prev => prev.filter(s => s.id !== student.id)); }
    else { throw new Error('Falha ao excluir perfil'); }
  };

  if (user.role !== 'admin') {
    return (
      <div className="h-[100dvh] w-screen flex items-center justify-center bg-bg-main text-text-main pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="text-center">
          <ShieldCheck size={64} className="mx-auto mb-6 text-red-500" />
          <h1 className="text-3xl font-black mb-2">Acesso Restrito</h1>
          <p className="text-text-secondary mb-8">Esta área é exclusiva para administradores.</p>
          <button onClick={() => { localStorage.removeItem('neva_student_session'); onLogout(); }}
            className="bg-brand-primary px-8 py-4 rounded-2xl font-bold text-white">Sair do sistema</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-bg-main text-text-secondary font-sans overflow-hidden transition-colors duration-300 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <AdminHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        onLogout={() => { localStorage.removeItem('neva_student_session'); onLogout(); }}
        isDarkMode={isDarkMode}
        onToggleDarkMode={onToggleDarkMode}
        onUpdateUser={onUpdateUser}
        materialsCount={materials.length}
        recadosCount={recados.length}
        eventosCount={eventos.length}
      />

      <main className="min-h-screen bg-bg-main relative transition-colors duration-300 pt-20 sm:pt-24 pb-12">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full min-w-0">
          {activeTab === 'panorama' && (
            <AdminPanorama
              materials={materials} recados={recados} eventos={eventos} students={students}
              onNavigateToAlunos={() => setActiveTab('alunos')}
              onOpenModal={setShowModal}
              onSetSearchTerm={setSearchTerm}
            />
          )}
          {activeTab === 'eventos' && <AdminEventos eventos={eventos} onEdit={handleEditEvent} onDelete={handleDeleteEvent} onAdd={() => setShowModal('evento')} />}
          {activeTab === 'materiais' && <AdminMateriais materials={materials} onEdit={handleEditMaterial} onDelete={handleDeleteMaterial} onAdd={() => setShowModal('material')} />}
          {activeTab === 'mural' && <AdminMural recados={recados} onEdit={handleEditMural} onDelete={handleDeleteRecado} onAdd={() => setShowModal('recado')} />}
          {activeTab === 'alunos' && (
            <AdminAlunos
              students={students} filteredStudents={filteredStudents}
              searchTerm={searchTerm} onSearchChange={setSearchTerm}
              filterCity={filterCity} onFilterCityChange={setFilterCity}
              filterSchool={filterSchool} onFilterSchoolChange={setFilterSchool}
              filterGremio={filterGremio} onFilterGremioChange={setFilterGremio}
              filterType={filterType} onFilterTypeChange={setFilterType}
              cidadeOptions={citiesMA} escolaOptions={schoolsMA} gremioOptions={gremiosMA}
              onUpdateAccuracy={handleUpdateAccuracy} onDeleteStudent={handleDeleteStudent}
            />
          )}
        </div>
      </main>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100]">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={handleCloseModal} className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-default" />
            <motion.div initial={{ opacity: 0, scale: 0.98, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 20 }} transition={{ type: 'spring', duration: 0.4 }}
              className="absolute inset-4 md:inset-auto md:top-[8vh] md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg max-h-[85vh] overflow-y-auto bg-bg-sidebar border border-border-color rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-border-color">
                <h3 className="text-base font-black text-text-main">
                  {showModal === 'evento' ? (editingId ? 'Editar Evento' : 'Novo Evento') :
                   showModal === 'material' ? (editingId ? 'Editar Material' : 'Novo Material') :
                   (editingId ? 'Editar Recado' : 'Novo Recado')}
                </h3>
                <button onClick={handleCloseModal}
                  className="p-2 bg-text-main/5 hover:bg-text-main/10 border border-border-color rounded-xl text-text-secondary hover:text-text-main transition-all cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              {showModal === 'evento' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Título do evento</label>
                    <input value={eventForm.title} onChange={(e) => setEventForm({...eventForm, title: e.target.value})}
                      className="w-full bg-bg-main/50 border border-border-color rounded-xl px-4 py-2.5 text-text-main font-bold text-xs focus:outline-none focus:border-text-main/30 transition-all font-sans" placeholder="Ex: Aulão de Matemática" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Data de liberação</label>
                    <input type="datetime-local" value={eventForm.releaseDate}
                      onChange={(e) => setEventForm({...eventForm, releaseDate: e.target.value})}
                      className="w-full bg-bg-main/50 border border-border-color rounded-xl px-4 py-2.5 text-text-main font-bold text-xs focus:outline-none focus:border-text-main/30 transition-all [color-scheme:dark]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">XP de Participação</label>
                    <input type="number" value={eventForm.xpReward}
                      onChange={(e) => setEventForm({...eventForm, xpReward: e.target.value})}
                      className="w-full bg-bg-main/50 border border-border-color rounded-xl px-4 py-2.5 text-text-main font-bold text-xs focus:outline-none focus:border-text-main/30 transition-all font-sans" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Categoria</label>
                    <div className="relative">
                      <select value={eventForm.category} onChange={(e) => setEventForm({...eventForm, category: e.target.value})}
                        className="w-full bg-bg-main/50 border border-border-color rounded-xl px-4 py-2.5 text-text-main font-bold text-xs focus:outline-none focus:border-text-main/30 transition-all appearance-none">
                        <option value="Evento">Evento</option><option value="Aulão">Aulão</option>
                        <option value="Simulado">Simulado</option><option value="Entrega">Entrega</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50"><ArrowRight className="rotate-90" size={14} /></div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Observação</label>
                    <textarea value={eventForm.observation} onChange={(e) => setEventForm({...eventForm, observation: e.target.value})}
                      rows={3} className="w-full bg-bg-main/50 border border-border-color rounded-xl px-4 py-2.5 text-text-main font-bold text-xs focus:outline-none focus:border-text-main/30 transition-all resize-none"
                      placeholder="Ex: Liberar somente para os alunos do 3º ano" />
                  </div>
                  <div className="flex gap-3 pt-3">
                    <button onClick={handleSaveEvent} disabled={isLoading}
                      className="flex-1 bg-brand-primary text-white hover:opacity-90 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm shadow-brand-primary/20">
                      {isLoading ? <Spinner size={14} className="text-white" /> : isSuccess ? <CheckCircle2 size={14} /> : null}
                      {isSuccess ? (editingId ? 'Evento Atualizado' : 'Evento Salvo') : (editingId ? 'Atualizar evento' : 'Salvar evento')}
                    </button>
                    <button onClick={() => setEventForm({ title: '', releaseDate: '', xpReward: '20', category: 'Evento', observation: '' })}
                      className="bg-text-main/5 hover:bg-text-main/10 text-text-secondary px-6 py-3 rounded-xl font-bold text-xs transition-all border border-border-color cursor-pointer">Limpar</button>
                  </div>
                </div>
              )}

              {showModal === 'recado' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Título</label>
                    <input value={muralForm.title} onChange={(e) => setMuralForm({...muralForm, title: e.target.value})}
                      className="w-full bg-bg-main/50 border border-border-color rounded-xl px-4 py-2.5 text-text-main font-bold text-xs focus:outline-none focus:border-text-main/30 transition-all font-sans" placeholder="Ex: Simulado aberto para inscrição" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Categoria</label>
                    <div className="relative">
                      <select value={muralForm.category} onChange={(e) => setMuralForm({...muralForm, category: e.target.value})}
                        className="w-full bg-bg-main/50 border border-border-color rounded-xl px-4 py-2.5 text-text-main font-bold text-xs focus:outline-none focus:border-text-main/30 transition-all appearance-none">
                        <option value="importante">Aviso oficial</option><option value="estudos">Estudos</option><option value="apoio">Apoio</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50"><ArrowRight className="rotate-90" size={14} /></div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Etiqueta</label>
                    <input value={muralForm.tag} onChange={(e) => setMuralForm({...muralForm, tag: e.target.value})}
                      className="w-full bg-bg-main/50 border border-border-color rounded-xl px-4 py-2.5 text-text-main font-bold text-xs focus:outline-none focus:border-text-main/30 transition-all font-sans" placeholder="Ex: Aviso, Prazo, Destaque" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Texto</label>
                    <textarea value={muralForm.content} onChange={(e) => setMuralForm({...muralForm, content: e.target.value})}
                      rows={3} className="w-full bg-bg-main/50 border border-border-color rounded-xl px-4 py-2.5 text-text-main font-bold text-xs focus:outline-none focus:border-text-main/30 transition-all resize-none"
                      placeholder="Escreva o comunicado de forma curta, clara e objetiva." />
                  </div>
                  <div className="flex gap-3 pt-3">
                    <button onClick={handleSaveMural} disabled={isLoading}
                      className="flex-1 bg-brand-primary text-white hover:opacity-90 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm shadow-brand-primary/20">
                      {isLoading ? <Spinner size={14} className="text-white" /> : isSuccess ? <CheckCircle2 size={14} /> : null}
                      {isSuccess ? (editingId ? 'Recado Atualizado' : 'Recado Salvo') : (editingId ? 'Atualizar recado' : 'Salvar recado')}
                    </button>
                    <button onClick={() => setMuralForm({ title: '', category: 'importante', tag: '', content: '' })}
                      className="bg-text-main/5 hover:bg-text-main/10 text-text-secondary px-6 py-3 rounded-xl font-bold text-xs transition-all border border-border-color cursor-pointer">Limpar</button>
                  </div>
                </div>
              )}

              {showModal === 'material' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Título</label>
                    <input value={materialForm.title} onChange={(e) => setMaterialForm({...materialForm, title: e.target.value})}
                      className="w-full bg-bg-main/50 border border-border-color rounded-xl px-4 py-2.5 text-text-main font-bold text-xs focus:outline-none focus:border-text-main/30 transition-all" placeholder="Ex: Lista de revisão" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Tipo</label>
                    <div className="relative">
                      <select value={materialForm.type} onChange={(e) => setMaterialForm({...materialForm, type: e.target.value})}
                        className="w-full bg-bg-main/50 border border-border-color rounded-xl px-4 py-2.5 text-text-main font-bold text-xs focus:outline-none focus:border-text-main/30 transition-all appearance-none">
                        <option value="pdf">PDF</option><option value="video">VÍDEO</option><option value="link">LINK EXTERNO</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50"><ArrowRight className="rotate-90" size={14} /></div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Foco</label>
                    <div className="relative">
                      <select value={materialForm.foco} onChange={(e) => setMaterialForm({...materialForm, foco: e.target.value})}
                        className="w-full bg-bg-main/50 border border-border-color rounded-xl px-4 py-2.5 text-text-main font-bold text-xs focus:outline-none focus:border-text-main/30 transition-all appearance-none">
                        <option value="Turmas Gerais">Turmas Gerais</option><option value="Medicina">Medicina</option>
                        <option value="Exatas">Exatas</option><option value="Humanas">Humanas</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50"><ArrowRight className="rotate-90" size={14} /></div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Link / arquivo</label>
                    <input value={materialForm.url} onChange={(e) => setMaterialForm({...materialForm, url: e.target.value})}
                      className="w-full bg-bg-main/50 border border-border-color rounded-xl px-4 py-2.5 text-text-main font-bold text-xs focus:outline-none focus:border-text-main/30 transition-all mb-2" placeholder="URL externa" />
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <div className="flex-1 bg-bg-main/50 border border-border-color rounded-xl px-3 py-2 flex items-center gap-3 overflow-hidden w-full">
                        <input type="file" id="file-upload" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                        <label htmlFor="file-upload"
                          className="bg-brand-primary/10 border border-brand-primary/20 text-brand-primary px-3 py-1 rounded-lg text-[10px] font-bold tracking-wide cursor-pointer hover:bg-brand-primary/20 transition-all shrink-0">Escolher arquivo</label>
                        <span className="text-[10px] font-semibold text-text-secondary truncate opacity-60">{selectedFile ? selectedFile.name : 'Nenhum arquivo escolhido'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">Descrição</label>
                    <textarea value={materialForm.description} onChange={(e) => setMaterialForm({...materialForm, description: e.target.value})}
                      rows={3} className="w-full bg-bg-main/50 border border-border-color rounded-xl px-4 py-2.5 text-text-main font-bold text-xs focus:outline-none focus:border-text-main/30 transition-all resize-none"
                      placeholder="Resumo do conteúdo e instruções de uso." />
                  </div>
                  <div className="flex gap-3 pt-3">
                    <button onClick={handleSaveMaterial} disabled={isLoading}
                      className="flex-1 bg-brand-primary text-white hover:opacity-90 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm shadow-brand-primary/20">
                      {isLoading ? <Spinner size={14} className="text-white" /> : isSuccess ? <CheckCircle2 size={14} /> : null}
                      {isSuccess ? (editingId ? 'Material Atualizado' : 'Material Salvo') : (editingId ? 'Atualizar Material' : 'Salvar Material')}
                    </button>
                    <button onClick={() => { setMaterialForm({ title: '', type: 'pdf', foco: 'ENEM geral', url: '', description: '' }); setSelectedFile(null); }}
                      className="bg-text-main/5 hover:bg-text-main/10 text-text-secondary px-6 py-3 rounded-xl font-bold text-xs transition-all border border-border-color cursor-pointer">Limpar</button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[110]">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)} className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-default" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-bg-sidebar border border-border-color rounded-2xl p-6 shadow-2xl">
              <div className="text-center">
                <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-3"><Trash2 size={20} className="text-red-400" /></div>
                <h3 className="text-base font-black text-text-main mb-1">
                  Excluir {deleteConfirm.type === 'evento' ? 'evento' : deleteConfirm.type === 'material' ? 'material' : 'recado'}
                </h3>
                <p className="text-xs text-text-secondary font-medium mb-5 opacity-80">
                  Tem certeza que deseja excluir <strong className="text-text-main font-bold">{deleteConfirm.title}</strong>? Esta ação não pode ser desfeita.
                </p>
                <div className="flex gap-2.5">
                  <button onClick={() => setDeleteConfirm(null)}
                    className="flex-1 bg-text-main/5 hover:bg-text-main/10 text-text-main py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer border border-border-color">Cancelar</button>
                  <button onClick={handleConfirmDelete} disabled={isLoading}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm">
                    {isLoading ? <Spinner size={14} className="text-white" /> : <Trash2 size={14} />}
                    Excluir</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
