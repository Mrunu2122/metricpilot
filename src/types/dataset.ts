import { z } from 'zod';

export const MetricNameSchema = z.enum([
  'revenue',
  'orders',
  'conversionRate',
  'marketingSpend',
  'customerAcquisitionCost',
  'averageOrderValue',
]);

export type MetricName = z.infer<typeof MetricNameSchema>;

export const MarketingChannelSchema = z.enum([
  'organic_search',
  'paid_search',
  'paid_social',
  'email_marketing',
  'affiliate',
]);

export type MarketingChannel = z.infer<typeof MarketingChannelSchema>;

export interface ChannelMetrics {
  spend: number;
  newCustomers: number;
  revenue: number;
  orders: number;
  conversionRate: number; // percentage, e.g. 2.4%
  cac: number; // Spend / newCustomers
  roas: number; // revenue / spend
}

export interface MonthData {
  month: string; // YYYY-MM
  label: string; // e.g. "January 2024"
  revenue: number;
  orders: number;
  conversionRate: number; // percentage
  marketingSpend: number;
  averageOrderValue: number; // revenue / orders
  customerAcquisitionCost: number; // marketingSpend / totalNewCustomers
  channels: Record<MarketingChannel, ChannelMetrics>;
  notes?: string;
}

export interface SyntheticDataset {
  meta: {
    datasetId: string;
    description: string;
    isSynthetic: true;
    currency: string;
    periodRange: {
      start: string;
      end: string;
    };
    createdFor: string;
  };
  metrics: MonthData[];
}
