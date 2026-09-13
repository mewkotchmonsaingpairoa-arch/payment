/* ─── Constants ──────────────────────────────────────────────── */
const MONTH_NAMES = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const CATEGORY_META = {
  food:        { label: "อาหารและเครื่องดื่ม",  icon: "◒", color: "#f29b52" },
  transport:   { label: "เดินทาง",               icon: "⌁", color: "#6388d8" },
  bills:       { label: "บิลและสาธารณูปโภค",     icon: "⌂", color: "#8d77d5" },
  shopping:    { label: "ช้อปปิ้ง",              icon: "◇", color: "#e7809b" },
  installment: { label: "ผ่อนชำระ",              icon: "◫", color: "#8b70d4" },
  health:      { label: "สุขภาพ",                icon: "✚", color: "#4bb59b" },
  other:       { label: "อื่น ๆ",                icon: "○", color: "#9da7b9" },
  salary:      { label: "เงินเดือน",             icon: "▣", color: "#21a67a" },
  freelance:   { label: "รายได้เสริม",           icon: "✦", color: "#3e9d7d" }
};
const EXPENSE_CATS = ["food","transport","bills","shopping","installment","health","other"];
const INCOME_CATS  = ["salary","freelance","other"];
const STORAGE_KEY  = "pocketbloom-v2";

/* ─── UUID fallback (works on file:// too) ───────────────────── */
function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try { return crypto.randomUUID(); } catch (_) {}
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 11);
}

/* ─── State ──────────────────────────────────────────────────── */
const _now = new Date();
let selectedMonth = _now.getFullYear() + "-" + String(_now.getMonth() + 1).padStart(2, "0");
let activePage    = "dashboard";
let txFilter      = "all";
let editingTxId   = null;

/* ─── Helpers (declared first so defaultData can use them) ───── */
function incrementMonth(month, n) {
  const parts = month.split("-").map(Number);
  const dt = new Date(parts[0], parts[1] - 1 + n, 1);
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0");
}
function monthDiff(start, end) {
  const sp = start.split("-").map(Number), ep = end.split("-").map(Number);
  return (ep[0] - sp[0]) * 12 + ep[1] - sp[1];
}
function money(v, sign) {
  sign = sign || "";
  return sign + "฿" + Number(v || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 });
}
function monthLabel(val) {
  val = val || selectedMonth;
  const parts = val.split("-").map(Number);
  return MONTH_NAMES[parts[1] - 1] + " " + (parts[0] + 543);
}
function dateLabel(d) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(d + "T12:00:00"));
}
function validInstallmentForMonth(item, month) {
  const step = monthDiff(item.startMonth, month);
  return step >= 0 && step < item.months;
}
function paidInstallments(item) {
  return Math.min(Math.max(Number(item.paidCount || 0), 0), item.months);
}
function escapeHtml(v) {
  return String(v).replace(/[&<>'"]/g, function(c) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c];
  });
}
function emptyMarkup(text) {
  return '<div class="empty"><span>◌</span>' + text + '</div>';
}
function _id(id) { return document.getElementById(id); }

/* ─── Default data (uses current month) ─────────────────────── */
function defaultData() {
  var cm = selectedMonth;
  return {
    transactions: [
      { id: "tx1", type: "income",  title: "เงินเดือน",  amount: 32000, category: "salary",   date: cm + "-01", note: "" },
      { id: "tx2", type: "expense", title: "ค่าอาหาร",   amount: 1850,  category: "food",      date: cm + "-04", note: "" },
      { id: "tx3", type: "expense", title: "ค่าเดินทาง", amount: 1200,  category: "transport", date: cm + "-06", note: "" },
      { id: "tx4", type: "expense", title: "ค่าไฟฟ้า",   amount: 980,   category: "bills",     date: cm + "-08", note: "" },
      { id: "tx5", type: "expense", title: "ช้อปปิ้ง",   amount: 1460,  category: "shopping",  date: cm + "-10", note: "" }
    ],
    installments: [
      { id: "ins1", title: "ผ่อนโทรศัพท์มือถือ", amount: 700,  months: 12, paidCount: 2, startMonth: incrementMonth(cm, -2), category: "installment" },
      { id: "ins2", title: "ประกันชีวิต",         amount: 1250, months: 10, paidCount: 1, startMonth: incrementMonth(cm, -1), category: "bills" }
    ],
    notes: [
      { id: "note1", title: "กันเงินสำหรับค่าใช้จ่ายฉุกเฉิน", content: "ตั้งเป้าเก็บเงินสำรองอย่างน้อย 3,000 บาทภายในสิ้นเดือน", date: cm + "-30", createdAt: new Date().toISOString() }
    ]
  };
}

