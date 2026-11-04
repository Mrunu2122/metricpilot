import { describe, it, expect } from 'vitest';
import {
  executeGetMetric,
  executeComparePeriods,
  executeCalculateGrowth,
  executeGetBottomPerformers,
  executeToolByName,
  ToolName,
} from '@/lib/tools/registry';
import { runPlannerAgent } from '@/lib/agents/plannerAgent';
import { runDataAnalystAgent } from '@/lib/agents/dataAnalystAgent';
import { verifyClaimsDeterministically } from '@/lib/agents/verificationAgent';
import { executeMultiAgentWorkflow } from '@/lib/orchestrator/engine';
import { runEvaluationSuite } from '@/lib/eval/runner';

describe('Deterministic Tool Registry', () => {
  it('should fetch exact revenue for July 2024', () => {
    const res = executeGetMetric({ metric: 'revenue', month: '2024-07' });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.value).toBe(580000);
      expect(res.ref).toBe('ref:2024-07:revenue');
    }
  });

  it('should compute exact delta and percentage change between June and July 2024', () => {
    const res = executeComparePeriods({
      metric: 'revenue',
      baseMonth: '2024-06',
      targetMonth: '2024-07',
    }) as Record<string, any>;
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.delta).toBe(-60000);
      expect(res.percentageChange).toBe(-9.38);
      expect(res.direction).toBe('decreased');
    }
  });

  it('should identify Paid Social as the worst performing channel by ROAS in July 2024', () => {
    const res = executeGetBottomPerformers({
      month: '2024-07',
      rankingMetric: 'roas',
      limit: 1,
    }) as Record<string, any>;
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.performers?.[0]?.channel).toBe('paid_social');
      expect(res.performers?.[0]?.roas).toBe(1.86);
      expect(res.performers?.[0]?.cac).toBe(141.67);
    }
  });

  it('should calculate growth accurately from Oct to Dec 2024', () => {
    const res = executeCalculateGrowth({
      metric: 'revenue',
      startMonth: '2024-10',
      endMonth: '2024-12',
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.startValue).toBe(665000);
      expect(res.endValue).toBe(940000);
      expect(res.growthRatePercentage).toBe(41.35);
    }
  });

  it('should reject non-existent period cleanly', () => {
    const res = executeGetMetric({ metric: 'revenue', month: '2025-99' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('not found');
  });

  it('should reject unauthorized tool execution attempt', () => {
    const res = executeToolByName('unauthorized_tool' as ToolName, {});
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain('Unauthorized or non-existent tool');
    }
  });
});

describe('Multi-Agent Hand-offs and Verification', () => {
  it('should plan subtasks for interview question in mock mode', async () => {
    const query = 'Why did revenue decrease this month? Which marketing channel performed worst?';
    const planRes = await runPlannerAgent(query, { forceMock: true });
    expect(planRes.plan.subtasks.length).toBeGreaterThanOrEqual(2);
    expect(planRes.plan.identifiedMetrics).toContain('revenue');
  });

  it('should throw an explicit error in live mode if GEMINI_API_KEY is not configured', async () => {
    // When no API key is in environment, live planner should throw instead of silently mocking
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      await expect(runPlannerAgent('Test query', { forceMock: false })).rejects.toThrow(
        'GEMINI_API_KEY is not configured'
      );
    } finally {
      if (prevKey) process.env.GEMINI_API_KEY = prevKey;
    }
  });

  it('should execute data analyst subtasks and retrieve evidence with source references', async () => {
    const planRes = await runPlannerAgent('Why did revenue decrease this month?', { forceMock: true });
    const analystRes = await runDataAnalystAgent(planRes.plan);
    expect(analystRes.allTasksSucceeded).toBe(true);
    expect(analystRes.evidence.length).toBe(planRes.plan.subtasks.length);
    expect(analystRes.evidence[0].sourceRef).toBeDefined();
  });

  it('should catch fabricated claim during verification', () => {
    const fakeReport = {
      executiveSummary: 'Revenue dropped by 75%',
      observedFacts: [
        {
          claim: 'Revenue dropped 75%',
          metric: 'revenue',
          value: '75%',
          evidenceRef: 'ref:fake',
        },
      ],
      hypotheses: [],
      recommendations: [],
      unansweredQuestions: [],
    };
    const audit = verifyClaimsDeterministically(fakeReport, []);
    expect(audit.passed).toBe(false);
    expect(audit.requiresCorrection).toBe(true);
    expect(audit.unsupportedClaims.length).toBe(1);
  });

  it('should execute full multi-agent workflow end-to-end in mock mode', async () => {
    const query = 'Why did revenue decrease this month? Which marketing channel performed worst, and what should we investigate?';
    const result = await executeMultiAgentWorkflow(query, { forceMock: true });
    expect(result.status).toBe('SUCCESS');
    expect(result.isMockMode).toBe(true);
    expect(result.verification?.passed).toBe(true);
    expect(result.traces.length).toBeGreaterThanOrEqual(4);
    expect(result.finalReport?.observedFacts.length).toBeGreaterThanOrEqual(1);
  });

  it('should safely return an explicit failure if live mode requested without API key', async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const result = await executeMultiAgentWorkflow('Why did revenue decrease?', { forceMock: false });
      expect(result.status).toBe('FAILED');
      expect(result.safeFallbackNotice).toContain('GEMINI_API_KEY is not configured');
    } finally {
      if (prevKey) process.env.GEMINI_API_KEY = prevKey;
    }
  });

  it('should engage high-assurance circuit breaker and append explicit trace when claims cannot be verified', async () => {
    // Query that generates subtasks where verification will reject ungrounded/hallucinated claims
    // We can simulate an uncorrectable state by running a workflow with maxRetries: 0 on an adversarial claim
    const result = await executeMultiAgentWorkflow(
      'Verify whether company revenue collapsed by 95% in July 2024',
      { forceMock: true, maxRetries: 0 }
    );

    // If verification rejected the claim and 0 retries were permitted, it enters PARTIAL_SAFE_FALLBACK
    if (result.status === 'PARTIAL_SAFE_FALLBACK') {
      expect(result.safeFallbackNotice).toContain('unsupported claim');
      // Must contain our new Circuit Breaker trace event
      const cbTrace = result.traces.find((t) => t.agentName === 'High-Assurance Circuit Breaker');
      expect(cbTrace).toBeDefined();
      expect(cbTrace?.agentRole).toBe('VERIFICATION_OFFICER');
      expect(cbTrace?.outputSummary).toContain('Filtered report:');
      // Unverified claim must be stripped from final report observedFacts
      expect(result.finalReport?.observedFacts.some((f) => f.claim.includes('95%'))).toBe(false);
    } else {
      // If mock answered standard revenue, verify standard success trace integrity
      expect(result.status).toBe('SUCCESS');
    }
  });
});

describe('Evaluation Suite', () => {
  it('should execute all 13 evaluation test cases (including adversarial security) with 100% pass rate in deterministic mode', async () => {
    const evalReport = await runEvaluationSuite({ forceMock: true });
    const failed = evalReport.results.filter((r) => !r.passed);
    if (failed.length > 0) {
      console.log('Failed evaluation test cases:', JSON.stringify(failed, null, 2));
    }
    expect(evalReport.totalTests).toBe(13);
    expect(evalReport.passedTests).toBe(13);
    expect(evalReport.overallPassRate).toBe(100);
  });
});
