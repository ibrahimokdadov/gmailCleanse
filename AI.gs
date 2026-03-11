// ============================================================
// AI.gs — OpenAI integration: smart classification + reply drafter
// ============================================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const ALLOWED_CATEGORIES = Object.keys(CATEGORY_ACTIONS);

// ---- Settings helpers ----

function getOpenAiKey_() {
  return PropertiesService.getUserProperties().getProperty(PROP_OPENAI_KEY) || '';
}

function getOpenAiModel_() {
  return PropertiesService.getUserProperties().getProperty(PROP_OPENAI_MODEL) || DEFAULTS.OPENAI_MODEL;
}

function hasOpenAiKey() {
  return getOpenAiKey_().length > 0;
}

// ---- Save Settings (called from Menu.gs) ----

/**
 * Read Settings sheet values, validate, and persist to UserProperties.
 * The OpenAI key cell is cleared after saving.
 */
function saveSettings() {
  const ui = SpreadsheetApp.getUi();
  const sheet = getSheet_(SHEET_NAMES.SETTINGS);
  if (!sheet) return;

  const getValue = row => sheet.getRange(row, SETTINGS_VALUE_COL).getValue();

  // Read values
  const maxEmails    = parseInt(getValue(SETTINGS_ROW.MAX_EMAILS))  || DEFAULTS.MAX_EMAILS;
  const minAgeDays   = parseInt(getValue(SETTINGS_ROW.MIN_AGE_DAYS)) || DEFAULTS.MIN_AGE_DAYS;
  const openAiKey    = String(getValue(SETTINGS_ROW.OPENAI_KEY) || '').trim();
  const openAiModel  = String(getValue(SETTINGS_ROW.OPENAI_MODEL) || DEFAULTS.OPENAI_MODEL).trim();
  const autoSchedule = String(getValue(SETTINGS_ROW.AUTO_SCHEDULE) || 'OFF').trim();
  const scheduleDay  = String(getValue(SETTINGS_ROW.SCHEDULE_DAY) || DEFAULTS.SCHEDULE_DAY).trim();

  // Validate model
  if (!OPENAI_MODELS.includes(openAiModel)) {
    ui.alert(`Invalid OpenAI model "${openAiModel}". Choose from: ${OPENAI_MODELS.join(', ')}`);
    return;
  }

  // Persist numeric/text settings to UserProperties
  const props = PropertiesService.getUserProperties();
  props.setProperty('max_emails',    String(maxEmails));
  props.setProperty('min_age_days',  String(minAgeDays));
  props.setProperty(PROP_OPENAI_MODEL, openAiModel);

  // Handle OpenAI key
  if (openAiKey) {
    props.setProperty(PROP_OPENAI_KEY, openAiKey);
    // Clear from cell immediately
    sheet.getRange(SETTINGS_ROW.OPENAI_KEY, SETTINGS_VALUE_COL).clearContent();
    // Show AI Drafts sheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aiSheet = ss.getSheetByName(SHEET_NAMES.AI_DRAFTS);
    if (aiSheet) aiSheet.showSheet();
  } else if (!props.getProperty(PROP_OPENAI_KEY)) {
    // No existing key and none entered — hide AI Drafts
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aiSheet = ss.getSheetByName(SHEET_NAMES.AI_DRAFTS);
    if (aiSheet) aiSheet.hideSheet();
  }

  // Handle auto-schedule
  if (autoSchedule === 'ON') {
    enableWeeklySchedule_(scheduleDay);
  } else {
    disableWeeklySchedule_();
  }

  ui.alert('✅ Settings saved!\n\n' +
    (openAiKey ? '🔑 OpenAI key saved securely (removed from cell).\n' : '') +
    `📧 Max emails per run: ${maxEmails}\n` +
    `📅 Auto-delete age: ${minAgeDays} days\n` +
    `🗓️ Auto-schedule: ${autoSchedule}`
  );
}

// ---- AI Classification (fallback for 'unknown' emails) ----

/**
 * Re-classify 'unknown' emails using OpenAI.
 * Modifies the categorized array in place.
 * @param {Array} categorized
 */
