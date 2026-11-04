import { z } from 'zod';
import datasetRaw from '@/data/businessMetrics.json';
import { SyntheticDataset, MonthData, MarketingChannel, MetricName } from '@/types/dataset';

export const dataset = datasetRaw as unknown as SyntheticDataset;

// Helper to look up a month record safely
export function getMonthRecord(monthStr: string): MonthData | undefined {
  const normalized = monthStr.trim();
  return dataset.metrics.find(
    (m) => m.month.toLowerCase() === normalized.toLowerCase() ||
           m.label.toLowerCase().includes(normalized.toLowerCase())
  );
}

// 1. Tool: get_metric
export const GetMetricInputSchema = z.object({
  metric: z.enum([
    'revenue',
    'orders',
    'conversionRate',
    'marketingSpend',
    'averageOrderValue',
    'customerAcquisitionCost',
  ]),
  month: z.string().describe('Month in YYYY-MM format or name e.g. "2024-07" or "July"'),
  channel: z.enum(['organic_search', 'paid_search', 'paid_social', 'email_marketing', 'affiliate']).optional(),
});

export type GetMetricInput = z.infer<typeof GetMetricInputSchema>;

export function executeGetMetric(input: GetMetricInput) {
  const parsed = GetMetricInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: `Unsupported or invalid metric request: ${parsed.error.issues[0]?.message}`,
      ref: `metric:invalid_metric`,
    };
  }
  const validInput = parsed.data;

  const record = getMonthRecord(validInput.month);
  if (!record) {
    return {
      success: false,
      error: `Period '${validInput.month}' not found in dataset. Valid months: 2024-01 through 2024-12.`,
      ref: `metric:${validInput.month}:not_found`,
    };
  }

  if (validInput.channel) {
    const channelData = record.channels[validInput.channel];
    if (!channelData) {
      return {
        success: false,
        error: `Channel '${validInput.channel}' not recognized.`,
        ref: `metric:${record.month}:${validInput.channel}:invalid`,
      };
    }
    let value: number;
    if (validInput.metric === 'revenue') value = channelData.revenue;
    else if (validInput.metric === 'orders') value = channelData.orders;
    else if (validInput.metric === 'conversionRate') value = channelData.conversionRate;
    else if (validInput.metric === 'marketingSpend') value = channelData.spend;
    else if (validInput.metric === 'customerAcquisitionCost') value = channelData.cac;
    else {
      // averageOrderValue
      value = Number((channelData.revenue / (channelData.orders || 1)).toFixed(2));
    }
    return {
      success: true,
      month: record.month,
      monthLabel: record.label,
      metric: validInput.metric,
      channel: validInput.channel,
      value,
      currency: dataset.meta.currency,
      ref: `ref:${record.month}:${validInput.channel}:${validInput.metric}`,
    };
  }

  const value = record[validInput.metric as keyof MonthData] as number;
  return {
    success: true,
    month: record.month,
    monthLabel: record.label,
    metric: validInput.metric,
    value,
    currency: dataset.meta.currency,
    notes: record.notes,
    ref: `ref:${record.month}:${validInput.metric}`,
  };
}

// 2. Tool: compare_periods
export const ComparePeriodsInputSchema = z.object({
  metric: z.enum([
    'revenue',
    'orders',
    'conversionRate',
    'marketingSpend',
    'averageOrderValue',
    'customerAcquisitionCost',
  ]),
  baseMonth: z.string().optional(),
  targetMonth: z.string().optional(),
  period1: z.string().optional(),
  period2: z.string().optional(),
  month1: z.string().optional(),
  month2: z.string().optional(),
  channel: z.enum(['organic_search', 'paid_search', 'paid_social', 'email_marketing', 'affiliate']).optional(),
}).transform((data) => ({
  metric: data.metric,
  baseMonth: data.baseMonth || data.period1 || data.month1 || '',
  targetMonth: data.targetMonth || data.period2 || data.month2 || '',
  channel: data.channel,
}));

export type ComparePeriodsInput = z.input<typeof ComparePeriodsInputSchema>;

