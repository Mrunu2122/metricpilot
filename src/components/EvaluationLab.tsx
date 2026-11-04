'use client';

import React, { useState, useEffect } from 'react';
import { EvaluationSuiteReport } from '@/lib/eval/suite';
import {
  Play,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  RefreshCw,
  Cpu,
  Sparkles,
  AlertTriangle,
  Info,
} from 'lucide-react';

export function EvaluationLab() {
  const [report, setReport] = useState<EvaluationSuiteReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [executionMode, setExecutionMode] = useState<'mock' | 'live'>('mock');
  const [geminiConfigured, setGeminiConfigured] = useState<boolean>(false);
  const [configuredModel, setConfiguredModel] = useState<string>('gemini-3.5-flash-lite');
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.geminiConfigured === 'boolean') {
          setGeminiConfigured(data.geminiConfigured);
          if (data.configuredModel) {
            setConfiguredModel(data.configuredModel);
          }
        }
      })
      .catch((err) => console.error('Failed to load Gemini config:', err));
  }, []);

  const runEvaluation = async () => {
    setIsRunning(true);
    setRunError(null);
    try {
      const forceMock = executionMode === 'mock';
      const res = await fetch('/api/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceMock }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to execute evaluation suite');
      }
      setReport(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRunError(msg);
      console.error('Failed to run eval suite', err);
    } finally {
      setIsRunning(false);
    }
  };

  const filteredResults = report
    ? selectedCategory === 'ALL'
      ? report.results
      : report.results.filter((r) => r.category === selectedCategory)
    : [];

  const categories = [
    'ALL',
    'NUMERICAL_ACCURACY',
    'EVIDENCE_COVERAGE',
    'SCHEMA_VALIDITY',
    'HALLUCINATION_DETECTION',
    'VERIFICATION_REJECTION',
    'END_TO_END',
    'SECURITY_ADVERSARIAL',
  ];

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
              <h3 className="text-base font-semibold text-slate-100">
                Evaluation Harness & Benchmark Suite
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Automated deterministic test harness evaluating 13 critical reliability dimensions: numerical precision, schema integrity, hallucination prevention, zero-tolerance verification enforcement, and prompt-injection defense.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Mode Selector */}
            <div className="inline-flex rounded-lg bg-[#090d16] p-1 border border-slate-800 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setExecutionMode('mock')}
                disabled={isRunning}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                  executionMode === 'mock'
                    ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Deterministic Mock</span>
              </button>
              <button
                type="button"
                onClick={() => setExecutionMode('live')}
                disabled={isRunning}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                  executionMode === 'live'
                    ? 'bg-purple-950/80 text-purple-300 font-semibold border border-purple-800/60 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Live Gemini</span>
              </button>
            </div>

            {/* Run Button */}
            <button
              onClick={runEvaluation}
              disabled={isRunning || (executionMode === 'live' && !geminiConfigured)}
              className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-medium text-xs shadow-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>
                    {executionMode === 'live' ? 'Benchmarking with Gemini...' : 'Running 13 Test Cases...'}
                  </span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {executionMode === 'live' ? 'Execute Live Benchmark' : 'Execute Suite (Deterministic)'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Gemini Disclosure & Configuration Notice */}
        {executionMode === 'live' && (
          <div className="mt-4 p-3.5 rounded-lg border border-purple-800/40 bg-purple-950/20 text-xs text-purple-200 space-y-1.5">
            <div className="flex items-center space-x-2 font-semibold">
              <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Live Gemini Benchmark Disclosure</span>
            </div>
            <p className="text-purple-300/90 text-[11px] leading-relaxed">
              This mode executes multi-agent workflows using model <code className="bg-purple-900/60 px-1 py-0.5 rounded text-purple-200">{configuredModel}</code> via your configured API key and will consume model tokens.
              Deterministic unit tests (10 tests) execute instantly without API calls, while multi-agent workflow tests (3 tests) query Gemini live.
            </p>
            {!geminiConfigured && (
              <div className="flex items-center space-x-1.5 text-amber-400 font-medium text-[11px] mt-1 pt-1 border-t border-purple-800/30">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Gemini API key is not configured. Add GEMINI_API_KEY in .env.local to run live benchmarks.</span>
              </div>
            )}
          </div>
        )}

        {/* Run Error Banner */}
        {runError && (
          <div className="mt-4 p-3 rounded-lg border border-rose-800/60 bg-rose-950/30 text-rose-300 text-xs flex items-center space-x-2">
            <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{runError}</span>
          </div>
        )}

        {/* Aggregate KPI Summary Cards */}
        {report && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800">
            <div className="bg-[#0a0f1d] border border-slate-800/80 p-3 rounded-lg">
              <span className="text-[11px] font-mono text-slate-400 uppercase">Pass Rate</span>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-2xl font-bold text-emerald-400">{report.overallPassRate}%</span>
                <span className="text-xs text-slate-500">({report.passedTests}/{report.totalTests})</span>
              </div>
            </div>

            <div className="bg-[#0a0f1d] border border-slate-800/80 p-3 rounded-lg">
              <span className="text-[11px] font-mono text-slate-400 uppercase">Average Score</span>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-2xl font-bold text-cyan-400">{report.averageScore}/100</span>
              </div>
            </div>

            <div className="bg-[#0a0f1d] border border-slate-800/80 p-3 rounded-lg">
              <span className="text-[11px] font-mono text-slate-400 uppercase">Execution Duration</span>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-2xl font-bold text-slate-200">{report.durationMs}ms</span>
                <span className="text-xs text-slate-500 font-mono">
                  {report.isMockMode ? 'deterministic mock' : 'live gemini'}
                </span>
              </div>
            </div>

            <div className="bg-[#0a0f1d] border border-slate-800/80 p-3 rounded-lg">
              <span className="text-[11px] font-mono text-slate-400 uppercase">Suite Execution Mode</span>
              <div className="flex items-center space-x-1.5 mt-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    report.isMockMode ? 'bg-cyan-400' : 'bg-purple-400 animate-pulse'
                  }`}
                />
                <span
                  className={`text-xs font-semibold ${
                    report.isMockMode ? 'text-cyan-300' : 'text-purple-300'
                  }`}
                >
                  {report.isMockMode ? 'DETERMINISTIC MOCK' : 'LIVE GEMINI BENCHMARK'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Test Case Breakdown Table */}
      {report && (
        <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h4 className="text-sm font-semibold text-slate-200">
              Individual Test Case Diagnostics ({filteredResults.length} of {report.totalTests})
            </h4>

            {/* Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1 bg-[#090d16] p-1 rounded-lg border border-slate-800 text-xs">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                    selectedCategory === cat
                      ? 'bg-slate-800 text-cyan-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {filteredResults.map((test) => (
              <div
                key={test.testId}
                className="bg-[#0b1322] border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center space-x-3">
                    {test.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <div>
                      <span className="text-xs font-mono font-bold text-slate-200 mr-2">{test.testId}:</span>
                      <span className="text-xs font-semibold text-slate-300">{test.name}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs font-mono">
                    {/* Execution Type Badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                        test.executionType === 'MULTI_AGENT_WORKFLOW'
                          ? 'bg-purple-950/60 text-purple-300 border-purple-800/80'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                      title={
                        test.executionType === 'MULTI_AGENT_WORKFLOW'
                          ? 'Executes full multi-agent pipeline (Planner -> Analyst -> Insight -> Verification)'
                          : 'Deterministic pure unit test (runs locally without LLM calls)'
                      }
                    >
                      {test.executionType === 'MULTI_AGENT_WORKFLOW' ? 'Multi-Agent Workflow' : 'Deterministic Unit'}
                    </span>

                    <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-400 text-[10px]">
                      {test.category}
                    </span>
                    <span className="text-slate-500">{test.durationMs}ms</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        test.passed
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                          : 'bg-rose-950/60 text-rose-400 border border-rose-800'
                      }`}
                    >
                      {test.passed ? 'PASS (100%)' : 'FAIL'}
                    </span>
                  </div>
                </div>

                {/* Adversarial Scope Note for TC-11 */}
                {test.testId === 'tc-11' && (
                  <div className="ml-7 mb-2 px-2.5 py-1.5 rounded bg-slate-900/90 border border-slate-800/80 text-[11px] text-slate-400 flex items-start space-x-1.5">
                    <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    <span>
                      {report.isMockMode
                        ? 'Scope: Validates prompt structural delimiter boundary encapsulation, input sanitization, and safe error-free execution. (Does not prove live cognitive prompt injection resistance; run in Live Gemini mode for live model evaluation).'
                        : 'Scope: Evaluates live Gemini execution under adversarial override attempts and validates boundary containment without prompt leakage.'}
                    </span>
                  </div>
                )}

                {/* Failure Reason Banner if test failed */}
                {test.failureReason && (
                  <div className="ml-7 mb-2 px-2.5 py-1.5 rounded bg-rose-950/40 border border-rose-800/70 text-[11px] text-rose-300 font-mono">
                    <span className="font-bold">Failure Diagnostic: </span>
                    {test.failureReason}
                  </div>
                )}

                {/* Sub-checks */}
                <div className="pl-7 space-y-1.5 mt-2">
                  {test.checks.map((chk, cIdx) => (
                    <div key={cIdx} className="text-[11px] font-mono flex items-center justify-between text-slate-400">
                      <span className="flex items-center">
                        <span className={`w-1.5 h-1.5 rounded-full mr-2 ${chk.passed ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        {chk.name}
                      </span>
                      {chk.details && <span className="text-slate-500">{chk.details}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
