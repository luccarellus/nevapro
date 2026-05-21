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
    const response = await fetch('/api/admin/users');
    if (!response.ok) throw new Error('Failed to fetch students');
    return response.json();
  },

  async getActivities(): Promise<AdminActivitiesResponse> {
    const response = await fetch('/api/admin/activities');
    if (!response.ok) throw new Error('Failed to fetch admin activities');
    return response.json();
  }
};
