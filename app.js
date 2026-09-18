/* ─── Constants ──────────────────────────────────────────────── */
const MONTH_NAMES = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
/* ─── Category meta (base + user-defined, loaded at boot) ───── */
const _BASE_CATEGORY_META = {
  food:        { label: "อาหารและเครื่องดื่ม",  icon: "◒", color: "#f29b52", fixed: true },
  transport:   { label: "เดินทาง",               icon: "⌁", color: "#6388d8", fixed: true },
  bills:       { label: "บิลและสาธารณูปโภค",     icon: "⌂", color: "#8d77d5", fixed: true },
  shopping:    { label: "ช้อปปิ้ง",              icon: "◇", color: "#e7809b", fixed: true },
  installment: { label: "ผ่อนชำระ",              icon: "◫", color: "#8b70d4", fixed: true },
  health:      { label: "สุขภาพ",                icon: "✚", color: "#4bb59b", fixed: true },
  other:       { label: "อื่น ๆ",                icon: "○", color: "#9da7b9", fixed: true },
  salary:      { label: "เงินเดือน",             icon: "▣", color: "#21a67a", fixed: true },
  freelance:   { label: "รายได้เสริม",           icon: "✦", color: "#3e9d7d", fixed: true }
};

function _loadCustomCategories() {
  try {
    var raw = localStorage.getItem(CAT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch(_) {}
  return {};
}
function _saveCustomCategories() {
  var customs = {};
  Object.keys(CATEGORY_META).forEach(function(k) {
    if (!CATEGORY_META[k].fixed) customs[k] = CATEGORY_META[k];
  });
  localStorage.setItem(CAT_STORAGE_KEY, JSON.stringify(customs));
}

/* Merge base + custom at boot */
var CATEGORY_META = Object.assign({}, _BASE_CATEGORY_META, _loadCustomCategories());
/* Derived lists (will be updated when categories change) */
var EXPENSE_CATS, INCOME_CATS;
function _rebuildCatLists() {
  EXPENSE_CATS = [];
  INCOME_CATS  = [];
  Object.keys(CATEGORY_META).forEach(function(k) {
    var m = CATEGORY_META[k];
    if (m.type === "income") INCOME_CATS.push(k);
    else if (k === "salary" || k === "freelance") INCOME_CATS.push(k);
    else EXPENSE_CATS.push(k);
  });
  /* ensure "other" stays at end of expense */
  EXPENSE_CATS = EXPENSE_CATS.filter(function(k){ return k !== "other"; });
  EXPENSE_CATS.push("other");
}
_rebuildCatLists();
const STORAGE_KEY  = "pocketbloom-v2";
const CAT_STORAGE_KEY = "pocketbloom-cats-v1";

/* ─── Icon palette for custom categories ───────────────────── */
const CAT_ICONS  = ["●","◆","▤","★","❤","✔","○","⋆","⊙","↵","⌂","⟂","⏁","☄","✎","▫","♪","☀","✈","⚽"];
const CAT_COLORS = ["#f29b52","#6388d8","#8d77d5","#e7809b","#4bb59b","#e5a54b","#5db8de","#e87272","#7dc98f","#9da7b9","#21a67a","#3e9d7d","#c56ba8","#d4885a","#6cb3e0"];

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
let activePage           = "dashboard";
let txFilter             = "all";
let editingTxId          = null;
let editingInstallmentId = null;
let editingNoteId        = null;

let _useCloud    = false;
let _currentUser = null;
let _isSyncing   = false;   /* guard: prevent Realtime from overwriting local changes */

async function cloudSyncTx(op, id, tx) {
  if (!_useCloud || !_currentUser || !window.SupabaseDB) return;
  _isSyncing = true;
  try {
    if (op === "add")    { var saved = await window.SupabaseDB.addTransaction(tx); if (saved && saved.id) tx.id = saved.id; }
    if (op === "update") { await window.SupabaseDB.updateTransaction(id, tx); }
    if (op === "delete") { await window.SupabaseDB.deleteTransaction(id); }
  } catch (err) { console.warn("Cloud sync TX:", err.message); }
  finally { setTimeout(function() { _isSyncing = false; }, 1500); }
}

async function cloudSyncInst(op, id, inst) {
  if (!_useCloud || !_currentUser || !window.SupabaseDB) return;
  _isSyncing = true;
  try {
    if (op === "add")    { var saved = await window.SupabaseDB.addInstallment(inst); if (saved && saved.id) inst.id = saved.id; }
    if (op === "update") { await window.SupabaseDB.updateInstallment(id, inst); }
    if (op === "delete") { await window.SupabaseDB.deleteInstallment(id); }
  } catch (err) { console.warn("Cloud sync INST:", err.message); }
  finally { setTimeout(function() { _isSyncing = false; }, 1500); }
}

async function cloudSyncNote(op, id, note) {
  if (!_useCloud || !_currentUser || !window.SupabaseDB) return;
  _isSyncing = true;
  try {
    if (op === "add")    { var saved = await window.SupabaseDB.addNote(note); if (saved && saved.id) note.id = saved.id; }
    if (op === "update") { await window.SupabaseDB.updateNote(id, note); }
    if (op === "delete") { await window.SupabaseDB.deleteNote(id); }
  } catch (err) { console.warn("Cloud sync NOTE:", err.message); }
  finally { setTimeout(function() { _isSyncing = false; }, 1500); }
}

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

/* ─── Empty data (new users start clean) ─────────────────── */
function defaultData() {
  return { transactions: [], installments: [], notes: [] };
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
  if (typeof _useCloud !== "undefined" && _useCloud && _currentUser) return;   /* cloud is source of truth */
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
    var meta = CATEGORY_META[k] || CATEGORY_META.other;
    return '<option value="' + k + '">' + meta.icon + ' ' + meta.label + '</option>';
  }).join("");
  if (cats.indexOf(prev) !== -1) select.value = prev;
}

