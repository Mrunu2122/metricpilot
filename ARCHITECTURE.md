# MetricPilot: System Architecture & Technical Specifications

This document outlines the architecture, data contracts, verification mechanics, security controls, and design trade-offs implemented in MetricPilot.

---

## 1. System Overview

MetricPilot is an enterprise multi-agent analytics architecture designed to eliminate arithmetic inaccuracies and ungrounded factual assertions. It pairs LLM planning and natural-language synthesis with deterministic tool computation and TypeScript rule auditing.

```mermaid
flowchart TD
    User([User Natural Language Query]) --> WebApp[Frontend Dashboard Next.js]
    WebApp -->|POST /api/orchestrate| API[API Route Handler]
    
    subgraph Centralized Orchestration [src/lib/orchestrator/engine.ts]
        API --> FSM{FSM Orchestrator}
        FSM -->|1. Request Plan| Planner[Planner Agent]
        Planner -->|ExecutionPlanSchema| FSM
        
        FSM -->|2. Dispatch Tasks| Analyst[Data Analyst Agent]
        Analyst -->|EvidenceItem Vault| FSM
        
        FSM -->|3. Synthesize Draft| Insight[Insight Agent]
        Insight -->|InsightReportSchema| FSM
        
        FSM -->|4. Audit Claims| Verifier[Verification Agent]
        Verifier -->|VerificationResultSchema| AuditCheck{Passed?}
        
        AuditCheck -- No & Retries < 2 -->|Feedback Critique| Insight
        AuditCheck -- No & Retries >= 2 --> CircuitBreaker[High-Assurance Circuit Breaker]
        AuditCheck -- Yes --> FinalReport[Verified Final Report]
        CircuitBreaker --> SafeFallback[PARTIAL_SAFE_FALLBACK Report]
    end

    subgraph Deterministic Layer [src/lib/tools/registry.ts]
        Analyst -->|executeToolByName| ToolRegistry[Tool Registry Runtime Guard]
        ToolRegistry --> PureTS[Pure TypeScript Computation]
        PureTS --> SyntheticDB[(Synthetic Business Dataset JSON)]
    end

    FinalReport --> WebApp
    SafeFallback --> WebApp
```

---

## 2. Component Responsibilities & Communication Contracts

MetricPilot enforces **Centralized Orchestration**. Agents never directly message each other or maintain hidden state. Every agent operates as a stateless function invoked by `src/lib/orchestrator/engine.ts`.

### 1. Planner Agent (`src/lib/agents/plannerAgent.ts`)
- **Input**: User natural-language query sanitized via `sanitizeUntrustedContent`.
- **Output**: `ExecutionPlanSchema` (`ExecutionPlan`):
  - `userIntent`: Clarified goal of the query.
  - `identifiedMetrics`: Array of metrics (`revenue`, `orders`, `conversionRate`, `marketingSpend`, `averageOrderValue`, `customerAcquisitionCost`).
  - `relevantTimePeriods`: Bounds in `YYYY-MM` format (e.g. `['2024-06', '2024-07']`).
  - `subtasks`: Ordered DAG tasks, each targeting an authorized tool with strongly typed parameters.

### 2. Data Analyst Agent (`src/lib/agents/dataAnalystAgent.ts`)
- **Input**: `ExecutionPlan`.
- **Processing**:
  - Validates tool names against `isValidToolName()`.
  - Executes tool functions synchronously in pure TypeScript.
- **Output**: `AnalystResult`:
  - `allTasksSucceeded`: Boolean flag.
  - `evidence`: Array of `EvidenceItem` records containing `taskId`, `tool`, `parameters`, `result`, and an immutable `sourceRef` (e.g. `ref:compare:2024-06_vs_2024-07:all:revenue`).
  - `dataSummary`: High-level synopsis of retrieved data points.

### 3. Insight Agent (`src/lib/agents/insightAgent.ts`)
- **Input**: User query, `EvidenceItem[]`, and optional `critique` from previous verification rejection.
- **Processing**:
  - Interprets evidence into executive findings.
  - Strictly distinguishes observed facts from non-causal hypotheses.
- **Output**: `InsightReportSchema` (`InsightReport`):
  - `executiveSummary`: High-level business overview.
  - `observedFacts`: Array of `ObservedFact` items, each requiring explicit semantic metadata:
    - `claim`: Natural language claim sentence.
    - `metric`: Metric token.
    - `value`: Number or numeric string (preserving negative signs for declines).
    - `assertionType`: `point_in_time` | `base_period` | `target_period` | `delta` | `percentage_change` | `growth_rate` | `channel_metric`.
    - `period`: Optional month in `YYYY-MM` format.
    - `channel`: Optional channel token.
    - `evidenceRef`: Explicit reference pointing to a retrieved `EvidenceItem.sourceRef`.
  - `hypotheses`: Non-causal conjectures requiring further experimentation.
  - `recommendations`: Prioritized, actionable business steps.
  - `unansweredQuestions`: Gaps in available data.

### 4. Verification Agent (`src/lib/agents/verificationAgent.ts`)
- **Input**: `InsightReport` draft and `EvidenceItem[]` ground truth.
- **Processing**:
  - Deterministically evaluates every fact against evidence records in TypeScript (`verifyClaimsDeterministically`).
  - Evaluates metric matching, period matching, directional accuracy, and numerical values using domain-appropriate tolerances:
    - Financial totals: max difference 0.50 (for formatting/cents).
    - Discrete counts: exact integer equality (tolerance 0).
    - Percentages and ratios: max difference 0.05.
