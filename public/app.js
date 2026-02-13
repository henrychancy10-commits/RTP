// --- State ---
let rows = []; // { id, url, name, to, subject, competitors, portfolio, context, status, emailHtml, error }
let selectedProvider = "gmail";
let currentPreviewRowId = null;
let nextId = 1;
let isProcessing = false;

// --- DOM refs ---
const tableBody = document.getElementById("tableBody");
const generateAllBtn = document.getElementById("generateAllBtn");
const draftAllBtn = document.getElementById("draftAllBtn");
const sendAllBtn = document.getElementById("sendAllBtn");
const addRowBtn = document.getElementById("addRowBtn");
const add10RowsBtn = document.getElementById("add10RowsBtn");
const csvUpload = document.getElementById("csvUpload");
const downloadTemplateBtn = document.getElementById("downloadTemplateBtn");
const selectAllCheckbox = document.getElementById("selectAll");
const progressText = document.getElementById("progressText");
const previewModal = document.getElementById("previewModal");
const previewTitle = document.getElementById("previewTitle");
const previewBody = document.getElementById("previewBody");
const closeModal = document.getElementById("closeModal");
const modalDraftBtn = document.getElementById("modalDraftBtn");
const modalSendBtn = document.getElementById("modalSendBtn");
const modalCopyBtn = document.getElementById("modalCopyBtn");
const gmailStatusText = document.getElementById("gmailStatusText");
const gmailConnectLink = document.getElementById("gmailConnectLink");
const gmailStatusDiv = document.getElementById("gmailStatus");
const statusMessage = document.getElementById("statusMessage");

// --- Init ---
addRows(5);
checkGmailStatus();
if (window.location.search.includes("gmail=connected")) {
  window.history.replaceState({}, "", "/");
  checkGmailStatus();
}

// --- Provider toggle ---
document.querySelectorAll(".provider-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".provider-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedProvider = btn.dataset.provider;
    gmailStatusDiv.style.display = selectedProvider === "gmail" ? "flex" : "none";
  });
});

// --- Gmail status ---
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

// --- Row management ---
function createRowData(data = {}) {
  return {
    id: nextId++,
    url: data.url || "",
    name: data.name || "",
    to: data.to || "",
    subject: data.subject || "",
    competitors: data.competitors || "",
    portfolio: data.portfolio || "",
    context: data.context || "",
    status: "pending",
    emailHtml: "",
    error: "",
    selected: false,
  };
}

function addRows(count, dataArray) {
  for (let i = 0; i < count; i++) {
    const data = dataArray ? dataArray[i] : {};
    rows.push(createRowData(data));
  }
  renderTable();
}

function removeRow(id) {
  rows = rows.filter((r) => r.id !== id);
  renderTable();
}

function getRowValue(id, field) {
  const input = document.querySelector(`tr[data-id="${id}"] .field-${field}`);
  return input ? input.value : "";
}

function syncRowFromDom(row) {
  row.url = getRowValue(row.id, "url");
  row.name = getRowValue(row.id, "name");
  row.to = getRowValue(row.id, "to");
  row.subject = getRowValue(row.id, "subject");
  row.competitors = getRowValue(row.id, "competitors");
  row.portfolio = getRowValue(row.id, "portfolio");
  row.context = getRowValue(row.id, "context");
}

function syncAllRows() {
  rows.forEach(syncRowFromDom);
}

function renderTable() {
  tableBody.innerHTML = rows.map((row) => `
    <tr data-id="${row.id}">
      <td class="col-check"><input type="checkbox" class="row-check" ${row.selected ? "checked" : ""}></td>
      <td class="col-status"><span class="status-badge status-${row.status}">${formatStatus(row.status)}</span></td>
      <td><input type="text" class="field-url" placeholder="https://company.com" value="${esc(row.url)}"></td>
      <td><input type="text" class="field-name" placeholder="John" value="${esc(row.name)}"></td>
      <td><input type="email" class="field-to" placeholder="john@co.com" value="${esc(row.to)}"></td>
      <td><input type="text" class="field-subject" placeholder="Resurgens + Co" value="${esc(row.subject)}"></td>
      <td><input type="text" class="field-competitors" placeholder="CompA, CompB" value="${esc(row.competitors)}"></td>
      <td><input type="text" class="field-portfolio" placeholder="EnergyCAP..." value="${esc(row.portfolio)}"></td>
      <td><input type="text" class="field-context" placeholder="Met at SaaStr" value="${esc(row.context)}"></td>
      <td class="col-preview">${row.emailHtml ? `<span class="preview-link" data-id="${row.id}">View</span>` : ""}</td>
      <td class="col-actions"><button class="btn-icon delete-row" data-id="${row.id}" title="Remove row">&times;</button></td>
    </tr>
  `).join("");

  // Rebind events
  tableBody.querySelectorAll(".delete-row").forEach((btn) => {
    btn.addEventListener("click", () => removeRow(Number(btn.dataset.id)));
  });

  tableBody.querySelectorAll(".preview-link").forEach((link) => {
    link.addEventListener("click", () => openPreview(Number(link.dataset.id)));
  });

  tableBody.querySelectorAll(".row-check").forEach((cb, i) => {
    cb.addEventListener("change", () => {
      rows[i].selected = cb.checked;
    });
  });

  updateActionButtons();
}