/* ─── Category Management Modal ─────────────────────────── */
var _selectedCatIcon  = CAT_ICONS[0];
var _selectedCatColor = CAT_COLORS[0];

function renderCategoryModal() {
  ["expense","income"].forEach(function(type) {
    var cats = type === "income" ? INCOME_CATS : EXPENSE_CATS;
    var el = _id("cat-chips-" + type);
    if (!el) return;
    el.innerHTML = cats.map(function(k) {
      var m = CATEGORY_META[k];
      var delBtn = !m.fixed
        ? '<button class="cat-chip-del" data-del-cat="' + k + '" title="ลบ">&times;</button>'
        : '';
      return '<span class="cat-chip" style="border-color:' + m.color + ';background:' + m.color + '22">'
        + '<i style="background:' + m.color + '">' + m.icon + '</i>'
        + m.label + delBtn + '</span>';
    }).join("");
  });

  /* Icon picker */
  var picker = _id("cat-icon-picker");
  if (picker) {
    picker.innerHTML = CAT_ICONS.map(function(ic) {
      return '<button type="button" class="icon-opt' + (ic === _selectedCatIcon ? ' selected' : '') + '" data-icon="' + ic + '">' + ic + '</button>';
    }).join("") + CAT_COLORS.map(function(cl) {
      return '<button type="button" class="color-opt' + (cl === _selectedCatColor ? ' selected' : '') + '" data-color="' + cl + '" style="background:' + cl + '" title="' + cl + '"></button>';
    }).join("");
  }
  if (_id("cat-icon-val"))  _id("cat-icon-val").value  = _selectedCatIcon;
  if (_id("cat-color-val")) _id("cat-color-val").value = _selectedCatColor;
}

function openCategoryModal() {
  _selectedCatIcon  = CAT_ICONS[0];
  _selectedCatColor = CAT_COLORS[0];
  renderCategoryModal();
  if (_id("add-category-form")) _id("add-category-form").reset();
  openModal("category-modal");
}

