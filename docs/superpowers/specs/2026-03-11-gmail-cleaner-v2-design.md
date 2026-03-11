# Gmail Cleaner v2 — Design Spec
**Date:** 2026-03-11
**Status:** Approved (post-review)

---

## Problem

The v1 tool requires users to open script.google.com, select functions from a dropdown, and manually edit a spreadsheet. This is too technical for general public use. The AI categorization is regex-only with no customization without editing code.

## Goal

A zero-code Gmail cleanup tool anyone can use. Install once, then operate entirely from a Google Sheet with a custom menu. Optional OpenAI integration for smarter categorization and AI-drafted replies to important emails.

---

## User Journey

1. User visits the GitHub repo → follows a one-time setup (copy script, run `setupGmailCleaner`)
2. A Google Sheet is auto-created with all tabs, formatting, and sample rules
3. From then on: open the Sheet → use the **"Gmail Cleaner"** custom menu
4. Optionally add an OpenAI key in Settings for AI features

---

## File Structure

```
GmailCleaner/
├── Setup.gs         # First-run wizard — creates all sheets, formats them
├── Menu.gs          # onOpen hook, all menu definitions and action dispatch
├── Analyzer.gs      # Email fetching, regex classification, confidence scoring
├── Rules.gs         # Reads sender patterns and whitelist from the Rules sheet
├── Cleanup.gs       # Executes delete/archive/keep — time-aware batching
├── AI.gs            # OpenAI integration: smart classify + reply drafting
├── Scheduler.gs     # Time-driven trigger management (auto-schedule)
├── Progress.gs      # HtmlService progress dialogs with CacheService polling
└── INSTRUCTIONS.txt # Updated quick-start guide
```

---

## Sheets Layout

### 1. Dashboard
- Header: "Gmail Cleaner" title + last run timestamp
- Stats section (auto-populated after each run):
  - Total inbox emails analyzed
  - Emails to delete / archive / keep / review
  - Breakdown by category
- Instructions panel: directs users to the Gmail Cleaner menu (not drawings/buttons — see Note below)
- Status bar: last run info, any errors

> **Note on Buttons:** Google Sheets drawing-linked buttons are fragile (break on copy/redeploy). The Dashboard uses a static instructions panel pointing users to the custom menu instead. This is more reliable for a public tool.

### 2. Settings
User-editable cells (yellow background = editable). A "Save Settings" menu item reads these values and writes them to `PropertiesService.getUserProperties()`.

| Setting | Default | Type | Description |
|---|---|---|---|
| Max Emails Per Run | 500 | Number | Cap per analysis run to avoid timeout |
| Auto-Delete Age (days) | 30 | Number | Only delete emails older than this |
| OpenAI API Key | (blank) | Text | Cleared from cell on Save; stored in UserProperties |
| OpenAI Model | gpt-4o-mini | Dropdown | Fixed list: gpt-4o-mini, gpt-4o, gpt-3.5-turbo |
| Auto-Schedule | OFF | Dropdown | ON/OFF |
| Schedule Day | Sunday | Dropdown | Day of week |

**API Key security note:** After "Save Settings" the key is removed from the cell. However, Google Sheets stores revision history — do not share this spreadsheet with others. The sheet is private to your Google account by default.

**OAuth scope disclosure:** This tool requests full Gmail access (`https://mail.google.com/`) to read, move, and create draft emails. Google will show a warning screen during authorization — this is expected. No data is sent to any third party except OpenAI (when a key is configured). See Security section.

### 3. Rules
Two tables side by side with a blank column B as a visual separator.

**Column A — Custom Delete Senders:**
- Header row: "Custom Delete Senders"
- Each row = a partial email/domain to always delete (e.g., `@spam.com`, `deals@`)
- Pre-filled with commented examples
- User adds rows freely

**Column C — Whitelist (Always Keep):**
- Header row: "Whitelist — Always Keep"
- Each row = a sender to protect regardless of any other rule
- Pre-filled with commented examples (e.g., `@mybank.com`)

**Priority:** Whitelist always wins over Custom Delete. If a sender appears in both, it is kept. This is intentional — the Whitelist is a hard override.

### 4. Results
Populated after "Analyze Inbox". Columns:
- Message ID (col A, hidden — used for execution)
- From
- Subject
- Date
- Category
- **Action** (editable — dropdown: delete / archive / keep / review)
- Confidence %
- Reason