- **Output**: `VerificationResultSchema` (`VerificationResult`):
  - `passed`: Boolean (true only if 100% of facts are verified).
  - `overallScore`: 0–100 integer.
  - `verifiedClaims`: Array of verified claim statements with status `VERIFIED`.
  - `unsupportedClaims`: Array of contradicted or unsupported claim statements.
  - `critique`: Actionable error prompt instructing the Insight Agent on what to correct.
  - `requiresCorrection`: Boolean flag indicating retry necessity.

---

## 3. Orchestration & Circuit-Breaker Lifecycle

The orchestrator manages state transitions and error boundaries:

```
[Start]
  │
  ├─► Run Planner Agent
  │     └─► [Schema / LLM Error] ──► FAILED (Exposes structured error)
  │
  ├─► Run Data Analyst Agent (Tools)
  │     └─► [Tool Error / Block] ──► Evidence Item records error ref
  │
  ├─► Loop (attempts = 0 to maxRetries):
  │     ├─► Run Insight Agent
  │     ├─► Run Verification Agent
  │     │     ├─► Audit Passed ──► Return SUCCESS Report
  │     │     └─► Audit Failed:
  │     │           ├─► attempts < maxRetries ──► Retry with Critique
  │     │           └─► attempts >= maxRetries ──► Trigger Circuit Breaker
  │     │
  └─► High-Assurance Circuit Breaker:
        ├─► Append "High-Assurance Circuit Breaker" trace event
        ├─► Filter: Retain verified facts, strip unverified facts
        ├─► Move unverified claims to unansweredQuestions
        └─► Return PARTIAL_SAFE_FALLBACK Report
```

---

## 4. Key Engineering Decisions & Trade-Offs

### 1. Pure TypeScript Math vs. LLM Function Arithmetic
- **Decision**: All mathematical operations (deltas, growth percentages, CAC, ROAS) are calculated in pure TypeScript in `src/lib/tools/registry.ts`.
- **Reasoning**: LLMs are probabilistic sequence predictors and frequently make errors in compounding percentages or rounding negative values. Deterministic computation guarantees 100% arithmetic precision.
- **Trade-off**: Requires pre-defining mathematical functions rather than letting an agent write ad-hoc Python/SQL code. This constrains flexibility to supported business formulas, which is desirable in high-assurance financial environments.

### 2. Zod Validation at Ingress and Egress Boundaries
- **Decision**: Every agent input and output is checked using strict Zod schemas with `.safeParse()`.
- **Reasoning**: Prevents malformed LLM JSON or missing properties from corrupting downstream agent state.
- **Trade-off**: If an LLM response violates schema requirements, it fails immediately. In MetricPilot, this honesty is preferred over attempting heuristic object repairs that risk data corruption.

### 3. Multi-Layer Deterministic Verification Merging
- **Decision**: In Live Gemini mode, `runVerificationAgent` computes the deterministic TypeScript rules first and forcibly merges any failures into the LLM's audit result.
- **Reasoning**: An LLM verifier could succumb to agreeable bias or miss a subtle numerical discrepancy. Enforcing rule-based TypeScript verification as an immutable constraint prevents the model from hallucinating an audit pass.

### 4. Circuit Breakers (`PARTIAL_SAFE_FALLBACK`) vs. Workflow Failure
- **Decision**: When the Insight Agent cannot correct a hallucinated claim after 2 retries, the orchestrator does not crash or throw an unhandled exception. It removes the hallucinated facts, moves them to `unansweredQuestions`, and outputs a partial report flagged with an alert banner.
- **Reasoning**: Executive users still receive verified data (e.g. July revenue dropped -$60,000) while unverified or fabricated assertions (e.g. revenue dropped 50%) are transparently sequestered.

### 5. Prompt Boundary Sanitization
- **Decision**: External queries and retrieved evidence notes are wrapped in `<untrusted_user_query>` and `<untrusted_retrieved_evidence>` boundary tags. The sanitizer normalizes entity encodings and replaces literal angle brackets with Unicode characters (`‹...›`).
- **Reasoning**: Prevents malicious inputs from closing boundary tags (`</untrusted_user_query>`) and injecting instructions into system prompt contexts.

---

## 5. Security Architecture & Threat Boundaries

| Threat Vector | Mitigation Strategy | Enforcement File |
|:---|:---|:---|
| **Delimiter Breakout** | Strips tag variations, normalizes HTML entities, and escapes angle brackets | `src/lib/security/sanitizer.ts` |
| **Unauthorized Tool Execution** | Runtime whitelist rejects unregistered tool calls (`execute_sql`, `shell_exec`) | `src/lib/tools/registry.ts` |
| **API Parameter Injection** | Zod schema validation checks query length (< 2000 chars) and mode enums | `src/app/api/orchestrate/route.ts` |
| **Credential Exposure** | `/api/config` returns only boolean flags; environment keys are never serialized | `src/app/api/config/route.ts` |
| **Evidence Tampering** | Verification auditor cross-checks claims against numeric values in evidence vaults | `src/lib/agents/verificationAgent.ts` |

---

## 6. Known Limitations

1. **Synthetic Dataset Scope**:
   The current data layer queries an in-memory JSON file representing FY2024. It does not connect to live relational data warehouses (Snowflake, BigQuery).
2. **Cognitive Prompt Injection**:
   While delimiter breakouts and unauthorized tool invocations are neutralized, no system using generative LLMs can claim 100% immunity against subtle semantic persuasion attacks. Downstream deterministic verification serves as the secondary barrier.
3. **Sequential Network Latency in Live Mode**:
   A full live evaluation cycle with 4 agents executing sequential Gemini API calls requires ~8–12 seconds.
