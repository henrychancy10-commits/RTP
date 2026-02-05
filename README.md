# RTP — AI Email Generator

Generate professional emails from any URL using Claude AI and push them to your Outlook inbox as drafts (or send directly).

## How It Works

1. You provide a URL and recipient info
2. The tool scrapes the page content
3. Claude generates a polished email using **your custom prompt** (from `prompt.txt`)
4. The email is created as a draft in your Outlook (or sent immediately)

## Quick Start

```bash
npm install
node setup.js          # Interactive .env configuration

# Paste your Claude Project prompt into prompt.txt (see below)

node index.js --url "https://example.com/article" \
              --to "recipient@company.com" \
              --subject "Thought you'd find this interesting"
```

## Prerequisites

### 1. Claude API Key

Get one from [console.anthropic.com](https://console.anthropic.com/).

### 2. Microsoft Entra App Registration

This is needed for Outlook access. One-time setup:

1. Go to [Azure Portal > App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **New registration**
   - Name: `RTP Email Generator` (or whatever you like)
   - Supported account types: **Accounts in this organizational directory only** (single tenant) or **Accounts in any organizational directory and personal Microsoft accounts** if using a personal Outlook account
   - Redirect URI: **Public client/native (mobile & desktop)** — `http://localhost`
3. After creation, copy the **Application (client) ID** and **Directory (tenant) ID**
4. Go to **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated permissions**
   - Add: `Mail.ReadWrite`, `Mail.Send`
5. Click **Grant admin consent** (if you have admin access) or ask your admin

That's it. The tool uses device-code flow — no client secret needed.

## Usage

```bash
# Create a draft in Outlook (default — lets you review before sending)
node index.js -u "https://example.com" -t "alice@corp.com" -s "Check this out"

# Send immediately
node index.js -u "https://example.com" -t "alice@corp.com" -s "Check this out" --send

# Preview the generated email without sending
node index.js -u "https://example.com" -t "alice@corp.com" -s "Subject" --preview

# Add instructions to guide the email tone/content
node index.js -u "https://example.com" -t "alice@corp.com" -s "Subject" \
  -i "Make it casual and mention our call last week"

# Multiple recipients
node index.js -u "https://example.com" -t "alice@corp.com,bob@corp.com" -s "FYI"
```

## Options

| Flag | Description |
|------|-------------|
| `-u, --url <url>` | **(required)** URL to generate the email from |
| `-t, --to <email>` | **(required)** Recipient(s), comma-separated |
| `-s, --subject <text>` | **(required)** Email subject line |
| `-i, --instructions <text>` | Extra instructions for Claude (tone, context, etc.) |
| `--send` | Send immediately instead of creating a draft |
| `--preview` | Print generated HTML without sending |
| `--model <model>` | Claude model (default: `claude-sonnet-4-20250514`) |
| `--prompt-file <path>` | Path to a custom prompt file (default: `prompt.txt`) |

## Project Structure

```
├── index.js              # CLI entry point
├── setup.js              # Interactive .env setup helper
├── prompt.txt            # YOUR Claude Project prompt goes here
├── src/
│   ├── fetch-url.js      # URL content extraction
│   ├── generate-email.js # Claude email generation
│   └── outlook.js        # Microsoft Graph / Outlook integration
├── .env.example          # Template for environment variables
└── package.json
```

## Using Your Claude Project Prompt

The tool is designed to use the **same prompt you already have in your Claude Project**. Here's how to set it up:

1. Open your Claude Project at [claude.ai](https://claude.ai)
2. Click the project name → **Project instructions**
3. Copy the full prompt text
4. Paste it into **`prompt.txt`** in the project root (replace the placeholder text)

The tool will automatically use `prompt.txt` as the system prompt every time you run it. The URL content gets injected as the user message, just like pasting a URL into your Claude Project conversation.

**Important:** Make sure your prompt includes a line telling Claude to output HTML, so the email renders correctly in Outlook. If it doesn't, add this to the end:

```
Output the email body as clean HTML using <p>, <ul>, <li>, <strong>, <em>, <br> tags only. Do not wrap the output in code fences.
```

You can also use a different prompt file per-run:

```bash
node index.js -u "..." -t "..." -s "..." --prompt-file ./prompts/follow-up.txt
```

If `prompt.txt` is missing or empty, a sensible built-in fallback prompt is used.
