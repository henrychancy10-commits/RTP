#!/usr/bin/env node
/**
 * Interactive setup helper — walks you through creating the .env file
 * with the required API keys and Microsoft app registration.
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

  console.log("You'll need two things:\n");
  console.log("1. A Claude API key from https://console.anthropic.com/");
  console.log("2. A Microsoft Entra app registration (see README.md for steps)\n");

  const anthropicKey = await ask("Anthropic API key: ");
  const clientId = await ask("Microsoft Client ID: ");
  const tenantId = await ask("Microsoft Tenant ID (or 'common' for multi-tenant): ");

  const env = [
    `ANTHROPIC_API_KEY=${anthropicKey}`,
    `MICROSOFT_CLIENT_ID=${clientId}`,
    `MICROSOFT_TENANT_ID=${tenantId || "common"}`,
    "",
  ].join("\n");

  fs.writeFileSync(".env", env, "utf-8");
  console.log("\n.env file created. You're ready to go!");
  console.log("Run:  node index.js --url <url> --to <email> --subject <subject>");
  rl.close();
}

main();
