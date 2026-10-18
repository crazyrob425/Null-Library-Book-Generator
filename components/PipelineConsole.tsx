import React, { useState, useEffect, useRef } from 'react';
import {
  AuthorProfile,
  AiContentDisclosure,
  BookGenre,
  emptyAiContentDisclosure,
  PipelineStageDef,
  PipelineStageStatus,
} from '../types';
import { PipelineRunner, PipelineRunState } from '../services/pipelineRunner';
import { PIPELINE_STAGES } from '../services/pipelineStages';
import { GENRE_LANES } from '../services/marketIntel';
import Button from './shared/Button';
import LoadingSpinner from './shared/LoadingSpinner';
import { RocketLaunchIcon, TerminalIcon, ShieldCheckIcon, CheckCircleIcon, XIcon } from './icons';

interface PipelineConsoleProps {
  authorProfile: AuthorProfile | null;
  onClose: () => void;
  onPipelineComplete: (state: PipelineRunState) => void;
}

type Phase = 'setup' | 'running' | 'gate' | 'done' | 'aborted';

interface GateInfo {
  stage: PipelineStageDef;
  summary: string;
}

/**
 * Full-pipeline run console: configure, launch, watch the 12 stages,
 * approve human gates, and load the finished book into the workspace.
 */
const PipelineConsole: React.FC<PipelineConsoleProps> = ({ authorProfile, onClose, onPipelineComplete }) => {
  // -- setup form --
  const [topic, setTopic] = useState('');
  const [genreId, setGenreId] = useState(GENRE_LANES[0].id);
  const [customGenre, setCustomGenre] = useState('');
  const [bookGenre, setBookGenre] = useState<BookGenre>('fiction');
  const [numChapters, setNumChapters] = useState(12);
  const [pageRange, setPageRange] = useState('150-200');
  const [disclosure, setDisclosure] = useState<AiContentDisclosure>(emptyAiContentDisclosure());

  // -- run state --
  const [phase, setPhase] = useState<Phase>('setup');
  const [logs, setLogs] = useState<string[]>([]);
  const [stageStatuses, setStageStatuses] = useState<PipelineStageStatus[]>(PIPELINE_STAGES.map(() => 'locked'));
  const [gateInfo, setGateInfo] = useState<GateInfo | null>(null);
  const [finalState, setFinalState] = useState<PipelineRunState | null>(null);
  const [abortReason, setAbortReason] = useState('');
  const runnerRef = useRef<PipelineRunner | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  const addLog = (message: string) =>
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);

  const markStage = (index: number, status: PipelineStageStatus) =>
    setStageStatuses((prev) => prev.map((s, i) => (i === index ? status : s)));

  const startRun = () => {
    if (!topic.trim()) {
      alert('Enter a topic for the book first.');
      return;
    }
    if (!authorProfile) {
      alert('Set up your author profile first (top-right button) — packaging and EPUB need it.');
      return;
    }
    if (!disclosure.acknowledged) {
      alert('Confirm the AI-content disclosure answers below — the pipeline cannot publish without them.');
      return;
    }

    const genre = genreId === 'custom' ? customGenre.trim() : GENRE_LANES.find((l) => l.id === genreId)?.name ?? '';
    setLogs([]);
    setStageStatuses(PIPELINE_STAGES.map(() => 'locked'));
    setGateInfo(null);
    setFinalState(null);
    setPhase('running');

    const runner = new PipelineRunner(
      {
        topic: topic.trim(),
        genre,
        bookGenre,
        numChapters,
        pageRange,
        authorProfile,
        aiDisclosure: disclosure,
      },
      {
        onLog: addLog,
        onStageStart: (stage) => {
          const i = PIPELINE_STAGES.findIndex((s) => s.id === stage.id);
          markStage(i, 'current');
        },
        onStageComplete: (stage) => {
          const i = PIPELINE_STAGES.findIndex((s) => s.id === stage.id);
          markStage(i, 'complete');
        },
        onGate: (stage, summary) => {
          setGateInfo({ stage, summary });
          setPhase('gate');
        },
        onDone: (state) => {
          setFinalState(state);
          setPhase('done');
        },
        onAbort: (reason) => {
          setAbortReason(reason);
          setPhase('aborted');
        },
      },
    );
    runnerRef.current = runner;
    void runner.run().then(() => {
      // Gate approvals resume the same promise chain; clear the gate card.
      setGateInfo((g) => {
        if (g) setPhase('running');
        return null;
      });
    });
  };

  const approveGate = () => {
    if (!gateInfo) return;
    runnerRef.current?.approveGate(gateInfo.stage.id);
    const i = PIPELINE_STAGES.findIndex((s) => s.id === gateInfo.stage.id);
    markStage(i, 'complete');
    setGateInfo(null);
    setPhase('running');
  };

  const rejectGate = () => {
    if (!gateInfo) return;
    const reason = window.prompt('Reason for rejecting this gate (optional):') ?? 'Rejected by user';
    runnerRef.current?.rejectGate(gateInfo.stage.id, reason);
    setGateInfo(null);
  };

  const completedCount = stageStatuses.filter((s) => s === 'complete').length;
  const totalWords =
    finalState?.outline?.tableOfContents.reduce((a, c) => a + (c.content ? c.content.split(/\s+/).length : 0), 0) ?? 0;

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl h-[88vh] bg-slate-800 border border-violet-700 rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <header className="flex items-center justify-between p-4 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <RocketLaunchIcon className="w-8 h-8 text-violet-400" />
            <div>
              <h2 className="text-xl font-bold text-violet-300 font-serif">Book-Forge Pipeline Run</h2>
              <p className="text-xs text-slate-400">
                {phase === 'setup' && 'Configure the run — 12 stages, premise to publish-ready.'}
                {phase === 'running' && `Running… ${completedCount}/${PIPELINE_STAGES.length} stages complete`}
                {phase === 'gate' && 'Paused — a human gate needs your sign-off.'}
                {phase === 'done' && 'Complete — review the results and load them into your workspace.'}
                {phase === 'aborted' && 'Run aborted.'}
              </p>
            </div>
          </div>
          <Button onClick={onClose} variant="secondary">
            <XIcon className="w-5 h-5" />
          </Button>
        </header>

        <main className="flex-grow overflow-y-auto p-4 flex flex-col gap-4">
          {phase === 'setup' && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                <h3 className="text-sm font-bold text-slate-200 mb-3">Book brief</h3>
                <label className="block text-xs text-slate-400 mb-1">Topic</label>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. grumpy dragon blacksmith, cozy bakery mystery…"
                  className="w-full mb-3 px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <label className="block text-xs text-slate-400 mb-1">Genre lane (Oct 2026 research)</label>
                <select
                  value={genreId}
                  onChange={(e) => setGenreId(e.target.value)}
                  className="w-full mb-3 px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-sm"
                >
                  {GENRE_LANES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} — {l.tropes.slice(0, 2).join(' + ')} ({l.wordCount[0].toLocaleString()}–
                      {l.wordCount[1].toLocaleString()} wds, ${l.price.toFixed(2)} {l.distribution})
                    </option>
                  ))}
                  <option value="custom">Custom…</option>
                </select>
                {genreId === 'custom' && (
                  <input
                    value={customGenre}
                    onChange={(e) => setCustomGenre(e.target.value)}
                    placeholder="Describe the genre"
                    className="w-full mb-3 px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-sm"
                  />
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Fiction?</label>
                    <select
                      value={bookGenre}
                      onChange={(e) => setBookGenre(e.target.value as BookGenre)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-sm"
                    >
                      <option value="fiction">Fiction</option>
                      <option value="non-fiction">Non-fiction</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Chapters</label>
                    <input
                      type="number"
                      min={3}
                      max={40}
                      value={numChapters}
                      onChange={(e) => setNumChapters(Math.max(3, Math.min(40, Number(e.target.value) || 12)))}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Page range</label>
                    <input
                      value={pageRange}
                      onChange={(e) => setPageRange(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-4">
                <h3 className="text-sm font-bold text-amber-300 mb-1">KDP AI-content disclosure</h3>
                <p className="text-xs text-slate-300 mb-3">
                  Required before any publishing step. AI-<em>generated</em> content (even heavily edited)
                  must be disclosed to KDP; AI-<em>assisted</em> needs nothing.
                </p>
                <div className="space-y-2 text-sm text-slate-200">
                  {(
                    [
                      ['aiGeneratedText', 'AI generated any of the book’s text'],
                      ['aiGeneratedImages', 'AI generated the cover or interior images'],
                      ['aiGeneratedTranslations', 'AI generated a translation'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={disclosure[key]}
                        onChange={(e) =>
                          setDisclosure({ ...disclosure, [key]: e.target.checked, acknowledged: false })
                        }
                        className="w-4 h-4 accent-amber-500"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <label className="flex items-start gap-2 cursor-pointer mt-3 pt-3 border-t border-amber-500/30 text-sm text-slate-100">
                  <input
                    type="checkbox"
                    checked={disclosure.acknowledged}
                    onChange={(e) => setDisclosure({ ...disclosure, acknowledged: e.target.checked })}
                    className="w-4 h-4 mt-0.5 accent-emerald-500"
                  />
                  <span>These answers are accurate and may be submitted to KDP on my behalf.</span>
                </label>
              </div>
            </div>
          )}

          {(phase === 'running' || phase === 'gate') && (
            <>
              <ol className="flex gap-1.5 overflow-x-auto pb-1 flex-shrink-0">
                {PIPELINE_STAGES.map((s, i) => {
                  const st = stageStatuses[i];
                  return (
                    <li
                      key={s.id}
                      title={`${s.name}\nGate: ${s.qualityGate}`}
                      className={`flex-shrink-0 w-24 rounded-md border px-2 py-1.5 text-left ${
                        st === 'complete'
                          ? 'border-emerald-700/60 bg-emerald-950/40'
                          : st === 'current'
                          ? 'border-violet-500 bg-violet-950/40'
                          : 'border-slate-700/60 bg-slate-800/30 opacity-60'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-bold ${
                          st === 'complete' ? 'text-emerald-400' : st === 'current' ? 'text-violet-300' : 'text-slate-500'
                        }`}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <p className={`text-[11px] font-medium leading-tight ${st === 'locked' ? 'text-slate-500' : 'text-slate-200'}`}>
                        {s.name}
                      </p>
                    </li>
                  );
                })}
              </ol>

              {gateInfo && (
                <div className="flex-shrink-0 rounded-lg border border-amber-500/50 bg-amber-950/40 p-4">
                  <div className="flex items-center gap-2 text-amber-300 mb-2">
                    <ShieldCheckIcon className="w-6 h-6" />
                    <h3 className="font-bold">Human gate: {gateInfo.stage.name}</h3>
                  </div>
                  <pre className="text-xs text-slate-200 whitespace-pre-wrap max-h-40 overflow-y-auto mb-3 font-sans">
                    {gateInfo.summary}
                  </pre>
                  <div className="flex gap-2">
                    <Button onClick={approveGate}>Approve & continue</Button>
                    <Button onClick={rejectGate} variant="secondary">
                      Reject run
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex-grow min-h-[200px] bg-black rounded-md p-4 overflow-y-auto" ref={logRef}>
                <div className="flex items-center gap-2 text-slate-400 mb-2">
                  <TerminalIcon className="w-5 h-5" />
                  <h3 className="font-mono font-semibold text-sm">Pipeline log</h3>
                  {phase === 'running' && !gateInfo && <LoadingSpinner size="sm" />}
                </div>
                {logs.map((log, i) => (
                  <p key={i} className="font-mono text-xs text-slate-300 whitespace-pre-wrap break-words">
                    {log}
                  </p>
                ))}
              </div>
            </>
          )}

          {phase === 'done' && finalState && (
            <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 p-5">
              <div className="flex items-center gap-2 text-emerald-300 mb-3">
                <CheckCircleIcon className="w-8 h-8" />
                <h3 className="text-lg font-bold">Pipeline complete</h3>
              </div>
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                <div className="bg-slate-900/60 rounded p-2">
                  <dt className="text-xs text-slate-400">Title</dt>
                  <dd className="font-semibold text-slate-100 truncate">{finalState.outline?.title}</dd>
                </div>
                <div className="bg-slate-900/60 rounded p-2">
                  <dt className="text-xs text-slate-400">Chapters</dt>
                  <dd className="font-semibold text-slate-100">{finalState.outline?.tableOfContents.length}</dd>
                </div>
                <div className="bg-slate-900/60 rounded p-2">
                  <dt className="text-xs text-slate-400">Words</dt>
                  <dd className="font-semibold text-slate-100">{totalWords.toLocaleString()}</dd>
                </div>
                <div className="bg-slate-900/60 rounded p-2">
                  <dt className="text-xs text-slate-400">QA warnings</dt>
                  <dd className="font-semibold text-slate-100">
                    {finalState.qaReport.reduce((a, r) => a + r.warnings.length, 0)}
                  </dd>
                </div>
              </dl>
              {finalState.qaReport.some((r) => r.warnings.length > 0) && (
                <div className="mb-4 max-h-32 overflow-y-auto text-xs text-amber-200/90 bg-amber-950/30 border border-amber-500/30 rounded p-2">
                  {finalState.qaReport
                    .filter((r) => r.warnings.length > 0)
                    .map((r) => (
                      <p key={r.chapter}>
                        Ch {r.chapter}: {r.warnings.join('; ')}
                      </p>
                    ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    onPipelineComplete(finalState);
                  }}
                >
                  Load into workspace
                </Button>
                <Button onClick={onClose} variant="secondary">
                  Close
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Loading writes the market report, outline, cover, and marketing info into the app and jumps to the
                Review step — the KDP automation bot takes it from there.
              </p>
            </div>
          )}

          {phase === 'aborted' && (
            <div className="rounded-lg border border-red-700/60 bg-red-950/30 p-5 text-center">
              <h3 className="text-lg font-bold text-red-300 mb-2">Run aborted</h3>
              <p className="text-sm text-slate-300 mb-4">{abortReason}</p>
              <Button onClick={() => setPhase('setup')} variant="secondary">
                Back to setup
              </Button>
            </div>
          )}
        </main>

        {phase === 'setup' && (
          <footer className="p-4 border-t border-slate-700 flex-shrink-0 flex justify-end">
            <Button onClick={startRun} className="px-8 py-3">
              <RocketLaunchIcon className="w-5 h-5" />
              Start 12-stage run
            </Button>
          </footer>
        )}
      </div>
    </div>
  );
};

export default PipelineConsole;
