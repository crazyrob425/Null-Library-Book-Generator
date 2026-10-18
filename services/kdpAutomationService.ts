/**
 * KDP Automation Service
 *
 * Provides a client-side interface for communicating with the optional
 * Node.js/Playwright backend server (server/automation-worker.ts) via WebSocket.
 *
 * Falls back gracefully when running as a plain web app (no Electron/server).
 */

import { KdpAutomationPayload, BotUpdate } from '../types';

const DEFAULT_WS_URL = import.meta.env.VITE_AUTOMATION_SERVER_URL ?? 'ws://localhost:8080';

export type AutomationCallback = (update: BotUpdate) => void;

export class KdpAutomationClient {
    private ws: WebSocket | null = null;
    private onUpdate: AutomationCallback;
    private wsUrl: string;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 3;

    constructor(onUpdate: AutomationCallback, wsUrl: string = DEFAULT_WS_URL) {
        this.onUpdate = onUpdate;
        this.wsUrl = wsUrl;
    }

    /** Open a WebSocket connection to the automation server. */
    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.wsUrl);
                let settled = false;

                this.ws.onopen = () => {
                    settled = true;
                    this.reconnectAttempts = 0;
                    this.onUpdate({ type: 'log', message: '✅ Connected to automation server.' });
                    resolve();
                };

                this.ws.onerror = () => {
                    if (!settled) {
                        settled = true;
                        const msg = 'WebSocket connection failed. Ensure the backend server is running.';
                        this.onUpdate({ type: 'error', message: msg });
                        reject(new Error(msg));
                    }
                };

                this.ws.onclose = (evt) => {
                    if (!settled) {
                        settled = true;
                        const msg = `WebSocket closed before connection was established (code ${evt.code}).`;
                        this.onUpdate({ type: 'error', message: msg });
                        reject(new Error(msg));
                    } else {
                        this.onUpdate({ type: 'log', message: 'Automation server connection closed.' });
                    }
                };

                this.ws.onmessage = (event) => {
                    try {
                        const update: BotUpdate = JSON.parse(event.data as string);
                        this.onUpdate(update);
                    } catch {
                        this.onUpdate({ type: 'log', message: String(event.data) });
                    }
                };
            } catch (err) {
                reject(err);
            }
        });
    }

    /** Send the full automation payload to the backend. */
    async startAutomation(payload: KdpAutomationPayload): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('Not connected to automation server. Call connect() first.');
        }

        // Serialise the EPUB blob to base64 so it can be sent over JSON/WebSocket
        const epubBase64 = await blobToBase64(payload.epubBlob);

        const message = JSON.stringify({
            type: 'start',
            payload: {
                title: payload.outline.title,
                subtitle: payload.outline.subtitle,
                authorName: payload.authorProfile?.name ?? '',
                authorBio: payload.authorProfile?.bio ?? '',
                shortDescription: payload.kdpMarketingInfo?.shortDescription ?? '',
                longDescription: payload.kdpMarketingInfo?.longDescription ?? '',
                categories: payload.kdpMarketingInfo?.categories ?? [],
                keywords: payload.kdpMarketingInfo?.keywords ?? [],
                coverImageUrl: payload.coverImageUrl,
                epubBase64,
                // KDP AI-content disclosure answers (Oct 2026 compliance)
                aiDisclosure: payload.aiDisclosure ?? null,
            },
        });

        this.ws.send(message);
        this.onUpdate({ type: 'status', status: 'running' });
        this.onUpdate({ type: 'log', message: '📤 Automation payload sent to server.' });
    }

    /** Submit a CAPTCHA solution to the server. */
    submitCaptcha(solution: string): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({ type: 'captcha', solution }));
    }

    /** Request the server to abort the current automation run. */
    stopAutomation(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({ type: 'stop' }));
        this.onUpdate({ type: 'log', message: '🛑 Stop signal sent to server.' });
    }

    /** Close the WebSocket connection. */
    disconnect(): void {
        this.ws?.close();
        this.ws = null;
    }

    /** Whether the WebSocket is currently open. */
    get isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            // Strip the data URL prefix — backend wants raw base64
            resolve(result.split(',')[1] ?? result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Convenience factory that tries Electron IPC first, then WebSocket,
 * then warns the user that no automation backend is available.
 */
export const createAutomationSession = (
    onUpdate: AutomationCallback,
): {
    connect: () => Promise<void>;
    start: (payload: KdpAutomationPayload) => Promise<void>;
    submitCaptcha: (s: string) => void;
    stop: () => void;
} => {
    // Electron path
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const api = (window as any).electronAPI;
        return {
            connect: async () => {
                onUpdate({ type: 'log', message: '✅ Using Electron automation bridge.' });
            },
            start: async (payload) => {
                await api.startAutomation(payload);
                const off = api.onAutomationUpdate(onUpdate);
                // Store cleanup in closure so it can be called on stop
                (window as any).__kdpCleanupListener = off;
            },
            submitCaptcha: (s) => api.submitCaptcha(s),
            stop: () => {
                api.stopAutomation();
                (window as any).__kdpCleanupListener?.();
            },
        };
    }

    // WebSocket path
    const client = new KdpAutomationClient(onUpdate);
    return {
        connect: () => client.connect(),
        start: (payload) => client.startAutomation(payload),
        submitCaptcha: (s) => client.submitCaptcha(s),
        stop: () => client.stopAutomation(),
    };
};
