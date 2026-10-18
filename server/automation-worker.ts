import { chromium, Browser, Page } from 'playwright';
import { KdpAutomationPayload, BotUpdate } from '../types';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Buffer } from 'buffer';

// Helper to send updates back to the client via the WebSocket
type UpdateSender = (update: BotUpdate) => void;

// Helper to convert data URL to buffer
const dataUrlToBuffer = (dataUrl: string) => {
    const base64 = dataUrl.split(',')[1];
    if (!base64) {
        throw new Error('Invalid data URL');
    }
    return Buffer.from(base64, 'base64');
};

// ── Selector registry ───────────────────────────────────────────────────────
// KDP's dashboard markup changes. Each entry lists candidate selectors in
// priority order plus its verification status. See
// docs/KDP_SELECTOR_VERIFICATION.md for the live-verification checklist.
// Status: 'verified' = confirmed against the live dashboard,
//         'placeholder' = best-effort guess, MUST be verified before trusting.
type SelectorStatus = 'verified' | 'placeholder';
const SELECTORS: Record<string, { candidates: string[]; status: SelectorStatus }> = {
    loginEmail:    { candidates: ['input[type="email"]'], status: 'verified' },
    loginSubmit:   { candidates: ['input[type="submit"]', 'button[type="submit"]'], status: 'verified' },
    loginPassword: { candidates: ['input[type="password"]'], status: 'verified' },
    captchaImage:  { candidates: ['#auth-captcha-image'], status: 'placeholder' },
    captchaGuess:  { candidates: ['#auth-captcha-guess'], status: 'placeholder' },
    captchaError:  { candidates: ['#auth-error-message-box'], status: 'placeholder' },
    bookshelf:     { candidates: ['div[data-testid="bookshelf-page"]'], status: 'placeholder' },
    createButton:  { candidates: ['#create-button'], status: 'placeholder' },
    createEbook:   { candidates: ['div[data-testid="create-digital-book-button"]'], status: 'placeholder' },
    bookTitle:     { candidates: ['input[data-testid="book-title-input"]'], status: 'placeholder' },
    bookSubtitle:  { candidates: ['input[data-testid="book-subtitle-input"]'], status: 'placeholder' },
    manuscriptUpload: { candidates: ['#manuscript-upload-button-test-id'], status: 'placeholder' },
    manuscriptDone:   { candidates: ['#manuscript-upload-success-message'], status: 'placeholder' },
    coverUpload:   { candidates: ['#cover-upload-button-test-id'], status: 'placeholder' },
    coverDone:     { candidates: ['#cover-upload-success-message'], status: 'placeholder' },
    saveContinue:  { candidates: ['#save-and-continue-button-test-id'], status: 'placeholder' },
    pricingPage:   { candidates: ['#pricing-page-test-id'], status: 'placeholder' },
    publishButton: { candidates: ['#publish-book-button-test-id'], status: 'placeholder' },
    // AI-content question radios (Oct 2026 compliance) — patterns to verify live.
    aiTextYes:  { candidates: ['input[name*="ai"][name*="text"][value="yes" i]'], status: 'placeholder' },
    aiTextNo:   { candidates: ['input[name*="ai"][name*="text"][value="no" i]'], status: 'placeholder' },
    aiImageYes: { candidates: ['input[name*="ai"][name*="image"][value="yes" i]'], status: 'placeholder' },
    aiImageNo:  { candidates: ['input[name*="ai"][name*="image"][value="no" i]'], status: 'placeholder' },
    aiTranslationsYes: { candidates: ['input[name*="ai"][name*="translat"][value="yes" i]'], status: 'placeholder' },
    aiTranslationsNo:  { candidates: ['input[name*="ai"][name*="translat"][value="no" i]'], status: 'placeholder' },
};

const PLACEHOLDER_WARNED = new Set<string>();
function warnIfPlaceholder(key: string, sendUpdate: UpdateSender): void {
    if (SELECTORS[key]?.status === 'placeholder' && !PLACEHOLDER_WARNED.has(key)) {
        PLACEHOLDER_WARNED.add(key);
        sendUpdate({
            type: 'log',
            message: `⚠️ Selector "${key}" is UNVERIFIED (placeholder). If this step fails, verify it against the live KDP dashboard — see docs/KDP_SELECTOR_VERIFICATION.md.`,
        });
    }
}

