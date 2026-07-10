import { request } from '../lib/apiService';
import { UserProfile } from '../types';

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

export const adminService = {
  async getStudents(): Promise<UserProfile[]> {
    return request<UserProfile[]>('/api/admin/users');
  },

  async getActivities(): Promise<AdminActivitiesResponse> {
    return request<AdminActivitiesResponse>('/api/admin/activities');
  },
};