export function executeComparePeriods(rawInput: ComparePeriodsInput) {
  const input = ComparePeriodsInputSchema.parse(rawInput);
  const baseRes = executeGetMetric({ metric: input.metric, month: input.baseMonth, channel: input.channel });
  const targetRes = executeGetMetric({ metric: input.metric, month: input.targetMonth, channel: input.channel });

  if (!baseRes.success) return baseRes;
  if (!targetRes.success) return targetRes;

  const baseVal = baseRes.value as number;
  const targetVal = targetRes.value as number;
  const delta = Number((targetVal - baseVal).toFixed(2));
  const percentageChange = baseVal === 0 ? 0 : Number((((targetVal - baseVal) / baseVal) * 100).toFixed(2));

  return {
    success: true,
    metric: input.metric,
    channel: input.channel || 'all',
    basePeriod: { month: baseRes.month, label: baseRes.monthLabel, value: baseVal },
    targetPeriod: { month: targetRes.month, label: targetRes.monthLabel, value: targetVal },
    delta,
    percentageChange,
    direction: delta > 0 ? 'increased' : delta < 0 ? 'decreased' : 'unchanged',
    ref: `ref:compare:${baseRes.month}_vs_${targetRes.month}:${input.channel || 'all'}:${input.metric}`,
  };
}

// 3. Tool: get_channel_breakdown
export const GetChannelBreakdownInputSchema = z.object({
  month: z.string().describe('Month e.g. "2024-07"'),
});

export type GetChannelBreakdownInput = z.infer<typeof GetChannelBreakdownInputSchema>;

export function executeGetChannelBreakdown(input: GetChannelBreakdownInput) {
  const record = getMonthRecord(input.month);
  if (!record) {
    return {
      success: false,
      error: `Month '${input.month}' not found in dataset.`,
      ref: `breakdown:${input.month}:not_found`,
    };
  }

  const channels = Object.entries(record.channels).map(([channelKey, data]) => ({
    channel: channelKey as MarketingChannel,
    revenue: data.revenue,
    spend: data.spend,
    orders: data.orders,
    conversionRate: data.conversionRate,
    cac: data.cac,
    roas: data.roas,
    revenueSharePercentage: Number(((data.revenue / record.revenue) * 100).toFixed(2)),
  }));

  return {
    success: true,
    month: record.month,
    monthLabel: record.label,
    totalRevenue: record.revenue,
    totalMarketingSpend: record.marketingSpend,
    channels,
    ref: `ref:breakdown:${record.month}`,
  };
}

// 4. Tool: calculate_growth
export const CalculateGrowthInputSchema = z.object({
  metric: z.enum([
    'revenue',
    'orders',
    'conversionRate',
    'marketingSpend',
    'averageOrderValue',
    'customerAcquisitionCost',
  ]),
  startMonth: z.string(),
  endMonth: z.string(),
});

export type CalculateGrowthInput = z.infer<typeof CalculateGrowthInputSchema>;

export function executeCalculateGrowth(input: CalculateGrowthInput) {
  const startRec = getMonthRecord(input.startMonth);
  const endRec = getMonthRecord(input.endMonth);

  if (!startRec || !endRec) {
    return {
      success: false,
      error: `Invalid period range: ${input.startMonth} to ${input.endMonth}`,
      ref: `growth:invalid_period`,
    };
  }

  const startVal = startRec[input.metric as keyof MonthData] as number;
  const endVal = endRec[input.metric as keyof MonthData] as number;
  const growthRate = startVal === 0 ? 0 : Number((((endVal - startVal) / startVal) * 100).toFixed(2));

  return {
    success: true,
    metric: input.metric,
    startMonth: startRec.month,
    startValue: startVal,
    endMonth: endRec.month,
    endValue: endVal,
    growthRatePercentage: growthRate,
    ref: `ref:growth:${startRec.month}_to_${endRec.month}:${input.metric}`,
  };
}

// 5. Tool: get_top_performers
export const GetTopPerformersInputSchema = z.object({
  month: z.string(),
  rankingMetric: z.enum(['revenue', 'roas', 'conversionRate', 'orders']).default('revenue'),
  limit: z.number().int().min(1).max(5).default(3),
});

export type GetTopPerformersInput = z.infer<typeof GetTopPerformersInputSchema>;