function aiClassifyUnknown(categorized) {
  if (!hasOpenAiKey()) return;

  for (let i = 0; i < categorized.length; i++) {
    const email = categorized[i];
    if (email.category !== 'unknown') continue;
    if (!checkAiQuota_()) {
      Logger.log('AI daily quota reached — skipping remaining AI classification');
      break;
    }

    try {
      const category = aiClassifyEmail_(email);
      if (category && ALLOWED_CATEGORIES.includes(category)) {
        categorized[i].category = category;
        categorized[i].action   = CATEGORY_ACTIONS[category] || 'review';
        categorized[i].reason  += '; AI classified as ' + category;
        categorized[i].confidence = 0.75;
      }
      Utilities.sleep(100); // rate limit
    } catch (e) {
      Logger.log('AI classify error: ' + e.message);
    }
  }
}

function aiClassifyEmail_(email) {
  const prompt =
    `You are an email classifier. Classify this email into exactly one of these categories:\n` +
    ALLOWED_CATEGORIES.join(', ') + `\n\n` +
    `From: ${email.from}\n` +
    `Subject: ${email.subject}\n` +
    `Snippet: ${email.snippet}\n\n` +
    `Reply with ONLY the category name, nothing else.`;

  const response = callOpenAi_(prompt, 20);
  return response ? response.trim().toLowerCase() : null;
}

// ---- AI Reply Drafter ----

/**
 * Scan Results for personal/work emails and draft replies in AI Drafts sheet.
 * Called from Menu.gs.
 */
function draftAiReplies() {
  const ui = SpreadsheetApp.getUi();

  if (!hasOpenAiKey()) {
    ui.alert('No OpenAI key found.\n\nGo to  Settings  sheet, enter your API key, and run  Save Settings  first.');
    return;
  }

  const resultsSheet = getSheet_(SHEET_NAMES.RESULTS);
  const draftsSheet  = getSheet_(SHEET_NAMES.AI_DRAFTS);
  if (!resultsSheet || !draftsSheet) return;

  const data = resultsSheet.getDataRange().getValues();
  if (data.length <= 1) {
    ui.alert('No emails to process. Run  Analyze Inbox  first.');
    return;
  }

  const headers     = data[0];
  const idCol       = headers.indexOf('Message ID');
  const fromCol     = headers.indexOf('From');
  const subjectCol  = headers.indexOf('Subject');
  const dateCol     = headers.indexOf('Date');
  const categoryCol = headers.indexOf('Category');

  // Filter to personal + work_related emails
  const targets = data.slice(1).filter(row => {
    const cat = String(row[categoryCol] || '').toLowerCase();
    return cat === 'personal' || cat === 'work_related';
  });

  if (targets.length === 0) {
    ui.alert('No personal or work-related emails found in the Results sheet to draft replies for.');
    return;
  }

  // Clear previous drafts
  const lastRow = draftsSheet.getLastRow();
  if (lastRow > 1) draftsSheet.getRange(2, 1, lastRow - 1, DRAFTS_COL.COUNT).clearContent();

  const draftRows = [];
  let drafted = 0;
  let quotaHit = false;

  for (const row of targets) {
    if (!checkAiQuota_()) { quotaHit = true; break; }

    const messageId = String(row[idCol] || '').trim();
    const from      = String(row[fromCol] || '');
    const subject   = String(row[subjectCol] || '');
    const date      = row[dateCol];

    let snippet = '';
    try {
      const msg = GmailApp.getMessageById(messageId);
      if (msg) snippet = msg.getPlainBody().substring(0, 300);
    } catch (e) {
      Logger.log('Could not fetch message ' + messageId + ': ' + e.message);
    }

    const reply = generateReply_(from, subject, snippet);
    if (reply) {
      draftRows.push([from, subject, date, snippet, reply, 'Skip']);
      drafted++;
    }

    Utilities.sleep(150);
  }

  if (draftRows.length > 0) {
    draftsSheet.getRange(2, 1, draftRows.length, DRAFTS_COL.COUNT).setValues(draftRows);
    draftsSheet.showSheet();
    SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(draftsSheet);
  }

  let msg = `✅ ${drafted} reply drafts generated in the AI Drafts sheet.\n\n` +
    `Review and edit the Suggested Reply column, then mark emails as "Approve" and run  Send Approved Drafts.`;
  if (quotaHit) msg += '\n\n⚠️ Daily AI quota reached — not all emails were processed.';

  ui.alert(msg);
}

