// ============================================================
// Constants.gs — Shared constants for Gmail Cleaner v2
// ============================================================

const SHEET_NAMES = {
  DASHBOARD: 'Dashboard',
  SETTINGS:  'Settings',
  RULES:     'Rules',
  RESULTS:   'Results',
  AI_DRAFTS: 'AI Drafts'
};

// Results sheet column indices (1-based for Sheets API, 0-based for arrays)
const RESULTS_COL = {
  MESSAGE_ID:  1,
  FROM:        2,
  SUBJECT:     3,
  DATE:        4,
  CATEGORY:    5,
  ACTION:      6,
  CONFIDENCE:  7,
  REASON:      8,
  COUNT:       8  // total columns
};

// AI Drafts sheet column indices
const DRAFTS_COL = {
  FROM:    1,
  SUBJECT: 2,
  DATE:    3,
  SNIPPET: 4,
  REPLY:   5,
  STATUS:  6,
  COUNT:   6
};

// Settings sheet — row numbers for each setting (col A = label, col B = value)
const SETTINGS_ROW = {
  MAX_EMAILS:    2,
  MIN_AGE_DAYS:  3,
  OPENAI_KEY:    4,
  OPENAI_MODEL:  5,
  AUTO_SCHEDULE: 6,
  SCHEDULE_DAY:  7
};

const SETTINGS_VALUE_COL = 2; // Column B

// Rules sheet columns
const RULES_COL = {
  CUSTOM_DELETE: 1,  // Column A
  WHITELIST:     3   // Column C (B is spacer)
};

// Default configuration (used when Settings sheet values are missing/invalid)
const DEFAULTS = {
  MAX_EMAILS:    500,
  MIN_AGE_DAYS:  30,
  OPENAI_MODEL:  'gpt-4o-mini',
  AUTO_SCHEDULE: 'OFF',
  SCHEDULE_DAY:  'Sunday'
};

// Valid OpenAI models (shown as dropdown in Settings)
const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'];

// Valid schedule days
const SCHEDULE_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Gmail label used to track processed emails
const PROCESSED_LABEL = '_CleanerProcessed';

// CacheService key for progress tracking
const CACHE_KEY_PROGRESS = 'gmail_cleaner_progress';

// PropertiesService keys
const PROP_OPENAI_KEY   = 'openai_api_key';
const PROP_OPENAI_MODEL = 'openai_model';
const PROP_AI_CALLS_PREFIX = 'ai_calls_'; // + YYYY-MM-DD
const PROP_AI_DAILY_LIMIT  = 100;

// Category → default action mapping
const CATEGORY_ACTIONS = {
  calendar_notification:  'delete',
  google_ads:             'delete',
  promotional:            'delete',
  social_notification:    'delete',
  custom_delete:          'delete',
  newsletter:             'archive',
  automated_notification: 'archive',
  shipping_tracking:      'archive',
  security_alert:         'keep',
  financial:              'keep',
  personal:               'keep',
  work_related:           'review',
  unknown:                'review'
};

// Action colors for conditional formatting (hex)
const ACTION_COLORS = {
  delete:  '#f4cccc',
  archive: '#fff2cc',
  keep:    '#d9ead3',
  review:  '#cfe2f3'
};

// ---- Sender pattern regexes ----

