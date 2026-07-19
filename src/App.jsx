import { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ─── Constants ───────────────────────────────────────────────
const DEFAULT_CHECKLIST = [
  { key: "moodboard", label: "Moodboard" },
  { key: "location", label: "Location" },
  { key: "mua", label: "MUA" },
  { key: "styling", label: "Styling" },
  { key: "shootDate", label: "Shoot Date" },
];

const CYCLE = ["tbd", "not started", "pending", "halfway", "set", "confirmed"];
const STATUS_OPTIONS = ["Planning", "Early Stage", "In Progress", "Outreach", "Confirmed", "Wrapped"];
const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];
const TAG_OPTIONS = ["Wedding", "Editorial", "Portrait", "Agency", "Fashion", "Content", "Commercial", "Lifestyle"];
const IMAGE_CATEGORIES = ["Moodboard", "Inspiration", "Reference", "Behind The Scenes", "Final"];
const SORT_OPTIONS = ["Newest", "Oldest", "Shoot Date", "Alphabetical", "Completion %"];

const PRIORITY_COLORS = {
  Low:    { bg: "#1a1a2e", text: "#818cf8" },
  Medium: { bg: "#2e2a1a", text: "#fbbf24" },
  High:   { bg: "#2e1a1a", text: "#f87171" },
  Urgent: { bg: "#3e0a0a", text: "#ff6b6b" },
};

const STATUS_COLORS = {
  "In Progress":  { bg: "#1a2e1a", text: "#4ade80", dot: "#22c55e" },
  Planning:       { bg: "#1a1f2e", text: "#818cf8", dot: "#6366f1" },
  "Early Stage":  { bg: "#2e1a2e", text: "#c084fc", dot: "#a855f7" },
  Outreach:       { bg: "#2e2a1a", text: "#fbbf24", dot: "#f59e0b" },
  Confirmed:      { bg: "#1a2e2e", text: "#22d3ee", dot: "#06b6d4" },
  Wrapped:        { bg: "#1a1a1a", text: "#94a3b8", dot: "#64748b" },
};

const ROLE_COLORS = {
  Model: { bg: "#1a1a30", text: "#818cf8", border: "#2d2d50" },
  MUA:   { bg: "#2e1a2e", text: "#c084fc", border: "#3d2a3d" },
  Team:  { bg: "#1a2a2a", text: "#22d3ee", border: "#2a3d3d" },
};

// ─── ID Generation ────────────────────────────────────────────
let _idCounter = Date.now();
const genId = () => ++_idCounter;

// ─── Pure Helpers ────────────────────────────────────────────
const makeItems = (overrides = {}) => {
  const base = {};
  DEFAULT_CHECKLIST.forEach((f) => { base[f.key] = "tbd"; });
  return { ...base, ...overrides };
};

const makeDeadlines = () => {
  const base = {};
  DEFAULT_CHECKLIST.forEach((f) => { base[f.key] = ""; });
  return base;
};

const toKey = (label) =>
  label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") + "_" + genId();

const readiness = (checklist, items) => {
  if (!checklist.length) return 0;
  const scores = checklist.map(({ key }) => {
    const v = items[key] || "tbd";
    if (v === "set" || v === "confirmed") return 1;
    if (v === "halfway") return 0.5;
    return 0;
  });
  return Math.round((scores.reduce((a, b) => a + b, 0) / checklist.length) * 100);
};

const taskCounters = (checklist, items, deadlines) => {
  const completed = checklist.filter(({ key }) => {
    const v = items[key] || "tbd";
    return v === "set" || v === "confirmed";
  }).length;
  const overdue = checklist.filter(({ key }) => {
    const dl = deadlines?.[key];
    const v = items[key] || "tbd";
    return dl && isOverdue(dl) && v !== "set" && v !== "confirmed";
  }).length;
  return { completed, remaining: checklist.length - completed, overdue };
};

const rColor = (val) => {
  if (val === "set" || val === "confirmed") return "#4ade80";
  if (val === "halfway") return "#fbbf24";
  return "#f87171";
};

const rLabel = (val) => {
  if (val === "set") return "✓ Set";
  if (val === "confirmed") return "✓ Done";
  if (val === "halfway") return "~ Halfway";
  if (val === "pending") return "⏳ Pending";
  if (val === "not started") return "✗ Not Started";
  return "TBD";
};

const fmt = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString();
};

const fmtDate = (str) => {
  if (!str) return null;
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const isOverdue = (str) => {
  if (!str) return false;
  return new Date(str + "T00:00:00") < new Date();
};

// ─── Calendar Helpers ─────────────────────────────────────────
const calendarHelpers = {
  getUpcoming: (shoots) =>
    shoots
      .filter((s) => s.shootDate && !s.completedAt && new Date(s.shootDate + "T00:00:00") >= new Date())
      .sort((a, b) => new Date(a.shootDate) - new Date(b.shootDate)),

  getThisWeek: (shoots) =>
    shoots.filter((s) => {
      if (!s.shootDate || s.completedAt) return false;
      const d = new Date(s.shootDate + "T00:00:00");
      const now = new Date();
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() + 7);
      return d >= now && d <= weekEnd;
    }),

  getThisMonth: (shoots) =>
    shoots.filter((s) => {
      if (!s.shootDate || s.completedAt) return false;
      const d = new Date(s.shootDate + "T00:00:00");
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }),

  getOverdueDeadlines: (shoots) => {
    const results = [];
    shoots.forEach((s) => {
      if (s.completedAt) return;
      s.checklist.forEach(({ key, label }) => {
        const dl = s.deadlines?.[key];
        const v = s.items[key] || "tbd";
        if (dl && isOverdue(dl) && v !== "set" && v !== "confirmed") {
          results.push({ shoot: s, key, label, deadline: dl });
        }
      });
    });
    return results;
  },
};

// ─── Dashboard Analytics ──────────────────────────────────────
const getDashboard = (shoots) => {
  const active = shoots.filter((s) => !s.completedAt);
  const completed = shoots.filter((s) => s.completedAt);
  const revenueProjected = shoots.reduce((sum, s) => sum + (s.budget?.total || 0), 0);
  const revenueReceived = shoots.reduce((sum, s) => sum + (s.budget?.paid || 0), 0);
  const avgReadiness = active.length
    ? Math.round(active.reduce((sum, s) => sum + readiness(s.checklist, s.items), 0) / active.length)
    : 0;
  return {
    total: shoots.length,
    active: active.length,
    completed: completed.length,
    upcoming: calendarHelpers.getUpcoming(shoots).length,
    thisWeek: calendarHelpers.getThisWeek(shoots).length,
    revenueProjected,
    revenueReceived,
    avgReadiness,
    shootReady: active.filter((s) => readiness(s.checklist, s.items) === 100).length,
  };
};

// ─── Shoot Factory ────────────────────────────────────────────
const makeShoot = (title, type, status, itemOverrides = {}, notes = "", members = [], paired = false) => ({
  id: genId(),
  title,
  type,
  status,
  paired,
  priority: "Medium",
  tags: [],
  shootDate: "",
  completedAt: null,
  notes,
  members,
  images: [],
  log: [],
  checklist: DEFAULT_CHECKLIST.map((f) => ({ ...f })),
  items: makeItems(itemOverrides),
  deadlines: makeDeadlines(),
  client: { name: "", email: "", phone: "", instagram: "" },
  budget: { total: 0, deposit: 0, paid: 0, remaining: 0 },
  callSheet: { callTime: "", locationAddress: "", parkingInfo: "", wardrobeNotes: "", equipmentNotes: "", specialInstructions: "" },
});

