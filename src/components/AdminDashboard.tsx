import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, CheckCircle2, ShieldCheck, X, ChevronDown } from 'lucide-react';
import Spinner from './Spinner';
import { materialService } from '../services/materialService';
import { muralService } from '../services/muralService';
import { eventService } from '../services/eventService';
import { adminService } from '../services/adminService';
import { userService } from '../services/userService';
import { uploadService } from '../services/uploadService';
import { Material, Notice, StudyEvent, UserProfile } from '../types';
import cidadesEscolasData from '../data/cidades_escolas.json';
import { normalizeString, getCanonicalSchoolMap, getUniqueNormalized } from './admin/AdminUtils';
import AdminHeader, { AdminTab } from './admin/AdminHeader';
import AdminPanorama from './admin/AdminPanorama';
import AdminEventos from './admin/AdminEventos';
import AdminMateriais from './admin/AdminMateriais';
import AdminMural from './admin/AdminMural';
import AdminAlunos from './admin/AdminAlunos';
import AdminTenants from './admin/AdminTenants';
import Settings from './Settings';

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

const EMPTY_EVENT = { title: '', releaseDate: '', xpReward: '20', category: 'Evento', observation: '' };
const EMPTY_MATERIAL = { title: '', type: 'pdf', foco: 'Turmas Gerais', url: '', description: '' };
const EMPTY_MURAL = { title: '', category: 'importante', tag: '', content: '' };

const inputCls =
  'w-full bg-bg-main/50 border border-border-color rounded-lg px-3.5 py-2.5 text-sm text-text-main ' +
  'placeholder:text-text-secondary/50 focus:outline-none focus:border-brand-primary/60 transition-colors';

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-text-secondary">
        {label}
      </label>
      {children}
    </div>
  );
}

function SelectField({
  label, id, value, onChange, options,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="relative">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="select-pill w-full">
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="select-pill-chevron opacity-50"><ChevronDown size={14} /></div>
      </div>
    </Field>
  );
}

function ModalActions({
  onSave, onClear, isLoading, isSuccess, idleLabel, successLabel,
}: {
  onSave: () => void;
  onClear: () => void;
  isLoading: boolean;
  isSuccess: boolean;
  idleLabel: string;
  successLabel: string;
}) {
  return (
    <div className="flex gap-3 pt-2">
      <button
        onClick={onSave}
        disabled={isLoading}
        className="flex-1 bg-brand-primary text-white hover:opacity-90 py-2.5 rounded-lg font-medium text-sm transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
      >
        {isLoading ? <Spinner size={14} className="text-white" /> : isSuccess ? <CheckCircle2 size={14} /> : null}
        {isSuccess ? successLabel : idleLabel}
      </button>
      <button
        onClick={onClear}
        className="px-5 py-2.5 rounded-lg font-medium text-sm text-text-secondary hover:text-text-main hover:bg-text-main/5 transition-colors cursor-pointer"
      >
        Limpar
      </button>
    </div>
  );
}

