import React, { useEffect, useRef, useState } from 'react';
import {
  GatewayConfig,
  GatewayPresetId,
  GATEWAY_PRESETS,
  getPreset,
  testGatewayConnection,
} from '../../services/gatewayService';

interface GatewaySettingsPanelProps {
  config: GatewayConfig;
  onConfigChange: (config: GatewayConfig) => void;
  onClose: () => void;
}

/**
 * Gateway routing settings.
 *
 * Plain-text stages (chapter writing, streamed chapters, humanize) can
 * route through a self-hosted OpenAI-compatible gateway — FreeLLMAPI
 * (free-tier stacking) or Portkey Gateway — instead of Gemini direct.
 * Structured stages (outlines, market research, marketing) always use
 * Gemini's native JSON-schema path. Gateway failures fall back to
 * Gemini automatically.
 */
export const GatewaySettingsPanel: React.FC<GatewaySettingsPanelProps> = ({
  config,
  onConfigChange,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

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
      preset: id,
      baseUrl: id === 'gemini-direct' ? '' : next.defaultBaseUrl,
      apiKey: id === 'gemini-direct' ? '' : config.apiKey,
      model: config.model,
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

  const inputClasses =
    'w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none';

  return (
    <div
      ref={panelRef}
      className="absolute bottom-14 right-6 z-40 w-[26rem] max-w-[calc(100vw-3rem)] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60"
    >
      <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Gateway Routing</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Chapter writing can run through a gateway you host yourself. Structured stages
            (outline, market research, marketing) always use Gemini directly. If the gateway
            fails, generation falls back to Gemini automatically.
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
      </div>
    </div>
  );
};
