// --- State ---
let rows = []; // { id, url, name, to, subject, competitors, portfolio, context, status, emailHtml, error }
let selectedProvider = "gmail";
let selectedTemplate = "";
let currentPreviewRowId = null;
let nextId = 1;
let isProcessing = false;

// --- DOM refs ---
const tableBody = document.getElementById("tableBody");
const templateSelect = document.getElementById("templateSelect");
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
const modalOutlookBtn = document.getElementById("modalOutlookBtn");
const statusMessage = document.getElementById("statusMessage");

// --- Init ---
addRows(5);
checkGmailStatus();
loadTemplates();
if (window.location.search.includes("gmail=connected")) {
  window.history.replaceState({}, "", "/");
  checkGmailStatus();
}

// --- Template selector ---
async function loadTemplates() {
  try {
    const res = await fetch("/api/templates");
    const templates = await res.json();
    templateSelect.innerHTML = "";
    templates.forEach((t, i) => {
      const opt = document.createElement("option");
      opt.value = t.slug;
      opt.textContent = t.name;
      templateSelect.appendChild(opt);
    });
    if (templates.length > 0) {
      selectedTemplate = templates[0].slug;
    }
  } catch {
    templateSelect.innerHTML = '<option value="">Default</option>';
  }
}

templateSelect.addEventListener("change", () => {
  selectedTemplate = templateSelect.value;
});

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
      <td><input type="text" class="field-name" placeholder="John; Jane" value="${esc(row.name)}"></td>
      <td><input type="email" class="field-to" placeholder="john@co.com" value="${esc(row.to)}"></td>
      <td><input type="text" class="field-subject" placeholder="Resurgens + Co" value="${esc(row.subject)}"></td>
      <td><input type="text" class="field-competitors" placeholder="CompA, CompB" value="${esc(row.competitors)}"></td>
      <td><input type="text" class="field-portfolio" placeholder="EnergyCAP..." value="${esc(row.portfolio)}"></td>
      <td><input type="text" class="field-context" placeholder="Met at SaaStr" value="${esc(row.context)}"></td>
      <td class="col-copy">${row.emailHtml ? `<button class="btn btn-small btn-copy copy-btn" data-id="${row.id}">Copy</button>` : ""}</td>
      <td class="col-outlook">${row.emailHtml ? `<button class="btn btn-small btn-outlook outlook-btn" data-id="${row.id}">Open</button>` : ""}</td>
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

  tableBody.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => copyRichText(Number(btn.dataset.id), btn));
  });

  tableBody.querySelectorAll(".outlook-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncAllRows();
      downloadEml(Number(btn.dataset.id));
    });
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

// --- Excel-style cell selection state + helpers (used by paste and drag) ---
const FIELD_ORDER = ["url", "name", "to", "subject", "competitors", "portfolio", "context"];
let cellSel = { dragging: false, active: false, startRow: -1, startCol: -1, endRow: -1, endCol: -1 };

function getCellPos(input) {
  const tr = input.closest("tr");
  if (!tr) return null;
  const rowId = Number(tr.dataset.id);
  const rowIndex = rows.findIndex((r) => r.id === rowId);
  if (rowIndex === -1) return null;
  const fieldClass = Array.from(input.classList).find((c) => c.startsWith("field-"));
  if (!fieldClass) return null;
  const colIndex = FIELD_ORDER.indexOf(fieldClass.replace("field-", ""));
  if (colIndex === -1) return null;
  return { rowIndex, colIndex };
}

function getSelRange() {
  return {
    minRow: Math.min(cellSel.startRow, cellSel.endRow),
    maxRow: Math.max(cellSel.startRow, cellSel.endRow),
    minCol: Math.min(cellSel.startCol, cellSel.endCol),
    maxCol: Math.max(cellSel.startCol, cellSel.endCol),
  };
}

