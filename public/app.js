const form = document.getElementById("emailForm");
const generateBtn = document.getElementById("generateBtn");
const resultSection = document.getElementById("result");
const emailPreview = document.getElementById("emailPreview");
const draftBtn = document.getElementById("draftBtn");
const sendBtn = document.getElementById("sendBtn");
const copyBtn = document.getElementById("copyBtn");
const regenerateBtn = document.getElementById("regenerateBtn");
const statusMessage = document.getElementById("statusMessage");
const gmailStatusText = document.getElementById("gmailStatusText");
const gmailConnectLink = document.getElementById("gmailConnectLink");
const gmailStatusDiv = document.getElementById("gmailStatus");

let currentEmailHtml = "";
let selectedProvider = "gmail";

// --- Provider toggle ---
document.querySelectorAll(".provider-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".provider-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedProvider = btn.dataset.provider;

    // Show/hide Gmail status
    gmailStatusDiv.style.display = selectedProvider === "gmail" ? "flex" : "none";
  });
});

// --- Check Gmail connection on load ---
async function checkGmailStatus() {
  try {
    const res = await fetch("/api/gmail/status");
    const data = await res.json();
    if (data.connected) {
      gmailStatusText.textContent = "Gmail connected";
      gmailStatusText.classList.add("connected");
      gmailConnectLink.style.display = "none";
    } else {
      gmailStatusText.textContent = "Not connected";
      gmailConnectLink.style.display = "inline-flex";
    }
  } catch {
    gmailStatusText.textContent = "Could not check status";
  }
}

checkGmailStatus();

// Check if we just came back from Gmail auth
if (window.location.search.includes("gmail=connected")) {
  window.history.replaceState({}, "", "/");
  checkGmailStatus();
}

// --- Generate email ---
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await generateEmail();
});

regenerateBtn.addEventListener("click", async () => {
  await generateEmail();
});

async function generateEmail() {
  const btnText = generateBtn.querySelector(".btn-text");
  const btnLoading = generateBtn.querySelector(".btn-loading");

  generateBtn.disabled = true;
  btnText.style.display = "none";
  btnLoading.style.display = "inline";
  hideStatus();

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: document.getElementById("url").value,
        name: document.getElementById("name").value,
        competitors: document.getElementById("competitors").value,
        portfolio: document.getElementById("portfolio").value,
        context: document.getElementById("context").value,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Failed to generate email");
    }

    currentEmailHtml = data.email;
    emailPreview.innerHTML = data.email;
    resultSection.style.display = "block";
    resultSection.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    showStatus(err.message, "error");
  } finally {
    generateBtn.disabled = false;
    btnText.style.display = "inline";
    btnLoading.style.display = "none";
  }
}

// --- Save as draft ---
draftBtn.addEventListener("click", async () => {
  const to = document.getElementById("to").value;
  const subject = document.getElementById("subject").value;

  if (!to || !subject) {
    showStatus("Fill in the recipient email and subject line first.", "error");
    return;
  }

  const endpoint = selectedProvider === "gmail" ? "/api/gmail/draft" : "/api/outlook/draft";

  draftBtn.disabled = true;
  draftBtn.textContent = "Creating draft...";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, emailHtml: currentEmailHtml }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Failed to create draft");
    }

    const providerName = selectedProvider === "gmail" ? "Gmail" : "Outlook";
    showStatus(`Draft created! Check your ${providerName} Drafts folder.`, "success");
  } catch (err) {
    showStatus(err.message, "error");
  } finally {
    draftBtn.disabled = false;
    draftBtn.textContent = "Save as Draft";
  }
});

// --- Send immediately ---
sendBtn.addEventListener("click", async () => {
  const to = document.getElementById("to").value;
  const subject = document.getElementById("subject").value;

  if (!to || !subject) {
    showStatus("Fill in the recipient email and subject line first.", "error");
    return;
  }

  if (!confirm(`Send this email to ${to} right now?`)) {
    return;
  }

  const endpoint = selectedProvider === "gmail" ? "/api/gmail/send" : "/api/outlook/send";

  sendBtn.disabled = true;
  sendBtn.textContent = "Sending...";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, emailHtml: currentEmailHtml }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Failed to send email");
    }

    showStatus("Email sent!", "success");
  } catch (err) {
    showStatus(err.message, "error");
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "Send Now";
  }
});

// --- Copy HTML ---
copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(currentEmailHtml).then(() => {
    showStatus("HTML copied to clipboard.", "info");
  });
});

function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message status-${type}`;
  statusMessage.style.display = "block";
}

function hideStatus() {
  statusMessage.style.display = "none";
}
