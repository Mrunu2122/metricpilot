import { describe, it, expect } from 'vitest';
import {
  verifyClaimsDeterministically,
  evaluateFactAgainstEvidence,
} from '../verificationAgent';
import { EvidenceItem, InsightReport } from '@/types/agentContracts';

describe('Harden Deterministic Verification Agent', () => {
  const sampleEvidence: EvidenceItem[] = [
    {
      id: 'ev-1',
      taskId: 'task-1',
      tool: 'compare_periods',
      parameters: { metric: 'revenue', baseMonth: '2024-06', targetMonth: '2024-07' },
      sourceRef: 'ref:compare:2024-06_vs_2024-07:all:revenue',
      summary: 'revenue went from 640000 (2024-06) to 580000 (2024-07) [delta: -60000, -9.38%]',
      result: {
        success: true,
        metric: 'revenue',
        channel: 'all',
        basePeriod: { month: '2024-06', label: 'June 2024', value: 640000 },
        targetPeriod: { month: '2024-07', label: 'July 2024', value: 580000 },
        delta: -60000,
        percentageChange: -9.38,
        direction: 'decreased',
        ref: 'ref:compare:2024-06_vs_2024-07:all:revenue',
      },
    },
    {
      id: 'ev-2',
      taskId: 'task-2',
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
    {
      id: 'ev-3',
      taskId: 'task-3',
      tool: 'get_bottom_performers',
      parameters: { month: '2024-07', rankingMetric: 'roas', limit: 2 },
      sourceRef: 'ref:bottom:2024-07:roas',
      summary: 'Bottom performers by roas: paid_social, affiliate',
      result: {
        success: true,
        month: '2024-07',
        rankingMetric: 'roas',
        performers: [
          {
            channel: 'paid_social',
            metricValue: 1.86,
            revenue: 65000,
            spend: 35000,
            roas: 1.86,
            cac: 141.67,
            conversionRate: 1.8,
          },
        ],
        ref: 'ref:bottom:2024-07:roas',
      },
    },
  ];

  it('verifies a correct revenue claim', () => {
    const report: InsightReport = {
      executiveSummary: 'Revenue decreased in July.',
      observedFacts: [
        {
          claim: 'Revenue decreased to $580,000 in July 2024',
          metric: 'revenue',
          value: '$580,000',
          evidenceRef: 'ref:2024-07:revenue',
        },
      ],
      hypotheses: [],
      recommendations: [],
      unansweredQuestions: [],
    };

    const res = verifyClaimsDeterministically(report, sampleEvidence);
    expect(res.passed).toBe(true);
    expect(res.verifiedClaims.length).toBe(1);
    expect(res.unsupportedClaims.length).toBe(0);
    expect(res.overallScore).toBe(100);
  });

  it('rejects an incorrect revenue value', () => {
    const report: InsightReport = {
      executiveSummary: 'Revenue anomaly.',
      observedFacts: [
        {
          claim: 'Revenue decreased to $450,000 in July 2024',
          metric: 'revenue',
          value: '$450,000',
          evidenceRef: 'ref:2024-07:revenue',
        },
      ],
      hypotheses: [],
      recommendations: [],
      unansweredQuestions: [],
    };

    const res = verifyClaimsDeterministically(report, sampleEvidence);
    expect(res.passed).toBe(false);
    expect(res.unsupportedClaims.length).toBe(1);
    expect(res.unsupportedClaims[0].status).toBe('CONTRADICTED');
    expect(res.unsupportedClaims[0].discrepancyNote).toContain('Numerical mismatch');
  });

  it('rejects a claim with correct value but incorrect direction', () => {
    const report: InsightReport = {
      executiveSummary: 'Revenue anomaly.',
      observedFacts: [
        {
          claim: 'Revenue grew significantly to $580,000 in July 2024',
          metric: 'revenue',
          value: '$580,000',
          evidenceRef: 'ref:compare:2024-06_vs_2024-07:all:revenue',
        },
      ],
      hypotheses: [],
      recommendations: [],
      unansweredQuestions: [],
    };

    const res = verifyClaimsDeterministically(report, sampleEvidence);
    expect(res.passed).toBe(false);
    expect(res.unsupportedClaims.length).toBe(1);
    expect(res.unsupportedClaims[0].status).toBe('CONTRADICTED');
    expect(res.unsupportedClaims[0].discrepancyNote).toContain('Direction contradiction');
  });

  it('rejects a correct number attached to the wrong metric', () => {
    const report: InsightReport = {
      executiveSummary: 'Marketing spend audit.',
      observedFacts: [
        {
          claim: 'Marketing spend was $580,000 in July 2024',
          metric: 'marketingSpend',
          value: '$580,000',
          evidenceRef: 'ref:2024-07:revenue',
        },
      ],
      hypotheses: [],
      recommendations: [],
      unansweredQuestions: [],
    };

    const res = verifyClaimsDeterministically(report, sampleEvidence);
    expect(res.passed).toBe(false);
    expect(res.unsupportedClaims.length).toBe(1);
    expect(res.unsupportedClaims[0].status).toBe('CONTRADICTED');
    expect(res.unsupportedClaims[0].discrepancyNote).toContain('Metric mismatch');
  });

  it('rejects a claim when evidence reference is missing or invalid', () => {
    const report: InsightReport = {
      executiveSummary: 'Missing evidence ref.',
      observedFacts: [
        {
          claim: 'Revenue was $580,000',
          metric: 'revenue',
          value: '$580,000',
          evidenceRef: 'ref:does_not_exist',
        },
      ],
      hypotheses: [],
      recommendations: [],
      unansweredQuestions: [],
    };

    const res = verifyClaimsDeterministically(report, sampleEvidence);
    expect(res.passed).toBe(false);
    expect(res.unsupportedClaims.length).toBe(1);
    expect(res.unsupportedClaims[0].status).toBe('UNSUPPORTED');
    expect(res.unsupportedClaims[0].discrepancyNote).toContain('does not exist');
  });

  it('rejects fabricated low-number claims such as 2 or 50 (which previously bypassed substring checks)', () => {
    const report: InsightReport = {
      executiveSummary: 'Fabricated small integers.',
      observedFacts: [
        {
          claim: 'Revenue dropped by 2 dollars',
          metric: 'revenue',
          value: '2',
          evidenceRef: 'ref:compare:2024-06_vs_2024-07:all:revenue',
        },
        {
          claim: 'Revenue dropped by 50 percent',
          metric: 'revenue',
          value: '50%',
          evidenceRef: 'ref:compare:2024-06_vs_2024-07:all:revenue',
        },
      ],
      hypotheses: [],
      recommendations: [],
      unansweredQuestions: [],
    };

    const res = verifyClaimsDeterministically(report, sampleEvidence);
    expect(res.passed).toBe(false);
    expect(res.unsupportedClaims.length).toBe(2);
    expect(res.unsupportedClaims[0].status).toBe('CONTRADICTED');
    expect(res.unsupportedClaims[1].status).toBe('CONTRADICTED');
  });

  it('rejects an incorrect percentage change', () => {
    const report: InsightReport = {
      executiveSummary: 'Incorrect percentage change.',
      observedFacts: [
        {
          claim: 'Revenue decreased by 18.5%',
          metric: 'revenue',
          value: '18.5%',
          evidenceRef: 'ref:compare:2024-06_vs_2024-07:all:revenue',
        },
      ],
      hypotheses: [],
      recommendations: [],
      unansweredQuestions: [],
    };

    const res = verifyClaimsDeterministically(report, sampleEvidence);
    expect(res.passed).toBe(false);
    expect(res.unsupportedClaims.length).toBe(1);
    expect(res.unsupportedClaims[0].status).toBe('CONTRADICTED');
  });

  it('accepts correct claims with legitimate floating-point rounding', () => {
    const report: InsightReport = {
      executiveSummary: 'Legitimate rounding check.',
      observedFacts: [
        {
          claim: 'Revenue decreased by 9.38%',
          metric: 'revenue',
          value: '9.38%',
          evidenceRef: 'ref:compare:2024-06_vs_2024-07:all:revenue',
        },
        {
          claim: 'Paid Social ROAS was 1.86x',
          metric: 'roas',
          value: '1.86x',
          evidenceRef: 'ref:bottom:2024-07:roas',
        },
        {
          claim: 'Paid Social CAC was $141.67',
          metric: 'cac',
          value: '$141.67',
          evidenceRef: 'ref:bottom:2024-07:roas',
        },
      ],
      hypotheses: [],
      recommendations: [],
      unansweredQuestions: [],
    };

    const res = verifyClaimsDeterministically(report, sampleEvidence);
    expect(res.passed).toBe(true);
    expect(res.verifiedClaims.length).toBe(3);
    expect(res.unsupportedClaims.length).toBe(0);
  });
});
