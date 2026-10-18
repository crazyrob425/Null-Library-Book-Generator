/**
 * pipelineStages.ts — the 12-stage book-forge production pipeline.
 *
 * Each stage maps onto one of the app's 5 AppSteps so progress can be
 * derived from existing app state (see PipelineSnapshot). Stages flagged
 * humanGate require explicit human sign-off before advancing.
 */

import {
  AppStep,
  PipelineStageDef,
  PipelineSnapshot,
  PipelineStageStatus,
} from '../types';

export const PIPELINE_STAGES: PipelineStageDef[] = [
  {
    id: 'market-targeting',
    name: 'Market Targeting',
    description: 'Pick the lane from the ranked genre playbooks (tropes, heat, length, price, KU vs wide).',
    appStep: AppStep.MarketResearch,
    qualityGate: 'Lane matches a researched genre playbook.',
    automatability: 'auto',
    humanGate: false,
  },
  {
    id: 'premise-hook',
    name: 'Premise & Hook',
    description: 'Premise options built on proven high-converting patterns; working title (2–4 words commercial).',
    appStep: AppStep.MarketResearch,
    qualityGate: 'Hook survives the "would I click this" read.',
    automatability: 'auto',
    humanGate: false,
  },
  {
    id: 'outline-lock',
    name: 'Outline Lock',
    description: 'Full beat sheet (Save the Cat / Romancing the Beat); chapter-by-chapter; series arc mapped.',
    appStep: AppStep.Outline,
    qualityGate: 'Outline explicitly locked — nothing drafts without it.',
    automatability: 'human',
    humanGate: true,
  },
  {
    id: 'character-bibles',
    name: 'Character Bibles',
    description: 'Ghost/wound → lie → want vs need → thematic truth; voice sheets; chemistry map.',
    appStep: AppStep.Outline,
    qualityGate: 'Every POV character passes a blind voice read.',
    automatability: 'auto',
    humanGate: false,
  },
  {
    id: 'chapter-drafting',
    name: 'Chapter Drafting',
    description: 'Scene/sequel rhythm; genre POV/tense norms; typed cliffhanger chapter endings.',
    appStep: AppStep.Content,
    qualityGate: 'Reverse-outline matches the locked beat sheet.',
    automatability: 'auto',
    humanGate: false,
  },
  {
    id: 'humanization-pass',
    name: 'Humanization Pass',
    description: 'Scrub AI tells: "not X but Y", signposted transitions, triads, uniform rhythm, moralizing endings.',
    appStep: AppStep.Content,
    qualityGate: 'AI-tell scan clean.',
    automatability: 'auto',
    humanGate: false,
  },
  {
    id: 'continuity-fact-check',
    name: 'Continuity & Fact Check',
    description: 'Series bible (timeline, names, injuries, promises); real-world facts verified.',
    appStep: AppStep.Content,
    qualityGate: 'Zero unresolved continuity flags.',
    automatability: 'auto',
    humanGate: false,
  },
  {
    id: 'editing-ladder',
    name: 'Editing Ladder',
    description: 'Self-revision → developmental → line → copy → proof. Order is load-bearing.',
    appStep: AppStep.Review,
    qualityGate: 'Each rung signed off before the next begins.',
    automatability: 'semi-auto',
    humanGate: false,
  },
  {
    id: 'readability-qa',
    name: 'Readability QA',
    description: 'Style/grammar/pacing report targeted to genre norms (retext, flesch-kincaid).',
    appStep: AppStep.Review,
    qualityGate: 'No red flags vs genre baseline.',
    automatability: 'auto',
    humanGate: false,
  },
  {
    id: 'voice-pass',
    name: 'Voice Pass',
    description: 'Compare new chapters against voice sheets. Voice drift is the #1 series-killer.',
    appStep: AppStep.Review,
    qualityGate: 'Human read-aloud complete.',
    automatability: 'human',
    humanGate: true,
  },
  {
    id: 'packaging',
    name: 'Packaging',
    description: 'Locked title; thumbnail-first cover; blurb for the mobile fold; categories + keywords; pricing.',
    appStep: AppStep.Review,
    qualityGate: 'Postage-stamp test vs category bestsellers.',
    automatability: 'semi-auto',
    humanGate: false,
  },
  {
    id: 'compliance-launch',
    name: 'Compliance & Launch',
    description: 'KDP AI disclosure filed; content-policy check; 90-day launch run.',
    appStep: AppStep.Review,
    qualityGate: 'Human clears compliance + final read-aloud before publish.',
    automatability: 'human',
    humanGate: true,
  },
];

/**
 * Derive per-stage status from measurable app state. Sequential: the first
 * stage whose completion signal is false is "current"; earlier are complete,
 * later are locked.
 */
export function resolvePipelineStatuses(snapshot: PipelineSnapshot): PipelineStageStatus[] {
  const done: boolean[] = [
    snapshot.marketReport, // 1 market-targeting
    snapshot.outline, // 2 premise-hook
    snapshot.outline, // 3 outline-lock (human gate; outline present = locked)
    snapshot.bible, // 4 character-bibles
    snapshot.chaptersDrafted, // 5 chapter-drafting
    snapshot.manuscriptComplete, // 6 humanization-pass
    snapshot.manuscriptComplete && snapshot.bible, // 7 continuity-fact-check
    snapshot.manuscriptComplete, // 8 editing-ladder
    snapshot.inReview, // 9 readability-qa
    snapshot.inReview, // 10 voice-pass (human gate)
    snapshot.coverReady && snapshot.marketingReady, // 11 packaging
    snapshot.automationLaunched, // 12 compliance-launch (human gate)
  ];
  const firstOpen = done.findIndex((d) => !d);
  return done.map((d, i): PipelineStageStatus => {
    if (d) return 'complete';
    return i === firstOpen ? 'current' : 'locked';
  });
}