/* ─── Storage ────────────────────────────────────────────────── */
function loadData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      parsed.transactions = parsed.transactions || [];
      parsed.installments = parsed.installments || [];
      parsed.notes        = parsed.notes        || [];
      return parsed;
    }
  } catch (e) { console.warn("Could not load data:", e); }
  return defaultData();
}
function saveData() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch (e) { console.warn("Could not save data:", e); }
}

var data = loadData();

// Migrate: ensure every installment has a valid numeric paidCount
data.installments.forEach(function(item) {
  if (!Number.isFinite(Number(item.paidCount))) item.paidCount = 0;
  item.paidCount = Math.min(Math.max(Number(item.paidCount), 0), item.months);
});

/* ─── Data queries ───────────────────────────────────────────── */
function installmentsForMonth(month) {
  month = month || selectedMonth;
  return data.installments
    .filter(function(item) { return validInstallmentForMonth(item, month); })
    .map(function(item) {
      return {
        id: "auto-" + item.id + "-" + month,
        type: "expense",
        title: item.title,
        amount: item.amount,
        category: item.category,
        date: month + "-01",
        note: "",
        source: "installment",
        installment: item,
        installmentNumber: monthDiff(item.startMonth, month) + 1
      };
    });
}

function monthlyTransactions(month) {
  month = month || selectedMonth;
  var manual = data.transactions.filter(function(tx) { return tx.date.slice(0, 7) === month; });
  return manual.concat(installmentsForMonth(month))
    .sort(function(a, b) { return b.date.localeCompare(a.date); });
}

function monthlyTotals() {
  var list = monthlyTransactions();
  var income = 0, expense = 0, installment = 0;
  list.forEach(function(x) {
    if (x.type === "income")  income += x.amount;
    if (x.type === "expense") expense += x.amount;
    if (x.source === "installment") installment += x.amount;
  });
  return { income: income, expense: expense, installment: installment, balance: income - expense, list: list };
}

/* ─── Category selects ───────────────────────────────────────── */
function populateCategories(select, type) {
  var cats = type === "income" ? INCOME_CATS : EXPENSE_CATS;
  var prev = select.value;
  select.innerHTML = cats.map(function(k) {
    return '<option value="' + k + '">' + CATEGORY_META[k].label + '</option>';
  }).join("");
  if (cats.indexOf(prev) !== -1) select.value = prev;
}

/* ─── Render: transaction row ────────────────────────────────── */
function renderTransactionRow(item, withActions) {
  var meta    = CATEGORY_META[item.category] || CATEGORY_META.other;
  var income  = item.type === "income";
  var srcTag  = item.source
    ? '<span class="source-tag">งวด ' + item.installmentNumber + '/' + item.installment.months + '</span>'
    : "";
  var actions = (!item.source && withActions)
    ? '<div class="tx-actions">'
      + '<button class="tx-edit-btn" data-edit-tx="' + item.id + '" title="แก้ไข">✎</button>'
      + '<button class="tx-delete-btn" data-delete-tx="' + item.id + '" title="ลบ">✕</button>'
      + '</div>'
    : "";
  return '<div class="transaction-row">'
    + '<span class="transaction-icon ' + (income ? "income" : item.source ? "installment" : "") + '">' + meta.icon + '</span>'
    + '<div class="transaction-main">'
    + '<strong>' + escapeHtml(item.title) + srcTag + '</strong>'
    + '<small>' + meta.label + (item.note ? ' · ' + escapeHtml(item.note) : "") + '</small>'
    + '</div>'
    + '<span class="transaction-amount ' + (income ? "income" : "expense") + '">' + money(item.amount, income ? "+" : "−") + '</span>'
    + '<span class="transaction-date">' + dateLabel(item.date) + '</span>'
    + actions
    + '</div>';
}

