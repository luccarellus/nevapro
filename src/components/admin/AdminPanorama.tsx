import { useMemo } from 'react';
import { ShieldCheck, Trophy, Crown, Library, Users, Megaphone, Calendar } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Material, Notice, StudyEvent, UserProfile } from '../../types';
import { calculateLevelAndProgression } from '../../utils/xpUtils';
import { toTimestamp, formatShortDate, getStudentRankInfo } from './AdminUtils';

interface AdminPanoramaProps {
  materials: Material[];
  recados: Notice[];
  eventos: StudyEvent[];
  students: UserProfile[];
  onNavigateToAlunos: () => void;
  onOpenModal: (modal: 'material' | 'recado' | 'evento') => void;
  onSetSearchTerm: (term: string) => void;
}

export default function AdminPanorama({
  materials,
  recados,
  eventos,
  students,
  onNavigateToAlunos,
  onOpenModal,
  onSetSearchTerm
}: AdminPanoramaProps) {
  const totalXp = useMemo(() => students.reduce((sum, s) => sum + (s.xp || 0), 0), [students]);
  const activeStudentsCount = useMemo(() => students.filter(s => (s.xp || 0) > 0).length, [students]);
  const averageXp = students.length ? Math.round(totalXp / students.length) : 0;

  const schoolRanking = useMemo(() => {
    const schoolMap: Record<string, { name: string; xp: number; city: string; studentsCount: number }> = {};
    students.forEach(s => {
      if (s.school) {
        if (!schoolMap[s.school]) {
          schoolMap[s.school] = { name: s.school, xp: 0, city: s.city || '-', studentsCount: 0 };
        }
        schoolMap[s.school].xp += (s.xp || 0);
        schoolMap[s.school].studentsCount += 1;
      }
    });
    return Object.values(schoolMap).sort((a, b) => b.xp - a.xp);
  }, [students]);

  const topStudents = useMemo(() => {
    return [...students].sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, 6);
  }, [students]);

  const displayRanking = useMemo(() => {
    const sorted = [...students].sort((a, b) => (b.xp || 0) - (a.xp || 0));
    const placeholders = [
      { name: 'Em breve...', xp: 0, level: 0, id: 'p1' },
      { name: 'Em breve...', xp: 0, level: 0, id: 'p2' },
      { name: 'Em breve...', xp: 0, level: 0, id: 'p3' },
    ];
    return sorted.length >= 3 ? sorted : [...sorted, ...placeholders].slice(0, 3);
  }, [students]);

  const recentMaterials = useMemo(
    () => [...materials].sort((a, b) => toTimestamp(b.uploadedAt) - toTimestamp(a.uploadedAt)).slice(0, 2),
    [materials]
  );
  const recentRecados = useMemo(
    () => [...recados].sort((a, b) => toTimestamp(b.date) - toTimestamp(a.date)).slice(0, 2),
    [recados]
  );

  const xpGrantingEvents = useMemo(() => eventos.filter(evt => (evt.xpReward || 0) > 0), [eventos]);
  const xpConfiguredInEvents = useMemo(
    () => xpGrantingEvents.reduce((sum, evt) => sum + (evt.xpReward || 0), 0),
    [xpGrantingEvents]
  );

  const atRiskStudents = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return students.filter(student => {
      const lastInteraction = toTimestamp(student.updated_at || student.created_at);
      return !lastInteraction || lastInteraction < thirtyDaysAgo;
    });
  }, [students]);

  const studentGrowth = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        month: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        students: 0,
      };
    });
    const monthByKey = new Map(months.map(month => [month.key, month]));

    students.forEach(student => {
      if (!student.created_at) return;
      const createdAt = new Date(student.created_at);
      if (Number.isNaN(createdAt.getTime())) return;

      const key = `${createdAt.getFullYear()}-${createdAt.getMonth()}`;
      const month = monthByKey.get(key);
      if (month) month.students += 1;
    });

    return months;
  }, [students]);

  return (
    <>
      {/* Header Title Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-600/20 flex items-center justify-center text-blue-500 shrink-0 shadow-sm">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-text-main tracking-tight leading-none mb-1.5 flex items-center gap-2">Painel BackOffice</h1>
            <p className="text-xs text-text-secondary font-medium">Visao geral de alunos, engajamento e conteudos do projeto.</p>
          </div>
        </div>
        <button
          onClick={onNavigateToAlunos}
          className="bg-bg-card border border-border-color hover:bg-bg-sidebar text-text-main px-6 py-3 rounded-2xl font-bold text-xs shadow-sm flex items-center gap-2 transition-all cursor-pointer"
        >
          <Users size={15} />
          Ver alunos
        </button>
      </div>

      {/* Row 1: Config + Hall da Fama */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
        {/* Config Column */}
        <div className="lg:col-span-5 bg-bg-card border border-border-color rounded-[24px] p-6 shadow-sm flex flex-col justify-between transition-colors duration-300">
          <div>
            <h3 className="text-base font-black text-text-main mb-1.5 font-sans">Configuração do Portal e Recompensas</h3>
            <p className="text-[11px] text-text-secondary font-medium opacity-80 mb-6">Configurações automáticas de XP — não afeta as ações já concluídas</p>
            <div className="flex gap-3 bg-bg-main p-1.5 rounded-xl border border-border-color mb-6">
              <button onClick={() => onOpenModal('material')}
                className="flex-1 bg-bg-card border border-border-color py-2.5 rounded-lg text-xs font-black text-text-main shadow-sm flex items-center justify-center gap-2 hover:bg-bg-main transition-all cursor-pointer">
                <Library size={14} className="text-blue-500" />
                Material / Biblioteca
              </button>
              <button onClick={() => onOpenModal('recado')}
                className="flex-1 bg-brand-primary/10 border border-brand-primary/20 py-2.5 rounded-lg text-xs font-black text-brand-primary flex items-center justify-center gap-2 hover:bg-brand-primary/20 transition-all cursor-pointer">
                <Megaphone size={14} />
                Mural / Avisos
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-border-color bg-bg-main/70 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black text-text-secondary uppercase">Materiais</span>
                  <span className="text-lg font-black text-text-main">{materials.length}</span>
                </div>
                <div className="space-y-1.5">
                  {recentMaterials.length > 0 ? recentMaterials.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-[10px] font-bold">
                      <span className="text-text-main truncate">{item.title}</span>
                      <span className="text-text-secondary shrink-0">{formatShortDate(item.uploadedAt || '')}</span>
                    </div>
                  )) : (
                    <span className="text-[10px] font-bold text-text-secondary">Nenhum material cadastrado</span>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border-color bg-bg-main/70 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black text-text-secondary uppercase">Recados</span>
                  <span className="text-lg font-black text-text-main">{recados.length}</span>
                </div>
                <div className="space-y-1.5">
                  {recentRecados.length > 0 ? recentRecados.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-[10px] font-bold">
                      <span className="text-text-main truncate">{item.title}</span>
                      <span className="text-text-secondary shrink-0">{formatShortDate(item.date)}</span>
                    </div>
                  )) : (
                    <span className="text-[10px] font-bold text-text-secondary">Nenhum recado cadastrado</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-text-secondary leading-relaxed font-semibold opacity-70">
            Conteudos mais recentes do portal e recompensas ficam refletidos aqui automaticamente.
          </p>
        </div>

        {/* Hall da Fama */}
        <div className="lg:col-span-7 bg-bg-card border border-border-color rounded-[24px] p-6 shadow-sm flex flex-col justify-between overflow-y-auto max-h-[480px] transition-colors duration-300">
          <div>
            <div className="flex flex-col items-center mb-6 text-center">
              <div className="w-12 h-12 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded-2xl flex items-center justify-center mb-3 shadow-lg shadow-yellow-500/5 shrink-0">
                <Trophy size={24} className="text-yellow-500" />
              </div>
              <h3 className="text-lg font-black text-text-main leading-none font-sans mb-1">Hall da Fama</h3>
              <p className="text-[10px] text-text-secondary font-bold opacity-60">Os estudantes que mais se engajaram nessa jornada de estudos.</p>
            </div>

            {/* Podium */}
            <div className="flex justify-center items-end gap-3 mb-6 px-4 h-48">
              {/* Rank 2 */}
              <div className="flex-1 flex flex-col items-center h-full justify-end">
                <div className="w-full bg-gradient-to-t from-text-secondary/5 to-text-secondary/20 border border-border-color rounded-t-[16px] relative flex flex-col items-center justify-end pb-3 pt-8 h-[60%]">
                  <div className="absolute top-0 -translate-y-1/2 flex flex-col items-center">
                    <div className="relative">
                      <div className="w-9 h-9 rounded-full bg-bg-main border border-border-color flex items-center justify-center font-black text-text-secondary text-xs shadow-lg">
                        {displayRanking[1]?.name?.charAt(0) || '?'}
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-text-secondary text-white font-extrabold text-[9px] flex items-center justify-center border border-bg-card">2</div>
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                    <span className="text-xl font-black text-text-secondary/10">2º</span>
                  </div>
                  <div className="z-10 text-center px-1 mb-1">
                    <span className="text-[9px] font-black text-text-secondary">{(displayRanking[1]?.xp || 0).toLocaleString()} XP</span>
                  </div>
                </div>
                <p className="text-[9px] font-black mt-2 text-center text-text-secondary truncate w-full px-1">{displayRanking[1]?.name || '---'}</p>
              </div>

              {/* Rank 1 */}
              <div className="flex-1 flex flex-col items-center h-full justify-end">
                <div className="w-full bg-gradient-to-t from-yellow-500/10 to-yellow-600/30 border border-yellow-500/40 rounded-t-[20px] relative flex flex-col items-center justify-end pb-4 pt-10 h-[80%] shadow-[0_0_20px_rgba(234,179,8,0.1)]">
                  <div className="absolute top-0 -translate-y-1/2 flex flex-col items-center">
                    <div className="relative">
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <Crown size={16} className="text-yellow-500 drop-shadow-[0_2px_4px_rgba(234,179,8,0.3)]" />
                      </div>
                      <div className="w-11 h-11 rounded-full bg-bg-main border border-yellow-500 flex items-center justify-center font-black text-yellow-600 text-sm shadow-xl">
                        {displayRanking[0]?.name?.charAt(0) || '?'}
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full bg-yellow-500 text-white font-extrabold text-[9px] flex items-center justify-center border border-bg-card">1</div>
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                    <span className="text-2xl font-black text-yellow-500/10">1º</span>
                  </div>
                  <div className="z-10 text-center px-1 mb-1">
                    <span className="text-[9px] font-black text-yellow-500">🏆 {(displayRanking[0]?.xp || 0).toLocaleString()} XP</span>
                  </div>
                </div>
                <p className="text-[10px] font-black mt-2 text-center text-text-main truncate w-full px-1">{displayRanking[0]?.name || '---'}</p>
              </div>

              {/* Rank 3 */}
              <div className="flex-1 flex flex-col items-center h-full justify-end">
                <div className="w-full bg-gradient-to-t from-amber-600/5 to-amber-800/20 border border-amber-800/30 rounded-t-[16px] relative flex flex-col items-center justify-end pb-3 pt-8 h-[50%]">
                  <div className="absolute top-0 -translate-y-1/2 flex flex-col items-center">
                    <div className="relative">
                      <div className="w-9 h-9 rounded-full bg-bg-main border border-amber-700 flex items-center justify-center font-black text-amber-700 text-xs shadow-lg">
                        {displayRanking[2]?.name?.charAt(0) || '?'}
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-700 text-white font-extrabold text-[9px] flex items-center justify-center border border-bg-card">3</div>
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                    <span className="text-lg font-black text-amber-600/10">3º</span>
                  </div>
                  <div className="z-10 text-center px-1 mb-1">
                    <span className="text-[9px] font-black text-amber-600">{(displayRanking[2]?.xp || 0).toLocaleString()} XP</span>
                  </div>
                </div>
                <p className="text-[9px] font-black mt-2 text-center text-text-secondary truncate w-full px-1">{displayRanking[2]?.name || '---'}</p>
              </div>
            </div>

            {/* Ranking list */}
            <div className="bg-bg-main/40 border border-border-color rounded-2xl overflow-hidden mt-4">
              {topStudents.map((entry, index) => (
                <div key={entry.id || index} className="flex items-center justify-between p-3 border-b border-border-color last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={`w-4 font-black text-xs text-center ${
                      index === 0 ? 'text-yellow-500' : index === 1 ? 'text-text-secondary' : index === 2 ? 'text-amber-600' : 'text-text-secondary opacity-50'
                    }`}>{index + 1}</span>
                    <div className="w-8 h-8 rounded-xl bg-bg-main border border-border-color flex items-center justify-center font-black text-text-secondary text-xs">
                      {entry.name?.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-text-main truncate">{entry.name}</div>
                      <div className="text-[9px] font-bold text-text-secondary opacity-50">Nível {calculateLevelAndProgression(entry.xp || 0).level}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-black text-text-main">{entry.xp} XP</span>
                  </div>
                </div>
              ))}
              {topStudents.length === 0 && (
                <div className="h-24 flex items-center justify-center text-[10px] font-black text-text-secondary opacity-50">Nenhum aluno cadastrado</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <div className="bg-bg-card border border-border-color rounded-[20px] p-5 shadow-sm relative flex flex-col justify-between h-[150px] transition-colors duration-300">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-text-secondary uppercase opacity-60 tracking-wider block mb-1">MÉDIA DE XP</span>
              <span className="text-2xl font-black text-text-main leading-none block">{averageXp.toLocaleString()} XP</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0"><Library size={18} /></div>
          </div>
          <div className="text-[10px] font-bold text-text-secondary opacity-60 pt-4 border-t border-border-color">
            <span>Média de engajamento dos alunos</span>
          </div>
        </div>

        <div className="bg-bg-card border border-border-color rounded-[20px] p-5 shadow-sm relative flex flex-col justify-between h-[150px] transition-colors duration-300">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-text-secondary uppercase opacity-60 tracking-wider block mb-1">ESCOLAS</span>
              <span className="text-2xl font-black text-text-main leading-none block">{schoolRanking.length}</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0"><Users size={18} /></div>
          </div>
          <div className="flex justify-between items-center pt-4 border-t border-border-color">
            <span className="text-[10px] font-bold text-text-secondary opacity-60">{schoolRanking.length} no total - 0 novas em 30d</span>
            <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5">+ 100.0%</span>
          </div>
        </div>

        <div className="bg-bg-card border border-border-color rounded-[20px] p-5 shadow-sm relative flex flex-col justify-between h-[150px] transition-colors duration-300">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-text-secondary uppercase opacity-60 tracking-wider block mb-1">XP ACUMULADO</span>
              <span className="text-2xl font-black text-text-main leading-none block">{totalXp.toLocaleString()} XP</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500 shrink-0"><Trophy size={18} /></div>
          </div>
          <div className="flex justify-between items-center pt-4 border-t border-border-color">
            <span className="text-[10px] font-bold text-text-secondary opacity-60">{activeStudentsCount} alunos com XP - {xpGrantingEvents.length} eventos com XP</span>
            <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5">{xpConfiguredInEvents.toLocaleString()} XP eventos</span>
          </div>
        </div>

        <div className="bg-bg-card border border-border-color rounded-[20px] p-5 shadow-sm relative flex flex-col justify-between h-[150px] transition-colors duration-300">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-text-secondary uppercase opacity-60 tracking-wider block mb-1">AVISOS NO MURAL</span>
              <span className="text-2xl font-black text-text-main leading-none block">{recados.length}</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shrink-0"><Megaphone size={18} /></div>
          </div>
          <div className="text-[10px] font-bold text-text-secondary opacity-60 pt-4 border-t border-border-color">
            <span>Ações acadêmicas pendentes</span>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
        {/* Growth Chart */}
        <div className="lg:col-span-8 bg-bg-card border border-border-color rounded-[24px] p-6 shadow-sm flex flex-col justify-between h-[360px] transition-colors duration-300">
          <div>
            <h3 className="text-sm font-black text-text-main mb-1 font-sans">Evolução de alunos</h3>
            <p className="text-[10px] text-text-secondary font-medium opacity-60">Novos alunos cadastrados por mês (últimos 6)</p>
          </div>
          <div className="flex-1 w-full relative min-h-[200px] mt-4 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={studentGrowth} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="studentGrowthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(100,116,139,0.12)" strokeDasharray="3 3" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} domain={[0, 'dataMax + 1']} />
                <Tooltip
                  cursor={{ stroke: 'rgba(59,130,246,0.25)', strokeDasharray: '3 3' }}
                  contentStyle={{ background: '#121f32', border: '1px solid #25334a', borderRadius: 12, fontSize: 11 }}
                  labelStyle={{ color: '#94a3b8', textTransform: 'uppercase' }}
                  itemStyle={{ color: '#60a5fa' }}
                  formatter={(value) => [Number(value), 'Novos alunos']}
                />
                <Area
                  type="monotone"
                  dataKey="students"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  fill="url(#studentGrowthGradient)"
                  activeDot={{ r: 4, fill: '#3b82f6', stroke: '#121f32', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Engagement Distribution */}
        <div className="lg:col-span-4 bg-bg-card border border-border-color rounded-[24px] p-6 shadow-sm flex flex-col justify-between h-[360px] transition-colors duration-300">
          <div>
            <h3 className="text-sm font-black text-text-main mb-1 font-sans">Distribuição de engajamento</h3>
            <p className="text-[10px] text-text-secondary font-medium opacity-60">Status atual das contas</p>
          </div>
          <div className="flex justify-center items-center h-52 mt-4">
            <svg width="160" height="160" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="12" />
              <circle cx="50" cy="50" r="30" fill="none" stroke="#f97316" strokeWidth="12" strokeDasharray="52.78 188.49" strokeDashoffset="-135.71" transform="rotate(-90 50 50)" strokeLinecap="round" />
              <circle cx="50" cy="50" r="30" fill="none" stroke="#3b82f6" strokeWidth="12" strokeDasharray="135.71 188.49" strokeDashoffset="0" transform="rotate(-90 50 50)" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex justify-center gap-6 text-[10px] font-bold text-text-secondary opacity-80 mt-4 border-t border-border-color pt-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#f97316] rounded-full shrink-0" />
              <span>Aguardando atividade</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#3b82f6] rounded-full shrink-0" />
              <span>Avaliação</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content Volume + At-Risk Students */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
        <div className="lg:col-span-8 bg-bg-card border border-border-color rounded-[24px] p-6 shadow-sm flex flex-col justify-between h-[360px] transition-colors duration-300">
          <div>
            <h3 className="text-sm font-black text-text-main mb-1 font-sans">Volume de conteúdos criados</h3>
            <p className="text-[10px] text-text-secondary font-medium opacity-60">Por mês — materiais e eventos cadastrados</p>
          </div>
          <div className="flex gap-4 h-48 items-end px-2 mt-4">
            {[
              { month: 'fev', count: 4, height: '20%' },
              { month: 'mar', count: 6, height: '30%' },
              { month: 'abr', count: 9, height: '45%' },
              { month: 'mai', count: 8, height: '40%' },
              { month: 'jun', count: 18, height: '90%' },
              { month: 'jul', count: 12, height: '60%' }
            ].map((item) => (
              <div key={item.month} className="flex-1 flex flex-col items-center gap-2 group">
                <span className="text-[9px] font-black text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity">{item.count}</span>
                <div className="w-full bg-bg-main border border-border-color rounded-t-lg h-36 flex items-end overflow-hidden">
                  <div style={{ height: item.height }} className="w-full bg-blue-600 rounded-t-lg transition-all group-hover:bg-blue-500" />
                </div>
                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mt-1">{item.month}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 bg-bg-card border border-border-color rounded-[24px] p-6 shadow-sm flex flex-col justify-between h-[360px] transition-colors duration-300">
          <div>
            <h3 className="text-sm font-black text-text-main mb-1 font-sans">Alunos em alerta</h3>
            <p className="text-[10px] text-text-secondary font-medium opacity-60">Sem interacao registrada ha mais de 30 dias</p>
          </div>
          <div className="space-y-4 my-4 overflow-y-auto max-h-56 pr-1">
            {atRiskStudents.slice(0, 4).map((student) => (
              <div key={student.id} className="flex items-center justify-between group gap-4 w-full min-w-0 pb-3 border-b border-border-color last:border-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0 animate-pulse" />
                  <div className="min-w-0 flex-1">
                    <div className="text-text-main font-black text-xs truncate uppercase tracking-tight">{student.name || 'Sem nome'}</div>
                    <div className="text-[9px] font-semibold text-text-secondary opacity-60 mt-0.5 truncate">
                      {student.school || 'Escola não informada'} • {student.city || 'MA'}
                    </div>
                  </div>
                </div>
                <button onClick={() => { onNavigateToAlunos(); onSetSearchTerm(student.name || ''); }}
                  className="text-blue-500 hover:text-blue-400 transition-colors font-black text-[10px] uppercase tracking-wider shrink-0 flex items-center gap-0.5 cursor-pointer">
                  Ver aluno
                </button>
              </div>
            ))}
            {atRiskStudents.length === 0 && (
              <div className="h-40 flex items-center justify-center text-[10px] font-black text-text-secondary opacity-50">Nenhum aluno em alerta</div>
            )}
          </div>
          <div className="border-t border-border-color pt-3">
            <span className="text-[9px] font-bold text-text-secondary opacity-50">Total de {atRiskStudents.length} alunos sem interacao nos ultimos 30 dias.</span>
          </div>
        </div>
      </div>
    </>
  );
}
