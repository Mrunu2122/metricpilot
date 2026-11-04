# MetricPilot: High-Assurance Multi-Agent Analytics Harness

MetricPilot is a high-assurance, multi-agent business intelligence system designed to demonstrate robust orchestration, deterministic tool execution, source citation tracking, zero-tolerance verification auditing, and automated evaluation benchmarks.

Built as an engineering demonstration for AI Systems & Harness Engineering, MetricPilot addresses the primary risk of LLMs in financial and operational analytics: **arithmetic hallucinations, unverified factual assertions, and silent failures under model degradation.**

---

## 1. Problem Statement & Core Principles

Traditional LLM business intelligence applications suffer from several critical reliability and security flaws:
1. **Arithmetic Hallucination**: Generative models cannot reliably perform multi-step math (e.g., compound growth rates, blended ROAS, currency deltas).
2. **Ungrounded Factual Drift**: LLM-generated summaries easily attribute real numbers to incorrect periods, flip directional deltas, or invent plausibly sounding metrics.
3. **Silent Degradation**: Applications often catch exceptions and silently fall back to mock data while reporting a successful live LLM execution.
4. **Delimiter & Prompt Injection**: User inputs or retrieved business notes can close prompt tags and override system boundaries.

### MetricPilot's Design Principles:
- **Centralized Orchestration**: Agents never communicate peer-to-peer. A centralized Finite State Machine (FSM) in `src/lib/orchestrator/engine.ts` governs all state transitions, retries, and fallbacks.
- **Deterministic Math Isolation**: 100% of mathematical computation (deltas, growth percentages, CAC, ROAS) is executed in pure TypeScript functions (`src/lib/tools/registry.ts`). Agents are strictly forbidden from performing LLM arithmetic.
- **Source-Grounded Citations**: Every observed claim emitted by the Insight Agent must carry structured metadata (`metric`, `value`, `assertionType`, `period`, `channel`) and reference a concrete `evidenceRef` issued by the Data Analyst tool execution.
- **Zero-Tolerance Verification & Circuit Breakers**: The Verification Officer checks every numerical claim against ground-truth evidence vaults. If claims contradict evidence or lack valid citations, the orchestrator triggers correction cycles (up to 2 retries). If retries fail, a **High-Assurance Circuit Breaker** activates (`PARTIAL_SAFE_FALLBACK`), isolating unverified claims and surfacing an alert banner.
- **Honest Execution Tracking**: Live Gemini mode and Deterministic Mock mode are strictly segregated. Live failures report honest failure diagnostics rather than masking errors with synthetic mocks.

---

## 2. System Architecture

MetricPilot employs 4 single-responsibility agents coordinated strictly by a central orchestrator:

```
                      [User Natural Language Query]
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    Planner Agent    │
                         │(Decomposition & DAG)│
                         └──────────┬──────────┘
                                    │ ExecutionPlanSchema (Zod Validated)
                                    ▼
                         ┌─────────────────────┐
                         │ Data Analyst Agent  │
                         │ (Deterministic TS)  │
                         └──────────┬──────────┘
                                    │ EvidenceItem[] Vault (Source Citations)
                                    ▼
                         ┌─────────────────────┐
                         │    Insight Agent    │ ◄─── Correction Loop (≤ 2 attempts)
                         │ (Facts vs Hypotheses)│       with Verifier critique
                         └──────────┬──────────┘
                                    │ InsightReportSchema (Draft Report)
                                    ▼
                         ┌─────────────────────┐
                         │ Verification Agent  │
                         │ (Rule-Based TS Audit│
                         └──────────┬──────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
         [Passed Audit (100%)]              [Audit Failure / Retry Exceeded]
                  │                                   │
                  ▼                                   ▼
        ┌───────────────────┐               ┌───────────────────┐
        │  SUCCESS REPORT   │               │PARTIAL_SAFE_FALLBACK│
        │ + Full Trace Log  │               │Circuit Breaker Event│
        └───────────────────┘               └───────────────────┘
```

