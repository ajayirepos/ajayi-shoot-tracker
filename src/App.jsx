import { useState, useEffect } from "react";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const DEFAULT_CHECKLIST = [
  { key: "moodboard", label: "Moodboard" },
  { key: "location", label: "Location" },
  { key: "mua", label: "MUA" },
  { key: "styling", label: "Styling" },
  { key: "shootDate", label: "Shoot Date" },
];

const CYCLE = ["tbd", "not started", "pending", "halfway", "set", "confirmed"];

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

const makeItems = (overrides = {}) => {
  const base = {};
  DEFAULT_CHECKLIST.forEach((f) => (base[f.key] = "tbd"));
  return { ...base, ...overrides };
};

const makeDeadlines = () => {
  const base = {};
  DEFAULT_CHECKLIST.forEach((f) => (base[f.key] = ""));
  return base;
};

const fmtDate = (str) => {
  if (!str) return "";
  return new Date(str + "T00:00:00").toDateString();
};

const readiness = (checklist, items) => {
  const scores = checklist.map(({ key }) => {
    const v = items[key];
    if (v === "set" || v === "confirmed") return 1;
    if (v === "halfway") return 0.5;
    return 0;
  });

  return Math.round(
    (scores.reduce((a, b) => a + b, 0) / checklist.length) * 100
  );
};

let nextId = 1;

const makeShoot = (title, type, status, overrides = {}, notes = "", members = []) => ({
  id: nextId++,
  title,
  type,
  status,
  completed: false,
  shootDate: "",
  checklist: DEFAULT_CHECKLIST.map((f) => ({ ...f })),
  items: makeItems(overrides),
  deadlines: makeDeadlines(),
  notes,
  members,
  images: [],
  log: [],
});

/* ─────────────────────────────────────────────
   INITIAL DATA
───────────────────────────────────────────── */

const INITIAL = [
  makeShoot(
    "Jumoke + Queen",
    "Editorial",
    "In Progress",
    { moodboard: "set", location: "confirmed", mua: "set", styling: "pending" },
    "Proposed July shoot",
    [
      { name: "Jumoke", role: "Model", email: "" },
      { name: "Queen", role: "Model", email: "" },
    ]
  ),

  makeShoot(
    "LADE Mgmt",
    "Agency",
    "Planning",
    { moodboard: "halfway" },
    "6–8 models selected",
    []
  ),
];

/* ─────────────────────────────────────────────
   UI COMPONENTS
───────────────────────────────────────────── */

const Btn = ({ children, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: "6px 12px",
      borderRadius: 8,
      border: "none",
      cursor: "pointer",
      background: "#6366f1",
      color: "#fff",
      fontSize: 12,
    }}
  >
    {children}
  </button>
);

const Input = (props) => (
  <input
    {...props}
    style={{
      padding: 8,
      borderRadius: 6,
      border: "1px solid #333",
      background: "#111",
      color: "#fff",
      ...props.style,
    }}
  />
);

/* ─────────────────────────────────────────────
   APP
───────────────────────────────────────────── */

export default function App() {
  // ✅ FIXED: correct localStorage hydration
  const [shoots, setShoots] = useState(() => {
    const saved = localStorage.getItem("ajayi-shoots");
    return saved ? JSON.parse(saved) : INITIAL;
  });

  const [expanded, setExpanded] = useState(null);
  const [newTitle, setNewTitle] = useState("");

  // 💾 SAVE to localStorage
  useEffect(() => {
    localStorage.setItem("ajayi-shoots", JSON.stringify(shoots));
  }, [shoots]);

  const addShoot = () => {
    if (!newTitle.trim()) return;

    setShoots((prev) => [
      ...prev,
      makeShoot(newTitle, "General", "Planning"),
    ]);

    setNewTitle("");
  };

  const toggleComplete = (id) => {
    setShoots((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, completed: !s.completed } : s
      )
    );
  };

  const updateItem = (shootId, key, value) => {
    setShoots((prev) =>
      prev.map((s) =>
        s.id === shootId
          ? { ...s, items: { ...s.items, [key]: value } }
          : s
      )
    );
  };

  return (
    <div
      style={{
        padding: 20,
        fontFamily: "Arial",
        background: "#0a0a0f",
        minHeight: "100vh",
        color: "#fff",
      }}
    >
      <h2>Ajayi Studios Shoot Tracker</h2>

      {/* Add shoot */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New shoot title..."
        />
        <Btn onClick={addShoot}>Add</Btn>
      </div>

      {/* Shoots */}
      {shoots.map((shoot) => {
        const pct = readiness(shoot.checklist, shoot.items);

        return (
          <div
            key={shoot.id}
            style={{
              background: "#111",
              padding: 12,
              borderRadius: 10,
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <b>{shoot.title}</b> ({pct}% ready)
              </div>

              <Btn onClick={() => setExpanded(expanded === shoot.id ? null : shoot.id)}>
                {expanded === shoot.id ? "Close" : "Open"}
              </Btn>
            </div>

            {expanded === shoot.id && (
              <div style={{ marginTop: 10 }}>
                {shoot.checklist.map((c) => (
                  <div key={c.key} style={{ marginBottom: 6 }}>
                    <span>{c.label}: </span>

                    <select
                      value={shoot.items[c.key]}
                      onChange={(e) =>
                        updateItem(shoot.id, c.key, e.target.value)
                      }
                    >
                      {CYCLE.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                ))}

                <div style={{ marginTop: 10 }}>
                  <Btn onClick={() => toggleComplete(shoot.id)}>
                    {shoot.completed ? "Reopen" : "Mark Complete"}
                  </Btn>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}