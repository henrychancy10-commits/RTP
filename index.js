#!/usr/bin/env node
import "dotenv/config";
import { program } from "commander";
import { generateEmail } from "./src/generate-email.js";
import {
  getAccessToken,
  createOutlookDraft,
  sendOutlookEmail,
} from "./src/outlook.js";

program
  .name("rtp")
  .description("Generate thesis-driven outreach emails from URLs using Claude AI and send via Outlook")
  .requiredOption("-u, --url <url>", "Company URL to research and generate the email from")
  .requiredOption("-t, --to <email>", "Recipient email address(es), comma-separated")
  .requiredOption("-s, --subject <subject>", "Email subject line")
  .requiredOption("-n, --name <name>", "Recipient name (e.g. 'John' or 'John and Sarah')")
  .option("-c, --competitors <names>", "Known competitors, comma-separated (otherwise Claude will research)")
  .option("-p, --portfolio <text>", "Relevant portfolio company to mention and why")
  .option("--context <text>", "Additional context (intro source, personal connection, specific angle)")
  .option("--send", "Send immediately instead of creating a draft", false)
  .option("--preview", "Preview the generated email without sending", false)
  .option("--model <model>", "Claude model to use")
  .option("--prompt-file <path>", "Path to your custom prompt file (default: prompt.txt)")
  .action(run);

program.parse();

async function run(opts) {
  try {
    // 1. Generate email via Claude (Claude fetches + researches the URL itself)
    console.log(`Generating email for: ${opts.url}`);
    const emailHtml = await generateEmail(opts.url, {
      recipientName: opts.name,
      competitors: opts.competitors,
      portfolio: opts.portfolio,
      context: opts.context,
      model: opts.model,
      promptFile: opts.promptFile,
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