const SENDER_PATTERNS = {
  financial: [
    /interactive\s*brokers/i, /schwab/i, /fidelity/i, /vanguard/i,
    /etrade/i, /td\s*ameritrade/i, /robinhood/i, /coinbase/i,
    /paypal/i, /venmo/i, /stripe/i, /plaid/i, /bank/i,
    /chase/i, /wellsfargo/i, /citi/i, /capitalone/i,
    /americanexpress/i, /amex/i, /discover/i, /visa/i,
    /mastercard/i, /@irs\.gov/i, /tax/i
  ],
  security_alert: [
    /security@/i, /security-noreply@/i, /account.*security/i,
    /verify@/i, /verification@/i, /2fa@/i, /auth@/i,
    /signin@/i, /password/i
  ],
  calendar_notification: [
    /calendar-notification@google\.com/i, /calendar\.google\.com/i,
    /noreply@calendar/i, /@calendly\.com/i, /calendar-server@/i
  ],
  google_ads: [
    /ads-noreply@google\.com/i, /google-ads/i, /adwords/i, /googleads/i
  ],
  promotional: [
    /marketing@/i, /promo@/i, /deals@/i, /offers@/i, /sales@/i,
    /newsletter@/i, /noreply@.*\.store/i, /noreply@.*shop/i,
    /@marketing\./i, /@promo\./i, /discount/i, /donotreply@/i,
    /@email\./i, /@e\./i, /@mail\./i, /@em\./i
  ],
  social_notification: [
    /@facebookmail\.com/i, /notification@facebook/i, /@twitter\.com/i,
    /@x\.com/i, /notify@twitter/i, /@linkedin\.com/i,
    /messages-noreply@linkedin/i, /@instagram\.com/i, /@tiktok\.com/i,
    /@pinterest\.com/i, /@reddit\.com/i, /noreply@reddit/i,
    /@discord\.com/i, /@medium\.com/i, /@quora\.com/i,
    /@snapchat\.com/i, /@whatsapp\.com/i, /@telegram\.org/i
  ],
  newsletter: [
    /newsletter/i, /digest@/i, /weekly@/i, /daily@/i, /update@/i,
    /news@/i, /bulletin@/i, /substack\.com/i, /mailchimp/i,
    /constantcontact/i, /sendgrid/i, /campaign-archive/i
  ],
  automated_notification: [
    /noreply@/i, /no-reply@/i, /donotreply@/i, /notification@/i,
    /notifications@/i, /alert@/i, /alerts@/i, /automated@/i,
    /auto@/i, /mailer@/i, /system@/i, /notify@/i, /@notifications\./i
  ],
  shipping_tracking: [
    /@ups\.com/i, /@fedex\.com/i, /@usps\.com/i, /@dhl\.com/i,
    /tracking@/i, /shipment@/i, /delivery@/i, /@amazon\.com.*ship/i,
    /order.*confirmation/i
  ]
};

// ---- Subject pattern regexes ----

const SUBJECT_PATTERNS = {
  calendar_notification: [
    /invitation:/i, /event reminder/i, /calendar:/i,
    /meeting reminder/i, /rsvp/i, /you've been invited/i
  ],
  promotional: [
    /% off/i, /sale ends/i, /limited time/i, /exclusive offer/i,
    /free shipping/i, /discount code/i, /promo code/i,
    /deal of the day/i, /flash sale/i, /clearance/i, /coupon/i,
    /save \$/i, /black friday/i, /cyber monday/i, /don't miss/i,
    /act now/i, /last chance/i, /hurry/i, /ending soon/i
  ],
  newsletter: [
    /weekly digest/i, /daily digest/i, /newsletter/i,
    /this week in/i, /monthly update/i, /weekly roundup/i,
    /your .* summary/i
  ],
  social_notification: [
    /commented on/i, /liked your/i, /mentioned you/i, /tagged you/i,
    /sent you a message/i, /new follower/i, /started following/i,
    /wants to connect/i, /accepted your/i, /invitation to connect/i,
    /posted in/i, /replied to/i, /reacted to/i
  ],
  shipping_tracking: [
    /shipped/i, /out for delivery/i, /delivered/i, /tracking number/i,
    /your order/i, /order confirmed/i, /shipment update/i, /package/i
  ],
  security_alert: [
    /security alert/i, /sign-in attempt/i, /new sign-in/i,
    /password reset/i, /verify your/i, /confirm your/i,
    /unusual activity/i, /two-factor/i, /2fa/i, /authentication/i
  ]
};
