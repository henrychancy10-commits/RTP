import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_SYSTEM_PROMPT = `You are a professional email writer. Given content from a webpage, you compose a clear, well-structured email about it.

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
 * Uses Claude to generate an email body from URL content.
 *
 * @param {object} urlContent - Output from fetchUrlContent()
 * @param {object} options
 * @param {string} [options.instructions] - Additional user instructions for tone/content
 * @param {string} [options.model] - Claude model to use
 * @param {string} [options.systemPrompt] - Override the default system prompt
 * @returns {Promise<string>} Generated email HTML body
 */
export async function generateEmail(urlContent, options = {}) {
  const {
    instructions = "",
    model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
  } = options;

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