function formatStatus(s) {
  const labels = {
    pending: "Pending",
    generating: "Generating...",
    generated: "Generated",
    drafting: "Drafting...",
    drafted: "Drafted",
    sending: "Sending...",
    sent: "Sent",
    error: "Error",
  };
  return labels[s] || s;
}

function esc(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function updateActionButtons() {
  const hasGenerated = rows.some((r) => r.emailHtml);
  draftAllBtn.style.display = hasGenerated ? "inline-flex" : "none";
  sendAllBtn.style.display = hasGenerated ? "inline-flex" : "none";
}

// --- Toolbar buttons ---
addRowBtn.addEventListener("click", () => addRows(1));
add10RowsBtn.addEventListener("click", () => addRows(10));

selectAllCheckbox.addEventListener("change", () => {
  rows.forEach((r) => (r.selected = selectAllCheckbox.checked));
  tableBody.querySelectorAll(".row-check").forEach((cb) => (cb.checked = selectAllCheckbox.checked));
});

// --- CSV ---
downloadTemplateBtn.addEventListener("click", () => {
  const header = "url,name,to,subject,competitors,portfolio,context";
  const example = "https://company.com,John,john@company.com,Resurgens + Company,CompA CompB,,Met at SaaStr";
  const csv = header + "\n" + example + "\n";
  downloadFile("rtp-template.csv", csv, "text/csv");
});

csvUpload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = ev.target.result;
    const parsed = parseCSV(text);
    if (parsed.length > 0) {
      syncAllRows();
      // Remove empty rows before adding CSV data
      rows = rows.filter((r) => r.url || r.name || r.to || r.subject);
      addRows(parsed.length, parsed);
      showStatus(`Imported ${parsed.length} rows from CSV.`, "info");
    }
  };
  reader.readAsText(file);
  csvUpload.value = "";
});

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (values[idx] || "").trim();
    });

    // Only add if at least URL is present
    if (obj.url) {
      results.push(obj);
    }
  }

  return results;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Generate All ---
generateAllBtn.addEventListener("click", async () => {
  syncAllRows();

  console.log("All rows after sync:", rows.map(r => ({ id: r.id, url: r.url, name: r.name })));

  const toProcess = getSelectedOrAll().filter((r) => r.url && r.name && r.status !== "generating");
  console.log("Rows to process:", toProcess.length);

  if (toProcess.length === 0) {
    showStatus("No valid rows to process. Fill in at least URL and Recipient Name.", "error");
    return;
  }

  isProcessing = true;
  generateAllBtn.disabled = true;
  generateAllBtn.textContent = "Processing...";

  let completed = 0;
  let errors = 0;

  for (const row of toProcess) {
    row.status = "generating";
    row.error = "";
    updateRowStatus(row);
    progressText.textContent = `${completed + 1} of ${toProcess.length}...`;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: row.url,
          name: row.name,
          competitors: row.competitors,
          portfolio: row.portfolio,
          context: row.context,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      row.emailHtml = data.email;
      row.status = "generated";
      completed++;
    } catch (err) {
      row.status = "error";
      row.error = err.message;
      errors++;
    }

    updateRowStatus(row);
  }

  progressText.textContent = `Done: ${completed} generated, ${errors} errors`;
  generateAllBtn.disabled = false;
  generateAllBtn.textContent = "Generate All Emails";
  isProcessing = false;
  updateActionButtons();
});

// --- Draft All ---
draftAllBtn.addEventListener("click", async () => {
  syncAllRows();
  const toDraft = getSelectedOrAll().filter((r) => r.emailHtml && r.to && r.subject);
  if (toDraft.length === 0) return;

  if (!confirm(`Create ${toDraft.length} draft(s) in ${selectedProvider === "gmail" ? "Gmail" : "Outlook"}?`)) return;

  draftAllBtn.disabled = true;
  draftAllBtn.textContent = "Drafting...";

  const endpoint = selectedProvider === "gmail" ? "/api/gmail/draft" : "/api/outlook/draft";
  let completed = 0;
  let errors = 0;

  for (const row of toDraft) {
    row.status = "drafting";
    updateRowStatus(row);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: row.to, subject: row.subject, emailHtml: row.emailHtml }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      row.status = "drafted";
      completed++;
    } catch (err) {
      row.status = "error";
      row.error = err.message;
      errors++;
    }

    updateRowStatus(row);
  }

  draftAllBtn.disabled = false;
  draftAllBtn.textContent = "Draft All";
  showStatus(`${completed} draft(s) created, ${errors} error(s).`, errors ? "error" : "success");
});

