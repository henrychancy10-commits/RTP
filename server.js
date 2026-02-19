#!/usr/bin/env node
import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { fetchUrlContent } from "./src/fetch-url.js";
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

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Health check for deployment platforms
app.get("/healthz", (req, res) => res.send("ok"));

// Generate email from URL
app.post("/api/generate", async (req, res) => {
  try {
    const { url, name, competitors, portfolio, context, model, promptFile } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required." });
    }

    const urlContent = await fetchUrlContent(url);

    const emailHtml = await generateEmail(urlContent, {
      recipientName: name || "[FIRST NAME]",
      competitors,
      portfolio,
      context,
      model,
      promptFile,
    });

    res.json({
      email: emailHtml,
      pageTitle: urlContent.title,
      contentLength: urlContent.body.length,
    });
  } catch (err) {
    console.error("GENERATE ERROR:", err.message || err);
    res.status(500).json({ error: err.message });
  }
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

    res.json({ success: true, draftId: draft.id });
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
