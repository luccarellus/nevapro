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
          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-text-main tracking-tight leading-none mb-1 flex items-center gap-2">Painel BackOffice</h1>
            <p className="text-xs text-text-secondary font-medium">Visão geral de alunos, engajamento e conteúdos do projeto.</p>
          </div>
        </div>
        <button
          onClick={onNavigateToAlunos}
          className="bg-brand-primary text-white hover:opacity-90 transition-all px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm shadow-brand-primary/20 flex items-center gap-2 cursor-pointer"
        >
          <Users size={15} />
          Ver alunos
        </button>
      </div>

      {/* Row 1: Config + Hall da Fama */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 mb-6">
        {/* Config Column */}
        <div className="lg:col-span-5 bg-bg-card border border-border-color rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between transition-colors duration-300">
          <div>
            <h3 className="text-base font-black text-text-main mb-1 font-sans">Configuração do Portal e Recompensas</h3>
            <p className="text-[11px] text-text-secondary font-medium opacity-80 mb-5">Configurações automáticas de XP — não afeta as ações já concluídas</p>
            <div className="flex gap-2.5 bg-bg-main p-1.5 rounded-xl border border-border-color mb-5">
              <button onClick={() => onOpenModal('material')}
                className="flex-1 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary py-2.5 rounded-lg text-xs font-bold shadow-xs flex items-center justify-center gap-2 hover:bg-brand-primary/20 transition-all cursor-pointer">
                <Library size={14} className="opacity-80" />
                Material / Biblioteca
              </button>
              <button onClick={() => onOpenModal('recado')}
                className="flex-1 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary py-2.5 rounded-lg text-xs font-bold shadow-xs flex items-center justify-center gap-2 hover:bg-brand-primary/20 transition-all cursor-pointer">
                <Megaphone size={14} className="opacity-80" />
                Mural / Avisos
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-border-color bg-bg-main/50 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Materiais</span>
                  <span className="text-base font-black text-text-main">{materials.length}</span>
                </div>
                <div className="space-y-1.5">
                  {recentMaterials.length > 0 ? recentMaterials.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-[10px] font-semibold">
                      <span className="text-text-main truncate">{item.title}</span>
                      <span className="text-text-secondary shrink-0 opacity-60">{formatShortDate(item.uploadedAt || '')}</span>
                    </div>
                  )) : (
                    <span className="text-[10px] font-medium text-text-secondary opacity-60">Nenhum material</span>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border-color bg-bg-main/50 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Recados</span>
                  <span className="text-base font-black text-text-main">{recados.length}</span>
                </div>
                <div className="space-y-1.5">
                  {recentRecados.length > 0 ? recentRecados.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-[10px] font-semibold">
                      <span className="text-text-main truncate">{item.title}</span>
                      <span className="text-text-secondary shrink-0 opacity-60">{formatShortDate(item.date)}</span>
                    </div>
                  )) : (
                    <span className="text-[10px] font-medium text-text-secondary opacity-60">Nenhum recado</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-text-secondary leading-relaxed font-medium opacity-60 mt-4">
            Conteúdos mais recentes do portal e recompensas ficam refletidos aqui automaticamente.
          </p>
        </div>

        {/* Hall da Fama */}
        <div className="lg:col-span-7 bg-bg-card border border-border-color rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between overflow-y-auto max-h-[440px] transition-colors duration-300">
          <div>
            <div className="flex items-center justify-between mb-5 pb-3.5 border-b border-border-color">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-xl flex items-center justify-center shrink-0">
                  <Trophy size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-text-main leading-none mb-1 font-sans">Hall da Fama</h3>
                  <p className="text-[11px] text-text-secondary font-medium opacity-60">Estudantes com maior engajamento acumulado</p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-brand-primary uppercase tracking-wider bg-brand-primary/10 px-2.5 py-1 rounded-lg border border-brand-primary/20">Top Alunos</span>
            </div>

            {/* Ranking list */}
            <div className="space-y-2">
              {topStudents.map((entry, index) => (
                <div key={entry.id || index} className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl border border-border-color/60 bg-bg-main/30 hover:bg-text-main/[0.02] transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-6 h-6 rounded-lg font-black text-[11px] flex items-center justify-center border ${
                      index === 0 ? 'bg-brand-primary text-white border-brand-primary' :
                      index === 1 ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20' :
                      index === 2 ? 'bg-text-main/5 text-text-secondary border-border-color' :
                      'bg-transparent text-text-secondary opacity-50 border-transparent'
                    }`}>{index + 1}</span>
                    <div className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center font-bold text-brand-primary text-xs shrink-0">
                      {entry.name?.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-text-main truncate">{entry.name}</div>
                      <div className="text-[10px] font-medium text-text-secondary opacity-60">Nível {calculateLevelAndProgression(entry.xp || 0).level} • {entry.school || 'Escola N/A'}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-black text-brand-primary">{(entry.xp || 0).toLocaleString()} XP</span>
                  </div>
                </div>
              ))}
              {topStudents.length === 0 && (
                <div className="h-24 flex items-center justify-center text-[10px] font-medium text-text-secondary opacity-50">Nenhum aluno cadastrado</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 mb-6">
        <div className="bg-bg-card border border-border-color rounded-2xl p-5 shadow-sm relative flex flex-col justify-between h-[150px] transition-colors duration-300">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold text-text-secondary uppercase opacity-60 tracking-wider block mb-1">MÉDIA DE XP</span>
              <span className="text-2xl font-black text-text-main leading-none block">{averageXp.toLocaleString()} XP</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0"><Library size={18} /></div>
          </div>
          <div className="text-[10px] font-medium text-text-secondary opacity-60 pt-4 border-t border-border-color">
            <span>Média de engajamento dos alunos</span>
          </div>
        </div>

        <div className="bg-bg-card border border-border-color rounded-2xl p-5 shadow-sm relative flex flex-col justify-between h-[150px] transition-colors duration-300">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold text-text-secondary uppercase opacity-60 tracking-wider block mb-1">ESCOLAS</span>
              <span className="text-2xl font-black text-text-main leading-none block">{schoolRanking.length}</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0"><Users size={18} /></div>
          </div>
          <div className="flex justify-between items-center pt-4 border-t border-border-color">
            <span className="text-[10px] font-medium text-text-secondary opacity-60">{schoolRanking.length} ativas</span>
            <span className="bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[9px] font-bold px-2 py-0.5 rounded-full">+100% ativas</span>
          </div>
        </div>

        <div className="bg-bg-card border border-border-color rounded-2xl p-5 shadow-sm relative flex flex-col justify-between h-[150px] transition-colors duration-300">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold text-text-secondary uppercase opacity-60 tracking-wider block mb-1">XP ACUMULADO</span>
              <span className="text-2xl font-black text-text-main leading-none block">{totalXp.toLocaleString()} XP</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0"><Trophy size={18} /></div>
          </div>
          <div className="flex justify-between items-center pt-4 border-t border-border-color">
            <span className="text-[10px] font-medium text-text-secondary opacity-60">{activeStudentsCount} alunos com XP</span>
            <span className="bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[9px] font-bold px-2 py-0.5 rounded-full">{xpConfiguredInEvents.toLocaleString()} XP eventos</span>
          </div>
        </div>

        <div className="bg-bg-card border border-border-color rounded-2xl p-5 shadow-sm relative flex flex-col justify-between h-[150px] transition-colors duration-300">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold text-text-secondary uppercase opacity-60 tracking-wider block mb-1">AVISOS NO MURAL</span>
              <span className="text-2xl font-black text-text-main leading-none block">{recados.length}</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0"><Megaphone size={18} /></div>
          </div>
          <div className="text-[10px] font-medium text-text-secondary opacity-60 pt-4 border-t border-border-color">
            <span>Comunicados ativos no sistema</span>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 mb-6">
        {/* Growth Chart */}
        <div className="lg:col-span-8 bg-bg-card border border-border-color rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between min-h-[320px] transition-colors duration-300">
          <div>
            <h3 className="text-sm font-black text-text-main mb-1 font-sans">Evolução de alunos</h3>
            <p className="text-[10px] text-text-secondary font-medium opacity-60">Novos alunos cadastrados por mês (últimos 6)</p>
          </div>
          <div className="flex-1 w-full relative min-h-[180px] mt-4 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={studentGrowth} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="studentGrowthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-text-main, #64748b)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="var(--color-text-main, #64748b)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(100,116,139,0.12)" strokeDasharray="3 3" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} domain={[0, 'dataMax + 1']} />
                <Tooltip
                  cursor={{ stroke: 'rgba(100,116,139,0.2)', strokeDasharray: '3 3' }}
                  contentStyle={{ background: '#121f32', border: '1px solid #25334a', borderRadius: 12, fontSize: 11 }}
                  labelStyle={{ color: '#94a3b8', textTransform: 'uppercase' }}
                  itemStyle={{ color: '#cbd5e1' }}
                  formatter={(value) => [Number(value), 'Novos alunos']}
                />
                <Area
                  type="monotone"
                  dataKey="students"
                  stroke="#64748b"
                  strokeWidth={2}
                  fill="url(#studentGrowthGradient)"
                  activeDot={{ r: 4, fill: '#64748b', stroke: '#121f32', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Engagement Distribution */}
        <div className="lg:col-span-4 bg-bg-card border border-border-color rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between min-h-[320px] transition-colors duration-300">
          <div>
            <h3 className="text-sm font-black text-text-main mb-1 font-sans">Distribuição de engajamento</h3>
            <p className="text-[10px] text-text-secondary font-medium opacity-60">Status atual das contas</p>
          </div>
          <div className="flex justify-center items-center h-44 mt-3">
            <svg width="150" height="150" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="12" />
              <circle cx="50" cy="50" r="30" fill="none" stroke="#64748b" strokeWidth="12" strokeDasharray="52.78 188.49" strokeDashoffset="-135.71" transform="rotate(-90 50 50)" strokeLinecap="round" />
              <circle cx="50" cy="50" r="30" fill="none" stroke="#38bdf8" strokeWidth="12" strokeDasharray="135.71 188.49" strokeDashoffset="0" transform="rotate(-90 50 50)" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex justify-center gap-6 text-[10px] font-bold text-text-secondary opacity-80 mt-3 border-t border-border-color pt-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#64748b] rounded-full shrink-0" />
              <span>Sem atividade recente</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#38bdf8] rounded-full shrink-0" />
              <span>Ativos</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content Volume + At-Risk Students */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 mb-6">
        <div className="lg:col-span-8 bg-bg-card border border-border-color rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between min-h-[320px] transition-colors duration-300">
          <div>
            <h3 className="text-sm font-black text-text-main mb-1 font-sans">Volume de conteúdos criados</h3>
            <p className="text-[10px] text-text-secondary font-medium opacity-60">Por mês — materiais e eventos cadastrados</p>
          </div>
          <div className="flex gap-4 h-44 items-end px-2 mt-4">
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
                <div className="w-full bg-bg-main border border-border-color rounded-t-lg h-32 flex items-end overflow-hidden">
                  <div style={{ height: item.height }} className="w-full bg-text-main/20 rounded-t-lg transition-all group-hover:bg-text-main/40" />
                </div>
                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mt-1">{item.month}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 bg-bg-card border border-border-color rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between min-h-[320px] transition-colors duration-300">
          <div>
            <h3 className="text-sm font-black text-text-main mb-1 font-sans">Alunos em alerta</h3>
            <p className="text-[10px] text-text-secondary font-medium opacity-60">Sem interação registrada há mais de 30 dias</p>
          </div>
          <div className="space-y-3.5 my-3 overflow-y-auto max-h-52 pr-1">
            {atRiskStudents.slice(0, 4).map((student) => (
              <div key={student.id} className="flex items-center justify-between group gap-4 w-full min-w-0 pb-2.5 border-b border-border-color last:border-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-[9px] font-bold text-text-secondary bg-text-main/10 px-2 py-0.5 rounded-full border border-border-color shrink-0">Inativo</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-text-main font-bold text-xs truncate uppercase tracking-tight">{student.name || 'Sem nome'}</div>
                    <div className="text-[9px] font-medium text-text-secondary opacity-60 mt-0.5 truncate">
                      {student.school || 'Escola não informada'} • {student.city || 'MA'}
                    </div>
                  </div>
                </div>
                <button onClick={() => { onNavigateToAlunos(); onSetSearchTerm(student.name || ''); }}
                  className="text-text-main hover:underline transition-colors font-bold text-[10px] uppercase tracking-wider shrink-0 flex items-center gap-0.5 cursor-pointer">
                  Ver aluno
                </button>
              </div>
            ))}
            {atRiskStudents.length === 0 && (
              <div className="h-36 flex items-center justify-center text-[10px] font-medium text-text-secondary opacity-50">Nenhum aluno em alerta</div>
            )}
          </div>
          <div className="border-t border-border-color pt-3">
            <span className="text-[9px] font-medium text-text-secondary opacity-50">Total de {atRiskStudents.length} alunos sem interação nos últimos 30 dias.</span>
          </div>
        </div>
      </div>
    </>
  );
}
