interface UploadResponse {
  url: string;
}

const getUploadError = async (response: Response, fallbackMessage: string): Promise<Error> => {
  const payload = await response.json().catch(() => null);
  return new Error(payload?.error || fallbackMessage);
};

export const uploadService = {
  async uploadFile(
    file: File,
    fallbackMessage = 'Falha no upload',
    useServerError = true,
    kind: 'avatar' | 'material' = 'avatar'
  ): Promise<string> {
    if (kind === 'avatar' && file.size > 2 * 1024 * 1024) {
      throw new Error('A foto de perfil deve ter no máximo 2 MB.');
    }
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`/api/upload?kind=${kind}`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw useServerError
        ? await getUploadError(response, fallbackMessage)
        : new Error(fallbackMessage);
    }

    const payload = await response.json() as UploadResponse;
    return payload.url;
  }
};
