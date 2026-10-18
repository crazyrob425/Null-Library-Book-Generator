/**
 * pipelineRunner.ts — executes the 12-stage book-forge pipeline end to end.
 *
 * Orchestrates the existing generation services (geminiService, ragService,
 * thirdPartyServices, epubGenerator) through the stage definitions in
 * pipelineStages.ts. Human-gate stages (outline-lock, voice-pass,
 * compliance-launch) pause until approveGate() is called; everything else
 * runs straight through.
 *
 * Usage:
 *   const runner = new PipelineRunner(options, callbacks);
 *   runner.run();                       // resolves with the final state
 *   runner.approveGate('outline-lock'); // when the UI/user signs off
 *   runner.rejectGate('outline-lock', 'needs more tension'); // aborts the run
 */

import {
  AuthorProfile,
  AiContentDisclosure,
  BookBible,
  BookGenre,
  BookOutline,
  KdpMarketingInfo,
  MarketReport,
  PipelineStageDef,
} from '../types';
import * as geminiService from './geminiService';
import { extractBibleEntries } from './ragService';
import {
  computeReadabilityScore,
  detectRepetitivePatterns,
  getWordCount,
  ReadabilityScore,
} from './thirdPartyServices';
import { getLaneForGenre, GenreLane } from './marketIntel';
import { PIPELINE_STAGES } from './pipelineStages';
import generateEpub from './epubGenerator';

// ── Options / state / callbacks ─────────────────────────────────────────────

export interface PipelineRunOptions {
  topic: string;
  genre?: string;
  bookGenre: BookGenre;
  numChapters?: number;
  pageRange?: string;
  authorProfile: AuthorProfile;
  aiDisclosure?: AiContentDisclosure;
  /** When true, human gates auto-approve (testing only — never for real publishing). */
  autoApproveGates?: boolean;
}

export interface ChapterQA {
  chapter: number;
  title: string;
  words: number;
  readability: ReadabilityScore | null;
  repetitionAlerts: number;
  warnings: string[];
}

export interface PipelinePremise {
  title: string;
  subtitle: string;
  bookType: string;
}

export interface PipelineRunState {
  stageIndex: number;
  lane?: GenreLane;
  marketReport?: MarketReport;
  premise?: PipelinePremise;
  outline?: BookOutline;
  qaReport: ChapterQA[];
  coverUrl?: string;
  marketingInfo?: KdpMarketingInfo;
  epubBlob?: Blob;
  automationReady: boolean;
  aborted: boolean;
  abortReason?: string;
  gateApprovals: Record<string, boolean>;
}

export interface PipelineCallbacks {
  onStageStart?: (stage: PipelineStageDef) => void;
  onStageComplete?: (stage: PipelineStageDef, detail?: string) => void;
  onLog?: (message: string) => void;
  /** Fired when a human-gate stage is reached; the run pauses until approveGate/rejectGate. */
  onGate?: (stage: PipelineStageDef, summary: string) => void;
  onDone?: (state: PipelineRunState) => void;
  onAbort?: (reason: string) => void;
}

const HUMAN_GATE_IDS = new Set(['outline-lock', 'voice-pass', 'compliance-launch']);

// ── Runner ──────────────────────────────────────────────────────────────────

export class PipelineRunner {
  private gateWaiters = new Map<string, (approved: boolean, reason?: string) => void>();
  readonly state: PipelineRunState;

  constructor(
    private options: PipelineRunOptions,
    private cb: PipelineCallbacks = {},
  ) {
    this.state = {
      stageIndex: -1,
      qaReport: [],
      automationReady: false,
      aborted: false,
      gateApprovals: {},
    };
  }

  // -- gate control (called from UI) -----------------------------------------
  approveGate(stageId: string): void {
    const w = this.gateWaiters.get(stageId);
    if (w) {
      this.gateWaiters.delete(stageId);
      this.state.gateApprovals[stageId] = true;
      w(true);
    }
  }

  rejectGate(stageId: string, reason = 'Rejected by user'): void {
    const w = this.gateWaiters.get(stageId);
    if (w) {
      this.gateWaiters.delete(stageId);
      w(false, reason);
    }
  }

