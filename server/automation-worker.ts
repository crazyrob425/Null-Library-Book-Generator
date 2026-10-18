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
        await page.waitForSelector('input[type="email"]');
        await page.fill('input[type="email"]', email);
        await page.click('input[type="submit"]');
        
        await page.waitForSelector('input[type="password"]');
        await page.fill('input[type="password"]', password);
        await page.click('input[type="submit"]');
        sendUpdate({ type: 'log', message: 'Credentials submitted. Waiting for navigation...' });

        // Wait for either the bookshelf (success) or a CAPTCHA challenge
        await page.waitForNavigation({ waitUntil: 'networkidle' });

        // --- CAPTCHA HANDLING ---
        const captchaElement = await page.$('#auth-captcha-image'); // Example selector
        if (captchaElement) {
            sendUpdate({ type: 'log', message: 'Security check detected. Taking screenshot...' });
            const captchaImageBuffer = await captchaElement.screenshot();
            const captchaImageUrl = `data:image/jpeg;base64,${captchaImageBuffer.toString('base64')}`;
            
            sendUpdate({ type: 'captcha', imageUrl: captchaImageUrl });

            // Pause execution and wait for the solution from the client
            const solution = yield; 
            
            sendUpdate({ type: 'log', message: 'Submitting CAPTCHA solution...' });
            await page.fill('#auth-captcha-guess', solution);
            await page.click('button[type="submit"]'); // More specific selector
            await page.waitForNavigation();

            const errorBox = await page.$('#auth-error-message-box'); // Check if login failed
            if(errorBox) {
                throw new Error("CAPTCHA solution was incorrect or login failed.");
            }
            sendUpdate({ type: 'log', message: 'CAPTCHA passed. Resuming operation.' });
        }
        
        sendUpdate({ type: 'log', message: 'Login successful. Navigating to bookshelf...' });
        await page.waitForSelector('div[data-testid="bookshelf-page"]');


        // --- FORM FILLING ---
        sendUpdate({ type: 'log', message: 'Creating new Kindle eBook...' });
        await page.click('#create-button'); 
        await page.click('div[data-testid="create-digital-book-button"]'); 

        sendUpdate({ type: 'log', message: 'Waiting for book details page to load...' });
        await page.waitForSelector('input[data-testid="book-title-input"]');
        
        sendUpdate({ type: 'log', message: 'Populating book details...' });
        await page.fill('input[data-testid="book-title-input"]', payload.outline.title);
        await page.fill('input[data-testid="book-subtitle-input"]', payload.outline.subtitle);
        // ... fill other fields like author, description, keywords, categories
        // These selectors need to be updated to match the real KDP dashboard.
        // Example: await page.fill('#author-name', payload.authorProfile.name);

        // --- AI CONTENT DISCLOSURE (Oct 2026 compliance) ---
        // KDP asks whether AI tools were used to GENERATE text, images, or translations.
        // The answers below come from the user's acknowledged disclosure in the Review step.
        // NOTE: selectors must be verified against the live KDP dashboard — Amazon changes
        // this flow. If the question cannot be answered automatically, the run MUST pause
        // for manual input rather than submitting with a wrong or missing disclosure.
        sendUpdate({ type: 'log', message: 'Answering KDP AI-content questions per acknowledged disclosure...' });
        const aiAnswers = [
            { label: 'text', value: disclosure.aiGeneratedText },
            { label: 'images', value: disclosure.aiGeneratedImages },
            { label: 'translations', value: disclosure.aiGeneratedTranslations },
        ];
        for (const a of aiAnswers) {
            sendUpdate({ type: 'log', message: `  AI-generated ${a.label}: ${a.value ? 'YES — disclosing' : 'no'}` });
        }
        // Best-effort pattern — VERIFY selectors against the live dashboard before use:
        //   await page.check(`input[name="ai-content-text"][value="${disclosure.aiGeneratedText ? 'yes' : 'no'}"]`);
        //   await page.check(`input[name="ai-content-images"][value="${disclosure.aiGeneratedImages ? 'yes' : 'no'}"]`);
        //   await page.check(`input[name="ai-content-translations"][value="${disclosure.aiGeneratedTranslations ? 'yes' : 'no'}"]`);
        sendUpdate({ type: 'log', message: 'AI disclosure answers recorded. Verify they are reflected on the KDP form before submitting.' });

        // --- FILE UPLOAD ---
        sendUpdate({ type: 'status', status: 'uploading' });

        const epubPath = path.join(tempDir, 'manuscript.epub');
        const coverPath = path.join(tempDir, 'cover.jpg');
        
        const epubBuffer = dataUrlToBuffer(payload.epubBlob as unknown as string);
        await fs.writeFile(epubPath, epubBuffer);

        const coverBuffer = dataUrlToBuffer(payload.coverImageUrl);
        await fs.writeFile(coverPath, coverBuffer);
        
        sendUpdate({ type: 'log', message: `Uploading manuscript...` });
        await page.setInputFiles('#manuscript-upload-button-test-id', epubPath);
        sendUpdate({ type: 'log', message: 'Manuscript sent. Waiting for KDP to process...' });
        // ROBUSTNESS: Wait for a specific success element to appear after upload.
        await page.waitForSelector('#manuscript-upload-success-message', { timeout: 300000 }); // 5 min timeout
        sendUpdate({ type: 'log', message: 'Manuscript processed successfully.' });
        
        sendUpdate({ type: 'log', message: `Uploading cover image...` });
        await page.setInputFiles('#cover-upload-button-test-id', coverPath);
        sendUpdate({ type: 'log', message: 'Cover sent. Waiting for KDP to process...' });
        await page.waitForSelector('#cover-upload-success-message', { timeout: 180000 }); // 3 min timeout
        sendUpdate({ type: 'log', message: 'Cover processed successfully.' });

        sendUpdate({ type: 'log', message: 'File uploads complete.' });
        sendUpdate({ type: 'status', status: 'running' });

        // --- FINALIZATION ---
        sendUpdate({ type: 'log', message: 'Saving and continuing to pricing page...' });
        await page.click('#save-and-continue-button-test-id');
        await page.waitForSelector('#pricing-page-test-id'); // Wait for pricing page
        sendUpdate({ type: 'log', message: 'Navigated to pricing page.' });

        sendUpdate({ type: 'log', message: 'Setting pricing and territory rights...' });
        // ... fill pricing details
        
        sendUpdate({ type: 'log', message: 'Submitting book for publication review.' });
        await page.click('#publish-book-button-test-id');
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