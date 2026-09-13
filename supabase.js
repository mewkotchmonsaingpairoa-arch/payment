/* ══════════════════════════════════════════════════════════════
   PocketBloom — Supabase Backend Layer
   Supabase URL  : https://bzdrnwzrefyhclwviiuz.supabase.co
   Tables        : transactions, installments, notes
   ══════════════════════════════════════════════════════════════ */

const SUPABASE_URL  = "https://bzdrnwzrefyhclwviiuz.supabase.co";
/* NOTE: Replace SUPABASE_ANON_KEY below with your actual anon key from
         Supabase Dashboard → Settings → API → Project API Keys           */
const SUPABASE_ANON = window.__SUPABASE_ANON_KEY__ || "";

/* ── Load Supabase SDK from CDN ─────────────────────────────── */
(function loadSDK() {
  if (window.supabase) { _initClient(); return; }
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
  s.onload = _initClient;
  document.head.appendChild(s);
})();

let _client = null;
let _readyCBs = [];

function _initClient() {
  _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  _readyCBs.forEach(fn => fn(_client));
  _readyCBs = [];
  document.dispatchEvent(new CustomEvent("supabase:ready", { detail: { client: _client } }));
}

function getClient() {
  return new Promise(resolve => {
    if (_client) { resolve(_client); return; }
    _readyCBs.push(resolve);
  });
}

/* ══════════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════════ */
const SupabaseAuth = {
  async signUp(email, password, displayName) {
    const c = await getClient();
    const { data, error } = await c.auth.signUp({ email, password, options: { data: { display_name: displayName || email.split("@")[0] } } });
    if (error) throw error;
    return data;
  },
  async signIn(email, password) {
    const c = await getClient();
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },
  async signOut() {
    const c = await getClient();
    const { error } = await c.auth.signOut();
    if (error) throw error;
  },
  async getUser() {
    const c = await getClient();
    const { data: { user } } = await c.auth.getUser();
    return user;
  },
  async onAuthChange(callback) {
    const c = await getClient();
    c.auth.onAuthStateChange((event, session) => callback(event, session?.user ?? null));
  }
};

/* ══════════════════════════════════════════════════════════════
   DATABASE — TRANSACTIONS
   ══════════════════════════════════════════════════════════════ */
const SupabaseDB = {

  /* Transactions */
  async getTransactions() {
    const [c, user] = await _cu();
    if (!user) return [];
    const { data, error } = await c.from("transactions").select("*").eq("user_id", user.id).order("date", { ascending: false });
    if (error) { console.error("getTransactions:", error.message); return []; }
    return (data || []).map(_txFromDB);
  },
  async addTransaction(tx) {
    const [c, user] = await _cu();
    _requireUser(user);
    const { data, error } = await c.from("transactions").insert([_txToDB(tx, user.id)]).select().single();
    if (error) throw error;
    return _txFromDB(data);
  },
  async updateTransaction(id, tx) {
    const [c, user] = await _cu();
    _requireUser(user);
    const { data, error } = await c.from("transactions").update(_txToDB(tx, user.id)).eq("id", id).eq("user_id", user.id).select().single();
    if (error) throw error;
    return _txFromDB(data);
  },
  async deleteTransaction(id) {
    const [c, user] = await _cu();
    _requireUser(user);
    const { error } = await c.from("transactions").delete().eq("id", id).eq("user_id", user.id);
    if (error) throw error;
  },

  /* Installments */
  async getInstallments() {
    const [c, user] = await _cu();
    if (!user) return [];
    const { data, error } = await c.from("installments").select("*").eq("user_id", user.id).order("created_at", { ascending: true });
    if (error) { console.error("getInstallments:", error.message); return []; }
    return (data || []).map(_instFromDB);
  },
  async addInstallment(inst) {
    const [c, user] = await _cu();
    _requireUser(user);
    const { data, error } = await c.from("installments").insert([_instToDB(inst, user.id)]).select().single();
    if (error) throw error;
    return _instFromDB(data);
  },
  async updateInstallment(id, inst) {
    const [c, user] = await _cu();
    _requireUser(user);
    const { data, error } = await c.from("installments").update(_instToDB(inst, user.id)).eq("id", id).eq("user_id", user.id).select().single();
    if (error) throw error;
    return _instFromDB(data);
  },
  async deleteInstallment(id) {
    const [c, user] = await _cu();
    _requireUser(user);
    const { error } = await c.from("installments").delete().eq("id", id).eq("user_id", user.id);
    if (error) throw error;
  },

  /* Notes */
  async getNotes() {
    const [c, user] = await _cu();
    if (!user) return [];
    const { data, error } = await c.from("notes").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) { console.error("getNotes:", error.message); return []; }
    return (data || []).map(_noteFromDB);
  },
  async addNote(note) {
    const [c, user] = await _cu();
    _requireUser(user);
    const { data, error } = await c.from("notes").insert([_noteToDB(note, user.id)]).select().single();
    if (error) throw error;
    return _noteFromDB(data);
  },
  async deleteNote(id) {
    const [c, user] = await _cu();
    _requireUser(user);
    const { error } = await c.from("notes").delete().eq("id", id).eq("user_id", user.id);
    if (error) throw error;
  },

  /* Load all at once */
  async loadAll() {
    const [transactions, installments, notes] = await Promise.all([
      SupabaseDB.getTransactions(),
      SupabaseDB.getInstallments(),
      SupabaseDB.getNotes()
    ]);
    return { transactions, installments, notes };
  }
};

