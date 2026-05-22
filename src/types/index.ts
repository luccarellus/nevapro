export interface Question {
  id: string;
  subject: string;
  text: string;
  options: string[];
  optionImages?: (string | null)[];
  imageUrl?: string;
  correctOptionIndex: number;
  explanation: string;
  difficulty: 'fácil' | 'médio' | 'difícil';
  xpReward: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  level: number;
  xp: number;
  nextLevelXp: number;
  currentLevelMinXp?: number;
  rank: number;
  answeredQuestions?: number;
  correctAnswers?: number;
  streak?: number;
  rewards?: Reward[];
  role: 'student' | 'admin';
  city?: string;
  school?: string;
  gremio?: string;
  languagePreference?: 'ingles' | 'espanhol';
  showInLeaderboard?: boolean;
  emailNotifications?: boolean;
  browserNotifications?: boolean;
  isFlashQuizUpdate?: boolean;
  flashQuizCompleted?: boolean;
  xpReason?: string;
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  date: string;
  sender: string;
  category: 'importante' | 'geral' | 'dica' | 'estudos' | 'apoio';
  tag?: string;
}

export interface Simulado {
  id: string;
  title: string;
  description: string;
  year: number;
  totalQuestions: number;
  durationMinutes: number;
  xpReward: number;
}

export interface StudyEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  type: string;
  category: string;
  questionsCount?: number;
  xpReward?: number;
  observation?: string;
}

export interface Material {
  id: string;
  title: string;
  subject?: string;
  foco?: string;
  description?: string;
  url: string;
  type: 'pdf' | 'video' | 'link';
  uploadedAt: string;
}

export interface RankingEntry {
  userId: string;
  name: string;
  xp: number;
  level: number;
  avatar?: string;
}

export interface Reward {
  id: string;
  title: string;
  description: string;
  priceXp?: number;
  icon: string;
  unlocked: boolean;
}
