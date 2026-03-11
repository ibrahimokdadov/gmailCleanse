// ============================================================
// Cleanup.gs — Reads Results sheet and executes email actions
//              Time-aware batching to stay within Apps Script limits
// ============================================================

/**
 * Main entry: execute the cleanup based on the Results sheet.
 * Called from Menu.gs.
 */
function executeCleanup() {
  const ui = SpreadsheetApp.getUi();

  const resultsSheet = getSheet_(SHEET_NAMES.RESULTS);
  if (!resultsSheet) return;

  const data = resultsSheet.getDataRange().getValues();
  if (data.length <= 1) {
    ui.alert('No emails to process. Run  Analyze Inbox  first.');
    return;
  }

  // Count actions for confirmation dialog
  const counts = countPendingActions_(data);
  if (counts.total === 0) {
    ui.alert('Nothing to do — all emails are marked "keep" or "review".');
    return;
  }

  // Confirmation dialog
  const response = ui.alert(
    '⚠️ Confirm Cleanup',
    `About to process ${counts.total} emails:\n\n` +
    `🗑️  Delete: ${counts.delete} emails (moved to Trash — recoverable for 30 days)\n` +
    `📦 Archive: ${counts.archive} emails (removed from inbox, not deleted)\n` +
    `✅ Keep / Review: ${counts.keep + counts.review} emails (no action)\n\n` +
    `Continue?`,
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  setProgress(0, counts.total, 'running', 'Starting cleanup...');

  const result = executeBatchCleanup_(data);

  setProgress(result.processed, counts.total, 'done',
    `Done! Deleted ${result.deleted}, archived ${result.archived}.`);

  updateDashboard_({
    total:   result.processed,
    delete:  result.deleted,
    archive: result.archived,
    keep:    result.kept,
    review:  result.reviewed
  });

  let message = `✅ Cleanup complete!\n\n` +
    `🗑️  Deleted: ${result.deleted}\n` +
    `📦 Archived: ${result.archived}\n` +
    `✅ Kept: ${result.kept}\n` +
    `👀 Reviewed: ${result.reviewed}`;

  if (result.skipped > 0) {
    message += `\n\n⏱️ Time limit reached — ${result.skipped} emails were not processed.\n` +
      `Run  Clean Now  again to continue.`;
  }
  if (result.errors > 0) {
    message += `\n\n⚠️ ${result.errors} emails could not be processed (logged to console).`;
  }

  ui.alert(message);
}

// ---- Core batch executor ----

/**
 * Public alias so Scheduler.gs can call this after writing Results sheet.
 */
function executeBatchCleanupFromSheet() {
  const resultsSheet = getSheet_(SHEET_NAMES.RESULTS);
  if (!resultsSheet) return { deleted: 0, archived: 0, kept: 0, reviewed: 0, errors: 0, skipped: 0, processed: 0 };
  const data = resultsSheet.getDataRange().getValues();
  return data.length > 1 ? executeBatchCleanup_(data) : { deleted: 0, archived: 0, kept: 0, reviewed: 0, errors: 0, skipped: 0, processed: 0 };
}

function executeBatchCleanup_(data) {
  const headers   = data[0];
  const actionCol = headers.indexOf('Action');
  const idCol     = headers.indexOf('Message ID');

  const processedLabel = getOrCreateLabel_(PROCESSED_LABEL);
  const startTime = Date.now();
  const TIME_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

  let deleted = 0, archived = 0, kept = 0, reviewed = 0, errors = 0, skipped = 0;
  let processed = 0;

  for (let i = 1; i < data.length; i++) {
    // Time guard
    if (Date.now() - startTime > TIME_LIMIT_MS) {
      skipped = data.length - i;
      Logger.log(`Time limit reached after ${i - 1} emails. ${skipped} skipped.`);
      break;
    }

    if (i % 50 === 0) {
      setProgress(processed, data.length - 1, 'running', `Processing email ${processed} of ${data.length - 1}...`);
    }

    const row       = data[i];
    const messageId = String(row[idCol] || '').trim();
    const action    = String(row[actionCol] || '').trim().toLowerCase();

    if (!messageId) continue;

    try {
      const message = GmailApp.getMessageById(messageId);
      if (!message) { errors++; continue; }

      const thread = message.getThread();

      switch (action) {
        case 'delete':
          thread.moveToTrash();
          deleted++;
          break;
        case 'archive':
          thread.markRead();
          thread.moveToArchive();
          thread.addLabel(processedLabel);
          archived++;
          break;
        case 'keep':
          thread.addLabel(processedLabel);
          kept++;
          break;
        case 'review':
          thread.addLabel(processedLabel);
          reviewed++;
          break;
        default:
          Logger.log(`Unknown action "${action}" for message ${messageId}`);
      }

      processed++;
    } catch (e) {
      Logger.log(`Error on message ${messageId}: ${e.message}`);
      errors++;
    }
  }

  return { processed, deleted, archived, kept, reviewed, errors, skipped };
}

// ---- Helpers ----

function countPendingActions_(data) {
  const headers   = data[0];
  const actionCol = headers.indexOf('Action');

  return data.slice(1).reduce((acc, row) => {
    const action = String(row[actionCol] || '').toLowerCase();
    if (action === 'delete' || action === 'archive' || action === 'keep' || action === 'review') {
      acc[action] = (acc[action] || 0) + 1;
      acc.total++;
    }
    return acc;
  }, { delete: 0, archive: 0, keep: 0, review: 0, total: 0 });
}

/**
 * Reset the _CleanerProcessed label from all threads so the next
 * Analyze run will re-process everything from scratch.
 */
function resetProcessedEmails() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    'Reset Processed Emails',
    'This will remove the "_CleanerProcessed" tracking label from all emails, ' +
    'so your next Analyze run will re-process all inbox emails from scratch.\n\nContinue?',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;

  const label = GmailApp.getUserLabelByName(PROCESSED_LABEL);
  if (!label) {
    ui.alert('Nothing to reset — no emails have been processed yet.');
    return;
  }

  const startTime = Date.now();
  const TIME_LIMIT_MS = 5 * 60 * 1000;
  let removed = 0;

  while (true) {
    if (Date.now() - startTime > TIME_LIMIT_MS) {
      ui.alert(`Reset partially complete. Removed label from ${removed} threads. Run again to continue.`);
      return;
    }
    const batch = label.getThreads(0, 100);
    if (batch.length === 0) break;
    batch.forEach(t => t.removeLabel(label));
    removed += batch.length;
  }

  ui.alert(`✅ Reset complete. Removed tracking label from ${removed} threads.\nNext Analyze run will process your full inbox fresh.`);
}