const INITIAL = [
  makeShoot("Jumoke + Queen", "Editorial / On Location", "In Progress",
    { moodboard: "set", location: "confirmed", mua: "set", styling: "pending", shootDate: "pending" },
    "Proposed dates: July 18 or July 25",
    [{ name: "Jumoke", role: "Model", email: "", phone: "" }, { name: "Queen", role: "Model", email: "", phone: "" }]),
  makeShoot("LADE Mgmt", "Agency / Paired Shoots", "Planning",
    { moodboard: "halfway" },
    "14 total models, shooting 6–8. All paired shoots.", [], true),
  makeShoot("Jaycina", "Solo", "Early Stage",
    { moodboard: "not started" },
    "Moodboard not set yet. Start here.",
    [{ name: "Jaycina", role: "Model", email: "", phone: "" }]),
  makeShoot("IG DMs — Pending Models", "Outreach / Pipeline", "Outreach",
    { moodboard: "not started" },
    "Check DMs → build moodboard → contact with board → set date. MUA: provided or they can bring their own.", []),
  makeShoot("Wedding Mock Shoot", "Styled Shoot / On Location", "Planning",
    { moodboard: "not started" },
    "1 bride + 1 groom model. Need sizes + accessories + shoes. Call time 5AM. Shoot 7–8AM.",
    [{ name: "Bride Model", role: "Model", email: "", phone: "" }, { name: "Groom Model", role: "Model", email: "", phone: "" }]),
];

// ─── LocalStorage ─────────────────────────────────────────────
const LS_KEY = "ajayi_shoots_v2";
const LS_UI_KEY = "ajayi_ui_v2";
const LS_NOTIF_KEY = "ajayi_notif_v2";

const saveToLS = (key, data) => {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {}
};

const loadFromLS = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) { return fallback; }
};

const reviveShoots = (shoots) =>
  shoots.map((s) => ({
    ...s,
    log: (s.log || []).map((e) => ({ ...e, time: new Date(e.time) })),
    client: s.client || { name: "", email: "", phone: "", instagram: "" },
    budget: s.budget || { total: 0, deposit: 0, paid: 0, remaining: 0 },
    callSheet: s.callSheet || { callTime: "", locationAddress: "", parkingInfo: "", wardrobeNotes: "", equipmentNotes: "", specialInstructions: "" },
    priority: s.priority || "Medium",
    tags: s.tags || [],
    images: (s.images || []).map((img) => ({ ...img, category: img.category || "Moodboard", caption: img.caption || "" })),
  }));

const reviveNotifs = (notifs) => (notifs || []).map((n) => ({ ...n, time: new Date(n.time) }));

// ─── Export / Import ──────────────────────────────────────────
const exportData = (shoots, notifications) => {
  const blob = new Blob(
    [JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), shoots, notifications }, null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ajayi-studios-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── Sub-components ─────────────────────────────────────────
const Pill = ({ children, style }) => (
  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 9px", borderRadius: 20, ...style }}>{children}</span>
);

const Btn = ({ onClick, children, style, danger, success }) => (
  <button onClick={onClick} style={{
    border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
    background: danger ? "#2e1a1a" : success ? "#1a2e1a" : "#6366f1",
    color: danger ? "#f87171" : success ? "#4ade80" : "#fff", ...style,
  }}>{children}</button>
);

const Input = ({ value, onChange, onKeyDown, placeholder, type, style }) => (
  <input value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} type={type || "text"}
    style={{
      background: "#16162a", border: "1px solid #2d2d50", borderRadius: 8,
      color: "#e2e8f0", padding: "7px 12px", fontSize: 12, outline: "none",
      fontFamily: "inherit", colorScheme: "dark", ...style,
    }} />
);

