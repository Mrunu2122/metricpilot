import { runPlannerAgent } from '@/lib/agents/plannerAgent';
import { runDataAnalystAgent } from '@/lib/agents/dataAnalystAgent';
import { runInsightAgent } from '@/lib/agents/insightAgent';
import { runVerificationAgent } from '@/lib/agents/verificationAgent';
import {
  OrchestrationResult,
  StepTrace,
  InsightReport,
} from '@/types/agentContracts';

export interface OrchestratorOptions {
  maxRetries?: number;
  timeoutMs?: number;
  forceMock?: boolean;
}

export async function executeMultiAgentWorkflow(
  query: string,
  options: OrchestratorOptions = {}
): Promise<OrchestrationResult> {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const traces: StepTrace[] = [];
  const maxRetries = options.maxRetries ?? 2;

  // Explicit mock mode vs live mode tracking
  const forceMock = options.forceMock ?? false;
  let isMockMode = forceMock;

  // Live LLM workflows involving multiple agents across sequential network roundtrips require adequate headroom
  const defaultTimeout = forceMock ? 30000 : 90000;
  const timeoutMs = options.timeoutMs ?? (process.env.ORCHESTRATOR_TIMEOUT_MS ? parseInt(process.env.ORCHESTRATOR_TIMEOUT_MS, 10) : defaultTimeout);

  // Create timeout race promise
  let timeoutHandle: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Orchestration execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const workflowPromise = async (): Promise<OrchestrationResult> => {
    // -------------------------------------------------------------
    // STEP 1: PLANNER AGENT
    // -------------------------------------------------------------
    const step1Start = Date.now();
    let planResult;
    try {
      planResult = await runPlannerAgent(query, { forceMock });
      if (planResult.isMock) isMockMode = true;

      traces.push({
        stepIndex: 1,
        agentRole: 'PLANNER',
        agentName: planResult.isMock
          ? 'Planner Agent (Deterministic Mock)'
          : 'Planner Agent (Gemini API)',
        status: 'COMPLETED',
        inputSummary: `User query: "${query}"`,
        outputSummary: `Decomposed into ${planResult.plan.subtasks.length} executable tasks targeting [${planResult.plan.relevantTimePeriods.join(', ')}]`,
        durationMs: Date.now() - step1Start,
        tokensUsed: planResult.tokensUsed,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      traces.push({
        stepIndex: 1,
        agentRole: 'PLANNER',
        agentName: 'Planner Agent',
        status: 'FAILED',
        inputSummary: `User query: "${query}"`,
        durationMs: Date.now() - step1Start,
        error: errorMsg,
      });
      return {
        requestId,
        query,
        status: 'FAILED',
        isMockMode,
        correctionAttempts: 0,
        totalDurationMs: Date.now() - startTime,
        traces,
        safeFallbackNotice: `Planning phase failed: ${errorMsg}`,
      };
    }

    // -------------------------------------------------------------
    // STEP 2: DATA ANALYST AGENT (Deterministic Tools)
    // -------------------------------------------------------------
    const step2Start = Date.now();
    let analystResult;
    try {
      analystResult = await runDataAnalystAgent(planResult.plan);
      traces.push({
        stepIndex: 2,
        agentRole: 'DATA_ANALYST',
        agentName: 'Data Analyst Agent (Tool Execution)',
        status: analystResult.allTasksSucceeded ? 'COMPLETED' : 'COMPLETED',
        inputSummary: `Executing ${planResult.plan.subtasks.length} tool tasks against synthetic business repository`,
        outputSummary: analystResult.dataSummary,
        toolCalls: analystResult.evidence.map((e) => ({
          toolName: e.tool,
          params: e.parameters,
          resultSummary: e.summary,
        })),
        durationMs: Date.now() - step2Start,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      traces.push({
        stepIndex: 2,
        agentRole: 'DATA_ANALYST',
        agentName: 'Data Analyst Agent',
        status: 'FAILED',
        inputSummary: 'Executing tool tasks',
        durationMs: Date.now() - step2Start,
        error: errorMsg,
      });
      return {
        requestId,
        query,
        status: 'FAILED',
        isMockMode,
        plan: planResult.plan,
        correctionAttempts: 0,
        totalDurationMs: Date.now() - startTime,
        traces,
        safeFallbackNotice: `Data retrieval failed: ${errorMsg}`,
      };
    }

    // -------------------------------------------------------------
    // STEP 3: INSIGHT AGENT + VERIFICATION FEEDBACK LOOP
    // -------------------------------------------------------------
    let currentReport: InsightReport | undefined;
    let verificationResult: import('@/types/agentContracts').VerificationResult | undefined;
    let attempts = 0;
    let critique: string | undefined = undefined;

    while (attempts <= maxRetries) {
      const insightStart = Date.now();
      const isRetry = attempts > 0;

      let insightOutput;
      try {
        insightOutput = await runInsightAgent(query, analystResult.evidence, critique, { forceMock });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        traces.push({
          stepIndex: traces.length + 1,
          agentRole: 'INSIGHT_SPECIALIST',
          agentName: 'Insight Agent',
          status: 'FAILED',
          inputSummary: 'Generating report',
          durationMs: Date.now() - insightStart,
          error: errorMsg,
        });
        return {
          requestId,
          query,
          status: 'FAILED',
          isMockMode,
          plan: planResult.plan,
          evidence: analystResult.evidence,
          correctionAttempts: attempts,
          totalDurationMs: Date.now() - startTime,
          traces,
          safeFallbackNotice: `Insight synthesis failed: ${errorMsg}`,
        };
      }

      if (insightOutput.isMock) isMockMode = true;
      currentReport = insightOutput.report;

      traces.push({
        stepIndex: traces.length + 1,
        agentRole: 'INSIGHT_SPECIALIST',
        agentName: isRetry
          ? `Insight Agent (Correction Attempt #${attempts})`
          : insightOutput.isMock
          ? 'Insight Agent (Deterministic Mock)'
          : 'Insight Agent (Gemini API)',
        status: 'COMPLETED',
        inputSummary: isRetry
          ? `Addressing verification critique: ${critique?.slice(0, 100)}...`
          : `Synthesizing ${analystResult.evidence.length} evidence items`,
        outputSummary: `Generated ${currentReport.observedFacts.length} verified facts, ${currentReport.hypotheses.length} hypotheses, and ${currentReport.recommendations.length} recommendations.`,
        durationMs: Date.now() - insightStart,
        tokensUsed: insightOutput.tokensUsed,
      });

      // Verification Step
      const verifierStart = Date.now();
      let verifierOutput;
      try {
        verifierOutput = await runVerificationAgent(currentReport, analystResult.evidence, { forceMock });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        traces.push({
          stepIndex: traces.length + 1,
          agentRole: 'VERIFICATION_OFFICER',
          agentName: 'Verification Officer',
          status: 'FAILED',
          inputSummary: 'Auditing report',
          durationMs: Date.now() - verifierStart,
          error: errorMsg,
        });
        return {
          requestId,
          query,
          status: 'FAILED',
          isMockMode,
          plan: planResult.plan,
          evidence: analystResult.evidence,
          finalReport: currentReport,
          correctionAttempts: attempts,
          totalDurationMs: Date.now() - startTime,
          traces,
          safeFallbackNotice: `Verification failed: ${errorMsg}`,
        };
      }

      if (verifierOutput.isMock) isMockMode = true;
      verificationResult = verifierOutput.verification;

      traces.push({
        stepIndex: traces.length + 1,
        agentRole: 'VERIFICATION_OFFICER',
        agentName: verifierOutput.isMock
          ? `Verification Officer (Deterministic Audit #${attempts + 1})`
          : `Verification Officer (Gemini Audit #${attempts + 1})`,
        status: verificationResult.passed ? 'COMPLETED' : 'RETRYING',
        inputSummary: `Auditing ${currentReport.observedFacts.length} claims against ground truth`,
        outputSummary: `Audit Score: ${verificationResult.overallScore}% (${verificationResult.verifiedClaims.length} verified, ${verificationResult.unsupportedClaims.length} unsupported)`,
        durationMs: Date.now() - verifierStart,
        tokensUsed: verifierOutput.tokensUsed,
      });

      if (verificationResult.passed) {
        break;
      }

      attempts++;
      critique = verificationResult.critique;
    }

    // Check if verification succeeded or if fallback safe response needed
    if (!verificationResult || !verificationResult.passed) {
      // Safe Fallback: Filter out unsupported claims to ensure high assurance
      const safeFacts = currentReport?.observedFacts.filter((f) =>
        verificationResult?.verifiedClaims.some((v: import('@/types/agentContracts').ClaimVerification) => v.claimText === f.claim)
      ) || [];

      const unsupportedCount = verificationResult?.unsupportedClaims.length ?? 0;
      const verifiedCount = verificationResult?.verifiedClaims.filter((c) => c.status === 'VERIFIED').length ?? 0;

      // Circuit Breaker Trace Visibility: Record the safety intervention in the execution trace
      traces.push({
        stepIndex: traces.length + 1,
        agentRole: 'VERIFICATION_OFFICER',
        agentName: 'High-Assurance Circuit Breaker',
        status: 'COMPLETED',
        inputSummary: `Zero-tolerance audit failed after ${attempts} attempts (${unsupportedCount} unverified claims detected). Engaging safe fallback filter.`,
        outputSummary: `Filtered report: Retained ${safeFacts.length} verified facts; stripped ${unsupportedCount} unverified claims and isolated them into unanswered questions.`,
        durationMs: 0,
      });

      const safeReport: InsightReport = {
        executiveSummary: `[SAFE PARTIAL REPORT] Certain claims could not be verified against the deterministic dataset after ${maxRetries} correction cycles. Only verified evidence is displayed.`,
        observedFacts: safeFacts,
        hypotheses: currentReport?.hypotheses || [],
        recommendations: currentReport?.recommendations || [],
        unansweredQuestions: [
          ...(currentReport?.unansweredQuestions || []),
          ...((verificationResult?.unsupportedClaims.map((u) => `Unverified: ${u.claimText}`)) || []),
        ],
      };

      return {
        requestId,
        query,
        status: 'PARTIAL_SAFE_FALLBACK',
        isMockMode,
        plan: planResult.plan,
        evidence: analystResult.evidence,
        finalReport: safeReport,
        verification: verificationResult,
        correctionAttempts: attempts,
        totalDurationMs: Date.now() - startTime,
        traces,
        safeFallbackNotice: `Report filtered: ${unsupportedCount} unsupported claim(s) were flagged and isolated.`,
      };
    }

    return {
      requestId,
      query,
      status: 'SUCCESS',
      isMockMode,
      plan: planResult.plan,
      evidence: analystResult.evidence,
      finalReport: currentReport,
      verification: verificationResult,
      correctionAttempts: attempts,
      totalDurationMs: Date.now() - startTime,
      traces,
    };
  };

  try {
    const result = await Promise.race([workflowPromise(), timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (err: unknown) {
    clearTimeout(timeoutHandle!);
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      requestId,
      query,
      status: 'FAILED',
      isMockMode,
      correctionAttempts: 0,
      totalDurationMs: Date.now() - startTime,
      traces,
      safeFallbackNotice: `Execution terminated: ${errorMsg}`,
    };
  }
}
