import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as orchestrateHandler } from '@/app/api/orchestrate/route';
import { GET as configHandler } from '@/app/api/config/route';

describe('Phase 5 API Route Hardening & Validation', () => {
  describe('POST /api/orchestrate', () => {
    it('accepts a valid mock request and returns an orchestration result', async () => {
      const req = new NextRequest('http://localhost:3000/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'Why did revenue decrease this month?',
          mode: 'mock',
        }),
      });

      const res = await orchestrateHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('SUCCESS');
      expect(json.isMockMode).toBe(true);
      expect(json.query).toBe('Why did revenue decrease this month?');
      expect(json.traces.length).toBeGreaterThanOrEqual(4);
    });

    it('defaults mode to "mock" when omitted in a valid request', async () => {
      const req = new NextRequest('http://localhost:3000/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'Compare monthly revenue between June and July 2024',
        }),
      });

      const res = await orchestrateHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.isMockMode).toBe(true);
    });

    it('rejects a request with an empty query with HTTP 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '   ', mode: 'mock' }),
      });

      const res = await orchestrateHandler(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toMatch(/cannot be empty|required/i);
    });

    it('rejects a request with missing query with HTTP 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'mock' }),
      });

      const res = await orchestrateHandler(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toMatch(/query/i);
    });

    it('rejects an invalid mode with HTTP 400 and never triggers execution', async () => {
      const req = new NextRequest('http://localhost:3000/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'What was our revenue in July?',
          mode: 'unauthorized_mode',
        }),
      });

      const res = await orchestrateHandler(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Mode must be either "mock" or "live"');
    });

    it('rejects a query that exceeds the maximum length of 2000 characters', async () => {
      const hugeQuery = 'A'.repeat(2005);
      const req = new NextRequest('http://localhost:3000/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: hugeQuery, mode: 'mock' }),
      });

      const res = await orchestrateHandler(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('maximum allowed length');
    });

    it('rejects malformed or unparseable JSON with HTTP 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json-{broken',
      });

      const res = await orchestrateHandler(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('Invalid JSON request body');
    });

    it('fails honestly when Live mode is requested without configured GEMINI_API_KEY', async () => {
      const prevKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      try {
        const req = new NextRequest('http://localhost:3000/api/orchestrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'Live query without API key',
            mode: 'live',
          }),
        });

        const res = await orchestrateHandler(req);
        // Orchestrator returns status FAILED with safeFallbackNotice explaining missing API key
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.status).toBe('FAILED');
        expect(json.safeFallbackNotice).toContain('GEMINI_API_KEY is not configured');
      } finally {
        if (prevKey) process.env.GEMINI_API_KEY = prevKey;
      }
    });
  });

  describe('GET /api/config Security Integrity', () => {
    it('returns configuration status without exposing GEMINI_API_KEY value', async () => {
      const res = await configHandler();
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('geminiConfigured');
      expect(body).toHaveProperty('configuredModel');
      expect(body).toHaveProperty('modes');
      expect(body).toHaveProperty('diagnostics');

      const serialized = JSON.stringify(body);
      const secret = process.env.GEMINI_API_KEY;
      if (secret && secret !== 'YOUR_GEMINI_API_KEY') {
        expect(serialized).not.toContain(secret);
      }

      // Check diagnostics structure contains safe booleans only
      expect(typeof body.diagnostics.keyEnvExists).toBe('boolean');
      expect(typeof body.diagnostics.keyNonEmpty).toBe('boolean');
    });
  });
});
