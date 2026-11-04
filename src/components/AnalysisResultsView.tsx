'use client';

import React, { useState } from 'react';
import { InsightReport, VerificationResult, EvidenceItem, ExecutionPlan } from '@/types/agentContracts';
import { CheckCircle2, AlertOctagon, Lightbulb, Compass, FileText, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

interface AnalysisResultsProps {
  report?: InsightReport;
  verification?: VerificationResult;
  evidence?: EvidenceItem[];
  plan?: ExecutionPlan;
  safeFallbackNotice?: string;
  isMockMode?: boolean;
}

export function AnalysisResultsView({
  report,
  verification,
  evidence,
  plan,
  safeFallbackNotice,
  isMockMode,
}: AnalysisResultsProps) {
  const [showEvidenceTable, setShowEvidenceTable] = useState(false);

  if (!report) {
    return (
      <div className="bg-[#0f172a]/60 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        <FileText className="w-8 h-8 mx-auto mb-2 text-slate-500 opacity-60" />
        <p className="text-sm">Awaiting orchestration run. Enter a query or select an example question above.</p>
      </div>
    );
  }

  const isVerified = verification?.passed ?? false;

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      {safeFallbackNotice && (
        <div className="bg-amber-950/40 border border-amber-800/80 rounded-xl p-4 flex items-start space-x-3 text-amber-200">
          <AlertOctagon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-semibold block mb-0.5">High-Assurance Circuit Breaker Triggered:</span>
            {safeFallbackNotice}
          </div>
        </div>
      )}

      {/* Verification Badge & Executive Summary */}
      <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            {isVerified ? (
              <span className="flex items-center px-2.5 py-1 rounded bg-emerald-950/70 border border-emerald-700/80 text-emerald-300 text-xs font-mono font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                VERIFICATION PASSED ({verification?.overallScore}%)
              </span>
            ) : (
              <span className="flex items-center px-2.5 py-1 rounded bg-rose-950/70 border border-rose-700/80 text-rose-300 text-xs font-mono font-medium">
                <AlertOctagon className="w-3.5 h-3.5 mr-1.5 text-rose-400" />
                VERIFICATION AUDIT REJECTION
              </span>
            )}
            {isMockMode && (
              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-amber-400 text-[10px] font-mono">
                SYNTHETIC MOCK ENGINE
              </span>
            )}
          </div>
          <span className="text-xs font-mono text-slate-400">
            Audit references: {report.observedFacts.length} claims verified
          </span>
        </div>

        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2 font-mono">
          Executive Summary
        </h3>
        <p className="text-slate-100 text-sm leading-relaxed font-sans">{report.executiveSummary}</p>
      </div>

      {/* Observed Facts vs Hypotheses Dual Column */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Observed Facts (Deterministic Evidence) */}
        <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-slate-800">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold">
              Observed Facts (Deterministic Evidence)
            </h4>
          </div>

          <div className="space-y-3">
            {report.observedFacts.map((fact, idx) => (
              <div key={idx} className="bg-[#090e18] p-3 rounded-lg border border-slate-800/80">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[11px] font-mono text-cyan-400 font-medium uppercase">
                    {fact.metric}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                    {fact.evidenceRef}
                  </span>
                </div>
                <p className="text-xs text-slate-200 font-sans">{fact.claim}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Hypotheses (Potential Explanations) */}
        <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-slate-800">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold">
              Hypotheses (Non-Causal Insights)
            </h4>
          </div>

          <div className="space-y-3">
            {report.hypotheses.map((hypo, idx) => (
              <div key={idx} className="bg-[#090e18] p-3 rounded-lg border border-slate-800/80">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-slate-200">{hypo.observation}</span>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800">
                    {hypo.confidence} conf
                  </span>
                </div>
                <p className="text-xs text-slate-300 mb-2">{hypo.potentialCause}</p>
                <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800 font-mono">
                  <span className="text-cyan-400">Next validation: </span>
                  {hypo.validationStep}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actionable Recommendations */}
      <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-slate-800">
          <Compass className="w-4 h-4 text-emerald-400" />
          <h4 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold">
            Actionable Strategic Recommendations
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {report.recommendations.map((rec, idx) => (
            <div key={idx} className="bg-[#0a0f1d] border border-slate-800/80 p-4 rounded-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-100">{rec.action}</span>
                  <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded ${
                    rec.impact === 'critical'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : rec.impact === 'high'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-blue-950 text-blue-300 border border-blue-800'
                  }`}>
                    {rec.impact} impact
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-normal">{rec.rationale}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Raw Ground-Truth Evidence Inspector (Collapsible) */}
      {evidence && evidence.length > 0 && (
        <div className="bg-[#0f172a]/80 border border-slate-800 rounded-xl p-4">
          <button
            onClick={() => setShowEvidenceTable(!showEvidenceTable)}
            className="w-full flex items-center justify-between text-xs font-mono text-slate-300 hover:text-cyan-400 transition-colors"
          >
            <span>Retrieved Ground-Truth Evidence Vault ({evidence.length} records)</span>
            {showEvidenceTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showEvidenceTable && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 px-3">Ref ID</th>
                    <th className="py-2 px-3">Tool</th>
                    <th className="py-2 px-3">Summary</th>
                    <th className="py-2 px-3">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {evidence.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-900/40">
                      <td className="py-2 px-3 text-cyan-400">{ev.sourceRef}</td>
                      <td className="py-2 px-3 text-blue-300">{ev.tool}</td>
                      <td className="py-2 px-3 text-slate-200">{ev.summary}</td>
                      <td className="py-2 px-3 text-slate-400 max-w-xs truncate">
                        {JSON.stringify(ev.result)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
