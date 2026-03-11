// ============================================================
// Analyzer.gs — Fetches emails, classifies them, writes Results sheet
// ============================================================

/**
 * Main entry: analyze inbox and populate the Results sheet.
 * Called from Menu.gs.
 */
function analyzeInbox() {
  const ui = SpreadsheetApp.getUi();

  const resultsSheet = getSheet_(SHEET_NAMES.RESULTS);
  if (!resultsSheet) return;

  const config  = loadConfig_();
  const rules   = loadRules();

  setProgress(0, config.maxEmails, 'running', 'Fetching emails from inbox...');

  let emails;
  try {
    emails = fetchEmails_(config, rules);
  } catch (e) {
    setProgress(0, 0, 'error', e.message);
    ui.alert('Failed to fetch emails: ' + e.message);
    return;
  }

  if (emails.length === 0) {
    setProgress(0, 0, 'done', 'No new emails to analyze.');
    ui.alert('No new emails to analyze. Your inbox is clean, or all emails have already been processed.\n\nRun  Gmail Cleaner → Reset Processed Emails  to start fresh.');
    return;
  }

  setProgress(0, emails.length, 'running', 'Classifying ' + emails.length + ' emails...');

  const categorized = classifyEmails_(emails, rules, config);

  writeResultsSheet_(resultsSheet, categorized);
  applyResultsFormatting_(resultsSheet, categorized.length);

  const stats = summarizeActions_(categorized);
  updateDashboard_(stats);

  setProgress(emails.length, emails.length, 'done',
    `Done! ${emails.length} emails analyzed. Review the Results sheet, then run Clean Now.`);

  ui.alert(
    `✅ Analysis complete!\n\n` +
    `📧 Emails analyzed: ${emails.length}\n` +
    `🗑️  To delete: ${stats.delete}\n` +
    `📦 To archive: ${stats.archive}\n` +
    `✅ To keep: ${stats.keep}\n` +
    `👀 Needs review: ${stats.review}\n\n` +
    `Review the Results sheet, change any Action you disagree with, then run  Clean Now.`
  );
}

// ---- Fetch ----

function fetchEmails_(config, rules) {
  const processedLabel = getOrCreateLabel_(PROCESSED_LABEL);
  const query = `in:inbox -label:${PROCESSED_LABEL}`;
  const emails = [];
  const batchSize = 500;
  let allThreads = [];
  let offset = 0;

  while (allThreads.length < config.maxEmails) {
    const remaining = config.maxEmails - allThreads.length;
    const batch = GmailApp.search(query, offset, Math.min(batchSize, remaining));
    if (batch.length === 0) break;
    allThreads = allThreads.concat(batch);
    offset += batch.length;
    if (batch.length < Math.min(batchSize, remaining)) break;
  }

  Logger.log(`Fetched ${allThreads.length} threads`);

  for (const thread of allThreads) {
    const messages = thread.getMessages();
    // Thread action is driven by highest-priority message classification.
    // We collect all messages but will resolve conflicts at classification time.
    for (const message of messages) {
      try {
        const body = message.getPlainBody();
        emails.push({
          id:           message.getId(),
          threadId:     thread.getId(),
          from:         message.getFrom(),
          subject:      message.getSubject(),
          date:         message.getDate(),
          snippet:      body.substring(0, 300),
          isUnread:     message.isUnread(),
          hasUnsubscribe: body.toLowerCase().includes('unsubscribe') ||
                          message.getBody().toLowerCase().includes('unsubscribe'),
          labels:       thread.getLabels().map(l => l.getName())
        });
      } catch (e) {
        Logger.log('Skipping message: ' + e.message);
      }
    }
  }

  return emails;
}

// ---- Classify ----

function classifyEmails_(emails, rules, config) {
  const now = Date.now();
  const minAgeMs = config.minAgeDays * 24 * 60 * 60 * 1000;
  const categorized = [];
  const startTime = Date.now();
  const TIME_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

  for (let i = 0; i < emails.length; i++) {
    // Time guard — stop gracefully before Apps Script kills us
    if (Date.now() - startTime > TIME_LIMIT_MS) {
      Logger.log(`Time limit reached after ${i} emails`);
      break;
    }

    if (i % 50 === 0) {
      setProgress(i, emails.length, 'running', `Classifying email ${i} of ${emails.length}...`);
    }

    const email = emails[i];
    const ageMs = now - email.date.getTime();
    const category = classifyEmail_(email, rules);
    let action = CATEGORY_ACTIONS[category] || 'review';

    // Only delete emails older than the configured age threshold
    if (action === 'delete' && ageMs < minAgeMs) {
      action = 'archive';
    }

    categorized.push({
      ...email,
      category,
      action,
      confidence: calculateConfidence_(email, category),
      reason:     getClassificationReason_(email, category, rules)
    });
  }

  return categorized;
}