  private gate(stageId: string, summary: string): Promise<void> {
    const stage = PIPELINE_STAGES.find((s) => s.id === stageId)!;
    return new Promise<void>((resolve, reject) => {
      if (this.options.autoApproveGates) {
        this.log(`[gate:${stageId}] auto-approved (testing mode)`);
        this.state.gateApprovals[stageId] = true;
        resolve();
        return;
      }
      this.log(`[gate:${stageId}] paused — waiting for human sign-off`);
      this.cb.onGate?.(stage, summary);
      this.gateWaiters.set(stageId, (approved, reason) => {
        if (approved) resolve();
        else reject(new Error(reason ?? `Gate "${stageId}" rejected`));
      });
    });
  }

  // -- main run ---------------------------------------------------------------
  async run(): Promise<PipelineRunState> {
    const stages: Array<() => Promise<void>> = [
      () => this.stageMarketTargeting(),
      () => this.stagePremiseHook(),
      () => this.stageOutlineLock(),
      () => this.stageCharacterBibles(),
      () => this.stageChapterDrafting(),
      () => this.stageHumanizationPass(),
      () => this.stageContinuityFactCheck(),
      () => this.stageEditingLadder(),
      () => this.stageReadabilityQA(),
      () => this.stageVoicePass(),
      () => this.stagePackaging(),
      () => this.stageComplianceLaunch(),
    ];

    try {
      for (let i = 0; i < stages.length; i++) {
        if (this.state.aborted) break;
        const def = PIPELINE_STAGES[i];
        this.state.stageIndex = i;
        this.cb.onStageStart?.(def);
        this.log(`—— Stage ${i + 1}/12: ${def.name} ——`);
        await stages[i]();
        this.cb.onStageComplete?.(def);
      }
      if (!this.state.aborted) {
        this.log('Pipeline complete.');
        this.cb.onDone?.(this.state);
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.state.aborted = true;
      this.state.abortReason = reason;
      this.log(`Pipeline aborted: ${reason}`);
      this.cb.onAbort?.(reason);
    }
    return this.state;
  }

  private log(message: string): void {
    this.cb.onLog?.(message);
  }

  private outlineOrThrow(): BookOutline {
    if (!this.state.outline) throw new Error('No outline — earlier stage failed.');
    return this.state.outline;
  }

  // -- stages -----------------------------------------------------------------

  /** 1. Market targeting — pick the researched genre lane (pure data, no AI call). */
  private async stageMarketTargeting(): Promise<void> {
    const lane = this.options.genre ? getLaneForGenre(this.options.genre) : undefined;
    this.state.lane = lane;
    if (lane) {
      this.log(`Lane: ${lane.name} — ${lane.tropes.join(', ')}; ${lane.wordCount[0].toLocaleString()}–${lane.wordCount[1].toLocaleString()} words; $${lane.price.toFixed(2)} ${lane.distribution}`);
    } else {
      this.log('No researched lane matched; running unanchored (market report will still ground pricing).');
    }
  }

  /** 2. Premise & hook — market report + title, premise from top suggested book type. */
  private async stagePremiseHook(): Promise<void> {
    const report = await geminiService.generateMarketReport(this.options.topic, this.options.genre);
    this.state.marketReport = report;
    const bookType = report.suggestedBookTypes?.[0]?.type ?? this.options.genre ?? this.options.topic;
    const { title, subtitle } = await geminiService.regenerateBookTitle(report);
    this.state.premise = { title, subtitle, bookType };
    this.log(`Premise: "${title}" — ${bookType}`);
  }

  /** 3. Outline lock — HUMAN GATE. */
  private async stageOutlineLock(): Promise<void> {
    const report = this.state.marketReport!;
    const premise = this.state.premise!;
    const numChapters = this.options.numChapters ?? 12;
    const pageRange = this.options.pageRange ?? '150-200';
    const outline = await geminiService.generateBookOutlineWithImprovement(
      report,
      premise.bookType,
      numChapters,
      pageRange,
      this.options.bookGenre,
    );
    outline.title = premise.title;
    outline.subtitle = premise.subtitle;
    this.state.outline = outline;
    const toc = outline.tableOfContents.map((c) => `${c.chapter}. ${c.title}`).join('\n');
    await this.gate('outline-lock', `Outline locked draft:\n"${outline.title}"\n${toc}`);
  }

  /** 4. Character bibles — seed from chapter summaries, refined in stage 7. */
  private async stageCharacterBibles(): Promise<void> {
    const outline = this.outlineOrThrow();
    let bible: BookBible = outline.bookBible ?? { characters: [], locations: [], keyEvents: [], themes: [] };
    const seedText = outline.tableOfContents
      .map((c) => `Chapter ${c.chapter} — ${c.title}: ${c.summary}`)
      .join('\n');
    if (seedText.trim()) {
      bible = await extractBibleEntries(seedText, 0, bible, outline.title);
    }
    outline.bookBible = bible;
    this.log(`Bible seeded: ${bible.characters.length} characters, ${bible.locations.length} locations.`);
  }

  /** 5. Chapter drafting — scene plan + full draft per chapter. */
  private async stageChapterDrafting(): Promise<void> {
    const outline = this.outlineOrThrow();
    const lane = this.state.lane;
    const targetWords = lane
      ? Math.round(((lane.wordCount[0] + lane.wordCount[1]) / 2 / outline.tableOfContents.length))
      : 2500;
    const lengthGuidance = `approximately ${targetWords.toLocaleString()} words`;

    for (const ch of outline.tableOfContents) {
      this.log(`Drafting chapter ${ch.chapter}: ${ch.title}`);
      const plan = await geminiService.generateScenePlan(ch.title, ch.summary, this.options.bookGenre, outline.bookBible);
      ch.content = await geminiService.generateChapterContent(ch.title, `${ch.summary}\n\nScene plan:\n${plan}`, lengthGuidance);
    }
    const missing = outline.tableOfContents.filter((c) => !c.content);
    if (missing.length > 0) throw new Error(`Drafting incomplete: ${missing.length} chapters missing content.`);
  }

  /** 6. Humanization pass — scrub AI tells chapter by chapter. */
  private async stageHumanizationPass(): Promise<void> {
    const outline = this.outlineOrThrow();
    for (const ch of outline.tableOfContents) {
      this.log(`Humanizing chapter ${ch.chapter}`);
      ch.content = await geminiService.humanizeChapterContent(ch.content!);
    }
  }

  /** 7. Continuity & fact check — per-chapter bible extraction over finished prose. */
  private async stageContinuityFactCheck(): Promise<void> {
    const outline = this.outlineOrThrow();
    let bible = outline.bookBible ?? { characters: [], locations: [], keyEvents: [], themes: [] };
    for (const ch of outline.tableOfContents) {
      bible = await extractBibleEntries(ch.content!, ch.chapter, bible, outline.title);
    }
    outline.bookBible = bible;
    // Cheap consistency scan: flag near-duplicate character names.
    const names = bible.characters.map((c) => c.name.toLowerCase());
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) this.log(`WARNING: possible duplicate characters: ${[...new Set(dupes)].join(', ')}`);
    this.log(`Continuity pass done: ${bible.characters.length} characters, ${bible.keyEvents.length} key events tracked.`);
  }

