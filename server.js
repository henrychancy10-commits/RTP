#!/usr/bin/env node
import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { generateEmail } from "./src/generate-email.js";
import {
  getAccessToken,
  createOutlookDraft,
  sendOutlookEmail,
} from "./src/outlook.js";
import {
  getAuthUrl,
  handleAuthCallback,
  isAuthenticated,
  createGmailDraft,
  sendGmail,
} from "./src/gmail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Warn at startup if the Anthropic API key is missing
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "\n  ⚠  ANTHROPIC_API_KEY is not set. Email generation will fail." +
    "\n     Set it in your .env file or deployment environment.\n"
  );
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Health check for deployment platforms
app.get("/healthz", (req, res) => res.send("ok"));

// Template registry — maps display names to prompt files
const PROMPTS_DIR = path.join(__dirname, "prompts");
const TEMPLATES = {};

// Auto-discover prompt files from the prompts/ directory
if (fs.existsSync(PROMPTS_DIR)) {
  for (const file of fs.readdirSync(PROMPTS_DIR).filter((f) => f.endsWith(".txt"))) {
    const slug = file.replace(/\.txt$/, "");
    // Convert slug to display name: "master-claude-outreach" -> "Master Claude Outreach"
    const name = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    TEMPLATES[slug] = { name, file: path.join(PROMPTS_DIR, file) };
  }
}

// List available templates
app.get("/api/templates", (req, res) => {
  const list = Object.entries(TEMPLATES).map(([slug, t]) => ({ slug, name: t.name }));
  res.json(list);
});

// Generate email from URL (SSE stream for step progress)
app.post("/api/generate", async (req, res) => {
  const { url, name, competitors, portfolio, context, model, template } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required." });
  }

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Resolve prompt file from template slug
  let promptFile;
  if (template && TEMPLATES[template]) {
    promptFile = TEMPLATES[template].file;
  }

  // Keep-alive ping every 30s so the browser doesn't close the connection
  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 30000);

  const onProgress = ({ step, totalSteps, label }) => {
    res.write(`data: ${JSON.stringify({ type: "progress", step, totalSteps, label })}\n\n`);
  };

  try {
    const result = await generateEmail(url, {
      recipientName: name || "[FIRST NAME]",
      competitors,
      portfolio,
      context,
      model,
      promptFile,
      onProgress,
    });

    res.write(`data: ${JSON.stringify({ type: "done", email: result.email, usage: result.usage })}\n\n`);
  } catch (err) {
    const msg = err.message || String(err);
    console.error("GENERATE ERROR:", msg);
    if (err.status) console.error("  HTTP status:", err.status);
    if (err.error) console.error("  API detail:", JSON.stringify(err.error));
    console.error(err.stack);
    res.write(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`);
  }

  clearInterval(keepAlive);
  res.end();
});

// --- Gmail routes ---

// Check if Gmail is connected
app.get("/api/gmail/status", (req, res) => {
  res.json({ connected: isAuthenticated() });
});

// Start Gmail OAuth flow
app.get("/auth/google", (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

// Gmail OAuth callback
app.get("/auth/google/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send("Missing authorization code.");
    }
    await handleAuthCallback(code);
    res.redirect("/?gmail=connected");
  } catch (err) {
    res.status(500).send(`Gmail auth failed: ${err.message}`);
  }
});

// Create draft in Gmail
app.post("/api/gmail/draft", async (req, res) => {
  try {
    const { to, subject, emailHtml } = req.body;

    if (!to || !subject || !emailHtml) {
      return res.status(400).json({ error: "Recipient, subject, and email body are required." });
    }

    const draft = await createGmailDraft({ to, subject, htmlBody: emailHtml });
    res.json({ success: true, draftId: draft.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send email via Gmail
app.post("/api/gmail/send", async (req, res) => {
  try {
    const { to, subject, emailHtml } = req.body;

    if (!to || !subject || !emailHtml) {
      return res.status(400).json({ error: "Recipient, subject, and email body are required." });
    }

    await sendGmail({ to, subject, htmlBody: emailHtml });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Outlook routes ---

// Create draft in Outlook
app.post("/api/outlook/draft", async (req, res) => {
  try {
    const { to, subject, emailHtml } = req.body;

    if (!to || !subject || !emailHtml) {
      return res.status(400).json({ error: "Recipient, subject, and email body are required." });
    }

    const accessToken = await getAccessToken();
    const draft = await createOutlookDraft({
      to,
      subject,
      htmlBody: emailHtml,
      accessToken,
    });

    res.json({ success: true, draftId: draft.id, webLink: draft.webLink });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send email via Outlook
app.post("/api/outlook/send", async (req, res) => {
  try {
    const { to, subject, emailHtml } = req.body;

    if (!to || !subject || !emailHtml) {
      return res.status(400).json({ error: "Recipient, subject, and email body are required." });
    }

    const accessToken = await getAccessToken();
    await sendOutlookEmail({
      to,
      subject,
      htmlBody: emailHtml,
      accessToken,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  RTP Email Generator is running on port ${PORT}\n`);
});