// --- Send All ---
sendAllBtn.addEventListener("click", async () => {
  syncAllRows();
  const toSend = getSelectedOrAll().filter((r) => r.emailHtml && r.to && r.subject);
  if (toSend.length === 0) return;

  if (!confirm(`Send ${toSend.length} email(s) via ${selectedProvider === "gmail" ? "Gmail" : "Outlook"} RIGHT NOW?`)) return;

  sendAllBtn.disabled = true;
  sendAllBtn.textContent = "Sending...";

  const endpoint = selectedProvider === "gmail" ? "/api/gmail/send" : "/api/outlook/send";
  let completed = 0;
  let errors = 0;

  for (const row of toSend) {
    row.status = "sending";
    updateRowStatus(row);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: row.to, subject: row.subject, emailHtml: row.emailHtml }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      row.status = "sent";
      completed++;
    } catch (err) {
      row.status = "error";
      row.error = err.message;
      errors++;
    }

    updateRowStatus(row);
  }

  sendAllBtn.disabled = false;
  sendAllBtn.textContent = "Send All";
  showStatus(`${completed} sent, ${errors} error(s).`, errors ? "error" : "success");
});

// --- Selection helper ---
function getSelectedOrAll() {
  const selected = rows.filter((r) => r.selected);
  return selected.length > 0 ? selected : rows;
}

// --- Update a single row's status in the DOM without full re-render ---
function updateRowStatus(row) {
  const tr = document.querySelector(`tr[data-id="${row.id}"]`);
  if (!tr) return;

  const statusTd = tr.querySelector(".col-status");
  statusTd.innerHTML = `<span class="status-badge status-${row.status}" title="${esc(row.error)}">${formatStatus(row.status)}</span>`;

  const previewTd = tr.querySelector(".col-preview");
  if (row.emailHtml) {
    previewTd.innerHTML = `<span class="preview-link" data-id="${row.id}">View</span>`;
    previewTd.querySelector(".preview-link").addEventListener("click", () => openPreview(row.id));
  }
}

// --- Preview modal ---
function openPreview(rowId) {
  const row = rows.find((r) => r.id === rowId);
  if (!row || !row.emailHtml) return;

  currentPreviewRowId = rowId;
  previewTitle.textContent = `Email to ${row.name} — ${row.subject}`;
  previewBody.innerHTML = row.emailHtml;
  previewModal.style.display = "flex";
}

closeModal.addEventListener("click", () => {
  previewModal.style.display = "none";
  currentPreviewRowId = null;
});

previewModal.addEventListener("click", (e) => {
  if (e.target === previewModal) {
    previewModal.style.display = "none";
    currentPreviewRowId = null;
  }
});

modalCopyBtn.addEventListener("click", () => {
  const row = rows.find((r) => r.id === currentPreviewRowId);
  if (row) {
    navigator.clipboard.writeText(row.emailHtml);
    showStatus("HTML copied to clipboard.", "info");
  }
});

modalDraftBtn.addEventListener("click", async () => {
  const row = rows.find((r) => r.id === currentPreviewRowId);
  if (!row) return;
  syncRowFromDom(row);

  const endpoint = selectedProvider === "gmail" ? "/api/gmail/draft" : "/api/outlook/draft";
  modalDraftBtn.disabled = true;
  modalDraftBtn.textContent = "Creating...";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: row.to, subject: row.subject, emailHtml: row.emailHtml }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    row.status = "drafted";
    updateRowStatus(row);
    showStatus("Draft created!", "success");
  } catch (err) {
    showStatus(err.message, "error");
  } finally {
    modalDraftBtn.disabled = false;
    modalDraftBtn.textContent = "Save as Draft";
  }
});

modalSendBtn.addEventListener("click", async () => {
  const row = rows.find((r) => r.id === currentPreviewRowId);
  if (!row) return;
  syncRowFromDom(row);

  if (!confirm(`Send this email to ${row.to} right now?`)) return;

  const endpoint = selectedProvider === "gmail" ? "/api/gmail/send" : "/api/outlook/send";
  modalSendBtn.disabled = true;
  modalSendBtn.textContent = "Sending...";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: row.to, subject: row.subject, emailHtml: row.emailHtml }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    row.status = "sent";
    updateRowStatus(row);
    showStatus("Email sent!", "success");
  } catch (err) {
    showStatus(err.message, "error");
  } finally {
    modalSendBtn.disabled = false;
    modalSendBtn.textContent = "Send Now";
  }
});

// --- Status messages ---
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message status-${type}`;
  statusMessage.style.display = "block";
  // Only auto-hide success/info messages, keep errors visible
  if (type !== "error") {
    setTimeout(() => { statusMessage.style.display = "none"; }, 5000);
  }
}
