# Gmail Cleaner v2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Gmail Cleaner as a public, zero-code tool driven by a Google Sheet custom menu with optional OpenAI integration.

**Architecture:** Multi-file Google Apps Script. Each .gs file has one responsibility and shares global scope. A one-time `setupGmailCleaner()` call creates the entire Sheet UI; after that, users operate exclusively from the custom menu.

**Tech Stack:** Google Apps Script (GmailApp, SpreadsheetApp, DriveApp, CacheService, LockService, PropertiesService, HtmlService), OpenAI REST API (fetch via UrlFetchApp)

---

## Files to Create
- `Constants.gs` — shared column indices, sheet names, category/action maps
- `Setup.gs` — creates + formats all 5 sheets
- `Menu.gs` — onOpen trigger, all menu item handlers
- `Rules.gs` — reads whitelist + custom delete rules from Rules sheet
- `Analyzer.gs` — fetches emails, classifies them, writes Results sheet
- `Progress.gs` — CacheService-backed progress tracking + HtmlService dialog
- `Cleanup.gs` — reads Results sheet, executes actions in time-aware batches
- `AI.gs` — OpenAI classification fallback + reply drafter
- `Scheduler.gs` — time-driven trigger management
- `Tests.gs` — manual test functions runnable from script editor

## Files to Delete
- `GmailCleaner.gs` — replaced by the above

---

## Chunk 1: Constants + Setup

### Task 1: Constants.gs

- [ ] Create `Constants.gs` with all shared values

### Task 2: Setup.gs

- [ ] Create `Setup.gs` — sheet creation, formatting, sample data
- [ ] Verify by running `setupGmailCleaner()` — all 5 sheets created

### Task 3: Menu.gs skeleton

- [ ] Create `Menu.gs` with `onOpen` and all menu stubs
- [ ] Verify menu appears after reload

---

## Chunk 2: Classification Engine

### Task 4: Rules.gs

- [ ] Create `Rules.gs` — reads whitelist + custom delete from sheet

### Task 5: Analyzer.gs

- [ ] Create `Analyzer.gs` — full classification engine + Results writer
- [ ] Test with `testRun()` on 10 emails

---

## Chunk 3: Cleanup + Progress

### Task 6: Progress.gs

- [ ] Create `Progress.gs` + `progress.html`
- [ ] Test dialog opens and updates

### Task 7: Cleanup.gs

- [ ] Create `Cleanup.gs` — time-aware batching, confirmation dialog
- [ ] Test on Results sheet with mixed actions

---

## Chunk 4: AI + Scheduler

### Task 8: AI.gs

- [ ] Create `AI.gs` — OpenAI classify + reply drafter
- [ ] Test with a valid API key

### Task 9: Scheduler.gs

- [ ] Create `Scheduler.gs` — enable/disable weekly trigger

---

## Chunk 5: Cleanup + Docs

### Task 10: Delete old file + update INSTRUCTIONS.txt

- [ ] Remove `GmailCleaner.gs`
- [ ] Rewrite `INSTRUCTIONS.txt`
