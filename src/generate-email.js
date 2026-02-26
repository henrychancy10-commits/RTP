import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROMPT_PATH = path.join(__dirname, "..", "prompt.txt");

const FALLBACK_SYSTEM_PROMPT = `You are a professional email writer. Given content from a webpage, you compose a clear, well-structured email about it.

Guidelines:
- Write in a professional but personable tone
- Keep the email concise — aim for 150-300 words unless the content warrants more
- Use short paragraphs for readability
- Include a clear call-to-action or next step when appropriate
- Do NOT include a subject line in your output — just the email body
- Do NOT include placeholder brackets like [Your Name] — leave the sign-off for the user to add
- Output the email body as clean HTML using <p>, <ul>, <li>, <strong>, <em>, <br> tags only
- Do NOT wrap the output in \`\`\`html code fences — just output raw HTML`;

/**
 * Load the system prompt from a file. Falls back to the built-in prompt
 * if no file is found.
 *
 * Priority: promptFile option > prompt.txt in project root > built-in fallback
 */
export function loadSystemPrompt(promptFile) {
  const filePath = promptFile || DEFAULT_PROMPT_PATH;

  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8").trim();
    if (content) {
      return { prompt: content, source: filePath };
    }
  }

  return { prompt: FALLBACK_SYSTEM_PROMPT, source: "built-in fallback" };
}

/**
 * Uses Claude to generate an email body from URL content.
 *
 * @param {object} urlContent - Output from fetchUrlContent()
 * @param {object} options
 * @param {string} options.recipientName - Recipient name(s) for the greeting
 * @param {string} [options.competitors] - Known competitors, comma-separated
 * @param {string} [options.portfolio] - Relevant portfolio company info
 * @param {string} [options.context] - Additional context (intro source, connection, angle)
 * @param {string} [options.model] - Claude model to use
 * @param {string} [options.promptFile] - Path to a file containing the system prompt
 * @returns {Promise<string>} Generated email HTML body
 */
export async function generateEmail(urlContent, options = {}) {
  const {
    recipientName = "",
    competitors = "",
    portfolio = "",
    context = "",
    model = process.env.CLAUDE_MODEL || "claude-opus-4-6",
    promptFile,
  } = options;

  const { prompt: systemPrompt, source: promptSource } = loadSystemPrompt(promptFile);
  console.log(`  Using prompt from: ${promptSource}`);

  const client = new Anthropic();

  const userMessage = buildUserMessage(urlContent, { recipientName, competitors, portfolio, context });

  let messages = [{ role: "user", content: userMessage }];

  let response = await client.messages.create({
    model,
    max_tokens: 16000,
    thinking: {
      type: "enabled",
      budget_tokens: 10000,
    },
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 10,
      },
    ],
    system: systemPrompt,
    messages,
  });

  // Handle pause_turn: the API may pause long-running web search turns
  while (response.stop_reason === "pause_turn") {
    console.log("  Web search in progress, continuing...");
    messages = [
      ...messages,
      { role: "assistant", content: response.content },
    ];
    response = await client.messages.create({
      model,
      max_tokens: 16000,
      thinking: {
        type: "enabled",
        budget_tokens: 10000,
      },
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 10,
        },
      ],
      system: systemPrompt,
      messages,
    });
  }

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  return text.trim();
}

/**
 * Format semicolon-separated names into a natural greeting string.
 * "John"           -> "John"
 * "John;Jane"      -> "John & Jane"
 * "John;Jane;Mike" -> "John, Jane and Mike"
 */
function formatNames(raw) {
  if (!raw) return "[FIRST NAME]";
  const names = raw.split(";").map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return "[FIRST NAME]";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

function buildUserMessage(urlContent, { recipientName, competitors, portfolio, context }) {
  // The prompt says "All I will put into the chat will be the URL" — so we lead with
  // the URL and append the scraped content plus any optional inputs.
  let msg = `${urlContent.url}\n`;

  msg += `\nRecipient name: ${formatNames(recipientName)}\n`;

  // Append scraped page content so Claude doesn't need web access
  msg += `\n--- Scraped page content ---\n`;
  if (urlContent.title) msg += `Page title: ${urlContent.title}\n`;
  if (urlContent.description) msg += `Meta description: ${urlContent.description}\n`;
  msg += `\n${urlContent.body}\n`;
  msg += `--- End scraped content ---\n`;

  if (competitors) {
    msg += `\nKnown competitors: ${competitors}\n`;
  }

  if (portfolio) {
    msg += `\nRelevant portfolio company: ${portfolio}\n`;
  }

  if (context) {
    msg += `\nAdditional context: ${context}\n`;
  }

  return msg;
}