  /** 8. Editing ladder — critique + apply per chapter (dev/line pass via AI). */
  private async stageEditingLadder(): Promise<void> {
    const outline = this.outlineOrThrow();
    for (const ch of outline.tableOfContents) {
      this.log(`Editing chapter ${ch.chapter}`);
      const critique = await geminiService.generateLiteraryCritique(ch.title, ch.content!, outline);
      ch.content = await geminiService.applyLiteraryCritique(ch.title, ch.content!, critique);
    }
  }

  /** 9. Readability QA — grade-level, repetition, word counts; warnings, not failures. */
  private async stageReadabilityQA(): Promise<void> {
    const outline = this.outlineOrThrow();
    const report: ChapterQA[] = [];
    for (const ch of outline.tableOfContents) {
      const text = ch.content!;
      const warnings: string[] = [];
      let readability: ReadabilityScore | null = null;
      try {
        readability = await computeReadabilityScore(text);
        if (readability.gradeLevel > 12) warnings.push(`grade level ${readability.gradeLevel.toFixed(1)} above 12`);
      } catch {
        warnings.push('readability scoring unavailable');
      }
      const rep = detectRepetitivePatterns(text);
      if (rep.length > 5) warnings.push(`${rep.length} repetitive patterns flagged`);
      const words = getWordCount(text);
      if (words < 800) warnings.push(`only ${words} words — short for the lane`);
      report.push({ chapter: ch.chapter, title: ch.title, words, readability, repetitionAlerts: rep.length, warnings });
      if (warnings.length > 0) this.log(`Ch ${ch.chapter} QA: ${warnings.join('; ')}`);
    }
    this.state.qaReport = report;
    const total = report.reduce((a, r) => a + r.words, 0);
    this.log(`QA complete: ${total.toLocaleString()} words across ${report.length} chapters.`);
  }

