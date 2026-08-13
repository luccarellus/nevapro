/**
 * RBAC — Catálogo de Permissões e Matriz de Papéis
 *
 * Fonte: docs/PRD.md (Matriz de Permissões RBAC).
 *
 * Papéis (RoleCode):
 *   super_admin  → controle total da plataforma (todos os tenants)
 *   tenant_admin → administrador da instituição/tenant
 *   teacher      → professor do tenant
 *   student      → aluno do tenant
 */

export type RoleCode = 'super_admin' | 'tenant_admin' | 'teacher' | 'student';

export const ROLE_CODES: RoleCode[] = ['super_admin', 'tenant_admin', 'teacher', 'student'];

/** Papéis considerados "administrativos" para compatibilidade com o legado (role === 'admin'). */
export const ADMIN_ROLE_CODES: RoleCode[] = ['super_admin', 'tenant_admin'];

export const PERMISSIONS = {
  // Tenants
  TENANTS_MANAGE: 'tenants:manage',
  TENANTS_VIEW_SETTINGS: 'tenants:view_settings',
  // Usuários
  USERS_MANAGE_ADMINS: 'users:manage_admins',
  USERS_MANAGE_TEACHERS: 'users:manage_teachers',
  USERS_MANAGE_STUDENTS: 'users:manage_students',
  USERS_VIEW_SELF: 'users:view_self',
  // Questões
  QUESTIONS_CREATE: 'questions:create',
  QUESTIONS_DELETE: 'questions:delete',
  QUESTIONS_ANSWER: 'questions:answer',
  // Simulados
  SIMULADOS_PUBLISH: 'simulados:publish',
  SIMULADOS_TAKE: 'simulados:take',
  // Materiais
  MATERIALS_UPLOAD: 'materials:upload',
  // Mural
  MURAL_POST: 'mural:post',
  // Desempenho / Analytics
  ANALYTICS_TENANT_SUMMARY: 'analytics:tenant_summary',
  ANALYTICS_OWN_PERFORMANCE: 'analytics:own_performance',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Matriz papel → permissões (fonte: PRD, seção 4). */
export const ROLE_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  super_admin: [
    PERMISSIONS.TENANTS_MANAGE,
    PERMISSIONS.TENANTS_VIEW_SETTINGS,
    PERMISSIONS.USERS_MANAGE_ADMINS,
    PERMISSIONS.USERS_MANAGE_TEACHERS,
    PERMISSIONS.USERS_MANAGE_STUDENTS,
    PERMISSIONS.USERS_VIEW_SELF,
    PERMISSIONS.QUESTIONS_CREATE,
    PERMISSIONS.QUESTIONS_DELETE,
    PERMISSIONS.QUESTIONS_ANSWER,
    PERMISSIONS.SIMULADOS_PUBLISH,
    PERMISSIONS.SIMULADOS_TAKE,
    PERMISSIONS.MATERIALS_UPLOAD,
    PERMISSIONS.MURAL_POST,
    PERMISSIONS.ANALYTICS_TENANT_SUMMARY,
    PERMISSIONS.ANALYTICS_OWN_PERFORMANCE,
  ],
  tenant_admin: [
    PERMISSIONS.TENANTS_VIEW_SETTINGS,
    PERMISSIONS.USERS_MANAGE_TEACHERS,
    PERMISSIONS.USERS_MANAGE_STUDENTS,
    PERMISSIONS.USERS_VIEW_SELF,
    PERMISSIONS.QUESTIONS_CREATE,
    PERMISSIONS.QUESTIONS_DELETE,
    PERMISSIONS.QUESTIONS_ANSWER,
    PERMISSIONS.SIMULADOS_PUBLISH,
    PERMISSIONS.SIMULADOS_TAKE,
    PERMISSIONS.MATERIALS_UPLOAD,
    PERMISSIONS.MURAL_POST,
    PERMISSIONS.ANALYTICS_TENANT_SUMMARY,
    PERMISSIONS.ANALYTICS_OWN_PERFORMANCE,
  ],
  teacher: [
    PERMISSIONS.USERS_MANAGE_STUDENTS,
    PERMISSIONS.USERS_VIEW_SELF,
    PERMISSIONS.QUESTIONS_CREATE,
    PERMISSIONS.QUESTIONS_ANSWER,
    PERMISSIONS.SIMULADOS_PUBLISH,
    PERMISSIONS.SIMULADOS_TAKE,
    PERMISSIONS.MATERIALS_UPLOAD,
    PERMISSIONS.MURAL_POST,
    PERMISSIONS.ANALYTICS_TENANT_SUMMARY,
    PERMISSIONS.ANALYTICS_OWN_PERFORMANCE,
  ],
  student: [
    PERMISSIONS.USERS_VIEW_SELF,
    PERMISSIONS.QUESTIONS_ANSWER,
    PERMISSIONS.SIMULADOS_TAKE,
    PERMISSIONS.ANALYTICS_OWN_PERFORMANCE,
  ],
};

/** Descrição legível de cada papel (para logs e respostas de API). */
export const ROLE_LABELS: Record<RoleCode, string> = {
  super_admin: 'Super Administrador',
  tenant_admin: 'Administrador do Tenant',
  teacher: 'Professor',
  student: 'Estudante',
};

/**
 * Permissões de um conjunto de papéis (união, sem duplicatas).
 * super_admin recebe implicitamente TODAS as permissões do catálogo.
 */
export function permissionsForRoles(roles: RoleCode[]): PermissionCode[] {
  const set = new Set<PermissionCode>();
  for (const role of roles) {
    if (role === 'super_admin') {
      Object.values(PERMISSIONS).forEach((p) => set.add(p));
    } else {
      (ROLE_PERMISSIONS[role] || []).forEach((p) => set.add(p));
    }
  }
  return Array.from(set);
}
