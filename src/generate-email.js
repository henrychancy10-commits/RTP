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
 * Multi-step email generation pipeline:
 *   1. Research the company
 *   2. Learn everything about the market
 *   3. Learn the competitive ecosystem
 *   4. Write the email based on template instructions
 *   5. QA the email
 *   6. Provide the final email
 *
 * Each step is a separate API call that builds on the accumulated
 * conversation history, giving Claude focused instructions at each stage.
 *
 * @param {string} url - Company URL to research
 * @param {object} options
 * @param {string} options.recipientName - Recipient name(s) for the greeting
 * @param {string} [options.competitors] - Known competitors, comma-separated
 * @param {string} [options.portfolio] - Relevant portfolio company info
 * @param {string} [options.context] - Additional context (intro source, connection, angle)
 * @param {string} [options.model] - Claude model to use
 * @param {string} [options.promptFile] - Path to a file containing the system prompt
 * @returns {Promise<string>} Generated email HTML body
 */
export async function generateEmail(url, options = {}) {
  const {
    recipientName = "",
    competitors = "",
    portfolio = "",
    context = "",
    model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
    promptFile,
  } = options;

  const { prompt: systemPrompt, source: promptSource } = loadSystemPrompt(promptFile);
  console.log(`  Using prompt from: ${promptSource}`);

  const client = new Anthropic();
  const webSearchTools = [
    {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 10,
    },
  ];

  // Shared helper: send a message and handle pause_turn loops for web search
  async function chat(messages, { tools, maxTokens = 16000, thinkingBudget = 10000 } = {}) {
    const params = {
      model,
      max_tokens: maxTokens,
      thinking: { type: "enabled", budget_tokens: thinkingBudget },
      system: systemPrompt,
      messages,
    };
    if (tools) params.tools = tools;

    let response = await client.messages.create(params);

    while (response.stop_reason === "pause_turn") {
      console.log("    Web search in progress, continuing...");
      messages = [
        ...messages,
        { role: "assistant", content: response.content },
      ];
      response = await client.messages.create({ ...params, messages });
    }

    return response;
  }

  function extractText(response) {
    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
  }

  // Build running conversation history
  let messages = [];

  // ── Step 1: Research the company ──────────────────────────────────
  console.log("  Step 1/6: Researching company...");
  messages.push({
    role: "user",
    content: `Research this company thoroughly: ${url}\n\nVisit their website and gather key information: what the company does, their products/services, founding story, leadership team, recent news, funding history, and any unique value propositions. Provide a comprehensive company profile.`,
  });

  let response = await chat(messages, { tools: webSearchTools });
  messages.push({ role: "assistant", content: response.content });

  // ── Step 2: Learn everything about the market ─────────────────────
  console.log("  Step 2/6: Researching market...");
  messages.push({
    role: "user",
    content: `Now research the market this company operates in. I need to understand:\n- The overall market size and growth trajectory\n- Key trends shaping this space\n- Major tailwinds and headwinds\n- Who the buyers/customers are and what drives their purchasing decisions\n- Any regulatory or macro factors that matter\n\nBe specific with data points where possible.`,
  });

  response = await chat(messages, { tools: webSearchTools });
  messages.push({ role: "assistant", content: response.content });

  // ── Step 3: Learn the competitive ecosystem ───────────────────────
  const competitorHint = competitors
    ? `\n\nI already know about these competitors: ${competitors}. Include them but also find others.`
    : "";
  console.log("  Step 3/6: Researching competitive ecosystem...");
  messages.push({
    role: "user",
    content: `Now map out the competitive ecosystem for this company. I need:\n- Direct competitors and how they differentiate\n- Indirect competitors or adjacent players\n- The company's defensibility and competitive advantages\n- Where this company is stronger or weaker vs. the field\n- Any recent competitive moves (fundraises, launches, pivots, acquisitions)${competitorHint}`,
  });

  response = await chat(messages, { tools: webSearchTools });
  messages.push({ role: "assistant", content: response.content });

  // ── Step 4: Write the email ───────────────────────────────────────
  const recipientLine = formatNames(recipientName);
  let writePrompt = `Based on all the research above, now write the outreach email.\n\nRecipient name: ${recipientLine}\n`;
  if (portfolio) writePrompt += `Relevant portfolio company: ${portfolio}\n`;
  if (context) writePrompt += `Additional context: ${context}\n`;
  writePrompt += `\nFollow the system prompt instructions exactly for tone, structure, and formatting. Use the research to make the email specific, insightful, and compelling — not generic. Output only the email body as clean HTML.`;

  console.log("  Step 4/6: Writing email...");
  messages.push({ role: "user", content: writePrompt });

  response = await chat(messages);
  messages.push({ role: "assistant", content: response.content });
  const draftEmail = extractText(response);

  // ── Step 5: QA the email ──────────────────────────────────────────
  console.log("  Step 5/6: QA review...");
  messages.push({
    role: "user",
    content: `Review the email you just wrote against these QA criteria:\n\n1. **Accuracy** — Are all company facts, market claims, and competitor references correct based on your research?\n2. **Specificity** — Does the email contain specific, researched details (not generic filler)?\n3. **Tone** — Is it professional, personable, and non-salesy?\n4. **Structure** — Short paragraphs, clear flow, appropriate length?\n5. **Template compliance** — Does it follow the system prompt formatting rules exactly (HTML tags, no subject line, no placeholder brackets, no code fences)?\n6. **Call to action** — Is there a clear, natural next step?\n7. **Recipient name** — Is "${recipientLine}" used correctly in the greeting?\n\nList any issues you find. If there are problems, provide a corrected version of the full email. If the email passes QA, just confirm it's good.`,
  });

  response = await chat(messages);
  messages.push({ role: "assistant", content: response.content });
  const qaResult = extractText(response);

  // ── Step 6: Provide the final email ───────────────────────────────
  console.log("  Step 6/6: Finalizing...");
  messages.push({
    role: "user",
    content: `Now provide the final, polished email incorporating any QA fixes. Output ONLY the email body as clean HTML — no commentary, no explanation, no code fences. Just the raw HTML email body.`,
  });

  response = await chat(messages);
  const finalEmail = extractText(response);

  return finalEmail.trim();
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

function buildUserMessage(url, { recipientName, competitors, portfolio, context }) {
  let msg = `${url}\n`;

  msg += `\nRecipient name: ${formatNames(recipientName)}\n`;

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