/* ─── Render: Dashboard ──────────────────────────────────────── */
function renderDashboard() {
  var totals = monthlyTotals();
  _id("current-month").textContent = monthLabel();
  _id("balance-total").textContent = money(totals.balance);
  _id("income-total").textContent  = money(totals.income);
  _id("expense-total").textContent = money(totals.expense);
  _id("installment-in-expense").textContent = money(totals.installment);
  _id("balance-note").textContent  = totals.balance >= 0 ? "รายรับมากกว่ารายจ่าย" : "รายจ่ายมากกว่ารายรับ";
  _id("chart-income").textContent  = money(totals.income);
  _id("chart-expense").textContent = money(totals.expense);
  var max = Math.max(totals.income, totals.expense, 1);
  _id("income-bar").style.width  = Math.max(3, totals.income / max * 100) + "%";
  _id("expense-bar").style.width = Math.max(3, totals.expense / max * 100) + "%";
  _id("cashflow-insight").innerHTML = totals.balance >= 0
    ? "เดือนนี้เหลือเงิน <strong>" + money(totals.balance) + "</strong> หลังหักรายจ่ายทั้งหมดแล้ว"
    : "เดือนนี้เกินงบ <strong>" + money(Math.abs(totals.balance)) + "</strong> ลองตรวจสอบรายจ่ายเพิ่มเติม";
  _id("monthly-list-subtitle").textContent = totals.list.length + " รายการใน" + monthLabel();
  _id("monthly-transactions").innerHTML = totals.list.length
    ? totals.list.slice(0, 5).map(function(item) { return renderTransactionRow(item, false); }).join("")
    : emptyMarkup("ยังไม่มีรายการในเดือนนี้");
  renderCategoryChart(totals.list.filter(function(x) { return x.type === "expense"; }), totals.expense);
  renderQuestProgress();
}

function renderCategoryChart(expenses, total) {
  var grouped = {};
  expenses.forEach(function(x) { grouped[x.category] = (grouped[x.category] || 0) + x.amount; });
  var entries = Object.entries(grouped).sort(function(a,b) { return b[1]-a[1]; });
  var donut  = _id("category-donut");
  var legend = _id("category-legend");
  _id("donut-total").textContent = money(total);
  if (!entries.length) {
    donut.style.background = "conic-gradient(#e8ecf3 0deg 360deg)";
    legend.innerHTML = "<small style='color:#8b94a5'>ยังไม่มีรายจ่าย</small>";
    return;
  }
  var deg = 0;
  var segs = entries.map(function(entry) {
    var key = entry[0], amount = entry[1];
    var meta = CATEGORY_META[key] || CATEGORY_META.other;
    var next = deg + (amount / total) * 360;
    var out = meta.color + " " + deg + "deg " + next + "deg";
    deg = next;
    return out;
  });
  donut.style.background = "conic-gradient(" + segs.join(",") + ")";
  legend.innerHTML = entries.slice(0, 5).map(function(entry) {
    var key = entry[0], amount = entry[1];
    var meta = CATEGORY_META[key] || CATEGORY_META.other;
    return '<div class="legend-row"><i class="dot" style="background:' + meta.color + '"></i><span>' + meta.label + '</span><strong>' + money(amount) + '</strong></div>';
  }).join("");
}

function renderQuestProgress() {
  var days = {};
  data.transactions.forEach(function(tx) {
    if (tx.type === "expense" && tx.date.slice(0, 7) === selectedMonth) days[tx.date] = 1;
  });
  var done = Math.min(Object.keys(days).length, 7);
  var qSpan = _id("quest-days");
  var qBar  = _id("quest-bar");
  if (qSpan) qSpan.textContent = done + " / 7 วัน";
  if (qBar)  qBar.style.width  = Math.round((done / 7) * 100) + "%";
}

/* ─── Render: Transactions page summary cards ────────────────── */
function renderTxSummary() {
  var totals = monthlyTotals();
  var allList = monthlyTransactions();
  var incEl  = _id("tx-sum-income");
  var expEl  = _id("tx-sum-expense");
  var balEl  = _id("tx-sum-balance");
  var cntEl  = _id("tx-sum-count");
  if (!incEl) return;
  incEl.textContent = money(totals.income);
  expEl.textContent = money(totals.expense);
  balEl.textContent = money(totals.balance);
  // Highlight balance card color
  var balCard = balEl.closest(".tx-sum-card");
  if (balCard) {
    balCard.classList.toggle("tx-sum-balance-neg", totals.balance < 0);
  }
  cntEl.textContent = allList.length + " รายการ";
}

/* ─── Render: All transactions ───────────────────────────────── */
function renderAllTransactions() {
  var list = monthlyTransactions().filter(function(tx) {
    return txFilter === "all" || tx.type === txFilter;
  });
  _id("all-transactions").innerHTML = list.length
    ? list.map(function(item) { return renderTransactionRow(item, true); }).join("")
    : emptyMarkup("ไม่พบรายการประเภทนี้ในเดือนที่เลือก");
  renderTxSummary();
}

