# Gmail Cleaner

A free, open-source Gmail cleanup tool that runs entirely inside Google Sheets — no app to install, no data sent to any server (except OpenAI if you choose to use it).

Bulk delete, archive, or keep thousands of emails with one click. Customizable rules, a whitelist, and optional AI-powered categorization and reply drafting.

---

## Features

- **Zero-code operation** — after a one-time setup, everything runs from a Google Sheets menu
- **Smart categorization** — automatically sorts emails into promotional, newsletter, social, financial, personal, and more
- **Custom rules** — add sender domains to always delete or always keep, directly in the sheet
- **Whitelist** — protect important senders from ever being deleted
- **Confirmation before cleanup** — always shows a count of what will be affected before acting
- **Safe deletes** — deleted emails go to Trash (recoverable for 30 days), never permanently deleted
- **Batched processing** — handles large inboxes across multiple runs without hitting timeouts
- **Auto-schedule** — optional weekly auto-cleanup with an email summary
- **AI features** (optional, requires OpenAI API key):
  - Smarter categorization for emails that don't match simple rules
  - Draft replies for personal and work emails you may have missed
  - All drafts go to Gmail Drafts — nothing is ever auto-sent

---

## Setup (one time, ~3 minutes)

### Step 1 — Open Google Apps Script

Go to [script.google.com](https://script.google.com) and click **New Project**. Name it `Gmail Cleaner`.

### Step 2 — Add the script files

Delete the contents of the default `Code.gs` tab. Then, for each `.gs` file in this repo, create a new script file:

- Click the **+** next to "Files" → choose **Script**
- Name it exactly as shown (e.g. `Constants`)
- Paste the file contents

Add files in this order:

```
Constants.gs
Setup.gs
Menu.gs
Rules.gs
Analyzer.gs
Cleanup.gs
AI.gs
Scheduler.gs
Progress.gs
Tests.gs
```

Click **Save** (Ctrl+S).

### Step 3 — Run the setup wizard

- In the function dropdown at the top, select **`setupGmailCleaner`**
- Click the **Run** button (▶)
- Google will ask for permission — click **Review permissions**, select your account, click **Advanced → Go to Gmail Cleaner (unsafe) → Allow**

A Google Sheet will be created and opened automatically. **Bookmark it** — you won't need to return to the script editor.

---

## How to use

Open your Gmail Cleaner sheet and use the **Gmail Cleaner** menu:

| Menu item | What it does |
|---|---|
| 🔍 Analyze Inbox | Scans inbox, categorizes emails, populates the Results tab |
| ✨ Clean Now | Executes the cleanup (shows a confirmation dialog first) |
| 🤖 Draft AI Replies | Generates reply drafts for personal/work emails (requires OpenAI key) |
| 📤 Send Approved Drafts | Creates Gmail drafts for replies you approved |
| ⚙️ Save Settings | Saves your settings and API key securely |
| 🔁 Reset Processed Emails | Start fresh — re-process all inbox emails next run |
| 📅 Enable Weekly Cleanup | Set up automatic weekly cleanup |
| 🧪 Test Run (10 emails) | Preview categorization on 10 emails before a full run |

**Typical workflow:**
1. Analyze Inbox → check the Results tab → adjust any actions → Clean Now

---

## The Sheets

| Sheet | Purpose |
|---|---|
| Dashboard | Stats from your last run |
| Settings | Configure max emails, delete age, OpenAI key, schedule |
| Rules | Add custom delete senders and whitelist entries |
| Results | Categorized emails — edit the Action column before cleaning |
| AI Drafts | AI-generated reply drafts (visible only when OpenAI key is set) |

---

## Default categories

| Category | Default action |
|---|---|
| Promotional (marketing@, deals@, etc.) | Delete |
| Social notifications (Facebook, Twitter, LinkedIn, Reddit, etc.) | Delete |
| Google Ads | Delete |
| Calendar notifications | Delete |
| Newsletters (unsubscribe links) | Archive |
| Automated notifications (noreply@, etc.) | Archive |
| Shipping & order tracking | Archive |
| Security alerts (password resets, 2FA) | Keep |
| Financial (banks, brokers, PayPal, etc.) | Keep |
| Personal (real people) | Keep |
| Work-related | Review |

**Delete** = moved to Trash (recoverable for 30 days)
**Archive** = removed from inbox, not deleted
**Keep / Review** = no action taken

---

## Custom rules (no code required)

Open the **Rules** tab in your sheet:

- **Column A — Custom Delete Senders**: add any sender domain or address to always delete
  ```
  @newsletters.somesite.com
  deals@company.com
  ```
- **Column C — Whitelist**: add senders to always keep, regardless of any other rule
  ```
  @mybank.com
  boss@company.com
  ```

---

## AI features (optional)

1. Get a free API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Paste it in the **Settings** sheet → OpenAI API Key cell
3. Run **Gmail Cleaner → Save Settings** — the key is saved securely and removed from the cell

**Smart categorization:** Emails that can't be categorized by rules are sent to OpenAI for a better guess. Only the sender address, subject line, and a short snippet are sent — the full email body is never transmitted.

**Reply drafting:** Scans for personal and work emails you haven't replied to. Generates a suggested reply for each one. You review, edit, and approve them in the AI Drafts sheet. Approved drafts are created in Gmail Drafts — **nothing is ever auto-sent**.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| Max Emails Per Run | 500 | Emails to analyze per run. Increase up to ~1500 after testing. |
| Auto-Delete Age (days) | 30 | Only delete emails older than this. Newer ones get archived instead. |
| OpenAI API Key | — | Optional. Stored securely, never kept in the sheet. |
| OpenAI Model | gpt-4o-mini | Model for AI features. `gpt-4o-mini` is fast and cheap. |
| Auto-Schedule | OFF | Set to ON for weekly auto-cleanup. |
| Schedule Day | Sunday | Day of the week for auto-cleanup. |

---

## Safety

- Deleted emails go to **Trash** — recoverable in Gmail for 30 days
- A confirmation dialog shows counts before any cleanup runs
- A label called `_CleanerProcessed` is added to processed emails in Gmail — this is expected behavior and is how the tool avoids re-processing emails on subsequent runs
- The OpenAI key is stored in Google's `UserProperties` service — it is never written back to the sheet and is not visible to anyone else
- Do not share your Gmail Cleaner sheet with other people — the sheet has temporary access to your revision history

---

## Troubleshooting

**"Sheet not found" error**
Re-run `setupGmailCleaner()` from the script editor.

**"No new emails to analyze"**
All emails are already marked as processed. Run **Reset Processed Emails** to start fresh.

**Cleanup stops before finishing**
Apps Script has a 6-minute execution limit. Just run **Clean Now** again — it picks up where it left off.

**AI features not working**
Make sure you've entered a valid OpenAI key in Settings and clicked **Save Settings**.

**Authorization error after adding new files**
Run any menu function and follow the authorization prompts again.

---

## Privacy

- No data is collected or stored anywhere outside your Google account
- Email content (sender, subject, snippet) is sent to OpenAI only if you configure an API key and use AI features
- Full email bodies are never transmitted anywhere
- The script runs entirely within your own Google account under your own authorization

---

## License

MIT — free to use, modify, and share.