function highlightCells() {
  tableBody.querySelectorAll("input.cell-selected").forEach((el) => el.classList.remove("cell-selected"));
  if (cellSel.startRow === -1) return;
  const { minRow, maxRow, minCol, maxCol } = getSelRange();
  for (let r = minRow; r <= maxRow && r < rows.length; r++) {
    const tr = tableBody.querySelector(`tr[data-id="${rows[r].id}"]`);
    if (!tr) continue;
    for (let c = minCol; c <= maxCol && c < FIELD_ORDER.length; c++) {
      const input = tr.querySelector(`.field-${FIELD_ORDER[c]}`);
      if (input) input.classList.add("cell-selected");
    }
  }
}

function clearCellSelection() {
  cellSel = { dragging: false, active: false, startRow: -1, startCol: -1, endRow: -1, endCol: -1 };
  tableBody.querySelectorAll("input.cell-selected").forEach((el) => el.classList.remove("cell-selected"));
  const tbl = tableBody.closest("table");
  if (tbl) tbl.classList.remove("selecting");
}

function selectionCellCount() {
  const { minRow, maxRow, minCol, maxCol } = getSelRange();
  return (maxRow - minRow + 1) * (maxCol - minCol + 1);
}

// --- Excel-style paste ---
// When pasting multi-cell data (tab-separated, newline-separated rows),
// spread it across columns and rows starting from the focused cell.
// Also fills all selected cells when a range is active.

tableBody.addEventListener("paste", (e) => {
  const target = e.target;
  if (!target.matches("input")) return;

  const clipboardText = (e.clipboardData || window.clipboardData).getData("text");
  if (!clipboardText) return;

  // If there's an active multi-cell selection, fill all selected cells
  if (cellSel.active) {
    e.preventDefault();
    syncAllRows();
    const { minRow, maxRow, minCol, maxCol } = getSelRange();
    const value = clipboardText.trim();

    // Parse clipboard — could be single value or multi-cell
    const pastedRows = value.includes("\t") || value.includes("\n")
      ? value.split("\n").map((line) => line.split("\t").map((v) => v.trim()))
      : null;

    for (let r = minRow; r <= maxRow && r < rows.length; r++) {
      for (let c = minCol; c <= maxCol && c < FIELD_ORDER.length; c++) {
        if (pastedRows) {
          // Tile multi-cell data across the selection
          const pr = (r - minRow) % pastedRows.length;
          const pc = (c - minCol) % pastedRows[pr].length;
          rows[r][FIELD_ORDER[c]] = pastedRows[pr][pc];
        } else {
          // Single value — fill every selected cell
          rows[r][FIELD_ORDER[c]] = value;
        }
      }
    }

    const count = (maxRow - minRow + 1) * (maxCol - minCol + 1);
    clearCellSelection();
    renderTable();
    showStatus(`Pasted into ${count} cell(s).`, "info");
    return;
  }

  // Detect multi-cell paste: has tabs or multiple lines
  const hasMultipleCells = clipboardText.includes("\t") || clipboardText.trim().includes("\n");
  if (!hasMultipleCells) return; // Let normal single-value paste happen

  e.preventDefault();
  syncAllRows();

  // Parse pasted data into rows of values
  const pastedRows = clipboardText.trim().split("\n").map((line) => line.split("\t").map((v) => v.trim()));

  // Find which row and column the user is pasting into
  const tr = target.closest("tr");
  const rowId = Number(tr.dataset.id);
  const rowIndex = rows.findIndex((r) => r.id === rowId);

  // Determine which column the cursor is in
  const fieldClass = Array.from(target.classList).find((c) => c.startsWith("field-"));
  const fieldName = fieldClass ? fieldClass.replace("field-", "") : "";
  const colIndex = FIELD_ORDER.indexOf(fieldName);
  if (colIndex === -1) return;

  // Add more rows if needed
  const extraRowsNeeded = (rowIndex + pastedRows.length) - rows.length;
  if (extraRowsNeeded > 0) {
    for (let i = 0; i < extraRowsNeeded; i++) {
      rows.push(createRowData());
    }
  }

  // Fill in the data
  for (let r = 0; r < pastedRows.length; r++) {
    const targetRow = rows[rowIndex + r];
    if (!targetRow) break;

    for (let c = 0; c < pastedRows[r].length; c++) {
      const fieldIdx = colIndex + c;
      if (fieldIdx >= FIELD_ORDER.length) break;

      const field = FIELD_ORDER[fieldIdx];
      targetRow[field] = pastedRows[r][c];
    }
  }

  renderTable();
  showStatus(`Pasted ${pastedRows.length} row(s) of data.`, "info");
});

