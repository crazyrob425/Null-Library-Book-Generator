import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  BotUpdate,
  DesktopPreferences,
  GoogleTrendsData,
  KdpAutomationPayload,
  NativeMenuAction,
  SecretDescriptor,
} from '../types';

type SaveResult = { success: boolean; filePath?: string; error?: string };
type LoadResult = { success: boolean; data?: string; error?: string };

export interface DesktopBridge {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;

  startAutomation: (payload: KdpAutomationPayload) => Promise<void>;
  submitCaptcha: (solution: string) => Promise<void>;
  stopAutomation: () => Promise<void>;
  onAutomationUpdate: (callback: (update: BotUpdate) => void) => () => void;

  saveFile: (data: string, filename: string) => Promise<SaveResult>;
  loadFile: () => Promise<LoadResult>;

  fetchGoogleTrends: (keyword: string) => Promise<GoogleTrendsData | null>;
  fetchAmazonCompetitors: (keyword: string) => Promise<any[]>;
  fetchAmazonSuggestions: (keyword: string) => Promise<string[]>;

  onNativeMenuAction: (callback: (action: NativeMenuAction) => void) => () => void;
  loadDesktopPreferences: () => Promise<DesktopPreferences>;
  saveDesktopPreferences: (preferences: DesktopPreferences) => Promise<void>;
  listSecureDescriptors: () => Promise<SecretDescriptor[]>;
  setSecureSecret: (descriptor: SecretDescriptor, value: string) => Promise<void>;
  getSecureSecret: (secretKey: string) => Promise<string | null>;
  deleteSecureSecret: (secretKey: string) => Promise<void>;

  /** Gateway supervisor lifecycle (gateways/supervisor.mjs). Status
   *  returns the supervisor's status.json contents as a string. */
  gatewaySupervisorStart: (seedKeys: { geminiApiKey?: string }) => Promise<void>;
  gatewaySupervisorStop: () => Promise<void>;
  gatewaySupervisorStatus: () => Promise<string>;
}

const isElectron = () => typeof window !== 'undefined' && !!window.electronAPI;
const isTauri = () => typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

const browserBridge: DesktopBridge = {
  minimize: async () => {},
  maximize: async () => {},
  close: async () => {},

  startAutomation: async () => {
    throw new Error('Automation is only available in desktop runtime.');
  },
  submitCaptcha: async () => {
    throw new Error('Automation is only available in desktop runtime.');
  },
  stopAutomation: async () => {},
  onAutomationUpdate: () => () => {},

  saveFile: async () => ({ success: false, error: 'Desktop file system integration unavailable.' }),
  loadFile: async () => ({ success: false, error: 'Desktop file system integration unavailable.' }),

  fetchGoogleTrends: async () => null,
  fetchAmazonCompetitors: async () => [],
  fetchAmazonSuggestions: async () => [],
  onNativeMenuAction: () => () => {},
  loadDesktopPreferences: async () => ({
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
  }),
  saveDesktopPreferences: async () => {},
  listSecureDescriptors: async () => [],
  setSecureSecret: async () => {},
  getSecureSecret: async () => null,
  deleteSecureSecret: async () => {},
  gatewaySupervisorStart: async () => {
    throw new Error('Gateway auto-setup is only available in the desktop runtime.');
  },
  gatewaySupervisorStop: async () => {},
  gatewaySupervisorStatus: async () => '{}',
};

const electronBridge: DesktopBridge = {
  minimize: async () => window.electronAPI?.minimize?.(),
  maximize: async () => window.electronAPI?.maximize?.(),
  close: async () => window.electronAPI?.close?.(),

  startAutomation: async (payload) => window.electronAPI?.startAutomation?.(payload),
  submitCaptcha: async (solution) => window.electronAPI?.submitCaptcha?.(solution),
  stopAutomation: async () => window.electronAPI?.stopAutomation?.(),
  onAutomationUpdate: (callback) => window.electronAPI?.onAutomationUpdate?.(callback) || (() => {}),

  saveFile: async (data, filename) => window.electronAPI?.saveFile?.(data, filename) || { success: false },
  loadFile: async () => window.electronAPI?.loadFile?.() || { success: false },

  fetchGoogleTrends: async (keyword) => window.electronAPI?.fetchGoogleTrends?.(keyword) || null,
  fetchAmazonCompetitors: async (keyword) => window.electronAPI?.fetchAmazonCompetitors?.(keyword) || [],
  fetchAmazonSuggestions: async (keyword) => window.electronAPI?.fetchAmazonSuggestions?.(keyword) || [],
  onNativeMenuAction: () => () => {},
  loadDesktopPreferences: async () => browserBridge.loadDesktopPreferences(),
  saveDesktopPreferences: async () => {},
  listSecureDescriptors: async () => [],
  setSecureSecret: async () => {},
  getSecureSecret: async () => null,
  deleteSecureSecret: async () => {},
  gatewaySupervisorStart: async () => {
    throw new Error('Gateway auto-setup is only available in the Tauri desktop runtime.');
  },
  gatewaySupervisorStop: async () => {},
  gatewaySupervisorStatus: async () => '{}',
};