Color-coded conditional formatting: red=delete, yellow=archive, green=keep, blue=review.

User edits the Action column freely before running "Clean Now".

**Thread-level action note:** Actions are applied at the thread level (Gmail's unit of operation). If a thread contains messages with mixed classifications, the **highest-priority action wins**: delete > archive > review > keep. The Reason column shows which message drove the decision. This is disclosed to the user in the Help menu.

### 5. AI Drafts
Hidden by default. Shown automatically when a valid OpenAI key is saved via "Save Settings" (`sheet.showSheet()`). Hidden again when the key is cleared (`sheet.hideSheet()`).

Columns:
- From
- Subject
- Date
- Email Snippet (first 300 chars)
- **Suggested Reply** (editable)
- **Status** (dropdown: Approve / Skip)

"Send Approved Drafts" menu action creates Gmail **drafts** for all rows marked Approve. Drafts are NOT auto-sent — user reviews and sends from Gmail's Drafts folder.

---

## Classification Engine (Analyzer.gs + Rules.gs)

### Priority order (first match wins):
1. **Whitelist** (Rules sheet col C) → `keep`
2. **Custom Delete** (Rules sheet col A) → `delete`
3. **Financial / security** hardcoded sender patterns → `keep`
4. **Sender pattern matching** (hardcoded regex by category)
5. **Subject pattern matching** (hardcoded regex by category)
6. **Unsubscribe link detection** → `newsletter`
7. **Personal heuristics** (name-like address, short subject, no unsubscribe) → `personal`
8. **AI classification** (if OpenAI key set) — only for emails still `unknown` after steps 1–7
9. Fallback → `unknown` → `review`

### Categories and default actions:
| Category | Default Action |
|---|---|
| calendar_notification | delete |
| google_ads | delete |
| promotional | delete |
| social_notification | delete |
| custom_delete | delete |
| newsletter | archive |
| automated_notification | archive |
| shipping_tracking | archive |
| security_alert | keep |
| financial | keep |
| personal | keep |
| work_related | review |
| unknown | review |

---

## AI Integration (AI.gs)

### Setup
- API key entered in Settings sheet
- "Save Settings" writes key to `PropertiesService.getUserProperties()` and clears the cell
- AI Drafts sheet shown/hidden by `sheet.showSheet()` / `sheet.hideSheet()` called from Save Settings
- OpenAI model validated against a fixed allowlist — invalid values rejected with a dialog before saving

### Feature 1: Smart Classification
- Called only for `unknown` emails (after all regex/heuristic steps fail)
- Sends to OpenAI: From address, Subject, first 300 chars of plain body
- System prompt instructs GPT to return one category name from the allowed list
- Falls back to `unknown` on API error (error logged to Results "Reason" column)

### Feature 2: AI Reply Drafter
- Scans Results for `personal` and `work_related` emails
- Filters to threads where the authenticated user has NOT sent a reply (checks thread message count and sender)
- Sends to OpenAI: From, Subject, first 300 chars of plain body
- System prompt: "Draft a short, friendly reply to this email in the first person."
- Populates AI Drafts sheet

**Data privacy:** Only From address, Subject line, and a 300-character snippet are sent to OpenAI. Full email body is never transmitted.

### Rate limiting & quota
- 100ms delay between OpenAI API calls
- Call count tracked in `UserProperties` with date key (e.g., `ai_calls_2026-03-11`)
- Before each call: read count, check against limit (default 100/day), increment using `LockService.getUserLock()` to prevent race conditions between concurrent runs
- If daily limit reached: stops AI features, shows dialog with count and reset date

---

## Execution Time Management

Google Apps Script has a **6-minute hard execution limit** (30 minutes for Workspace accounts).

### Analyzer.gs
- Default cap: 500 emails per run (configurable in Settings)
- Checks `Date.now()` every 50 emails; if elapsed > 5 minutes, stops and notifies user: "Processed X emails. Run Analyze again to continue."
- The `_CleanerProcessed` label ensures the next run picks up where this one left off

### Cleanup.gs
- Processes in batches of 50 threads per iteration
- Checks elapsed time every batch; stops gracefully if > 5 minutes
- Shows a completion dialog: "Cleaned X emails. Y emails remain — run Clean Now again to continue."
- This means large inboxes require multiple "Clean Now" runs — this is surfaced clearly in the UI

---

## Progress Dialogs (Progress.gs)

Uses `HtmlService` to show a modal during long operations. Architecture:

1. Main processing function (`analyzeInbox`, `executeCleanup`) writes progress to `CacheService.getUserCache()` every 50 emails: `{ processed: N, total: M, status: "running" }`
2. The HTML dialog polls `google.script.run.getProgress()` every 2 seconds
3. `getProgress()` reads from CacheService and returns the current value
4. When processing completes, status is set to `"done"` and the dialog closes itself

This is the correct pattern for Apps Script progress UIs — the server cannot push to the client, so the client polls.

---

## Confirmation Dialog (Cleanup.gs)

Before "Clean Now" executes, shows a modal:
> "About to delete **X** emails, archive **Y** emails, and keep **Z** emails. Continue?"

With Cancel and Confirm buttons. Only proceeds on Confirm.

---

## Menu Structure

```
Gmail Cleaner
├── 🔍 Analyze Inbox
├── ✨ Clean Now
├── ─────────────────────
├── 🤖 Draft AI Replies
├── 📤 Send Approved Drafts
├── ─────────────────────
├── ⚙️ Save Settings
├── 🔁 Reset Processed Emails
├── 📅 Enable Weekly Auto-Cleanup
├── 📅 Disable Auto-Cleanup
├── ─────────────────────
├── 🧪 Test Run (10 emails)
└── ❓ Help & Instructions
```

---

## Setup Flow (Setup.gs)

Triggered by running `setupGmailCleaner()` once from script editor:

1. Creates the Google Sheet with all 5 tabs (Dashboard, Settings, Rules, Results, AI Drafts)
2. Applies formatting: headers, colors, column widths, dropdowns, conditional formatting on Results
3. Hides AI Drafts sheet (shown later when key is saved)
4. Populates sample/example rules in the Rules sheet (commented out with instructions)
5. Sets default values in Settings sheet
6. Shows a completion dialog:
   > "Setup complete! Bookmark this sheet. You'll never need to return to the script editor.
   > Note: A label called `_CleanerProcessed` will appear in Gmail — this is normal and is used to track which emails have been processed."
7. Logs the sheet URL to the execution log

---

## Scheduler (Scheduler.gs)

- "Enable Weekly Auto-Cleanup": creates `ScriptApp.newTrigger('autoCleanup').timeBased().onWeekDay(...)` using the day from Settings
- `autoCleanup()`: runs analyze + cleanup silently, then emails user a summary via `GmailApp.sendEmail(Session.getActiveUser().getEmail(), "Gmail Cleaner — Weekly Summary", body)`
- On error: catches exception and emails error details to user (never fails silently)
- "Disable Auto-Cleanup": deletes all triggers for `autoCleanup`

---

## Error Handling

- All main functions wrapped in try/catch
- User-facing errors shown via `SpreadsheetApp.getUi().alert()` with plain-English message
- Gmail API errors: logged to Results "Reason" column, execution continues
- OpenAI API errors: shown in dialog with raw error message for debugging
- Missing sheets detected at start of each operation — prompts user to re-run Setup

---

## Security

| Concern | Resolution |
|---|---|
| OpenAI API key | Stored in UserProperties (per-user, not in sheet). Cell cleared after Save. |
| Revision history | Key briefly visible in sheet history. Mitigated by: do not share this spreadsheet. |
| Gmail OAuth scope | `https://mail.google.com/` required. Disclosed in setup dialog and README. |
| Data sent to OpenAI | From address, Subject, 300-char snippet only. Never full body. Applies to both Classification and Reply Drafter features. |
| Deleted emails | Go to Trash — recoverable for 30 days. |
| Sheet sharing | Sheet is private by default. README explicitly warns not to share it. |

---

## Out of Scope (v2)

- Google Workspace Marketplace listing
- Multi-account support
- Mobile UI
- Attachment handling
- Analyzing Promotions/Spam tabs (inbox only)
- Auto-sending AI replies (drafts only — user always reviews)

---

## Success Criteria

1. A non-technical user can complete setup and run a full cleanup in under 5 minutes
2. Zero visits to script.google.com after initial setup
3. AI features work end-to-end with a valid OpenAI key
4. Tool handles 500-email batches without hitting Apps Script time limits
5. Custom rules and whitelist in the sheet are respected without any code changes
6. All destructive actions (delete/archive) require explicit user confirmation
