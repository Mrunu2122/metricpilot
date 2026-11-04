'use client';

import React, { useState, useEffect } from 'react';
import { OrchestrationResult } from '@/types/agentContracts';
import { ExecutionTraceViewer } from '@/components/ExecutionTraceViewer';
import { AnalysisResultsView } from '@/components/AnalysisResultsView';
import { EvaluationLab } from '@/components/EvaluationLab';
import { BusinessPerformanceCharts } from '@/components/BusinessPerformanceCharts';
import {
  Sparkles,
  Send,
  Layers,
  Database,
  ShieldCheck,
  RefreshCw,
  Cpu,
  Zap,
} from 'lucide-react';

const EXAMPLE_QUERIES = [
  'Why did revenue decrease this month? Which marketing channel performed worst, and what should we investigate?',
  'Calculate the revenue growth rate from October 2024 to December 2024',
  'Which marketing channel performed worst in July 2024 by ROAS?',
  'Compare monthly revenue and CAC between June 2024 and July 2024',
];

export default function Home() {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ANALYSIS' | 'TRACES' | 'EVAL_LAB' | 'DATASET'>('ANALYSIS');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<OrchestrationResult | null>(null);

  // Execution Mode: 'mock' | 'live'
  const [executionMode, setExecutionMode] = useState<'mock' | 'live'>('mock');
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null);
  const [configuredModel, setConfiguredModel] = useState<string>('gemini-3.5-flash-lite');

  // Dashboard Statistics
  const [stats, setStats] = useState<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    mockExecutions: number;
    liveExecutions: number;
    durations: number[];
  }>({
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    mockExecutions: 0,
    liveExecutions: 0,
    durations: [],
  });

  // Fetch server configuration status
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        setGeminiConfigured(!!data.geminiConfigured);
        if (data.configuredModel) setConfiguredModel(data.configuredModel);
      })
      .catch(() => setGeminiConfigured(false));
  }, []);

  const handleExecute = async (inputQuery?: string) => {
    const q = (inputQuery !== undefined ? inputQuery : query).trim();
    if (!q || isLoading) return;

    setIsLoading(true);
    // Switch to Analysis tab immediately so user sees the report load
    setActiveTab('ANALYSIS');

    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, mode: executionMode }),
      });
      const data: OrchestrationResult = await res.json();
      setResult(data);

      const isSuccess = data.status === 'SUCCESS' || data.status === 'PARTIAL_SAFE_FALLBACK';
      const isMock = !!data.isMockMode;

      setStats((prev) => ({
        totalExecutions: prev.totalExecutions + 1,
        successfulExecutions: isSuccess ? prev.successfulExecutions + 1 : prev.successfulExecutions,
        failedExecutions: isSuccess ? prev.failedExecutions : prev.failedExecutions + 1,
        mockExecutions: isMock ? prev.mockExecutions + 1 : prev.mockExecutions,
        liveExecutions: isMock ? prev.liveExecutions : prev.liveExecutions + 1,
        durations: [...prev.durations, data.totalDurationMs || 0],
      }));
    } catch (err) {
      console.error('Execution failure', err);
      setStats((prev) => ({
        ...prev,
        totalExecutions: prev.totalExecutions + 1,
        failedExecutions: prev.failedExecutions + 1,
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const avgDuration =
    stats.durations.length > 0
      ? `${Math.round(stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length)}ms`
      : 'N/A';

  const passRate =
    stats.totalExecutions > 0
      ? `${Math.round((stats.successfulExecutions / stats.totalExecutions) * 100)}%`
      : 'Not Yet Available';

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-[#090e1a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Cpu className="w-4 h-4 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold tracking-tight text-sm text-slate-100 font-mono">METRICPILOT</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800">
                  ORCHESTRATOR v2.4
                </span>
              </div>
              <p className="text-[11px] text-slate-400">High-Assurance Agentic Business Intelligence Harness</p>
            </div>
          </div>

          {/* Mode Selector & Navigation Tabs */}
          <div className="flex items-center space-x-3">
            {/* Mode Switcher Pill */}
            <div className="flex items-center space-x-2 bg-[#050811] px-2.5 py-1 rounded-lg border border-slate-800 text-xs">
              <span className="text-slate-400 text-[11px] font-mono hidden sm:inline">Execution Mode:</span>
              <button
                type="button"
                onClick={() => setExecutionMode('mock')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-colors cursor-pointer ${
                  executionMode === 'mock'
                    ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Mock (Deterministic)
              </button>
              <button
                type="button"
                onClick={() => setExecutionMode('live')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium flex items-center space-x-1 transition-colors cursor-pointer ${
                  executionMode === 'live'
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="w-3 h-3" />
                <span>Live Gemini</span>
              </button>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex items-center space-x-1 bg-[#050811] p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveTab('ANALYSIS')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeTab === 'ANALYSIS'
                    ? 'bg-slate-800 text-cyan-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Analysis & Report
              </button>
              <button
                onClick={() => setActiveTab('TRACES')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center space-x-1.5 ${
                  activeTab === 'TRACES'
                    ? 'bg-slate-800 text-cyan-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Agent Traces</span>
                {result?.traces && (
                  <span className="text-[10px] font-mono bg-slate-900 px-1 rounded text-cyan-400">
                    {result.traces.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('EVAL_LAB')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center space-x-1.5 ${
                  activeTab === 'EVAL_LAB'
                    ? 'bg-slate-800 text-cyan-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Evaluation Lab</span>
              </button>
              <button
                onClick={() => setActiveTab('DATASET')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center space-x-1.5 ${
                  activeTab === 'DATASET'
                    ? 'bg-slate-800 text-cyan-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Dataset</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Execution Mode / Key Status Banner */}
        <div className="bg-[#0b1322]/80 border border-slate-800/80 rounded-xl p-3 px-4 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <span
              className={`w-2 h-2 rounded-full ${
                executionMode === 'live' ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-300">
              Active Mode:{' '}
              <strong className={executionMode === 'live' ? 'text-cyan-400' : 'text-amber-400'}>
                {executionMode === 'live'
                  ? `Live Gemini API (${configuredModel})`
                  : 'Deterministic Mock Mode (No API spend)'}
              </strong>
            </span>
            <span className="text-slate-500 font-mono hidden md:inline">|</span>
            <span className="text-slate-400 hidden md:inline">
              Server API Key:{' '}
              {geminiConfigured === true ? (
                <span className="text-emerald-400 font-medium">Configured</span>
              ) : geminiConfigured === false ? (
                <span className="text-rose-400 font-medium">Not configured in environment</span>
              ) : (
                'Checking...'
              )}
            </span>
          </div>
          <span className="font-mono text-[10px] text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded">
            STRICT FACTUAL GROUNDING
          </span>
        </div>

        {/* Dashboard Metric KPI Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#0f172a]/80 border border-slate-800 rounded-xl p-4 shadow-lg">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Total Executions</span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-2xl font-bold text-slate-100">{stats.totalExecutions}</span>
              <span className="text-xs text-slate-500 font-mono">
                ({stats.liveExecutions} live, {stats.mockExecutions} mock)
              </span>
            </div>
          </div>

          <div className="bg-[#0f172a]/80 border border-slate-800 rounded-xl p-4 shadow-lg">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Verification Pass Rate</span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span
                className={`text-2xl font-bold ${
                  stats.totalExecutions === 0
                    ? 'text-slate-500'
                    : stats.successfulExecutions === stats.totalExecutions
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {passRate}
              </span>
              {stats.totalExecutions > 0 && (
                <span className="text-xs text-slate-500 font-mono">
                  ({stats.successfulExecutions}/{stats.totalExecutions})
                </span>
              )}
            </div>
          </div>

          <div className="bg-[#0f172a]/80 border border-slate-800 rounded-xl p-4 shadow-lg">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Avg Execution Time</span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className={`text-2xl font-bold ${stats.durations.length === 0 ? 'text-slate-500' : 'text-cyan-400'}`}>
                {avgDuration}
              </span>
              <span className="text-xs text-slate-500 font-mono">measured latency</span>
            </div>
          </div>

          <div className="bg-[#0f172a]/80 border border-slate-800 rounded-xl p-4 shadow-lg">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Failed Executions</span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className={`text-2xl font-bold ${stats.failedExecutions > 0 ? 'text-rose-400' : 'text-slate-100'}`}>
                {stats.failedExecutions}
              </span>
              <span className="text-xs text-slate-500 font-mono">rejections / errors</span>
            </div>
          </div>
        </div>

        {/* Query Input Section */}
        <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-slate-200">Ask MetricPilot</h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Target Mode:{' '}
              <strong className={executionMode === 'live' ? 'text-cyan-400' : 'text-amber-400'}>
                {executionMode.toUpperCase()}
              </strong>
            </span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleExecute();
            }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Why did revenue decrease this month? Which marketing channel performed worst, and what should we investigate?"
              className="flex-1 bg-[#070b14] border border-slate-700/80 rounded-lg px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-sans"
            />
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-semibold rounded-lg text-sm transition-all duration-150 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-cyan-500/20"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Orchestrating...</span>
                </>
              ) : (
                <>
                  <span>Execute Workflow</span>
                  <Send className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Example Prompts */}
          <div className="mt-4 pt-4 border-t border-slate-800/80">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-2">
              Recommended Interview Demonstration Scenarios:
            </span>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUERIES.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setQuery(q);
                    handleExecute(q);
                  }}
                  className="text-xs bg-[#090d16] hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-300 px-3 py-1.5 rounded-lg transition-colors text-left font-sans cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live Active Agent Step Indicator during loading */}
        {isLoading && (
          <div className="bg-[#0b1322] border border-cyan-800/60 rounded-xl p-5 shadow-lg flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin flex items-center justify-center" />
              <div>
                <h4 className="text-xs font-mono font-semibold text-cyan-300 uppercase">
                  Active Multi-Agent Orchestration ({executionMode.toUpperCase()} MODE)
                </h4>
                <p className="text-xs text-slate-400">
                  Planner decomposing query → Data Analyst fetching metrics → Insight generating draft → Verifier auditing claims.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 px-3 py-1 rounded border border-cyan-800 animate-pulse">
              RUNNING
            </span>
          </div>
        )}

        {/* Tab Views */}
        {activeTab === 'ANALYSIS' && (
          <div className="space-y-6">
            <AnalysisResultsView
              report={result?.finalReport}
              verification={result?.verification}
              evidence={result?.evidence}
              plan={result?.plan}
              safeFallbackNotice={result?.safeFallbackNotice}
              isMockMode={result?.isMockMode}
            />
            {/* Visual Performance Charts */}
            <div className="pt-4">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2 font-semibold">
                Baseline Business Metrics Visualization
              </h3>
              <BusinessPerformanceCharts />
            </div>
          </div>
        )}

        {activeTab === 'TRACES' && (
          <ExecutionTraceViewer traces={result?.traces || []} isMockMode={result?.isMockMode} />
        )}

        {activeTab === 'EVAL_LAB' && <EvaluationLab />}

        {activeTab === 'DATASET' && (
          <div className="space-y-6">
            <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-sm">
              <div className="flex items-center space-x-2 mb-2">
                <Database className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-semibold text-slate-100">
                  Synthetic Business Metrics Store (12-Month Repository)
                </h3>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Deterministic business activity records for FY2024. All analytical calculations (growth, deltas, ROAS, CAC) are computed strictly in TypeScript functions.
              </p>
              <BusinessPerformanceCharts />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-[#050811] py-6 text-center text-xs text-slate-500 font-mono">
        <p>MetricPilot — Senior AI Engineer Orchestration & Evaluation Demonstration</p>
        <p className="text-[11px] text-slate-600 mt-1">Multi-Agent FSM • Deterministic Tools • Zero-Tolerance Verification Harness</p>
      </footer>
    </div>
  );
}