// --- Excel-style cell selection (click + drag) event handlers ---

// Mousedown — start tracking a potential drag selection
tableBody.addEventListener("mousedown", (e) => {
  const input = e.target.closest("input[type='text'], input[type='email']");
  if (!input) return;
  const pos = getCellPos(input);
  if (!pos) return;

  // Shift+click extends existing selection
  if (e.shiftKey && cellSel.startRow !== -1) {
    e.preventDefault();
    cellSel.endRow = pos.rowIndex;
    cellSel.endCol = pos.colIndex;
    cellSel.active = true;
    highlightCells();
    return;
  }

  cellSel.startRow = pos.rowIndex;
  cellSel.startCol = pos.colIndex;
  cellSel.endRow = pos.rowIndex;
  cellSel.endCol = pos.colIndex;
  cellSel.dragging = true;
  cellSel.active = false;
});

// Mousemove — extend selection while dragging
tableBody.addEventListener("mousemove", (e) => {
  if (!cellSel.dragging) return;

  // Find the input — might be the target itself or inside the closest td
  let input = e.target.closest("input[type='text'], input[type='email']");
  if (!input) {
    const td = e.target.closest("td");
    if (td) input = td.querySelector("input[type='text'], input[type='email']");
  }
  if (!input) return;
  const pos = getCellPos(input);
  if (!pos) return;

  if (pos.rowIndex !== cellSel.startRow || pos.colIndex !== cellSel.startCol) {
    cellSel.active = true;
    tableBody.closest("table").classList.add("selecting");
  }
  cellSel.endRow = pos.rowIndex;
  cellSel.endCol = pos.colIndex;
  highlightCells();
  if (cellSel.active) e.preventDefault();
});

// Mouseup — finalize
document.addEventListener("mouseup", () => {
  if (!cellSel.dragging) return;
  cellSel.dragging = false;
  const tbl = tableBody.closest("table");
  if (tbl) tbl.classList.remove("selecting");
  // Single cell click — don't activate selection, let normal editing work
  if (cellSel.startRow === cellSel.endRow && cellSel.startCol === cellSel.endCol) {
    cellSel.active = false;
    highlightCells();
  }
});

// Click outside the table clears selection
document.addEventListener("mousedown", (e) => {
  if (cellSel.active && !e.target.closest("#bulkTable")) {
    clearCellSelection();
  }
});

