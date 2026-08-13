import React from 'react';
import { UserProfile } from '../../types';

interface HasPermissionProps {
  user?: UserProfile | null;
  /** Código da permissão (ex.: 'materials:upload'). */
  permission: string | string[];
  /** Exige TODAS as permissões se for array (default: true para qualquer uma). */
  requireAll?: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Encapsula elementos da interface cuja visibilidade depende de permissões RBAC.
 *
 * Exemplo:
 *   <HasPermission user={user} permission="materials:upload">
 *     <button>Novo Material</button>
 *   </HasPermission>
 */
export const HasPermission: React.FC<HasPermissionProps> = ({
  user,
  permission,
  requireAll = false,
  children,
  fallback = null,
}) => {
  if (!user) return <>{fallback}</>;

  // super_admin possui acesso total
  if (user.roles?.includes('super_admin')) {
    return <>{children}</>;
  }

  const userPerms = user.permissions || [];
  const required = Array.isArray(permission) ? permission : [permission];

  const hasAccess = requireAll
    ? required.every((p) => userPerms.includes(p))
    : required.some((p) => userPerms.includes(p));

  if (!hasAccess) return <>{fallback}</>;
  return <>{children}</>;
};

export default HasPermission;