  /** 10. Voice pass — HUMAN GATE (read-aloud sign-off). */
  private async stageVoicePass(): Promise<void> {
    const outline = this.outlineOrThrow();
    const total = outline.tableOfContents.reduce((a, c) => a + getWordCount(c.content ?? ''), 0);
    await this.gate(
      'voice-pass',
      `Voice pass sign-off for "${outline.title}" (${total.toLocaleString()} words, ${outline.tableOfContents.length} chapters). ` +
        `Confirm a read-aloud pass was done and voice is consistent with the character bibles.`,
    );
  }

  /** 11. Packaging — marketing info + cover. */
  private async stagePackaging(): Promise<void> {
    const outline = this.outlineOrThrow();
    const report = this.state.marketReport!;
    const author = this.options.authorProfile.name || 'Author';
    this.log('Generating KDP marketing info…');
    this.state.marketingInfo = await geminiService.generateKdpMarketingInfo(report, outline);
    this.log('Generating cover…');
    this.state.coverUrl = await geminiService.generateBookCover(outline.title, outline.subtitle, author);
    const mi = this.state.marketingInfo;
    if (mi.keywords.length > 7) this.log(`WARNING: ${mi.keywords.length} keywords generated; KDP allows 7 — trim before upload.`);
    if (mi.categories.length > 3) this.log(`WARNING: ${mi.categories.length} categories generated; KDP allows 3 per format — trim before upload.`);
  }

  /** 12. Compliance & launch — HUMAN GATE. Verifies AI disclosure, builds the EPUB. */
  private async stageComplianceLaunch(): Promise<void> {
    const d = this.options.aiDisclosure;
    if (!d || !d.acknowledged) {
      throw new Error(
        'AI-content disclosure missing or unacknowledged. Confirm disclosure answers before publishing ' +
          '(undisclosed AI-generated content risks title removal / account suspension).',
      );
    }
    const outline = this.outlineOrThrow();
    this.log(
      `AI disclosure filed — text: ${d.aiGeneratedText ? 'AI-GENERATED' : 'no'}, ` +
        `images: ${d.aiGeneratedImages ? 'AI-GENERATED' : 'no'}, ` +
        `translations: ${d.aiGeneratedTranslations ? 'AI-GENERATED' : 'no'}.`,
    );
    this.log('Building EPUB…');
    this.state.epubBlob = await generateEpub(outline, this.options.authorProfile, this.state.coverUrl);
    this.state.automationReady = true;
    await this.gate(
      'compliance-launch',
      `Ready to publish "${outline.title}". Disclosure acknowledged; EPUB built. ` +
        `Approve to hand the payload to the KDP automation bot.`,
    );
  }
}

/** Convenience: run the full pipeline with plain callbacks. */
export async function runPipeline(
  options: PipelineRunOptions,
  callbacks: PipelineCallbacks = {},
): Promise<PipelineRunState> {
  const runner = new PipelineRunner(options, callbacks);
  return runner.run();
}

export { PIPELINE_STAGES };
export type { PipelineStageDef };