/* ─── Render: Installments ───────────────────────────────────── */
function renderInstallments() {
  var active   = data.installments.filter(function(item) { return paidInstallments(item) < item.months; });
  var monthly  = installmentsForMonth().reduce(function(s,x) { return s + x.amount; }, 0);
  var totalLeft = active.reduce(function(s,x) { return s + x.amount * (x.months - paidInstallments(x)); }, 0);

  _id("installment-summary").innerHTML =
    '<article class="installment-metric"><span>ยอดผ่อนของ' + monthLabel() + '</span><strong>' + money(monthly) + '</strong></article>'
    + '<article class="installment-metric"><span>รายการที่กำลังผ่อน</span><strong>' + active.length + ' รายการ</strong></article>'
    + '<article class="installment-metric"><span>ยอดคงเหลือโดยประมาณ</span><strong>' + money(totalLeft) + '</strong></article>';

  if (!data.installments.length) {
    _id("installment-list").innerHTML = emptyMarkup("ยังไม่มีรายการผ่อนชำระ");
    return;
  }

  _id("installment-list").innerHTML = data.installments.map(function(item) {
    var progress = paidInstallments(item);
    var isActive = validInstallmentForMonth(item, selectedMonth);
    var status   = progress >= item.months ? "ครบแล้ว"
                 : isActive                ? "กำลังผ่อน"
                 : monthDiff(item.startMonth, selectedMonth) < 0 ? "ยังไม่เริ่ม"
                 : "รอติดตาม";
    var paidAmt  = progress * item.amount;
    var leftAmt  = (item.months - progress) * item.amount;
    var pct      = Math.min((progress / item.months) * 100, 100).toFixed(1);
    var meta     = CATEGORY_META[item.category] || CATEGORY_META.other;
    var pillClass = progress >= item.months ? "pill pill-done" : "pill";
    return '<article class="installment-card">'
      + '<div class="installment-card-top">'
        + '<div class="installment-card-title">'
          + '<span class="transaction-icon installment">' + meta.icon + '</span>'
          + '<div><h3>' + escapeHtml(item.title) + '</h3><small>' + meta.label + ' · เริ่ม ' + monthLabel(item.startMonth) + '</small></div>'
        + '</div>'
        + '<span class="' + pillClass + '">' + status + '</span>'
      + '</div>'
      + '<div class="installment-price"><strong>' + money(item.amount) + ' <span>/ เดือน</span></strong><span>ผ่อนแล้ว ' + progress + '/' + item.months + ' งวด</span></div>'
      + '<div class="progress"><i style="width:' + pct + '%"></i></div>'
      + '<div class="installment-meta"><span>ชำระแล้ว ' + money(paidAmt) + ' · ' + progress + ' งวด</span><span>เหลือ ' + money(leftAmt) + '</span></div>'
      + '<div class="installment-card-foot">'
        + '<span>ยอดคงเหลือ ' + Math.max(item.months - progress, 0) + ' งวด</span>'
        + '<div class="installment-actions">'
          + '<button class="update-link" data-update-installment="' + item.id + '">อัปเดตยอดชำระ</button>'
          + '<button class="delete-link" data-delete-installment="' + item.id + '">ลบ</button>'
        + '</div>'
      + '</div>'
    + '</article>';
  }).join("");
}

/* ─── Render: Notes ──────────────────────────────────────────── */
function renderNotes() {
  var notes = data.notes.slice().sort(function(a,b) {
    return (b.date || b.createdAt).localeCompare(a.date || a.createdAt);
  });
  _id("notes-list").innerHTML = notes.length
    ? notes.map(function(note) {
        return '<article class="note-card">'
          + '<div class="note-card-top"><span class="note-icon">✎</span><button class="delete-link" data-delete-note="' + note.id + '">ลบ</button></div>'
          + '<h3>' + escapeHtml(note.title) + '</h3>'
          + '<p>' + escapeHtml(note.content) + '</p>'
          + '<div class="note-card-foot">'
            + '<span>' + (note.date ? "จำวันที่ " + dateLabel(note.date) : "บันทึกส่วนตัว") + '</span>'
            + '<span>' + (note.date ? note.date.slice(0,7) : "") + '</span>'
          + '</div>'
        + '</article>';
      }).join("")
    : emptyMarkup("ยังไม่มีบันทึกความจำ ลองเพิ่มเรื่องสำคัญที่อยากจำ");
}

function render() {
  renderDashboard();
  renderAllTransactions();
  renderInstallments();
  renderNotes();
}

