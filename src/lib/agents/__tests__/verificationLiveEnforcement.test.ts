import { describe, it, expect } from 'vitest';
import { verifyClaimsDeterministically } from '../verificationAgent';
import { EvidenceItem, InsightReport } from '@/types/agentContracts';

describe('Phase 1.2: Enforce Structured Semantic Claims in Live Gemini', () => {
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
          {
            channel: 'affiliate',
            metricValue: 2.15,
            revenue: 43000,
            spend: 20000,
            roas: 2.15,
            cac: 90.5,
            conversionRate: 2.1,
          },
        ],
        ref: 'ref:bottom:2024-07:roas',
      },
    },
  ];

  // 1. Valid live-style structured claims
  it('1. accepts fully valid live-style structured claims with complete metadata', () => {
    const report: InsightReport = {
      executiveSummary: 'Valid structured report.',
      observedFacts: [
        {
          claim: 'Revenue was $580,000 in July 2024',
          metric: 'revenue',
          value: 580000,
          period: '2024-07',
          assertionType: 'point_in_time',
          evidenceRef: 'ref:2024-07:revenue',
        },
        {
          claim: 'Revenue decreased by $60,000 between June and July 2024',
          metric: 'revenue',
          value: -60000,
          assertionType: 'delta',
          evidenceRef: 'ref:compare:2024-06_vs_2024-07:all:revenue',
        },
        {
          claim: 'Revenue decreased by 9.38%',
          metric: 'revenue',
          value: -9.38,
          assertionType: 'percentage_change',
          evidenceRef: 'ref:compare:2024-06_vs_2024-07:all:revenue',
        },
        {
          claim: 'Paid Social ROAS was 1.86 in July 2024',
          metric: 'roas',
          value: 1.86,
          channel: 'paid_social',
          assertionType: 'channel_metric',
          evidenceRef: 'ref:bottom:2024-07:roas',
        },
      ],
      hypotheses: [],
      recommendations: [],
      unansweredQuestions: [],
    };

    const res = verifyClaimsDeterministically(report, sampleEvidence);
    expect(res.passed).toBe(true);
    expect(res.verifiedClaims.length).toBe(4);
    expect(res.unsupportedClaims.length).toBe(0);
    expect(res.overallScore).toBe(100);
  });

  // 2. Missing period metadata for period-specific claims
  it('2. rejects ambiguous claim when period metadata is missing on a comparison reference', () => {
    const report: InsightReport = {
      executiveSummary: 'Ambiguous period test.',
      observedFacts: [
        {
          claim: 'Revenue reached 580000', // No mention of month in text, no period in metadata
          metric: 'revenue',
          value: 580000,
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
    expect(res.unsupportedClaims[0].status).toBe('UNSUPPORTED');
    expect(res.unsupportedClaims[0].discrepancyNote).toContain('Ambiguous claim');
  });

  // 3. Missing channel metadata for channel-specific claims
  it('3. rejects claim when channel metadata is missing on multi-channel performer evidence', () => {
    const report: InsightReport = {
      executiveSummary: 'Missing channel metadata test.',
      observedFacts: [
        {
          claim: 'ROAS was 1.86 in July 2024', // Does not state which channel in claim text or metadata
          metric: 'roas',
          value: 1.86,
          assertionType: 'channel_metric',
          evidenceRef: 'ref:bottom:2024-07:roas',
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
    expect(res.unsupportedClaims[0].discrepancyNote).toContain('Missing channel metadata');
  });

  // 4. Incorrect assertionType
  it('4. rejects claim with incorrect assertionType (e.g. claiming delta when value is percentage)', () => {
    const report: InsightReport = {
      executiveSummary: 'Incorrect assertionType test.',
      observedFacts: [
        {
          claim: 'Revenue change was -9.38',
          metric: 'revenue',
          value: -9.38,
          assertionType: 'delta', // Incorrect: -9.38 is percentage_change, delta is -60000
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
    expect(res.unsupportedClaims[0].discrepancyNote).toContain('Delta mismatch');
  });

  // 5. Ambiguous multi-metric claims
  it('5. rejects ambiguous claim when metric mismatches evidence or is missing', () => {
    const report: InsightReport = {
      executiveSummary: 'Ambiguous metric test.',
      observedFacts: [
        {
          claim: 'Performance score was 580000',
          metric: 'unknown_metric',
          value: 580000,
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

  // 6. Correct metadata with incorrect numerical values
  it('6. rejects claim having correct metadata but an incorrect numerical value', () => {
    const report: InsightReport = {
      executiveSummary: 'Incorrect number with valid metadata test.',
      observedFacts: [
        {
          claim: 'Revenue was $610,000 in July 2024',
          metric: 'revenue',
          value: 610000, // Ground truth is 580000
          period: '2024-07',
          assertionType: 'point_in_time',
          evidenceRef: 'ref:2024-07:revenue',
        },
        {
          claim: 'Paid Social ROAS was 3.5x in July 2024',
          metric: 'roas',
          value: 3.5, // Ground truth is 1.86
          channel: 'paid_social',
          assertionType: 'channel_metric',
          evidenceRef: 'ref:bottom:2024-07:roas',
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
    expect(res.unsupportedClaims[0].discrepancyNote).toContain('Numerical mismatch');
    expect(res.unsupportedClaims[1].status).toBe('CONTRADICTED');
    expect(res.unsupportedClaims[1].discrepancyNote).toContain('Metric value mismatch');
  });
});
