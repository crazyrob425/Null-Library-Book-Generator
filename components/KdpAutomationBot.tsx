import React, { useState, useEffect, useRef } from 'react';
import { KdpAutomationPayload, BotStatus, BotUpdate } from '../types';
import Button from './shared/Button';
import { RobotIcon, TerminalIcon, ShieldCheckIcon, CheckCircleIcon } from './icons';
import LoadingSpinner from './shared/LoadingSpinner';
import desktopBridge from '../services/desktopBridge';
import { buildDesktopAutomationPayload } from '../services/kdpAutomationPayload';

interface KdpAutomationBotProps extends KdpAutomationPayload {
  onClose: () => void;
}

  // NOTE: Switched to Electron IPC
  
  const KdpAutomationBot: React.FC<KdpAutomationBotProps> = (props) => {
      const [logs, setLogs] = useState<string[]>([]);
      const [status, setStatus] = useState<BotStatus>('initializing');
      const [progress, setProgress] = useState(0);
      const [captchaInput, setCaptchaInput] = useState('');
      const [captchaImageUrl, setCaptchaImageUrl] = useState<string | null>(null);
      const logContainerRef = useRef<HTMLDivElement>(null);
  
      const addLog = (message: string) => {
          setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
      };
  
      useEffect(() => {
          if (logContainerRef.current) {
              logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
          }
      }, [logs]);
  
      useEffect(() => {
          // Mount-only. `props` is a new object on every render (it includes
          // onClose). Depending on it re-ran this effect after the first log,
          // and the cleanup called stopAutomation(), which aborted the publish
          // and started another one. The screen is mounted for a single run.
          let cancelled = false;
          addLog(`Initializing Electron IPC for KDP Automation...`);

          const startBot = async () => {
              try {
                  // Blobs cannot cross IPC. Send a data URL, and only the
                  // fields the worker reads — props.onClose is a function and
                  // Electron's structured clone rejects it.
                  const epubBase64 = await blobToBase64(props.epubBlob);
                  if (cancelled) return;
                  const payload = buildDesktopAutomationPayload(props, epubBase64);
                  await desktopBridge.startAutomation(payload as unknown as KdpAutomationPayload);
                  if (cancelled) {
                      await desktopBridge.stopAutomation();
                  }
              } catch (e) {
                  if (cancelled) return;
                  addLog(`Error preparing payload: ${(e as Error).message}`);
                  setStatus('error');
              }
          };

          void startBot();

          // Listen for updates
          const removeListener = desktopBridge.onAutomationUpdate((update) => {
               switch (update.type) {
                  case 'log':
                      addLog(update.message);
                      break;
                  case 'status':
                      setStatus(update.status);
                      break;
                  case 'progress':
                      setProgress(update.progress);
                      break;
                  case 'captcha':
                      setStatus('captcha');
                      setCaptchaImageUrl(update.imageUrl || null);
                      addLog('[BACKEND] Paused. Awaiting manual CAPTCHA input.');
                      break;
                  case 'success':
                      setStatus('success');
                      addLog('[BACKEND] SUCCESS! Book has been submitted to Amazon KDP.');
                      break;
                  case 'error':
                      setStatus('error');
                      addLog(`[BACKEND] CRITICAL ERROR: ${update.message}`);
                      break;
              }
          });
  
          return () => {
              cancelled = true;
              removeListener();
              void desktopBridge.stopAutomation();
          };
      }, []);
      
      const blobToBase64 = (blob: Blob): Promise<string> => {
          return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
          });
      }


    const handleCaptchaSubmit = async () => {
      if (!captchaInput) return;
      addLog(`[USER] Submitted CAPTCHA solution: "${captchaInput}"`);
      void desktopBridge.submitCaptcha(captchaInput);
      setCaptchaImageUrl(null);
      setCaptchaInput('');
  };

    return (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-4xl h-[80vh] bg-slate-800 border border-violet-700 rounded-lg shadow-2xl flex flex-col">
                <header className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <RobotIcon className="w-8 h-8 text-violet-400 animate-pulse" />
                        <div>
                            <h2 className="text-xl font-bold text-violet-400 font-serif">KDP Automation Bot</h2>
                            <p className="text-sm text-slate-400">Status: <span className="font-semibold text-emerald-400">{status.toUpperCase()}</span></p>
                        </div>
                    </div>
                    <Button onClick={props.onClose} variant="secondary">Close</Button>
                </header>
                
                <main className="flex-grow p-4 overflow-hidden flex flex-col gap-4">
                    <div className="flex-grow bg-black rounded-md p-4 overflow-y-auto" ref={logContainerRef}>
                        <div className="flex items-center gap-2 text-slate-400 mb-2">
                            <TerminalIcon className="w-5 h-5" />
                            <h3 className="font-mono font-semibold">Backend Service - Live Log</h3>
                        </div>
                        {logs.map((log, index) => (
                            <p key={index} className="font-mono text-sm text-slate-300 whitespace-pre-wrap break-words">
                                {log}
                            </p>
                        ))}
                         {status === 'initializing' && <div className="flex items-center gap-2 text-yellow-300"><LoadingSpinner size="sm"/> <span>Connecting...</span></div>}
                    </div>

                    {status === 'captcha' && (
                        <div className="flex-shrink-0 bg-slate-700 border border-yellow-500 rounded-lg p-4 flex flex-col items-center gap-4">
                            <div className="flex items-center gap-2 text-yellow-300">
                                <ShieldCheckIcon className="w-6 h-6" />
                                <h3 className="text-lg font-bold">Manual Intervention Required</h3>
                            </div>
                            <p className="text-slate-300 text-sm">The bot has been paused by a KDP security check. Please solve the CAPTCHA.</p>
                             <div className="w-48 h-16 bg-slate-500/50 flex items-center justify-center rounded-md text-slate-400 italic text-sm">
                                {captchaImageUrl ? <img src={captchaImageUrl} alt="CAPTCHA Challenge"/> : <span>[Loading CAPTCHA Image...]</span>}
                             </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={captchaInput}
                                    onChange={(e) => setCaptchaInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCaptchaSubmit()}
                                    placeholder="Enter CAPTCHA text"
                                    className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                                />
                                <Button onClick={handleCaptchaSubmit}>Continue</Button>
                            </div>
                        </div>
                    )}
                    {status === 'uploading' && (
                        <div className="flex-shrink-0">
                            <p className="text-sm text-center text-slate-300 mb-1">Upload Progress: {progress}%</p>
                            <div className="w-full bg-slate-700 rounded-full h-2.5">
                                <div className="bg-violet-600 h-2.5 rounded-full transition-all duration-150" style={{ width: `${progress}%` }}></div>
                            </div>
                        </div>
                    )}
                     {status === 'success' && (
                        <div className="flex-shrink-0 bg-emerald-900/50 border border-emerald-700 rounded-lg p-4 text-center">
                            <CheckCircleIcon className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                            <h3 className="text-xl font-bold text-emerald-300">Automation Complete!</h3>
                            <p className="text-slate-300">Your book has been successfully submitted to KDP for review.</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default KdpAutomationBot;
