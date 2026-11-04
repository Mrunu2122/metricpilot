import { describe, it, expect } from 'vitest';
import { sanitizeGeminiError } from '../gemini';

describe('sanitizeGeminiError', () => {
  it('classifies 429 as RATE_LIMIT and transient', () => {
    const err = { status: 429, message: 'Resource has been exhausted' };
    const res = sanitizeGeminiError(err);
    expect(res.category).toBe('RATE_LIMIT');
    expect(res.isTransient).toBe(true);
    expect(res.status).toBe(429);
  });

  it('classifies 503 as SERVER_ERROR and transient', () => {
    const err = { status: 503, message: 'The service is currently unavailable' };
    const res = sanitizeGeminiError(err);
    expect(res.category).toBe('SERVER_ERROR');
    expect(res.isTransient).toBe(true);
    expect(res.status).toBe(503);
  });

  it('classifies 404 as MODEL_UNAVAILABLE and not transient', () => {
    const err = {
      message: JSON.stringify({
        error: {
          code: 404,
          message: 'This model models/gemini-2.5-flash is no longer available to new users.',
          status: 'NOT_FOUND',
        },
      }),
    };
    const res = sanitizeGeminiError(err);
    expect(res.category).toBe('MODEL_UNAVAILABLE');
    expect(res.isTransient).toBe(false);
    expect(res.status).toBe(404);
  });

  it('classifies 401/403 as AUTHENTICATION and not transient', () => {
    const err = { status: 403, message: 'API_KEY_INVALID' };
    const res = sanitizeGeminiError(err);
    expect(res.category).toBe('AUTHENTICATION');
    expect(res.isTransient).toBe(false);
    expect(res.status).toBe(403);
  });

  it('redacts API keys and secret strings from messages', () => {
    const err = {
      status: 400,
      message: 'Failed request with key=secretKey123 and AIzaSyD12345678901234567890123456789012 in query',
    };
    const res = sanitizeGeminiError(err);
    expect(res.message).not.toContain('AIzaSyD12345678901234567890123456789012');
    expect(res.message).toContain('[REDACTED_API_KEY]');
    expect(res.message).toContain('key=[REDACTED]');
  });
});
