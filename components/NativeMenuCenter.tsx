import React, { useEffect, useState } from 'react';
import desktopBridge from '../services/desktopBridge';
import { DesktopPreferences, SecretDescriptor } from '../types';

export type NativeMenuPanel =
  | 'accounts'
  | 'preferences'
  | 'clipboard'
  | 'authorship'
  | null;

interface NativeMenuCenterProps {
  panel: NativeMenuPanel;
  onClose: () => void;
}

const defaultPreferences: DesktopPreferences = {
  general: {
    auto_save_frequency_seconds: 30,
    undo_step_history: 100,
    saved_books_dir: '',
    drafts_dir: '',
    favorite_printer: '',
  },
  safety: {
    censorship_enabled: true,
    ai_personality: 'balanced',
  },
  clipboard: {
    persistent_history_enabled: true,
    history_limit: 200,
  },
  authorship: {
    standard_book_size: '6x9',
    default_chapter_count: 10,
    default_image_style: 'cinematic',
    description_input_mode: 'few-sentences',
    auto_publish_marketplace: 'kdp',
  },
  cloud_sync: {
    enabled: false,
    google_account_email: '',
    backup_frequency_hours: 24,
  },
};

const NativeMenuCenter: React.FC<NativeMenuCenterProps> = ({ panel, onClose }) => {
  const [preferences, setPreferences] = useState<DesktopPreferences>(defaultPreferences);
  const [secrets, setSecrets] = useState<SecretDescriptor[]>([]);
  const [selectedSecretKey, setSelectedSecretKey] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [status, setStatus] = useState<string | null>(null);


  useEffect(() => {
    if (!panel) return;
    const loadData = async () => {
      try {
        const [loadedPreferences, descriptors] = await Promise.all([
          desktopBridge.loadDesktopPreferences(),
          desktopBridge.listSecureDescriptors(),
        ]);
        setPreferences(loadedPreferences);
        setSecrets(descriptors);
        if (!selectedSecretKey && descriptors.length > 0) {
          setSelectedSecretKey(descriptors[0].key);
        }
      } catch (error) {
        console.error(error);
        setStatus('Failed to load secure settings.');
      }
    };
    void loadData();
  }, [panel, selectedSecretKey]);

  if (!panel) return null;

  const savePreferences = async () => {
    try {
      await desktopBridge.saveDesktopPreferences(preferences);
      setStatus('Preferences saved.');
    } catch (error) {
      console.error(error);
      setStatus('Failed to save preferences.');
    }
  };

  const saveSecret = async () => {
    if (!selectedSecretKey || !secretValue.trim()) {
      setStatus('Pick a secret and enter a value.');
      return;
    }
    const descriptor =
      secrets.find((entry) => entry.key === selectedSecretKey) ||
      ({ key: selectedSecretKey, label: selectedSecretKey, category: 'custom' } as SecretDescriptor);
    try {
      await desktopBridge.setSecureSecret(descriptor, secretValue);
      setSecretValue('');
      setStatus('Secret saved to system keyring.');
    } catch (error) {
      console.error(error);
      setStatus('Failed to save secret.');
    }
  };

  const loadSecretValue = async () => {
    if (!selectedSecretKey) return;
    try {
      const value = await desktopBridge.getSecureSecret(selectedSecretKey);
      setSecretValue(value ?? '');
      setStatus(value ? 'Secret loaded.' : 'No stored value for this secret.');
    } catch (error) {
      console.error(error);
      setStatus('Failed to load secret.');
    }
  };

  const deleteSecretValue = async () => {
    if (!selectedSecretKey) return;
    try {
      await desktopBridge.deleteSecureSecret(selectedSecretKey);
      setSecretValue('');
      setStatus('Secret deleted.');
      setSecrets((current) => current.filter((entry) => entry.key !== selectedSecretKey));
      setSelectedSecretKey('');
    } catch (error) {
      console.error(error);
      setStatus('Failed to delete secret.');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-100">
            {panel === 'accounts' && 'Account Manager'}
            {panel === 'preferences' && 'Preferences'}
            {panel === 'clipboard' && 'Multi-Clipboard Settings'}
            {panel === 'authorship' && 'Authorship Defaults'}
          </h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-slate-300 hover:bg-slate-800">
            Close
          </button>
        </div>

        <div className="space-y-4 p-4 max-h-[75vh] overflow-y-auto">
          {panel === 'accounts' && (
            <section className="space-y-3">
              <p className="text-sm text-slate-300">
                Secrets are saved in the OS credential vault (Windows Credential Manager via keyring-rs).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Credential Slot</span>
                  <select
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-2 text-slate-100"
                    value={selectedSecretKey}
                    onChange={(e) => setSelectedSecretKey(e.target.value)}
                  >
                    <option value="">Select secure key</option>
                    {secrets.map((entry) => (
                      <option key={entry.key} value={entry.key}>
                        {entry.label} ({entry.category})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Value</span>
                  <input
                    type="password"
                    value={secretValue}
                    onChange={(e) => setSecretValue(e.target.value)}
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-2 text-slate-100"
                    placeholder="Secret value"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={loadSecretValue} className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white">
                  Load
                </button>
                <button onClick={saveSecret} className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white">
                  Save Securely
                </button>
                <button onClick={deleteSecretValue} className="rounded bg-rose-700 px-3 py-1.5 text-sm text-white">
                  Delete
                </button>
              </div>
            </section>
          )}

          {(panel === 'preferences' || panel === 'clipboard' || panel === 'authorship') && (
            <section className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Auto-save (seconds)</span>
                  <input
                    type="number"
                    value={preferences.general.auto_save_frequency_seconds}
                    onChange={(e) =>
                      setPreferences((state) => ({
                        ...state,
                        general: { ...state.general, auto_save_frequency_seconds: Number(e.target.value) || 30 },
                      }))
                    }
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-2 text-slate-100"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Undo History Steps</span>
                  <input
                    type="number"
                    value={preferences.general.undo_step_history}
                    onChange={(e) =>
                      setPreferences((state) => ({
                        ...state,
                        general: { ...state.general, undo_step_history: Number(e.target.value) || 100 },
                      }))
                    }
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-2 text-slate-100"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">AI Personality</span>
                  <input
                    type="text"
                    value={preferences.safety.ai_personality}
                    onChange={(e) =>
                      setPreferences((state) => ({
                        ...state,
                        safety: { ...state.safety, ai_personality: e.target.value },
                      }))
                    }
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-2 text-slate-100"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Default Book Size</span>
                  <input
                    type="text"
                    value={preferences.authorship.standard_book_size}
                    onChange={(e) =>
                      setPreferences((state) => ({
                        ...state,
                        authorship: { ...state.authorship, standard_book_size: e.target.value },
                      }))
                    }
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-2 text-slate-100"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Default Chapter Count</span>
                  <input
                    type="number"
                    value={preferences.authorship.default_chapter_count}
                    onChange={(e) =>
                      setPreferences((state) => ({
                        ...state,
                        authorship: { ...state.authorship, default_chapter_count: Number(e.target.value) || 10 },
                      }))
                    }
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-2 text-slate-100"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Cloud Backup Google Account</span>
                  <input
                    type="email"
                    value={preferences.cloud_sync.google_account_email}
                    onChange={(e) =>
                      setPreferences((state) => ({
                        ...state,
                        cloud_sync: { ...state.cloud_sync, google_account_email: e.target.value },
                      }))
                    }
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-2 text-slate-100"
                    placeholder="you@example.com"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={preferences.clipboard.persistent_history_enabled}
                    onChange={(e) =>
                      setPreferences((state) => ({
                        ...state,
                        clipboard: { ...state.clipboard, persistent_history_enabled: e.target.checked },
                      }))
                    }
                  />
                  Persistent Clipboard History
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={preferences.safety.censorship_enabled}
                    onChange={(e) =>
                      setPreferences((state) => ({
                        ...state,
                        safety: { ...state.safety, censorship_enabled: e.target.checked },
                      }))
                    }
                  />
                  Safety Censorship Toggle
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={preferences.cloud_sync.enabled}
                    onChange={(e) =>
                      setPreferences((state) => ({
                        ...state,
                        cloud_sync: { ...state.cloud_sync, enabled: e.target.checked },
                      }))
                    }
                  />
                  Enable Google Drive Backup
                </label>
              </div>

              <button onClick={savePreferences} className="rounded bg-indigo-700 px-3 py-1.5 text-sm text-white">
                Save Preferences
              </button>
            </section>
          )}

          {status && <p className="text-sm text-indigo-300">{status}</p>}
        </div>
      </div>
    </div>
  );
};

export default NativeMenuCenter;