### The 4 Specialized Agents:
1. **Planner Agent** (`src/lib/agents/plannerAgent.ts`):
   - Decomposes natural language queries into an acyclic directed execution plan of subtasks.
   - Enforces an authorization whitelist allowing only registered tools (`get_metric`, `compare_periods`, `get_channel_breakdown`, `calculate_growth`, `get_top_performers`, `get_bottom_performers`).
   - Encapsulates untrusted queries in `<untrusted_user_query>` boundaries.
2. **Data Analyst Agent** (`src/lib/agents/dataAnalystAgent.ts`):
   - Executes subtasks against the synthetic business dataset in pure TypeScript.
   - Generates an immutable evidence record with a deterministic `sourceRef` (e.g. `ref:2024-07:revenue` or `ref:compare:2024-06_vs_2024-07:all:revenue`).
3. **Insight Agent** (`src/lib/agents/insightAgent.ts`):
   - Synthesizes evidence into structured findings.
   - Requires structured semantic metadata for every fact: `metric`, `value`, `assertionType` (`point_in_time`, `base_period`, `target_period`, `delta`, `percentage_change`, `growth_rate`, `channel_metric`), `period`, `channel`, and `evidenceRef`.
   - Distinguishes observed facts from non-causal hypotheses and recommendations.
4. **Verification Agent** (`src/lib/agents/verificationAgent.ts`):
   - Performs zero-tolerance, rule-based verification in TypeScript (`verifyClaimsDeterministically`).
   - Compares stated numerical values, directions (increase/decrease), and period bounds against the evidence vault using domain-appropriate tolerances (0.5 max for discrete financial totals, 0 for integers, 0.05 for percentages/ratios).
   - In Live Gemini mode, merges deterministic TypeScript audit findings into the LLM output so an LLM can never hallucinate an audit pass.

---

## 3. Technology Stack

- **Framework**: Next.js 16.4.4 (App Router with Turbopack)
- **Runtime**: Node.js >= 20.18.0
- **Language**: TypeScript 5 (Strict type checking, zero `any` bypasses in core contracts)
- **Schema Validation**: Zod 4
- **LLM Integration**: `@google/genai` (Configured for `gemini-3.5-flash-lite`)
- **Visualizations**: Recharts 3.10
- **Styling**: Tailwind CSS 3.4 (Dark Enterprise Theme)
- **Unit & Integration Testing**: Vitest 4.1.12

---

## 4. Evaluation Lab & Benchmark Suite

MetricPilot includes a built-in evaluation harness (`src/components/EvaluationLab.tsx`, `src/lib/eval/runner.ts`, and `src/lib/eval/suite.ts`) executing **13 automated evaluation test cases** across 7 reliability dimensions:

| Test ID | Name | Category | Execution Type | Verified Condition |
|:---|:---|:---|:---|:---|
| `tc-01` | Revenue Comparison | `NUMERICAL_ACCURACY` | Deterministic Unit | June vs July 2024 delta (-$60,000, -9.38%) |
| `tc-02` | Percentage Growth | `NUMERICAL_ACCURACY` | Deterministic Unit | Oct to Dec 2024 growth (+41.35%) |
| `tc-03` | Channel Ranking | `EVIDENCE_COVERAGE` | Deterministic Unit | Identifies Paid Social as bottom ROAS channel in July (1.86x, CAC $141.67) |
| `tc-04` | Missing Data | `SCHEMA_VALIDITY` | Deterministic Unit | Out-of-bounds period refusal (e.g. 2025-05) returns explicit error |
| `tc-05` | Ambiguous Query | `SCHEMA_VALIDITY` | Multi-Agent Workflow | Defaults safely to comparative analysis across recent months with subtasks |
| `tc-06` | Unsupported Metric | `SCHEMA_VALIDITY` | Deterministic Unit | Rejection of unmonitored metrics (employee turnover, server uptime) |
| `tc-07` | Fabricated Claim Detection | `HALLUCINATION_DETECTION` | Deterministic Unit | Flags 50% revenue drop fabrication against true 9.38% drop |
| `tc-08` | Invalid Agent Schema | `SCHEMA_VALIDITY` | Deterministic Unit | Enforces strict Zod parsing across malformed JSON, missing fields, and bad types |
| `tc-09` | Verification Rejection | `VERIFICATION_REJECTION` | Deterministic Unit | Triggers correction demand when claims lack grounded evidence references |
| `tc-10` | End-to-End Workflow | `END_TO_END` | Multi-Agent Workflow | Complete 4-agent run with 100% verification pass, source refs, and full trace |
| `tc-11` | Adversarial Query Boundary | `SECURITY_ADVERSARIAL` | Multi-Agent Workflow | Evaluates prompt boundary containment under instruction override queries |
| `tc-12` | Unregistered Tool Bypass | `SECURITY_ADVERSARIAL` | Deterministic Unit | Blocks unauthorized tool invocations (`execute_sql`, `shell_exec`) |
| `tc-13` | Evidence Tampering Attempt | `SECURITY_ADVERSARIAL` | Deterministic Unit | Blocks audit pass when injected overrides are placed in evidence text |