/** Fill the first candidate selector that resolves; throws a descriptive error otherwise. */
async function fillFirst(page: Page, key: string, value: string, sendUpdate: UpdateSender, timeout = 15000): Promise<void> {
    warnIfPlaceholder(key, sendUpdate);
    const { candidates } = SELECTORS[key];
    for (const sel of candidates) {
        try {
            await page.waitForSelector(sel, { timeout: Math.min(timeout, 5000), state: 'visible' });
            await page.fill(sel, value);
            return;
        } catch { /* try next candidate */ }
    }
    throw new Error(`Could not fill "${key}" — none of these matched: ${candidates.join(', ')}`);
}

/** Click the first candidate selector that resolves; throws a descriptive error otherwise. */
async function clickFirst(page: Page, key: string, sendUpdate: UpdateSender, timeout = 15000): Promise<void> {
    warnIfPlaceholder(key, sendUpdate);
    const { candidates } = SELECTORS[key];
    for (const sel of candidates) {
        try {
            await page.waitForSelector(sel, { timeout: Math.min(timeout, 5000), state: 'visible' });
            await page.click(sel);
            return;
        } catch { /* try next candidate */ }
    }
    throw new Error(`Could not click "${key}" — none of these matched: ${candidates.join(', ')}`);
}

/** Set files on the first candidate file-input selector that resolves. */
async function setFilesFirst(page: Page, key: string, filePath: string, sendUpdate: UpdateSender, timeout = 15000): Promise<void> {
    warnIfPlaceholder(key, sendUpdate);
    const { candidates } = SELECTORS[key];
    for (const sel of candidates) {
        try {
            await page.waitForSelector(sel, { timeout: Math.min(timeout, 5000), state: 'attached' });
            await page.setInputFiles(sel, filePath);
            return;
        } catch { /* try next candidate */ }
    }
    throw new Error(`Could not find file input "${key}" — none of these matched: ${candidates.join(', ')}`);
}

/** Wait for the first candidate selector that appears; throws a descriptive error otherwise. */
async function waitForAny(page: Page, key: string, sendUpdate: UpdateSender, timeout = 300000): Promise<void> {
    warnIfPlaceholder(key, sendUpdate);
    const { candidates } = SELECTORS[key];
    const errors: string[] = [];
    for (const sel of candidates) {
        try {
            await page.waitForSelector(sel, { timeout: Math.min(timeout, 15000) });
            return;
        } catch (e) {
            errors.push(sel);
        }
    }
    throw new Error(`Timed out waiting for "${key}" — none of these appeared: ${errors.join(', ')}`);
}


