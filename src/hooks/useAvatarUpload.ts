import { useState } from 'react';

interface UseAvatarUploadOptions {
  email?: string;
  name?: string;
  onSuccess?: (avatarUrl: string) => void;
  onError?: (error: string) => void;
}

interface UseAvatarUploadResult {
  isUploading: boolean;
  error: string;
  uploadAvatar: (file: File) => Promise<string | null>;
}

/**
 * Reusable hook for avatar upload via the API.
 * Handles validation, upload, profile update, and session persistence.
 */
export function useAvatarUpload(options: UseAvatarUploadOptions = {}): UseAvatarUploadResult {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  const uploadAvatar = async (file: File): Promise<string | null> => {
    // Validate
    if (!file) return null;
    if (!file.type.startsWith('image/')) {
      const msg = 'Envie uma imagem PNG, JPG ou GIF.';
      setError(msg);
      options.onError?.(msg);
      return null;
    }

    setIsUploading(true);
    setError('');

    try {
      // 1. Upload file
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => null);
        throw new Error(errData?.error || 'Falha ao enviar foto.');
      }

      const uploadData = await uploadRes.json();
      const avatarUrl = uploadData.url;

      // 2. Update profile with new avatar
      const profileRes = await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: options.email, name: options.name, avatarUrl }),
      });

      if (!profileRes.ok) throw new Error('Falha ao salvar foto no perfil.');

      const profileData = await profileRes.json();

      // 3. Update local session
      const stored = localStorage.getItem('neva_student_session');
      if (stored) {
        try {
          const session = JSON.parse(stored);
          session.avatarUrl = avatarUrl;
          if (profileData.user) {
            Object.assign(session, profileData.user);
          }
          localStorage.setItem('neva_student_session', JSON.stringify(session));
        } catch {
          // Ignore parse errors
        }
      }

      options.onSuccess?.(avatarUrl);
      return avatarUrl;
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível salvar a foto.';
      setError(msg);
      options.onError?.(msg);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  return { isUploading, error, uploadAvatar };
}
