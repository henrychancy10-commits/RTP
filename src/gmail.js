import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, "..", ".gmail-token.json");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
];

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set. Run `node setup.js` or see .env.example."
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, "http://localhost:3000/auth/google/callback");
}

/**
 * Get the authorization URL for the user to visit.
 */
export function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

/**
 * Exchange an authorization code for tokens and save them.
 */
export async function handleAuthCallback(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens), "utf-8");
  return tokens;
}

/**
 * Get an authenticated OAuth2 client, using saved tokens if available.
 * Returns null if not authenticated yet.
 */
export function getAuthenticatedClient() {
  if (!fs.existsSync(TOKEN_PATH)) {
    return null;
  }

  const oauth2Client = getOAuth2Client();
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  oauth2Client.setCredentials(tokens);

  // Auto-refresh: listen for new tokens
  oauth2Client.on("tokens", (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged), "utf-8");
  });

  return oauth2Client;
}

/**
 * Check if the user is authenticated with Gmail.
 */
export function isAuthenticated() {
  return fs.existsSync(TOKEN_PATH);
}

/**
 * Build a raw RFC 2822 email message.
 */
function buildRawEmail({ to, subject, htmlBody }) {
  const boundary = "boundary_" + Date.now();
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(wrapInEmailHtml(htmlBody)).toString("base64"),
    ``,
    `--${boundary}--`,
  ];

  const raw = emailLines.join("\r\n");
  return Buffer.from(raw).toString("base64url");
}

/**
 * Create a draft email in Gmail.
 */
export async function createGmailDraft({ to, subject, htmlBody }) {
  const auth = getAuthenticatedClient();
  if (!auth) throw new Error("Not authenticated with Gmail. Please sign in first.");

  const gmail = google.gmail({ version: "v1", auth });
  const raw = buildRawEmail({ to, subject, htmlBody });

  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw },
    },
  });

  return { id: res.data.id };
}

/**
 * Send an email via Gmail.
 */
export async function sendGmail({ to, subject, htmlBody }) {
  const auth = getAuthenticatedClient();
  if (!auth) throw new Error("Not authenticated with Gmail. Please sign in first.");

  const gmail = google.gmail({ version: "v1", auth });
  const raw = buildRawEmail({ to, subject, htmlBody });

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
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
      font-size: 14px;
      line-height: 1.5;
      color: #333;
      max-width: 680px;
    }
    p { margin: 0 0 12px 0; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
