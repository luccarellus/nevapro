import { request } from '../lib/apiService';
import { invalidateRequestCache } from '../lib/requestCache';

export interface StudyTask {
  id: string;
  user_id: string;
  title: string;
  estimated_time: string;
  target_tab: string;
  done: boolean;
  task_date: string;
  created_at: string;
}

export interface StudyPlanResponse {
  tasks: StudyTask[];
  weekly_goal: {
    questions_answered: number;
  } | null;
}

export const studyPlanService = {
  /**
   * Get today's (or a specific date's) study tasks for the current user.
   */
  async getTasks(date?: string): Promise<StudyPlanResponse> {
    const params = date ? `?date=${encodeURIComponent(date)}` : '';
    return request<StudyPlanResponse>(`/api/study-plans/tasks${params}`);
  },

  /**
   * Create a new study task.
   */
  async createTask(data: {
    title: string;
    estimated_time?: string;
    target_tab?: string;
    task_date?: string;
  }): Promise<StudyTask> {
    const result = await request<StudyTask>('/api/study-plans/tasks', {
      method: 'POST',
      body: data,
    });
    invalidateRequestCache();
    return result;
  },

  /**
   * Update a study task (toggle done, edit title, etc.).
   */
  async updateTask(id: string, data: Partial<StudyTask>): Promise<StudyTask> {
    const result = await request<StudyTask>(`/api/study-plans/tasks/${id}`, {
      method: 'PUT',
      body: data,
    });
    invalidateRequestCache();
    return result;
  },

  /**
   * Delete a study task.
   */
  async deleteTask(id: string): Promise<void> {
    await request<void>(`/api/study-plans/tasks/${id}`, {
      method: 'DELETE',
    });
    invalidateRequestCache();
  },

  /**
   * Toggle a task's done status and return the new state.
   * Also returns the XP earned (25 XP) if it was just completed.
   */
  async toggleTask(id: string, done: boolean): Promise<{ task: StudyTask; xpEarned: number }> {
    const task = await this.updateTask(id, { done } as Partial<StudyTask>);
    return { task, xpEarned: done ? 25 : 0 };
  },
};
