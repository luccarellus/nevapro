import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, X, CheckCircle2, Trash2, ChevronRight, TrendingUp,
  ShieldAlert, Crown, UserCircle, Send, Clock, Trophy, Building2
} from 'lucide-react';
import Spinner from '../Spinner';
import { UserProfile } from '../../types';
import { calculateLevelAndProgression } from '../../utils/xpUtils';
import { getStudentRankInfo } from './AdminUtils';

interface AdminAlunosProps {
  students: UserProfile[];
  filteredStudents: UserProfile[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filterCity: string;
  onFilterCityChange: (city: string) => void;
  filterSchool: string;
  onFilterSchoolChange: (school: string) => void;
  filterGremio: string;
  onFilterGremioChange: (gremio: string) => void;
  filterType: 'all' | 'top10' | 'new' | 'inactive';
  onFilterTypeChange: (type: 'all' | 'top10' | 'new' | 'inactive') => void;
  cidadeOptions: string[];
  escolaOptions: string[];
  gremioOptions: string[];
  onUpdateAccuracy: (student: UserProfile, answeredQuestions: number, correctAnswers: number) => Promise<void>;
  onDeleteStudent: (student: UserProfile) => Promise<void>;
}

export default function AdminAlunos({
  students,
  filteredStudents,
  searchTerm,
  onSearchChange,
  filterCity,
  onFilterCityChange,
  filterSchool,
  onFilterSchoolChange,
  filterGremio,
  onFilterGremioChange,
  filterType,
  onFilterTypeChange,
  cidadeOptions,
  escolaOptions,
  gremioOptions,
  onUpdateAccuracy,
  onDeleteStudent,
}: AdminAlunosProps) {
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [answeredQuestionsInput, setAnsweredQuestionsInput] = useState('');
  const [correctAnswersInput, setCorrectAnswersInput] = useState('');
  const [isUpdatingAccuracy, setIsUpdatingAccuracy] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [drawerAlert, setDrawerAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Find selected student in updated students list
  const currentSelectedStudent = useMemo(() => {
    if (!selectedStudent) return null;
    return students.find(s => s.id === selectedStudent.id) || selectedStudent;
  }, [students, selectedStudent]);

  const studentStats = useMemo(() => {
    const totalXp = students.reduce((sum, student) => sum + (student.xp || 0), 0);
    const averageXp = students.length ? Math.round(totalXp / students.length) : 0;

    const getLeader = (field: 'city' | 'school') => {
      const map = new Map<string, { name: string; xp: number }>();
      students.forEach((student) => {
        const name = student[field]?.trim();
        if (!name) return;
        const current = map.get(name) || { name, xp: 0 };
        current.xp += student.xp || 0;
        map.set(name, current);
      });
      return [...map.values()].sort((a, b) => b.xp - a.xp)[0] || { name: '-', xp: 0 };
    };

    return {
      activeStudents: students.length,
      averageXp,
      cityLeader: getLeader('city'),
      schoolLeader: getLeader('school')
    };
  }, [students]);

  const openStudentDrawer = (student: UserProfile) => {
    setSelectedStudent(student);
    setAnsweredQuestionsInput(String(student.answeredQuestions || 0));
    setCorrectAnswersInput(String(student.correctAnswers || 0));
    setDrawerAlert(null);
    setShowDeleteConfirm(false);
  };

  const handleUpdateAccuracy = async () => {
    if (!currentSelectedStudent) return;

    const answeredQuestions = Math.max(0, Math.floor(Number(answeredQuestionsInput)));
    const correctAnswers = Math.max(0, Math.floor(Number(correctAnswersInput)));

    if (!Number.isFinite(answeredQuestions) || !Number.isFinite(correctAnswers)) {
      setDrawerAlert({ type: 'error', message: 'Informe apenas numeros validos.' });
      return;
    }

    if (correctAnswers > answeredQuestions) {
      setDrawerAlert({ type: 'error', message: 'Acertos nao podem ser maiores que respondidas.' });
      return;
    }

    setIsUpdatingAccuracy(true);
    setDrawerAlert(null);
    try {
      await onUpdateAccuracy(currentSelectedStudent, answeredQuestions, correctAnswers);
      setDrawerAlert({ type: 'success', message: 'Precisao atualizada com sucesso!' });
    } catch (error: any) {
      setDrawerAlert({ type: 'error', message: error.message || 'Erro ao atualizar precisao' });
    } finally {
      setIsUpdatingAccuracy(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!currentSelectedStudent) return;
    setIsDeleting(true);
    setDrawerAlert(null);
    try {
      await onDeleteStudent(currentSelectedStudent);
      setSelectedStudent(null);
      setShowDeleteConfirm(false);
    } catch (error: any) {
      setDrawerAlert({ type: 'error', message: error.message || 'Erro ao excluir aluno' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="bg-bg-card border border-border-color rounded-2xl md:rounded-3xl p-5 sm:p-6 lg:p-8 shadow-sm relative overflow-hidden">
          {/* Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
            <div className="flex-1">
              <h3 className="text-xl font-black text-text-main tracking-tight">Estudantes Ativos</h3>
              <p className="text-xs text-text-secondary font-medium mt-0.5">Gestão da rede de alunos vinculados ao projeto.</p>
            </div>
            <div className="flex flex-col md:flex-row items-center gap-4 w-full lg:w-auto">
              {/* Search */}
              <div className="relative w-full md:w-72 shrink-0">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary opacity-40">
                  <Users size={16} />
                </div>
                <input
                  id="searchTerm"
                  title="Buscar aluno"
                  value={searchTerm}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="w-full bg-bg-main/50 border border-border-color rounded-xl pl-11 pr-4 py-2.5 text-xs font-bold text-text-main placeholder:opacity-40 focus:outline-none focus:border-text-main/30 transition-all font-sans"
                  placeholder="Buscar por nome ou email..."
                />
              </div>
              {/* Quick Filters */}
              <div className="flex flex-wrap items-center gap-2 text-xs w-full md:w-auto">
                <span className="text-text-secondary font-semibold mr-1 opacity-60">Ver:</span>
                {(['all', 'top10', 'new', 'inactive'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => onFilterTypeChange(type)}
                    className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer text-xs font-bold ${
                      filterType === type
                        ? 'bg-brand-primary text-white border-brand-primary shadow-xs shadow-brand-primary/30'
                        : 'bg-bg-card text-text-secondary border-border-color hover:text-text-main hover:bg-bg-sidebar'
                    }`}
                  >
                    {type === 'all' ? 'Todos' : type === 'top10' ? 'Os 10+' : type === 'new' ? 'Novos' : 'Inativos'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            {[
              {
                label: 'ALUNOS ATIVOS',
                value: studentStats.activeStudents.toLocaleString('pt-BR'),
                detail: 'Total cadastrados',
                icon: Users,
              },
              {
                label: 'MÉDIA DE XP',
                value: `${studentStats.averageXp.toLocaleString('pt-BR')} XP`,
                detail: 'Por estudante',
                icon: Trophy,
              },
              {
                label: 'CIDADE LÍDER',
                value: studentStats.cityLeader.name,
                detail: `${studentStats.cityLeader.xp.toLocaleString('pt-BR')} XP`,
                icon: TrendingUp,
              },
              {
                label: 'ESCOLA CAMPEÃ',
                value: studentStats.schoolLeader.name,
                detail: `${studentStats.schoolLeader.xp.toLocaleString('pt-BR')} XP`,
                icon: Building2,
              }
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="flex items-center gap-3.5 min-w-0 bg-bg-main/30 border border-border-color rounded-xl p-3.5">
                  <div className="w-10 h-10 rounded-lg border border-brand-primary/20 bg-brand-primary/10 flex items-center justify-center shrink-0 text-brand-primary">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60">{stat.label}</div>
                    <div className="text-sm font-black text-text-main truncate">{stat.value}</div>
                    <div className="text-[9px] font-semibold text-text-secondary opacity-70">{stat.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Filters Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="relative">
              <label className="block text-[10px] font-black text-text-secondary tracking-wider opacity-40 mb-3">Cidades</label>
              <select
                title="Filtrar por cidade"
                value={filterCity}
                onChange={(e) => { onFilterCityChange(e.target.value); onFilterSchoolChange(''); }}
                className="w-full bg-transparent border-0 border-b border-border-color px-0 py-2.5 text-sm font-black text-text-main focus:outline-none focus:border-brand-primary/50 transition-all appearance-none pr-10"
              >
                <option value="">Todas as cidades</option>
                {cidadeOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronRight size={12} className="absolute right-1 bottom-4 rotate-90 pointer-events-none opacity-30" />
            </div>
            <div className="relative">
              <label className="block text-[10px] font-black text-text-secondary tracking-wider opacity-40 mb-3">Escolas</label>
              <select
                title="Filtrar por escola"
                value={filterSchool}
                onChange={(e) => onFilterSchoolChange(e.target.value)}
                className="w-full bg-transparent border-0 border-b border-border-color px-0 py-2.5 text-sm font-black text-text-main focus:outline-none focus:border-brand-primary/50 transition-all appearance-none pr-10"
              >
                <option value="">Todas as escolas</option>
                {escolaOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronRight size={12} className="absolute right-1 bottom-4 rotate-90 pointer-events-none opacity-30" />
            </div>
            <div className="relative">
              <label className="block text-[10px] font-black text-text-secondary tracking-wider opacity-40 mb-3">Gremios</label>
              <select
                title="Filtrar por grêmio"
                value={filterGremio}
                onChange={(e) => onFilterGremioChange(e.target.value)}
                className="w-full bg-transparent border-0 border-b border-border-color px-0 py-2.5 text-sm font-black text-text-main focus:outline-none focus:border-brand-primary/50 transition-all appearance-none pr-10"
              >
                <option value="">Todos os grêmios</option>
                {gremioOptions.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <ChevronRight size={12} className="absolute right-1 bottom-4 rotate-90 pointer-events-none opacity-30" />
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border-color">
                  <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 pl-4 w-[25%]">Aluno</th>
                  <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 w-[20%]">Rank / Categoria</th>
                  <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 w-[15%]">Localização</th>
                  <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 w-[20%]">Escola / Grêmio</th>
                  <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 w-[15%]">Progresso</th>
                  <th className="pb-6 text-[10px] font-black text-text-secondary tracking-wider opacity-40 text-right pr-4 w-[5%]">Nível</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color/50">
                {filteredStudents.map((student) => {
                  const rankInfo = getStudentRankInfo(student.level || calculateLevelAndProgression(student.xp || 0).level);
                  const levelInfo = calculateLevelAndProgression(student.xp || 0);
                  const progress = Math.max(0, Math.min(100, Math.round(((student.xp || 0) - levelInfo.currentLevelMinXp) / (levelInfo.nextLevelXp - levelInfo.currentLevelMinXp) * 100)));
                  return (
                    <tr
                      key={student.id}
                      onClick={() => openStudentDrawer(student)}
                      className={`group hover:bg-text-main/[0.04] transition-colors relative cursor-pointer ${
                        selectedStudent?.id === student.id ? 'bg-brand-primary/[0.03]' : ''
                      }`}
                    >
                      <td className="py-4 pl-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg overflow-hidden bg-text-main/5 border border-border-color flex items-center justify-center text-text-main font-bold text-xs shrink-0">
                            {student.avatarUrl || student.avatar ? (
                              <img src={student.avatarUrl || student.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              student.name?.charAt(0) || '?'
                            )}
                          </div>
                          <div>
                            <div className="text-text-main font-bold text-sm">{student.name}</div>
                            <div className="text-text-secondary text-[11px] font-medium opacity-60">{student.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <span className={`inline-block w-fit px-2 py-0.5 text-[9px] font-semibold rounded uppercase tracking-wider ${rankInfo.classes}`}>
                          {rankInfo.label}
                        </span>
                      </td>
                      <td className="py-4">
                        <div className="text-text-main text-xs font-bold">{student.city || '-'}</div>
                        <div className="text-text-secondary text-[10px] font-medium opacity-50">MA</div>
                      </td>
                      <td className="py-4">
                        <div className="text-text-main text-xs font-bold truncate max-w-[200px]">{student.school || '-'}</div>
                        <div className="text-text-secondary text-[11px] font-medium opacity-60 truncate max-w-[200px]">{student.gremio || 'Sem grêmio'}</div>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-bg-main border border-border-color/50 rounded-full overflow-hidden max-w-[100px]">
                            <div className="h-full bg-text-main/40 rounded-full transition-all" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-[10px] font-semibold text-text-secondary opacity-60">{(student.xp || 0).toLocaleString('pt-BR')} XP</span>
                        </div>
                      </td>
                      <td className="py-4 text-right pr-3">
                        <span className="text-base font-black text-text-main">{levelInfo.level}</span>
                      </td>
                    </tr>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <tr><td colSpan={6} className="py-12 text-center text-xs font-medium text-text-secondary opacity-50">Nenhum aluno encontrado</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {filteredStudents.map((student) => {
              const rankInfo = getStudentRankInfo(student.level || calculateLevelAndProgression(student.xp || 0).level);
              const levelInfo = calculateLevelAndProgression(student.xp || 0);
              return (
                <div
                  key={student.id}
                  onClick={() => openStudentDrawer(student)}
                  className="bg-bg-main/30 border border-border-color rounded-xl p-4 cursor-pointer hover:bg-bg-main/50 transition-all"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-text-main/5 border border-border-color flex items-center justify-center text-text-main font-bold text-xs shrink-0">
                      {student.avatarUrl || student.avatar ? (
                        <img src={student.avatarUrl || student.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        student.name?.charAt(0) || '?'
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-text-main font-bold text-sm truncate">{student.name}</div>
                      <div className="text-text-secondary text-[11px] font-medium truncate opacity-60">{student.email}</div>
                    </div>
                    <span className={`inline-block px-2 py-0.5 text-[9px] font-semibold rounded uppercase tracking-wider ${rankInfo.classes}`}>{rankInfo.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs font-medium">
                    <div><span className="text-text-secondary opacity-50">XP:</span> <span className="text-text-main font-bold">{student.xp || 0}</span></div>
                    <div><span className="text-text-secondary opacity-50">Nível:</span> <span className="text-text-main font-bold">{levelInfo.level}</span></div>
                    <div className="col-span-2"><span className="text-text-secondary opacity-50">Escola:</span> <span className="text-text-main truncate font-bold">{student.school || '-'}</span></div>
                  </div>
                </div>
              );
            })}
            {filteredStudents.length === 0 && (
              <div className="py-12 text-center text-xs font-medium text-text-secondary opacity-50">Nenhum aluno encontrado</div>
            )}
          </div>
        </div>

      {/* Student Detail Drawer */}
      <AnimatePresence>
        {currentSelectedStudent && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStudent(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[80] cursor-default"
            />
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-bg-sidebar border-l border-border-color z-[90] overflow-y-auto shadow-2xl"
            >
              <div className="p-8">
                {/* Close button */}
                <button onClick={() => setSelectedStudent(null)}
                  className="absolute top-6 right-6 p-2.5 bg-text-main/5 hover:bg-text-main/10 border border-border-color rounded-xl text-text-secondary hover:text-text-main transition-all cursor-pointer z-10">
                  <X size={16} />
                </button>

                {/* Student Header */}
                <div className="flex items-center gap-5 mb-8 mt-2">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-text-main/5 border border-border-color flex items-center justify-center text-text-main font-black text-xl shrink-0">
                    {currentSelectedStudent.avatarUrl || currentSelectedStudent.avatar ? (
                      <img src={currentSelectedStudent.avatarUrl || currentSelectedStudent.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      currentSelectedStudent.name?.charAt(0) || '?'
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-black text-text-main truncate">{currentSelectedStudent.name}</h2>
                    <p className="text-xs font-medium text-text-secondary truncate">{currentSelectedStudent.email}</p>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3 mb-8">
                  <div className="bg-bg-main/40 border border-border-color rounded-xl p-3.5">
                    <span className="block text-[10px] font-bold text-text-secondary uppercase opacity-60 mb-1">Nível Atual</span>
                    <span className="block text-2xl font-black text-text-main">{calculateLevelAndProgression(currentSelectedStudent.xp || 0).level}</span>
                  </div>
                  <div className="bg-bg-main/40 border border-border-color rounded-xl p-3.5">
                    <span className="block text-[10px] font-bold text-text-secondary uppercase opacity-60 mb-1">XP Total</span>
                    <span className="block text-2xl font-black text-text-main">{(currentSelectedStudent.xp || 0).toLocaleString()}</span>
                  </div>
                  <div className="bg-bg-main/40 border border-border-color rounded-xl p-3.5">
                    <span className="block text-[10px] font-bold text-text-secondary uppercase opacity-60 mb-1">Respondidas</span>
                    <span className="block text-2xl font-black text-text-main">{currentSelectedStudent.answeredQuestions || 0}</span>
                  </div>
                  <div className="bg-bg-main/40 border border-border-color rounded-xl p-3.5">
                    <span className="block text-[10px] font-bold text-text-secondary uppercase opacity-60 mb-1">Precisão</span>
                    <span className="block text-2xl font-black text-text-main">
                      {currentSelectedStudent.answeredQuestions
                        ? Math.round(((currentSelectedStudent.correctAnswers || 0) / currentSelectedStudent.answeredQuestions) * 100)
                        : 0}
                      <span className="text-xs text-text-secondary ml-1">%</span>
                    </span>
                  </div>
                </div>

                {/* Rank Badge */}
                <div className="mb-8">
                  {(() => {
                    const info = getStudentRankInfo(currentSelectedStudent.level || calculateLevelAndProgression(currentSelectedStudent.xp || 0).level);
                    return (
                      <span className={`inline-block px-3 py-1.5 text-[10px] font-bold rounded-lg uppercase tracking-wider ${info.classes}`}>
                        {info.label}
                      </span>
                    );
                  })()}
                </div>

                {/* Info Cards */}
                <div className="space-y-3 mb-8">
                  <div className="bg-bg-main/30 border border-border-color rounded-xl p-3.5 flex items-center gap-3">
                    <UserCircle size={18} className="text-text-secondary opacity-40 shrink-0" />
                    <div>
                      <span className="block text-[10px] font-bold text-text-secondary opacity-60">Cidade</span>
                      <span className="block text-xs font-bold text-text-main">{currentSelectedStudent.city || 'Não informada'}</span>
                    </div>
                  </div>
                  <div className="bg-bg-main/30 border border-border-color rounded-xl p-3.5 flex items-center gap-3">
                    <TrendingUp size={18} className="text-text-secondary opacity-40 shrink-0" />
                    <div>
                      <span className="block text-[10px] font-bold text-text-secondary opacity-60">Escola</span>
                      <span className="block text-xs font-bold text-text-main">{currentSelectedStudent.school || 'Não informada'}</span>
                    </div>
                  </div>
                  <div className="bg-bg-main/30 border border-border-color rounded-xl p-3.5 flex items-center gap-3">
                    <Crown size={18} className="text-text-secondary opacity-40 shrink-0" />
                    <div>
                      <span className="block text-[10px] font-bold text-text-secondary opacity-60">Grêmio</span>
                      <span className="block text-xs font-bold text-text-main">{currentSelectedStudent.gremio || 'Não informado'}</span>
                    </div>
                  </div>
                  <div className="bg-bg-main/30 border border-border-color rounded-xl p-3.5 flex items-center gap-3">
                    <Clock size={18} className="text-text-secondary opacity-40 shrink-0" />
                    <div>
                      <span className="block text-[10px] font-bold text-text-secondary opacity-60">Última interação</span>
                      <span className="block text-xs font-bold text-text-main">
                        {currentSelectedStudent.updated_at
                          ? new Date(currentSelectedStudent.updated_at).toLocaleDateString('pt-BR')
                          : currentSelectedStudent.created_at
                            ? new Date(currentSelectedStudent.created_at).toLocaleDateString('pt-BR')
                            : 'Nunca'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Accuracy Management */}
                <div className="border-t border-border-color pt-6 mb-6">
                  <h4 className="text-sm font-black text-text-main mb-4">Gerenciar precisão</h4>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-[10px] font-bold text-text-secondary uppercase opacity-60 mb-2">Respondidas</label>
                      <input
                        type="number"
                        min="0"
                        value={answeredQuestionsInput}
                        onChange={(e) => setAnsweredQuestionsInput(e.target.value)}
                        className="w-full bg-bg-main/40 border border-border-color rounded-xl px-4 py-2.5 text-xs font-bold text-text-main focus:outline-none focus:border-text-main/30 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-text-secondary uppercase opacity-60 mb-2">Acertos</label>
                      <input
                        type="number"
                        min="0"
                        value={correctAnswersInput}
                        onChange={(e) => setCorrectAnswersInput(e.target.value)}
                        className="w-full bg-bg-main/40 border border-border-color rounded-xl px-4 py-2.5 text-xs font-bold text-text-main focus:outline-none focus:border-text-main/30 transition-all"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleUpdateAccuracy}
                    disabled={isUpdatingAccuracy}
                    className="w-full bg-brand-primary text-white hover:opacity-90 py-3 rounded-xl font-bold text-xs transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shadow-sm shadow-brand-primary/20"
                  >
                    {isUpdatingAccuracy ? <Spinner size={14} /> : <CheckCircle2 size={14} />}
                    Salvar precisão
                  </button>
                </div>

                {/* Alert */}
                {drawerAlert && (
                  <div className={`mb-6 px-4 py-3 rounded-xl flex items-center gap-2 text-[10px] font-black tracking-wider ${
                    drawerAlert.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {drawerAlert.type === 'success' ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}
                    {drawerAlert.message}
                  </div>
                )}

                {/* Delete Section */}
                <div className="border-t border-border-color pt-6">
                  {!showDeleteConfirm ? (
                    <button onClick={() => setShowDeleteConfirm(true)}
                      className="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 py-4 rounded-xl font-black text-[10px] tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer">
                      <Trash2 size={14} />
                      Excluir aluno
                    </button>
                  ) : (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
                      <p className="text-[10px] font-black text-red-400 mb-4">Tem certeza que deseja excluir este aluno? Esta ação não pode ser desfeita.</p>
                      <div className="flex gap-3">
                        <button onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 bg-text-main/10 text-text-main py-3 rounded-xl font-black text-[10px] tracking-wider transition-all cursor-pointer">
                          Cancelar
                        </button>
                        <button onClick={handleDeleteStudent}
                          disabled={isDeleting}
                          className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-black text-[10px] tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
                          {isDeleting ? <Spinner size={14} className="text-white" /> : <Trash2 size={14} />}
                          Confirmar exclusão
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
