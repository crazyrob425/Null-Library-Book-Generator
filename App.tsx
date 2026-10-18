
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AppStep, BookOutline, Chapter, MarketReport, AuthorProfile, GenreSuggestion, TopicSuggestion, KdpMarketingInfo, AppMode, BatchProject, KdpAutomationPayload, BookGenre, BookBible, NonFictionResearchContext } from './types';
import * as geminiService from './services/geminiService';
import * as realMarketService from './services/realMarketService';
import * as storageService from './services/storageService';
import { loadProviderConfig, AIProviderConfig } from './services/aiProvider';
import { getTotalEstimatedTokens } from './services/tokenOptimizer';
import { extractBibleEntries, embedChapter, clearVectorStore } from './services/ragService';
import ProviderSettingsPanel from './components/shared/ProviderSettingsPanel';

import StepIndicator from './components/shared/StepIndicator';
import PipelineTracker from './components/PipelineTracker';
import PipelineConsole from './components/PipelineConsole';
import { PipelineRunState } from './services/pipelineRunner';
import MarketResearchStep from './components/steps/MarketResearchStep';
import MarketReportDisplay from './components/steps/market/MarketReportDisplay';
import OutlineStep from './components/steps/OutlineStep';
import ContentGenerationStep from './components/steps/ContentGenerationStep';
import IllustrationStep from './components/steps/IllustrationStep';
import ReviewStep from './components/steps/ReviewStep';
import LoadingSpinner from './components/shared/LoadingSpinner';
import { SparklesIcon, UserCircleIcon, TrashIcon, RocketLaunchIcon, CheckBadgeIcon } from './components/icons';
import AuthorProfileModal from './components/AuthorProfileModal';
import BatchMode from './components/BatchMode';
import KdpAutomationBot from './components/KdpAutomationBot';
import TitleBar from './components/TitleBar';
import NativeMenuCenter, { NativeMenuPanel } from './components/NativeMenuCenter';
import desktopBridge from './services/desktopBridge';


import { useAutoSave } from './hooks/useAutoSave';
import AutoSaveIndicator from './components/shared/AutoSaveIndicator';

const pageRangeToChapterCount = (pageRange: string): number => {
    const firstNum = parseInt(pageRange.split('-')[0], 10);
    if (firstNum <= 50) return 5;
    if (firstNum <= 120) return 7;
    if (firstNum <= 175) return 10;
    if (firstNum <= 300) return 12;
    if (firstNum <= 500) return 15;
    if (firstNum <= 1000) return 20;
    return 25;
};

// Versioned storage key
const STORAGE_KEY = 'kdp-ai-booksmith-v5-db';