/* ─── Navigation ─────────────────────────────────────────────── */
function switchPage(page) {
  activePage = page;
  document.querySelectorAll(".page").forEach(function(el) {
    el.classList.toggle("active", el.id === page + "-page");
  });
  document.querySelectorAll(".nav-item").forEach(function(el) {
    el.classList.toggle("active", el.dataset.page === page);
  });
  var titles = {
    dashboard:    ["ภาพรวม",         "สรุปการเงินของคุณ"],
    transactions: ["รายการทั้งหมด",  "รายการของ" + monthLabel()],
    installments: ["รายการผ่อนชำระ", "ติดตามค่าใช้จ่ายประจำเดือน"],
    notes:        ["บันทึกความจำ",   "เก็บทุกเรื่องสำคัญไว้กับคุณ"]
  };
  var cfg = titles[page] || ["",""];
  _id("page-title").textContent  = cfg[0];
  _id("page-kicker").textContent = cfg[1];
  var content = document.querySelector(".content");
  if (content) content.scrollTo({ top: 0, behavior: "smooth" });
}

/* ─── Modal helpers ──────────────────────────────────────────── */
function openModal(id) {
  var el = _id(id);
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
  setTimeout(function() {
    var first = el.querySelector("input:not([type=radio]):not([type=hidden]), textarea, select");
    if (first) first.focus();
  }, 60);
}
function closeModal(id) {
  var el = _id(id);
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
}

/* ─── Toast ──────────────────────────────────────────────────── */
var _toastTimer;
function toast(msg) {
  var el = _id("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() { el.classList.remove("show"); }, 2800);
}

/* ══════════════════════════════════════════════════════════════
   EVENT WIRING
   ══════════════════════════════════════════════════════════════ */

/* Navigation */
document.querySelectorAll(".nav-item").forEach(function(btn) {
  btn.addEventListener("click", function() { switchPage(btn.dataset.page); });
});
document.querySelectorAll("[data-page-link]").forEach(function(btn) {
  btn.addEventListener("click", function() { switchPage(btn.dataset.pageLink); });
});

/* Month picker */
document.querySelectorAll("[data-month-direction]").forEach(function(btn) {
  btn.addEventListener("click", function() {
    selectedMonth = incrementMonth(selectedMonth, Number(btn.dataset.monthDirection));
    render();
    switchPage(activePage);
  });
});

/* Close buttons & backdrop click */
document.querySelectorAll("[data-close]").forEach(function(btn) {
  btn.addEventListener("click", function() { closeModal(btn.dataset.close); });
});
document.querySelectorAll(".modal-backdrop").forEach(function(backdrop) {
  backdrop.addEventListener("click", function(e) {
    if (e.target === backdrop) closeModal(backdrop.id);
  });
});

/* Escape key */
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-backdrop.open").forEach(function(m) { closeModal(m.id); });
  }
});

/* Transaction category repopulate when type changes */
var txCategoryEl = _id("transaction-category");
document.querySelectorAll('input[name="transactionType"]').forEach(function(radio) {
  radio.addEventListener("change", function(e) { populateCategories(txCategoryEl, e.target.value); });
});

/* Filter buttons */
document.querySelectorAll(".filter").forEach(function(btn) {
  btn.addEventListener("click", function() {
    txFilter = btn.dataset.filter;
    document.querySelectorAll(".filter").forEach(function(x) {
      x.classList.toggle("active", x === btn);
    });
    renderAllTransactions();
  });
});

/* ─── Add Transaction modal ──────────────────────────────────── */
function openAddTransaction() {
  editingTxId = null;
  var form = _id("transaction-form");
  form.reset();
  form.querySelector('input[value="expense"]').checked = true;
  populateCategories(txCategoryEl, "expense");
  _id("transaction-date").value = selectedMonth + "-01";
  _id("tx-modal-title").textContent = "เพิ่มรายรับหรือรายจ่าย";
  _id("tx-submit-btn").textContent  = "บันทึกรายการ";
  openModal("transaction-modal");
}

function openEditTransaction(id) {
  var item = data.transactions.find(function(t) { return t.id === id; });
  if (!item) return;
  editingTxId = id;
  var form = _id("transaction-form");
  form.reset();
  form.querySelector('input[value="' + item.type + '"]').checked = true;
  populateCategories(txCategoryEl, item.type);
  form.querySelector('[name="title"]').value  = item.title;
  form.querySelector('[name="amount"]').value = item.amount;
  form.querySelector('[name="note"]').value   = item.note || "";
  _id("transaction-date").value = item.date;
  txCategoryEl.value = item.category;
  _id("tx-modal-title").textContent = "แก้ไขรายการ";
  _id("tx-submit-btn").textContent  = "บันทึกการแก้ไข";
  openModal("transaction-modal");
}

