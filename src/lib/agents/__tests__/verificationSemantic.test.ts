import { describe, it, expect } from 'vitest';
import {
  verifyClaimsDeterministically,
} from '../verificationAgent';
import { EvidenceItem, InsightReport } from '@/types/agentContracts';

describe('Phase 1.1: Verification Tolerance and Semantic Matching', () => {
  const sampleEvidence: EvidenceItem[] = [
    {
      id: 'ev-comp-rev',
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
      id: 'ev-metric-rev',
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
      id: 'ev-metric-orders',
      taskId: 'task-orders',
      tool: 'get_metric',
      parameters: { metric: 'orders', month: '2024-07' },
      sourceRef: 'ref:2024-07:orders',
      summary: 'orders for 2024-07 was 5400',
      result: {
        success: true,
        month: '2024-07',
        monthLabel: 'July 2024',
        metric: 'orders',
        value: 5400,
        currency: 'count',
        ref: 'ref:2024-07:orders',
      },
    },
    {
      id: 'ev-bottom-roas',
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

  // Regression Test 1: $582,900 when actual revenue is $580,000 must be rejected
  it('1. rejects $582,900 when actual revenue is $580,000 (eliminates 0.5% tolerance flaw)', () => {
    const report: InsightReport = {
      executiveSummary: 'Revenue test.',
      observedFacts: [
        {
          claim: 'Revenue reached $582,900 in July 2024',
          metric: 'revenue',
          value: '$582,900',
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

  // Regression Test 2: June revenue of $580,000 when actual June is $640,000 and July is $580,000
  it('2. rejects June revenue claimed as $580,000 (prevents period attribution bypass)', () => {
    const report: InsightReport = {
      executiveSummary: 'Base period misattribution test.',
      observedFacts: [
        {
          claim: 'Revenue was $580,000 in June 2024',
          metric: 'revenue',
          value: '$580,000',
          evidenceRef: 'ref:compare:2024-06_vs_2024-07:all:revenue',
          period: '2024-06',
          assertionType: 'base_period',
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
    expect(res.unsupportedClaims[0].discrepancyNote).toContain('Period value mismatch');
  });

  // Regression Test 3: A claim assigning ROAS 1.86 to CAC
  it('3. rejects a claim assigning ROAS 1.86 to CAC (cross-metric field pooling rejection)', () => {
    const report: InsightReport = {
      executiveSummary: 'Cross-metric field attribution.',
      observedFacts: [
        {
          claim: 'Paid Social CAC was $1.86',
          metric: 'cac',
          value: '$1.86',
          evidenceRef: 'ref:bottom:2024-07:roas',
          channel: 'paid_social',
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
    expect(res.unsupportedClaims[0].discrepancyNote).toContain('Metric value mismatch');
  });

  // Regression Test 4: A positive increase claim when evidence shows a decrease
  it('4. rejects a positive increase claim when evidence shows a decrease (no Math.abs sign bypass)', () => {
    const report: InsightReport = {
      executiveSummary: 'Sign and direction inversion test.',
      observedFacts: [
        {
          claim: 'Revenue increased by $60,000 between June and July',
          metric: 'revenue',
          value: '$60,000',
          evidenceRef: 'ref:compare:2024-06_vs_2024-07:all:revenue',
          assertionType: 'delta',
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

  // Regression Test 5: A percentage claim matched against an absolute dollar delta
  it('5. rejects a percentage claim matched against an absolute dollar delta', () => {
    const report: InsightReport = {
      executiveSummary: 'Semantic category confusion test.',
      observedFacts: [
        {
          claim: 'Revenue dropped by 60,000%',
          metric: 'revenue',
          value: '60,000%',
          evidenceRef: 'ref:compare:2024-06_vs_2024-07:all:revenue',
          assertionType: 'percentage_change',
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
    expect(res.unsupportedClaims[0].discrepancyNote).toContain('Percentage change mismatch');
  });

  // Regression Test 6: An integer count that differs from ground truth
  it('6. rejects an integer count (orders) that differs from ground truth', () => {
    const report: InsightReport = {
      executiveSummary: 'Integer discrete count test.',
      observedFacts: [
        {
          claim: 'Total orders placed in July 2024 was 5,405',
          metric: 'orders',
          value: '5,405',
          evidenceRef: 'ref:2024-07:orders',
          period: '2024-07',
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

  // Positive Acceptance: Legitimate formatting and rounding
  it('7. accepts legitimate formatting, currency symbols, and ratio rounding', () => {
    const report: InsightReport = {
      executiveSummary: 'Valid formats test.',
      observedFacts: [
        {
          claim: 'Revenue decreased to $580,000 in July 2024',
          metric: 'revenue',
          value: '$580,000',
          evidenceRef: 'ref:2024-07:revenue',
          period: '2024-07',
          assertionType: 'point_in_time',
        },
        {
          claim: 'June revenue was $640,000',
          metric: 'revenue',
          value: '$640,000',
          evidenceRef: 'ref:compare:2024-06_vs_2024-07:all:revenue',
          period: '2024-06',
          assertionType: 'base_period',
        },
        {
          claim: 'Revenue decreased by 9.38% (or -9.38%)',
          metric: 'revenue',
          value: '-9.38%',
          evidenceRef: 'ref:compare:2024-06_vs_2024-07:all:revenue',
          assertionType: 'percentage_change',
        },
        {
          claim: 'Paid Social ROAS was 1.86x',
          metric: 'roas',
          value: '1.86x',
          evidenceRef: 'ref:bottom:2024-07:roas',
          channel: 'paid_social',
        },
        {
          claim: 'Total orders was 5,400',
          metric: 'orders',
          value: '5,400',
          evidenceRef: 'ref:2024-07:orders',
          period: '2024-07',
        },
      ],
      hypotheses: [],
      recommendations: [],
      unansweredQuestions: [],
    };

    const res = verifyClaimsDeterministically(report, sampleEvidence);
    expect(res.passed).toBe(true);
    expect(res.verifiedClaims.length).toBe(5);
    expect(res.unsupportedClaims.length).toBe(0);
    expect(res.overallScore).toBe(100);
  });
});
