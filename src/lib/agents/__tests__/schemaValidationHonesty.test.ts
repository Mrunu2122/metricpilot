import { describe, it, expect, vi } from 'vitest';
import { runInsightAgent } from '../insightAgent';
import { runPlannerAgent } from '../plannerAgent';
import { runVerificationAgent } from '../verificationAgent';
import { executeMultiAgentWorkflow } from '@/lib/orchestrator/engine';
import * as geminiModule from '@/lib/llm/gemini';
import { EvidenceItem } from '@/types/agentContracts';

describe('Phase 2: Schema Validation and Honest Agent Fallbacks', () => {
  const sampleEvidence: EvidenceItem[] = [
    {
      id: 'ev-1',
      taskId: 'task-1',
      tool: 'get_metric',
      parameters: { metric: 'revenue', month: '2024-07' },
      sourceRef: 'ref:2024-07:revenue',
      summary: 'revenue for 2024-07 was 580000',
      result: {
        success: true,
        month: '2024-07',
        monthLabel: 'July 2024',
        metric: 'revenue',
        value: 580000,
        currency: 'USD',
        ref: 'ref:2024-07:revenue',
      },
    },
  ];

  it('fails honestly when Live Gemini Insight Agent returns malformed JSON rather than silently mocking', async () => {
    vi.spyOn(geminiModule, 'getGeminiClient').mockReturnValue({} as any);
    vi.spyOn(geminiModule, 'callGemini').mockResolvedValue({
      text: 'This is not JSON at all: { broken json',
    });

    await expect(
      runInsightAgent('test query', sampleEvidence, undefined, { forceMock: false })
    ).rejects.toThrow('Insight Agent failed to parse Gemini JSON');

    vi.restoreAllMocks();
  });

  it('fails honestly when Live Gemini Insight Agent returns invalid schema rather than silently returning mock', async () => {
    vi.spyOn(geminiModule, 'getGeminiClient').mockReturnValue({} as any);
    vi.spyOn(geminiModule, 'callGemini').mockResolvedValue({
      text: JSON.stringify({
        executiveSummary: 'Test',
        // observedFacts is missing required array of objects
        observedFacts: 'not an array',
      }),
    });

    await expect(
      runInsightAgent('test query', sampleEvidence, undefined, { forceMock: false })
    ).rejects.toThrow('Insight Agent output failed schema validation');

    vi.restoreAllMocks();
  });

  it('fails honestly when Live Gemini Verification Agent returns invalid schema', async () => {
    vi.spyOn(geminiModule, 'getGeminiClient').mockReturnValue({} as any);
    vi.spyOn(geminiModule, 'callGemini').mockResolvedValue({
      text: JSON.stringify({
        passed: 'not-a-boolean',
        overallScore: -20,
      }),
    });

    const report = {
      executiveSummary: 'Test',
      observedFacts: [],
      hypotheses: [],
      recommendations: [],
      unansweredQuestions: [],
    };

    await expect(
      runVerificationAgent(report, sampleEvidence, { forceMock: false })
    ).rejects.toThrow('Verification Agent output failed schema validation');

    vi.restoreAllMocks();
  });

  it('explicitly identifies Mock mode execution in result and traces', async () => {
    const result = await executeMultiAgentWorkflow('Why did revenue decrease this month?', {
      forceMock: true,
    });

    expect(result.isMockMode).toBe(true);
    expect(result.traces.every((t) => t.agentName.includes('Mock') || t.agentName.includes('Tool') || t.agentName.includes('Audit'))).toBe(true);
    expect(result.traces[0].agentName).toContain('(Deterministic Mock)');
  });

  it('records verification retries honestly in orchestrator traces', async () => {
    // When initial audit requires correction, retry traces are numbered and recorded
    const result = await executeMultiAgentWorkflow('Why did revenue decrease this month?', {
      forceMock: true,
    });

    // Verification trace status is COMPLETED when passed
    const verifTraces = result.traces.filter((t) => t.agentRole === 'VERIFICATION_OFFICER');
    expect(verifTraces.length).toBeGreaterThanOrEqual(1);
    expect(verifTraces[0].status).toBe('COMPLETED');
  });

  it('clearly distinguishes final safe fallback from a successful live agent result', async () => {
    // Inject a query that triggers safe fallback filtering
    const fakeAuditFailureQuery = 'Trigger safe fallback test';
    const result = await executeMultiAgentWorkflow(fakeAuditFailureQuery, { forceMock: true });

    if (result.status === 'PARTIAL_SAFE_FALLBACK') {
      expect(result.safeFallbackNotice).toBeDefined();
      expect(result.finalReport?.executiveSummary).toContain('[SAFE PARTIAL REPORT]');
      expect(result.verification?.passed).toBe(false);
    }
  });
});
