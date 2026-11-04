import { callGemini, getGeminiClient } from '@/lib/llm/gemini';
import {
  InsightReport,
  EvidenceItem,
  VerificationResult,
  VerificationResultSchema,
  ClaimVerification,
} from '@/types/agentContracts';

export const VERIFIER_SYSTEM_PROMPT = `You are the Verification Officer for MetricPilot, a zero-tolerance audit agent.
Your sole job is to verify every numerical claim and factual statement against the ground-truth evidence.

RULES:
1. Examine every claim in the report. Compare stated numbers against the evidence data.
2. If a number or source reference does not match the evidence, flag it as 'UNSUPPORTED' or 'CONTRADICTED'.
3. If an evidenceRef is missing, invalid, or hallucinated, reject the claim.
4. Calculate 'overallScore' (0 to 100). If ANY critical claim is UNSUPPORTED or CONTRADICTED, set 'passed': false, 'requiresCorrection': true.
5. Return ONLY a valid JSON object matching this exact schema:
{
  "passed": boolean,
  "overallScore": number (0 to 100),
  "verifiedClaims": [
    {
      "claimText": "string",
      "statedValue": number or "string",
      "evidenceValue": number or "string",
      "status": "VERIFIED",
      "evidenceRef": "ref:..."
    }
  ],
  "unsupportedClaims": [
    {
      "claimText": "string",
      "statedValue": number or "string",
      "evidenceValue": number or "string" (optional),
      "status": "UNSUPPORTED" or "CONTRADICTED",
      "evidenceRef": "string" (optional),
      "reason": "string"
    }
  ],
  "critique": "string actionable critique for correction loop",
  "requiresCorrection": boolean
}`;

export async function runVerificationAgent(
  report: InsightReport,
  evidence: EvidenceItem[],
  options: { forceMock?: boolean } = {}
): Promise<{
  verification: VerificationResult;
  isMock: boolean;
  tokensUsed?: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
  // Always perform deterministic rule-based verification in TypeScript as our bedrock
  const deterministicCheck = verifyClaimsDeterministically(report, evidence);

  if (options.forceMock) {
    return {
      verification: deterministicCheck,
      isMock: true,
    };
  }

  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server. To run live Gemini mode, configure GEMINI_API_KEY in your environment, or switch to Deterministic Mock Mode.');
  }

  let res;
  try {
    const prompt = `Draft Report to Verify:\n${JSON.stringify(report, null, 2)}\n\nGround-Truth Evidence:\n${JSON.stringify(
      evidence.map((e) => ({
        sourceRef: e.sourceRef,
        tool: e.tool,
        result: e.result,
        summary: e.summary,
      })),
      null,
      2
    )}`;

    res = await callGemini(VERIFIER_SYSTEM_PROMPT, prompt);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes('GEMINI_API_KEY is not configured')) {
      throw err;
    }
    // Re-throw API errors so caller/orchestrator handles or traces them honestly
    throw new Error(`Verification Agent LLM call failed: ${errorMsg}`);
  }

  const cleaned = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr: any) {
    console.error(`[VerificationAgent] JSON parsing failed: ${parseErr.message}`);
    throw new Error(`Verification Agent failed to parse Gemini JSON: ${parseErr.message}`);
  }

  const parsedRes = VerificationResultSchema.safeParse(parsed);
  if (!parsedRes.success) {
    const errorDetails = parsedRes.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    console.error(`[VerificationAgent] VerificationResult Zod validation failed: ${errorDetails}`);
    throw new Error(`Verification Agent output failed schema validation: ${errorDetails}`);
  }

  const validated = parsedRes.data;

  // Merge deterministic ground-truth checks so LLM cannot hallucinate verification passes
  if (!deterministicCheck.passed) {
    validated.passed = false;
    validated.requiresCorrection = true;
    validated.unsupportedClaims.push(...deterministicCheck.unsupportedClaims.filter(
      (u) => !validated.unsupportedClaims.some((v) => v.claimText === u.claimText)
    ));
  }

  return {
    verification: validated,
    isMock: false,
    tokensUsed: res.usage,
  };
}

// Deterministic TypeScript Verification Engine
export interface ClaimMatchEvaluation {
  matched: boolean;
  status: 'VERIFIED' | 'CONTRADICTED' | 'UNSUPPORTED';
  groundTruthValue?: string | number;
  discrepancyNote?: string;
}

