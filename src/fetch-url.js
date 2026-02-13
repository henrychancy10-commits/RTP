import * as cheerio from "cheerio";

/**
 * Fetches a URL and extracts the meaningful text content.
 * Returns structured data: title, description, and body text.
 */
export async function fetchUrlContent(url) {
  // Auto-add https:// if missing
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; RTP-EmailGenerator/1.0; +https://github.com)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Remove non-content elements
  $("script, style, nav, footer, header, iframe, noscript, svg").remove();

  const title = $("title").text().trim() || $("h1").first().text().trim() || "";
  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    "";

  // Extract main content — prefer <article> or <main>, fall back to <body>
  let bodyText = "";
  const mainContent = $("article, main, [role='main']").first();
  if (mainContent.length) {
    bodyText = mainContent.text();
  } else {
    bodyText = $("body").text();
  }

  // Clean up whitespace
  bodyText = bodyText.replace(/\s+/g, " ").trim();

  // Truncate to ~8000 chars to stay within reasonable token limits
  const maxChars = 8000;
  if (bodyText.length > maxChars) {
    bodyText = bodyText.slice(0, maxChars) + "... [truncated]";
  }

  return { url, title, description, body: bodyText };
}