_id("open-transaction").addEventListener("click", openAddTransaction);
_id("open-transaction-secondary").addEventListener("click", openAddTransaction);

_id("transaction-form").addEventListener("submit", function(e) {
  e.preventDefault();
  var form   = new FormData(e.currentTarget);
  var type   = form.get("transactionType");
  var title  = form.get("title").trim();
  var amount = Number(form.get("amount"));
  var cat    = form.get("category");
  var date   = form.get("date");
  var note   = form.get("note").trim();
  if (!title || amount <= 0 || !date) { toast("⚠️ กรุณากรอกข้อมูลให้ครบถ้วน"); return; }
  if (editingTxId) {
    var idx = data.transactions.findIndex(function(t) { return t.id === editingTxId; });
    if (idx !== -1) data.transactions[idx] = { id: editingTxId, type: type, title: title, amount: amount, category: cat, date: date, note: note };
    toast("แก้ไขรายการเรียบร้อยแล้ว");
  } else {
    data.transactions.push({ id: uid(), type: type, title: title, amount: amount, category: cat, date: date, note: note });
    selectedMonth = date.slice(0, 7);
    toast("บันทึกรายการเรียบร้อยแล้ว");
  }
  editingTxId = null;
  saveData(); render(); switchPage(activePage);
  closeModal("transaction-modal");
});

/* Edit / Delete from all-transactions list */
_id("all-transactions").addEventListener("click", function(e) {
  var delId  = e.target.dataset.deleteTx;
  var editId = e.target.dataset.editTx;
  if (delId) {
    if (!confirm("ลบรายการนี้ใช่ไหม?")) return;
    data.transactions = data.transactions.filter(function(t) { return t.id !== delId; });
    saveData(); render();
    toast("ลบรายการแล้ว");
  }
  if (editId) openEditTransaction(editId);
});

/* ─── Installment modal ──────────────────────────────────────── */
_id("open-installment").addEventListener("click", function() {
  _id("installment-form").reset();
  _id("installment-start").value = selectedMonth;
  populateCategories(_id("installment-category"), "expense");
  openModal("installment-modal");
});

_id("installment-form").addEventListener("submit", function(e) {
  e.preventDefault();
  var form       = new FormData(e.currentTarget);
  var title      = form.get("title").trim();
  var amount     = Number(form.get("amount"));
  var months     = Number(form.get("months"));
  var paidCount  = Math.min(Math.max(Number(form.get("paidCount")), 0), months);
  var startMonth = form.get("startMonth");
  var category   = form.get("category");
  if (!title || amount <= 0 || months <= 0 || !startMonth) {
    toast("⚠️ กรุณากรอกข้อมูลให้ครบถ้วน"); return;
  }
  data.installments.push({ id: uid(), title: title, amount: amount, months: months, paidCount: paidCount, startMonth: startMonth, category: category });
  saveData(); render();
  e.currentTarget.reset();
  _id("installment-start").value = selectedMonth;
  populateCategories(_id("installment-category"), "expense");
  closeModal("installment-modal");
  toast("สร้างรายการผ่อนและตั้งค่ารายจ่ายอัตโนมัติแล้ว");
});

_id("installment-list").addEventListener("click", function(e) {
  var updateId = e.target.dataset.updateInstallment;
  var deleteId = e.target.dataset.deleteInstallment;
  if (updateId) {
    var item = data.installments.find(function(x) { return x.id === updateId; });
    if (!item) return;
    var meta = CATEGORY_META[item.category] || CATEGORY_META.other;
    _id("payment-item-id").value    = item.id;
    _id("payment-paid-count").value = paidInstallments(item);
    _id("payment-paid-count").max   = item.months;
    _id("payment-preview").innerHTML =
      '<span class="transaction-icon installment">' + meta.icon + '</span>'
      + '<div><strong>' + escapeHtml(item.title) + '</strong>'
      + '<small>' + money(item.amount) + ' ต่อเดือน · ทั้งหมด ' + item.months + ' งวด</small></div>';
    openModal("payment-modal");
  }
  if (deleteId) {
    if (!confirm("ลบรายการผ่อนชำระนี้ใช่ไหม?")) return;
    data.installments = data.installments.filter(function(x) { return x.id !== deleteId; });
    saveData(); render();
    toast("ลบรายการผ่อนชำระแล้ว");
  }
});

