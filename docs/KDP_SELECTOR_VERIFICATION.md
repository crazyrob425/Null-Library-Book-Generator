# KDP Selector Verification Checklist

The automation worker (`server/automation-worker.ts`) drives the KDP dashboard
with Playwright. Every interactable element lives in the `SELECTORS` registry
at the top of that file, tagged `verified` or `placeholder`.

**Rule: a `placeholder` selector must be confirmed against the live KDP
dashboard before any unattended run trusts it.** The worker logs a warning the
first time each placeholder selector is used.

## How to verify

1. Run the worker with the browser visible (`headless: false` in
   `chromium.launch`) and stop after login, or drive the flow manually to the
   step you are verifying.
2. Open DevTools on the KDP page and test each candidate selector with
   `document.querySelector('<selector>')`.
3. For the winner, confirm it is the *right* element (correct label, correct
   form section) — not just *an* element.
4. Update `SELECTORS` in `automation-worker.ts`: move the winning selector to
   the front of `candidates` and flip `status` to `'verified'`.
5. Check the box below and note the date.

## Selectors

### Login (verified)
- [x] `loginEmail` — `input[type="email"]`
- [x] `loginSubmit` — `input[type="submit"]`, `button[type="submit"]`
- [x] `loginPassword` — `input[type="password"]`

### CAPTCHA
- [ ] `captchaImage` — `#auth-captcha-image` (placeholder)
- [ ] `captchaGuess` — `#auth-captcha-guess` (placeholder)
- [ ] `captchaError` — `#auth-error-message-box` (placeholder)

### Bookshelf → new ebook
- [ ] `bookshelf` — `div[data-testid="bookshelf-page"]` (placeholder)
- [ ] `createButton` — `#create-button` (placeholder)
- [ ] `createEbook` — `div[data-testid="create-digital-book-button"]` (placeholder)

### Book details
- [ ] `bookTitle` — `input[data-testid="book-title-input"]` (placeholder)
- [ ] `bookSubtitle` — `input[data-testid="book-subtitle-input"]` (placeholder)
- [ ] Author / description / keywords / categories fields — **not yet in the registry**;
      add candidates here as they are verified.

### AI-content disclosure (Oct 2026 compliance — load-bearing)
KDP asks whether AI tools were used to GENERATE text, images, or translations.
Wrong or missing answers risk title removal / account suspension.
- [ ] `aiTextYes` / `aiTextNo` (placeholder)
- [ ] `aiImageYes` / `aiImageNo` (placeholder)
- [ ] `aiTranslationsYes` / `aiTranslationsNo` (placeholder)

Until these are verified, the worker logs each answer and warns loudly when the
radio block cannot be found. Do not treat a silent run as a disclosed run.

### Uploads
- [ ] `manuscriptUpload` — `#manuscript-upload-button-test-id` (placeholder)
- [ ] `manuscriptDone` — `#manuscript-upload-success-message` (placeholder)
- [ ] `coverUpload` — `#cover-upload-button-test-id` (placeholder)
- [ ] `coverDone` — `#cover-upload-success-message` (placeholder)

### Pricing & publish
- [ ] `saveContinue` — `#save-and-continue-button-test-id` (placeholder)
- [ ] `pricingPage` — `#pricing-page-test-id` (placeholder)
- [ ] `publishButton` — `#publish-book-button-test-id` (placeholder)
- [ ] Pricing / territory-rights fields — **not yet in the registry**;
      the worker currently skips them (pre-existing gap).

## Notes
- Amazon changes this dashboard without notice. Re-verify after any KDP UI update.
- The compliance gate in `runAutomation` (unacknowledged AI disclosure blocks the
  run) is selector-independent and always enforced.
