// ============================================================
// Menu.gs — onOpen trigger and all menu action handlers
// ============================================================

/**
 * Runs automatically when the spreadsheet is opened.
 * Attaches the custom Gmail Cleaner menu.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📧 Gmail Cleaner')
    .addItem('🔍 Analyze Inbox',          'menuAnalyzeInbox')
    .addItem('✨ Clean Now',              'menuCleanNow')
    .addSeparator()
    .addItem('🤖 Draft AI Replies',       'menuDraftAiReplies')
    .addItem('📤 Send Approved Drafts',   'menuSendApprovedDrafts')
    .addSeparator()
    .addItem('⚙️ Save Settings',          'menuSaveSettings')
    .addItem('🔁 Reset Processed Emails', 'menuResetProcessed')
    .addItem('📅 Enable Weekly Cleanup',  'menuEnableSchedule')
    .addItem('📅 Disable Auto-Cleanup',   'menuDisableSchedule')
    .addSeparator()
    .addItem('🧪 Test Run (10 emails)',   'menuTestRun')
    .addItem('❓ Help & Instructions',    'menuHelp')
    .addToUi();
}

// ---- Menu handlers ----
// Each handler wraps the real function with progress dialog support.

function menuAnalyzeInbox() {
  clearProgress();
  analyzeInbox();
}

function menuCleanNow() {
  executeCleanup();
}

function menuDraftAiReplies() {
  draftAiReplies();
}

function menuSendApprovedDrafts() {
  sendApprovedDrafts();
}

function menuSaveSettings() {
  saveSettings();
}

function menuResetProcessed() {
  resetProcessedEmails();
}

function menuEnableSchedule() {
  const ui = SpreadsheetApp.getUi();
  const sheet = getSheet_(SHEET_NAMES.SETTINGS);
  if (!sheet) return;

  const day = String(sheet.getRange(SETTINGS_ROW.SCHEDULE_DAY, SETTINGS_VALUE_COL).getValue() || DEFAULTS.SCHEDULE_DAY);
  enableWeeklySchedule_(day);
  ui.alert(`✅ Weekly auto-cleanup enabled every ${day} at 7am.\n\nYou'll receive an email summary after each run.`);
}

function menuDisableSchedule() {
  disableScheduleFromMenu();
}

function menuTestRun() {
  testRun();
}

function menuHelp() {
  SpreadsheetApp.getUi().alert(
    '❓ Gmail Cleaner — Help\n\n' +
    '1. ANALYZE INBOX\n' +
    '   Scans your inbox and categorizes emails into the Results sheet.\n' +
    '   Emails already processed are skipped (tracked by "_CleanerProcessed" label in Gmail).\n\n' +
    '2. CLEAN NOW\n' +
    '   Reads the Results sheet and performs the listed action on each email.\n' +
    '   You can edit any Action cell before running this.\n' +
    '   Deleted emails go to Trash and are recoverable for 30 days.\n\n' +
    '3. THREAD NOTE\n' +
    '   Actions apply to the whole email thread. If a thread has mixed email types,\n' +
    '   the highest-priority action wins (delete > archive > review > keep).\n\n' +
    '4. RULES SHEET\n' +
    '   Add sender domains/emails to "Custom Delete" to always delete them.\n' +
    '   Add senders to "Whitelist" to always keep them (overrides everything).\n\n' +
    '5. AI FEATURES (optional)\n' +
    '   Enter your OpenAI API key in Settings and run Save Settings.\n' +
    '   "Draft AI Replies" generates suggested replies for personal/work emails.\n' +
    '   Replies are created as Gmail Drafts — nothing is sent automatically.\n\n' +
    '6. _CleanerProcessed LABEL\n' +
    '   This label appears in Gmail automatically. It tracks which emails have been\n' +
    '   processed so they are not re-analyzed on the next run. Run "Reset Processed\n' +
    '   Emails" to start fresh.\n\n' +
    'For issues, visit: github.com/[your-username]/gmail-cleaner'
  );
}

