

export interface GoogleTrendsData {
  interestOverTime: { month: string; value: number }[];
  relatedQueries: { query: string; value: string }[];
}

export interface MarketReport {
  trendAnalysis: string;
  targetAudience: {
    demographics: string;
    interests: string;
    painPoints: string;
  };
  keywords: string[];
  suggestedBookTypes: { type: string; reasoning: string }[];
  competitorAnalysis: {
    title: string;
    successFactor: string;
  }[];
  googleTrends?: GoogleTrendsData;
}

// Book type classification
export type BookGenre = 'fiction' | 'non-fiction';

// --- Book Bible (character/location/event continuity tracker) ---
export interface BibleCharacter {
  name: string;
  description: string;
  role: string; // protagonist, antagonist, supporting, etc.
  firstAppearance: number; // chapter number
}

export interface BibleLocation {
  name: string;
  description: string;
}

export interface BibleEvent {
  chapter: number;
  summary: string;
}

export interface BookBible {
  characters: BibleCharacter[];
  locations: BibleLocation[];
  keyEvents: BibleEvent[];
  themes: string[];
  timeline?: string;
}

// --- Non-fiction multi-agent research ---
export interface ResearchSource {
  title: string;
  summary: string;
  relevance: string;
  sourceType: 'web' | 'academic' | 'news' | 'ai-synthesized';
}

export interface NonFictionResearchContext {
  topic: string;
  sources: ResearchSource[];
  keyFacts: string[];
  controversies: string[];
  expertOpinions: string[];
  synthesizedOverview: string;
}

export interface Chapter {
  chapter: number;
  title: string;
  summary: string;
  content?: string;
  imagePrompt?: string;
  imageUrl?: string;
  illustrationStyle?: string;
  isGeneratingPrompt?: boolean;
  isGeneratingImage?: boolean;
  embeddings?: number[];
}

export interface BookOutline {
  title: string;
  subtitle: string;
  tableOfContents: Chapter[];
  bookBible?: BookBible;
  bookGenre?: BookGenre;
  researchContext?: NonFictionResearchContext;
}

export interface CriticReview {
    source: string;
    quote: string;
}

export interface AuthorProfile {
  name: string;
  contact: string;
  bio: string;
  expertise: string;
  birthday: string;
  socialMedia: {
    twitter?: string;
    linkedin?: string;
    website?: string;
    instagram?: string;
    facebook?: string;
  };
  marketing?: {
    ctaText: string;
    ctaUrl: string;
    includeInEpub: boolean;
  };
  photo: {
    base64: string;
    mimeType: string;
  } | null;
  actionPhoto: {
    base64: string;
    mimeType: string;
  } | null;
  criticReviews: CriticReview[];
  autoGenerate: boolean;
}

export interface GenreSuggestion {
    genre: string;
    reasoning: string;
}

export interface TopicSuggestion {
    topic: string;
    reasoning: string;
}

export interface KdpMarketingInfo {
  shortDescription: string;
  longDescription: string;
  categories: string[];
  keywords: string[];
  backCoverBlurb: string;
}

export enum AppStep {
  MarketResearch,
  Outline,
  Content,
  Illustration,
  Review,
}

export enum AppMode {
  Single,
  Batch
}

export interface BatchSettings {
  genre: string;
  pageRange: string;
  numTitles: number;
  numSequels: number;
}

export interface BatchProject {
  id: string;
  title: string;
  subtitle: string;
  status: string; // e.g., 'Pending', 'Generating Report', 'Writing Chapter 5/10', 'Complete'
  finalOutline?: BookOutline; // The full book data once complete
  coverUrl?: string;
  error?: string;
}

export interface KdpAutomationPayload {
  outline: BookOutline;
  kdpMarketingInfo: KdpMarketingInfo;
  authorProfile: AuthorProfile;
  epubBlob: Blob;
  coverImageUrl: string;
  /** KDP AI-content disclosure answers; automation is blocked until acknowledged. */
  aiDisclosure: AiContentDisclosure;
}

export type BotStatus = 'initializing' | 'running' | 'captcha' | 'uploading' | 'success' | 'error';

export type BotUpdate =
  | { type: 'log'; message: string }
  | { type: 'status'; status: BotStatus }
  | { type: 'progress'; progress: number }
  | { type: 'captcha'; imageUrl?: string }
  | { type: 'success' }
  | { type: 'error'; message: string };

export interface NativeMenuAction {
  id: string;
}

export interface SecretDescriptor {
  key: string;
  label: string;
  category: string;
}

export interface GeneralPreferences {
  auto_save_frequency_seconds: number;
  undo_step_history: number;
  saved_books_dir: string;
  drafts_dir: string;
  favorite_printer: string;
}

