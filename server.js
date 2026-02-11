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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Generate email from URL
app.post("/api/generate", async (req, res) => {
  try {
    const { url, name, competitors, portfolio, context, model, promptFile } = req.body;

    if (!url || !name) {
      return res.status(400).json({ error: "URL and recipient name are required." });
    }

    const urlContent = await fetchUrlContent(url);

    const emailHtml = await generateEmail(urlContent, {
      recipientName: name,
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
    res.status(500).json({ error: err.message });
  }
});

// Create draft in Outlook
app.post("/api/draft", async (req, res) => {
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
app.post("/api/send", async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`\n  RTP Email Generator is running at:\n`);
  console.log(`  http://localhost:${PORT}\n`);
  console.log(`  Open that URL in your browser.\n`);
});