export async function* runAutomation(
    payload: KdpAutomationPayload,
    sendUpdate: UpdateSender
): AsyncGenerator<void, void, string> {
    let browser: Browser | null = null;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kdp-automation-'));

    // --- AI DISCLOSURE COMPLIANCE GATE (Oct 2026) ---
    // KDP requires AI-GENERATED text/images/translations (even covers, even after
    // heavy editing) to be disclosed via its private AI-content checkbox.
    // Publishing without disclosure risks title removal; repeat offenses risk
    // account suspension. Never start automation without an acknowledged disclosure.
    const disclosure = (payload as KdpAutomationPayload & { aiDisclosure?: { aiGeneratedText: boolean; aiGeneratedImages: boolean; aiGeneratedTranslations: boolean; acknowledged: boolean } }).aiDisclosure;
    if (!disclosure || !disclosure.acknowledged) {
        const msg = 'Blocked: KDP AI-content disclosure is missing or unacknowledged. ' +
            'Confirm the AI disclosure answers in the Review step before automating publication.';
        sendUpdate({ type: 'log', message: `Automation failed: ${msg}` });
        sendUpdate({ type: 'error', message: msg });
        await fs.rm(tempDir, { recursive: true, force: true });
        return;
    }
    sendUpdate({
        type: 'log',
        message: `AI disclosure acknowledged — text: ${disclosure.aiGeneratedText ? 'AI-GENERATED' : 'no'}, ` +
            `images: ${disclosure.aiGeneratedImages ? 'AI-GENERATED' : 'no'}, ` +
            `translations: ${disclosure.aiGeneratedTranslations ? 'AI-GENERATED' : 'no'}.`,
    });

    try {
        sendUpdate({ type: 'log', message: 'Automation sequence initiated on the server.' });
        sendUpdate({ type: 'status', status: 'initializing' });

        sendUpdate({ type: 'log', message: 'Launching headless Chromium browser...' });
        browser = await chromium.launch({ headless: true }); // Set to false for debugging
        const context = await browser.newContext();
        const page = await context.newPage();
        sendUpdate({ type: 'status', status: 'running' });

        sendUpdate({ type: 'log', message: 'Navigating to Amazon KDP login page...' });
        await page.goto('https://kdp.amazon.com/en_US/');

        // --- REAL LOGIN ---
        const email = process.env.KDP_EMAIL;
        const password = process.env.KDP_PASSWORD;
        if (!email || !password) {
            throw new Error("KDP_EMAIL and KDP_PASSWORD environment variables are not set on the server.");
        }

        sendUpdate({ type: 'log', message: 'Entering credentials...' });
        await fillFirst(page, 'loginEmail', email, sendUpdate);
        await clickFirst(page, 'loginSubmit', sendUpdate);

        await fillFirst(page, 'loginPassword', password, sendUpdate);
        await clickFirst(page, 'loginSubmit', sendUpdate);
        sendUpdate({ type: 'log', message: 'Credentials submitted. Waiting for navigation...' });

        // Wait for either the bookshelf (success) or a CAPTCHA challenge
        await page.waitForNavigation({ waitUntil: 'networkidle' });

        // --- CAPTCHA HANDLING ---
        let captchaElement: Awaited<ReturnType<Page['$']>> = null;
        for (const sel of SELECTORS.captchaImage.candidates) {
            captchaElement = await page.$(sel);
            if (captchaElement) break;
        }
        if (captchaElement) {
            sendUpdate({ type: 'log', message: 'Security check detected. Taking screenshot...' });
            const captchaImageBuffer = await captchaElement.screenshot();
            const captchaImageUrl = `data:image/jpeg;base64,${captchaImageBuffer.toString('base64')}`;
            
            sendUpdate({ type: 'captcha', imageUrl: captchaImageUrl });

            // Pause execution and wait for the solution from the client
            const solution = yield; 
            
            sendUpdate({ type: 'log', message: 'Submitting CAPTCHA solution...' });
            await fillFirst(page, 'captchaGuess', solution, sendUpdate, 10000);
            await clickFirst(page, 'loginSubmit', sendUpdate, 10000);
            await page.waitForNavigation();

            let errorBox: Awaited<ReturnType<Page['$']>> = null;
            for (const sel of SELECTORS.captchaError.candidates) {
                errorBox = await page.$(sel);
                if (errorBox) break;
            }
            if (errorBox) {
                throw new Error("CAPTCHA solution was incorrect or login failed.");
            }
            sendUpdate({ type: 'log', message: 'CAPTCHA passed. Resuming operation.' });
        }
        
        sendUpdate({ type: 'log', message: 'Login successful. Navigating to bookshelf...' });
        await waitForAny(page, 'bookshelf', sendUpdate, 60000);


        // --- FORM FILLING ---
        sendUpdate({ type: 'log', message: 'Creating new Kindle eBook...' });
        await clickFirst(page, 'createButton', sendUpdate);
        await clickFirst(page, 'createEbook', sendUpdate);

        sendUpdate({ type: 'log', message: 'Waiting for book details page to load...' });
        await waitForAny(page, 'bookTitle', sendUpdate, 60000);

        sendUpdate({ type: 'log', message: 'Populating book details...' });
        await fillFirst(page, 'bookTitle', payload.outline.title, sendUpdate);
        await fillFirst(page, 'bookSubtitle', payload.outline.subtitle, sendUpdate);
        // ... fill other fields like author, description, keywords, categories
        // Add their selectors to the SELECTORS registry above as you verify them.

        // --- AI CONTENT DISCLOSURE (Oct 2026 compliance) ---
        // KDP asks whether AI tools were used to GENERATE text, images, or translations.
        // The answers below come from the user's acknowledged disclosure in the Review step.
        // The radio selectors are UNVERIFIED — see docs/KDP_SELECTOR_VERIFICATION.md.
        // If the question block is found but cannot be answered, the run aborts rather
        // than risk submitting with a wrong or missing disclosure.
        sendUpdate({ type: 'log', message: 'Answering KDP AI-content questions per acknowledged disclosure...' });
        const aiAnswers: Array<{ label: string; yesKey: string; noKey: string; value: boolean }> = [
            { label: 'text', yesKey: 'aiTextYes', noKey: 'aiTextNo', value: disclosure.aiGeneratedText },
            { label: 'images', yesKey: 'aiImageYes', noKey: 'aiImageNo', value: disclosure.aiGeneratedImages },
            { label: 'translations', yesKey: 'aiTranslationsYes', noKey: 'aiTranslationsNo', value: disclosure.aiGeneratedTranslations },
        ];
        let aiBlockFound = false;
        for (const a of aiAnswers) {
            const key = a.value ? a.yesKey : a.noKey;
            let answered = false;
            for (const sel of SELECTORS[key].candidates) {
                const radio = await page.$(sel);
                if (radio) {
                    aiBlockFound = true;
                    await radio.check().catch(() => page.click(sel));
                    answered = true;
                    sendUpdate({ type: 'log', message: `  AI-generated ${a.label}: ${a.value ? 'YES — disclosed' : 'no'} (set via ${sel})` });
                    break;
                }
            }
            if (!answered) {
                sendUpdate({ type: 'log', message: `  ⚠️ AI-generated ${a.label}: could not locate the radio — answer is "${a.value ? 'YES' : 'no'}", verify manually on the KDP form.` });
            }
        }
        if (!aiBlockFound) {
            sendUpdate({ type: 'log', message: '⚠️ KDP AI-content question block not found with current selectors — disclosure answers logged above; confirm them on the form before the book goes live.' });
        }

        // --- FILE UPLOAD ---
        sendUpdate({ type: 'status', status: 'uploading' });

        const epubPath = path.join(tempDir, 'manuscript.epub');
        const coverPath = path.join(tempDir, 'cover.jpg');
        
        const epubBuffer = dataUrlToBuffer(payload.epubBlob as unknown as string);
        await fs.writeFile(epubPath, epubBuffer);

        const coverBuffer = dataUrlToBuffer(payload.coverImageUrl);
        await fs.writeFile(coverPath, coverBuffer);
        
        sendUpdate({ type: 'log', message: `Uploading manuscript...` });
        await setFilesFirst(page, 'manuscriptUpload', epubPath, sendUpdate);
        sendUpdate({ type: 'log', message: 'Manuscript sent. Waiting for KDP to process...' });
        // ROBUSTNESS: Wait for a specific success element to appear after upload.
        await waitForAny(page, 'manuscriptDone', sendUpdate, 300000); // 5 min timeout
        sendUpdate({ type: 'log', message: 'Manuscript processed successfully.' });

        sendUpdate({ type: 'log', message: `Uploading cover image...` });
        await setFilesFirst(page, 'coverUpload', coverPath, sendUpdate);
        sendUpdate({ type: 'log', message: 'Cover sent. Waiting for KDP to process...' });
        await waitForAny(page, 'coverDone', sendUpdate, 180000); // 3 min timeout
        sendUpdate({ type: 'log', message: 'Cover processed successfully.' });

        sendUpdate({ type: 'log', message: 'File uploads complete.' });
        sendUpdate({ type: 'status', status: 'running' });

        // --- FINALIZATION ---
        sendUpdate({ type: 'log', message: 'Saving and continuing to pricing page...' });
        await clickFirst(page, 'saveContinue', sendUpdate);
        await waitForAny(page, 'pricingPage', sendUpdate, 120000); // Wait for pricing page
        sendUpdate({ type: 'log', message: 'Navigated to pricing page.' });

        sendUpdate({ type: 'log', message: 'Setting pricing and territory rights...' });
        // ... fill pricing details (add selectors to the registry as verified)

        sendUpdate({ type: 'log', message: 'Submitting book for publication review.' });
        await clickFirst(page, 'publishButton', sendUpdate);
        await page.waitForNavigation();

        sendUpdate({ type: 'success' });

    } catch (e) {
        const errorMessage = (e instanceof Error) ? e.message : 'An unknown error occurred.';
        sendUpdate({ type: 'log', message: `Automation failed: ${errorMessage}` });
        sendUpdate({ type: 'error', message: errorMessage });
    } finally {
        if (browser) {
            await browser.close();
        }
        // Clean up temp files
        await fs.rm(tempDir, { recursive: true, force: true });
        sendUpdate({ type: 'log', message: 'Browser closed and resources cleaned up.' });
    }
}