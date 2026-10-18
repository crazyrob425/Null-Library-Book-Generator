import React from 'react';
import { PipelineSnapshot } from '../types';
import { PIPELINE_STAGES, resolvePipelineStatuses } from '../services/pipelineStages';

interface PipelineTrackerProps {
  snapshot: PipelineSnapshot;
}

/**
 * Compact 12-stage pipeline tracker rendered under the main step stepper.
 * Statuses derive from measurable app state; human-gate stages carry a badge.
 */
const PipelineTracker: React.FC<PipelineTrackerProps> = ({ snapshot }) => {
  const statuses = resolvePipelineStatuses(snapshot);
  const completed = statuses.filter((s) => s === 'complete').length;

  return (
    <div className="mt-4 rounded-lg border border-slate-700/60 bg-slate-800/40 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold tracking-widest text-slate-400 uppercase">
          Book-Forge Pipeline
        </h4>
        <span className="text-xs text-slate-500">
          {completed}/{PIPELINE_STAGES.length} stages
        </span>
      </div>
      <ol className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
        {PIPELINE_STAGES.map((stage, i) => {
          const status = statuses[i];
          return (
            <li
              key={stage.id}
              title={`${stage.name}\n${stage.description}\nGate: ${stage.qualityGate}`}
              className={`flex-shrink-0 w-28 rounded-md border px-2 py-2 text-left transition-colors ${
                status === 'complete'
                  ? 'border-emerald-700/60 bg-emerald-950/40'
                  : status === 'current'
                  ? 'border-violet-500 bg-violet-950/40 shadow-[0_0_12px_rgba(139,92,246,0.25)]'
                  : 'border-slate-700/60 bg-slate-800/30 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] font-bold ${
                    status === 'complete'
                      ? 'text-emerald-400'
                      : status === 'current'
                      ? 'text-violet-300'
                      : 'text-slate-500'
                  }`}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                {stage.humanGate && (
                  <span className="text-[9px] font-bold px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    HUMAN
                  </span>
                )}
              </div>
              <p
                className={`mt-1 text-[11px] font-medium leading-tight ${
                  status === 'locked' ? 'text-slate-500' : 'text-slate-200'
                }`}
              >
                {stage.name}
              </p>
            </li>
          );
        })}
      </ol>
      <p className="mt-1 text-[10px] text-slate-500">
        Stages marked HUMAN need your sign-off before the pipeline advances. Hover any stage for its quality gate.
      </p>
    </div>
  );
};

export default PipelineTracker;