_id("payment-form").addEventListener("submit", function(e) {
  e.preventDefault();
  var form = new FormData(e.currentTarget);
  var item = data.installments.find(function(x) { return x.id === form.get("id"); });
  if (!item) return;
  item.paidCount = Math.min(Math.max(Number(form.get("paidCount")), 0), item.months);
  saveData(); render();
  closeModal("payment-modal");
  toast("อัปเดตยอดผ่อนชำระแล้ว");
});

/* ─── Note modal ─────────────────────────────────────────────── */
_id("open-note").addEventListener("click", function() {
  _id("note-form").reset();
  _id("note-date").value = selectedMonth + "-01";
  openModal("note-modal");
});

_id("note-form").addEventListener("submit", function(e) {
  e.preventDefault();
  var form    = new FormData(e.currentTarget);
  var title   = form.get("title").trim();
  var content = form.get("content").trim();
  if (!title || !content) { toast("⚠️ กรุณากรอกหัวข้อและรายละเอียด"); return; }
  data.notes.push({ id: uid(), title: title, content: content, date: form.get("date") || "", createdAt: new Date().toISOString() });
  saveData(); render();
  e.currentTarget.reset();
  _id("note-date").value = selectedMonth + "-01";
  closeModal("note-modal");
  toast("บันทึกความจำเรียบร้อยแล้ว");
});

_id("notes-list").addEventListener("click", function(e) {
  var id = e.target.dataset.deleteNote;
  if (!id) return;
  if (!confirm("ลบบันทึกนี้ใช่ไหม?")) return;
  data.notes = data.notes.filter(function(n) { return n.id !== id; });
  saveData(); render();
  toast("ลบบันทึกความจำแล้ว");
});

/* ─── Initial setup ──────────────────────────────────────────── */
populateCategories(txCategoryEl, "expense");
populateCategories(_id("installment-category"), "expense");
_id("transaction-date").value  = selectedMonth + "-01";
_id("installment-start").value = selectedMonth;
_id("note-date").value         = selectedMonth + "-01";

render();
switchPage("dashboard");

/* ══════════════════════════════════════════════════════════════
   SUPABASE AUTH INTEGRATION
   ══════════════════════════════════════════════════════════════ */

let _useCloud    = false;
let _currentUser = null;

/* ── Auth modal tab switcher ──────────────────────────────── */
function authSwitchTab(tab) {
  var isSignup = tab === "signup";
  document.getElementById("auth-name-group").style.display = isSignup ? "" : "none";
  document.getElementById("auth-tab-login").classList.toggle("active",  !isSignup);
  document.getElementById("auth-tab-signup").classList.toggle("active", isSignup);
  document.getElementById("auth-submit-btn").textContent = isSignup ? "สมัครสมาชิก" : "เข้าสู่ระบบ";
  document.getElementById("auth-error").style.display = "none";
  document.getElementById("auth-form").dataset.mode = tab;
}

/* ── Offline fallback ─────────────────────────────────────── */
function useOfflineMode(e) {
  if (e) e.preventDefault();
  _useCloud = false;
  closeModal("auth-modal");
  toast("ใช้งานแบบ Offline — ข้อมูลจะบันทึกในอุปกรณ์นี้เท่านั้น");
}

/* ── Auth form submit ─────────────────────────────────────── */
(function wireAuthForm() {
  var form = document.getElementById("auth-form");
  if (!form) return;
  form.dataset.mode = "login";
  form.addEventListener("submit", async function(e) {
    e.preventDefault();
    var mode  = form.dataset.mode || "login";
    var email = document.getElementById("auth-email").value.trim();
    var pass  = document.getElementById("auth-password").value;
    var name  = document.getElementById("auth-name").value.trim();
    var errEl = document.getElementById("auth-error");
    var btn   = document.getElementById("auth-submit-btn");
    errEl.style.display = "none";
    btn.disabled = true;
    btn.textContent = "กำลังดำเนินการ…";
    try {
      if (mode === "signup") {
        await window.SupabaseAuth.signUp(email, pass, name);
        toast("✅ สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยัน");
        authSwitchTab("login");
      } else {
        await window.SupabaseAuth.signIn(email, pass);
        // onAuthChange will handle the rest
      }
    } catch (err) {
      errEl.textContent = err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่";
      errEl.style.display = "";
    }
    btn.disabled = false;
    btn.textContent = form.dataset.mode === "signup" ? "สมัครสมาชิก" : "เข้าสู่ระบบ";
  });
})();