// Keyboard shortcuts for selection
document.addEventListener("keydown", (e) => {
  if (!cellSel.active) return;

  // Ctrl+C / Cmd+C — copy selected cells as tab-separated text
  if ((e.ctrlKey || e.metaKey) && e.key === "c") {
    e.preventDefault();
    syncAllRows();
    const { minRow, maxRow, minCol, maxCol } = getSelRange();
    const lines = [];
    for (let r = minRow; r <= maxRow && r < rows.length; r++) {
      const cells = [];
      for (let c = minCol; c <= maxCol && c < FIELD_ORDER.length; c++) {
        cells.push(rows[r][FIELD_ORDER[c]] || "");
      }
      lines.push(cells.join("\t"));
    }
    navigator.clipboard.writeText(lines.join("\n"));
    showStatus(`Copied ${selectionCellCount()} cell(s).`, "info");
    return;
  }

  // Delete / Backspace — clear selected cells
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    syncAllRows();
    const { minRow, maxRow, minCol, maxCol } = getSelRange();
    for (let r = minRow; r <= maxRow && r < rows.length; r++) {
      for (let c = minCol; c <= maxCol && c < FIELD_ORDER.length; c++) {
        rows[r][FIELD_ORDER[c]] = "";
      }
    }
    const count = selectionCellCount();
    clearCellSelection();
    renderTable();
    showStatus(`Cleared ${count} cell(s).`, "info");
    return;
  }

  // Escape — clear selection
  if (e.key === "Escape") {
    clearCellSelection();
    return;
  }

  // Ctrl+A / Cmd+A — select all editable cells
  if ((e.ctrlKey || e.metaKey) && e.key === "a") {
    e.preventDefault();
    cellSel.startRow = 0;
    cellSel.startCol = 0;
    cellSel.endRow = rows.length - 1;
    cellSel.endCol = FIELD_ORDER.length - 1;
    cellSel.active = true;
    highlightCells();
    showStatus(`Selected all cells (${selectionCellCount()}).`, "info");
    return;
  }

  // Normal typing — clear selection and let the keypress through
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    clearCellSelection();
    return;
  }
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

  const toProcess = getSelectedOrAll().filter((r) => r.url && r.status !== "generating");
  console.log("Rows to process:", toProcess.length);

  if (toProcess.length === 0) {
    showStatus("No valid rows to process. Fill in at least the Company URL.", "error");
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
          template: selectedTemplate,
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
  const toDraft = getSelectedOrAll().filter((r) => r.emailHtml && r.to);
  if (toDraft.length === 0) {
    showStatus("Fill in Recipient Email for rows you want to draft.", "error");
    return;
  }

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
        body: JSON.stringify({ to: row.to, subject: row.subject || "[subject line]", emailHtml: row.emailHtml }),
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
  const toSend = getSelectedOrAll().filter((r) => r.emailHtml && r.to);
  if (toSend.length === 0) {
    showStatus("Fill in Recipient Email for rows you want to send.", "error");
    return;
  }

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
        body: JSON.stringify({ to: row.to, subject: row.subject || "[subject line]", emailHtml: row.emailHtml }),
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

  const copyTd = tr.querySelector(".col-copy");
  if (row.emailHtml && copyTd) {
    copyTd.innerHTML = `<button class="btn btn-small btn-copy copy-btn" data-id="${row.id}">Copy</button>`;
    copyTd.querySelector(".copy-btn").addEventListener("click", (e) => copyRichText(row.id, e.target));
  }

  const outlookTd = tr.querySelector(".col-outlook");
  if (row.emailHtml && outlookTd) {
    outlookTd.innerHTML = `<button class="btn btn-small btn-outlook outlook-btn" data-id="${row.id}">Open</button>`;
    outlookTd.querySelector(".outlook-btn").addEventListener("click", () => {
      syncAllRows();
      downloadEml(row.id);
    });
  }

  const previewTd = tr.querySelector(".col-preview");
  if (row.emailHtml) {
    previewTd.innerHTML = `<span class="preview-link" data-id="${row.id}">View</span>`;
    previewTd.querySelector(".preview-link").addEventListener("click", () => openPreview(row.id));
  }
}

// --- Rich-text copy (preserves formatting when pasting into Outlook) ---
async function copyRichText(rowId, btn) {
  const row = rows.find((r) => r.id === rowId);
  if (!row || !row.emailHtml) return;

  // Process the HTML to add inline styles that Outlook respects on paste
  const outlookHtml = prepareForOutlook(row.emailHtml);

  try {
    // Use Clipboard API to write both HTML and plain text
    const htmlBlob = new Blob([outlookHtml], { type: "text/html" });
    const textBlob = new Blob([htmlToPlainText(row.emailHtml)], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      }),
    ]);

    // Flash the button to confirm
    const origText = btn.textContent;
    btn.textContent = "Copied!";
    btn.classList.add("btn-copied");
    setTimeout(() => {
      btn.textContent = origText;
      btn.classList.remove("btn-copied");
    }, 1500);
  } catch {
    // Fallback: copy plain text
    const text = htmlToPlainText(row.emailHtml);
    await navigator.clipboard.writeText(text);
    showStatus("Copied as plain text (rich copy not supported in this browser).", "info");
  }
}

