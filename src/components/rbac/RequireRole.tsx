import React from 'react';
import { RbacRole, UserProfile } from '../../types';

interface RequireRoleProps {
  user?: UserProfile | null;
  /** Papel ou lista de papéis autorizados. */
  roles: RbacRole | RbacRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Componente Guard que exige papéis específicos para exibir o conteúdo filho.
 *
 * Exemplo:
 *   <RequireRole user={user} roles={['tenant_admin', 'super_admin']}>
 *     <AdminPanel />
 *   </RequireRole>
 */
export const RequireRole: React.FC<RequireRoleProps> = ({
  user,
  roles,
  children,
  fallback = null,
}) => {
  if (!user) return <>{fallback}</>;

  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  const userRoles = user.roles || (user.role === 'admin' ? ['tenant_admin'] : ['student']);

  // super_admin sempre passa
  if (userRoles.includes('super_admin')) {
    return <>{children}</>;
  }

  const hasRole = allowedRoles.some((r) => userRoles.includes(r));
  if (!hasRole) return <>{fallback}</>;

  return <>{children}</>;
};

export default RequireRole;