export function executeGetTopPerformers(input: GetTopPerformersInput) {
  const record = getMonthRecord(input.month);
  if (!record) {
    return { success: false, error: `Month '${input.month}' not found.` };
  }

  const list = Object.entries(record.channels).map(([channelKey, data]) => ({
    channel: channelKey as MarketingChannel,
    metricValue: data[input.rankingMetric],
    revenue: data.revenue,
    spend: data.spend,
    roas: data.roas,
    cac: data.cac,
    conversionRate: data.conversionRate,
  }));

  list.sort((a, b) => b.metricValue - a.metricValue);
  const ranked = list.slice(0, input.limit);

  return {
    success: true,
    month: record.month,
    rankingMetric: input.rankingMetric,
    performers: ranked,
    ref: `ref:top:${record.month}:${input.rankingMetric}`,
  };
}

// 6. Tool: get_bottom_performers
export const GetBottomPerformersInputSchema = z.object({
  month: z.string(),
  rankingMetric: z.enum(['revenue', 'roas', 'conversionRate', 'cac']).default('roas'),
  limit: z.number().int().min(1).max(5).default(3),
});

export type GetBottomPerformersInput = z.infer<typeof GetBottomPerformersInputSchema>;

export function executeGetBottomPerformers(input: GetBottomPerformersInput) {
  const record = getMonthRecord(input.month);
  if (!record) {
    return { success: false, error: `Month '${input.month}' not found.` };
  }

  const list = Object.entries(record.channels).map(([channelKey, data]) => ({
    channel: channelKey as MarketingChannel,
    metricValue: data[input.rankingMetric],
    revenue: data.revenue,
    spend: data.spend,
    roas: data.roas,
    cac: data.cac,
    conversionRate: data.conversionRate,
  }));

  // If ranking metric is CAC, highest CAC is worst. If ROAS or conversionRate, lowest is worst.
  if (input.rankingMetric === 'cac') {
    list.sort((a, b) => b.metricValue - a.metricValue); // Highest CAC worst
  } else {
    list.sort((a, b) => a.metricValue - b.metricValue); // Lowest ROAS/conv worst
  }

  const ranked = list.slice(0, input.limit);

  return {
    success: true,
    month: record.month,
    rankingMetric: input.rankingMetric,
    performers: ranked,
    ref: `ref:bottom:${record.month}:${input.rankingMetric}`,
  };
}

export const VALID_TOOL_NAMES = [
  'get_metric',
  'compare_periods',
  'get_channel_breakdown',
  'calculate_growth',
  'get_top_performers',
  'get_bottom_performers',
] as const;

export function isValidToolName(name: unknown): name is ToolName {
  return typeof name === 'string' && (VALID_TOOL_NAMES as readonly string[]).includes(name);
}

// Master Dispatcher for Analyst Agent
export type ToolName =
  | 'get_metric'
  | 'compare_periods'
  | 'get_channel_breakdown'
  | 'calculate_growth'
  | 'get_top_performers'
  | 'get_bottom_performers';

import { ToolResult } from '@/types/tools';

export function executeToolByName(toolName: string, params: Record<string, unknown>): ToolResult {
  if (!isValidToolName(toolName)) {
    return {
      success: false,
      error: `Unauthorized or non-existent tool: ${toolName}. Execution blocked.`,
    };
  }

  switch (toolName) {
    case 'get_metric': {
      const parsed = GetMetricInputSchema.safeParse(params);
      if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };
      return executeGetMetric(parsed.data) as ToolResult;
    }
    case 'compare_periods': {
      const parsed = ComparePeriodsInputSchema.safeParse(params);
      if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };
      return executeComparePeriods(parsed.data) as ToolResult;
    }
    case 'get_channel_breakdown': {
      const parsed = GetChannelBreakdownInputSchema.safeParse(params);
      if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };
      return executeGetChannelBreakdown(parsed.data) as ToolResult;
    }
    case 'calculate_growth': {
      const parsed = CalculateGrowthInputSchema.safeParse(params);
      if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };
      return executeCalculateGrowth(parsed.data) as ToolResult;
    }
    case 'get_top_performers': {
      const parsed = GetTopPerformersInputSchema.safeParse(params);
      if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };
      return executeGetTopPerformers(parsed.data) as ToolResult;
    }
    case 'get_bottom_performers': {
      const parsed = GetBottomPerformersInputSchema.safeParse(params);
      if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };
      return executeGetBottomPerformers(parsed.data) as ToolResult;
    }
    default:
      return { success: false, error: `Unauthorized or non-existent tool: ${toolName}` };
  }
}