const Select = ({ value, onChange, options, style }) => (
  <select value={value} onChange={onChange}
    style={{
      background: "#16162a", border: "1px solid #2d2d50", borderRadius: 8,
      color: "#e2e8f0", padding: "7px 10px", fontSize: 12, outline: "none",
      fontFamily: "inherit", cursor: "pointer", ...style,
    }}>
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

// ─── Main App ────────────────────────────────────────────────
export default function App() {
  // ── Core State
  const [shoots, setShoots] = useState(() => {
    try {
      const saved = localStorage.getItem("ajayi_shoots");
      return saved ? reviveShoots(JSON.parse(saved)) : INITIAL;
    } catch (e) {
      return INITIAL;
    }
  });

  const [expanded, setExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem("ajayi_ui");
      return saved ? JSON.parse(saved)?.expanded || null : null;
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem("ajayi_ui");
      return saved ? JSON.parse(saved)?.activeTab || {} : {};
    } catch {
      return {};
    }
  });

  const [notifications, setNotifications] = useState(() => {
    try {
      const saved = localStorage.getItem("ajayi_notifications");
      return saved ? reviveNotifs(JSON.parse(saved)) : [];
    } catch {
      return [];
    }
  });

  const [showNotifs, setShowNotifs] = useState(false);
  const [showAddShoot, setShowAddShoot] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [editDeadline, setEditDeadline] = useState({});

  // ── Search / Sort / Filter
  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      const saved = localStorage.getItem("ajayi_ui");
      return saved ? JSON.parse(saved)?.searchQuery || "" : "";
    } catch {
      return "";
    }
  });

  const [sortBy, setSortBy] = useState(() => {
    try {
      const saved = localStorage.getItem("ajayi_ui");
      return saved ? JSON.parse(saved)?.sortBy || "Newest" : "Newest";
    } catch {
      return "Newest";
    }
  });

  const [filterStatus, setFilterStatus] = useState(() => {
    try {
      const saved = localStorage.getItem("ajayi_ui");
      return saved ? JSON.parse(saved)?.filterStatus || "All" : "All";
    } catch {
      return "All";
    }
  });

  // ── Edit State
  const [editNote, setEditNote] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [newItem, setNewItem] = useState({});
  const [newMember, setNewMember] = useState({});
  const [showMemberForm, setShowMemberForm] = useState({});
  const [newShoot, setNewShoot] = useState({
    title: "",
    type: "",
    status: "Planning",
    priority: "Medium",
  });

  const importRef = useRef(null);
  const prevPct = useRef({});
  const fileInputRefs = useRef({});

  // ── Persist to localStorage
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem("ajayi_shoots", JSON.stringify(shoots));
      setSaveError(null);
    } catch (e) {
      setSaveError("Your changes aren't being saved — your browser is blocking storage (Private Browsing mode, or storage is full).");
    }
  }, [shoots]);

  useEffect(() => {
    try {
      localStorage.setItem("ajayi_notifications", JSON.stringify(notifications));
    } catch (_) {}
  }, [notifications]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "ajayi_ui",
        JSON.stringify({
          expanded,
          activeTab,
          searchQuery,
          sortBy,
          filterStatus,
        })
      );
    } catch (_) {}
  }, [expanded, activeTab, searchQuery, sortBy, filterStatus]);
  // ── Notification helpers
  const pushNotif = useCallback((shootId, shootTitle, message) => {
    setNotifications((prev) =>
      [{ id: genId(), shootId, shootTitle, message, time: new Date() }, ...prev].slice(0, 50)
    );
  }, []);

  const logEntry = useCallback((shootId, message) => {
    setShoots((prev) =>
      prev.map((s) =>
        s.id === shootId
          ? { ...s, log: [{ id: genId(), message, time: new Date() }, ...s.log].slice(0, 30) }
          : s
      )
    );
  }, []);

  // ── Watch for 100% readiness
  useEffect(() => {
    shoots.forEach((s) => {
      if (s.completedAt) return;
      const pct = readiness(s.checklist, s.items);
      const prev = prevPct.current[s.id];
      if (pct === 100 && prev !== undefined && prev < 100) {
        pushNotif(s.id, s.title, `🎉 ${s.title} is 100% ready!`);
        setShowNotifModal(s);
      }
      prevPct.current[s.id] = pct;
    });
  }, [shoots, pushNotif]);

  // ── Notify upcoming shoots within 48h (on load only)
  useEffect(() => {
    const now = new Date();
    shoots.forEach((s) => {
      if (!s.shootDate || s.completedAt) return;
      const hoursUntil = (new Date(s.shootDate + "T00:00:00") - now) / 36e5;
      if (hoursUntil >= 0 && hoursUntil <= 48) {
        pushNotif(s.id, s.title, `📅 Upcoming: ${s.title} in ${Math.round(hoursUntil)}h`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions
  const updateShoot = useCallback((id, patch) =>
    setShoots((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s)), []);

  const cycleStatus = useCallback((shootId, key) => {
    let nextLabel = "";
    let shootTitle = "";
    setShoots((prev) =>
      prev.map((s) => {
        if (s.id !== shootId) return s;
        const curr = s.items[key] || "tbd";
        const idx = CYCLE.indexOf(curr);
        const next = CYCLE[(idx + 1) % CYCLE.length];
        const field = s.checklist.find((f) => f.key === key)?.label || key;
        nextLabel = `${field} → ${rLabel(next)}`;
        shootTitle = s.title;
        return { ...s, items: { ...s.items, [key]: next } };
      })
    );
    if (nextLabel) {
      logEntry(shootId, nextLabel);
      pushNotif(shootId, shootTitle, `📋 ${shootTitle}: ${nextLabel}`);
    }
  }, [logEntry, pushNotif]);

  const setDeadline = useCallback((shootId, key, val) => {
    setShoots((prev) => {
      const updated = prev.map((s) =>
        s.id !== shootId ? s : { ...s, deadlines: { ...s.deadlines, [key]: val } }
      );
      if (val) {
        const shoot = updated.find((s) => s.id === shootId);
        const field = shoot?.checklist.find((f) => f.key === key)?.label || key;
        logEntry(shootId, `Deadline set for ${field}: ${fmtDate(val)}`);
      }
      return updated;
    });
  }, [logEntry]);

  const addChecklistItem = useCallback((shootId) => {
    const label = (newItem[shootId] || "").trim();
    if (!label) return;
    const key = toKey(label);
    setShoots((prev) =>
      prev.map((s) => s.id !== shootId ? s : {
        ...s,
        checklist: [...s.checklist, { key, label }],
        items: { ...s.items, [key]: "tbd" },
        deadlines: { ...s.deadlines, [key]: "" },
      })
    );
    logEntry(shootId, `Added task: ${label}`);
    setNewItem((p) => ({ ...p, [shootId]: "" }));
  }, [newItem, logEntry]);

  const removeChecklistItem = useCallback((shootId, key) => {
    setShoots((prev) =>
      prev.map((s) => {
        if (s.id !== shootId) return s;
        const newItems = { ...s.items };
        const newDeadlines = { ...s.deadlines };
        delete newItems[key];
        delete newDeadlines[key];
        return { ...s, checklist: s.checklist.filter((f) => f.key !== key), items: newItems, deadlines: newDeadlines };
      })
    );
  }, []);

  const addMember = useCallback((shootId) => {
    const m = newMember[shootId] || {};
    if (!m.name?.trim()) return;
    const member = { name: m.name.trim(), role: m.role || "Model", email: m.email || "", phone: m.phone || "" };
    let shootTitle = "";
    setShoots((prev) =>
      prev.map((s) => {
        if (s.id !== shootId) return s;
        shootTitle = s.title;
        return { ...s, members: [...s.members, member] };
      })
    );
    logEntry(shootId, `Added ${member.role}: ${member.name}`);
    pushNotif(shootId, shootTitle, `👤 ${member.name} (${member.role}) added`);
    setNewMember((p) => ({ ...p, [shootId]: {} }));
    setShowMemberForm((p) => ({ ...p, [shootId]: false }));
  }, [newMember, logEntry, pushNotif]);

  const removeMember = useCallback((shootId, idx) => {
    let memberName = "";
    setShoots((prev) =>
      prev.map((s) => {
        if (s.id !== shootId) return s;
        memberName = s.members[idx]?.name;
        return { ...s, members: s.members.filter((_, i) => i !== idx) };
      })
    );
    if (memberName) logEntry(shootId, `Removed member: ${memberName}`);
  }, [logEntry]);

  const saveNote = useCallback((id) => {
    setShoots((prev) => prev.map((s) => s.id === id ? { ...s, notes: noteText } : s));
    logEntry(id, "Notes updated");
    setEditNote(null);
  }, [noteText, logEntry]);

  const addShoot = useCallback(() => {
    if (!newShoot.title.trim()) return;
    const s = makeShoot(newShoot.title.trim(), newShoot.type || "General", newShoot.status);
    s.priority = newShoot.priority || "Medium";
    setShoots((prev) => [...prev, s]);
    setNewShoot({ title: "", type: "", status: "Planning", priority: "Medium" });
    setShowAddShoot(false);
    pushNotif(s.id, s.title, `📸 New shoot added: ${s.title}`);
  }, [newShoot, pushNotif]);

  const deleteShoot = useCallback((id) => {
    setShoots((prev) => prev.filter((s) => s.id !== id));
    if (expanded === id) setExpanded(null);
  }, [expanded]);

  const markComplete = useCallback((shootId) => {
    let wasCompleted = false;
    let title = "";
    setShoots((prev) =>
      prev.map((s) => {
        if (s.id !== shootId) return s;
        wasCompleted = !!s.completedAt;
        title = s.title;
        return { ...s, completedAt: wasCompleted ? null : new Date().toISOString(), status: wasCompleted ? "Confirmed" : "Wrapped" };
      })
    );
    logEntry(shootId, wasCompleted ? "Shoot marked as active" : "✅ Shoot marked as COMPLETE");
    pushNotif(shootId, title, wasCompleted ? `↩ ${title} reopened` : `✅ ${title} marked complete!`);
  }, [logEntry, pushNotif]);

  // ── Duplicate Shoot
  const duplicateShoot = useCallback((shootId) => {
    setShoots((prev) => {
      const orig = prev.find((s) => s.id === shootId);
      if (!orig) return prev;
      const keyMap = {};
      const newChecklist = orig.checklist.map((f) => {
        const nk = toKey(f.label);
        keyMap[f.key] = nk;
        return { key: nk, label: f.label };
      });
      const newItems = {};
      const newDeadlines = {};
      orig.checklist.forEach((f) => {
        newItems[keyMap[f.key]] = orig.items[f.key];
        newDeadlines[keyMap[f.key]] = "";
      });
      const dup = {
        ...JSON.parse(JSON.stringify(orig)),
        id: genId(),
        title: `${orig.title} (Copy)`,
        completedAt: null,
        status: "Planning",
        shootDate: "",
        checklist: newChecklist,
        items: newItems,
        deadlines: newDeadlines,
        log: [{ id: genId(), message: `Duplicated from: ${orig.title}`, time: new Date() }],
      };
      pushNotif(dup.id, dup.title, `⧉ Duplicated from ${orig.title}`);
      return [...prev, dup];
    });
  }, [pushNotif]);

  // ── Field updaters
  const updateClient = useCallback((shootId, field, value) => {
    setShoots((prev) =>
      prev.map((s) => s.id !== shootId ? s : { ...s, client: { ...s.client, [field]: value } })
    );
  }, []);

  const updateBudget = useCallback((shootId, field, value) => {
    setShoots((prev) =>
      prev.map((s) => {
        if (s.id !== shootId) return s;
        const updated = { ...s.budget, [field]: parseFloat(value) || 0 };
        updated.remaining = (updated.total || 0) - (updated.paid || 0);
        return { ...s, budget: updated };
      })
    );
    logEntry(shootId, `Budget updated`);
  }, [logEntry]);

  const updateCallSheet = useCallback((shootId, field, value) => {
    setShoots((prev) =>
      prev.map((s) => s.id !== shootId ? s : { ...s, callSheet: { ...s.callSheet, [field]: value } })
    );
  }, []);

  const updateImage = useCallback((shootId, imgIdx, field, value) => {
    setShoots((prev) =>
      prev.map((s) => {
        if (s.id !== shootId) return s;
        return { ...s, images: s.images.map((img, i) => i === imgIdx ? { ...img, [field]: value } : img) };
      })
    );
  }, []);

  // ── Image upload
  const handleImageUpload = useCallback((shootId, e) => {
    const files = Array.from(e.target.files);
    let shootTitle = "";
    files.forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setShoots((prev) =>
          prev.map((s) => {
            if (s.id !== shootId) return s;
            shootTitle = s.title;
            return { ...s, images: [...s.images, { name: file.name, dataUrl: ev.target.result, category: "Moodboard", caption: "" }] };
          })
        );
        logEntry(shootId, `Image added: ${file.name}`);
        pushNotif(shootId, shootTitle, `🖼 Image uploaded: ${file.name}`);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }, [logEntry, pushNotif]);

  const removeImage = useCallback((shootId, idx) => {
    let imgName = "";
    setShoots((prev) =>
      prev.map((s) => {
        if (s.id !== shootId) return s;
        imgName = s.images[idx]?.name;
        return { ...s, images: s.images.filter((_, i) => i !== idx) };
      })
    );
    if (imgName) logEntry(shootId, `Image removed: ${imgName}`);
  }, [logEntry]);

  // ── Import data
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.shoots) setShoots(reviveShoots(data.shoots));
        if (data.notifications) setNotifications(reviveNotifs(data.notifications));
        pushNotif(null, "System", `📥 Imported ${data.shoots?.length || 0} shoots`);
      } catch (_) {
        alert("Invalid backup file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── Email / SMS
  const buildEmailDraft = (shoot) => {
    const to = shoot.members.filter((m) => m.email).map((m) => m.email).join(", ");
    const list = shoot.members.map((m) => `• ${m.name} (${m.role})${m.phone ? " — " + m.phone : ""}`).join("\n");
    return {
      to: to || "[add emails]",
      subject: `✅ Shoot Ready: ${shoot.title} — Ajayi Studios`,
      body: `Hey team,\n\n${shoot.title} is 100% confirmed and ready to go.\n\nShoot details:\n${shoot.notes || "See shoot tracker for details."}\n${shoot.shootDate ? "\nShoot Date: " + fmtDate(shoot.shootDate) : ""}\n\nTeam:\n${list || "No members listed yet."}\n\nStay tuned for the final call sheet.\n\n— Ajayi Studios`,
    };
  };

  const buildSMSDraft = (shoot) => ({
    to: shoot.members.filter((m) => m.phone).map((m) => m.phone).join(","),
    body: `Hey! ${shoot.title} shoot is confirmed ✅${shoot.shootDate ? " — " + fmtDate(shoot.shootDate) : ""}. Check your email for full details — Ajayi Studios`,
  });

  const getTab = (id) => activeTab[id] || "checklist";
  const setTab = (id, tab) => setActiveTab((p) => ({ ...p, [id]: tab }));

  // ── Filtered + Sorted shoots
  const filteredShoots = useMemo(() => {
    let result = [...shoots];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) =>
        s.title.toLowerCase().includes(q) ||
        (s.notes || "").toLowerCase().includes(q) ||
        (s.type || "").toLowerCase().includes(q) ||
        s.members.some((m) => m.name.toLowerCase().includes(q)) ||
        (s.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        (s.client?.name || "").toLowerCase().includes(q)
      );
    }
    if (filterStatus !== "All") {
      result = result.filter((s) => s.status === filterStatus);
    }
    switch (sortBy) {
      case "Oldest": result.sort((a, b) => a.id - b.id); break;
      case "Shoot Date":
        result.sort((a, b) => {
          if (!a.shootDate) return 1;
          if (!b.shootDate) return -1;
          return new Date(a.shootDate) - new Date(b.shootDate);
        }); break;
      case "Alphabetical": result.sort((a, b) => a.title.localeCompare(b.title)); break;
      case "Completion %": result.sort((a, b) => readiness(b.checklist, b.items) - readiness(a.checklist, a.items)); break;
      default: result.sort((a, b) => b.id - a.id); break;
    }
    return result;
  }, [shoots, searchQuery, filterStatus, sortBy]);

  const activeShots = useMemo(() => filteredShoots.filter((s) => !s.completedAt), [filteredShoots]);
  const completedShots = useMemo(() => filteredShoots.filter((s) => s.completedAt), [filteredShoots]);
  const dashboard = useMemo(() => getDashboard(shoots), [shoots]);

  const sl = {
    sectionLabel: { fontSize: 11, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 },
    tab: (active) => ({
      fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
      background: active ? "#6366f1" : "transparent", color: active ? "#fff" : "#64748b",
      border: "none", fontFamily: "inherit", whiteSpace: "nowrap",
    }),
  };

  const renderShootCard = (shoot, dimmed) => {
    const pct = readiness(shoot.checklist, shoot.items);
    const sc = STATUS_COLORS[shoot.status] || STATUS_COLORS["Planning"];
    const pc = PRIORITY_COLORS[shoot.priority] || PRIORITY_COLORS["Medium"];
    const isOpen = expanded === shoot.id;
    const tab = getTab(shoot.id);
    const isComplete = !!shoot.completedAt;
    const counters = taskCounters(shoot.checklist, shoot.items, shoot.deadlines);

    return (
      <div key={shoot.id} style={{
        background: isComplete ? "#0d0d16" : "#10101e",
        border: `1px solid ${isOpen ? "#6366f1" : isComplete ? "#1a1a2a" : "#1e1e3a"}`,
        borderRadius: 14, marginBottom: 10, overflow: "hidden", opacity: dimmed ? 0.7 : 1,
        transition: "all 0.2s",
      }}>
        {/* Card Header */}
        <div onClick={() => setExpanded(isOpen ? null : shoot.id)}
          style={{ padding: "13px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
          {isComplete ? (
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#1a2e1a", border: "2px solid #4ade80", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>✅</div>
          ) : (
            <div style={{ flexShrink: 0 }}>
              <svg width={42} height={42} viewBox="0 0 44 44">
                <circle cx={22} cy={22} r={18} fill="none" stroke="#1e1e3a" strokeWidth={4} />
                <circle cx={22} cy={22} r={18} fill="none"
                  stroke={pct === 100 ? "#4ade80" : pct >= 60 ? "#fbbf24" : "#f87171"}
                  strokeWidth={4} strokeDasharray={`${(pct / 100) * 113} 113`}
                  strokeLinecap="round" transform="rotate(-90 22 22)" />
                <text x={22} y={26} textAnchor="middle" fontSize={9} fontWeight={700} fill="#f1f5f9">{pct}%</text>
              </svg>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: isComplete ? "#64748b" : "#f1f5f9", textDecoration: isComplete ? "line-through" : "none" }}>{shoot.title}</span>
              <Pill style={{ background: sc.bg, color: sc.text }}>
                <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: sc.dot, marginRight: 4, verticalAlign: "middle" }} />
                {shoot.status}
              </Pill>
              {shoot.priority && shoot.priority !== "Medium" && (
                <Pill style={{ background: pc.bg, color: pc.text }}>{shoot.priority}</Pill>
              )}
              {shoot.paired && <Pill style={{ background: "#1a2a1a", color: "#4ade80" }}>Paired</Pill>}
              {(shoot.tags || []).map((tag) => (
                <Pill key={tag} style={{ background: "#1a1a2e", color: "#818cf8", border: "1px solid #2d2d50" }}>{tag}</Pill>
              ))}
              {shoot.images.length > 0 && <Pill style={{ background: "#1a1a30", color: "#818cf8" }}>🖼 {shoot.images.length}</Pill>}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span>{shoot.type} · {shoot.members.length} members</span>
              {counters.overdue > 0 && <span style={{ color: "#f87171" }}>⚠ {counters.overdue} overdue</span>}
              {shoot.shootDate && <span style={{ color: "#22d3ee" }}>📅 {fmtDate(shoot.shootDate)}</span>}
              {isComplete && shoot.completedAt && <span style={{ color: "#4ade80" }}>✅ Completed {new Date(shoot.completedAt).toLocaleDateString()}</span>}
            </div>
          </div>
          <div style={{ color: "#475569", fontSize: 16, flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</div>
        </div>

        {/* Expanded Panel */}
        {isOpen && (
          <div style={{ borderTop: "1px solid #1e1e3a", padding: "14px 16px" }}>

            {/* Shoot Date + Actions */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ ...sl.sectionLabel, marginBottom: 4 }}>Shoot Date</div>
                <Input type="date" value={shoot.shootDate || ""} style={{ width: "100%", boxSizing: "border-box" }}
                  onChange={(e) => {
                    updateShoot(shoot.id, { shootDate: e.target.value });
                    if (e.target.value) logEntry(shoot.id, `Shoot date set: ${fmtDate(e.target.value)}`);
                  }} />
              </div>
              <div style={{ paddingTop: 18, display: "flex", gap: 6 }}>
                <Btn success={!isComplete} danger={isComplete} onClick={() => markComplete(shoot.id)} style={{ whiteSpace: "nowrap" }}>
                  {isComplete ? "↩ Reopen" : "✅ Mark Complete"}
                </Btn>
                <button onClick={(e) => { e.stopPropagation(); duplicateShoot(shoot.id); }}
                  title="Duplicate shoot"
                  style={{ background: "#16162a", border: "1px solid #2d2d50", borderRadius: 8, padding: "7px 10px", fontSize: 14, cursor: "pointer", color: "#64748b" }}>
                  ⧉
                </button>
              </div>
            </div>

            {/* Priority + Tags */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ minWidth: 130 }}>
                <div style={{ ...sl.sectionLabel, marginBottom: 4 }}>Priority</div>
                <Select value={shoot.priority || "Medium"}
                  onChange={(e) => { updateShoot(shoot.id, { priority: e.target.value }); logEntry(shoot.id, `Priority → ${e.target.value}`); }}
                  options={PRIORITY_OPTIONS} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ ...sl.sectionLabel, marginBottom: 4 }}>Tags</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {TAG_OPTIONS.map((tag) => {
                    const active = (shoot.tags || []).includes(tag);
                    return (
                      <button key={tag} onClick={() => {
                        const tags = active
                          ? (shoot.tags || []).filter((t) => t !== tag)
                          : [...(shoot.tags || []), tag];
                        updateShoot(shoot.id, { tags });
                        logEntry(shoot.id, active ? `Tag removed: ${tag}` : `Tag added: ${tag}`);
                      }}
                        style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, cursor: "pointer", border: `1px solid ${active ? "#6366f1" : "#2d2d50"}`, background: active ? "#1a1a30" : "transparent", color: active ? "#818cf8" : "#475569", fontFamily: "inherit" }}>
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "#0a0a14", borderRadius: 24, padding: 4, overflowX: "auto" }}>
              {["checklist", "images", "members", "client", "budget", "callsheet", "log"].map((t) => (
                <button key={t} onClick={() => setTab(shoot.id, t)} style={sl.tab(tab === t)}>
                  {t === "checklist" ? "📋 Checklist"
                    : t === "images" ? `🖼 Images (${shoot.images.length})`
                    : t === "members" ? `👥 Team (${shoot.members.length})`
                    : t === "client" ? "👤 Client"
                    : t === "budget" ? "💰 Budget"
                    : t === "callsheet" ? "📄 Call Sheet"
                    : "📜 Log"}
                </button>
              ))}
            </div>

            {/* ── Checklist Tab */}
            {tab === "checklist" && (
              <div>
                <div style={{ display: "flex", gap: 12, marginBottom: 12, padding: "8px 10px", background: "#0a0a14", borderRadius: 8 }}>
                  <span style={{ fontSize: 11, color: "#4ade80" }}>✓ {counters.completed} done</span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>· {counters.remaining} remaining</span>
                  {counters.overdue > 0 && <span style={{ fontSize: 11, color: "#f87171" }}>⚠ {counters.overdue} overdue</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {shoot.checklist.map(({ key, label }) => {
                    const deadlineKey = `${shoot.id}_${key}`;
                    const dl = shoot.deadlines?.[key] || "";
                    const overdue = isOverdue(dl) && dl;
                    const showDL = editDeadline[deadlineKey];
                    return (
                      <div key={key} style={{ background: "#16162a", borderRadius: 10, border: "1px solid #1e1e3a", overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", padding: "9px 10px", gap: 6 }}>
                          <div onClick={() => cycleStatus(shoot.id, key)}
                            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", gap: 6 }}>
                            <span style={{ fontSize: 12, color: "#94a3b8" }}>{label}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: rColor(shoot.items[key] || "tbd"), flexShrink: 0 }}>{rLabel(shoot.items[key] || "tbd")}</span>
                          </div>
                          <button onClick={() => setEditDeadline((p) => ({ ...p, [deadlineKey]: !p[deadlineKey] }))}
                            title="Set deadline" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "0 4px", color: dl ? (overdue ? "#f87171" : "#22d3ee") : "#334155" }}>
                            📅
                          </button>
                          <button onClick={() => removeChecklistItem(shoot.id, key)}
                            style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 14, padding: "0 2px" }}>×</button>
                        </div>
                        {(showDL || dl) && (
                          <div style={{ padding: "0 10px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 10, color: overdue ? "#f87171" : "#475569" }}>
                              {overdue ? "⚠ Overdue" : "Due:"}
                            </span>
                            <Input type="date" value={dl} style={{ flex: 1, padding: "4px 8px", fontSize: 11 }}
                              onChange={(e) => setDeadline(shoot.id, key, e.target.value)} />
                            {dl && <span style={{ fontSize: 10, color: overdue ? "#f87171" : "#22d3ee", fontWeight: 600 }}>{fmtDate(dl)}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <Input value={newItem[shoot.id] || ""} onChange={(e) => setNewItem((p) => ({ ...p, [shoot.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && addChecklistItem(shoot.id)}
                    placeholder="Add task…" style={{ flex: 1 }} />
                  <Btn onClick={() => addChecklistItem(shoot.id)} style={{ padding: "7px 12px" }}>+ Add</Btn>
                </div>
                <div style={{ ...sl.sectionLabel }}>Notes</div>
                {editNote === shoot.id ? (
                  <div>
                    <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
                      style={{ width: "100%", minHeight: 70, background: "#16162a", color: "#e2e8f0", border: "1px solid #6366f1", borderRadius: 8, padding: 10, fontSize: 12, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <Btn onClick={() => saveNote(shoot.id)}>Save</Btn>
                      <Btn onClick={() => setEditNote(null)} danger>Cancel</Btn>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: "#16162a", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#94a3b8", lineHeight: 1.6, display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>{shoot.notes || "No notes."}</span>
                    <span onClick={() => { setEditNote(shoot.id); setNoteText(shoot.notes); }} style={{ color: "#6366f1", cursor: "pointer", fontSize: 11, flexShrink: 0, fontWeight: 600 }}>Edit</span>
                  </div>
                )}
                <div style={{ marginTop: 14, textAlign: "right" }}>
                  <span onClick={() => { if (window.confirm(`Delete "${shoot.title}"?`)) deleteShoot(shoot.id); }}
                    style={{ fontSize: 11, color: "#475569", cursor: "pointer" }}>🗑 Delete shoot</span>
                </div>
              </div>
            )}

            {/* ── Images Tab */}
            {tab === "images" && (
              <div>
                <input ref={(el) => (fileInputRefs.current[shoot.id] = el)} type="file" accept="image/*" multiple
                  style={{ display: "none" }} onChange={(e) => handleImageUpload(shoot.id, e)} />
                <Btn onClick={() => fileInputRefs.current[shoot.id]?.click()}
                  style={{ width: "100%", boxSizing: "border-box", marginBottom: 14, background: "#16162a", color: "#818cf8", border: "1px dashed #2d2d50" }}>
                  🖼 Upload Images (Moodboard, References…)
                </Btn>
                {shoot.images.length === 0 && (
                  <div style={{ textAlign: "center", color: "#334155", fontSize: 12, padding: "24px 0" }}>
                    No images yet. Upload your moodboard or reference shots.
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                  {shoot.images.map((img, i) => (
                    <div key={i} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #1e1e3a", background: "#16162a" }}>
                      <div style={{ position: "relative", cursor: "pointer" }}>
                        <img src={img.dataUrl} alt={img.name} onClick={() => setLightbox(img)}
                          style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
                        <div style={{ position: "absolute", top: 4, right: 4 }}>
                          <button onClick={(e) => { e.stopPropagation(); removeImage(shoot.id, i); }}
                            style={{ background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%", width: 20, height: 20, color: "#f87171", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                        </div>
                      </div>
                      <div style={{ padding: "6px 8px" }}>
                        <select value={img.category || "Moodboard"}
                          onChange={(e) => updateImage(shoot.id, i, "category", e.target.value)}
                          style={{ width: "100%", background: "#0a0a14", border: "none", color: "#64748b", fontSize: 9, fontFamily: "inherit", marginBottom: 3, cursor: "pointer", outline: "none" }}>
                          {IMAGE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input value={img.caption || ""}
                          onChange={(e) => updateImage(shoot.id, i, "caption", e.target.value)}
                          placeholder="Caption…"
                          style={{ width: "100%", background: "transparent", border: "none", color: "#64748b", fontSize: 9, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Members Tab */}
            {tab === "members" && (
              <div>
                {shoot.members.length === 0 && (
                  <div style={{ color: "#475569", fontSize: 12, textAlign: "center", padding: "12px 0" }}>No team members yet</div>
                )}
                {shoot.members.map((m, i) => {
                  const rc = ROLE_COLORS[m.role] || ROLE_COLORS.Team;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "#16162a", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #1e1e3a" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: "#f1f5f9" }}>{m.name}</span>
                          <Pill style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}>{m.role}</Pill>
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b", display: "flex", gap: 12, flexWrap: "wrap" }}>
                          {m.email && <span>✉ {m.email}</span>}
                          {m.phone && <span>📱 {m.phone}</span>}
                          {!m.email && !m.phone && <span>No contact info</span>}
                        </div>
                      </div>
                      <button onClick={() => removeMember(shoot.id, i)}
                        style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 16, padding: 4 }}>×</button>
                    </div>
                  );
                })}
                {showMemberForm[shoot.id] ? (
                  <div style={{ background: "#16162a", borderRadius: 10, padding: 14, border: "1px dashed #2d2d50", marginTop: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <Input value={newMember[shoot.id]?.name || ""} onChange={(e) => setNewMember((p) => ({ ...p, [shoot.id]: { ...p[shoot.id], name: e.target.value } }))} placeholder="Name *" />
                      <Select value={newMember[shoot.id]?.role || "Model"} onChange={(e) => setNewMember((p) => ({ ...p, [shoot.id]: { ...p[shoot.id], role: e.target.value } }))} options={["Model", "MUA", "Team"]} />
                      <Input value={newMember[shoot.id]?.email || ""} onChange={(e) => setNewMember((p) => ({ ...p, [shoot.id]: { ...p[shoot.id], email: e.target.value } }))} placeholder="Email" />
                      <Input value={newMember[shoot.id]?.phone || ""} onChange={(e) => setNewMember((p) => ({ ...p, [shoot.id]: { ...p[shoot.id], phone: e.target.value } }))} placeholder="Phone" />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn onClick={() => addMember(shoot.id)} style={{ flex: 1 }}>Add</Btn>
                      <Btn onClick={() => setShowMemberForm((p) => ({ ...p, [shoot.id]: false }))} danger style={{ flex: 1 }}>Cancel</Btn>
                    </div>
                  </div>
                ) : (
                  <Btn onClick={() => setShowMemberForm((p) => ({ ...p, [shoot.id]: true }))}
                    style={{ width: "100%", marginTop: 8, boxSizing: "border-box", background: "#16162a", color: "#818cf8", border: "1px dashed #2d2d50" }}>
                    + Add Team Member
                  </Btn>
                )}
                {shoot.members.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={sl.sectionLabel}>Notify Team</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(() => {
                        const email = buildEmailDraft(shoot);
                        const sms = buildSMSDraft(shoot);
                        return (
                          <>
                            <a href={`mailto:${email.to}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}
                              style={{ flex: 1, display: "block", background: "#1a1a30", color: "#818cf8", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, textAlign: "center", textDecoration: "none", border: "1px solid #2d2d50" }}>
                              ✉ Email Team
                            </a>
                            {sms.to && (
                              <a href={`sms:${sms.to}?body=${encodeURIComponent(sms.body)}`}
                                style={{ flex: 1, display: "block", background: "#1a2e1a", color: "#4ade80", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, textAlign: "center", textDecoration: "none", border: "1px solid #2a3e2a" }}>
                                📱 SMS Team
                              </a>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Client Tab */}
            {tab === "client" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={sl.sectionLabel}>Client Information</div>
                {[
                  { field: "name", placeholder: "Client name", label: "Name" },
                  { field: "email", placeholder: "client@email.com", label: "Email" },
                  { field: "phone", placeholder: "+1 (555) 000-0000", label: "Phone" },
                  { field: "instagram", placeholder: "@handle", label: "Instagram" },
                ].map(({ field, placeholder, label }) => (
                  <div key={field}>
                    <div style={{ fontSize: 10, color: "#475569", marginBottom: 3 }}>{label}</div>
                    <Input value={shoot.client?.[field] || ""} placeholder={placeholder}
                      style={{ width: "100%", boxSizing: "border-box" }}
                      onChange={(e) => updateClient(shoot.id, field, e.target.value)} />
                  </div>
                ))}
              </div>
            )}

            {/* ── Budget Tab */}
            {tab === "budget" && (
              <div>
                <div style={sl.sectionLabel}>Budget Tracker</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  {[
                    { field: "total", label: "Total Budget ($)" },
                    { field: "deposit", label: "Deposit ($)" },
                    { field: "paid", label: "Amount Paid ($)" },
                  ].map(({ field, label }) => (
                    <div key={field}>
                      <div style={{ fontSize: 10, color: "#475569", marginBottom: 3 }}>{label}</div>
                      <Input type="number" value={shoot.budget?.[field] || ""}
                        placeholder="0"
                        style={{ width: "100%", boxSizing: "border-box" }}
                        onChange={(e) => updateBudget(shoot.id, field, e.target.value)} />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 10, color: "#475569", marginBottom: 3 }}>Remaining ($)</div>
                    <div style={{ background: "#16162a", border: "1px solid #2d2d50", borderRadius: 8, padding: "7px 12px", fontSize: 12, color: (shoot.budget?.remaining || 0) <= 0 ? "#4ade80" : "#fbbf24", fontWeight: 700 }}>
                      ${(shoot.budget?.remaining || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
                {(shoot.budget?.total || 0) > 0 && (
                  <div style={{ background: "#0a0a14", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
                      <span style={{ color: "#64748b" }}>Payment progress</span>
                      <span style={{ color: "#f1f5f9", fontWeight: 700 }}>
                        {Math.min(100, Math.round(((shoot.budget?.paid || 0) / shoot.budget.total) * 100))}%
                      </span>
                    </div>
                    <div style={{ height: 4, background: "#1e1e3a", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "#4ade80", width: `${Math.min(100, ((shoot.budget?.paid || 0) / shoot.budget.total) * 100)}%`, borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Call Sheet Tab */}
            {tab === "callsheet" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={sl.sectionLabel}>Call Sheet</div>
                {[
                  { field: "callTime", placeholder: "e.g. 7:00 AM", label: "Call Time", textarea: false },
                  { field: "locationAddress", placeholder: "Full address", label: "Location Address", textarea: false },
                  { field: "parkingInfo", placeholder: "Parking details", label: "Parking Info", textarea: false },
                  { field: "wardrobeNotes", placeholder: "Wardrobe instructions", label: "Wardrobe Notes", textarea: true },
                  { field: "equipmentNotes", placeholder: "Gear list", label: "Equipment Notes", textarea: true },
                  { field: "specialInstructions", placeholder: "Any special notes", label: "Special Instructions", textarea: true },
                ].map(({ field, placeholder, label, textarea }) => (
                  <div key={field}>
                    <div style={{ fontSize: 10, color: "#475569", marginBottom: 3 }}>{label}</div>
                    {textarea ? (
                      <textarea value={shoot.callSheet?.[field] || ""} placeholder={placeholder}
                        onChange={(e) => updateCallSheet(shoot.id, field, e.target.value)}
                        style={{ width: "100%", background: "#16162a", border: "1px solid #2d2d50", borderRadius: 8, color: "#e2e8f0", padding: "7px 12px", fontSize: 12, outline: "none", fontFamily: "inherit", resize: "vertical", minHeight: 60, boxSizing: "border-box" }} />
                    ) : (
                      <Input value={shoot.callSheet?.[field] || ""} placeholder={placeholder}
                        style={{ width: "100%", boxSizing: "border-box" }}
                        onChange={(e) => updateCallSheet(shoot.id, field, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Log Tab */}
            {tab === "log" && (
              <div>
                {shoot.log.length === 0
                  ? <div style={{ color: "#475569", fontSize: 12, textAlign: "center", padding: "20px 0" }}>No activity yet</div>
                  : shoot.log.map((entry) => (
                    <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #0f0f1e" }}>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>{entry.message}</span>
                      <span style={{ fontSize: 10, color: "#334155", flexShrink: 0 }}>{fmt(entry.time)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ maxWidth: "90vw", maxHeight: "85vh", position: "relative" }}>
            <img src={lightbox.dataUrl} alt={lightbox.name} style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 12, objectFit: "contain" }} />
            <div style={{ textAlign: "center", color: "#64748b", fontSize: 12, marginTop: 8 }}>
              {lightbox.caption && <span style={{ color: "#94a3b8", marginRight: 8 }}>{lightbox.caption}</span>}
              {lightbox.name} · tap to close
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0f0f1a 0%, #1a0f2e 100%)", borderBottom: "1px solid #1e1e3a", padding: "22px 20px 16px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#6366f1", textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Ajayi Studios</div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>Shoot Tracker</h1>
            <div style={{ marginTop: 5, display: "flex", gap: 14, fontSize: 11, color: "#94a3b8", flexWrap: "wrap" }}>
              <span><b style={{ color: "#f1f5f9" }}>{dashboard.active}</b> active</span>
              <span><b style={{ color: "#4ade80" }}>{dashboard.shootReady}</b> shoot-ready</span>
              <span><b style={{ color: "#94a3b8" }}>{dashboard.completed}</b> completed</span>
              {dashboard.thisWeek > 0 && <span><b style={{ color: "#22d3ee" }}>{dashboard.thisWeek}</b> this week</span>}
              {dashboard.revenueProjected > 0 && <span><b style={{ color: "#fbbf24" }}>${dashboard.revenueProjected.toLocaleString()}</b> projected</span>}
              {dashboard.revenueReceived > 0 && <span><b style={{ color: "#4ade80" }}>${dashboard.revenueReceived.toLocaleString()}</b> received</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <button onClick={() => exportData(shoots, notifications)} title="Export backup"
              style={{ background: "#16162a", border: "1px solid #1e1e3a", borderRadius: 10, padding: "7px 10px", cursor: "pointer", color: "#64748b", fontSize: 13 }}>⬇</button>
            <button onClick={() => importRef.current?.click()} title="Import backup"
              style={{ background: "#16162a", border: "1px solid #1e1e3a", borderRadius: 10, padding: "7px 10px", cursor: "pointer", color: "#64748b", fontSize: 13 }}>⬆</button>
            <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
            <button onClick={() => setShowNotifs(!showNotifs)} style={{ position: "relative", background: "#16162a", border: "1px solid #1e1e3a", borderRadius: 10, padding: "7px 10px", cursor: "pointer", color: "#94a3b8", fontSize: 15 }}>
              🔔
              {notifications.length > 0 && <span style={{ position: "absolute", top: 4, right: 4, width: 7, height: 7, background: "#f87171", borderRadius: "50%", display: "block" }} />}
            </button>
            <Btn onClick={() => setShowAddShoot(true)} style={{ padding: "7px 12px", fontSize: 11 }}>+ New Shoot</Btn>
          </div>
        </div>
      </div>

      {/* Save Error Banner */}
      {saveError && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "10px 20px 0" }}>
          <div style={{ background: "#2e1a1a", border: "1px solid #f87171", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#f87171", flex: 1, minWidth: 200 }}>⚠️ {saveError}</span>
            <Btn onClick={() => exportData(shoots, notifications)} style={{ background: "#f87171", color: "#2e1a1a", padding: "6px 10px", fontSize: 11 }}>
              Export backup now
            </Btn>
          </div>
        </div>
      )}

      {/* Notification Drawer */}
      {showNotifs && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px" }}>
          <div style={{ background: "#10101e", border: "1px solid #1e1e3a", borderRadius: 12, marginTop: 10, overflow: "hidden" }}>
            <div style={{ padding: "11px 16px", borderBottom: "1px solid #1e1e3a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Activity Feed</span>
              {notifications.length > 0 && <span onClick={() => setNotifications([])} style={{ fontSize: 11, color: "#6366f1", cursor: "pointer" }}>Clear all</span>}
            </div>
            {notifications.length === 0
              ? <div style={{ padding: "18px 16px", color: "#475569", fontSize: 12, textAlign: "center" }}>No activity yet</div>
              : notifications.slice(0, 15).map((n) => (
                <div key={n.id} style={{ padding: "9px 16px", borderBottom: "1px solid #0f0f1e", display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#c7d2fe", fontWeight: 600, marginBottom: 1 }}>{n.shootTitle}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{n.message}</div>
                  </div>
                  <span style={{ fontSize: 10, color: "#334155", flexShrink: 0 }}>{fmt(n.time)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Search + Sort + Filter */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "10px 20px 0" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 Search shoots, members, notes…"
            style={{ flex: 1, minWidth: 180, background: "#10101e", border: "1px solid #1e1e3a", borderRadius: 10, color: "#e2e8f0", padding: "8px 12px", fontSize: 12, outline: "none", fontFamily: "inherit" }}
          />
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            options={["All", ...STATUS_OPTIONS]} style={{ minWidth: 110 }} />
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            options={SORT_OPTIONS} style={{ minWidth: 120 }} />
        </div>
      </div>

      {/* Add Shoot Modal */}
      {showAddShoot && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#10101e", border: "1px solid #6366f1", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>New Shoot</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Input value={newShoot.title} onChange={(e) => setNewShoot((p) => ({ ...p, title: e.target.value }))} placeholder="Shoot title *" style={{ width: "100%", boxSizing: "border-box" }} />
              <Input value={newShoot.type} onChange={(e) => setNewShoot((p) => ({ ...p, type: e.target.value }))} placeholder="Type (e.g. Editorial / On Location)" style={{ width: "100%", boxSizing: "border-box" }} />
              <Select value={newShoot.status} onChange={(e) => setNewShoot((p) => ({ ...p, status: e.target.value }))} options={STATUS_OPTIONS} style={{ width: "100%", boxSizing: "border-box" }} />
              <Select value={newShoot.priority} onChange={(e) => setNewShoot((p) => ({ ...p, priority: e.target.value }))} options={PRIORITY_OPTIONS} style={{ width: "100%", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <Btn onClick={addShoot} style={{ flex: 1 }}>Create</Btn>
              <Btn onClick={() => setShowAddShoot(false)} danger style={{ flex: 1 }}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {/* 100% Notification Modal */}
      {showNotifModal && (() => {
        const email = buildEmailDraft(showNotifModal);
        const sms = buildSMSDraft(showNotifModal);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: "#10101e", border: "1px solid #4ade80", borderRadius: 16, padding: 22, width: "100%", maxWidth: 460 }}>
              <div style={{ fontSize: 26, marginBottom: 6, textAlign: "center" }}>🎉</div>
              <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, textAlign: "center", color: "#4ade80" }}>{showNotifModal.title} is 100% Ready!</h2>
              <p style={{ margin: "0 0 16px", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>Notify your team</p>
              <div style={{ marginBottom: 12 }}>
                <div style={{ ...sl.sectionLabel }}>Email Draft</div>
                <div style={{ background: "#16162a", borderRadius: 8, padding: 10, fontSize: 11, color: "#94a3b8", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 130, overflowY: "auto" }}>
                  <b style={{ color: "#c7d2fe" }}>To:</b> {email.to}{"\n"}<b style={{ color: "#c7d2fe" }}>Subject:</b> {email.subject}{"\n\n"}{email.body}
                </div>
                <a href={`mailto:${email.to}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}
                  style={{ display: "block", marginTop: 8, background: "#6366f1", color: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, textAlign: "center", textDecoration: "none" }}>
                  Open in Mail
                </a>
              </div>
              {sms.to && (
                <div style={{ marginBottom: 16 }}>
                  <div style={sl.sectionLabel}>SMS</div>
                  <a href={`sms:${sms.to}?body=${encodeURIComponent(sms.body)}`}
                    style={{ display: "block", background: "#1a2e1a", color: "#4ade80", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, textAlign: "center", textDecoration: "none", border: "1px solid #2a3e2a" }}>
                    📱 Open in Messages
                  </a>
                </div>
              )}
              <Btn onClick={() => setShowNotifModal(null)} style={{ width: "100%", boxSizing: "border-box" }}>Done</Btn>
            </div>
          </div>
        );
      })()}

      {/* Cards */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 20px 40px" }}>
        {searchQuery && filteredShoots.length === 0 && (
          <div style={{ textAlign: "center", color: "#475569", fontSize: 13, padding: "32px 0" }}>
            No shoots match "{searchQuery}"
          </div>
        )}

        {activeShots.map((shoot) => renderShootCard(shoot, false))}

        {completedShots.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 11, color: "#334155", letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span>✅ Completed ({completedShots.length})</span>
              <div style={{ flex: 1, height: 1, background: "#1e1e3a" }} />
            </div>
            {completedShots.map((shoot) => renderShootCard(shoot, true))}
          </div>
        )}

        <div style={{ textAlign: "center", fontSize: 10, color: "#1e1e3a", marginTop: 20 }}>Ajayi Studios © 2026</div>
      </div>
    </div>
  );
}
