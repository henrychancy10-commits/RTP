import * as msal from "@azure/msal-node";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_CACHE_PATH = path.join(__dirname, "..", ".token-cache.json");

const SCOPES = ["Mail.ReadWrite", "Mail.Send"];

function getMsalConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";

  if (!clientId) {
    throw new Error(
      "MICROSOFT_CLIENT_ID is not set. Run `node setup.js` or see .env.example."
    );
  }

  return {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  };
}

function createApp() {
  const config = getMsalConfig();
  const app = new msal.PublicClientApplication(config);

  // Load cached tokens if they exist
  if (fs.existsSync(TOKEN_CACHE_PATH)) {
    const cacheData = fs.readFileSync(TOKEN_CACHE_PATH, "utf-8");
    app.getTokenCache().deserialize(cacheData);
  }

  return app;
}

function saveCache(app) {
  const cacheData = app.getTokenCache().serialize();
  fs.writeFileSync(TOKEN_CACHE_PATH, cacheData, "utf-8");
}

/**
 * Acquire an access token, using cached credentials if available.
 * Falls back to device-code flow for interactive login.
 */
export async function getAccessToken() {
  const app = createApp();

  // Try silent acquisition first (cached token)
  const accounts = await app.getTokenCache().getAllAccounts();
  if (accounts.length > 0) {
    try {
      const result = await app.acquireTokenSilent({
        account: accounts[0],
        scopes: SCOPES,
      });
      saveCache(app);
      return result.accessToken;
    } catch {
      // Silent acquisition failed, fall through to device code
    }
  }

  // Device code flow — user opens a URL and enters a code
  const result = await app.acquireTokenByDeviceCode({
    scopes: SCOPES,
    deviceCodeCallback: (response) => {
      console.log("\n" + response.message + "\n");
    },
  });

  saveCache(app);
  return result.accessToken;
}

/**
 * Create a draft email in Outlook via Microsoft Graph API.
 */
export async function createOutlookDraft({ to, subject, htmlBody, accessToken }) {
  const message = {
    subject,
    body: {
      contentType: "HTML",
      content: wrapInEmailHtml(htmlBody),
    },
    toRecipients: to.split(",").map((addr) => ({
      emailAddress: { address: addr.trim() },
    })),
  };

  const response = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to create draft: ${response.status} — ${err}`);
  }

  return response.json();
}

/**
 * Send an email directly via Microsoft Graph API.
 */
export async function sendOutlookEmail({ to, subject, htmlBody, accessToken }) {
  const payload = {
    message: {
      subject,
      body: {
        contentType: "HTML",
        content: wrapInEmailHtml(htmlBody),
      },
      toRecipients: to.split(",").map((addr) => ({
        emailAddress: { address: addr.trim() },
      })),
    },
  };

  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to send email: ${response.status} — ${err}`);
  }
}

/**
 * Wrap the AI-generated HTML body in a minimal email-safe HTML document.
 */
function wrapInEmailHtml(bodyHtml) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: Calibri, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #333;
      max-width: 680px;
    }
    p { margin: 0 0 12px 0; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
    ul, ol { margin: 0 0 12px 0; padding-left: 24px; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
    li { margin-bottom: 4px; }
  </style>
</head>
<body style="font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #333;">
${bodyHtml}
</body>
</html>`;
}