function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.Single);
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.MarketResearch);
  const [isLoading, setIsLoading] = useState(true); // Start true to allow DB load
  const [error, setError] = useState<string | null>(null);
  
  // SINGLE BOOK MODE STATE
  const [genreSuggestions, setGenreSuggestions] = useState<GenreSuggestion[] | null>(null);
  const [topicSuggestions, setTopicSuggestions] = useState<TopicSuggestion[] | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<GenreSuggestion | null>(null);
  const [marketReport, setMarketReport] = useState<MarketReport | null>(null);
  const [hasViewedReport, setHasViewedReport] = useState(false);
  const [bookOutline, setBookOutline] = useState<BookOutline | null>(null);
  const [pagesPerChapter, setPagesPerChapter] = useState<string>('3-5 pages (medium)');
  const [bookCoverUrl, setBookCoverUrl] = useState<string | null>(null);
  const [chapterLoadingStates, setChapterLoadingStates] = useState<{[key: number]: boolean}>({});
  const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false);
  const [isHumanizing, setIsHumanizing] = useState(false);
  const [isGeneratingKdpMarketing, setIsGeneratingKdpMarketing] = useState(false);
  const [kdpMarketingInfo, setKdpMarketingInfo] = useState<KdpMarketingInfo | null>(null);
  const [authorProfile, setAuthorProfile] = useState<AuthorProfile | null>(null);
  const [isAuthorModalOpen, setIsAuthorModalOpen] = useState(false);
  const [exampleCoverUrl, setExampleCoverUrl] = useState<string | null>(null);
  const [isGeneratingExampleCover, setIsGeneratingExampleCover] = useState(false);
  const [automationPayload, setAutomationPayload] = useState<KdpAutomationPayload | null>(null);
  const [isPipelineOpen, setIsPipelineOpen] = useState(false);
  const [isGeneratingFullManuscript, setIsGeneratingFullManuscript] = useState(false);
  const [fullManuscriptGenerationProgress, setFullManuscriptGenerationProgress] = useState('');
  const [isRegeneratingWithFeedback, setIsRegeneratingWithFeedback] = useState(false);

  // System Resources
  const [isPersistentStorage, setIsPersistentStorage] = useState(false);
  const [storageQuota, setStorageQuota] = useState<{usage: number, quota: number} | null>(null);
  const [isHighPerformanceMode, setIsHighPerformanceMode] = useState(true);

  // BATCH MODE STATE
  const [batchProjects, setBatchProjects] = useState<BatchProject[]>([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  // NEW: Fiction/Non-Fiction, Book Bible, Research Context
  const [bookGenre, setBookGenre] = useState<BookGenre>('non-fiction');
  const [bookBible, setBookBible] = useState<BookBible | null>(null);
  const [researchContext, setResearchContext] = useState<NonFictionResearchContext | null>(null);

  // NEW: Live token counter
  const [totalTokens, setTotalTokens] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTotalTokens(getTotalEstimatedTokens()), 5000);
    return () => clearInterval(interval);
  }, []);

  // NEW: AI Provider config
  const [providerConfig, setProviderConfig] = useState<AIProviderConfig>(() => loadProviderConfig());
  const [isProviderPanelOpen, setIsProviderPanelOpen] = useState(false);
  const [nativeMenuPanel, setNativeMenuPanel] = useState<NativeMenuPanel>(null);

  // --- AUTO SAVE ---
  const { lastSaved, isSaving: isAutoSaving } = useAutoSave({
      mode,
      currentStep,
      marketReport,
      bookOutline,
      authorProfile,
      pagesPerChapter,
      bookCoverUrl,
      kdpMarketingInfo,
      selectedGenre,
      hasViewedReport
  });

  const handleGenerateExampleCover = useCallback(async () => {
    setIsGeneratingExampleCover(true);
    setError(null);
    try {
      const url = await geminiService.generateExampleBookCover();
      setExampleCoverUrl(url);
    } catch (e) {
      console.error("Failed to generate example cover", e);
      const message = e instanceof Error ? e.message : 'An unknown error occurred.';
      setError('Failed to generate an example cover. ' + message);
    } finally {
      setIsGeneratingExampleCover(false);
    }
  }, []);
  
  // 1. Initial Load from IndexedDB
  useEffect(() => {
    const loadData = async () => {
        try {
            // PERSIST-01: Use versioned loader with automatic migration
            const savedState = await storageService.loadStateVersioned(STORAGE_KEY);
            if (savedState) {
                 // Support both v1 flat schema and v2 envelope schema
                 const state = savedState.version === 2
                   ? {
                       currentStep: savedState.uiState?.currentStep ?? savedState.currentStep,
                       marketReport: savedState.marketReport,
                       hasViewedReport: savedState.hasViewedReport ?? false,
                       bookOutline: savedState.bookOutline,
                       pagesPerChapter: savedState.uiState?.pagesPerChapter ?? savedState.pagesPerChapter,
                       bookCoverUrl: savedState.covers?.current ?? savedState.bookCoverUrl,
                       genreSuggestions: savedState.genreSuggestions ?? null,
                       topicSuggestions: savedState.topicSuggestions ?? null,
                       selectedGenre: savedState.uiState?.selectedGenre ?? savedState.selectedGenre,
                       authorProfile: savedState.authorProfile,
                       kdpMarketingInfo: savedState.marketingInfo ?? savedState.kdpMarketingInfo,
                       bookGenre: savedState.bookGenre,
                       bookBible: savedState.bookBible,
                     }
                   : savedState; // v1 flat schema

                 // Corruption guard
                 let safeStep = state.currentStep ?? AppStep.MarketResearch;
                 if (safeStep > AppStep.MarketResearch && (!state.bookOutline || !Array.isArray(state.bookOutline.tableOfContents))) {
                    console.warn("Corrupted state detected: Missing outline. Resetting to Market Research.");
                    safeStep = AppStep.MarketResearch;
                    state.bookOutline = null;
                }

                setCurrentStep(safeStep);
                setMarketReport(state.marketReport ?? null);
                setHasViewedReport(state.hasViewedReport ?? false);
                setBookOutline(state.bookOutline ?? null);
                setPagesPerChapter(state.pagesPerChapter ?? '3-5 pages (medium)');
                setBookCoverUrl(state.bookCoverUrl ?? null);
                setGenreSuggestions(state.genreSuggestions ?? null);
                setTopicSuggestions(state.topicSuggestions ?? null);
                setSelectedGenre(state.selectedGenre ?? null);
                setAuthorProfile(state.authorProfile ?? null);
                setKdpMarketingInfo(state.kdpMarketingInfo ?? null);
                setBookGenre(state.bookGenre ?? 'non-fiction');
                setBookBible(state.bookBible ?? null);
            }
        } catch (e) {
            console.error("Failed to load state from DB", e);
            // Fallback: Check localStorage for migration
            const legacyState = localStorage.getItem('kdp-ai-booksmith-v4');
            if (legacyState) {
                console.log("Migrating from legacy localStorage...");
                try {
                    const parsed = JSON.parse(legacyState);
                    setAuthorProfile(parsed.authorProfile);
                    // We don't load everything to avoid bugs, just profile is useful
                } catch(err) {}
            }
        } finally {
            setIsLoading(false);
        }
        
        // Check storage status
        const isPersisted = await navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
        setIsPersistentStorage(isPersisted);
        const quota = await storageService.checkStorageQuota();
        setStorageQuota(quota);
    };
    
    loadData();
  }, []);

  // 2. Debounced Save to IndexedDB
  // Use a ref to store the timeout ID to debounce saves
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) return; // Don't save empty state during load

    if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
        const stateToSave = {
          currentStep,
          marketReport,
          hasViewedReport,
          bookOutline,
          pagesPerChapter,
          bookCoverUrl,
          genreSuggestions,
          topicSuggestions,
          selectedGenre,
          authorProfile,
          kdpMarketingInfo,
          bookGenre,
          bookBible,
        };
        storageService.saveState(STORAGE_KEY, stateToSave).catch(e => console.error("Save failed", e));
        
        // Update quota info occasionally
        storageService.checkStorageQuota().then(setStorageQuota);

    }, 1000); // 1 second debounce
    
    return () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    }
  }, [mode, currentStep, marketReport, hasViewedReport, bookOutline, pagesPerChapter, bookCoverUrl, genreSuggestions, topicSuggestions, selectedGenre, authorProfile, kdpMarketingInfo, bookGenre, bookBible, isLoading]);

  const handleRequestPersistence = async () => {
      const granted = await storageService.requestPersistentStorage();
      if (granted) {
          setIsPersistentStorage(true);
          alert("High-Capacity Storage Mode Enabled! Your browser will now allow gigabytes of data storage.");
      } else {
          alert("Browser denied persistent storage. You may need to manually clear space or change browser settings.");
      }
  };

  const handleSaveAuthorProfile = (profile: AuthorProfile) => {
    setAuthorProfile(profile);
    setIsAuthorModalOpen(false);
  };

  const resetProjectState = useCallback(() => {
    setMarketReport(null);
    setHasViewedReport(false);
    setBookOutline(null);
    setBookCoverUrl(null);
    setKdpMarketingInfo(null);
    setGenreSuggestions(null);
    setTopicSuggestions(null);
    setSelectedGenre(null);
    setCurrentStep(AppStep.MarketResearch);
    setError(null);
    setBookBible(null);
    setResearchContext(null);
    setAutomationPayload(null);
    setChapterLoadingStates({});
    clearVectorStore();
  }, []);
  
  const handleResetProgress = async () => {
    if (window.confirm("Are you sure you want to reset all progress? This action cannot be undone.")) {
        await storageService.clearState(STORAGE_KEY);
        window.location.reload();
    }
  };

  const handleStepChange = (step: AppStep) => {
    if (step < currentStep) {
      setCurrentStep(step);
    }
  };

  const handleStartNewProject = (startAction: () => void) => {
    const startNew = () => {
        resetProjectState();
        startAction();
    };

    if (bookOutline) {
        if (window.confirm("This will clear your current book project and start a new one. Are you sure?")) {
            startNew();
        }
    } else {
        startNew();
    }
  };

  // --- API WRAPPERS ---

  const handleFetchGenres = useCallback(async () => {
    setIsLoading(true);
    try {
      const genres = await geminiService.getHotGenres();
      setGenreSuggestions(genres);
    } catch (e) {
      console.error(e);
      setError('Failed to research genres. ' + (e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleFetchTopics = useCallback(async (genre: GenreSuggestion) => {
    setSelectedGenre(genre);
    setIsLoading(true);
    setError(null);
    setTopicSuggestions(null);
    try {
      const topics = await geminiService.getTopicSuggestions(genre.genre, genre.reasoning);
      setTopicSuggestions(topics);
    } catch (e) {
      console.error(e);
      setError('Failed to brainstorm topics.');
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  const handleGenerateFinalReport = useCallback(async (topic: TopicSuggestion | string) => {
      const topicString = typeof topic === 'string' ? topic : topic.topic;
      const genreString = typeof topic === 'string' ? undefined : selectedGenre?.genre;
      
      setIsLoading(true);
      setError(null);
      try {
        let report = await realMarketService.generateRealMarketReport(topicString, genreString);
        setMarketReport(report);
        setHasViewedReport(false);
        setCurrentStep(AppStep.Outline);
      } catch (e) {
        console.error(e);
        setError('Failed to generate market report.');
      } finally {
        setIsLoading(false);
      }
  }, [selectedGenre]);

  // MR-01: AI-only simulation path (no real data fetching)
  const handleGenerateAISimulatedReport = useCallback(async (topic: string) => {
      const genreString = selectedGenre?.genre;
      setIsLoading(true);
      setError(null);
      try {
        const report = await geminiService.generateMarketReport(topic, genreString);
        setMarketReport(report);
        setHasViewedReport(false);
        setCurrentStep(AppStep.Outline);
      } catch (e) {
        console.error(e);
        setError('Failed to generate AI market report.');
      } finally {
        setIsLoading(false);
      }
  }, [selectedGenre]);

  const handleStartWithNicheFinder = () => {
    handleStartNewProject(handleFetchGenres);
  };

  const handleStartWithCustomTopic = (topic: string) => {
    handleStartNewProject(() => handleGenerateFinalReport(topic));
  };

  const handleStartWithAISimulation = (topic: string) => {
    handleStartNewProject(() => handleGenerateAISimulatedReport(topic));
  };

  const handleOutline = useCallback(async (bookType: string, numChapters: number, pagesPerChapterValue: string) => {
    if (!marketReport) return;
    setIsLoading(true);
    setError(null);
    setPagesPerChapter(pagesPerChapterValue);
    try {
      const match = pagesPerChapterValue.match(/(\d+)-(\d+)/);
      if (!match) throw new Error("Invalid pages per chapter format");
      const minPages = parseInt(match[1], 10) * numChapters;
      const maxPages = parseInt(match[2], 10) * numChapters;
      const totalPageRange = `${minPages}-${maxPages} pages`;

      const outline = await geminiService.generateBookOutlineWithImprovement(
        marketReport,
        bookType,
        numChapters,
        totalPageRange,
        bookGenre,
        researchContext || undefined,
        mode === AppMode.Batch // skip improvement pass in batch mode
      );
      setBookOutline(outline);
    } catch (e) {
      console.error(e);
      setError('Failed to generate book outline.');
    } finally {
      setIsLoading(false);
    }
  }, [marketReport, bookGenre, researchContext, mode]);
  
  const handleRegenerateTitle = useCallback(async () => {
    if (!marketReport) return;
    setIsRegeneratingTitle(true);
    setError(null);
    try {
      const { title, subtitle } = await geminiService.regenerateBookTitle(marketReport);
      setBookOutline(prev => prev ? { ...prev, title, subtitle } : null);
    } catch (e) {
        console.error(e);
        setError('Failed to regenerate title.');
    } finally {
        setIsRegeneratingTitle(false);
    }
  }, [marketReport]);

  const handleGenerateChapter = useCallback(async (chapterIndex: number, currentContent?: string, instructions?: string) => {
    if (!bookOutline) return;
    const chapter = bookOutline.tableOfContents[chapterIndex];
    setChapterLoadingStates(prev => ({...prev, [chapter.chapter]: true}));
    setError(null);

    try {
        let content: string;
        if (currentContent && currentContent.trim().length > 0) {
            content = await geminiService.regenerateChapterWithGuidance(
                chapter.title, 
                chapter.summary, 
                currentContent, 
                pagesPerChapter,
                instructions
            );
        } else {
            // Use streaming for initial generation
            let accumulated = '';
            content = await geminiService.generateChapterContentStream(
                chapter.title,
                chapter.summary,
                pagesPerChapter,
                (chunk: string) => {
                    accumulated += chunk;
                    // Live update the editor as chunks arrive
                    setBookOutline(prev => {
                        if (!prev) return null;
                        const newToc = [...prev.tableOfContents];
                        newToc[chapterIndex] = { ...newToc[chapterIndex], content: accumulated };
                        return { ...prev, tableOfContents: newToc };
                    });
                },
                {
                    bible: bookBible || undefined,
                    bookGenre,
                    researchContext: researchContext || undefined,
                }
            );
        }

        setBookOutline(prev => {
            if (!prev) return null;
            const newToc = [...prev.tableOfContents];
            newToc[chapterIndex] = { ...newToc[chapterIndex], content };
            return { ...prev, tableOfContents: newToc };
        });

        // Background: embed chapter for RAG and extract Bible entries
        const currentBible = bookBible || { characters: [], locations: [], keyEvents: [], themes: [] };
        embedChapter(chapterIndex, content).catch(() => {});
        extractBibleEntries(content, chapter.chapter, currentBible, bookOutline.title)
            .then(updatedBible => {
                setBookBible(updatedBible);
                setBookOutline(prev => prev ? { ...prev, bookBible: updatedBible } : null);
            })
            .catch(() => {});
    } catch (e) {
        console.error(e);
        setError(`Failed to generate content for Chapter ${chapter.chapter}.`);
    } finally {
        setChapterLoadingStates(prev => ({...prev, [chapter.chapter]: false}));
    }
  }, [bookOutline, pagesPerChapter, bookBible, bookGenre, researchContext]);

  const handleUpdateChapterContent = useCallback((chapterIndex: number, content: string) => {
    setBookOutline(prev => {
        if (!prev) return null;
        const newToc = [...prev.tableOfContents];
        newToc[chapterIndex] = { ...newToc[chapterIndex], content };
        return { ...prev, tableOfContents: newToc };
    });
  }, []);

  const handleGenerateImageForIllustrationStep = useCallback(async (chapterIndex: number) => {
    if (!bookOutline) return;
    const chapter = bookOutline.tableOfContents[chapterIndex];
    if (!chapter.content) return;

    setBookOutline(prev => {
      if (!prev) return null;
      const newToc = [...prev.tableOfContents];
      newToc[chapterIndex] = { ...newToc[chapterIndex], isGeneratingImage: true };
      return { ...prev, tableOfContents: newToc };
    });
    setError(null);

    try {
      const imagePrompt = await geminiService.generateImagePrompt(chapter.content.substring(0, 500), chapter.illustrationStyle);
      const imageUrl = await geminiService.generateIllustration(imagePrompt);
      
      setBookOutline(prev => {
          if (!prev) return null;
          const newToc = [...prev.tableOfContents];
          newToc[chapterIndex] = { ...newToc[chapterIndex], imageUrl, imagePrompt };
          return { ...prev, tableOfContents: newToc };
      });
    } catch (e) {
        console.error(e);
        setError(`Failed to generate illustration for Chapter ${chapter.chapter}.`);
    } finally {
      setBookOutline(prev => {
          if (!prev) return null;
          const newToc = [...prev.tableOfContents];
          newToc[chapterIndex] = { ...newToc[chapterIndex], isGeneratingImage: false };
          return { ...prev, tableOfContents: newToc };
      });
    }
  }, [bookOutline]);

  const handleGenerateImagePrompt = useCallback(async (chapterIndex: number) => {
    if (!bookOutline) return;
    const chapter = bookOutline.tableOfContents[chapterIndex];
    if (!chapter.content) return;

    setBookOutline(prev => {
      if (!prev) return null;
      const newToc = [...prev.tableOfContents];
      newToc[chapterIndex] = { ...newToc[chapterIndex], isGeneratingPrompt: true };
      return { ...prev, tableOfContents: newToc };
    });
    setError(null);

    try {
      const prompt = await geminiService.generateImagePrompt(chapter.content.substring(0, 500), chapter.illustrationStyle);
      setBookOutline(prev => {
        if (!prev) return null;
        const newToc = [...prev.tableOfContents];
        newToc[chapterIndex] = { ...newToc[chapterIndex], imagePrompt: prompt };
        return { ...prev, tableOfContents: newToc };
      });
    } catch (e) {
      console.error(e);
      setError(`Failed to generate image prompt.`);
    } finally {
      setBookOutline(prev => {
        if (!prev) return null;
        const newToc = [...prev.tableOfContents];
        newToc[chapterIndex] = { ...newToc[chapterIndex], isGeneratingPrompt: false };
        return { ...prev, tableOfContents: newToc };
      });
    }
  }, [bookOutline]);
  
  const handleUpdateImagePrompt = useCallback((chapterIndex: number, prompt: string) => {
    setBookOutline(prev => {
        if (!prev) return null;
        const newToc = [...prev.tableOfContents];
        newToc[chapterIndex] = { ...newToc[chapterIndex], imagePrompt: prompt };
        return { ...prev, tableOfContents: newToc };
    });
  }, []);
  
  const handleUpdateChapterStyle = useCallback((chapterIndex: number, style: string) => {
    setBookOutline(prev => {
        if (!prev) return null;
        const newToc = [...prev.tableOfContents];
        const currentStyle = newToc[chapterIndex].illustrationStyle;
        newToc[chapterIndex] = { ...newToc[chapterIndex], illustrationStyle: currentStyle === style ? undefined : style };
        return { ...prev, tableOfContents: newToc };
    });
  }, []);

  const handleGenerateIllustrationFromContentStep = useCallback(async (chapterIndex: number) => {
    if (!bookOutline) return;
    const chapter = bookOutline.tableOfContents[chapterIndex];
    if (!chapter.imagePrompt) return;

    setBookOutline(prev => {
      if (!prev) return null;
      const newToc = [...prev.tableOfContents];
      newToc[chapterIndex] = { ...newToc[chapterIndex], isGeneratingImage: true };
      return { ...prev, tableOfContents: newToc };
    });
    setError(null);

    try {
      const imageUrl = await geminiService.generateIllustration(chapter.imagePrompt);
      setBookOutline(prev => {
        if (!prev) return null;
        const newToc = [...prev.tableOfContents];
        newToc[chapterIndex] = { ...newToc[chapterIndex], imageUrl };
        return { ...prev, tableOfContents: newToc };
      });
    } catch(e) {
      console.error(e);
      setError(`Failed to generate illustration.`);
    } finally {
       setBookOutline(prev => {
        if (!prev) return null;
        const newToc = [...prev.tableOfContents];
        newToc[chapterIndex] = { ...newToc[chapterIndex], isGeneratingImage: false };
        return { ...prev, tableOfContents: newToc };
      });
    }
  }, [bookOutline]);


  // --- PARALLEL EXECUTION ENGINE ---
  const handleGenerateFullManuscript = useCallback(async () => {
    if (!bookOutline) return;
    setIsGeneratingFullManuscript(true);
    setFullManuscriptGenerationProgress('Initializing High-Throughput AI Engine...');
    setError(null);

    // Helper to process a single chapter fully
    const processChapter = async (chapter: Chapter, index: number): Promise<Chapter> => {
        let updatedChapter = { ...chapter };

        try {
             // 1. Content
            if (!updatedChapter.content) {
                updatedChapter.content = await geminiService.generateChapterContent(updatedChapter.title, updatedChapter.summary, pagesPerChapter);
            }
            
            // 2. Prompt
            if (!updatedChapter.imagePrompt) {
                 updatedChapter.imagePrompt = await geminiService.generateImagePrompt(updatedChapter.content!.substring(0, 500), updatedChapter.illustrationStyle);
            }

            // 3. Image
            if (!updatedChapter.imageUrl) {
                 updatedChapter.imageUrl = await geminiService.generateIllustration(updatedChapter.imagePrompt!);
            }
            return updatedChapter;

        } catch (e) {
            console.error(`Error in chapter ${index + 1}`, e);
            return updatedChapter; // Return what we have
        }
    };

    try {
        if (isHighPerformanceMode) {
             // Parallel Execution: Run chunks of chapters concurrently
             // 5 concurrent threads is usually safe for paid accounts without hitting rate limits immediately if retries are handled
             const CONCURRENCY_LIMIT = 4; 
             const chapters = [...bookOutline.tableOfContents];
             const results: Chapter[] = new Array(chapters.length);
             
             for (let i = 0; i < chapters.length; i += CONCURRENCY_LIMIT) {
                 const chunk = chapters.slice(i, i + CONCURRENCY_LIMIT);
                 setFullManuscriptGenerationProgress(`Processing Chapters ${i + 1} to ${Math.min(i + CONCURRENCY_LIMIT, chapters.length)} of ${chapters.length} in parallel...`);
                 
                 const chunkPromises = chunk.map((chapter, idx) => processChapter(chapter, i + idx));
                 const chunkResults = await Promise.all(chunkPromises);
                 
                 chunkResults.forEach((res, idx) => {
                     results[i + idx] = res;
                 });
                 
                 // Update state incrementally so user sees progress
                 setBookOutline(prev => prev ? { ...prev, tableOfContents: [...results].map((r, idx) => r || prev.tableOfContents[idx]) } : null);
             }
        } else {
             // Sequential Execution (Old method)
             let currentToc = [...bookOutline.tableOfContents];
             for (let i = 0; i < currentToc.length; i++) {
                setFullManuscriptGenerationProgress(`Processing Chapter ${i + 1} of ${currentToc.length}...`);
                const updated = await processChapter(currentToc[i], i);
                currentToc[i] = updated;
                setBookOutline(prev => prev ? { ...prev, tableOfContents: [...currentToc] } : null);
             }
        }

    } catch (e) {
        console.error(e);
        setError("The AI Engine encountered an issue. Some chapters may be incomplete.");
    } finally {
        setIsGeneratingFullManuscript(false);
        setFullManuscriptGenerationProgress('');
    }
  }, [bookOutline, pagesPerChapter, isHighPerformanceMode]);

  const handleGenerateCover = useCallback(async () => {
    if (!bookOutline || !authorProfile?.name) {
      setError("Please ensure you have a book outline and an author name in your profile.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
        const coverUrl = await geminiService.generateBookCover(bookOutline.title, bookOutline.subtitle, authorProfile.name);
        setBookCoverUrl(coverUrl);
    } catch (e) {
        console.error(e);
        setError("Failed to generate the book cover.");
    } finally {
        setIsLoading(false);
    }
  }, [bookOutline, authorProfile]);

  const handleHumanizeBook = useCallback(async () => {
    if (!bookOutline) return;
    setIsHumanizing(true);
    setError(null);
    try {
        // Parallelize humanization if high performance
        if (isHighPerformanceMode) {
             const CONCURRENCY_LIMIT = 5;
             const chapters = [...bookOutline.tableOfContents];
             const results = [...chapters];
             
             for (let i = 0; i < chapters.length; i += CONCURRENCY_LIMIT) {
                 const chunk = chapters.slice(i, i + CONCURRENCY_LIMIT);
                 const chunkPromises = chunk.map(async (chapter) => {
                     if (chapter.content) {
                         const h = await geminiService.humanizeChapterContent(chapter.content);
                         return { ...chapter, content: h };
                     }
                     return chapter;
                 });
                 const chunkResults = await Promise.all(chunkPromises);
                 chunkResults.forEach((res, idx) => { results[i + idx] = res; });
             }
             setBookOutline({ ...bookOutline, tableOfContents: results });

        } else {
            // Sequential Execution: process one chapter at a time
            const currentChapters = [...bookOutline.tableOfContents];
            for (let i = 0; i < currentChapters.length; i++) {
                if (currentChapters[i].content) {
                    currentChapters[i] = {
                        ...currentChapters[i],
                        content: await geminiService.humanizeChapterContent(currentChapters[i].content!),
                    };
                    setBookOutline(prev => prev ? { ...prev, tableOfContents: [...currentChapters] } : null);
                }
            }
        }
    } catch (e) {
        console.error(e);
        setError("Failed to humanize the book content.");
    } finally {
        setIsHumanizing(false);
    }
  }, [bookOutline, isHighPerformanceMode]);

  const handleRegenerateWithFeedback = useCallback(async (feedback: string) => {
    if (!bookOutline) return;
    setIsRegeneratingWithFeedback(true);
    setError(null);
    try {
      const newOutline = await geminiService.regenerateFullBookWithFeedback(bookOutline, feedback);
      setBookOutline(newOutline);
    } catch (e) {
      console.error(e);
      setError("Failed to regenerate the book with your feedback.");
    } finally {
      setIsRegeneratingWithFeedback(false);
    }
  }, [bookOutline]);

  const handleGenerateKdpMarketingInfo = useCallback(async () => {
    if (!bookOutline || !marketReport) {
        setError("A market report and book outline are required.");
        return;
    };
    setIsGeneratingKdpMarketing(true);
    setError(null);
    try {
        const info = await geminiService.generateKdpMarketingInfo(marketReport, bookOutline);
        setKdpMarketingInfo(info);
    } catch (e) {
        console.error(e);
        setError("Failed to generate marketing materials.");
    } finally {
        setIsGeneratingKdpMarketing(false);
    }
  }, [bookOutline, marketReport]);

  const handleStartKdpAutomation = (payload: KdpAutomationPayload) => {
    setAutomationPayload(payload);
  };

  /** Load a finished pipeline run into the workspace and jump to Review. */
  const handlePipelineComplete = (runState: PipelineRunState) => {
    if (runState.marketReport) setMarketReport(runState.marketReport);
    if (runState.outline) setBookOutline(runState.outline);
    if (runState.coverUrl) setBookCoverUrl(runState.coverUrl);
    if (runState.marketingInfo) setKdpMarketingInfo(runState.marketingInfo);
    setHasViewedReport(true);
    setIsPipelineOpen(false);
    setCurrentStep(AppStep.Review);
  };

  const handleStartBatchGeneration = useCallback(async (projectsToGenerate: {title: string, subtitle: string}[], settings: { genre: string, pageRange: string }) => {
    setIsBatchRunning(true);
    const initialProjects: BatchProject[] = projectsToGenerate.map((p, i) => ({
      id: `${Date.now()}-${i}`,
      title: p.title,
      subtitle: p.subtitle,
      status: 'Pending',
    }));
    setBatchProjects(initialProjects);

    // In Batch Mode, we process ONE book at a time to check for errors, but internal book steps can be parallel
    for (let i = 0; i < initialProjects.length; i++) {
        const currentProject = initialProjects[i];

        const updateStatus = (status: string, data?: Partial<BatchProject>) => {
            setBatchProjects(prev => prev.map(p => p.id === currentProject.id ? { ...p, status, ...data } : p));
        };
        
        try {
            updateStatus('1/5: Generating market report...');
            const report = await geminiService.generateMarketReport(currentProject.title, settings.genre);
            
            updateStatus('2/5: Creating book outline...');
            const numChapters = pageRangeToChapterCount(settings.pageRange);
            const outline = await geminiService.generateBookOutline(report, settings.genre, numChapters, settings.pageRange);
            
            updateStatus('3/5: Mass-Producing manuscript...');
            // Parallel batch generation
            const chapters = [...outline.tableOfContents];
            const writtenChapters = new Array(chapters.length);
            const CONCURRENCY = 4;
            
            for(let j=0; j<chapters.length; j+=CONCURRENCY) {
                const chunk = chapters.slice(j, j+CONCURRENCY);
                const results = await Promise.all(chunk.map(async (ch) => {
                     const content = await geminiService.generateChapterContent(ch.title, ch.summary, '3-5 pages (medium)');
                     return { ...ch, content };
                }));
                results.forEach((res, idx) => writtenChapters[j+idx] = res);
            }
            const outlineWithContent: BookOutline = { ...outline, tableOfContents: writtenChapters };

            updateStatus('4/5: Humanizing & Polishing...');
            // Parallel humanization
            const humanizedChapters = new Array(writtenChapters.length);
            for(let j=0; j<writtenChapters.length; j+=CONCURRENCY) {
                const chunk = writtenChapters.slice(j, j+CONCURRENCY);
                const results = await Promise.all(chunk.map(async (ch) => {
                     if (ch.content) {
                        const h = await geminiService.humanizeChapterContent(ch.content);
                        return { ...ch, content: h };
                     }
                     return ch;
                }));
                results.forEach((res, idx) => humanizedChapters[j+idx] = res);
            }

            const finalOutline: BookOutline = { ...outlineWithContent, tableOfContents: humanizedChapters };
            
            updateStatus('5/5: Designing book cover...');
            const coverUrl = await geminiService.generateBookCover(finalOutline.title, finalOutline.subtitle, authorProfile?.name || 'The Author');
            
            updateStatus('Complete', { finalOutline, coverUrl });
            
            await new Promise(resolve => setTimeout(resolve, 3000));

        } catch(e) {
            console.error(`Failed to generate book "${currentProject.title}":`, e);
            updateStatus('Error', { error: (e as Error).message });
        }
    }
  }, [authorProfile]);


  if (mode === AppMode.Batch) {
    return <BatchMode
              onExit={() => {
                setMode(AppMode.Single);
                setIsBatchRunning(false);
                setBatchProjects([]);
              }}
              onStartBatch={handleStartBatchGeneration}
              projects={batchProjects}
              isRunning={isBatchRunning}
           />
  }

  if (automationPayload) {
    return <KdpAutomationBot {...automationPayload} onClose={() => setAutomationPayload(null)} />;
  }
  
  // Loading State for DB
  // NATIVE FILE SYSTEM HANDLERS
  const handleSaveProject = async () => {
    const projectState = {
        version: 1,
        date: new Date().toISOString(),
        mode,
        currentStep,
        selectedGenre,
        marketReport,
        bookOutline,
        bookCoverUrl,
        authorProfile,
        kdpMarketingInfo,
        pagesPerChapter,
        automationPayload,
        bookGenre,
        bookBible,
        researchContext,
        chapterLoadingStates: {} // Don't save loading states
    };

    const fileName = bookOutline?.title ? `${bookOutline.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json` : 'kdp-project.json';
    
    try {
        const result = await desktopBridge.saveFile(JSON.stringify(projectState, null, 2), fileName);
        if (result.success) {
            alert(`Project saved successfully to: ${result.filePath}`);
        } else if (result.error) {
            alert(`Failed to save project: ${result.error}`);
        }
    } catch (e) {
        console.error("Save failed", e);
        alert("An error occurred while saving.");
    }
  };

  const handleLoadProject = async () => {
      try {
          const result = await desktopBridge.loadFile();
          if (result.success && result.data) {
              const data = JSON.parse(result.data);
              
              if (window.confirm("Load this project? Current progress will be overwritten.")) {
                  // Restore State
                  if (data.mode) setMode(data.mode);
                  if (data.currentStep) setCurrentStep(data.currentStep);
                  if (data.selectedGenre) setSelectedGenre(data.selectedGenre);
                  if (data.marketReport) setMarketReport(data.marketReport);
                  if (data.bookOutline) setBookOutline(data.bookOutline);
                  if (data.bookCoverUrl) setBookCoverUrl(data.bookCoverUrl);
                  if (data.authorProfile) setAuthorProfile(data.authorProfile);
                  if (data.kdpMarketingInfo) setKdpMarketingInfo(data.kdpMarketingInfo);
                  if (data.pagesPerChapter) setPagesPerChapter(data.pagesPerChapter);
                  if (data.automationPayload) setAutomationPayload(data.automationPayload);
                  if (data.bookGenre) setBookGenre(data.bookGenre);
                  if (data.bookBible) setBookBible(data.bookBible);
                  if (data.researchContext) setResearchContext(data.researchContext);
                  
                  // Reset temporary UI states
                  setError(null);
                  setChapterLoadingStates({});
                  setHasViewedReport(true); // Assume viewed if loading a project past research
              }
          } else if (result.error) {
              alert(`Failed to load project: ${result.error}`);
          }
      } catch (e) {
         console.error("Load failed", e);
         alert("Failed to parse project file.");
      }
  };

  useEffect(() => {
    const unlisten = desktopBridge.onNativeMenuAction(async (action) => {
      switch (action.id) {
        case 'file_new':
          if (window.confirm('Start a new project? Unsaved changes will be lost.')) {
            resetProjectState();
          }
          break;
        case 'file_open':
          await handleLoadProject();
          break;
        case 'file_save':
        case 'file_export':
          await handleSaveProject();
          break;
        case 'file_accounts':
          setNativeMenuPanel('accounts');
          break;
        case 'edit_preferences':
          setNativeMenuPanel('preferences');
          break;
        case 'edit_ai_proxy_toggle_routing':
        case 'edit_ai_proxy_latency':
        case 'edit_ai_proxy_potluck':
        case 'edit_ai_proxy_oauth_dashboard':
          setNativeMenuPanel('ai-proxy');
          break;
        case 'edit_clipboard_copy':
        case 'edit_clipboard_paste':
        case 'edit_clipboard_find':
        case 'edit_clipboard_replace':
        case 'edit_clipboard_persistent_history':
          setNativeMenuPanel('clipboard');
          break;
        case 'authorship_defaults':
        case 'authorship_marketplace':
          setNativeMenuPanel('authorship');
          break;
        default:
          break;
      }
    });
    return () => {
      unlisten();
    };
  }, [handleLoadProject, handleSaveProject, resetProjectState]);

  if (isLoading) {
      return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center">
              <LoadingSpinner size="lg" message="Loading your workspace..." />
          </div>
      );
  }

  const renderCurrentStep = () => {
    switch (currentStep) {
      case AppStep.MarketResearch:
        return <MarketResearchStep
          onStartWithNicheFinder={handleStartWithNicheFinder}
          onStartWithCustomTopic={handleStartWithCustomTopic}
          onStartWithAISimulation={handleStartWithAISimulation}
          onSelectGenre={handleFetchTopics}
          onSelectTopic={(topic) => handleGenerateFinalReport(topic)}
          genres={genreSuggestions}
          topics={topicSuggestions}
          isLoading={isLoading}
          bookCoverUrl={bookCoverUrl}
          bookOutline={bookOutline}
          authorProfile={authorProfile}
          onSetMode={() => setMode(AppMode.Batch)}
          exampleCoverUrl={exampleCoverUrl}
          isGeneratingExampleCover={isGeneratingExampleCover}
          onGenerateExampleCover={handleGenerateExampleCover}
          supportsRealResearch={!!(window.electronAPI || (window as any).__TAURI_INTERNALS__)}
        />;
      case AppStep.Outline:
        if (marketReport && !hasViewedReport) {
          return <MarketReportDisplay 
                    report={marketReport} 
                    onProceed={() => setHasViewedReport(true)}
                 />;
        }
        return <OutlineStep 
                  marketReport={marketReport} 
                  onOutlineGenerated={handleOutline} 
                  isLoading={isLoading} 
                  bookOutline={bookOutline} 
                  setBookOutline={setBookOutline} 
                  onRegenerateTitle={handleRegenerateTitle}
                  isRegeneratingTitle={isRegeneratingTitle}
                  bookGenre={bookGenre}
                  onSetBookGenre={setBookGenre}
                />;
      case AppStep.Content:
        return <ContentGenerationStep 
                  outline={bookOutline} 
                  onGenerateChapter={handleGenerateChapter} 
                  updateChapterContent={handleUpdateChapterContent} 
                  chapterLoadingStates={chapterLoadingStates}
                  onGenerateImagePrompt={handleGenerateImagePrompt}
                  onUpdateImagePrompt={handleUpdateImagePrompt}
                  onGenerateIllustration={handleGenerateIllustrationFromContentStep}
                  onGenerateFullManuscript={handleGenerateFullManuscript}
                  isGeneratingFullManuscript={isGeneratingFullManuscript}
                  fullManuscriptGenerationProgress={fullManuscriptGenerationProgress}
                  onUpdateChapterStyle={handleUpdateChapterStyle}
               />;
      case AppStep.Illustration:
        return <IllustrationStep chapters={bookOutline?.tableOfContents || []} onGenerateImage={handleGenerateImageForIllustrationStep} />;
      case AppStep.Review:
        return <ReviewStep 
                  outline={bookOutline} 
                  authorProfile={authorProfile} 
                  marketReport={marketReport}
                  onGenerateCover={handleGenerateCover}
                  bookCoverUrl={bookCoverUrl}
                  onUpdateBookCover={setBookCoverUrl}
                  isLoading={isLoading}
                  onHumanizeBook={handleHumanizeBook}
                  isHumanizing={isHumanizing}
                  onGenerateKdpMarketing={handleGenerateKdpMarketingInfo}
                  isGeneratingKdpMarketing={isGeneratingKdpMarketing}
                  kdpMarketingInfo={kdpMarketingInfo}
                  onStartKdpAutomation={handleStartKdpAutomation}
                  onRegenerateWithFeedback={handleRegenerateWithFeedback}
                  isRegeneratingWithFeedback={isRegeneratingWithFeedback}
                  onRegenerateChapter={handleGenerateChapter}
                  chapterLoadingStates={chapterLoadingStates}
               />;
      default:
        return <p>Something went wrong.</p>;
    }
  };
  
  const canProceed = () => {
    switch(currentStep){
      case AppStep.MarketResearch: return !!marketReport;
      case AppStep.Outline: return (!!marketReport && hasViewedReport && !!bookOutline);
      case AppStep.Content: return !!bookOutline && bookOutline.tableOfContents.some(c => c.content);
      case AppStep.Illustration: return !!bookOutline;
      default: return false;
    }
  }

  return (
    <div className="pt-8 min-h-screen flex flex-col bg-slate-900 text-slate-200 font-sans selection:bg-indigo-500 selection:text-white">
      <TitleBar onSave={handleSaveProject} onLoad={handleLoadProject} />
      
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-8 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-violet-600 to-indigo-600 p-2 rounded-lg shadow-lg shadow-violet-900/20">
                <SparklesIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                  KDP E-Book Generator
                </h1>
                <p className="text-xs text-slate-500 font-medium tracking-wide">AI-POWERED PUBLISHING ENGINE</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
                {bookOutline && (
                     <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700">
                        <CheckBadgeIcon className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-medium text-slate-300 max-w-[150px] truncate">{bookOutline.title}</span>
                     </div>
                )}
            
              <button
                onClick={() => setIsPipelineOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-violet-900/40 transition-colors text-violet-300 hover:text-violet-200 border border-violet-700/50"
                title="Run the full 12-stage book-forge pipeline"
              >
                <RocketLaunchIcon className="w-5 h-5" />
                <span className="text-sm font-medium hidden sm:inline">Full Pipeline</span>
              </button>
              <button 
                onClick={() => setIsAuthorModalOpen(true)} 
                className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
              >
                {authorProfile?.photo ? (
                    <img src={authorProfile.photo.base64} className="w-6 h-6 rounded-full object-cover ring-2 ring-violet-500/30" alt="Profile"/>
                ) : (
                    <UserCircleIcon className="w-5 h-5" />
                )}
                <span className="text-sm font-medium">{authorProfile?.name || 'Author Profile'}</span>
              </button>
              
              <button
                onClick={handleResetProgress} 
                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded-md transition-colors"
                title="Reset Project"
              >
                <TrashIcon className="w-5 h-5" />
              </button>
              
               {/* Auto Save Status */}
              <div className="hidden lg:block ml-2 border-l border-slate-700 pl-4">
                  <AutoSaveIndicator isSaving={isAutoSaving} lastSaved={lastSaved} />
              </div>
            </div>
          </div>
          
           {/* Progress Stepper */}
          <div className="mt-6 mb-2">
            <StepIndicator currentStep={currentStep} onStepClick={handleStepChange} />
            <PipelineTracker
              snapshot={{
                marketReport: !!marketReport,
                outline: !!bookOutline,
                bible: !!((bookOutline?.bookBible?.characters?.length ?? 0) > 0 || bookBible),
                chaptersDrafted: !!(bookOutline?.tableOfContents.some((c) => c.content)),
                manuscriptComplete: !!(
                  bookOutline &&
                  bookOutline.tableOfContents.length > 0 &&
                  bookOutline.tableOfContents.every((c) => c.content)
                ),
                inReview: currentStep >= AppStep.Review,
                coverReady: !!bookCoverUrl,
                marketingReady: !!kdpMarketingInfo,
                automationLaunched: !!automationPayload,
              }}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
            <div className="mb-6 bg-red-950/30 border border-red-900/50 rounded-lg p-4 flex items-start gap-3 animate-fade-in">
                <div className="mt-1 text-red-500 shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-sm font-medium text-red-400">Encountered an error</h3>
                    <p className="text-sm text-red-300/80 mt-1">{error}</p>
                    <button onClick={() => setError(null)} className="text-xs text-red-400 hover:text-red-300 mt-2 underline">Dismiss</button>
                </div>
            </div>
        )}

        {renderCurrentStep()}
      </main>
      
       {/* Modals */}
      {isAuthorModalOpen && (
        <AuthorProfileModal 
            profile={authorProfile}
            onSave={handleSaveAuthorProfile}
            onClose={() => setIsAuthorModalOpen(false)} 
            bookOutline={bookOutline}
            marketReport={marketReport}
        />
      )}
      {isPipelineOpen && (
        <PipelineConsole
            authorProfile={authorProfile}
            onClose={() => setIsPipelineOpen(false)}
            onPipelineComplete={handlePipelineComplete}
        />
      )}
      <NativeMenuCenter panel={nativeMenuPanel} onClose={() => setNativeMenuPanel(null)} />


      {/* System Resource Footer Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-950 border-t border-slate-800 p-2 flex justify-between items-center text-xs text-slate-500 z-40 px-6">
        <div className="flex items-center gap-4">
             <div className="flex items-center gap-1">
                 <span className={isPersistentStorage ? "text-emerald-500" : "text-amber-500"}>●</span>
                 <span>Storage: {isPersistentStorage ? "High-Capacity (Persistent)" : "Standard (Volatile)"}</span>
                 {storageQuota && (
                     <span className="ml-1 opacity-70">
                         ({(storageQuota.usage / (1024 * 1024)).toFixed(1)} MB used)
                     </span>
                 )}
             </div>
             {!isPersistentStorage && (
                 <button onClick={handleRequestPersistence} className="text-violet-400 hover:underline">
                     Enable High-Capacity Mode
                 </button>
             )}
        </div>
        <div className="flex items-center gap-4">
             <div className="flex items-center gap-2">
                 <span>Execution Engine:</span>
                 <button 
                    onClick={() => setIsHighPerformanceMode(!isHighPerformanceMode)} 
                    className={`flex items-center gap-1 px-2 py-0.5 rounded ${isHighPerformanceMode ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                    title={isHighPerformanceMode ? "Parallel processing enabled. Uses more API quota." : "Sequential processing enabled. Slower but safer."}
                 >
                     {isHighPerformanceMode ? <RocketLaunchIcon className="w-3 h-3" /> : null}
                     {isHighPerformanceMode ? "High Concurrency" : "Sequential"}
                 </button>
             </div>
             {totalTokens > 0 && (
               <span className="text-slate-600">~{totalTokens.toLocaleString()} tokens</span>
             )}
             {/* AI Provider pill */}
             <div className="relative">
               <button
                 onClick={() => setIsProviderPanelOpen(v => !v)}
                 className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 hover:border-violet-600 hover:text-violet-400 transition-colors"
                 title="Switch AI provider"
               >
                 {providerConfig.type === 'gemini' ? 'Gemini ✦' : `${providerConfig.openaiModel || 'Custom'} ⚡`} ▾
               </button>
               {isProviderPanelOpen && (
                 <ProviderSettingsPanel
                   config={providerConfig}
                   onConfigChange={setProviderConfig}
                   onClose={() => setIsProviderPanelOpen(false)}
                 />
               )}
             </div>
             <span>App v1.5.0</span>
        </div>
      </div>
    </div>
  );
}

export default App;
