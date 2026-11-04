import { MarketingChannel } from '@/types/dataset';

export interface ToolBaseError {
  success: false;
  error: string;
  ref?: string;
}

export interface GetMetricSuccess {
  success: true;
  month: string;
  monthLabel: string;
  metric: string;
  channel?: string;
  value: number;
  currency: string;
  notes?: string;
  ref: string;
}

export interface ComparePeriodsSuccess {
  success: true;
  metric: string;
  channel: string;
  basePeriod: { month: string; label: string; value: number };
  targetPeriod: { month: string; label: string; value: number };
  delta: number;
  percentageChange: number;
  direction: 'increased' | 'decreased' | 'unchanged';
  ref: string;
}

export interface ChannelBreakdownItem {
  channel: MarketingChannel;
  revenue: number;
  spend: number;
  orders: number;
  conversionRate: number;
  cac: number;
  roas: number;
  revenueSharePercentage: number;
}

export interface GetChannelBreakdownSuccess {
  success: true;
  month: string;
  monthLabel: string;
  totalRevenue: number;
  totalMarketingSpend: number;
  channels: ChannelBreakdownItem[];
  ref: string;
}

export interface CalculateGrowthSuccess {
  success: true;
  metric: string;
  startMonth: string;
  startValue: number;
  endMonth: string;
  endValue: number;
  growthRatePercentage: number;
  ref: string;
}

export interface RankedPerformer {
  channel: MarketingChannel;
  metricValue: number;
  revenue: number;
  spend: number;
  roas: number;
  cac: number;
  conversionRate: number;
}

export interface GetPerformersSuccess {
  success: true;
  month: string;
  rankingMetric: string;
  performers: RankedPerformer[];
  ref: string;
}

export type ToolSuccessResult =
  | GetMetricSuccess
  | ComparePeriodsSuccess
  | GetChannelBreakdownSuccess
  | CalculateGrowthSuccess
  | GetPerformersSuccess;

export type ToolResult = ToolBaseError | ToolSuccessResult;