/* Wire ALL [data-open-categories] buttons via delegation (transaction form, installment form, sidebar, etc.) */
document.addEventListener("click", function(e) {
  if (e.target.closest("[data-open-categories]")) { openCategoryModal(); }
});
(function() {
  /* legacy — kept so existing id still works if present */

  /* Chip icon/color picker clicks */
  var picker = _id("cat-icon-picker");
  if (picker) {
    picker.addEventListener("click", function(e) {
      var iconBtn  = e.target.closest("[data-icon]");
      var colorBtn = e.target.closest("[data-color]");
      if (iconBtn) {
        _selectedCatIcon = iconBtn.dataset.icon;
        picker.querySelectorAll(".icon-opt").forEach(function(b) { b.classList.toggle("selected", b === iconBtn); });
        if (_id("cat-icon-val")) _id("cat-icon-val").value = _selectedCatIcon;
      }
      if (colorBtn) {
        _selectedCatColor = colorBtn.dataset.color;
        picker.querySelectorAll(".color-opt").forEach(function(b) { b.classList.toggle("selected", b === colorBtn); });
        if (_id("cat-color-val")) _id("cat-color-val").value = _selectedCatColor;
      }
    });
  }

  /* Add category form */
  var addForm = _id("add-category-form");
  if (addForm) {
    addForm.addEventListener("submit", function(e) {
      e.preventDefault();
      var fd    = new FormData(addForm);
      var label = fd.get("catLabel").trim();
      var type  = fd.get("catType");
      var icon  = fd.get("catIcon") || _selectedCatIcon;
      var color = fd.get("catColor") || _selectedCatColor;
      if (!label) { toast("⚠️ กรุณาใส่ชื่อหมวดหมู่"); return; }
      /* Generate a key from label */
      var key = "cat_" + label.replace(/\s+/g, "_").toLowerCase() + "_" + Date.now().toString(36);
      CATEGORY_META[key] = { label: label, icon: icon, color: color, type: type, fixed: false };
      _rebuildCatLists();
      _saveCustomCategories();
      /* Refresh category dropdowns */
      var txType = document.querySelector('input[name="transactionType"]:checked');
      populateCategories(_id("transaction-category"), txType ? txType.value : "expense");
      populateCategories(_id("installment-category"), "expense");
      addForm.reset();
      renderCategoryModal();
      toast("✅ เพิ่มหมวดหมู่ \"" + label + "\" แล้ว");
    });
  }

  /* Delete custom category chips */
  document.addEventListener("click", function(e) {
    var delKey = e.target.dataset.delCat;
    if (!delKey) return;
    if (!confirm("ลบหมวดหมู่ \"" + (CATEGORY_META[delKey] ? CATEGORY_META[delKey].label : delKey) + "\" ใช่ไหม?")) return;
    delete CATEGORY_META[delKey];
    _rebuildCatLists();
    _saveCustomCategories();
    var txType = document.querySelector('input[name="transactionType"]:checked');
    populateCategories(_id("transaction-category"), txType ? txType.value : "expense");
    populateCategories(_id("installment-category"), "expense");
    renderCategoryModal();
    toast("ลบหมวดหมู่แล้ว");
  });
})();

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
    ? totals.list.slice(0, 5).map(function(item) { return renderTransactionRow(item, true); }).join("")
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
          + '<button class="tx-edit-btn" data-edit-installment="' + item.id + '" title="แก้ไข">✎</button>'
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
          + '<div class="note-card-top"><span class="note-icon">✎</span>'
          + '<div class="note-card-actions">'
          + '<button class="tx-edit-btn" data-edit-note="' + note.id + '" title="แก้ไข">✎</button>'
          + '<button class="delete-link" data-delete-note="' + note.id + '">ลบ</button>'
          + '</div></div>'
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