/* ── Profile chip (sidebar) ─────────────────────────────── */
function updateProfileChip(user) {
  var name   = (user && (user.user_metadata?.display_name || user.email?.split("@")[0])) || "ผู้ใช้";
  var avatar = name.charAt(0).toUpperCase();
  var prof   = document.querySelector(".profile");
  if (!prof) return;
  prof.innerHTML =
    '<span class="avatar">' + avatar + '</span>' +
    '<div><strong>' + name + '</strong><small>' + (user ? user.email : "Offline") + '</small></div>' +
    '<button style="background:none;border:none;cursor:pointer;color:var(--text-muted)" title="ออกจากระบบ" onclick="handleSignOut()">⎋</button>';
}

async function handleSignOut() {
  if (!confirm("ออกจากระบบใช่ไหม?")) return;
  try {
    await window.SupabaseAuth.signOut();
  } catch (_) {}
  _useCloud = false;
  _currentUser = null;
  // Reload page to reset state
  location.reload();
}

/* ── On auth state change ─────────────────────────────────── */
document.addEventListener("supabase:ready", async function() {
  window.SupabaseAuth.onAuthChange(async function(event, user) {
    if (user) {
      _currentUser = user;
      _useCloud    = true;
      closeModal("auth-modal");
      updateProfileChip(user);
      updateSafeCard(true);
      toast("🌸 ยินดีต้อนรับ " + (user.user_metadata?.display_name || user.email.split("@")[0]));
      // Load cloud data
      try {
        var cloudData = await window.SupabaseDB.loadAll();
        if (cloudData.transactions.length || cloudData.installments.length || cloudData.notes.length) {
          data.transactions  = cloudData.transactions;
          data.installments  = cloudData.installments;
          data.notes         = cloudData.notes;
          render();
        } else {
          // Migrate local data to cloud on first login
          await window.SupabaseMigration.migrateFromLocalStorage(STORAGE_KEY);
          var migrated = await window.SupabaseDB.loadAll();
          data.transactions = migrated.transactions.length ? migrated.transactions : data.transactions;
          data.installments = migrated.installments.length ? migrated.installments : data.installments;
          data.notes        = migrated.notes.length        ? migrated.notes        : data.notes;
          render();
        }
      } catch (err) {
        console.error("Failed to load cloud data:", err);
        toast("⚠️ โหลดข้อมูลจาก Cloud ไม่สำเร็จ — ใช้ข้อมูลในเครื่อง");
      }
    } else {
      // No session — show auth modal (defer so DOM is ready)
      setTimeout(function() {
        if (!_useCloud) openModal("auth-modal");
      }, 300);
    }
  });

  // Also check immediately
  var user = await window.SupabaseAuth.getUser();
  if (!user) {
    setTimeout(function() { if (!_useCloud) openModal("auth-modal"); }, 300);
  }
});

/* ── Safe card text update ────────────────────────────────── */
function updateSafeCard(cloud) {
  var card = document.querySelector(".safe-card div");
  if (!card) return;
  card.innerHTML = cloud
    ? "<strong>ข้อมูลปลอดภัยบน Cloud</strong><small>Supabase — เข้าถึงทุกอุปกรณ์</small>"
    : "<strong>ข้อมูลของคุณปลอดภัย</strong><small>บันทึกไว้ในอุปกรณ์นี้</small>";
}

/* ── Patch saveData to also save to Supabase ──────────────── */
var _originalSaveData = saveData;
saveData = async function() {
  _originalSaveData(); // always keep localStorage
};

/* Override add/edit/delete to use Supabase when logged in */
// Transactions
var _origTxSubmit = null;
(function patchTransactionForm() {
  var form = document.getElementById("transaction-form");
  if (!form) return;
  form.addEventListener("submit", async function patchSubmit(e) {
    if (!_useCloud || !_currentUser) return; // handled by original listener
    // Already saved locally by original listener, now sync to cloud
    try {
      var lastTx = data.transactions[data.transactions.length - 1];
      if (editingTxId) {
        var tx = data.transactions.find(function(t) { return t.id === editingTxId; });
        if (tx) await window.SupabaseDB.updateTransaction(tx.id, tx);
      } else if (lastTx) {
        var saved = await window.SupabaseDB.addTransaction(lastTx);
        // Update id with DB-generated UUID
        var idx = data.transactions.indexOf(lastTx);
        if (idx !== -1) data.transactions[idx].id = saved.id;
      }
    } catch (err) {
      console.warn("Cloud sync (transaction):", err.message);
    }
  }, true); // capture phase runs before original
})();

