export type ConsentCategory = 'necessary' | 'analytics' | 'marketing' | 'preferences';

export interface ConsentPreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  updatedAt: number;
}

export interface ConsentLog {
  id: string;
  preferences: ConsentPreferences;
  userAgent: string;
  timestamp: number;
  ip_anonymized: string;
}
