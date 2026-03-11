// ============================================================
// Progress.gs — CacheService-backed progress + HtmlService dialog
// ============================================================

/**
 * Write current progress to CacheService so the dialog can poll it.
 * @param {number} processed - emails processed so far
 * @param {number} total     - total emails to process
 * @param {string} status    - 'running' | 'done' | 'error'
 * @param {string} [message] - optional status message
 */
function setProgress(processed, total, status, message) {
  const cache = CacheService.getUserCache();
  cache.put(CACHE_KEY_PROGRESS, JSON.stringify({
    processed: processed,
    total:     total,
    status:    status,
    message:   message || ''
  }), 600); // expires in 10 min
}

/**
 * Read current progress from CacheService.
 * Called by the HtmlService dialog via google.script.run.
 * @return {Object} progress object
 */
function getProgress() {
  const cache = CacheService.getUserCache();
  const raw = cache.get(CACHE_KEY_PROGRESS);
  if (!raw) return { processed: 0, total: 0, status: 'running', message: '' };
  return JSON.parse(raw);
}

/**
 * Clear progress cache.
 */
function clearProgress() {
  CacheService.getUserCache().remove(CACHE_KEY_PROGRESS);
}

/**
 * Show a progress dialog modal.
 * The dialog polls getProgress() every 2 seconds and closes itself when status === 'done'.
 * @param {string} title - dialog title
 */
function showProgressDialog(title) {
  const html = HtmlService.createHtmlOutput(getProgressHtml(title))
    .setWidth(380)
    .setHeight(160);
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

/**
 * Generate the HTML for the progress dialog.
 */
function getProgressHtml(title) {
  return `<!DOCTYPE html>
<html>
<head>
<style>
  body {
    font-family: Google Sans, Arial, sans-serif;
    margin: 0;
    padding: 20px;
    background: #fff;
    color: #202124;
  }
  .title { font-size: 16px; font-weight: 500; margin-bottom: 16px; }
  .bar-wrap {
    background: #e8eaed;
    border-radius: 4px;
    height: 8px;
    overflow: hidden;
    margin-bottom: 12px;
  }
  .bar {
    background: #1a73e8;
    height: 100%;
    width: 0%;
    transition: width 0.4s ease;
    border-radius: 4px;
  }
  .status { font-size: 13px; color: #5f6368; }
  .done   { color: #188038; font-weight: 500; }
</style>
</head>
<body>
<div class="title">${title}</div>
<div class="bar-wrap"><div class="bar" id="bar"></div></div>
<div class="status" id="status">Starting...</div>

<script>
function poll() {
  google.script.run
    .withSuccessHandler(function(data) {
      var pct = data.total > 0 ? Math.round(data.processed / data.total * 100) : 0;
      document.getElementById('bar').style.width = pct + '%';

      if (data.status === 'done') {
        document.getElementById('status').className = 'status done';
        document.getElementById('status').textContent =
          data.message || 'Done! ' + data.processed + ' emails processed.';
        setTimeout(function() { google.script.host.close(); }, 1500);
      } else if (data.status === 'error') {
        document.getElementById('status').textContent = 'Error: ' + data.message;
      } else {
        document.getElementById('status').textContent =
          data.message || ('Processing ' + data.processed + ' of ' + data.total + ' emails...');
        setTimeout(poll, 2000);
      }
    })
    .withFailureHandler(function(err) {
      document.getElementById('status').textContent = 'Could not get progress.';
      setTimeout(poll, 3000);
    })
    .getProgress();
}
poll();
</script>
</body>
</html>`;
}
