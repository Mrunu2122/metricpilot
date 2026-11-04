import { describe, it, expect } from 'vitest';
import { runEvaluationSuite } from '@/lib/eval/runner';
import { EVALUATION_TEST_SUITE } from '@/lib/eval/suite';

describe('Phase 4: Evaluation Lab Suite and Mode Handling', () => {
  it('correctly associates executionType metadata for all 13 test cases', () => {
    expect(EVALUATION_TEST_SUITE.length).toBe(13);

    const workflowTests = EVALUATION_TEST_SUITE.filter((t) => t.executionType === 'MULTI_AGENT_WORKFLOW');
    const deterministicTests = EVALUATION_TEST_SUITE.filter((t) => t.executionType === 'DETERMINISTIC_UNIT');

    expect(workflowTests.map((t) => t.id)).toEqual(['tc-05', 'tc-10', 'tc-11']);
    expect(deterministicTests.length).toBe(10);
  });

  it('runs deterministic mock mode and populates isMockMode: true and executionType on all results', async () => {
    const report = await runEvaluationSuite({ forceMock: true });

    expect(report.isMockMode).toBe(true);
    expect(report.totalTests).toBe(13);
    expect(report.passedTests).toBe(13);
    expect(report.overallPassRate).toBe(100);

    for (const res of report.results) {
      expect(['DETERMINISTIC_UNIT', 'MULTI_AGENT_WORKFLOW']).toContain(res.executionType);
      expect(res.durationMs).toBeGreaterThanOrEqual(0);
      expect(res.checks.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('throws an explicit error when Live mode is requested without GEMINI_API_KEY', async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      await expect(runEvaluationSuite({ forceMock: false })).rejects.toThrow(
        'Gemini API key is not configured or is empty'
      );
    } finally {
      if (prevKey) process.env.GEMINI_API_KEY = prevKey;
    }
  });
});
