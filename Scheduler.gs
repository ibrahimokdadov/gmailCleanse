// ============================================================
// Scheduler.gs — Weekly auto-cleanup trigger management
// ============================================================

const TRIGGER_FUNCTION = 'autoCleanup';

/**
 * Enable a weekly time-driven trigger.
 * Called from saveSettings() in AI.gs.
 * @param {string} dayName e.g. 'Sunday'
 */
function enableWeeklySchedule_(dayName) {
  disableWeeklySchedule_(); // remove any existing trigger first

  const dayMap = {
    Sunday:    ScriptApp.WeekDay.SUNDAY,
    Monday:    ScriptApp.WeekDay.MONDAY,
    Tuesday:   ScriptApp.WeekDay.TUESDAY,
    Wednesday: ScriptApp.WeekDay.WEDNESDAY,
    Thursday:  ScriptApp.WeekDay.THURSDAY,
    Friday:    ScriptApp.WeekDay.FRIDAY,
    Saturday:  ScriptApp.WeekDay.SATURDAY
  };

  const day = dayMap[dayName] || ScriptApp.WeekDay.SUNDAY;

  ScriptApp.newTrigger(TRIGGER_FUNCTION)
    .timeBased()
    .onWeekDay(day)
    .atHour(7) // 7am in script timezone
    .create();

  Logger.log('Weekly auto-cleanup scheduled for ' + dayName);
}

/**
 * Remove all triggers for autoCleanup.
 */
function disableWeeklySchedule_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === TRIGGER_FUNCTION)
    .forEach(t => ScriptApp.deleteTrigger(t));
}

/**
 * Disable schedule from the menu (user-facing wrapper).
 */
function disableScheduleFromMenu() {
  disableWeeklySchedule_();
  SpreadsheetApp.getUi().alert('✅ Auto-cleanup schedule disabled.');
}

/**
 * Time-driven trigger function: runs full analyze + cleanup silently,
 * then emails the user a summary. Errors are always emailed — never silent.
 */
function autoCleanup() {
  const userEmail = Session.getActiveUser().getEmail();

  try {
    const config = loadConfig_();
    const rules  = loadRules();

    setProgress(0, config.maxEmails, 'running', 'Auto-cleanup started...');

    const emails      = fetchEmails_(config, rules);
    const categorized = classifyEmails_(emails, rules, config);

    const resultsSheet = getSheet_(SHEET_NAMES.RESULTS);
    if (resultsSheet) {
      writeResultsSheet_(resultsSheet, categorized);
      applyResultsFormatting_(resultsSheet, categorized.length);
    }

    const result = executeBatchCleanupFromSheet();

    const stats = summarizeActions_(categorized);
    updateDashboard_(stats);

    setProgress(emails.length, emails.length, 'done', 'Auto-cleanup complete.');

    // Email summary to user
    const subject = '📧 Gmail Cleaner — Weekly Summary';
    const body =
      `Your weekly Gmail cleanup ran successfully.\n\n` +
      `📧 Emails analyzed: ${emails.length}\n` +
      `🗑️  Deleted: ${result.deleted}\n` +
      `📦 Archived: ${result.archived}\n` +
      `✅ Kept: ${result.kept}\n` +
      `👀 Needs review: ${result.reviewed}\n` +
      (result.errors  > 0 ? `⚠️  Errors: ${result.errors}\n`  : '') +
      (result.skipped > 0 ? `⏱️  Skipped (time limit): ${result.skipped} — run Clean Now to finish\n` : '') +
      `\nOpen your Gmail Cleaner sheet to review the results.`;

    GmailApp.sendEmail(userEmail, subject, body);

  } catch (e) {
    // Always notify on error
    try {
      GmailApp.sendEmail(
        userEmail,
        '⚠️ Gmail Cleaner — Auto-cleanup Error',
        `Your weekly Gmail cleanup encountered an error:\n\n${e.message}\n\nStack:\n${e.stack || 'N/A'}`
      );
    } catch (emailErr) {
      Logger.log('Failed to send error email: ' + emailErr.message);
    }
    Logger.log('autoCleanup error: ' + e.message);
  }
}
