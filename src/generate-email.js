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
 * Email generation pipeline (parallelized research):
 *   1. Research recipient, company, market, competitors — all in parallel
 *   2. Write the email using combined research
 *   3. QA + produce the final polished email
 *
 * Steps 1a-1d run simultaneously via Promise.all, cutting wall-clock
 * time from ~7 sequential API calls to ~3 rounds.
 *
 * @param {string} url - Company URL to research
 * @param {object} options
 * @param {string} options.recipientName - Recipient name(s) for the greeting
 * @param {string} [options.competitors] - Known competitors, comma-separated
 * @param {string} [options.portfolio] - Relevant portfolio company info
 * @param {string} [options.context] - Additional context (intro source, connection, angle)
 * @param {string} [options.model] - Claude model to use
 * @param {string} [options.promptFile] - Path to a file containing the system prompt
 * @param {function} [options.onProgress] - Callback for step progress: ({ step, totalSteps, label })
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
    onProgress,
  } = options;

  const TOTAL_STEPS = 3;
  function reportProgress(step, label) {
    console.log(`  Step ${step}/${TOTAL_STEPS}: ${label}`);
    if (onProgress) onProgress({ step, totalSteps: TOTAL_STEPS, label });
  }

  const { prompt: systemPrompt, source: promptSource } = loadSystemPrompt(promptFile);
  console.log(`  Using prompt from: ${promptSource}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your .env file or deployment environment variables."
    );
  }

  const client = new Anthropic();
  const webSearchTools = [
    {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 5,
    },
  ];

  const systemMessages = [
    {
      type: "text",
      text: systemPrompt,
      cache_control: { type: "ephemeral" },
    },
  ];

  // Send a message and handle pause_turn loops for web search.
  // Wraps each API call in a 3-minute timeout to prevent hanging.
  async function chat(messages, { tools, maxTokens = 8000, thinkingBudget = 3000 } = {}) {
    const params = {
      model,
      max_tokens: maxTokens,
      thinking: { type: "enabled", budget_tokens: thinkingBudget },
      system: systemMessages,
      messages,
    };
    if (tools) params.tools = tools;

    const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes per API call
    async function callWithTimeout(p) {
      const timer = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("API call timed out after 3 minutes")), TIMEOUT_MS)
      );
      return Promise.race([p, timer]);
    }

    let response;
    try {
      response = await callWithTimeout(client.messages.create(params));
    } catch (err) {
      // Surface Anthropic API error details
      if (err.status) {
        const detail = err.error?.error?.message || err.message;
        throw new Error(`Anthropic API error (${err.status}): ${detail}`);
      }
      throw err;
    }

    while (response.stop_reason === "pause_turn") {
      console.log("    Web search in progress, continuing...");
      messages = [
        ...messages,
        { role: "assistant", content: response.content },
      ];
      try {
        response = await callWithTimeout(client.messages.create({ ...params, messages }));
      } catch (err) {
        if (err.status) {
          const detail = err.error?.error?.message || err.message;
          throw new Error(`Anthropic API error (${err.status}): ${detail}`);
        }
        throw err;
      }
    }

    return response;
  }

  function extractText(response) {
    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
  }

  const recipientLine = formatNames(recipientName);
  const competitorHint = competitors
    ? `\n\nI already know about these competitors: ${competitors}. Include them but also find others.`
    : "";

  // ── Step 1: Research ────────────────────────────────────────────────
  const hasRecipient = recipientName && recipientName !== "[FIRST NAME]";
  reportProgress(1, hasRecipient ? "Researching (parallel)..." : "Researching company...");

  const researchPromises = [];

  // Only research the recipient if a name was provided
  if (hasRecipient) {
    researchPromises.push(
      chat(
        [{ role: "user", content: `Research the person named "${recipientLine}" who works at or is associated with this company: ${url}

Find key facts only — their current role, brief professional background, and anything notable they've said or done publicly. Keep it concise. Do NOT make anything up.` }],
        { tools: webSearchTools }
      )
    );
  }

  // Company + market + competitors
  researchPromises.push(
    chat(
      [{ role: "user", content: `Research the company at ${url}. In a single concise report, cover:

1. **Company**: What they do, key products/services, recent news, funding
2. **Market**: Market size, key trends, tailwinds
3. **Competitors**: Main competitors and how this company differentiates${competitorHint}

Be concise — bullet points are fine. Focus on what's useful for writing a personalized outreach email.` }],
      { tools: webSearchTools }
    )
  );

  const results = await Promise.all(researchPromises);

  let recipientResearch = "";
  let companyResearch = "";
  if (hasRecipient) {
    recipientResearch = extractText(results[0]);
    companyResearch = extractText(results[1]);
  } else {
    companyResearch = extractText(results[0]);
  }

  // ── Step 2: Write the email ────────────────────────────────────────
  reportProgress(2, "Writing email...");

  let writePrompt = `Here is research I've gathered. Use it to write a personalized outreach email.
${recipientResearch ? `\n## Recipient Research\n${recipientResearch}\n` : ""}
## Company, Market & Competitive Research
${companyResearch}

