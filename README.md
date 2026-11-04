<div align="center">
     <img src="null%20library.png" alt="Null Library" width="400">

<!-- ═══════════════════════════════════════════════════════════════════════════
     N U L L   L I B R A R Y
     The Art of Infinite Production
     A Blacklisted Binary Labs Production
     ═══════════════════════════════════════════════════════════════════════════ -->

</div>

# **NULL LIBRARY**
### **[ THE ALL-IN-ONE PUBLISHING CARTEL ]**

<div align="center">

[![React](https://img.shields.io/badge/React-19-00D8FF?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![AI Core](https://img.shields.io/badge/AI%20Core-Google%20Gemini-FF6F00?style=for-the-badge&logo=google&logoColor=white)](#1-ai-core-google-gemini-bring-your-own-key)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Blacklisted Binary Labs](https://img.shields.io/badge/Blacklisted%20Binary%20Labs-⚡-black?style=for-the-badge)](#credits)

**Research · Write · Illustrate · Design · Publish · Market · Translate · Narrate · Dominate**

*Null Library: The Art of Infinite Production*

[🐛 Report Bug](https://github.com/crazyrob425/KDP-E-Book-Generator/issues) · [💡 Request Feature](https://github.com/crazyrob425/KDP-E-Book-Generator/issues)

</div>

---

**The world is full of books that shouldn't exist. Now, yours can join them.**

Welcome to **Null Library**, a high-octane, full-stack authorship engine engineered by **Rob Branting** at **Blacklisted Binary Labs**. If you've ever wanted to dominate the Amazon Bestseller list without the "minor inconvenience" of spending three years in a dark room drinking lukewarm coffee, you're in the right place.

We've automated the entire literary lifecycle—from the first spark of an idea to the first royalty check you'll definitely use for something responsible (like more server racks or a very fast getaway car).

> *"Any sufficiently advanced publishing pipeline is indistinguishable from a felony."* — Us, just now.

---

## 📋 **TABLE OF CONTENTS**

- [🔫 The "Unfair Advantage" Feature Set](#-the-unfair-advantage-feature-set)
  - [1. AI Core: Google Gemini (Bring Your Own Key)](#1-ai-core-google-gemini-bring-your-own-key)
  - [2. Specialized "Work-Horse" Swarms](#2-specialized-work-horse-swarms)
  - [3. Intelligent Market Reconnaissance](#3-intelligent-market-reconnaissance)
  - [4. The Manuscript Forge](#4-the-manuscript-forge)
  - [5. High-End Visual Contraband](#5-high-end-visual-contraband)
  - [6. The Marketing Money-Launderer (The Hype Hub)](#6-the-marketing-money-launderer-the-hype-hub)
  - [7. Global Distribution & Money Moves](#7-global-distribution--money-moves)
  - [8. Audiobook Synthesis Lab](#8-audiobook-synthesis-lab)
  - [9. The Polyglot Protocol](#9-the-polyglot-protocol)
  - [10. Franchise Mode: The Infinite Series](#10-franchise-mode-the-infinite-series)
  - [11. 15-Library Manuscript Forensics Suite](#11-15-library-manuscript-forensics-suite)
  - [12. RAG-Powered Continuity Enforcement](#12-rag-powered-continuity-enforcement)
  - [13. Batch Production Mode: The Assembly Line](#13-batch-production-mode-the-assembly-line)
  - [14. Desktop-Native Experience](#14-desktop-native-experience)
- [⚙️ The Pipeline — How the Heist Goes Down](#%EF%B8%8F-the-pipeline--how-the-heist-goes-down)
- [🛠️ Technical Stack](#%EF%B8%8F-technical-stack)
- [💾 Installation & Setup](#-installation--setup)
- [🖥️ Runtime Modes](#%EF%B8%8F-runtime-modes)
- [🤝 Contributing](#-contributing)
- [📜 Credits](#-credits)

---

## 🔫 **THE "UNFAIR ADVANTAGE" FEATURE SET**

> Other AI book generators give you a chapter. **Null Library** gives you a publishing empire, a marketing department, a translation bureau, a recording studio, and—if you squint—an alibi.

---

### **1. AI Core: Google Gemini (Bring Your Own Key)**

By default, AI generation in Null Library runs through the **Google Gemini API** with **your own API key** (`VITE_GOOGLE_API_KEY`, from Google AI Studio). Chapter writing can alternatively be routed through a local gateway you run yourself — see *Optional local gateways* below.

* **Text & research** — `gemini-2.5-flash` powers market reports, outlines, chapters, and marketing copy via `services/geminiService.ts`.
* **Literary critique** — the Critic Agent uses `gemini-3-pro-preview` for its deeper read, then rewrites against its own notes.
* **Images** — `gemini-2.5-flash-image` generates covers and chapter illustrations.
* **Local embeddings (no key, no cloud)** — RAG continuity checks run `Xenova/all-MiniLM-L6-v2` in your browser via `@xenova/transformers`. This is the one piece that works with no API key at all, because it runs on your machine.
* **Optional bring-your-own extras** — Tavily (live web research), ElevenLabs, and OpenAI TTS each work only with your own key for that service, and are skipped cleanly without one.
* **Optional local gateways (fully automatic)** — chapter writing (batch, streaming, and the humanize pass) can run through self-hosted gateways instead of Gemini direct. A built-in supervisor sets them up and maintains them on its own — machine detection, best launch method, health checks, restarts, failover, and model choice — and pre-loads FreeLLMAPI with the provider keys the app already holds, so there is nothing to install or configure by hand: [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) stacks providers' published free tiers behind one endpoint with per-key quota tracking and rate-limit failover, and [Portkey Gateway](https://github.com/Portkey-AI/gateway) adds routing, fallbacks, and caching across providers. Choose one in the app's footer **Gateway Routing** settings; structured stages (outlines, market research, marketing) always stay on Gemini, and any gateway failure falls back to Gemini automatically. Docker sidecars: `gateways/` · guide: `docs/GATEWAYS.md`.

---

### **2. Specialized "Work-Horse" Swarms**

We don't just dump a prompt into a box and pray. We deploy **specialized AI task forces** that would make any three-letter agency jealous:

<div align="center">

```
  ┌──────────────────────┐     ┌──────────────────────┐
  │  📕 FICTION SYNDICATE │     │  📘 NON-FICTION TRUST │
  ├──────────────────────┤     ├──────────────────────┤
  │ • Character Architect│     │ • Research Agents    │
  │ • World Builder      │     │ • Fact Verifier      │
  │ • Plot Mastermind    │     │ • Source Citator     │
  │ • Dialogue Smith     │     │ • Technical Writer   │
  │ • Cliffhanger Agent  │     │ • Academic Formatter │
  │ • Continuity Cop     │     │ • Data Synthesizer   │
  └──────────────────────┘     └──────────────────────┘
```

</div>

* 📕 **The Fiction Syndicate** — A dedicated criminal organization of AI agents masterminds character arcs so deep they'll need therapy, "cliffhangers that hurt," and world-building so immersive you'll need a map *(which we also generate)*. Complete with a **Book Bible** system that tracks every character, location, event, and timeline across your entire saga. Your protagonist's eye color will never mysteriously change in chapter 14 again.

* 📘 **The Non-Fiction Brain Trust** — An elite team of research agents that crawl web sources, academic papers, and news feeds—then cite sources, verify facts, identify controversies, and synthesize expert opinions. They write technical papers and research books with the cold, clinical precision of a forensic accountant who's seen things. The kind of things you can't unsee.

---

### **3. Intelligent Market Reconnaissance**

<div align="center">

```
  ┌──────────────────────────────────────────────────┐
  │  🔍  MARKET INTELLIGENCE ENGINE                   │
  │                                                    │
  │  📊 Google Trends ──► Niche Analysis               │
  │  🎯 Audience DNA  ──► Demographics & Pain Points   │
  │  🕵️ Competitor X-Ray ──► Gap Identification        │
  │  💰 Profit Forecast ──► Genre Recommendations      │
  └──────────────────────────────────────────────────┘
```

</div>

Don't write blindly. That's how amateurs end up with 400 pages about competitive yodeling in a saturated market.

* 🎯 **Niche Finder** — AI-powered identification of profitable, low-competition genres. Find the goldmine before the gold rush.
* 📈 **Google Trends Integration** — Real-time trend analysis and visual interest-over-time charts. Know what's hot before it's trending.
* 🕵️ **Competitor Analysis** — AI agents X-ray competing titles, identify their success factors, and find gaps in the market big enough to drive a getaway van through.
* 👥 **Audience Profiling** — Deep-dives into target demographics, interests, pain points, and buying behaviors. Know your reader better than their therapist does.
* 💡 **Smart Suggestions** — Auto-generates genre and topic recommendations with reasoning, so you can make informed decisions (for once).

---

### **4. The Manuscript Forge**

<div align="center">

```
  ╔════════════════════════════════════════════════════════╗
  ║                🔥 MANUSCRIPT FORGE 🔥                  ║
  ╠════════════════════════════════════════════════════════╣
  ║                                                        ║
  ║   IDEA ──► OUTLINE ──► CHAPTERS ──► REVIEW ──► GOLD   ║
  ║     │         │            │           │          │    ║
  ║   Market    Book        Parallel     Critic    Publish ║
  ║   Intel     Bible       Threads      Agent     Ready   ║
  ║                                                        ║
  ╚════════════════════════════════════════════════════════╝
```

</div>

This isn't your grandma's word processor. This is a **content-generation warhead**:

* ⚡ **High-Concurrency Parallel Threading** — Fires API requests across parallel threads to generate full-length books in **minutes, not months**. While other apps generate one chapter at a time like it's 2019, we generate all of them simultaneously because we have places to be.
* 🎬 **Director's Mode** — Give surgical instructions ("Make this scene darker," "Add a plot twist where the butler did it but the butler is a robot") and watch the AI rewrite in real-time. You're the Spielberg of prose.
* 🎓 **The Critic Agent** — A dedicated "Grand Master Scholar" reviews every chapter and delivers literary critique so brutally honest it would make your English professor cry. Then it **rewrites** the chapter to be better. Tough love, but the kind that wins awards.
* 🧹 **Humanization Engine** — 15+ NLP libraries post-process your manuscript to smooth out AI-sounding prose, fix pacing, and make it read like a human wrote it (a really talented human who never sleeps).
* 📝 **Smart Outlining** — AI-generated table of contents with chapter summaries, customizable structure, and automatic Book Bible generation for fiction projects.
* ✏️ **Proofreading Pane** — Built-in proofreading with readability scoring, grammar analysis, and style suggestions before you ship.

---

### **5. High-End Visual Contraband**

A book without a cover is just a PDF with trust issues.

<div align="center">

| Cover Design Studio | Chapter Illustrations | Author Headshots |
| :---: | :---: | :---: |
| ![Cover Lab](https://placehold.co/250x180/0d1117/58a6ff?text=🎨+Cover+Lab) | ![Illustrations](https://placehold.co/250x180/0d1117/58a6ff?text=🖼️+Chapter+Art) | ![Author](https://placehold.co/250x180/0d1117/58a6ff?text=👤+AI+Headshot) |
| *Drag-and-drop FabricJS editor* | *Multiple art styles per chapter* | *Pen-name personas on demand* |

</div>

* 🎨 **Market-Ready Cover Generator** — Designs so professional they look like they were stolen from a boutique New York design firm. (They weren't. Probably.)
* 🖌️ **Full FabricJS Cover Editor** — Drag-and-drop canvas with AI stock photo search, custom typography, layer management, and enough creative control to make Photoshop nervous.
* 🖼️ **Chapter Graphics & Illustrations** — Custom AI-generated artwork for every chapter. Choose from **Cinematic, Anime, Watercolor, Photorealistic**, and more art styles. Maps, diagrams, scene illustrations—all embedded directly into your manuscript.
* 👤 **Author Persona Generator** — Need a pen name? We'll create a complete author identity: professional bio, AI-generated headshot, action photos, social media profiles, and critic reviews so convincing you'll forget the author isn't real. (Please don't use this for crimes that aren't book-related.)

---

### **6. The Marketing Money-Launderer (The Hype Hub)**

<div align="center">

```
  ┌─────────────────────────────────────────────────────┐
  │                 📢 THE HYPE HUB                      │
  │                                                       │
  │   📝 SEO Blog Posts    │  🎬 Video Advertisements     │
  │   📧 Email Sequences   │  📱 TikTok/Reels Scripts     │
  │   📖 Back Cover Blurb  │  🏷️ KDP Keyword Optimizer   │
  │   👤 Author Brand Kit  │  📊 Marketing Analytics      │
  └─────────────────────────────────────────────────────┘
```

</div>

Writing the book is 10% of the battle. Selling it is the other 90%. **Null Library** automates your entire "author brand" with the efficiency of a well-organized pyramid scheme (but, you know, legal):

* 📖 **KDP Metadata Suite** — Auto-generates SEO-optimized titles, subtitles, 7-backend keywords, HTML-formatted descriptions, categories, and back-cover blurbs. Amazon's algorithm will think you're its favorite child.
* 👤 **"I'm a Real Person" Bio Engine** — Generates custom AI-enhanced author personas with professional headshots, action shots, social media links, and marketing CTAs baked right in.
* 🎬 **Ad-Stack Automation** — One-click generation for **TikTok/Reels video ad scripts**, SEO-optimized blog posts, email marketing sequences, and social media content that would make a Fortune 500 marketing team raise an eyebrow.
* 📊 **Smart Packaging** — Zips your manuscript, cover, illustrations, metadata, and a complete "Publishing Guide" into a single ready-to-deploy package. One download. Zero excuses.

---

### **7. Global Distribution & Money Moves**

<div align="center">

```
  ┌──────────────────────────────────────────────────────────┐
  │            🌍  DISTRIBUTION NETWORK  🌍                   │
  │                                                            │
  │   ╔══════════╗  ╔══════════════╗  ╔═══════════════╗       │
  │   ║ Amazon   ║  ║ Draft2Digital║  ║ Apple Books   ║       │
  │   ║ KDP  📦  ║  ║     📚      ║  ║     🍎        ║       │
  │   ╚══════════╝  ╚══════════════╝  ╚═══════════════╝       │
  │   ╔══════════╗  ╔══════════════╗  ╔═══════════════╗       │
  │   ║ B&N      ║  ║ Smashwords   ║  ║ IngramSpark  ║       │
  │   ║ Press 🟢 ║  ║     🌐      ║  ║     🏢        ║       │
  │   ╚══════════╝  ╚══════════════╝  ╚═══════════════╝       │
  │   ╔══════════╗  ╔══════════════╗  ╔═══════════════╗       │
  │   ║ Google   ║  ║  Kobo       ║  ║ OverDrive     ║       │
  │   ║ Play 📱  ║  ║     📖      ║  ║ Libraries 📚  ║       │
  │   ╚══════════╝  ╚══════════════╝  ╚═══════════════╝       │
  └──────────────────────────────────────────────────────────┘
```

</div>

* 📦 **The KDP Hitman** — Auto-formats `.epub` files, generates complete KDP metadata, and deploys a **Playwright-powered automation bot** that physically logs into Amazon KDP and uploads your book for you. Yes, including CAPTCHA handling. We taught a robot to prove it's not a robot. The irony is not lost on us.
* 🌐 **Multi-Platform Auto-Submission** — One-click distribution to **Amazon KDP, Draft2Digital, Apple Books, Barnes & Noble Press, Smashwords, IngramSpark, Google Play Books, Kobo**, and more. Your book hits every marketplace humans trade money for pixels.
* 📚 **Library Distribution** — Reach readers through **OverDrive, Hoopla**, and library networks worldwide. Because even people who don't buy books should be forced to confront your genius.

---

### **8. Audiobook Synthesis Lab**

<div align="center">

```
  ╔═══════════════════════════════════════╗
  ║  🎙️  AUDIOBOOK SYNTHESIS LAB  🎙️     ║
  ╠═══════════════════════════════════════╣
  ║                                       ║
  ║   Text ──► AI Voice ──► Audiobook     ║
  ║                                       ║
  ║   🔊 ElevenLabs HD Voice Cloning     ║
  ║   🔊 OpenAI TTS (6 Voice Profiles)   ║
  ║   🔊 Per-Chapter Voice Selection     ║
  ║   🔊 Real-Time Cost Estimation       ║
  ║   🔊 Preview Before Full Render      ║
  ║                                       ║
  ╚═══════════════════════════════════════╝
```

</div>

Your book, read by a voice so smooth it could talk its way out of a speeding ticket:

* 🎙️ **ElevenLabs Integration** — High-fidelity voice cloning with accent and gender selection. Your audiobook sounds like it was narrated by someone who actually gets paid to talk.
* 🗣️ **OpenAI TTS Support** — Six distinct voice profiles (Alloy, Echo, Fable, Onyx, Nova, Shimmer) for different tones and genres.
* 💰 **Real-Time Cost Estimation** — Know exactly what narration will cost before you commit. No surprise invoices. No awkward conversations with your accountant.
* 🎧 **Chapter-by-Chapter Preview** — Listen before you publish. Because even robots sometimes mispronounce "quinoa."

---

### **9. The Polyglot Protocol**

* 🌍 **Instant Translation Engine** — Translate your book into **40+ languages** with cultural nuance and localized idioms. Your plot twists deserve to be experienced in every time zone.
* 🔄 **One-Click Localization** — From English to Spanish, French, German, Japanese, Mandarin, Arabic, and beyond. Each translation is a new revenue stream. Each revenue stream is a new reason to smile.

---

### **10. Franchise Mode: The Infinite Series**

<div align="center">

```
  📕 Book 1  ──►  📗 Book 2  ──►  📘 Book 3  ──►  📙 Book N
       │              │              │              │
       ▼              ▼              ▼              ▼
  🔀 Spin-off 1  🔀 Spin-off 2  🔀 Spin-off 3  🔀 Spin-off N
       │              │              │              │
       └──────────────┴──────────────┴──────────────┘
                          │
                          ▼
                 🌌 EXTENDED UNIVERSE
```

</div>

Finish Book 1? **Null Library** immediately starts plotting sequels, spin-offs, and "Extended Universe" lore. Before you know it, you haven't just written a book—you've built a **media empire**.

* 📚 **Sequel Generator** — AI analyzes your completed book and auto-generates continuation outlines that respect established characters, plotlines, and world rules.
* 🔀 **Spin-Off Engine** — Explore side characters, alternate timelines, and "What If?" scenarios. Every supporting character is a protagonist waiting for their own series.
* 🔢 **Batch Series Mode** — Define a genre and crank out entire book series (Book 1, 2, 3... N) in a single automated run. Queue up to 10 simultaneous projects and watch the assembly line roll.

---

### **11. 15-Library Manuscript Forensics Suite**

We don't just *write* books. We **dissect** them. Null Library integrates **15 open-source NLP libraries** for real, data-driven manuscript analysis:

<div align="center">

| Analysis | Library | What It Does |
|---|---|---|
| 📊 Readability | `flesch-kincaid` | Grade-level scoring so you know if you're writing for Harvard or kindergarten |
| 💭 Sentiment | `sentiment` (AFINN) | Emotional tone mapping across chapters |
| 🔤 Language Detection | `franc` | Auto-detects 180+ languages in your manuscript |
| ⏱️ Reading Time | `reading-time` | Precise page-turn-rate estimation |
| 🚫 Content Moderation | `bad-words` | Profanity filtering (optional, obviously) |
| 📝 Word Statistics | `word-count` + `syllable` | Deep word/syllable/sentence analytics |
| 🔁 Repetition Detection | `string-similarity` | Catches clichés and repeated phrases |
| ✂️ Sentence Analysis | `compromise` | Paragraph and sentence structure auditing |
| 📖 Markdown Rendering | `marked` + `he` | Clean HTML conversion for all export formats |
| 🔍 Spacing & Grammar | `retext` pipeline | Double-space detection, repeated words, passive voice, and more |

</div>

Your manuscript gets scanned harder than luggage at an international airport. Every weakness is found. Every weakness is fixed.

---

### **12. RAG-Powered Continuity Enforcement**

* 🧠 **Vector Embedding Store** — Every chapter is embedded using `Xenova/all-MiniLM-L6-v2` transformers and stored in a local vector database.
* 🔍 **Semantic Search** — When generating new chapters, the AI queries previous content for relevant context using cosine similarity. No more "wait, didn't we already kill that character?"
* 📖 **Book Bible Enforcement** — Characters, locations, events, and timelines are tracked in a structured Bible that the AI consults before writing every single paragraph. Continuity errors go to prison.

---

### **13. Batch Production Mode: The Assembly Line**

<div align="center">

```
  ╔══════════════════════════════════════════════════╗
  ║         🏭  BATCH PRODUCTION MODE  🏭            ║
  ╠══════════════════════════════════════════════════╣
  ║                                                    ║
  ║   📥 Queue:  [Book 1] [Book 2] ... [Book 10]      ║
  ║                                                    ║
  ║   ⚙️ Status: ████████████░░░░  67% (Book 7/10)    ║
  ║                                                    ║
  ║   📊 Each Book: Research → Outline → Write →       ║
  ║                  Illustrate → Cover → Package      ║
  ║                                                    ║
  ╚══════════════════════════════════════════════════╝
```

</div>

* 📦 **Mass Production** — Queue up to **10 full book projects** and let the factory run unattended. Go touch grass. When you come back, you'll have a library.
* 🎯 **Genre + Page Range Control** — Set your parameters once. The AI handles the rest: market research, outlining, writing, illustrating, cover design, and packaging. Per book. Automatically.
* 📈 **Live Progress Tracking** — Real-time status updates for every book in the queue. Know exactly where each project stands without opening a single file.

---

### **14. Desktop-Native Experience**

* 🖥️ **Electron & Tauri Desktop Apps** — Full native desktop experience with custom window controls, IPC-powered automation, and system-level file access.
* 💾 **Window State Persistence** — Remembers your window size, position, and maximized state across sessions. Monitor-aware, shrink-to-fit, and smart enough to not open off-screen.
* 🗃️ **IndexedDB Storage Engine** — Massive local storage capacity (way beyond the 5MB `localStorage` limit). Your entire project library lives locally, offline-ready, no cloud required.
* 💾 **Auto-Save** — Never lose work again. Your projects are continuously saved as you work.
* 🪟 **NSIS Windows Installer** — Professional branded installer for Windows distribution.

---

## ⚙️ **THE PIPELINE — HOW THE HEIST GOES DOWN**

<div align="center">

```mermaid
graph LR
    A[🔍 Market Recon] --> B[📝 Smart Outline]
    B --> C[⚡ Parallel Writing]
    C --> D[🎓 Critic Review]
    D --> E[🎨 AI Illustration]
    E --> F[🖌️ Cover Design]
    F --> G[📢 Marketing Suite]
    G --> H[🎙️ Audiobook Lab]
    H --> I[🌍 Translation]
    I --> J[📦 Multi-Platform Deploy]
    J --> K[💰 Profit]
    style A fill:#1a1b27,stroke:#58a6ff,stroke-width:2px,color:#fff
    style C fill:#1a1b27,stroke:#58a6ff,stroke-width:2px,color:#fff
    style K fill:#238636,stroke:#2ea043,stroke-width:3px,color:#fff
```

</div>

**From zero to published in one session.** The entire pipeline is automated end-to-end. Each stage feeds into the next. You can intervene at any point with Director's Mode, or you can sit back and let the machines do what machines do best: *everything*.

---

## 🛠️ **TECHNICAL STACK**

<div align="center">

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript 5.8, Tailwind CSS |
| **AI Core** | Google GenAI SDK (Gemini 2.5 Flash / 3.0 Pro) — user's own API key |
| **NLP Suite** | 15 integrated libraries (sentiment, readability, grammar, etc.) |
| **RAG Engine** | Xenova Transformers (all-MiniLM-L6-v2), In-Memory Vector Store |
| **Graphics** | FabricJS (Canvas), Gemini Image Generation |
| **Audio** | ElevenLabs API, OpenAI TTS |
| **Export** | JSZip, epub-gen-memory, jsPDF, DOCX |
| **Automation** | Playwright (KDP Bot), WebSocket Backend |
| **Desktop** | Electron + Tauri (dual runtime support) |
| **State** | IndexedDB (Custom high-capacity wrapper) |
| **Backend** | Node.js, Express, WebSockets |

</div>

---

## 💾 **INSTALLATION & SETUP**

### **Prerequisites**
* **Node.js** 18+ and **npm**
* A mild disregard for the "traditional" publishing industry
* A desire to see your name on a digital spine

### **Quick Start**

```bash
# 1. Clone the operation
git clone https://github.com/crazyrob425/KDP-E-Book-Generator.git
cd KDP-E-Book-Generator

# 2. Install the arsenal
npm install

# 3. Configure your credentials
cp .env.example .env
# Edit .env with your API keys (see below)

# 4. Launch
npm run dev
```

### **Environment Variables**

Create a `.env` file in the project root:

```env
# Required — AI Generation
VITE_GOOGLE_API_KEY=your_google_gemini_api_key_here

# Optional — KDP Automation Bot
KDP_EMAIL=your-kdp-email@example.com
KDP_PASSWORD=your-kdp-password
```

| Variable | Required | Purpose |
|---|---|---|
| `VITE_GOOGLE_API_KEY` | ✅ Yes | Powers all AI generation in the frontend |
| `KDP_EMAIL` | 🔧 Optional | Amazon KDP automation login |
| `KDP_PASSWORD` | 🔧 Optional | Amazon KDP automation login |

### **Build for Production**

```bash
npm run build
```

### **Automation Bot Setup** *(Optional)*

```bash
# Install Playwright browsers for KDP automation
npx playwright install
```

### **Desktop Builds**

```bash
# Distribution-ready desktop package (branding + updater scaffold + installers)
npm run release:package
```

---

## 🖥️ **RUNTIME MODES**

| Mode | Command | Description |
|---|---|---|
| **Web UI** | `npm run dev` | Full authoring workflow in browser |
| **Electron Desktop** | Electron build | Native desktop with IPC automation, custom window controls |
| **Tauri Desktop** | `npm run tauri:dev` | Lightweight Rust-powered desktop runtime |
| **Backend Server** | See `server/README.md` | Standalone WebSocket automation server for remote hosting |

---

## 🔧 **VALIDATION & TROUBLESHOOTING**

```bash
# Frontend build check
npm run build

# Server TypeScript check
npx tsc -p server/tsconfig.json --noEmit
```

| Problem | Fix |
|---|---|
| `vite: not found` | Run `npm install` first |
| Missing API key errors | Ensure `.env` contains `VITE_GOOGLE_API_KEY` |
| Playwright failures | Run `npx playwright install` and set `KDP_EMAIL` / `KDP_PASSWORD` |
| IPC errors in browser | Those features require Electron desktop runtime |
| Backend connectivity | Electron uses IPC; standalone mode needs the WebSocket server running |

---

## 🤝 **CONTRIBUTING**

We accept contributions the way we accept compliments: eagerly and without shame.

1. 🍴 Fork the Project
2. 🌿 Create your Feature Branch (`git checkout -b feature/HeistUpgrade`)
3. 💾 Commit your Changes (`git commit -m 'Add some HeistUpgrade'`)
4. 📤 Push to the Branch (`git push origin feature/HeistUpgrade`)
5. 🎯 Open a Pull Request

All contributions are **greatly appreciated**. Even the ones that are just fixing our typos. *Especially* those.

---

## 📜 **CREDITS**

<div align="center">

```
  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║            ⚡ BLACKLISTED BINARY LABS ⚡                 ║
  ║                                                          ║
  ║         "If you can't be the best writer in             ║
  ║          the room, build a room full of                  ║
  ║          robots that are."                               ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝
```

</div>

**Null Library** is a **Blacklisted Binary Labs** AI-Powered Production.

**Lead Developer & Architect:** <a href="https://github.com/RobBranting">**Rob Branting**</a>

**Slogan:** *Null Library: The Art of Infinite Production*

### 1) Web UI mode
- Run: `npm run dev`
- Supports the core authoring workflow (research, outline, generation, review).
- Electron-specific features (custom window controls, IPC-backed file dialogs, local automation worker bridge) are not guaranteed in plain browser mode.

### 2) Electron desktop mode (primary automation path)
- Frontend + Electron preload/main process integration.
- KDP automation component currently uses Electron IPC as the active transport path.
- Uses handlers defined in `electron/main.ts` and API exposed in `electron/preload.ts`.

### 3) Standalone backend automation mode (optional)
- `server/server.ts` provides a WebSocket backend path for automation workflows.
- Treat this as an optional deployment mode for remote automation hosting scenarios.
- See `server/README.md` for backend setup and deployment details.

### 🤖 Automation Bot Setup (Optional)

To run browser automation reliably:

1. Install dependencies in the root project (`npm install`).
2. Install Playwright browsers:
   ```bash
   npx playwright install
   ```
3. Set:
   - `KDP_EMAIL`
   - `KDP_PASSWORD`

If using the standalone backend mode, follow `/server/README.md`.

## ✅ Validation Commands

- Frontend build:
  ```bash
  npm run build
  ```
- Server TypeScript check:
  ```bash
  npx tsc -p server/tsconfig.json --noEmit
  ```

## 🧩 Windows 11 Installer Wizard Prep (No Compile Yet)

This repository now includes a prepared custom installer scaffold under:

- `installer/windows/KDPEBookGeneratorInstaller.nsi`
- `installer/windows/legal/*`
- `installer/windows/scripts/*`

Support scripts:

```bash
npm run branding:generate
npm run installer:prep
```

Before installer compile, place the official user-provided logo at:

- `assets/branding/logo_source.png`

Then regenerate icon/splash assets:

```bash
npm run branding:generate
```

Compilation is intentionally deferred until explicit approval.

## 🛠️ Troubleshooting

- **`vite: not found`**
  - Run `npm install` first, then rerun `npm run build` or `npm run dev`.

- **Missing API key errors**
  - Ensure `.env` contains `VITE_GOOGLE_API_KEY`.

- **Playwright launch/automation failures**
  - Run `npx playwright install`.
  - Ensure `KDP_EMAIL` and `KDP_PASSWORD` are present in environment.

- **IPC-only feature errors in browser mode**
  - Features relying on `window.electronAPI` require Electron desktop runtime.

- **Backend connectivity mismatch**
  - Electron automation flow uses IPC.
  - Standalone backend flow requires a running WebSocket backend on the expected URL/path.
**Philosophy:** If you can't be the best writer in the room, build a room full of robots that are.

---

## ⚠️ **DISCLAIMER**

> *Blacklisted Binary Labs is not responsible for any sudden fame, fortune, or the existential crisis that occurs when your AI writes better than your third-grade teacher said you ever would. Side effects may include: compulsive publishing, an unreasonable number of pen names, and the persistent feeling that you've gotten away with something. If your book accidentally becomes a bestseller, we expect a thank-you note and a cut of the movie rights.*

*This tool is intended for educational and productivity purposes. Users are responsible for adhering to all marketplace terms of service regarding AI-generated content. Always review AI output before publishing. Or don't. We're a README, not a cop.*

---

<div align="center">

```
  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║     📚🧩  N U L L    L I B R A R Y  🧩📚              ║
  ║                                                          ║
  ║          The Art of Infinite Production                   ║
  ║                                                          ║
  ║          ⚡ Blacklisted Binary Labs ⚡                   ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝
```

**[ READY TO START THE HEIST? CLONE THE REPO. ]**

⭐ **Star this repo** if you believe robots should have literary careers too.

</div>