/* ══════════════════════════════════════════════════════════════
   REALTIME
   ══════════════════════════════════════════════════════════════ */
const SupabaseRealtime = {
  _channels: [],
  async subscribe(userId, onChange) {
    const c = await getClient();
    ["transactions", "installments", "notes"].forEach(table => {
      const ch = c.channel(`pb:${table}:${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` }, payload => onChange(table, payload))
        .subscribe();
      this._channels.push(ch);
    });
  },
  async unsubscribeAll() {
    const c = await getClient();
    this._channels.forEach(ch => c.removeChannel(ch));
    this._channels = [];
  }
};

/* ══════════════════════════════════════════════════════════════
   MIGRATION  localStorage → Supabase
   ══════════════════════════════════════════════════════════════ */
const SupabaseMigration = {
  async migrateFromLocalStorage(storageKey) {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { migrated: false };
    let local;
    try { local = JSON.parse(raw); } catch { return { migrated: false }; }
    const user = await SupabaseAuth.getUser();
    if (!user) return { migrated: false };
    const c = await getClient();
    const { count } = await c.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    if (count > 0) return { migrated: false, reason: "already has data" };
    const rows = [
      ...((local.transactions || []).map(tx   => c.from("transactions").insert(_txToDB(tx, user.id)))),
      ...((local.installments || []).map(inst => c.from("installments").insert(_instToDB(inst, user.id)))),
      ...((local.notes        || []).map(note => c.from("notes").insert(_noteToDB(note, user.id))))
    ];
    await Promise.allSettled(rows);
    localStorage.setItem(storageKey + ":migrated", "1");
    return { migrated: true };
  }
};

/* ══════════════════════════════════════════════════════════════
   INTERNAL HELPERS
   ══════════════════════════════════════════════════════════════ */
async function _cu() {
  const c = await getClient();
  const user = await SupabaseAuth.getUser();
  return [c, user];
}
function _requireUser(user) { if (!user) throw new Error("ยังไม่ได้เข้าสู่ระบบ"); }

function _txToDB(tx, uid)   { return { user_id: uid, type: tx.type, title: tx.title, amount: +tx.amount, category: tx.category, date: tx.date, note: tx.note || "" }; }
function _txFromDB(r)       { return { id: r.id, type: r.type, title: r.title, amount: +r.amount, category: r.category, date: r.date, note: r.note || "" }; }

function _instToDB(i, uid)  { return { user_id: uid, title: i.title, amount: +i.amount, months: +i.months, paid_count: +(i.paidCount||0), start_month: i.startMonth, category: i.category }; }
function _instFromDB(r)     { return { id: r.id, title: r.title, amount: +r.amount, months: +r.months, paidCount: +(r.paid_count||0), startMonth: r.start_month, category: r.category }; }

function _noteToDB(n, uid)  { return { user_id: uid, title: n.title, content: n.content, date: n.date || null }; }
function _noteFromDB(r)     { return { id: r.id, title: r.title, content: r.content, date: r.date || "", createdAt: r.created_at }; }

/* ── Globals ────────────────────────────────────────────────── */
window.SupabaseAuth      = SupabaseAuth;
window.SupabaseDB        = SupabaseDB;
window.SupabaseRealtime  = SupabaseRealtime;
window.SupabaseMigration = SupabaseMigration;
