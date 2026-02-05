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
 * @param {string} [options.instructions] - Additional user instructions for tone/content
 * @param {string} [options.model] - Claude model to use
 * @param {string} [options.promptFile] - Path to a file containing the system prompt
 * @returns {Promise<string>} Generated email HTML body
 */
export async function generateEmail(urlContent, options = {}) {
  const {
    instructions = "",
    model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
    promptFile,
  } = options;

  const { prompt: systemPrompt, source: promptSource } = loadSystemPrompt(promptFile);
  console.log(`  Using prompt from: ${promptSource}`);

  const client = new Anthropic();

  const userMessage = buildUserMessage(urlContent, instructions);

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  return text.trim();
}

function buildUserMessage(urlContent, instructions) {
  let msg = `Please write an email based on the following webpage content.\n\n`;
  msg += `**Source URL:** ${urlContent.url}\n`;
  if (urlContent.title) msg += `**Page Title:** ${urlContent.title}\n`;
  if (urlContent.description) msg += `**Description:** ${urlContent.description}\n`;
  msg += `\n**Page Content:**\n${urlContent.body}\n`;

  if (instructions) {
    msg += `\n**Additional Instructions:** ${instructions}\n`;
  }

  return msg;
}