function classifyEmail_(email, rules) {
  const from    = email.from.toLowerCase();
  const subject = email.subject.toLowerCase();

  // 1. Whitelist — hard keep
  if (matchesAny_(from, rules.whitelist)) return 'financial'; // mapped to 'keep'

  // 2. Custom delete rules
  if (matchesAny_(from, rules.customDelete)) return 'custom_delete';

  // 3. Financial / security — checked before other sender patterns
  for (const priority of ['financial', 'security_alert']) {
    if (SENDER_PATTERNS[priority] && SENDER_PATTERNS[priority].some(re => re.test(from))) {
      return priority;
    }
  }

  // 4. Remaining sender patterns
  for (const [category, patterns] of Object.entries(SENDER_PATTERNS)) {
    if (['financial', 'security_alert'].includes(category)) continue;
    if (patterns.some(re => re.test(from))) return category;
  }

  // 5. Subject patterns
  for (const [category, patterns] of Object.entries(SUBJECT_PATTERNS)) {
    if (patterns.some(re => re.test(subject))) return category;
  }

  // 6. Unsubscribe link
  if (email.hasUnsubscribe && !isLikelyPersonal_(email)) return 'newsletter';

  // 7. Personal heuristics
  if (isLikelyPersonal_(email)) return 'personal';

  // 8. (AI fallback handled separately in AI.gs after this pass)
  return 'unknown';
}

function isLikelyPersonal_(email) {
  const from    = email.from.toLowerCase();
  const subject = email.subject.toLowerCase();

  const personalScore = [
    /^[a-z]+(\.[a-z]+)?@(?!.*noreply)(?!.*notification)/i.test(from),
    /^(re:|fwd:|hey |hi |hello)/i.test(subject),
    subject.length < 30 && !email.hasUnsubscribe,
    !email.hasUnsubscribe
  ].filter(Boolean).length;

  const automatedScore = [
    /noreply|no-reply|donotreply/i.test(from),
    /notification|alert|update|news|marketing|promo/i.test(from),
    email.hasUnsubscribe
  ].filter(Boolean).length;

  return personalScore > automatedScore;
}

function calculateConfidence_(email, category) {
  let score = 0.5;
  const from    = email.from.toLowerCase();
  const subject = email.subject.toLowerCase();

  if (SENDER_PATTERNS[category] && SENDER_PATTERNS[category].some(re => re.test(from))) score += 0.3;
  if (SUBJECT_PATTERNS[category] && SUBJECT_PATTERNS[category].some(re => re.test(subject))) score += 0.2;
  if (['promotional', 'newsletter'].includes(category) && email.hasUnsubscribe) score += 0.1;

  return Math.min(score, 1.0);
}

function getClassificationReason_(email, category, rules) {
  const reasons = [];
  const from    = email.from.toLowerCase();
  const subject = email.subject.toLowerCase();

  if (matchesAny_(from, rules.whitelist))    reasons.push('Sender is on your whitelist');
  if (matchesAny_(from, rules.customDelete)) reasons.push('Sender matches custom delete rule');

  if (SENDER_PATTERNS[category] && SENDER_PATTERNS[category].some(re => re.test(from))) {
    reasons.push(`Sender matches ${category} pattern`);
  }
  if (SUBJECT_PATTERNS[category] && SUBJECT_PATTERNS[category].some(re => re.test(subject))) {
    reasons.push(`Subject matches ${category} pattern`);
  }
  if (email.hasUnsubscribe && ['promotional', 'newsletter'].includes(category)) {
    reasons.push('Contains unsubscribe link');
  }
  if (reasons.length === 0) {
    reasons.push(category === 'personal' ? 'Appears to be from a real person' : 'Could not confidently categorize');
  }

  return reasons.join('; ');
}

// ---- Write Results sheet ----

function writeResultsSheet_(sheet, categorized) {
  // Clear previous results (keep header row)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, RESULTS_COL.COUNT).clearContent();

  if (categorized.length === 0) return;

  const rows = categorized.map(e => [
    e.id,
    e.from,
    e.subject,
    e.date,
    e.category,
    e.action,
    Math.round(e.confidence * 100) + '%',
    e.reason
  ]);

  sheet.getRange(2, 1, rows.length, RESULTS_COL.COUNT).setValues(rows);
}

function applyResultsFormatting_(sheet, rowCount) {
  if (rowCount === 0) return;

  const actionRange = sheet.getRange(2, RESULTS_COL.ACTION, rowCount, 1);
  const rules = [];

  for (const [action, color] of Object.entries(ACTION_COLORS)) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(action)
        .setBackground(color)
        .setRanges([actionRange])
        .build()
    );
  }

  sheet.setConditionalFormatRules(rules);

  // Auto-resize visible columns
  [RESULTS_COL.FROM, RESULTS_COL.SUBJECT, RESULTS_COL.CATEGORY,
   RESULTS_COL.ACTION, RESULTS_COL.CONFIDENCE].forEach(col => {
    sheet.autoResizeColumn(col);
  });
}

// ---- Helpers ----

function summarizeActions_(categorized) {
  return categorized.reduce((acc, e) => {
    acc[e.action] = (acc[e.action] || 0) + 1;
    acc.total = (acc.total || 0) + 1;
    return acc;
  }, { delete: 0, archive: 0, keep: 0, review: 0, total: 0 });
}

function getOrCreateLabel_(labelName) {
  return GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
}

function loadConfig_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SETTINGS);
  if (!sheet) return { maxEmails: DEFAULTS.MAX_EMAILS, minAgeDays: DEFAULTS.MIN_AGE_DAYS };

  const getValue = row => sheet.getRange(row, SETTINGS_VALUE_COL).getValue();

  const maxEmails  = parseInt(getValue(SETTINGS_ROW.MAX_EMAILS))  || DEFAULTS.MAX_EMAILS;
  const minAgeDays = parseInt(getValue(SETTINGS_ROW.MIN_AGE_DAYS)) || DEFAULTS.MIN_AGE_DAYS;

  return { maxEmails, minAgeDays };
}