export default function AdminDashboard({
  user,
  onLogout,
  onUpdateUser,
  isDarkMode,
  onToggleDarkMode
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('panorama');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [recados, setRecados] = useState<Notice[]>([]);
  const [eventos, setEventos] = useState<StudyEvent[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [filterGremio, setFilterGremio] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'top10' | 'new' | 'inactive'>('all');

  const [showModal, setShowModal] = useState<'material' | 'recado' | 'evento' | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; type: 'evento' | 'material' | 'recado'; title: string } | null>(null);

  const [eventForm, setEventForm] = useState(EMPTY_EVENT);
  const [materialForm, setMaterialForm] = useState(EMPTY_MATERIAL);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [muralForm, setMuralForm] = useState(EMPTY_MURAL);

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
    setEventForm(EMPTY_EVENT);
    setMaterialForm(EMPTY_MATERIAL);
    setSelectedFile(null);
    setMuralForm(EMPTY_MURAL);
  };

  useEffect(() => {
    if (!showModal && !deleteConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deleteConfirm) setDeleteConfirm(null);
      else handleCloseModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showModal, deleteConfirm]);

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
    setMaterialForm({ title: mat.title, type: mat.type, foco: mat.subject || 'Turmas Gerais', url: mat.url || '', description: mat.description || '' });
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

  const askDelete = (type: 'evento' | 'material' | 'recado', id: string, fallback: string, title?: string) =>
    setDeleteConfirm({ id, type, title: title || fallback });

  const handleDeleteEvent = (id: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    askDelete('evento', id, 'este evento', eventos.find(evt => evt.id === id)?.title);
  };
  const handleDeleteMaterial = (id: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    askDelete('material', id, 'este material', materials.find(mat => mat.id === id)?.title);
  };
  const handleDeleteRecado = (id: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    askDelete('recado', id, 'este recado', recados.find(rec => rec.id === id)?.title);
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

  const hasAdminAccess =
    user.isAdmin ||
    user.role === 'admin' ||
    user.roles?.some((r) => ['super_admin', 'tenant_admin', 'teacher'].includes(r));

  if (!hasAdminAccess) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-bg-main text-text-main pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="text-center">
          <ShieldCheck size={48} className="mx-auto mb-5 text-red-500" />
          <h1 className="text-2xl font-semibold mb-2">Acesso restrito</h1>
          <p className="text-text-secondary mb-8">Esta área é exclusiva para administradores e professores.</p>
          <button onClick={() => { localStorage.removeItem('neva_student_session'); onLogout(); }}
            className="bg-brand-primary px-6 py-3 rounded-lg font-medium text-white cursor-pointer">Sair do sistema</button>
        </div>
      </div>
    );
  }

  const modalTitles = {
    evento: editingId ? 'Editar evento' : 'Novo evento',
    material: editingId ? 'Editar material' : 'Novo material',
    recado: editingId ? 'Editar recado' : 'Novo recado',
  } as const;

  return (
    <div className="min-h-[100dvh] bg-bg-main text-text-secondary font-sans transition-colors duration-300 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <AdminHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        onLogout={() => { localStorage.removeItem('neva_student_session'); onLogout(); }}
        isDarkMode={isDarkMode}
        onToggleDarkMode={onToggleDarkMode}
        onUpdateUser={onUpdateUser}
        onOpenSettings={() => setShowSettingsModal(true)}
        materialsCount={materials.length}
        recadosCount={recados.length}
        eventosCount={eventos.length}
      />

      <main className="min-h-screen bg-bg-main relative transition-colors duration-300 pt-20 sm:pt-24 pb-12">
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-6xl mx-auto w-full min-w-0">
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
          {activeTab === 'tenants' && (
            <AdminTenants
              currentUser={user}
              activeTenantId={user.tenantId}
            />
          )}
        </div>
      </main>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100]">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={handleCloseModal} className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-default" />
            <motion.div
              role="dialog" aria-modal="true" aria-label={modalTitles[showModal]}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-4 md:inset-auto md:top-[8vh] md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg max-h-[85vh] overflow-y-auto bg-bg-sidebar border border-border-color rounded-2xl p-6 md:p-7">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-semibold text-text-main">{modalTitles[showModal]}</h3>
                <button onClick={handleCloseModal} aria-label="Fechar"
                  className="p-1.5 rounded-lg text-text-secondary hover:text-text-main hover:bg-text-main/5 transition-colors cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              {showModal === 'evento' && (
                <div className="space-y-4">
                  <Field label="Título" htmlFor="evt-title">
                    <input id="evt-title" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                      className={inputCls} placeholder="Aulão de matemática" />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Data de liberação" htmlFor="evt-date">
                      <input id="evt-date" type="datetime-local" value={eventForm.releaseDate}
                        onChange={(e) => setEventForm({ ...eventForm, releaseDate: e.target.value })}
                        className={`${inputCls} [color-scheme:dark]`} />
                    </Field>
                    <Field label="XP de participação" htmlFor="evt-xp">
                      <input id="evt-xp" type="number" min={0} value={eventForm.xpReward}
                        onChange={(e) => setEventForm({ ...eventForm, xpReward: e.target.value })}
                        className={inputCls} />
                    </Field>
                  </div>
                  <SelectField label="Categoria" id="evt-cat" value={eventForm.category}
                    onChange={(v) => setEventForm({ ...eventForm, category: v })}
                    options={[
                      { value: 'Evento', label: 'Evento' }, { value: 'Aulão', label: 'Aulão' },
                      { value: 'Simulado', label: 'Simulado' }, { value: 'Entrega', label: 'Entrega' },
                    ]} />
                  <Field label="Observação" htmlFor="evt-obs">
                    <textarea id="evt-obs" value={eventForm.observation} rows={3}
                      onChange={(e) => setEventForm({ ...eventForm, observation: e.target.value })}
                      className={`${inputCls} resize-none`} placeholder="Liberar somente para o 3º ano" />
                  </Field>
                  <ModalActions onSave={handleSaveEvent} onClear={() => setEventForm(EMPTY_EVENT)}
                    isLoading={isLoading} isSuccess={isSuccess}
                    idleLabel={editingId ? 'Atualizar evento' : 'Salvar evento'}
                    successLabel={editingId ? 'Evento atualizado' : 'Evento salvo'} />
                </div>
              )}

              {showModal === 'recado' && (
                <div className="space-y-4">
                  <Field label="Título" htmlFor="mur-title">
                    <input id="mur-title" value={muralForm.title} onChange={(e) => setMuralForm({ ...muralForm, title: e.target.value })}
                      className={inputCls} placeholder="Simulado aberto para inscrição" />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SelectField label="Categoria" id="mur-cat" value={muralForm.category}
                      onChange={(v) => setMuralForm({ ...muralForm, category: v })}
                      options={[
                        { value: 'importante', label: 'Aviso oficial' },
                        { value: 'estudos', label: 'Estudos' },
                        { value: 'apoio', label: 'Apoio' },
                      ]} />
                    <Field label="Etiqueta" htmlFor="mur-tag">
                      <input id="mur-tag" value={muralForm.tag} onChange={(e) => setMuralForm({ ...muralForm, tag: e.target.value })}
                        className={inputCls} placeholder="Aviso, prazo, destaque" />
                    </Field>
                  </div>
                  <Field label="Texto" htmlFor="mur-text">
                    <textarea id="mur-text" value={muralForm.content} rows={4}
                      onChange={(e) => setMuralForm({ ...muralForm, content: e.target.value })}
                      className={`${inputCls} resize-none`}
                      placeholder="Escreva o comunicado de forma curta, clara e objetiva." />
                  </Field>
                  <ModalActions onSave={handleSaveMural} onClear={() => setMuralForm(EMPTY_MURAL)}
                    isLoading={isLoading} isSuccess={isSuccess}
                    idleLabel={editingId ? 'Atualizar recado' : 'Salvar recado'}
                    successLabel={editingId ? 'Recado atualizado' : 'Recado salvo'} />
                </div>
              )}

              {showModal === 'material' && (
                <div className="space-y-4">
                  <Field label="Título" htmlFor="mat-title">
                    <input id="mat-title" value={materialForm.title} onChange={(e) => setMaterialForm({ ...materialForm, title: e.target.value })}
                      className={inputCls} placeholder="Lista de revisão" />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SelectField label="Tipo" id="mat-type" value={materialForm.type}
                      onChange={(v) => setMaterialForm({ ...materialForm, type: v })}
                      options={[
                        { value: 'pdf', label: 'PDF' }, { value: 'video', label: 'Vídeo' }, { value: 'link', label: 'Link externo' },
                      ]} />
                    <SelectField label="Foco" id="mat-foco" value={materialForm.foco}
                      onChange={(v) => setMaterialForm({ ...materialForm, foco: v })}
                      options={[
                        { value: 'Turmas Gerais', label: 'Turmas gerais' }, { value: 'Medicina', label: 'Medicina' },
                        { value: 'Exatas', label: 'Exatas' }, { value: 'Humanas', label: 'Humanas' },
                      ]} />
                  </div>
                  <Field label="Link ou arquivo" htmlFor="mat-url">
                    <input id="mat-url" value={materialForm.url} onChange={(e) => setMaterialForm({ ...materialForm, url: e.target.value })}
                      className={inputCls} placeholder="https://" />
                    <div className="flex items-center gap-3 pt-1">
                      <input type="file" id="file-upload" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                      <label htmlFor="file-upload"
                        className="shrink-0 border border-border-color text-text-main px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer hover:bg-text-main/5 transition-colors">
                        Escolher arquivo
                      </label>
                      <span className="text-xs text-text-secondary truncate">
                        {selectedFile ? selectedFile.name : 'Nenhum arquivo escolhido'}
                      </span>
                    </div>
                  </Field>
                  <Field label="Descrição" htmlFor="mat-desc">
                    <textarea id="mat-desc" value={materialForm.description} rows={3}
                      onChange={(e) => setMaterialForm({ ...materialForm, description: e.target.value })}
                      className={`${inputCls} resize-none`}
                      placeholder="Resumo do conteúdo e instruções de uso." />
                  </Field>
                  <ModalActions
                    onSave={handleSaveMaterial}
                    onClear={() => { setMaterialForm(EMPTY_MATERIAL); setSelectedFile(null); }}
                    isLoading={isLoading} isSuccess={isSuccess}
                    idleLabel={editingId ? 'Atualizar material' : 'Salvar material'}
                    successLabel={editingId ? 'Material atualizado' : 'Material salvo'} />
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
            <motion.div role="alertdialog" aria-modal="true"
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-bg-sidebar border border-border-color rounded-2xl p-6">
              <div className="text-center">
                <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Trash2 size={18} className="text-red-400" />
                </div>
                <h3 className="text-base font-semibold text-text-main mb-1">Excluir {deleteConfirm.type}</h3>
                <p className="text-sm text-text-secondary mb-5">
                  Excluir <span className="text-text-main font-medium">{deleteConfirm.title}</span>? Esta ação não pode ser desfeita.
                </p>
                <div className="flex gap-2.5">
                  <button onClick={() => setDeleteConfirm(null)}
                    className="flex-1 text-text-main py-2.5 rounded-lg font-medium text-sm transition-colors cursor-pointer border border-border-color hover:bg-text-main/5">
                    Cancelar
                  </button>
                  <button onClick={handleConfirmDelete} disabled={isLoading}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
                    {isLoading ? <Spinner size={14} className="text-white" /> : <Trash2 size={14} />}
                    Excluir
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-[100] bg-bg-main overflow-y-auto">
            <Settings
              user={user}
              onUpdateUser={onUpdateUser}
              onClose={() => setShowSettingsModal(false)}
              theme={isDarkMode ? 'dark' : 'light'}
              onThemeChange={() => { }}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}