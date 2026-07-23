import { request } from '../lib/apiService';

export interface TriScore {
  id: string;
  estimated_score: number;
  math_score: number | null;
  nature_score: number | null;
  humanities_score: number | null;
  languages_score: number | null;
  calculated_at: string;
}

export interface TriScoreResponse {
  latest_score: TriScore | null;
  history: { id: string; estimated_score: number; calculated_at: string }[];
  tri_target: number;
  stats: {
    hit_rate: number;
    answered: number;
    correct: number;
    xp: number;
  };
}

export interface SubjectMastery {
  name: string;
  category: string;
  percentage: number;
  level: 'high' | 'medium' | 'critical';
  total: number;
  correct: number;
}

export interface MasteryEvolution {
  label: string;
  precision: number;
  day: string | null;
}

export interface SubjectMasteryResponse {
  subjects: SubjectMastery[];
  evolution: MasteryEvolution[];
}

export const performanceService = {
  /**
   * Get TRI score history and stats for the current user.
   */
  async getTriScores(): Promise<TriScoreResponse> {
    return request<TriScoreResponse>('/api/performance/tri-scores');
  },

  /**
   * Get subject mastery data calculated from answer history.
   */
  async getSubjectMastery(): Promise<SubjectMasteryResponse> {
    return request<SubjectMasteryResponse>('/api/performance/subject-mastery');
  },
};