const tauriBridge: DesktopBridge = {
  minimize: async () => {
    await invoke('window_control', { action: 'minimize' });
  },
  maximize: async () => {
    await invoke('window_control', { action: 'maximize' });
  },
  close: async () => {
    await invoke('window_control', { action: 'close' });
  },

  startAutomation: async (payload) => {
    await invoke('start_automation', { payload });
  },
  submitCaptcha: async (solution) => {
    await invoke('captcha_solution', { solution });
  },
  stopAutomation: async () => {
    await invoke('stop_automation');
  },
  onAutomationUpdate: (callback) => {
    const unlistenPromise = listen<BotUpdate>('automation-update', (event) => callback(event.payload));
    return () => {
      void unlistenPromise
        .then((unlisten) => unlisten())
        .catch((error) => console.warn('Failed to unlisten automation updates:', error));
    };
  },

  saveFile: async (data, filename) => {
    const filePath = await save({
      title: 'Save Project',
      defaultPath: filename,
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });
    if (!filePath) return { success: false };
    await invoke('write_file', { path: filePath, data });
    return { success: true, filePath };
  },
  loadFile: async () => {
    const filePath = await open({
      title: 'Load Project',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      multiple: false,
      directory: false,
    });
    if (!filePath || Array.isArray(filePath)) return { success: false };
    const data = await invoke<string>('read_file', { path: filePath });
    return { success: true, data };
  },

  fetchGoogleTrends: async (keyword) => {
    try {
      return await invoke<GoogleTrendsData | null>('fetch_google_trends', { keyword });
    } catch {
      return null;
    }
  },
  fetchAmazonCompetitors: async (keyword) => {
    try {
      return await invoke<any[]>('fetch_amazon_competitors', { keyword });
    } catch {
      return [];
    }
  },
  fetchAmazonSuggestions: async (keyword) => {
    try {
      return await invoke<string[]>('fetch_amazon_suggestions', { keyword });
    } catch {
      return [];
    }
  },
  onNativeMenuAction: (callback) => {
    const unlistenPromise = listen<NativeMenuAction>('native-menu-action', (event) => callback(event.payload));
    return () => {
      void unlistenPromise
        .then((unlisten) => unlisten())
        .catch((error) => console.warn('Failed to unlisten native menu events:', error));
    };
  },
  loadDesktopPreferences: async () => invoke<DesktopPreferences>('load_desktop_preferences'),
  saveDesktopPreferences: async (preferences) => {
    await invoke('save_desktop_preferences', { preferences });
  },
  listSecureDescriptors: async () => invoke<SecretDescriptor[]>('list_secure_descriptors'),
  setSecureSecret: async (descriptor, value) => {
    await invoke('set_secure_secret', { descriptor, value });
  },
  getSecureSecret: async (secretKey) => invoke<string | null>('get_secure_secret', { secretKey }),
  deleteSecureSecret: async (secretKey) => {
    await invoke('delete_secure_secret', { secretKey });
  },
  gatewaySupervisorStart: async (seedKeys) => {
    await invoke('gateway_supervisor', { action: 'start', seedKeysJson: JSON.stringify(seedKeys || {}) });
  },
  gatewaySupervisorStop: async () => {
    await invoke('gateway_supervisor', { action: 'stop', seedKeysJson: null });
  },
  gatewaySupervisorStatus: async () => invoke<string>('gateway_supervisor', { action: 'status', seedKeysJson: null }),
};

const desktopBridge: DesktopBridge = isElectron() ? electronBridge : isTauri() ? tauriBridge : browserBridge;

export default desktopBridge;
