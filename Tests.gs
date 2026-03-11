// ============================================================
// Tests.gs — Manual test functions. Run from the script editor.
// ============================================================

/**
 * Quick test: classify 10 inbox emails and log results.
 * Select this function in the dropdown and click Run.
 */
function testRun() {
  const ui = SpreadsheetApp.getUi();
  Logger.log('=== Test Run (10 emails) ===');

  const rules = loadRules();
  const query = `in:inbox -label:${PROCESSED_LABEL}`;
  const threads = GmailApp.search(query, 0, 10);

  if (threads.length === 0) {
    ui.alert('No unprocessed inbox emails found to test with.\n\nRun  Reset Processed Emails  first if needed.');
    return;
  }

  const lines = [];

  for (const thread of threads) {
    const msg = thread.getMessages()[0];
    const body = msg.getPlainBody();
    const email = {
      id:            msg.getId(),
      from:          msg.getFrom(),
      subject:       msg.getSubject(),
      date:          msg.getDate(),
      snippet:       body.substring(0, 300),
      isUnread:      msg.isUnread(),
      hasUnsubscribe: body.toLowerCase().includes('unsubscribe')
    };

    const category = classifyEmail_(email, rules);
    const action   = CATEGORY_ACTIONS[category] || 'review';
    const conf     = Math.round(calculateConfidence_(email, category) * 100);

    Logger.log(`From: ${email.from.substring(0, 50)}`);
    Logger.log(`Subject: ${email.subject.substring(0, 60)}`);
    Logger.log(`→ Category: ${category} | Action: ${action} | Confidence: ${conf}%`);
    Logger.log('---');

    lines.push(`${email.from.substring(0, 40)}\n→ ${category} (${action}, ${conf}%)`);
  }

  ui.alert(
    `🧪 Test Run Results (${threads.length} emails)\n\n` +
    lines.join('\n\n') +
    '\n\nFull details are in the Execution Log (View → Logs).'
  );
}

/**
 * Test that loadRules() correctly reads from the Rules sheet.
 * Log output appears in View → Logs.
 */
function testLoadRules() {
  const rules = loadRules();
  Logger.log('Custom Delete rules: ' + rules.customDelete.length);
  Logger.log('Whitelist rules: ' + rules.whitelist.length);
  rules.customDelete.forEach(r => Logger.log('  delete: ' + r));
  rules.whitelist.forEach(r => Logger.log('  whitelist: ' + r));
  Logger.log('testLoadRules: PASS');
}

/**
 * Test that loadConfig_() returns valid settings.
 */
function testLoadConfig() {
  const config = loadConfig_();
  Logger.log('maxEmails: ' + config.maxEmails);
  Logger.log('minAgeDays: ' + config.minAgeDays);

  const passed = config.maxEmails > 0 && config.minAgeDays > 0;
  Logger.log('testLoadConfig: ' + (passed ? 'PASS' : 'FAIL'));
}

/**
 * Test OpenAI connectivity (requires a saved API key).
 */
function testOpenAiConnection() {
  if (!hasOpenAiKey()) {
    Logger.log('No OpenAI key saved. Save one via Settings first.');
    return;
  }

  const result = callOpenAi_('Reply with just the word "ok".', 5);
  Logger.log('OpenAI response: ' + result);
  Logger.log('testOpenAiConnection: ' + (result ? 'PASS' : 'FAIL'));
}

/**
 * Test that all sheets exist.
 */
function testSheetsExist() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let allGood = true;

  for (const name of Object.values(SHEET_NAMES)) {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      Logger.log('✅ Sheet exists: ' + name);
    } else if (name === SHEET_NAMES.AI_DRAFTS) {
      Logger.log('ℹ️  AI Drafts sheet hidden (expected if no OpenAI key)');
    } else {
      Logger.log('❌ Missing sheet: ' + name);
      allGood = false;
    }
  }

  Logger.log('testSheetsExist: ' + (allGood ? 'PASS' : 'FAIL — run setupGmailCleaner()'));
}