/* Filter buttons — scoped to transactions page only */
document.querySelectorAll("#transactions-page .filter[data-filter]").forEach(function(btn) {
  btn.addEventListener("click", function() {
    txFilter = btn.dataset.filter;
    document.querySelectorAll("#transactions-page .filter[data-filter]").forEach(function(x) {
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
  var item = data.transactions.find(function(t) { return String(t.id) === String(id); });
  if (!item) return;
  editingTxId = item.id;
  var form = _id("transaction-form");
  form.reset();
  var radio = form.querySelector('input[value="' + item.type + '"]');
  if (radio) radio.checked = true;
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
    var editId = editingTxId;
    var idx = data.transactions.findIndex(function(t) { return String(t.id) === String(editId); });
    if (idx !== -1) {
      data.transactions[idx] = { id: editId, type: type, title: title, amount: amount, category: cat, date: date, note: note };
      cloudSyncTx("update", editId, data.transactions[idx]);
    }
    toast("แก้ไขรายการเรียบร้อยแล้ว");
  } else {
    var newTx = { id: uid(), type: type, title: title, amount: amount, category: cat, date: date, note: note };
    data.transactions.push(newTx);
    selectedMonth = date.slice(0, 7);
    cloudSyncTx("add", null, newTx);
    toast("บันทึกรายการเรียบร้อยแล้ว");
  }
  editingTxId = null;
  saveData(); render(); switchPage(activePage);
  closeModal("transaction-modal");
});

/* Edit / Delete handler (shared between dashboard list and all-transactions list) */
function handleTxListClick(e) {
  var delBtn  = e.target.closest("[data-delete-tx]");
  var editBtn = e.target.closest("[data-edit-tx]");
  if (delBtn) {
    var delId = delBtn.dataset.deleteTx;
    if (!confirm("ลบรายการนี้ใช่ไหม?")) return;
    data.transactions = data.transactions.filter(function(t) { return String(t.id) !== String(delId); });
    cloudSyncTx("delete", delId, null);
    saveData(); render();
    toast("ลบรายการแล้ว");
  }
  if (editBtn) {
    var editId = editBtn.dataset.editTx;
    openEditTransaction(editId);
  }
}

/* Edit / Delete from all-transactions list */
_id("all-transactions").addEventListener("click", handleTxListClick);

/* Edit / Delete from dashboard monthly-transactions list */
_id("monthly-transactions").addEventListener("click", handleTxListClick);

/* ─── Installment modal — auto-calculation ───────────────────── */
var _instCalcLock = false;   /* prevent circular update */

function updateInstCalcPreview() {
  var amtEl    = _id("inst-amount");
  var totEl    = _id("inst-total");
  var monthsEl = _id("inst-months");
  var preview  = _id("inst-calc-preview");
  if (!amtEl || !totEl || !monthsEl || !preview) return;
  var amt    = parseFloat(amtEl.value)  || 0;
  var tot    = parseFloat(totEl.value)  || 0;
  var months = parseInt(monthsEl.value) || 0;
  if (amt > 0 && months > 0) {
    preview.style.display = "";
    preview.innerHTML =
      '<span class="inst-preview-row"><span>ยอดต่องวด</span><strong>' + money(amt) + '</strong></span>'
      + '<span class="inst-preview-row"><span>จำนวนงวด</span><strong>' + months + ' งวด</strong></span>'
      + '<span class="inst-preview-row highlight"><span>ยอดรวมทั้งหมด</span><strong>' + money(amt * months) + '</strong></span>';
  } else {
    preview.style.display = "none";
  }
}

function wireInstCalc() {
  var amtEl    = _id("inst-amount");
  var totEl    = _id("inst-total");
  var monthsEl = _id("inst-months");
  if (!amtEl || !totEl || !monthsEl) return;

  function onAmtOrMonthsChange() {
    if (_instCalcLock) return;
    var amt    = parseFloat(amtEl.value);
    var months = parseInt(monthsEl.value);
    if (amt > 0 && months > 0) {
      _instCalcLock = true;
      totEl.value = Math.round(amt * months * 100) / 100;
      _instCalcLock = false;
    } else if (!amt && totEl.value) {
      /* clear total if amount cleared */
      _instCalcLock = true;
      totEl.value = "";
      _instCalcLock = false;
    }
    updateInstCalcPreview();
  }

  function onTotalChange() {
    if (_instCalcLock) return;
    var tot    = parseFloat(totEl.value);
    var months = parseInt(monthsEl.value);
    if (tot > 0 && months > 0) {
      _instCalcLock = true;
      amtEl.value = Math.round((tot / months) * 100) / 100;
      _instCalcLock = false;
    } else if (!tot && amtEl.value) {
      _instCalcLock = true;
      amtEl.value = "";
      _instCalcLock = false;
    }
    updateInstCalcPreview();
  }

  amtEl.addEventListener("input", onAmtOrMonthsChange);
  monthsEl.addEventListener("input", function() {
    /* Recalc whichever field was filled last */
    if (totEl.value) onTotalChange(); else onAmtOrMonthsChange();
  });
  totEl.addEventListener("input", onTotalChange);
}
wireInstCalc();

function openAddInstallment() {
  editingInstallmentId = null;
  var form = _id("installment-form");
  form.reset();
  _id("installment-edit-id").value = "";
  _id("installment-start").value = selectedMonth;
  if (_id("inst-total")) _id("inst-total").value = "";
  if (_id("inst-calc-preview")) _id("inst-calc-preview").style.display = "none";
  populateCategories(_id("installment-category"), "expense");
  _id("installment-modal-title").textContent = "เพิ่มรายการผ่อนชำระ";
  _id("installment-submit-btn").textContent  = "สร้างรายการผ่อน";
  openModal("installment-modal");
}

function openEditInstallment(id) {
  var item = data.installments.find(function(x) { return String(x.id) === String(id); });
  if (!item) return;
  editingInstallmentId = item.id;
  var form = _id("installment-form");
  form.reset();
  _id("installment-edit-id").value = item.id;
  form.querySelector('[name="title"]').value      = item.title;
  form.querySelector('[name="amount"]').value     = item.amount;
  form.querySelector('[name="months"]').value     = item.months;
  form.querySelector('[name="paidCount"]').value  = paidInstallments(item);
  /* Populate totalAmount */
  if (_id("inst-total")) _id("inst-total").value = Math.round(item.amount * item.months * 100) / 100;
  _id("installment-start").value = item.startMonth;
  populateCategories(_id("installment-category"), "expense");
  _id("installment-category").value = item.category;
  _id("installment-modal-title").textContent = "แก้ไขรายการผ่อน";
  _id("installment-submit-btn").textContent  = "บันทึกการแก้ไข";
  updateInstCalcPreview();
  openModal("installment-modal");
}

_id("open-installment").addEventListener("click", openAddInstallment);

_id("installment-form").addEventListener("submit", function(e) {
  e.preventDefault();
  var form       = new FormData(e.currentTarget);
  var title      = form.get("title").trim();
  var amtRaw     = parseFloat(form.get("amount"));
  var totRaw     = parseFloat(form.get("totalAmount"));
  var months     = Number(form.get("months"));
  var paidCount  = Math.min(Math.max(Number(form.get("paidCount")), 0), months);
  var startMonth = form.get("startMonth");
  var category   = form.get("category");
  /* Resolve amount: prefer per-installment; fall back to total / months */
  var amount = amtRaw > 0 ? amtRaw
             : (totRaw > 0 && months > 0) ? Math.round((totRaw / months) * 100) / 100
             : 0;
  if (!title || amount <= 0 || months <= 0 || !startMonth) {
    toast("⚠️ กรุณากรอกข้อมูลให้ครบถ้วน"); return;
  }
  if (editingInstallmentId) {
    var editId = editingInstallmentId;
    var idx = data.installments.findIndex(function(x) { return String(x.id) === String(editId); });
    if (idx !== -1) {
      data.installments[idx] = { id: editId, title: title, amount: amount, months: months, paidCount: paidCount, startMonth: startMonth, category: category };
      cloudSyncInst("update", editId, data.installments[idx]);
    }
    editingInstallmentId = null;
    saveData(); render();
    closeModal("installment-modal");
    toast("แก้ไขรายการผ่อนเรียบร้อยแล้ว");
  } else {
    var newInst = { id: uid(), title: title, amount: amount, months: months, paidCount: paidCount, startMonth: startMonth, category: category };
    data.installments.push(newInst);
    cloudSyncInst("add", null, newInst);
    saveData(); render();
    e.currentTarget.reset();
    if (_id("inst-total")) _id("inst-total").value = "";
    if (_id("inst-calc-preview")) _id("inst-calc-preview").style.display = "none";
    _id("installment-start").value = selectedMonth;
    populateCategories(_id("installment-category"), "expense");
    closeModal("installment-modal");
    toast("สร้างรายการผ่อนและตั้งค่ารายจ่ายอัตโนมัติแล้ว");
  }
});

_id("installment-list").addEventListener("click", function(e) {
  var updateBtn = e.target.closest("[data-update-installment]");
  var deleteBtn = e.target.closest("[data-delete-installment]");
  var editBtn   = e.target.closest("[data-edit-installment]");
  if (updateBtn) {
    var updateId = updateBtn.dataset.updateInstallment;
    var item = data.installments.find(function(x) { return String(x.id) === String(updateId); });
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
  if (editBtn) {
    var editId = editBtn.dataset.editInstallment;
    openEditInstallment(editId);
  }
  if (deleteBtn) {
    var deleteId = deleteBtn.dataset.deleteInstallment;
    if (!confirm("ลบรายการผ่อนชำระนี้ใช่ไหม?")) return;
    data.installments = data.installments.filter(function(x) { return String(x.id) !== String(deleteId); });
    cloudSyncInst("delete", deleteId, null);
    saveData(); render();
    toast("ลบรายการผ่อนชำระแล้ว");
  }
});

_id("payment-form").addEventListener("submit", function(e) {
  e.preventDefault();
  var form = new FormData(e.currentTarget);
  var id   = form.get("id");
  var item = data.installments.find(function(x) { return String(x.id) === String(id); });
  if (!item) return;
  item.paidCount = Math.min(Math.max(Number(form.get("paidCount")), 0), item.months);
  cloudSyncInst("update", item.id, item);
  saveData(); render();
  closeModal("payment-modal");
  toast("อัปเดตยอดผ่อนชำระแล้ว");
});

/* ─── Note modal ─────────────────────────────────────────────── */
function openAddNote() {
  editingNoteId = null;
  var form = _id("note-form");
  form.reset();
  _id("note-edit-id").value = "";
  _id("note-date").value = selectedMonth + "-01";
  _id("note-modal-title").textContent = "เพิ่มบันทึกความจำ";
  _id("note-submit-btn").textContent  = "บันทึกความจำ";
  openModal("note-modal");
}

function openEditNote(id) {
  var note = data.notes.find(function(n) { return String(n.id) === String(id); });
  if (!note) return;
  editingNoteId = note.id;
  var form = _id("note-form");
  form.reset();
  _id("note-edit-id").value = note.id;
  form.querySelector('[name="title"]').value   = note.title;
  form.querySelector('[name="content"]').value = note.content;
  _id("note-date").value = note.date || "";
  _id("note-modal-title").textContent = "แก้ไขบันทึก";
  _id("note-submit-btn").textContent  = "บันทึกการแก้ไข";
  openModal("note-modal");
}

_id("open-note").addEventListener("click", openAddNote);

_id("note-form").addEventListener("submit", function(e) {
  e.preventDefault();
  var form    = new FormData(e.currentTarget);
  var title   = form.get("title").trim();
  var content = form.get("content").trim();
  var date    = form.get("date") || "";
  if (!title || !content) { toast("⚠️ กรุณากรอกหัวข้อและรายละเอียด"); return; }
  if (editingNoteId) {
    var editId = editingNoteId;
    var idx = data.notes.findIndex(function(n) { return String(n.id) === String(editId); });
    if (idx !== -1) {
      data.notes[idx] = Object.assign({}, data.notes[idx], { title: title, content: content, date: date });
      cloudSyncNote("update", editId, data.notes[idx]);
    }
    editingNoteId = null;
    saveData(); render();
    closeModal("note-modal");
    toast("แก้ไขบันทึกเรียบร้อยแล้ว");
  } else {
    var newNote = { id: uid(), title: title, content: content, date: date, createdAt: new Date().toISOString() };
    data.notes.push(newNote);
    cloudSyncNote("add", null, newNote);
    saveData(); render();
    e.currentTarget.reset();
    _id("note-date").value = selectedMonth + "-01";
    closeModal("note-modal");
    toast("บันทึกความจำเรียบร้อยแล้ว");
  }
});

_id("notes-list").addEventListener("click", function(e) {
  var editBtn = e.target.closest("[data-edit-note]");
  var delBtn  = e.target.closest("[data-delete-note]");
  if (editBtn) {
    var editId = editBtn.dataset.editNote;
    openEditNote(editId);
    return;
  }
  if (!delBtn) return;
  var delId = delBtn.dataset.deleteNote;
  if (!confirm("ลบบันทึกนี้ใช่ไหม?")) return;
  data.notes = data.notes.filter(function(n) { return String(n.id) !== String(delId); });
  cloudSyncNote("delete", delId, null);
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
   SUPABASE AUTH INTEGRATION  v2  (ครอบคลุมทุก operation)
   ══════════════════════════════════════════════════════════════ */

/* ── Loading overlay ────────────────────────────────        */
function showCloudLoader(msg) {
  var el = _id("cloud-loader");
  if (!el) {
    el = document.createElement("div");
    el.id = "cloud-loader";
    el.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(15,16,30,.82);backdrop-filter:blur(6px);color:#fff;font-size:15px";
    el.innerHTML = '<div style="width:38px;height:38px;border:3px solid #8b70d4;border-top-color:transparent;border-radius:50%;animation:spin 0.7s linear infinite"></div><span id="cloud-loader-msg"></span>';
    if (!document.getElementById("spin-style")) {
      var st = document.createElement("style");
      st.id = "spin-style";
      st.textContent = "@keyframes spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(st);
    }
    document.body.appendChild(el);
  }
  el.querySelector("#cloud-loader-msg").textContent = msg || "กำลังเชื่อมต่อ Cloud…";
  el.style.display = "flex";
}
function hideCloudLoader() {
  var el = _id("cloud-loader");
  if (el) el.style.display = "none";
}

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

/* ── reCAPTCHA v3 (score-based, invisible) ────────────────── */
var RECAPTCHA_ACTION = "auth";

function recaptchaToken() {
  return new Promise(function(resolve) {
    if (!window.grecaptcha || !window.__RECAPTCHA_SITE_KEY__) { resolve(null); return; }
    try {
      grecaptcha.ready(function() {
        grecaptcha.execute(window.__RECAPTCHA_SITE_KEY__, { action: RECAPTCHA_ACTION })
          .then(function(token) { resolve(token || null); })
          .catch(function(err) { console.error("reCAPTCHA:", err); resolve(null); });
      });
    } catch (err) { console.error("reCAPTCHA:", err); resolve(null); }
  });
}

/* ── Friendly Thai error messages ─────────────────────────── */
function authErrorThai(err) {
  var msg = (err && err.message) || "";
  var code = (err && (err.code || err.error_code)) || "";
  if (msg.indexOf("Invalid API key") !== -1 || msg.indexOf("Invalid login credentials") !== -1) {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง (หรือยังไม่ได้ยืนยันอีเมล)";
  }
  if (msg.indexOf("Email not confirmed") !== -1) return "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ (ตรวจสอบกล่องจดหมาย)";
  if (msg.indexOf("already registered") !== -1) return "อีเมลนี้สมัครสมาชิกไว้แล้ว ลองเข้าสู่ระบบแทน";
  if (msg.indexOf("rate limit") !== -1) return "พยายามหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่";
  if (code === "user_banned") return "บัญชีนี้ถูกระงับการใช้งาน";
  return msg || "เกิดข้อผิดพลาด กรุณาลองใหม่";
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
    var name  = document.getElementById("auth-name") ? document.getElementById("auth-name").value.trim() : "";
    var errEl = document.getElementById("auth-error");
    var btn   = document.getElementById("auth-submit-btn");
    errEl.style.display = "none";

    /* reCAPTCHA v3 — token is optional (gracefully degraded) */
    var captchaToken = await recaptchaToken();

    btn.disabled = true;
    btn.textContent = "กำลังดำเนินการ…";
    try {
      if (mode === "signup") {
        await window.SupabaseAuth.signUp(email, pass, name, captchaToken);
        toast("✅ สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยัน แล้วกลับมา Login");
        authSwitchTab("login");
      } else {
        await window.SupabaseAuth.signIn(email, pass, captchaToken);
        // onAuthChange handles the rest
      }
    } catch (err) {
      errEl.textContent = authErrorThai(err);
      errEl.style.display = "";
    }
    btn.disabled = false;
    btn.textContent = form.dataset.mode === "signup" ? "สมัครสมาชิก" : "เข้าสู่ระบบ";
  });
})();

/* ── Profile chip ─────────────────────────────────────────── */
function updateProfileChip(user) {
  var name   = (user && (user.user_metadata?.display_name || user.email?.split("@")[0])) || "ผู้ใช้";
  var avatar = name.charAt(0).toUpperCase();
  /* Update avatar letter */
  var avatarEl = document.querySelector(".profile .avatar");
  if (avatarEl) avatarEl.textContent = avatar;
  /* Update name/email */
  var infoEl = document.querySelector(".profile .profile-info");
  if (infoEl) infoEl.innerHTML = '<strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(user ? user.email : "Offline") + '</small>';
  /* Show signout button */
  var btnEl = _id("signout-btn");
  if (btnEl) btnEl.style.display = "";

  /* ── Update mobile profile buttons ── */
  /* topbar button */
  var mobAvatar = _id("mobile-avatar");
  if (mobAvatar) mobAvatar.textContent = user ? avatar : "♡";
  /* bottom nav button */
  var mobNavAvatar = _id("mobile-nav-avatar");
  var mobNavLabel  = _id("mobile-nav-label");
  if (mobNavAvatar) mobNavAvatar.textContent = user ? avatar : "⊙";
  if (mobNavLabel)  mobNavLabel.textContent  = user ? name.split(" ")[0] : "เข้าสู่ระบบ";
  /* Style: highlight if logged in */
  var mobAccountBtn = _id("mobile-account-btn");
  if (mobAccountBtn) mobAccountBtn.classList.toggle("mobile-account-active", !!user);
  var mobProfileBtn = _id("mobile-profile-btn");
  if (mobProfileBtn) mobProfileBtn.classList.toggle("mobile-profile-active", !!user);
}

/* ── Mobile account buttons wiring ──────────────────────── */
(function wireMobileAccountButtons() {
  /* Bottom nav account button */
  var mobBtn = _id("mobile-account-btn");
  if (mobBtn) {
    mobBtn.addEventListener("click", function() {
      if (_currentUser) {
        /* Already logged in → ask to sign out */
        if (confirm("ออกจากระบบ (" + (_currentUser.email || "") + ") ใช่ไหม?")) {
          handleSignOut();
        }
      } else {
        openModal("auth-modal");
      }
    });
  }
  /* Topbar profile button */
  var mobProfileBtn = _id("mobile-profile-btn");
  if (mobProfileBtn) {
    mobProfileBtn.addEventListener("click", function() {
      if (_currentUser) {
        if (confirm("ออกจากระบบ (" + (_currentUser.email || "") + ") ใช่ไหม?")) {
          handleSignOut();
        }
      } else {
        openModal("auth-modal");
      }
    });
  }
})();

async function handleSignOut() {
  if (!confirm("ออกจากระบบใช่ไหม?")) return;
  try { await window.SupabaseRealtime.unsubscribeAll(); } catch (_) {}
  try { await window.SupabaseAuth.signOut(); } catch (_) {}
  _useCloud = false;
  _currentUser = null;
  location.reload();
}

/* ── Safe card ────────────────────────────────────────────── */
function updateSafeCard(cloud) {
  var card = document.querySelector(".safe-card div");
  if (!card) return;
  card.innerHTML = cloud
    ? "<strong>ข้อมูลปลอดภัยบน Cloud</strong><small>Supabase — เข้าถึงทุกอุปกรณ์</small>"
    : "<strong>ข้อมูลของคุณปลอดภัย</strong><small>บันทึกไว้ในอุปกรณ์นี้</small>";
}

/* ══════════════════════════════════════════════════════════════
   CLOUD SYNC HELPERS  (เรียกหลัง localStorage save ทุกครั้ง)
/* ══════════════════════════════════════════════════════════════
   ON AUTH STATE CHANGE — main orchestrator
   ══════════════════════════════════════════════════════════════ */
document.addEventListener("supabase:ready", async function() {

  /* Restore session if already logged in */
  var sessionUser = await window.SupabaseAuth.getUser();
  if (!sessionUser) {
    setTimeout(function() { if (!_useCloud) openModal("auth-modal"); }, 400);
  }

  /* Listen for login / logout events */
  window.SupabaseAuth.onAuthChange(async function(event, user) {
    if (user) {
      var isSameUser = _currentUser && _currentUser.id === user.id;
      _currentUser = user;
      _useCloud    = true;
      closeModal("auth-modal");
      updateProfileChip(user);
      updateSafeCard(true);

      // If already connected and just a background token refresh or user update, skip full reload/resubscribe
      if (isSameUser && (event === "TOKEN_REFRESHED" || event === "USER_UPDATED")) {
        return;
      }

      showCloudLoader("กำลังโหลดข้อมูลจาก Cloud…");
      try {
        /* Try to migrate localStorage first (no-op if already has data) */
        await window.SupabaseMigration.migrateFromLocalStorage(STORAGE_KEY);

        var cloudData = await window.SupabaseDB.loadAll();
        if (cloudData.transactions.length || cloudData.installments.length || cloudData.notes.length) {
          data.transactions = cloudData.transactions;
          data.installments = cloudData.installments;
          data.notes        = cloudData.notes;
          saveData(); // keep localStorage in sync
        }
        render();
        toast("🌸 ยินดีต้อนรับ " + (user.user_metadata?.display_name || user.email.split("@")[0]));

        /* Start Realtime */
        await window.SupabaseRealtime.subscribe(user.id, function(table, payload) {
          // On remote change from ANOTHER device → reload data
          // Skip if WE triggered this event (local sync in progress)
          if (_isSyncing) return;
          window.SupabaseDB.loadAll().then(function(d) {
            data.transactions = d.transactions;
            data.installments = d.installments;
            data.notes        = d.notes;
            saveData();
            render();
          }).catch(function() {});
        });

      } catch (err) {
        console.error("Cloud load error:", err);
        toast("⚠️ โหลดข้อมูลจาก Cloud ไม่สำเร็จ — ใช้ข้อมูลในเครื่อง");
      } finally {
        hideCloudLoader();
      }

    } else {
      /* Logged out */
      _useCloud    = false;
      _currentUser = null;
      try { await window.SupabaseRealtime.unsubscribeAll(); } catch (_) {}
      updateSafeCard(false);
      setTimeout(function() { if (!_useCloud) openModal("auth-modal"); }, 300);
    }
  });
});


/* ══════════════════════════════════════════════════════════════
   CSP-SAFE EVENT BINDINGS (replaces inline onclick attributes)
   ══════════════════════════════════════════════════════════════ */
_id("signout-btn").addEventListener("click", handleSignOut);
_id("auth-tab-login").addEventListener("click", function() { authSwitchTab("login"); });
_id("auth-tab-signup").addEventListener("click", function() { authSwitchTab("signup"); });
_id("auth-offline-link").addEventListener("click", function(e) { useOfflineMode(e); });