/**
 * Normalizes metric names for robust cross-matching (e.g. "revenue (paid_social)" -> "revenue").
 */
function normalizeMetric(metric: string): string {
  return metric.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Extracts a numeric value from numbers or formatted strings (e.g., "$580,000", "-9.38%", "1.86x").
 * Preserves negative signs. Does NOT drop '-' signs.
 */
function extractNumber(val: string | number | undefined | null): number | null {
  if (typeof val === 'number') {
    return isNaN(val) ? null : val;
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/[\$,xX%]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Checks whether a metric is an integer count (e.g. orders).
 */
function isIntegerCountMetric(metric: string): boolean {
  const norm = normalizeMetric(metric);
  return norm.includes('order') || norm.includes('count');
}

/**
 * Checks whether a metric is a ratio, rate, or percentage (e.g. ROAS, conversionRate, percentageChange, CAC).
 */
function isRatioOrPercentageMetric(metric: string, assertionType?: string): boolean {
  const norm = normalizeMetric(metric);
  if (assertionType === 'percentage_change' || assertionType === 'growth_rate') return true;
  return (
    norm.includes('roas') ||
    norm.includes('rate') ||
    norm.includes('percentage') ||
    norm.includes('growth') ||
    norm.includes('cac') ||
    norm.includes('aov') ||
    norm.includes('averageorder')
  );
}

/**
 * Strict domain-appropriate numerical comparison.
 * - Discrete financial totals (revenue, spend): exact dollar match (tolerance 0.01 for cents/formatting)
 * - Integer counts (orders): exact integer equality (tolerance 0)
 * - Ratios & percentages (ROAS, conversionRate, growth rates, % change): tolerance 0.05
 * - Sign MUST match (Math.abs() is NOT used to cross-match opposite signs).
 */
function numbersEqual(
  stated: number,
  groundTruth: number,
  metric: string,
  assertionType?: string
): boolean {
  // If signs disagree, they can never be equal (e.g. +60,000 vs -60,000)
  if (stated > 0 && groundTruth < 0) return false;
  if (stated < 0 && groundTruth > 0) return false;

  if (isIntegerCountMetric(metric)) {
    return Math.round(stated) === Math.round(groundTruth);
  }

  if (isRatioOrPercentageMetric(metric, assertionType)) {
    return Math.abs(stated - groundTruth) <= 0.05;
  }

  // Currency / financial totals (e.g. revenue, spend): exact to within 1 dollar (or 0.01 for cents)
  return Math.abs(stated - groundTruth) <= 0.5;
}

/**
 * Checks whether the claim text indicates direction (increase/growth vs decrease/drop).
 */
function getClaimDirection(claimText: string): 'increased' | 'decreased' | null {
  const lower = claimText.toLowerCase();
  const decreaseWords = ['decreas', 'drop', 'fell', 'decline', 'contract', 'loss', 'down', 'negative', 'lower'];
  const increaseWords = ['increas', 'grew', 'growth', 'rose', 'surge', 'gain', 'up', 'positive', 'higher'];

  const hasDecrease = decreaseWords.some((w) => lower.includes(w));
  const hasIncrease = increaseWords.some((w) => lower.includes(w));

  if (hasDecrease && !hasIncrease) return 'decreased';
  if (hasIncrease && !hasDecrease) return 'increased';
  return null;
}

/**
 * Detects whether a claim refers to a specific month (e.g. June vs July) by name or YYYY-MM.
 */
function extractClaimMonths(claimText: string): string[] {
  const lower = claimText.toLowerCase();
  const months: string[] = [];
  const monthMap: Record<string, string> = {
    january: '01', feb: '02', mar: '03', apr: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
  };

  for (const [name, num] of Object.entries(monthMap)) {
    if (lower.includes(name)) months.push(num);
  }

  const yyyyMm = claimText.match(/202[0-9]-(0[1-9]|1[0-2])/g);
  if (yyyyMm) {
    for (const ym of yyyyMm) {
      months.push(ym.split('-')[1]);
    }
  }

  return months;
}

/**
 * Structured validation of a single observed fact against its evidence record.
 */
export function evaluateFactAgainstEvidence(
  fact: {
    claim: string;
    metric: string;
    value: string | number;
    evidenceRef: string;
    period?: string;
    assertionType?: string;
    channel?: string;
  },
  evidence: EvidenceItem
): ClaimMatchEvaluation {
  const res = evidence.result;
  if (!res || res.success === false) {
    return {
      matched: false,
      status: 'UNSUPPORTED',
      discrepancyNote: `Supporting evidence tool execution failed or yielded no result.`,
    };
  }

  const factNormMetric = normalizeMetric(fact.metric);
  const claimNum = extractNumber(fact.value);
  const claimDir = getClaimDirection(fact.claim);
  const claimTextLower = fact.claim.toLowerCase();
  const isPercentageClaim =
    fact.assertionType === 'percentage_change' ||
    fact.assertionType === 'growth_rate' ||
    String(fact.value).includes('%');

  if (claimNum === null) {
    return {
      matched: false,
      status: 'CONTRADICTED',
      discrepancyNote: `Could not parse valid numerical value from claim value: '${fact.value}'.`,
    };
  }

  // 1. Tool: get_metric
  if (evidence.tool === 'get_metric') {
    const evMetric = normalizeMetric(res.metric || evidence.parameters?.metric || '');
    if (evMetric && !factNormMetric.includes(evMetric) && !evMetric.includes(factNormMetric)) {
      return {
        matched: false,
        status: 'CONTRADICTED',
        discrepancyNote: `Metric mismatch: Claim is for '${fact.metric}', but evidence contains '${res.metric}'.`,
      };
    }

    // Period validation
    if (fact.period && res.month && fact.period !== res.month) {
      return {
        matched: false,
        status: 'CONTRADICTED',
        discrepancyNote: `Period mismatch: Claim references '${fact.period}', but evidence is for '${res.month}'.`,
      };
    }

    const groundTruthVal = res.value;
    if (typeof groundTruthVal === 'number') {
      if (numbersEqual(claimNum, groundTruthVal, fact.metric, fact.assertionType)) {
        return {
          matched: true,
          status: 'VERIFIED',
          groundTruthValue: groundTruthVal,
        };
      }
      return {
        matched: false,
        status: 'CONTRADICTED',
        groundTruthValue: groundTruthVal,
        discrepancyNote: `Numerical mismatch: Claim stated '${fact.value}' (${claimNum}), but evidence record is ${groundTruthVal}.`,
      };
    }
  }

  // 2. Tool: compare_periods
  if (evidence.tool === 'compare_periods') {
    const evMetric = normalizeMetric(res.metric || evidence.parameters?.metric || '');
    if (evMetric && !factNormMetric.includes(evMetric) && !evMetric.includes(factNormMetric)) {
      return {
        matched: false,
        status: 'CONTRADICTED',
        discrepancyNote: `Metric mismatch: Claim is for '${fact.metric}', but period comparison was for '${res.metric}'.`,
      };
    }

    // Direction check
    if (claimDir && res.direction && res.direction !== 'unchanged') {
      if (claimDir !== res.direction) {
        return {
          matched: false,
          status: 'CONTRADICTED',
          discrepancyNote: `Direction contradiction: Claim asserted '${claimDir}', but period comparison evidence shows '${res.direction}'.`,
        };
      }
    }

    const targetVal = res.targetPeriod?.value;
    const baseVal = res.basePeriod?.value;
    const delta = res.delta;
    const pctChange = res.percentageChange;
    const targetMonth = res.targetPeriod?.month; // e.g. "2024-07"
    const baseMonth = res.basePeriod?.month;     // e.g. "2024-06"

    // Disambiguate semantic intent:
    // A) Percentage change claim
    if (isPercentageClaim) {
      if (typeof pctChange === 'number') {
        // If claim direction is decreased, stated value might be unsigned e.g. "9.38%" or signed "-9.38%"
        const effectivePct = claimDir === 'decreased' && claimNum > 0 ? -claimNum : claimNum;
        if (numbersEqual(effectivePct, pctChange, 'percentageChange', 'percentage_change')) {
          return { matched: true, status: 'VERIFIED', groundTruthValue: pctChange };
        }
        return {
          matched: false,
          status: 'CONTRADICTED',
          groundTruthValue: pctChange,
          discrepancyNote: `Percentage change mismatch: Stated '${fact.value}' (${claimNum}%), but evidence change is ${pctChange}%.`,
        };
      }
    }

    // B) Delta / difference claim (e.g. "dropped by $60,000", "delta was -$60,000")
    const isDeltaClaim =
      fact.assertionType === 'delta' ||
      claimTextLower.includes('delta') ||
      claimTextLower.includes('dropped by') ||
      claimTextLower.includes('decreased by') ||
      claimTextLower.includes('fell by') ||
      claimTextLower.includes('increased by') ||
      claimTextLower.includes('grew by');

    if (isDeltaClaim && !isPercentageClaim) {
      if (typeof delta === 'number') {
        const effectiveDelta = claimDir === 'decreased' && claimNum > 0 ? -claimNum : claimNum;
        if (numbersEqual(effectiveDelta, delta, fact.metric, 'delta')) {
          return { matched: true, status: 'VERIFIED', groundTruthValue: delta };
        }
        return {
          matched: false,
          status: 'CONTRADICTED',
          groundTruthValue: delta,
          discrepancyNote: `Delta mismatch: Stated '${fact.value}', but evidence delta is ${delta}.`,
        };
      }
    }

    // C) Point-in-time period value (Base Period vs Target Period)
    // Inspect whether claim or fact.period explicitly ties to baseMonth or targetMonth
    const claimMonths = extractClaimMonths(fact.claim);
    const targetMonthNum = targetMonth ? targetMonth.split('-')[1] : null;
    const baseMonthNum = baseMonth ? baseMonth.split('-')[1] : null;

    const referencesBaseMonth =
      fact.assertionType === 'base_period' ||
      fact.period === baseMonth ||
      (baseMonthNum && claimMonths.includes(baseMonthNum) && (!targetMonthNum || !claimMonths.includes(targetMonthNum)));

    const referencesTargetMonth =
      fact.assertionType === 'target_period' ||
      fact.period === targetMonth ||
      (targetMonthNum && claimMonths.includes(targetMonthNum) && (!baseMonthNum || !claimMonths.includes(baseMonthNum)));

    if (referencesBaseMonth) {
      if (typeof baseVal === 'number') {
        if (numbersEqual(claimNum, baseVal, fact.metric, 'base_period')) {
          return { matched: true, status: 'VERIFIED', groundTruthValue: baseVal };
        }
        return {
          matched: false,
          status: 'CONTRADICTED',
          groundTruthValue: baseVal,
          discrepancyNote: `Period value mismatch: Stated ${baseMonth} value '${fact.value}', but base period value was ${baseVal}.`,
        };
      }
    }

    if (referencesTargetMonth) {
      if (typeof targetVal === 'number') {
        if (numbersEqual(claimNum, targetVal, fact.metric, 'target_period')) {
          return { matched: true, status: 'VERIFIED', groundTruthValue: targetVal };
        }
        return {
          matched: false,
          status: 'CONTRADICTED',
          groundTruthValue: targetVal,
          discrepancyNote: `Period value mismatch: Stated ${targetMonth} value '${fact.value}', but target period value was ${targetVal}.`,
        };
      }
    }

    // If both months are mentioned (e.g. "Revenue decreased from $640,000 in June to $580,000 in July"),
    // check target value or base value if claim clearly specifies
    if (claimMonths.includes(targetMonthNum || '') && !claimMonths.includes(baseMonthNum || '')) {
      // Specifically target month only
      if (typeof targetVal === 'number' && numbersEqual(claimNum, targetVal, fact.metric, 'target_period')) {
        return { matched: true, status: 'VERIFIED', groundTruthValue: targetVal };
      }
      return {
        matched: false,
        status: 'CONTRADICTED',
        groundTruthValue: targetVal,
        discrepancyNote: `Period value mismatch: Stated ${targetMonth} value '${fact.value}', but target period value was ${targetVal}.`,
      };
    }
    if (claimMonths.includes(baseMonthNum || '') && !claimMonths.includes(targetMonthNum || '')) {
      // Specifically base month only
      if (typeof baseVal === 'number' && numbersEqual(claimNum, baseVal, fact.metric, 'base_period')) {
        return { matched: true, status: 'VERIFIED', groundTruthValue: baseVal };
      }
      return {
        matched: false,
        status: 'CONTRADICTED',
        groundTruthValue: baseVal,
        discrepancyNote: `Period value mismatch: Stated ${baseMonth} value '${fact.value}', but base period value was ${baseVal}.`,
      };
    }

    // Both months mentioned or neither: require unambiguous matching
    // If assertionType is given, enforce it strictly without falling back to other fields
    if (fact.assertionType === 'delta' || fact.assertionType === 'percentage_change') {
      return {
        matched: false,
        status: 'CONTRADICTED',
        discrepancyNote: `Assertion type '${fact.assertionType}' does not match comparison values (delta: ${delta}, change: ${pctChange}%).`,
      };
    }

    if (fact.assertionType === 'target_period') {
      if (typeof targetVal === 'number' && numbersEqual(claimNum, targetVal, fact.metric, 'target_period')) {
        return { matched: true, status: 'VERIFIED', groundTruthValue: targetVal };
      }
      return {
        matched: false,
        status: 'CONTRADICTED',
        groundTruthValue: targetVal,
        discrepancyNote: `Target period value mismatch: Stated '${fact.value}', but target period was ${targetVal}.`,
      };
    }

    if (fact.assertionType === 'base_period') {
      if (typeof baseVal === 'number' && numbersEqual(claimNum, baseVal, fact.metric, 'base_period')) {
        return { matched: true, status: 'VERIFIED', groundTruthValue: baseVal };
      }
      return {
        matched: false,
        status: 'CONTRADICTED',
        groundTruthValue: baseVal,
        discrepancyNote: `Base period value mismatch: Stated '${fact.value}', but base period was ${baseVal}.`,
      };
    }

    // If no assertionType and months are ambiguous/absent:
    // If neither month is mentioned in the claim text or fact metadata, reject as ambiguous
    if (claimMonths.length === 0 && !fact.period && !fact.assertionType) {
      return {
        matched: false,
        status: 'UNSUPPORTED',
        discrepancyNote: `Ambiguous claim: Claim does not specify a period ('base_period', 'target_period') or assertionType ('delta', 'percentage_change') for comparison evidence.`,
      };
    }

    if (typeof targetVal === 'number' && numbersEqual(claimNum, targetVal, fact.metric, 'target_period')) {
      return { matched: true, status: 'VERIFIED', groundTruthValue: targetVal };
    }
    if (typeof baseVal === 'number' && numbersEqual(claimNum, baseVal, fact.metric, 'base_period')) {
      return { matched: true, status: 'VERIFIED', groundTruthValue: baseVal };
    }

    return {
      matched: false,
      status: 'CONTRADICTED',
      discrepancyNote: `Numerical mismatch: Stated value '${fact.value}' (${claimNum}) does not match comparison values (target: ${targetVal}, base: ${baseVal}, delta: ${delta}, change: ${pctChange}%).`,
    };
  }

  // 3. Tool: calculate_growth
  if (evidence.tool === 'calculate_growth') {
    const evMetric = normalizeMetric(res.metric || evidence.parameters?.metric || '');
    if (evMetric && !factNormMetric.includes(evMetric) && !evMetric.includes(factNormMetric)) {
      return {
        matched: false,
        status: 'CONTRADICTED',
        discrepancyNote: `Metric mismatch: Claim is for '${fact.metric}', but growth calculation was for '${res.metric}'.`,
      };
    }

    const growthRate = res.growthRatePercentage;
    const startVal = res.startValue;
    const endVal = res.endValue;

    if (claimDir) {
      const expectedDir = growthRate >= 0 ? 'increased' : 'decreased';
      if (claimDir !== expectedDir) {
        return {
          matched: false,
          status: 'CONTRADICTED',
          discrepancyNote: `Direction contradiction: Claim asserted '${claimDir}', but growth rate is ${growthRate}%.`,
        };
      }
    }

    if (isPercentageClaim && typeof growthRate === 'number') {
      const effectiveRate = claimDir === 'decreased' && claimNum > 0 ? -claimNum : claimNum;
      if (numbersEqual(effectiveRate, growthRate, 'growthRate', 'growth_rate')) {
        return { matched: true, status: 'VERIFIED', groundTruthValue: growthRate };
      }
      return {
        matched: false,
        status: 'CONTRADICTED',
        groundTruthValue: growthRate,
        discrepancyNote: `Growth rate mismatch: Stated '${fact.value}', but evidence growth rate is ${growthRate}%.`,
      };
    }

    if (fact.period === res.startMonth && typeof startVal === 'number') {
      if (numbersEqual(claimNum, startVal, fact.metric)) {
        return { matched: true, status: 'VERIFIED', groundTruthValue: startVal };
      }
      return {
        matched: false,
        status: 'CONTRADICTED',
        discrepancyNote: `Start period value mismatch: Stated '${fact.value}', but start value is ${startVal}.`,
      };
    }

    if (fact.period === res.endMonth && typeof endVal === 'number') {
      if (numbersEqual(claimNum, endVal, fact.metric)) {
        return { matched: true, status: 'VERIFIED', groundTruthValue: endVal };
      }
      return {
        matched: false,
        status: 'CONTRADICTED',
        discrepancyNote: `End period value mismatch: Stated '${fact.value}', but end value is ${endVal}.`,
      };
    }

    if (typeof growthRate === 'number' && numbersEqual(claimNum, growthRate, 'growthRate', 'growth_rate')) {
      return { matched: true, status: 'VERIFIED', groundTruthValue: growthRate };
    }
    if (typeof endVal === 'number' && numbersEqual(claimNum, endVal, fact.metric)) {
      return { matched: true, status: 'VERIFIED', groundTruthValue: endVal };
    }

    return {
      matched: false,
      status: 'CONTRADICTED',
      groundTruthValue: growthRate,
      discrepancyNote: `Numerical mismatch: Stated growth '${fact.value}' does not match growth rate ${growthRate}% (start: ${startVal}, end: ${endVal}).`,
    };
  }

  // 4. Tool: get_bottom_performers / get_top_performers
  if (evidence.tool === 'get_bottom_performers' || evidence.tool === 'get_top_performers') {
    const performers = res.performers;
    if (Array.isArray(performers)) {
      // Channel metadata requirement: if performers has multiple channels, require fact.channel or channel mentioned in claim text
      const channelKeys = ['paid_social', 'paid_search', 'organic_search', 'email_marketing', 'affiliate'];
      const mentionedChannel = fact.channel || channelKeys.find((k) => claimTextLower.includes(k) || claimTextLower.includes(k.replace('_', ' ')));

      if (!mentionedChannel && performers.length > 1) {
        return {
          matched: false,
          status: 'UNSUPPORTED',
          discrepancyNote: `Missing channel metadata: Claim asserts a performer metric without specifying which channel it applies to.`,
        };
      }

      const targetPerformer = mentionedChannel
        ? performers.find((p) => p.channel === mentionedChannel)
        : performers[0];

      if (!targetPerformer) {
        return {
          matched: false,
          status: 'UNSUPPORTED',
          discrepancyNote: `Channel '${mentionedChannel || fact.channel}' not found in performer ranking data.`,
        };
      }

      // Check specific metric field on performer (e.g. roas vs cac vs revenue)
      let expectedVal: number | undefined;
      if (factNormMetric === 'roas') expectedVal = targetPerformer.roas;
      else if (factNormMetric === 'cac' || factNormMetric.includes('customeracquisition')) expectedVal = targetPerformer.cac;
      else if (factNormMetric === 'revenue') expectedVal = targetPerformer.revenue;
      else if (factNormMetric === 'spend' || factNormMetric.includes('marketingspend')) expectedVal = targetPerformer.spend;
      else if (factNormMetric === 'conversionrate') expectedVal = targetPerformer.conversionRate;
      else if (factNormMetric === 'orders') expectedVal = targetPerformer.orders;
      else expectedVal = targetPerformer.metricValue;

      if (typeof expectedVal === 'number') {
        if (numbersEqual(claimNum, expectedVal, fact.metric, fact.assertionType)) {
          return {
            matched: true,
            status: 'VERIFIED',
            groundTruthValue: expectedVal,
          };
        }
        return {
          matched: false,
          status: 'CONTRADICTED',
          groundTruthValue: expectedVal,
          discrepancyNote: `Metric value mismatch: Claim stated '${fact.metric}' is '${fact.value}' (${claimNum}), but ground truth '${fact.metric}' for ${targetPerformer.channel} is ${expectedVal}.`,
        };
      }

      return {
        matched: false,
        status: 'CONTRADICTED',
        discrepancyNote: `Metric '${fact.metric}' not recognized or available in performers ranking record.`,
      };
    }
  }

  // 5. Tool: get_channel_breakdown
  if (evidence.tool === 'get_channel_breakdown') {
    const channels = res.channels;
    if (Array.isArray(channels)) {
      if (factNormMetric === 'revenue' && !fact.channel && typeof res.totalRevenue === 'number') {
        if (numbersEqual(claimNum, res.totalRevenue, fact.metric)) {
          return { matched: true, status: 'VERIFIED', groundTruthValue: res.totalRevenue };
        }
        return {
          matched: false,
          status: 'CONTRADICTED',
          groundTruthValue: res.totalRevenue,
          discrepancyNote: `Total revenue mismatch: Claim stated '${fact.value}', but breakdown total is ${res.totalRevenue}.`,
        };
      }

      if (fact.channel) {
        const ch = channels.find((c) => c.channel === fact.channel);
        if (!ch) {
          return {
            matched: false,
            status: 'UNSUPPORTED',
            discrepancyNote: `Channel '${fact.channel}' not found in breakdown.`,
          };
        }

        let chVal: number | undefined;
        if (factNormMetric === 'revenue') chVal = ch.revenue;
        else if (factNormMetric === 'spend' || factNormMetric.includes('marketingspend')) chVal = ch.spend;
        else if (factNormMetric === 'orders') chVal = ch.orders;
        else if (factNormMetric === 'roas') chVal = ch.roas;
        else if (factNormMetric === 'cac') chVal = ch.cac;
        else if (factNormMetric === 'conversionrate') chVal = ch.conversionRate;

        if (typeof chVal === 'number') {
          if (numbersEqual(claimNum, chVal, fact.metric)) {
            return { matched: true, status: 'VERIFIED', groundTruthValue: chVal };
          }
          return {
            matched: false,
            status: 'CONTRADICTED',
            groundTruthValue: chVal,
            discrepancyNote: `Channel metric mismatch: Stated ${fact.channel} ${fact.metric} was '${fact.value}', but record is ${chVal}.`,
          };
        }
      }
    }
  }

  return {
    matched: false,
    status: 'UNSUPPORTED',
    discrepancyNote: `Claim cannot be reliably mapped to supporting evidence structure.`,
  };
}

export function verifyClaimsDeterministically(
  report: InsightReport,
  evidence: EvidenceItem[]
): VerificationResult {
  const verifiedClaims: ClaimVerification[] = [];
  const unsupportedClaims: ClaimVerification[] = [];

  const evidenceMap = new Map<string, EvidenceItem>();
  evidence.forEach((e) => {
    evidenceMap.set(e.sourceRef, e);
    evidenceMap.set(e.id, e);
  });

  for (const fact of report.observedFacts) {
    const matchingEvidence = evidenceMap.get(fact.evidenceRef);

    if (!matchingEvidence) {
      unsupportedClaims.push({
        claimText: fact.claim,
        statedValue: fact.value,
        status: 'UNSUPPORTED',
        discrepancyNote: `Evidence reference '${fact.evidenceRef}' does not exist in retrieved tool evidence.`,
      });
      continue;
    }

    const evalResult = evaluateFactAgainstEvidence(fact, matchingEvidence);

    if (evalResult.matched && evalResult.status === 'VERIFIED') {
      verifiedClaims.push({
        claimText: fact.claim,
        statedValue: fact.value,
        groundTruthValue: evalResult.groundTruthValue ?? fact.value,
        status: 'VERIFIED',
        evidenceRef: fact.evidenceRef,
      });
    } else {
      unsupportedClaims.push({
        claimText: fact.claim,
        statedValue: fact.value,
        status: evalResult.status,
        evidenceRef: fact.evidenceRef,
        discrepancyNote: evalResult.discrepancyNote,
      });
    }
  }

  const total = verifiedClaims.length + unsupportedClaims.length;
  const passed = unsupportedClaims.length === 0 && total > 0;
  const score = total === 0 ? 100 : Math.round((verifiedClaims.length / total) * 100);

  return {
    passed,
    overallScore: score,
    verifiedClaims,
    unsupportedClaims,
    critique: passed
      ? `All ${verifiedClaims.length} observed claims verified against deterministic evidence sources.`
      : `Detected ${unsupportedClaims.length} unsupported claim(s). Correction required.`,
    requiresCorrection: !passed,
  };
}
