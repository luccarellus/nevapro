import { request } from '../lib/apiService';
import { RbacRole, TenantInfo, UserProfile } from '../types';

export interface AdminActivity {
  id: string;
  user: string;
  action: string;
  time: string;
  city: string;
}

export interface ProductionStat {
  day: string;
  value: number;
}

export interface AdminActivitiesResponse {
  activities: AdminActivity[];
  production: ProductionStat[];
}

export interface TenantMember {
  link_id: string;
  user_id: string;
  assigned_at: string;
  role_id: string;
  role_code: RbacRole;
  role_name: string;
  user_name: string;
  user_email: string;
  avatar_url?: string;
  xp: number;
  level: number;
  source_table: 'admin' | 'student';
}

export interface RoleOption {
  id: string;
  code: RbacRole;
  name: string;
  description?: string;
  tenant_id?: string | null;
}

export const adminService = {
  async getStudents(): Promise<UserProfile[]> {
    return request<UserProfile[]>('/api/admin/users');
  },

  async getActivities(): Promise<AdminActivitiesResponse> {
    return request<AdminActivitiesResponse>('/api/admin/activities');
  },

  // ===== TENANTS =====
  async getTenants(): Promise<TenantInfo[]> {
    return request<TenantInfo[]>('/api/tenants');
  },

  async getTenant(id: string): Promise<TenantInfo> {
    return request<TenantInfo>(`/api/tenants/${id}`);
  },

  async createTenant(data: { name: string; slug: string; domain?: string; plan?: string }): Promise<TenantInfo> {
    return request<TenantInfo>('/api/tenants', {
      method: 'POST',
      body: data,
    });
  },

  async updateTenant(id: string, data: Partial<TenantInfo>): Promise<TenantInfo> {
    return request<TenantInfo>(`/api/tenants/${id}`, {
      method: 'PUT',
      body: data,
    });
  },

  async deactivateTenant(id: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/api/tenants/${id}`, {
      method: 'DELETE',
    });
  },

  // ===== TENANT ROLES & MEMBERS =====
  async getTenantRoles(tenantId: string): Promise<RoleOption[]> {
    return request<RoleOption[]>(`/api/tenants/${tenantId}/roles`);
  },

  async getTenantMembers(tenantId: string): Promise<TenantMember[]> {
    return request<TenantMember[]>(`/api/tenants/${tenantId}/members`);
  },

  async assignMemberRole(tenantId: string, email: string, role: RbacRole): Promise<{ success: boolean; message?: string }> {
    return request<{ success: boolean; message?: string }>(`/api/tenants/${tenantId}/members`, {
      method: 'POST',
      body: { email, role },
    });
  },

  async removeMemberRole(tenantId: string, userId: string): Promise<{ success: boolean; removed?: number }> {
    return request<{ success: boolean; removed?: number }>(`/api/tenants/${tenantId}/members/${userId}`, {
      method: 'DELETE',
    });
  },
};
