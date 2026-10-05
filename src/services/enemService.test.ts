import { afterEach, describe, expect, it, vi } from 'vitest';
import { enemService } from './enemService';

describe('enemService question pool cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reuses a successfully loaded year pool for later visits', async () => {
    const question = {
      index: 1,
      discipline: 'Matemática',
      context: 'Enunciado de teste',
      alternativesIntroduction: '',
      files: [],
      alternatives: [
        { letter: 'A', text: 'Alternativa A', file: null },
        { letter: 'B', text: 'Alternativa B', file: null },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(JSON.stringify({
        questions: url.startsWith('/api/questoes?') ? [question] : [],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const firstPool = await enemService.getQuestionsByYear(2009);
    const secondPool = await enemService.getQuestionsByYear(2009);

    expect(firstPool).toHaveLength(1);
    expect(secondPool).toEqual(firstPool);
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('offset=200'))).toBe(false);
  });
});
