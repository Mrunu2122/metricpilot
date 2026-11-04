import { z } from 'zod';

export const AgentRoleSchema = z.enum([
  'PLANNER',
  'DATA_ANALYST',
  'INSIGHT_SPECIALIST',
  'VERIFICATION_OFFICER',
]);

export type AgentRole = z.infer<typeof AgentRoleSchema>;

// Planner Output Schema
export const SubTaskSchema = z.object({
  id: z.string().optional().default(() => `task-${Math.random().toString(36).substring(2, 6)}`),
  description: z.string().optional().default('Execute analytical subtask'),
  tool: z.enum([
    'get_metric',
    'compare_periods',
    'get_channel_breakdown',
    'calculate_growth',
    'get_top_performers',
    'get_bottom_performers',
  ]),
  parameters: z.record(z.string(), z.any()).default({}),
  reason: z.string().optional().default('Retrieve data for business inquiry'),
});

export type SubTask = z.infer<typeof SubTaskSchema>;

export const ExecutionPlanSchema = z.object({
  userIntent: z.string().optional().default('Analyze business query'),
  identifiedMetrics: z.array(z.string()).optional().default([]),
  relevantTimePeriods: z.array(z.string()).optional().default([]),
  subtasks: z.array(SubTaskSchema).min(1),
  requiresComparison: z.boolean().optional().default(false),
});

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

// Data Analyst Output Schema
export const EvidenceItemSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  tool: z.string(),
  parameters: z.record(z.string(), z.any()),
  result: z.any(),
  sourceRef: z.string(),
  summary: z.string(),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const AnalystResultSchema = z.object({
  evidence: z.array(EvidenceItemSchema),
  allTasksSucceeded: z.boolean(),
  failedTasks: z.array(z.string()).default([]),
  dataSummary: z.string(),
});

export type AnalystResult = z.infer<typeof AnalystResultSchema>;

// Insight Agent Output Schema
export const AssertionTypeSchema = z.enum([
  'point_in_time', // specific period value e.g. July revenue
  'base_period',   // base period value e.g. June revenue in a June vs July comparison
  'target_period', // target period value e.g. July revenue in a June vs July comparison
  'delta',         // absolute or currency difference e.g. -$60,000
  'percentage_change', // relative change or percentage e.g. -9.38%
  'growth_rate',   // growth rate from start to end period
  'channel_metric',// specific channel metric e.g. Paid Social CAC
]);

export type AssertionType = z.infer<typeof AssertionTypeSchema>;

export const ObservedFactSchema = z.object({
  claim: z.string(),
  metric: z.string(),
  value: z.union([z.number(), z.string()]),
  evidenceRef: z.string(), // Must reference an ID or sourceRef from AnalystResult
  period: z.string().optional(), // Specific period referenced, e.g. "2024-06" or "2024-07"
  assertionType: AssertionTypeSchema.optional(), // Semantic assertion type
  channel: z.string().optional(), // Specific channel referenced, e.g. "paid_social"
});

export type ObservedFact = z.infer<typeof ObservedFactSchema>;

export const HypothesisSchema = z.object({
  observation: z.string(),
  potentialCause: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  validationStep: z.string(),
});

export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const RecommendationSchema = z.object({
  action: z.string(),
  impact: z.enum(['critical', 'high', 'medium', 'low']),
  rationale: z.string(),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

export const InsightReportSchema = z.object({
  executiveSummary: z.string(),
  observedFacts: z.array(ObservedFactSchema),
  hypotheses: z.array(HypothesisSchema),
  recommendations: z.array(RecommendationSchema),
  unansweredQuestions: z.array(z.string()).default([]),
});

export type InsightReport = z.infer<typeof InsightReportSchema>;

// Verification Agent Output Schema
export const ClaimVerificationSchema = z.object({
  claimText: z.string(),
  statedValue: z.union([z.string(), z.number()]),
  groundTruthValue: z.union([z.string(), z.number()]).optional(),
  status: z.enum(['VERIFIED', 'UNSUPPORTED', 'CONTRADICTED']),
  evidenceRef: z.string().optional(),
  discrepancyNote: z.string().optional(),
});

export type ClaimVerification = z.infer<typeof ClaimVerificationSchema>;

export const VerificationResultSchema = z.object({
  passed: z.boolean(),
  overallScore: z.number().min(0).max(100), // 0 - 100%
  verifiedClaims: z.array(ClaimVerificationSchema),
  unsupportedClaims: z.array(ClaimVerificationSchema),
  critique: z.string(),
  requiresCorrection: z.boolean(),
});

export type VerificationResult = z.infer<typeof VerificationResultSchema>;

// Execution Trace Items
export interface StepTrace {
  stepIndex: number;
  agentRole: AgentRole;
  agentName: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'RETRYING';
  inputSummary: string;
  outputSummary?: string;
  toolCalls?: {
    toolName: string;
    params: Record<string, unknown>;
    resultSummary: string;
  }[];
  durationMs: number;
  tokensUsed?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
}

export interface OrchestrationResult {
  requestId: string;
  query: string;
  status: 'SUCCESS' | 'PARTIAL_SAFE_FALLBACK' | 'FAILED';
  isMockMode: boolean;
  plan?: ExecutionPlan;
  evidence?: EvidenceItem[];
  finalReport?: InsightReport;
  verification?: VerificationResult;
  correctionAttempts: number;
  totalDurationMs: number;
  traces: StepTrace[];
  safeFallbackNotice?: string;
}