---

Now write the outreach email.

Recipient name: ${recipientLine}
`;
  if (portfolio) writePrompt += `Relevant portfolio company: ${portfolio}\n`;
  if (context) writePrompt += `Additional context: ${context}\n`;
  writePrompt += `
Follow the system prompt instructions exactly for tone, structure, and formatting. Use the research to make the email specific, insightful, and compelling — not generic. Personalize the email to the recipient based on what you learned about them. Output only the email body as clean HTML.`;

  let messages = [{ role: "user", content: writePrompt }];
  let response = await chat(messages, { thinkingBudget: 10000 });
  messages.push({ role: "assistant", content: response.content });

  // ── Step 3: QA + Finalize ──────────────────────────────────────────
  reportProgress(3, "QA & finalizing...");
  messages.push({
    role: "user",
    content: `Review the email you just wrote against these QA criteria, fix any issues, and output the final version:

1. **Accuracy** — Are all company facts, market claims, and competitor references correct based on the research?
2. **Specificity** — Does the email contain specific, researched details (not generic filler)?
3. **Personalization** — Does the email reference something specific about the recipient (their role, background, public statements, or interests)?
4. **Tone** — Is it professional, personable, and non-salesy?
5. **Structure** — Short paragraphs, clear flow, appropriate length?
6. **Template compliance** — Does it follow the system prompt formatting rules exactly (HTML tags, no subject line, no placeholder brackets, no code fences)?
7. **Call to action** — Is there a clear, natural next step?
8. **Recipient name** — Is "${recipientLine}" used correctly in the greeting?

Output ONLY the final, polished email body as clean HTML — no commentary, no QA notes, no code fences. Just the raw HTML email body.`,
  });

  response = await chat(messages, { maxTokens: 4096, thinkingBudget: 8000 });
  let finalEmail = extractText(response);

  // Validate output: strip code fences if model wrapped them despite instructions
  finalEmail = stripCodeFences(finalEmail);

  // If the output doesn't look like HTML, retry once with a firmer prompt
  if (!looksLikeHtml(finalEmail)) {
    console.log("    Output validation failed — retrying...");
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: `Your output was not clean HTML. Output ONLY raw HTML tags (<p>, <ul>, <li>, <strong>, <em>, <br>) — absolutely no markdown, no code fences, no commentary. Just the email body HTML.`,
    });
    response = await chat(messages, { maxTokens: 4096, thinkingBudget: 4000 });
    finalEmail = stripCodeFences(extractText(response));
  }

  return finalEmail.trim();
}

/**
 * Remove markdown code fences that occasionally wrap the output.
 */
function stripCodeFences(text) {
  return text.replace(/^```(?:html)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

/**
 * Quick check that the output contains at least one HTML tag.
 */
function looksLikeHtml(text) {
  return /<(p|ul|li|strong|em|br)\b/i.test(text);
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