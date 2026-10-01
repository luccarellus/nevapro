import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2,
  Plus,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Search,
  X,
  GraduationCap,
  BookOpen,
} from 'lucide-react';
import Spinner from '../Spinner';
import { adminService, TenantMember } from '../../services/adminService';
import { RbacRole, TenantInfo, UserProfile } from '../../types';

interface AdminTenantsProps {
  currentUser: UserProfile;
  activeTenantId?: string;
  onSelectTenant?: (tenantId: string) => void;
}

export default function AdminTenants({
  currentUser,
  activeTenantId,
  onSelectTenant,
}: AdminTenantsProps) {
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>(activeTenantId || '');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [tenantDomain, setTenantDomain] = useState('');
  const [tenantPlan, setTenantPlan] = useState('standard');

  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [memberSearch, setMemberSearch] = useState('');

  const isSuperAdmin = currentUser.roles?.includes('super_admin') || currentUser.role === 'admin';

  const fetchTenants = async () => {
    setIsLoading(true);
    try {
      const data = await adminService.getTenants();
      setTenants(data || []);
      if (data && data.length > 0 && !selectedTenantId) {
        setSelectedTenantId(activeTenantId || data[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load tenants:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMembersAndRoles = async (tenantId: string) => {
    if (!tenantId) return;
    setIsMembersLoading(true);
    try {
      const membersData = await adminService.getTenantMembers(tenantId).catch(() => []);
      setMembers(membersData || []);
    } catch (err: any) {
      console.error('Failed to load members:', err);
    } finally {
      setIsMembersLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (selectedTenantId) {
      fetchMembersAndRoles(selectedTenantId);
    }
  }, [selectedTenantId]);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantName || !tenantSlug) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const created = await adminService.createTenant({
        name: tenantName,
        slug: tenantSlug,
        domain: tenantDomain || undefined,
        plan: tenantPlan,
      });
      setFeedback({ type: 'success', message: 'Instituição criada com sucesso!' });
      setTenantName('');
      setTenantSlug('');
      setTenantDomain('');
      setShowCreateModal(false);
      await fetchTenants();
      setSelectedTenantId(created.id);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao criar instituição.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMember = async (userId: string, memberName: string) => {
    if (!window.confirm(`Tem certeza que deseja remover o vínculo de ${memberName} desta instituição?`)) return;
    try {
      await adminService.removeMemberRole(selectedTenantId, userId);
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (err: any) {
      alert(`Erro ao remover: ${err.message || 'Falha ao remover membro'}`);
    }
  };

  const filteredMembers = members.filter((m) => {
    const term = memberSearch.toLowerCase();
    return (
      m.user_name.toLowerCase().includes(term) ||
      m.user_email.toLowerCase().includes(term) ||
      m.role_name.toLowerCase().includes(term)
    );
  });

  const activeTenant = tenants.find((t) => t.id === selectedTenantId) || tenants[0];

  const getRoleBadge = (roleCode: RbacRole) => {
    switch (roleCode) {
      case 'super_admin':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      case 'tenant_admin':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'teacher':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'student':
      default:
        return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
    }
  };

  const getRoleIcon = (roleCode: RbacRole) => {
    switch (roleCode) {
      case 'super_admin':
        return <ShieldCheck size={13} className="text-purple-400" />;
      case 'tenant_admin':
        return <Building2 size={13} className="text-blue-400" />;
      case 'teacher':
        return <GraduationCap size={13} className="text-emerald-400" />;
      case 'student':
      default:
        return <BookOpen size={13} className="text-slate-400" />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-bg-card border border-border-color rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
            <Building2 size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-text-main tracking-tight">Gestão de Instituições & RBAC</h2>
            <p className="text-xs text-text-secondary font-medium mt-0.5">
              Administração de multi-tenancy, isolamento de dados e papéis por escola.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {isSuperAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-full bg-brand-primary text-white text-xs font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm shadow-brand-primary/25 cursor-pointer"
            >
              <Plus size={15} />
              Nova Instituição
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-xs font-bold ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Main Grid: Tenant Selector / Info + Members List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Tenants List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-bg-card border border-border-color rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase text-text-secondary tracking-wider opacity-60">
                Instituições ({tenants.length})
              </span>
            </div>

            {isLoading ? (
              <div className="py-12 flex justify-center">
                <Spinner size={24} />
              </div>
            ) : tenants.length === 0 ? (
              <div className="text-center py-8 text-xs text-text-secondary opacity-60">
                Nenhuma instituição encontrada.
              </div>
            ) : (
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {tenants.map((t) => {
                  const isSelected = t.id === selectedTenantId;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        setSelectedTenantId(t.id);
                        onSelectTenant?.(t.id);
                      }}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-brand-primary/10 border-brand-primary text-text-main shadow-xs'
                          : 'bg-bg-main/40 border-border-color/70 text-text-secondary hover:bg-bg-main/80 hover:text-text-main'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black truncate">{t.name}</div>
                        <div className="text-[10px] font-medium opacity-60 truncate">
                          slug: {t.slug} {t.domain ? `• ${t.domain}` : ''}
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-text-main/5 border border-border-color shrink-0 ml-2">
                        {t.plan || 'standard'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Members & Roles in Selected Tenant */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-bg-card border border-border-color rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-border-color">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-text-main font-sans">
                    {activeTenant?.name || 'Selecione uma Instituição'}
                  </h3>
                  <span className="text-[10px] font-bold text-brand-primary uppercase px-2.5 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/20">
                    {activeTenant?.slug}
                  </span>
                </div>
                <p className="text-xs text-text-secondary font-medium mt-0.5">
                  Membros com papéis atribuídos nesta instituição.
                </p>
              </div>
            </div>

            {/* Search Filter for Members */}
            <div className="relative mb-4">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary opacity-40" size={14} />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Filtrar por nome, e-mail ou papel..."
                className="w-full bg-bg-main/50 border border-border-color rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-text-main focus:outline-none focus:border-brand-primary/50 transition-all placeholder:opacity-40"
              />
            </div>

            {/* Members List */}
            {isMembersLoading ? (
              <div className="py-16 flex justify-center">
                <Spinner size={24} />
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="text-center py-12 text-xs text-text-secondary opacity-60">
                {memberSearch ? 'Nenhum membro encontrado com este filtro.' : 'Nenhum membro associado a este tenant ainda.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border-color text-[10px] font-black text-text-secondary uppercase opacity-60">
                      <th className="pb-3 pl-2">Membro</th>
                      <th className="pb-3">Papel RBAC</th>
                      <th className="pb-3">Nível / XP</th>
                      <th className="pb-3 text-right pr-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-color/50 text-xs font-medium">
                    {filteredMembers.map((m) => (
                      <tr key={m.link_id} className="hover:bg-text-main/[0.02] transition-colors">
                        <td className="py-3 pl-2">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-text-main/10 border border-border-color flex items-center justify-center font-bold text-text-main text-xs shrink-0 overflow-hidden">
                              {m.avatar_url ? (
                                <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                m.user_name.charAt(0)
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-text-main font-bold truncate">{m.user_name}</div>
                              <div className="text-[10px] text-text-secondary opacity-60 truncate">{m.user_email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${getRoleBadge(
                              m.role_code,
                            )}`}
                          >
                            {getRoleIcon(m.role_code)}
                            {m.role_name}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="text-text-main font-bold text-[11px]">Nível {m.level}</div>
                          <div className="text-[10px] text-text-secondary opacity-60">{m.xp.toLocaleString()} XP</div>
                        </td>
                        <td className="py-3 text-right pr-2">
                          <button
                            onClick={() => handleRemoveMember(m.user_id, m.user_name)}
                            className="p-1.5 text-text-secondary hover:text-red-400 hover:bg-red-500/10 rounded-full transition-all cursor-pointer"
                            title="Remover vínculo"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Create Tenant */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-md bg-bg-sidebar border border-border-color rounded-2xl p-6 shadow-2xl z-10"
            >
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-border-color">
                <h3 className="text-base font-black text-text-main">Criar Nova Instituição</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1.5 text-text-secondary hover:text-text-main rounded-full"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateTenant} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60 mb-1.5">
                    Nome da Escola / Instituição
                  </label>
                  <input
                    type="text"
                    required
                    value={tenantName}
                    onChange={(e) => {
                      setTenantName(e.target.value);
                      if (!tenantSlug) {
                        setTenantSlug(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, '-')
                            .replace(/-+/g, '-'),
                        );
                      }
                    }}
                    placeholder="Ex: Colégio Alpha"
                    className="w-full bg-bg-main/50 border border-border-color rounded-xl px-3.5 py-2.5 text-xs font-bold text-text-main focus:outline-none focus:border-brand-primary/50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60 mb-1.5">
                    Slug Identificador (URL/Subdomínio)
                  </label>
                  <input
                    type="text"
                    required
                    value={tenantSlug}
                    onChange={(e) => setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    placeholder="Ex: colegio-alpha"
                    className="w-full bg-bg-main/50 border border-border-color rounded-xl px-3.5 py-2.5 text-xs font-bold text-text-main focus:outline-none focus:border-brand-primary/50 transition-all font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60 mb-1.5">
                    Domínio Customizado (Opcional)
                  </label>
                  <input
                    type="text"
                    value={tenantDomain}
                    onChange={(e) => setTenantDomain(e.target.value.toLowerCase())}
                    placeholder="Ex: portal.colegioalpha.com.br"
                    className="w-full bg-bg-main/50 border border-border-color rounded-xl px-3.5 py-2.5 text-xs font-bold text-text-main focus:outline-none focus:border-brand-primary/50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-60 mb-1.5">
                    Plano de Arrendamento
                  </label>
                  <select
                    value={tenantPlan}
                    onChange={(e) => setTenantPlan(e.target.value)}
                    className="select-pill w-full"
                  >
                    <option value="free">Free / Demonstração</option>
                    <option value="standard">Standard / Básico</option>
                    <option value="enterprise">Enterprise / Rede de Ensino</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 bg-text-main/5 hover:bg-text-main/10 text-text-main py-2.5 rounded-full font-bold text-xs transition-all border border-border-color"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-brand-primary text-white hover:opacity-90 py-2.5 rounded-full font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? <Spinner size={14} className="text-white" /> : <Plus size={14} />}
                    Criar Instituição
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
