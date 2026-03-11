// ============================================================
// Setup.gs — One-time setup: creates and formats all sheets
// Run setupGmailCleaner() once from the script editor.
// ============================================================

/**
 * Entry point. Run this once to set up the entire spreadsheet.
 */
function setupGmailCleaner() {
  try {
    const ss = getOrCreateSpreadsheet_();

    createDashboardSheet_(ss);
    createSettingsSheet_(ss);
    createRulesSheet_(ss);
    createResultsSheet_(ss);
    createAiDraftsSheet_(ss);

    // Remove the default blank sheet if it still exists
    const blank = ss.getSheetByName('Sheet1');
    if (blank) ss.deleteSheet(blank);

    // Hide AI Drafts until an OpenAI key is saved
    const aiSheet = ss.getSheetByName(SHEET_NAMES.AI_DRAFTS);
    if (aiSheet) aiSheet.hideSheet();

    SpreadsheetApp.getUi().alert(
      '✅ Gmail Cleaner is ready!\n\n' +
      'Bookmark this sheet — you won\'t need to return to the script editor.\n\n' +
      'A label called "_CleanerProcessed" will appear in Gmail after your first run. ' +
      'This is normal — it tracks which emails have already been processed.\n\n' +
      'Use the "Gmail Cleaner" menu above to get started.'
    );

    Logger.log('Setup complete. Spreadsheet URL: ' + ss.getUrl());
  } catch (e) {
    SpreadsheetApp.getUi().alert('Setup failed: ' + e.message);
  }
}

// ---- Private helpers ----

function getOrCreateSpreadsheet_() {
  // If the script is bound to a spreadsheet, use it
  try {
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    // Standalone script — create a new spreadsheet
    const ss = SpreadsheetApp.create('Gmail Cleaner');
    Logger.log('Created new spreadsheet: ' + ss.getUrl());
    return ss;
  }
}

function createDashboardSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET_NAMES.DASHBOARD);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.DASHBOARD, 0);
  sheet.clear();
  sheet.setTabColor('#1a73e8');

  // Title
  sheet.getRange('A1').setValue('📧 Gmail Cleaner').setFontSize(24).setFontWeight('bold').setFontColor('#1a73e8');
  sheet.getRange('A2').setValue('Use the  Gmail Cleaner  menu above to analyze and clean your inbox.')
    .setFontSize(12).setFontColor('#5f6368').setFontStyle('italic');

  // Stats header
  sheet.getRange('A4').setValue('Last Run Stats').setFontSize(14).setFontWeight('bold');

  const labels = [
    ['Last run', '—'],
    ['Emails analyzed', '—'],
    ['To delete', '—'],
    ['To archive', '—'],
    ['To keep', '—'],
    ['Needs review', '—']
  ];
  sheet.getRange(5, 1, labels.length, 2).setValues(labels);
  sheet.getRange(5, 1, labels.length, 1).setFontWeight('bold');

  // How to use
  sheet.getRange('A12').setValue('How to use').setFontSize(14).setFontWeight('bold');
  const steps = [
    ['1.', '🔍 Analyze Inbox  — scans your inbox and categorizes emails'],
    ['2.', '📋 Review the Results sheet  — change any Action you disagree with'],
    ['3.', '✨ Clean Now  — executes the cleanup (you\'ll be asked to confirm first)'],
    ['4.', '(Optional) Add an OpenAI key in Settings for smarter AI categorization']
  ];
  sheet.getRange(13, 1, steps.length, 2).setValues(steps);
  sheet.getRange(13, 1, steps.length, 1).setFontColor('#1a73e8').setFontWeight('bold');

  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 500);

  return sheet;
}

function createSettingsSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.SETTINGS);
  sheet.clear();
  sheet.setTabColor('#fbbc04');

  sheet.getRange('A1').setValue('⚙️ Settings').setFontSize(16).setFontWeight('bold');
  sheet.getRange('A1:B1').merge();

  sheet.getRange('B1').clearContent();
  sheet.getRange('C1').setValue('← Edit yellow cells, then run  Gmail Cleaner → Save Settings')
    .setFontStyle('italic').setFontColor('#5f6368');

  const rows = [
    ['Max Emails Per Run',   DEFAULTS.MAX_EMAILS],
    ['Auto-Delete Age (days)', DEFAULTS.MIN_AGE_DAYS],
    ['OpenAI API Key',       ''],
    ['OpenAI Model',         DEFAULTS.OPENAI_MODEL],
    ['Auto-Schedule',        DEFAULTS.AUTO_SCHEDULE],
    ['Schedule Day',         DEFAULTS.SCHEDULE_DAY]
  ];

  const startRow = SETTINGS_ROW.MAX_EMAILS; // = 2
  sheet.getRange(startRow, 1, rows.length, 2).setValues(rows);

  // Labels bold
  sheet.getRange(startRow, 1, rows.length, 1).setFontWeight('bold');

  // Value cells — yellow background
  const valueRange = sheet.getRange(startRow, SETTINGS_VALUE_COL, rows.length, 1);
  valueRange.setBackground('#fff9c4');

  // OpenAI key — hide contents
  sheet.getRange(SETTINGS_ROW.OPENAI_KEY, SETTINGS_VALUE_COL).setNumberFormat('@');

  // Dropdowns
  const modelRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(OPENAI_MODELS, true).setAllowInvalid(false).build();
  sheet.getRange(SETTINGS_ROW.OPENAI_MODEL, SETTINGS_VALUE_COL).setDataValidation(modelRule);

  const scheduleRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['ON', 'OFF'], true).setAllowInvalid(false).build();
  sheet.getRange(SETTINGS_ROW.AUTO_SCHEDULE, SETTINGS_VALUE_COL).setDataValidation(scheduleRule);

  const dayRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(SCHEDULE_DAYS, true).setAllowInvalid(false).build();
  sheet.getRange(SETTINGS_ROW.SCHEDULE_DAY, SETTINGS_VALUE_COL).setDataValidation(dayRule);

  // Notes
  sheet.getRange(SETTINGS_ROW.OPENAI_KEY, 3)
    .setValue('Optional. Enables AI categorization + reply drafting. Key is saved securely and removed from this cell.');
  sheet.getRange(SETTINGS_ROW.AUTO_SCHEDULE, 3)
    .setValue('When ON, runs a full cleanup automatically on the selected day each week.');

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 280);
  sheet.setColumnWidth(3, 420);

  return sheet;
}

function createRulesSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET_NAMES.RULES);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.RULES);
  sheet.clear();
  sheet.setTabColor('#34a853');

  sheet.getRange('A1').setValue('🗑️ Custom Delete Senders')
    .setFontSize(13).setFontWeight('bold').setFontColor('#c0392b');
  sheet.getRange('C1').setValue('✅ Whitelist — Always Keep')
    .setFontSize(13).setFontWeight('bold').setFontColor('#188038');

  // Column B is a visual spacer
  sheet.setColumnWidth(2, 40);
  sheet.setColumnWidth(1, 260);
  sheet.setColumnWidth(3, 260);

  // Example entries (prefixed with # so users know they're examples)
  const deleteExamples = [
    ['# Add sender domains/addresses to always delete'],
    ['# Example: @spam-example.com'],
    ['# Example: deals@somestore.com'],
    [''],
    ['']
  ];
  const whitelistExamples = [
    ['# Add senders to always keep, no matter what'],
    ['# Example: @mybank.com'],
    ['# Example: myboss@company.com'],
    [''],
    ['']
  ];
  sheet.getRange(2, RULES_COL.CUSTOM_DELETE, deleteExamples.length, 1).setValues(deleteExamples)
    .setFontColor('#9aa0a6').setFontStyle('italic');
  sheet.getRange(2, RULES_COL.WHITELIST, whitelistExamples.length, 1).setValues(whitelistExamples)
    .setFontColor('#9aa0a6').setFontStyle('italic');

  return sheet;
}

function createResultsSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET_NAMES.RESULTS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.RESULTS);
  sheet.clear();
  sheet.setTabColor('#ea4335');

  const headers = ['Message ID', 'From', 'Subject', 'Date', 'Category', 'Action', 'Confidence', 'Reason'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#e8eaed');

  // Hide Message ID column (needed for execution but not user-facing)
  sheet.hideColumns(RESULTS_COL.MESSAGE_ID);

  // Action column dropdown
  const actionRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['delete', 'archive', 'keep', 'review'], true)
    .setAllowInvalid(false).build();
  sheet.getRange(2, RESULTS_COL.ACTION, 1000, 1).setDataValidation(actionRule);

  // Freeze header row
  sheet.setFrozenRows(1);

  sheet.setColumnWidth(RESULTS_COL.FROM,       220);
  sheet.setColumnWidth(RESULTS_COL.SUBJECT,    300);
  sheet.setColumnWidth(RESULTS_COL.DATE,       120);
  sheet.setColumnWidth(RESULTS_COL.CATEGORY,   160);
  sheet.setColumnWidth(RESULTS_COL.ACTION,     90);
  sheet.setColumnWidth(RESULTS_COL.CONFIDENCE, 90);
  sheet.setColumnWidth(RESULTS_COL.REASON,     300);

  return sheet;
}

function createAiDraftsSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET_NAMES.AI_DRAFTS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.AI_DRAFTS);
  sheet.clear();
  sheet.setTabColor('#9334e6');

  const headers = ['From', 'Subject', 'Date', 'Email Snippet', 'Suggested Reply', 'Status'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#e8d5fb');

  // Status dropdown
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Approve', 'Skip'], true).setAllowInvalid(false).build();
  sheet.getRange(2, DRAFTS_COL.STATUS, 1000, 1).setDataValidation(statusRule);

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(DRAFTS_COL.FROM,    200);
  sheet.setColumnWidth(DRAFTS_COL.SUBJECT, 250);
  sheet.setColumnWidth(DRAFTS_COL.DATE,    110);
  sheet.setColumnWidth(DRAFTS_COL.SNIPPET, 300);
  sheet.setColumnWidth(DRAFTS_COL.REPLY,   400);
  sheet.setColumnWidth(DRAFTS_COL.STATUS,  90);

  return sheet;
}

// ---- Utility used by other files ----

/**
 * Get a sheet by name. Shows a user-friendly error if missing.
 * @param {string} name
 * @return {GoogleAppsScript.Spreadsheet.Sheet|null}
 */
function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    SpreadsheetApp.getUi().alert(
      `Sheet "${name}" not found.\n\nPlease run  Gmail Cleaner → Help & Instructions  or re-run setupGmailCleaner() from the script editor.`
    );
    return null;
  }
  return sheet;
}

/**
 * Update a single stat on the Dashboard sheet.
 * @param {string} label
 * @param {string|number} value
 */
function updateDashboardStat_(label, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DASHBOARD);
  if (!sheet) return;

  const data = sheet.getRange(5, 1, 10, 2).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === label) {
      sheet.getRange(5 + i, 2).setValue(value);
      return;
    }
  }
}

/**
 * Update all Dashboard stats after a run.
 */
function updateDashboard_(stats) {
  updateDashboardStat_('Last run', new Date().toLocaleString());
  updateDashboardStat_('Emails analyzed', stats.total || 0);
  updateDashboardStat_('To delete',  stats.delete  || 0);
  updateDashboardStat_('To archive', stats.archive || 0);
  updateDashboardStat_('To keep',    stats.keep    || 0);
  updateDashboardStat_('Needs review', stats.review || 0);
}
