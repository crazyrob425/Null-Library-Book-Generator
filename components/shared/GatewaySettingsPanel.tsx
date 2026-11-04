import React, { useEffect, useRef, useState } from 'react';
import {
  GatewayConfig,
  GatewayPresetId,
  GATEWAY_PRESETS,
  getPreset,
  testGatewayConnection,
} from '../../services/gatewayService';
import {
  ManagerSnapshot,
  subscribeGatewayManager,
  startGatewayAutomation,
  stopGatewayAutomation,
} from '../../services/gatewayManager';

interface GatewaySettingsPanelProps {
  config: GatewayConfig;
  onConfigChange: (config: GatewayConfig) => void;
  onClose: () => void;
}

const STATUS_STYLE: Record<string, string> = {
  healthy: 'bg-emerald-500/15 text-emerald-300 border-emerald-700/50',
  adopted: 'bg-emerald-500/15 text-emerald-300 border-emerald-700/50',
  starting: 'bg-amber-500/15 text-amber-300 border-amber-700/50',
  restarting: 'bg-amber-500/15 text-amber-300 border-amber-700/50',
  degraded: 'bg-amber-500/15 text-amber-300 border-amber-700/50',
  down: 'bg-rose-500/15 text-rose-300 border-rose-700/50',
  unavailable: 'bg-slate-500/15 text-slate-400 border-slate-700/50',
  unknown: 'bg-slate-500/15 text-slate-400 border-slate-700/50',
};

/**
 * Gateway routing settings.
 *
 * AUTO mode (default): the built-in supervisor detects the machine,
 * starts FreeLLMAPI + Portkey the best way available, seeds FreeLLMAPI
 * with the keys the app already holds, keeps them healthy, and points
 * chapter generation at whichever gateway is primary. The user does
 * nothing.
 *
 * MANUAL mode: pick a gateway (or a custom OpenAI-compatible endpoint)
 * and configure it yourself. Either way, structured stages stay on
 * Gemini, and gateway failures fall back to Gemini automatically.
 */
export const GatewaySettingsPanel: React.FC<GatewaySettingsPanelProps> = ({
  config,
  onConfigChange,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [snapshot, setSnapshot] = useState<ManagerSnapshot | null>(null);

  useEffect(() => subscribeGatewayManager(setSnapshot), []);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        if (!(target as HTMLElement).closest?.('[data-gateway-pill]')) onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const preset = getPreset(config.preset);

  const handlePresetChange = (id: GatewayPresetId) => {
    const next = getPreset(id);
    setTestResult(null);
    onConfigChange({
      ...config,
      preset: id,
      baseUrl: id === 'gemini-direct' ? '' : next.defaultBaseUrl,
      apiKey: id === 'gemini-direct' ? '' : config.apiKey,
    });
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testGatewayConnection(config));
    } finally {
      setTesting(false);
    }
  };

  const setAuto = async (auto: boolean) => {
    onConfigChange({ ...config, auto });
    if (auto) {
      const geminiApiKey = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_GOOGLE_API_KEY;
      await startGatewayAutomation({ geminiApiKey });
    } else {
      await stopGatewayAutomation();
    }
  };

  const inputClasses =
    'w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none';

  const status = snapshot?.status;

  return (
    <div
      ref={panelRef}
      className="absolute bottom-14 right-6 z-40 max-h-[80vh] w-[26rem] max-w-[calc(100vw-3rem)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60"
    >
      <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Gateway Routing</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Chapter writing can run through gateways you host yourself. Structured stages
            (outline, market research, marketing) always use Gemini directly, and any gateway
            failure falls back to Gemini automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-3 rounded-md px-2 py-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          aria-label="Close gateway settings"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5">
          <div>
            <p className="text-xs font-semibold text-slate-200">Fully automatic (supervisor)</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
              Detects your machine, starts &amp; maintains the gateways, picks the model. Nothing for you to do.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.auto}
            onClick={() => void setAuto(!config.auto)}
            className={`relative ml-3 h-6 w-11 shrink-0 rounded-full transition ${config.auto ? 'bg-cyan-600' : 'bg-slate-700'}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${config.auto ? 'left-[1.375rem]' : 'left-0.5'}`}
            />
          </button>
        </div>

        {config.auto ? (
          <div className="space-y-3">
            {snapshot?.note && (
              <p className="rounded-md border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-[11px] leading-snug text-amber-200">
                {snapshot.note}
              </p>
            )}
            {status ? (
              <>
                <div className="space-y-2">
                  {(['freellmapi', 'portkey'] as const).map((id) => {
                    const gw = status.gateways[id];
                    const style = STATUS_STYLE[gw.status] || STATUS_STYLE.unknown;
                    return (
                      <div key={id} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-200">
                            {id === 'freellmapi' ? 'FreeLLMAPI' : 'Portkey Gateway'}
                            {status.primary === id && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">primary</span>}
                          </p>
                          <p className="truncate text-[11px] text-slate-500">
                            {gw.status === 'healthy' || gw.status === 'adopted'
                              ? `${gw.models.length} models · ${gw.baseUrl}`
                              : gw.lastError || gw.status}
                          </p>
                        </div>
                        <span className={`ml-3 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}>
                          {gw.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] leading-snug text-slate-500">
                  Generation is using:{' '}
                  <span className="text-slate-300">
                    {status.primary
                      ? `${status.primary === 'freellmapi' ? 'FreeLLMAPI' : 'Portkey'} · model ${config.model || '(auto)'}`
                      : 'Gemini direct (no gateway healthy right now)'}
                  </span>
                </p>
                {status.decisions.length > 0 && (
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Supervisor log</p>
                    <ul className="space-y-1">
                      {status.decisions.slice(-5).reverse().map((d, i) => (
                        <li key={i} className="text-[11px] leading-snug text-slate-400">
                          <span className="text-slate-600">{new Date(d.at).toLocaleTimeString()} </span>
                          {d.detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500">
                {snapshot?.running ? 'Supervisor is starting — first health check lands in a few seconds.' : 'Supervisor has not run yet in this session.'}
              </p>
            )}
          </div>
        ) : (
          <>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Gateway
              </span>
              <select
                value={config.preset}
                onChange={(e) => handlePresetChange(e.target.value as GatewayPresetId)}
                className={inputClasses}
              >
                {GATEWAY_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            {config.preset !== 'gemini-direct' && (
              <>
                <p className="text-xs leading-relaxed text-slate-500">
                  {preset.hint}
                  {preset.dashboardUrl && (
                    <>
                      {' '}
                      Dashboard: <span className="text-cyan-400">{preset.dashboardUrl}</span>
                    </>
                  )}
                </p>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
                    Base URL
                  </span>
                  <input
                    type="text"
                    value={config.baseUrl}
                    onChange={(e) => onConfigChange({ ...config, baseUrl: e.target.value })}
                    className={inputClasses}
                    spellCheck={false}
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
                    {preset.keyLabel}
                  </span>
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => onConfigChange({ ...config, apiKey: e.target.value })}
                    className={inputClasses}
                    placeholder="Stored only in this browser"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
                    Model id
                  </span>
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) => onConfigChange({ ...config, model: e.target.value })}
                    className={inputClasses}
                    placeholder="e.g. the id shown by Test Connection / the gateway dashboard"
                    spellCheck={false}
                  />
                </label>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing}
                    className="rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {testing ? 'Testing…' : 'Test Connection'}
                  </button>
                  {testResult && (
                    <p className={`text-xs leading-snug ${testResult.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {testResult.message}
                    </p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
