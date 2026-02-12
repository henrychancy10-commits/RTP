#!/usr/bin/env node
/**
 * Interactive setup helper — walks you through creating the .env file
 * with the required API keys.
 */
import fs from "fs";
import readline from "readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.log("=== RTP Email Generator — Setup ===\n");

  if (fs.existsSync(".env")) {
    const overwrite = await ask(".env already exists. Overwrite? (y/N): ");
    if (overwrite.toLowerCase() !== "y") {
      console.log("Setup cancelled.");
      rl.close();
      return;
    }
  }

  console.log("You'll need:\n");
  console.log("1. A Claude API key from https://console.anthropic.com/");
  console.log("2. Google Cloud credentials for Gmail (see README.md)\n");

  const anthropicKey = await ask("Anthropic API key: ");

  console.log("\n--- Gmail Setup ---");
  console.log("Get these from https://console.cloud.google.com > APIs & Services > Credentials\n");
  const googleClientId = await ask("Google Client ID: ");
  const googleClientSecret = await ask("Google Client Secret: ");

  console.log("\n--- Outlook (optional, press Enter to skip) ---");
  const msClientId = await ask("Microsoft Client ID (or Enter to skip): ");
  const msTenantId = msClientId ? await ask("Microsoft Tenant ID: ") : "";

  const lines = [
    `ANTHROPIC_API_KEY=${anthropicKey}`,
    `GOOGLE_CLIENT_ID=${googleClientId}`,
    `GOOGLE_CLIENT_SECRET=${googleClientSecret}`,
  ];

  if (msClientId) {
    lines.push(`MICROSOFT_CLIENT_ID=${msClientId}`);
    lines.push(`MICROSOFT_TENANT_ID=${msTenantId || "common"}`);
  }

  lines.push("");

  fs.writeFileSync(".env", lines.join("\n"), "utf-8");
  console.log("\n.env file created!");
  console.log("Run:  npm start");
  console.log("Then open:  http://localhost:3000");
  rl.close();
}

main();
