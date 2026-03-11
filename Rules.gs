// ============================================================
// Rules.gs — Reads custom delete rules + whitelist from the Rules sheet
// ============================================================

/**
 * Load all user-defined rules from the Rules sheet.
 * Returns compiled RegExp arrays for fast matching.
 *
 * @return {{ customDelete: RegExp[], whitelist: RegExp[] }}
 */
function loadRules() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.RULES);
  if (!sheet) return { customDelete: [], whitelist: [] };

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

  const customDelete = [];
  const whitelist    = [];

  for (const row of data) {
    const deleteVal    = String(row[RULES_COL.CUSTOM_DELETE - 1] || '').trim();
    const whitelistVal = String(row[RULES_COL.WHITELIST    - 1] || '').trim();

    if (deleteVal && !deleteVal.startsWith('#')) {
      customDelete.push(patternToRegex_(deleteVal));
    }
    if (whitelistVal && !whitelistVal.startsWith('#')) {
      whitelist.push(patternToRegex_(whitelistVal));
    }
  }

  return { customDelete, whitelist };
}

/**
 * Convert a user-typed rule string to a RegExp.
 * Supports plain text, partial matches, and simple wildcards (*).
 * @param {string} pattern
 * @return {RegExp}
 */
function patternToRegex_(pattern) {
  // If user typed a regex literal like /foo/i — parse it
  const regexLiteral = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
  if (regexLiteral) {
    try { return new RegExp(regexLiteral[1], regexLiteral[2] || 'i'); } catch (e) { /* fall through */ }
  }

  // Escape special regex chars, then convert * wildcard to .*
  const escaped = pattern.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(escaped, 'i');
}

/**
 * Check if an email sender matches any pattern in an array.
 * @param {string} from
 * @param {RegExp[]} patterns
 * @return {boolean}
 */
function matchesAny_(from, patterns) {
  return patterns.some(re => re.test(from));
}
