# English OS Dashboard

English OS Dashboard is an AI English Coach for professional learners moving from CEFR B1 toward B2 and beyond. It is not a passive dashboard: the product behaves like a teacher-led learning environment that reads learner context, delivers guided classes, corrects production, and keeps the learner oriented in their current study path.

Version 1 documents the first stable coach experience for the `/coach` app: a focused class/chat interface, mobile-ready learning flow, voice support, media-aware vocabulary practice, downloadable study guides, and production deployment through Vercel.

## Product mission

English OS helps learners improve professional English through:

- teacher-led class delivery;
- guided grammar, vocabulary, speaking, listening, writing, and pronunciation practice;
- learner-context awareness through English OS data;
- clear evaluation gates before progress advances;
- correction of recurring errors;
- practical business and technology communication scenarios;
- mobile-first practice for short, frequent learning sessions.

The coach should feel like an experienced Cambridge-style teacher: it explains, models, asks the learner to produce language, evaluates, corrects, and recommends the next best action.

## Stable v1 capabilities

### AI coach experience

- `/coach` provides the main learner experience.
- The professor message is rendered as a readable class document, not as a raw metadata dump.
- Student messages are compact to preserve space.
- Professor responses include quick action buttons:
  - listen/play;
  - pause or stop speech;
  - restart speech;
  - like/dislike feedback;
  - report an error;
  - copy response.
- “Profesor está pensando” shows animated dots and can be stopped by the learner.

### Class and review modes

- The top status bar keeps the learner oriented with:
  - English OS identity;
  - current mode;
  - active unit/class.
- The left panel shows active objective, study unit, guides, quick helpers, and class materials.
- On mobile, the resource panel starts hidden to prioritize the class conversation.
- The coach distinguishes current position, class mode, review mode, and guide mode.

### Teacher-led pedagogy

Class responses are designed to include:

- learner positioning;
- lesson identification;
- warm-up;
- teacher explanation;
- examples;
- controlled practice;
- vocabulary or useful expressions;
- speaking, listening, writing, or discussion activity;
- evaluation gate.

The implementation explicitly avoids exposing internal retrieval phrases such as placeholders, page anchors, raw contract instructions, or implementation metadata.

### English OS context and progress

- The app loads learner context from English OS APIs when available.
- The initial teacher message includes a short progress snapshot when evidence exists.
- If English OS context is temporarily unavailable, the class is not blocked; the coach explains that it will recover the saved position when the connection returns.
- Study materials follow the active study unit.

### Mobile UX

The v1 mobile experience includes several hardening fixes:

- the sidebar/resources panel is hidden by default on small screens;
- the chat stays within the viewport when the panel is shown or hidden;
- professor action buttons stay above the message and do not overflow horizontally;
- the composer remains compact;
- the microphone and send buttons stay inside the viewport;
- the textarea uses a 16px mobile font to prevent iOS/Safari auto-zoom when the learner focuses the input;
- viewport metadata is explicitly configured for device width.

### Voice and microphone support

- Professor responses can be read aloud using browser speech synthesis.
- Speech controls include play, pause/resume, stop, and restart.
- Dictation is available through browser SpeechRecognition/WebKit SpeechRecognition when supported.
- Dictation inserts recognized text into the textarea and returns focus to the composer so the learner can edit before sending.

### Image-based vocabulary practice

- The composer includes a `+` control for attaching a photo from camera or gallery.
- Images are shown as small in-chat previews so they do not interrupt the class flow.
- Images are prepared client-side for vocabulary-oriented analysis.
- Ephemeral image data is stripped from persisted local conversation history.

### Study guides and materials

- Grammar and vocabulary guide buttons generate study workbooks for the active unit when the required English OS integrations are configured.
- Generated workbooks appear in the side panel with download/open actions.
- Class materials can be loaded on demand to avoid audio/video players expanding the UI unexpectedly.
- Audio/video resource cards are width-contained and mobile-safe.

### Error reporting

- Professor messages include a report button.
- Reporting opens an email draft to `info@citizen-life.com` with the relevant response text so issues can be reviewed.

### Landing page

- The landing page introduces English OS without surfacing curriculum/vendor names.
- Primary calls to action route learners into the coach experience.

## Quality gates

Before considering coach changes complete, run:

```bash
npm run build
npm run test:e2e
```

For pedagogy changes, also validate API/source-contract behavior so class requests remain teacher-led and do not expose implementation metadata.

Current e2e coverage checks include:

- coach page loads;
- two-column desktop shell;
- hidden/visible mobile panel behavior;
- compact user messages;
- mobile-safe professor actions;
- microphone dictation focus and insertion;
- mobile input focus without layout overflow;
- resource players contained within the viewport;
- landing page route to coach;
- MCP endpoint smoke test.

## Local development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3002
```

Open:

```text
http://127.0.0.1:3002/coach
```

If Next.js blocks development resources for `127.0.0.1`, add the host to `allowedDevOrigins` in `next.config.js` and restart the dev server.

## Demo/e2e mode

The Playwright suite uses a demo mode that bypasses real Clerk requests during automated testing:

```bash
$env:E2E_DEMO="1"
$env:NEXT_PUBLIC_E2E_DEMO="1"
$env:NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk"
npm run build
npm run test:e2e
```

## Deployment

Preview deployments are created from non-production branches through Vercel Git integration.

Production is published from `main` through Vercel.

Useful commands:

```bash
npm run build
npm run test:e2e
npx vercel deploy --prod --yes --scope pedro-figueroa-s-projects
```

## Repository workflow

- Work in feature/release branches.
- Do not push directly to `main` unless explicitly authorized.
- Open a PR to `main` with:
  - summary of changes;
  - user-facing features;
  - files changed;
  - validation commands;
  - deployment notes;
  - known risks.
- Merge to `main` only after validation passes.

## Production readiness notes for v1

Version 1 is focused on the coach experience, mobile stability, and teacher-led class flow. High-risk areas to keep guarded with tests:

- mobile layout when focusing the composer;
- microphone dictation and focus retention;
- class responses exposing internal metadata;
- generated guide availability;
- English OS context fallback behavior;
- Clerk/Vercel environment configuration.
