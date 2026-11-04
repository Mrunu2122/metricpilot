'use client';

import React from 'react';
import { StepTrace } from '@/types/agentContracts';
import { CheckCircle2, Clock, AlertTriangle, ArrowRight, ShieldCheck, Terminal, Cpu } from 'lucide-react';

interface TraceViewerProps {
  traces: StepTrace[];
  isMockMode?: boolean;
}

export function ExecutionTraceViewer({ traces, isMockMode }: TraceViewerProps) {
  if (!traces || traces.length === 0) {
    return (
      <div className="bg-[#0f172a]/60 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        <Cpu className="w-8 h-8 mx-auto mb-2 text-slate-500 opacity-60" />
        <p className="text-sm">No active execution trace. Submit a query to inspect agent handoffs in real-time.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200 tracking-wide">Multi-Agent Execution Audit Log</h3>
        </div>
        <div className="flex items-center space-x-3 text-xs">
          {isMockMode && (
            <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded font-mono text-[11px]">
              DETERMINISTIC MOCK MODE
            </span>
          )}
          <span className="text-slate-400 font-mono">
            {traces.length} {traces.length === 1 ? 'step' : 'steps'} recorded
          </span>
        </div>
      </div>

      <div className="relative pl-6 border-l border-slate-800 space-y-6 my-4">
        {traces.map((trace, idx) => {
          const isVerifier = trace.agentRole === 'VERIFICATION_OFFICER';
          const isAnalyst = trace.agentRole === 'DATA_ANALYST';
          const isPlanner = trace.agentRole === 'PLANNER';
          const isInsight = trace.agentRole === 'INSIGHT_SPECIALIST';

          const roleBadgeColor = isPlanner
            ? 'bg-purple-950/60 text-purple-300 border-purple-800'
            : isAnalyst
            ? 'bg-blue-950/60 text-blue-300 border-blue-800'
            : isInsight
            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
            : 'bg-amber-950/60 text-amber-300 border-amber-800';

          return (
            <div key={idx} className="relative group">
              {/* Stepper Dot */}
              <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-slate-900 border-2 border-cyan-500 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              </div>

              <div className="bg-[#0b1322] border border-slate-800/90 rounded-lg p-4 transition-all duration-150 hover:border-slate-700 shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center space-x-2">
                    <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded border ${roleBadgeColor}`}>
                      STEP {trace.stepIndex}: {trace.agentRole}
                    </span>
                    <span className="text-xs font-semibold text-slate-200">{trace.agentName}</span>
                  </div>
                  <div className="flex items-center space-x-3 text-xs text-slate-400 font-mono">
                    <span className="flex items-center">
                      <Clock className="w-3 h-3 mr-1 text-slate-500" />
                      {trace.durationMs}ms
                    </span>
                    {trace.tokensUsed && (
                      <span className="text-[11px] text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                        {trace.tokensUsed.totalTokens} tok
                      </span>
                    )}
                    {trace.status === 'COMPLETED' ? (
                      <span className="text-emerald-400 flex items-center text-xs font-sans">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Success
                      </span>
                    ) : trace.status === 'RETRYING' ? (
                      <span className="text-amber-400 flex items-center text-xs font-sans">
                        <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Retrying
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center text-xs font-sans">
                        <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Error
                      </span>
                    )}
                  </div>
                </div>

                {/* Input Context */}
                <div className="text-xs text-slate-400 bg-[#070b14] p-2.5 rounded border border-slate-800/80 mb-2 font-mono">
                  <span className="text-slate-500">Input Context: </span>
                  <span className="text-slate-300">{trace.inputSummary}</span>
                </div>

                {/* Output Summary */}
                {trace.outputSummary && (
                  <div className="text-xs text-slate-300 bg-[#0d1627] p-2.5 rounded border border-slate-800/90 font-mono">
                    <span className="text-cyan-400 font-semibold">Output Contract: </span>
                    <span>{trace.outputSummary}</span>
                  </div>
                )}

                {/* Tool Invocations for Analyst */}
                {trace.toolCalls && trace.toolCalls.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-800/60">
                    <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-2">
                      Deterministic Tool Invocations:
                    </span>
                    <div className="space-y-1.5">
                      {trace.toolCalls.map((tc, tIdx) => (
                        <div
                          key={tIdx}
                          className="text-[11px] font-mono bg-[#060a12] p-2 rounded border border-slate-800/70 flex items-start justify-between gap-2"
                        >
                          <div>
                            <span className="text-blue-400 font-bold">{tc.toolName}</span>
                            <span className="text-slate-500 ml-2">({JSON.stringify(tc.params)})</span>
                          </div>
                          <span className="text-emerald-400 text-right">{tc.resultSummary}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