// Add inline styles to every element so Outlook preserves spacing on paste
function prepareForOutlook(html) {
  const div = document.createElement("div");
  div.innerHTML = html;

  // Add inline margin to every <p> tag
  div.querySelectorAll("p").forEach((p) => {
    p.style.margin = "0 0 12px 0";
    p.style.fontFamily = "Calibri, Arial, sans-serif";
    p.style.fontSize = "14px";
    p.style.lineHeight = "1.5";
    p.style.color = "#333";
  });

  // Style <em> and <strong> so they survive paste
  div.querySelectorAll("em").forEach((el) => {
    el.style.fontStyle = "italic";
  });
  div.querySelectorAll("strong").forEach((el) => {
    el.style.fontWeight = "bold";
  });

  // Style list items
  div.querySelectorAll("ul, ol").forEach((el) => {
    el.style.margin = "0 0 12px 0";
    el.style.paddingLeft = "24px";
    el.style.fontFamily = "Calibri, Arial, sans-serif";
    el.style.fontSize = "14px";
    el.style.color = "#333";
  });
  div.querySelectorAll("li").forEach((el) => {
    el.style.marginBottom = "4px";
  });

  return `<html><head><style>p{margin:0 0 12px 0}body{font-family:Calibri,Arial,sans-serif;font-size:14px;line-height:1.5;color:#333}</style></head><body style="font-family:Calibri,Arial,sans-serif;font-size:14px;line-height:1.5;color:#333;">${div.innerHTML}</body></html>`;
}

// Convert HTML to readable plain text (fallback)
function htmlToPlainText(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.innerText || div.textContent || "";
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

// --- Open in Outlook (.eml) ---
modalOutlookBtn.addEventListener("click", () => {
  const row = rows.find((r) => r.id === currentPreviewRowId);
  if (!row) return;
  syncRowFromDom(row);
  downloadEml(row.id);
});

function downloadEml(rowId) {
  const row = rows.find((r) => r.id === rowId);
  if (!row || !row.emailHtml) return;

  const to = row.to || "";
  const subject = row.subject || "[subject line]";
  const htmlBody = prepareForOutlook(row.emailHtml);

  // Build RFC 2822 .eml with MIME HTML body
  const boundary = "----=_RTPBoundary_" + Date.now();
  const emlParts = [
    `MIME-Version: 1.0`,
    `To: ${to}`,
    `Subject: ${encodeRFC2047(subject)}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    `X-Unsent: 1`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    htmlToPlainText(row.emailHtml),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    quotedPrintableEncode(htmlBody),
    ``,
    `--${boundary}--`,
  ];

  const emlContent = emlParts.join("\r\n");
  const filename = `${(row.name || row.to || "email").replace(/[^a-zA-Z0-9]/g, "_")}.eml`;
  downloadFile(filename, emlContent, "message/rfc822");
  showStatus("EML downloaded — double-click to open in Outlook.", "success");
}

// RFC 2047 encode subject for non-ASCII characters
function encodeRFC2047(text) {
  if (/^[\x20-\x7E]+$/.test(text)) return text;
  const encoded = new TextEncoder().encode(text);
  const base64 = btoa(String.fromCharCode(...encoded));
  return `=?UTF-8?B?${base64}?=`;
}

// Quoted-printable encoding for email body
function quotedPrintableEncode(text) {
  return text.replace(/[^\r\n\x20-\x3C\x3E-\x7E]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code > 255) {
      // Encode multi-byte characters as UTF-8 bytes
      const bytes = new TextEncoder().encode(ch);
      return Array.from(bytes).map((b) => "=" + b.toString(16).toUpperCase().padStart(2, "0")).join("");
    }
    return "=" + code.toString(16).toUpperCase().padStart(2, "0");
  });
}

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
