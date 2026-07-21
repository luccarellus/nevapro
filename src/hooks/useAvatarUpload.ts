import { useState } from 'react';
import { uploadService } from '../services/uploadService';
import { userService } from '../services/userService';

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
      const avatarUrl = await uploadService.uploadFile(file, 'Falha ao enviar foto.');

      // 2. Update profile with new avatar (usa userService que já inclui recaptcha_token)
      const profileData = await userService.updateProfile({
        email: options.email,
        name: options.name,
        avatarUrl,
      });

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
