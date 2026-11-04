import { ExecutionPlan } from '@/types/agentContracts';

export function getMockPlanForQuery(query: string): ExecutionPlan {
  const lower = query.toLowerCase();

  // Case 1: Revenue decrease / worst channel (July 2024 anomaly)
  if (lower.includes('revenue') && (lower.includes('decrease') || lower.includes('worst') || lower.includes('july') || lower.includes('month'))) {
    return {
      userIntent: 'Investigate the revenue decrease and identify the worst performing marketing channel',
      identifiedMetrics: ['revenue', 'marketingSpend', 'conversionRate', 'customerAcquisitionCost'],
      relevantTimePeriods: ['2024-06', '2024-07'],
      requiresComparison: true,
      subtasks: [
        {
          id: 'task-1',
          description: 'Compare overall company revenue between June 2024 and July 2024',
          tool: 'compare_periods',
          parameters: { metric: 'revenue', baseMonth: '2024-06', targetMonth: '2024-07' },
          reason: 'Quantify exact magnitude of revenue drop',
        },
        {
          id: 'task-2',
          description: 'Inspect full channel breakdown for July 2024 to identify underperforming segments',
          tool: 'get_channel_breakdown',
          parameters: { month: '2024-07' },
          reason: 'Check performance, ROAS, and CAC across all five channels',
        },
        {
          id: 'task-3',
          description: 'Identify bottom performing channel by ROAS in July 2024',
          tool: 'get_bottom_performers',
          parameters: { month: '2024-07', rankingMetric: 'roas', limit: 2 },
          reason: 'Pinpoint which acquisition channel generated lowest return',
        },
        {
          id: 'task-4',
          description: 'Compare Paid Social revenue and conversion rate between June and July 2024',
          tool: 'compare_periods',
          parameters: { metric: 'revenue', baseMonth: '2024-06', targetMonth: '2024-07', channel: 'paid_social' },
          reason: 'Measure direct impact of Paid Social decline',
        },
      ],
    };
  }

  // Case 2: Growth / Holiday season / Q4
  if (lower.includes('growth') || lower.includes('q4') || lower.includes('holiday') || lower.includes('november') || lower.includes('december')) {
    return {
      userIntent: 'Analyze revenue and order growth into the Q4 holiday peak',
      identifiedMetrics: ['revenue', 'orders', 'averageOrderValue'],
      relevantTimePeriods: ['2024-10', '2024-12'],
      requiresComparison: true,
      subtasks: [
        {
          id: 'task-1',
          description: 'Calculate revenue growth from October to December 2024',
          tool: 'calculate_growth',
          parameters: { metric: 'revenue', startMonth: '2024-10', endMonth: '2024-12' },
          reason: 'Evaluate overall scale of Q4 surge',
        },
        {
          id: 'task-2',
          description: 'Identify top performing channels by revenue in December 2024',
          tool: 'get_top_performers',
          parameters: { month: '2024-12', rankingMetric: 'revenue', limit: 3 },
          reason: 'Determine primary growth engines',
        },
      ],
    };
  }

  // Case 3: Default comparison / overview
  return {
    userIntent: `Analyze business performance metrics related to user inquiry: "${query}"`,
    identifiedMetrics: ['revenue', 'marketingSpend', 'conversionRate'],
    relevantTimePeriods: ['2024-06', '2024-07'],
    requiresComparison: true,
    subtasks: [
      {
        id: 'task-1',
        description: 'Compare monthly revenue between June and July 2024',
        tool: 'compare_periods',
        parameters: { metric: 'revenue', baseMonth: '2024-06', targetMonth: '2024-07' },
        reason: 'Establish baseline performance trajectory',
      },
      {
        id: 'task-2',
        description: 'Retrieve channel breakdown for target period',
        tool: 'get_channel_breakdown',
        parameters: { month: '2024-07' },
        reason: 'Evaluate channel attribution and CAC efficiency',
      },
    ],
  };
}
