# MetricPilot Agent Guidelines & Architecture

## System Overview
MetricPilot is an enterprise multi-agent analytics system with centralized orchestration and deterministic verification.

### Core Architectural Rules
1. **Centralized Orchestration**: Agents NEVER communicate peer-to-peer or call each other directly. All state transitions, retry loops, and handoffs are governed strictly by the central engine in `src/lib/orchestrator/engine.ts`.
2. **Deterministic Computation**: All numerical math (deltas, growth percentages, CAC, ROAS, AOV) MUST be computed in pure TypeScript tool functions (`src/lib/tools/registry.ts`). Agents must NEVER use LLM arithmetic.
3. **Source Citation Grounding**: Every observed fact produced by the Insight Agent MUST map to an explicit `evidenceRef` issued by the Data Analyst tool execution.
4. **Zero-Tolerance Verification**: The Verification Officer checks every claim against the ground truth. If claims are contradicted or unsupported, the orchestrator triggers a correction cycle (maximum 2 retries). If verification fails after retries, a safe fallback report is produced, stripping unverified claims.
5. **Synthetic Dataset Transparency**: All business data is synthetic and explicitly labeled as such.

### Agent Contracts & Responsibilities
- **Planner Agent**: `src/lib/agents/plannerAgent.ts` → Outputs `ExecutionPlanSchema`
- **Data Analyst Agent**: `src/lib/agents/dataAnalystAgent.ts` → Outputs `AnalystResultSchema`
- **Insight Agent**: `src/lib/agents/insightAgent.ts` → Outputs `InsightReportSchema`
- **Verification Agent**: `src/lib/agents/verificationAgent.ts` → Outputs `VerificationResultSchema`

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