### Mode Distinction in Evaluation Lab:
- **Deterministic Mock Suite** (Default): Executes all 13 test cases in ~200ms with zero external network requests or API costs.
- **Live Gemini Benchmark**: Multi-agent workflow tests (`tc-05`, `tc-10`, `tc-11`) query the configured Gemini model live, while pure deterministic unit tests remain isolated from API calls. Displays a token consumption disclosure banner before execution.

---

## 5. Security & Boundary Hardening

1. **Prompt Delimiter Sanitization**:
   `src/lib/security/sanitizer.ts` normalizes HTML/XML entities (`&lt;`, `&#60;`, etc.), strips nested boundary tags (`</untrusted_user_query>`), and converts literal angle brackets to Unicode quotation marks (`‹...›`) so external text cannot break prompt delimiters.
2. **Runtime Tool Whitelist**:
   `src/lib/tools/registry.ts` checks every tool name against `isValidToolName()`. Unregistered tools (such as `execute_sql`, `shell_exec`, or prototype pollution keys) are rejected with an authorization failure.
3. **API Route Hardening**:
   `src/app/api/orchestrate/route.ts` validates incoming payloads with Zod, enforcing non-empty queries (max 2000 chars) and strict `mode` enums (`'mock'` or `'live'`). Unrecognized modes reject with HTTP 400.
4. **Secret Protection**:
   `/api/config` reports only boolean presence flags (`keyEnvExists`, `keyNonEmpty`) and never returns the actual `GEMINI_API_KEY` string.
5. **Security Limitations**:
   MetricPilot's boundaries mitigate delimiter breakouts and unauthorized tool invocations. They do not claim absolute cognitive immunity against sophisticated semantic prompt injections; live model outputs are therefore always audited downstream by deterministic verification rules.

---

## 6. Synthetic Business Dataset Notice

All metrics presented in this application are derived from a synthetic 12-month FY2024 e-commerce business dataset (`src/data/businessMetrics.json`). Data includes multi-channel attribution (Organic Search, Paid Search, Paid Social, Email Marketing, Affiliate), blended and channel-level CAC, ROAS, AOV, and conversion rates.

---

## 7. Getting Started

### Prerequisites
- Node.js >= 20.18.0
- npm >= 10.0.0

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd metricpilot

# Install dependencies
npm install
```

### Environment Configuration
Copy `.env.example` to `.env.local` (or create `.env.local` in project root):
```env
# Gemini API Key (Optional: Required only for Live Gemini execution; system runs full deterministic mock suite if omitted)
GEMINI_API_KEY=your_gemini_api_key_here

# Model Identifier (Defaults to gemini-3.5-flash-lite)
GEMINI_MODEL=gemini-3.5-flash-lite

# Orchestrator Timeouts (in milliseconds)
ORCHESTRATOR_TIMEOUT_MS=30000
MAX_VERIFICATION_RETRIES=2
```

### Running Tests
Execute the full Vitest suite (69 tests across 11 test files):
```bash
npm test
```

### Running the Application
Start the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to inspect the MetricPilot dashboard, trace logs, and Evaluation Lab.

### Building for Production
```bash
npm run build
npm start
```
