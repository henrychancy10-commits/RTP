#!/usr/bin/env node
import "dotenv/config";
import { program } from "commander";
import { fetchUrlContent } from "./src/fetch-url.js";
import { generateEmail } from "./src/generate-email.js";
import {
  getAccessToken,
  createOutlookDraft,
  sendOutlookEmail,
} from "./src/outlook.js";

program
  .name("rtp")
  .description("Generate emails from URLs using Claude AI and send via Outlook")
  .requiredOption("-u, --url <url>", "URL to generate the email from")
  .requiredOption("-t, --to <email>", "Recipient email address(es), comma-separated")
  .requiredOption("-s, --subject <subject>", "Email subject line")
  .option("-i, --instructions <text>", "Additional instructions for email generation")
  .option("--send", "Send immediately instead of creating a draft", false)
  .option("--preview", "Preview the generated email without sending", false)
  .option("--model <model>", "Claude model to use")
  .option("--system-prompt <prompt>", "Override the default system prompt")
  .action(run);

program.parse();

async function run(opts) {
  try {
    // 1. Fetch URL content
    console.log(`Fetching content from: ${opts.url}`);
    const urlContent = await fetchUrlContent(opts.url);
    console.log(`  Title: ${urlContent.title || "(none)"}`);
    console.log(`  Content length: ${urlContent.body.length} chars\n`);

    // 2. Generate email via Claude
    console.log("Generating email with Claude...");
    const emailHtml = await generateEmail(urlContent, {
      instructions: opts.instructions,
      model: opts.model,
      systemPrompt: opts.systemPrompt,
    });
    console.log("Email generated.\n");

    // 3. Preview mode — just print and exit
    if (opts.preview) {
      console.log("--- Generated Email (HTML) ---");
      console.log(emailHtml);
      console.log("--- End ---");
      return;
    }

    // 4. Authenticate with Microsoft Graph
    console.log("Authenticating with Outlook...");
    const accessToken = await getAccessToken();
    console.log("Authenticated.\n");

    // 5. Create draft or send
    if (opts.send) {
      console.log(`Sending email to: ${opts.to}`);
      await sendOutlookEmail({
        to: opts.to,
        subject: opts.subject,
        htmlBody: emailHtml,
        accessToken,
      });
      console.log("Email sent successfully!");
    } else {
      console.log(`Creating draft for: ${opts.to}`);
      const draft = await createOutlookDraft({
        to: opts.to,
        subject: opts.subject,
        htmlBody: emailHtml,
        accessToken,
      });
      console.log(`Draft created! Open Outlook to review and send.`);
      console.log(`  Draft ID: ${draft.id}`);
    }
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  }
}