function generateReply_(from, subject, snippet) {
  const prompt =
    `You are helping someone reply to an email. Write a short, natural, friendly reply in the first person.\n\n` +
    `From: ${from}\n` +
    `Subject: ${subject}\n` +
    `Email content: ${snippet}\n\n` +
    `Write ONLY the reply body. No greeting line needed (the person will add their own). Keep it under 100 words.`;

  return callOpenAi_(prompt, 200);
}

// ---- Send Approved Drafts ----

/**
 * Create Gmail drafts for all rows marked "Approve" in AI Drafts sheet.
 * Drafts are NOT sent — user reviews in Gmail.
 */
function sendApprovedDrafts() {
  const ui = SpreadsheetApp.getUi();
  const draftsSheet = getSheet_(SHEET_NAMES.AI_DRAFTS);
  if (!draftsSheet) return;

  const data = draftsSheet.getDataRange().getValues();
  if (data.length <= 1) {
    ui.alert('No drafts found. Run  Draft AI Replies  first.');
    return;
  }

  const headers     = data[0];
  const fromCol     = headers.indexOf('From');
  const subjectCol  = headers.indexOf('Subject');
  const replyCol    = headers.indexOf('Suggested Reply');
  const statusCol   = headers.indexOf('Status');

  let created = 0;

  for (let i = 1; i < data.length; i++) {
    const row    = data[i];
    const status = String(row[statusCol] || '').trim();
    if (status.toLowerCase() !== 'approve') continue;

    const to      = extractEmail_(String(row[fromCol]));
    const subject = 'Re: ' + String(row[subjectCol] || '');
    const body    = String(row[replyCol] || '');

    if (!to || !body) continue;

    try {
      GmailApp.createDraft(to, subject, body);
      // Mark as sent
      draftsSheet.getRange(i + 1, statusCol + 1).setValue('Draft created ✓');
      created++;
    } catch (e) {
      Logger.log(`Failed to create draft for ${to}: ${e.message}`);
    }
  }

  ui.alert(
    `✅ ${created} draft${created === 1 ? '' : 's'} created in Gmail!\n\n` +
    `Open Gmail → Drafts to review and send them.`
  );
}

// ---- OpenAI API ----

function callOpenAi_(userMessage, maxTokens) {
  const key   = getOpenAiKey_();
  const model = getOpenAiModel_();

  if (!key) return null;

  const payload = {
    model:      model,
    messages:   [{ role: 'user', content: userMessage }],
    max_tokens: maxTokens,
    temperature: 0.3
  };

  const options = {
    method:      'post',
    contentType: 'application/json',
    headers:     { Authorization: 'Bearer ' + key },
    payload:     JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(OPENAI_API_URL, options);
    const code     = response.getResponseCode();
    const json     = JSON.parse(response.getContentText());

    if (code !== 200) {
      Logger.log('OpenAI error ' + code + ': ' + JSON.stringify(json));
      return null;
    }

    return json.choices[0].message.content;
  } catch (e) {
    Logger.log('OpenAI fetch error: ' + e.message);
    return null;
  }
}

// ---- Quota guard ----

function checkAiQuota_() {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(3000)) return false; // couldn't acquire lock

  try {
    const props     = PropertiesService.getUserProperties();
    const today     = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const key       = PROP_AI_CALLS_PREFIX + today;
    const callCount = parseInt(props.getProperty(key) || '0');

    if (callCount >= PROP_AI_DAILY_LIMIT) return false;

    props.setProperty(key, String(callCount + 1));
    return true;
  } finally {
    lock.releaseLock();
  }
}

// ---- Utility ----

function extractEmail_(fromStr) {
  const match = fromStr.match(/<([^>]+)>/) || fromStr.match(/([^\s]+@[^\s]+)/);
  return match ? match[1] : fromStr.trim();
}
