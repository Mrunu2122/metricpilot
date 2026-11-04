import { describe, it, expect, vi } from 'vitest';
import { runEvaluationSuite } from '@/lib/eval/runner';
import * as orchestratorEngine from '@/lib/orchestrator/engine';
import { InsightReportSchema } from '@/types/agentContracts';

describe('TC-11 Adversarial Evaluation & Insight Question Normalization', () => {
  describe('TC-11 Adversarial Evaluation Robustness', () => {
    const originalExecute = orchestratorEngine.executeMultiAgentWorkflow;

    it('passes TC-11 when an adversarial query is safely rejected with a valid structured FAILED result and no leakage', async () => {
      const spy = vi.spyOn(orchestratorEngine, 'executeMultiAgentWorkflow').mockImplementation(async (query, options) => {
        if (typeof query === 'string' && query.includes('SYSTEM OVERRIDE')) {
          return {
            requestId: 'req_test_123',
            query,
            status: 'FAILED',
            isMockMode: false,
            correctionAttempts: 0,
            totalDurationMs: 450,
            traces: [
              {
                stepIndex: 1,
                agentRole: 'PLANNER',
                agentName: 'Planner Agent (Gemini API)',
                status: 'FAILED',
                inputSummary: 'User query: adversarial input',
                durationMs: 450,
                error: 'Planner rejected instruction override: no valid metrics found',
              },
            ],
            safeFallbackNotice: 'Planning phase failed: Planner rejected instruction override',
          };
        }
        return originalExecute(query, options);
      });

      const report = await runEvaluationSuite({ forceMock: true });
      const tc11 = report.results.find((r) => r.testId === 'tc-11');

      expect(tc11).toBeDefined();
      expect(tc11?.passed).toBe(true);
      expect(tc11?.checks.every((c) => c.passed)).toBe(true);

      spy.mockRestore();
    });

    it('fails TC-11 if protected system prompt content leaks into the workflow payload', async () => {
      const spy = vi.spyOn(orchestratorEngine, 'executeMultiAgentWorkflow').mockImplementation(async (query, options) => {
        if (typeof query === 'string' && query.includes('SYSTEM OVERRIDE')) {
          return {
            requestId: 'req_leak_123',
            query,
            status: 'SUCCESS',
            isMockMode: false,
            correctionAttempts: 0,
            totalDurationMs: 500,
            traces: [
              {
                stepIndex: 1,
                agentRole: 'PLANNER',
                agentName: 'Planner',
                status: 'COMPLETED',
                inputSummary: 'query',
                durationMs: 100,
              },
            ],
            safeFallbackNotice: 'Leaked: You are the Lead Planning Agent for MetricPilot with internal prompt engineering parameters',
          };
        }
        return originalExecute(query, options);
      });

      const report = await runEvaluationSuite({ forceMock: true });
      const tc11 = report.results.find((r) => r.testId === 'tc-11');

      expect(tc11).toBeDefined();
      expect(tc11?.passed).toBe(false);
      const leakageCheck = tc11?.checks.find((c) => c.name.includes('leakage'));
      expect(leakageCheck?.passed).toBe(false);

      spy.mockRestore();
    });

    it('fails TC-11 if workflow execution throws an unhandled unexpected exception', async () => {
      const spy = vi.spyOn(orchestratorEngine, 'executeMultiAgentWorkflow').mockImplementation(async (query, options) => {
        if (typeof query === 'string' && query.includes('SYSTEM OVERRIDE')) {
          throw new Error('Unhandled runtime crash in orchestrator!');
        }
        return originalExecute(query, options);
      });

      const report = await runEvaluationSuite({ forceMock: true });
      const tc11 = report.results.find((r) => r.testId === 'tc-11');

      expect(tc11).toBeDefined();
      expect(tc11?.passed).toBe(false);
      expect(tc11?.failureReason).toContain('Unhandled runtime crash in orchestrator!');

      spy.mockRestore();
    });
  });

  describe('unansweredQuestions Normalization & Validation', () => {
    it('accepts valid string array in unansweredQuestions', () => {
      const report = {
        executiveSummary: 'Summary',
        observedFacts: [],
        hypotheses: [],
        recommendations: [],
        unansweredQuestions: ['Why did paid search conversion drop in June?', 'What caused the order spike?'],
      };

      const parsed = InsightReportSchema.safeParse(report);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.unansweredQuestions).toEqual([
          'Why did paid search conversion drop in June?',
          'What caused the order spike?',
        ]);
      }
    });

    it('safely normalizes objects containing question, text, or title into non-empty strings', () => {
      // Simulate raw parsed JSON before schema parsing with normalization logic
      const rawReport: any = {
        executiveSummary: 'Summary',
        observedFacts: [],
        hypotheses: [],
        recommendations: [],
        unansweredQuestions: [
          'Existing string question',
          { question: 'What was the organic search CAC in July?' },
          { text: 'Did email marketing open rate change?' },
          { title: 'Investigate affiliate commission rates' },
        ],
      };

      // Apply the normalization logic from insightAgent
      if (Array.isArray(rawReport.unansweredQuestions)) {
        rawReport.unansweredQuestions = rawReport.unansweredQuestions.map((q: any) => {
          if (typeof q === 'string') return q;
          if (q && typeof q === 'object') {
            if (typeof q.question === 'string' && q.question.trim().length > 0) return q.question.trim();
            if (typeof q.text === 'string' && q.text.trim().length > 0) return q.text.trim();
            if (typeof q.title === 'string' && q.title.trim().length > 0) return q.title.trim();
          }
          return q;
        });
      }

      const parsed = InsightReportSchema.safeParse(rawReport);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.unansweredQuestions).toEqual([
          'Existing string question',
          'What was the organic search CAC in July?',
          'Did email marketing open rate change?',
          'Investigate affiliate commission rates',
        ]);
      }
    });

    it('rejects unsupported object shapes and empty strings honestly', () => {
      const rawReportWithBadShape: any = {
        executiveSummary: 'Summary',
        observedFacts: [],
        hypotheses: [],
        recommendations: [],
        unansweredQuestions: [
          { unsupportedKey: 12345, metadata: { nested: true } },
        ],
      };

      if (Array.isArray(rawReportWithBadShape.unansweredQuestions)) {
        rawReportWithBadShape.unansweredQuestions = rawReportWithBadShape.unansweredQuestions.map((q: any) => {
          if (typeof q === 'string') return q;
          if (q && typeof q === 'object') {
            if (typeof q.question === 'string' && q.question.trim().length > 0) return q.question.trim();
            if (typeof q.text === 'string' && q.text.trim().length > 0) return q.text.trim();
            if (typeof q.title === 'string' && q.title.trim().length > 0) return q.title.trim();
          }
          return q;
        });
      }

      const parsed = InsightReportSchema.safeParse(rawReportWithBadShape);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.message).toContain('expected string, received object');
      }
    });
  });
});