export interface AiRoutingPreferences {
  mode: 'auto-route' | 'manual-selection';
  routing_enabled: boolean;
  latency_diagnostics_enabled: boolean;
  shared_api_key_potluck_enabled: boolean;
}

export interface SafetyPreferences {
  censorship_enabled: boolean;
  ai_personality: string;
}

export interface ClipboardPreferences {
  persistent_history_enabled: boolean;
  history_limit: number;
}

export interface AuthorshipPreferences {
  standard_book_size: string;
  default_chapter_count: number;
  default_image_style: string;
  description_input_mode: 'few-sentences' | 'partial-or-full-manuscript';
  auto_publish_marketplace: string;
}

export interface CloudSyncPreferences {
  enabled: boolean;
  google_account_email: string;
  backup_frequency_hours: number;
}

export interface DesktopPreferences {
  general: GeneralPreferences;
  ai_routing: AiRoutingPreferences;
  safety: SafetyPreferences;
  clipboard: ClipboardPreferences;
  authorship: AuthorshipPreferences;
  cloud_sync: CloudSyncPreferences;
}

export interface ElectronAPI {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  
  startAutomation: (payload: KdpAutomationPayload) => Promise<void>;
  submitCaptcha: (solution: string) => Promise<void>;
  stopAutomation: () => Promise<void>;
  
  saveFile: (data: string, filename: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  loadFile: () => Promise<{ success: boolean; data?: string; error?: string }>;

  onAutomationUpdate: (callback: (update: BotUpdate) => void) => () => void;

  // Market Research
  fetchGoogleTrends: (keyword: string) => Promise<GoogleTrendsData | null>;
  fetchAmazonCompetitors: (keyword: string) => Promise<any[]>; // Using any[] to avoid circular dependency or duplication for now, strictly it's ScrapedBook[]
  fetchAmazonSuggestions: (keyword: string) => Promise<string[]>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}

// --- NEW EXPANSION TYPES ---

export interface AudiobookConfig {
    provider: 'elevenlabs' | 'openai';
    voiceId: string;
    model?: string; // e.g. 'eleven_monolingual_v1' or 'tts-1-hd'
    apiKey?: string; // Optional, user might provide it in UI
}

export interface UniverseContext {
    id: string;
    name: string;
    description: string;
    // Shared elements across books
    factions: { name: string; description: string }[];
    characters: { name: string; description: string; role: string }[]; 
    locations: { name: string; description: string }[];
    lore: { topic: string; details: string }[];
    
    // Books in this universe
    books: { 
        id: string; // matches Project ID
        title: string; 
        seriesOrder?: number;
        isSequel?: boolean; 
    }[];
}

export interface ProjectFileV2 {
    version: 2;
    lastSaved: string; // ISO Date
    
    // Core Data
    bookOutline: BookOutline;
    marketReport: MarketReport | null;
    authorProfile: AuthorProfile | null;
    marketingInfo: KdpMarketingInfo | null;
    
    // Visuals
    covers: {
        current: string | null;
        history: string[]; // Keep track of gen iterations
    };
    
    // Expansion Data
    universeId?: string; // Link to a UniverseContext
    seriesName?: string;
    
    // Configs
    audiobookConfig?: AudiobookConfig;
    
    // App State Preservation
    uiState: {
        currentStep: AppStep;
        pagesPerChapter: string;
        selectedGenre?: GenreSuggestion;
    };
}

// --- 12-stage book-forge pipeline (Oct 2026) ---
export type PipelineAutomatability = 'auto' | 'semi-auto' | 'human';

export interface PipelineStageDef {
  id: string;
  name: string;
  description: string;
  appStep: AppStep;
  qualityGate: string;
  automatability: PipelineAutomatability;
  /** True = a human must sign off before the pipeline advances past this stage. */
  humanGate: boolean;
}

export type PipelineStageStatus = 'complete' | 'current' | 'locked';

/** Measurable app-state signals used to derive per-stage status. */
export interface PipelineSnapshot {
  marketReport: boolean;
  outline: boolean;
  bible: boolean;
  chaptersDrafted: boolean;
  manuscriptComplete: boolean;
  inReview: boolean;
  coverReady: boolean;
  marketingReady: boolean;
  automationLaunched: boolean;
}

// --- KDP AI-content disclosure (Oct 2026 compliance) ---
export interface AiContentDisclosure {
  /** AI generated any of the book's text (even after heavy editing). */
  aiGeneratedText: boolean;
  /** AI generated the cover or interior images. */
  aiGeneratedImages: boolean;
  /** AI generated a translation of the book. */
  aiGeneratedTranslations: boolean;
  /** User confirms the answers above are accurate and may be submitted to KDP. */
  acknowledged: boolean;
}

export const emptyAiContentDisclosure = (): AiContentDisclosure => ({
  aiGeneratedText: false,
  aiGeneratedImages: false,
  aiGeneratedTranslations: false,
  acknowledged: false,
});
