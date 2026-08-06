import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  BookOpen,
  ClipboardCheck,
  Megaphone,
  LogOut,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  Send,
  Award,
  CalendarDays,
  CalendarClock,
  FileQuestion,
  StickyNote,
  Printer,
  School,
  UserCircle,
  X,
  Wallet,
  Upload,
  ArrowUpCircle,
  Baby,
  MessageSquare,
  MessageCircle,
  ScrollText,
  Reply,
  Sun,
  Moon,
  BarChart3,
  Download,
  Building2,
  Crown,
  Ban,
  Link2,
  Copy,
  Home,
  Shield,
  UserCog,
  CreditCard,
  LifeBuoy,
  Settings,
  Server,
  Plug,
  Radio,
  KeyRound,
  Menu,
} from "lucide-react";

/* ---------------------------------------------------------------------- */
/* THEME — exercise-book / report-card token system                       */
/* ---------------------------------------------------------------------- */
/** Swappable — resolve to CSS variables so dark mode can repaint the whole app from one place */
const THEME = {
  paper: "var(--paper)",
  card: "var(--card)",
  ink: "var(--ink)",
  inkLight: "var(--ink-light)",
  margin: "var(--margin)",
  chalk: "var(--chalk)",
  chalkLight: "var(--chalk-light)",
  muted: "var(--muted)",
  rule: "var(--rule)",
};

/** Fixed literals — the sidebar, login panel, and colored buttons/badges always keep a dark surface with light text, regardless of theme */
const DARK_SURFACE = "#1E2A4A";
const CREAM = "#F3EEE1";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;0,700;1,500&family=Inter:wght@400;500;600;700&family=Kalam:wght@400;700&display=swap');
:root {
  --paper: #F3EEE1;
  --card: #FFFFFF;
  --ink: #1E2A4A;
  --ink-light: #31406B;
  --margin: #B5433A;
  --chalk: #2F5233;
  --chalk-light: #3E6B4A;
  --muted: #8A8374;
  --rule: #D8CFBA;
}
.dark {
  --paper: #17171B;
  --card: #212126;
  --ink: #EDEAE0;
  --ink-light: #C9C4B4;
  --margin: #E0776B;
  --chalk: #6FBF7C;
  --chalk-light: #8FD49B;
  --muted: #9A9689;
  --rule: #34343B;
}
.dark table thead tr { background-color: var(--paper) !important; }
`;

/* ---------------------------------------------------------------------- */
/* TIMETABLE + GRADING CONSTANTS                                          */
/* ---------------------------------------------------------------------- */
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const PERIOD_LABELS = ["8:00 – 8:40", "8:40 – 9:20", "9:20 – 10:00", "10:20 – 11:00"];
const TERMS = ["First Term", "Second Term", "Third Term"];

function letterGrade(pct) {
  if (pct >= 70) return { grade: "A", remark: "Excellent" };
  if (pct >= 60) return { grade: "B", remark: "Very Good" };
  if (pct >= 50) return { grade: "C", remark: "Good" };
  if (pct >= 45) return { grade: "D", remark: "Fair" };
  if (pct >= 40) return { grade: "E", remark: "Pass" };
  return { grade: "F", remark: "Needs Improvement" };
}

/** Records which class a student belonged to for a given academic session (used for promotion history) */
function withEnrollment(user, session, classId) {
  const history = (user.enrollmentHistory || []).filter((e) => e.session !== session);
  return { ...user, classId, enrollmentHistory: [...history, { session, classId }] };
}

/** Resolves which class a student was in during a given session — falls back to the closest prior session, then their live class */
function classIdForSession(user, session) {
  if (!user) return null;
  const history = user.enrollmentHistory || [];
  const exact = history.find((e) => e.session === session);
  if (exact) return exact.classId;
  const priorSorted = history.filter((e) => e.session <= session).sort((a, b) => (a.session < b.session ? 1 : -1));
  if (priorSorted[0]) return priorSorted[0].classId;
  return user.classId || null;
}

/* ---------------------------------------------------------------------- */
/* STORAGE HELPERS                                                        */
/* ---------------------------------------------------------------------- */
async function getStored(key, shared, fallback) {
  try {
    const res = await window.storage.get(key, shared);
    return res ? JSON.parse(res.value) : fallback;
  } catch (e) {
    return fallback;
  }
}
async function setStored(key, shared, value) {
  try {
    await window.storage.set(key, JSON.stringify(value), shared);
    return true;
  } catch (e) {
    console.error("Storage error:", e);
    return false;
  }
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Real SHA-256 hashing via the browser's built-in Web Crypto API — no server needed, no plaintext stored */
async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function looksHashed(pw) {
  return typeof pw === "string" && /^[a-f0-9]{64}$/.test(pw);
}

/** One-time recovery codes for Platform Owner password reset — no email/SMS needed, since there's
 *  no provider connected for either. Codes are shown once at generation time and stored only as
 *  hashes (same approach as passwords); each is single-use. */
function generateRecoveryCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O, 1/I/L
  const group = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${group()}-${group()}-${group()}`;
}
async function generateRecoveryCodes(count = 5) {
  const codes = Array.from({ length: count }, generateRecoveryCode);
  const hashes = await Promise.all(codes.map((c) => hashPassword(c)));
  return { codes, hashes };
}

/** Reads an uploaded File into a base64 data URL for storage — caps size since storage keys are 5MB max */
const MAX_UPLOAD_BYTES = 1.5 * 1024 * 1024; // 1.5MB
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(new Error("File is larger than 1.5MB — please attach a smaller file or paste a summary instead."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------------------- */
/* SEED DATA — Nigerian secondary school context                          */
/* ---------------------------------------------------------------------- */
function seedData() {
  const classes = [
    { id: "c1", name: "JSS1A", classTeacherId: "u_t2" },
    { id: "c2", name: "JSS2A", classTeacherId: "u_t3" },
    { id: "c3", name: "SS1A", classTeacherId: "u_t1" },
  ];

  const users = [
    { id: "u_admin", name: "Mrs. Adaeze Nwosu", username: "adaeze", password: "pass123", role: "admin" },
    { id: "u_t1", name: "Mr. Tunde Bakare", username: "tunde", password: "pass123", role: "teacher" },
    { id: "u_t2", name: "Mrs. Chiamaka Eze", username: "chiamaka", password: "pass123", role: "teacher" },
    { id: "u_t3", name: "Mr. Ifeanyi Okoro", username: "ifeanyi", password: "pass123", role: "teacher" },
    { id: "u_s1", name: "Amaka Johnson", username: "amaka", password: "pass123", role: "student", classId: "c1" },
    { id: "u_s2", name: "Bello Suleiman", username: "bello", password: "pass123", role: "student", classId: "c1" },
    { id: "u_s3", name: "Grace Okafor", username: "grace", password: "pass123", role: "student", classId: "c1" },
    { id: "u_s4", name: "David Umeh", username: "david", password: "pass123", role: "student", classId: "c2" },
    { id: "u_s5", name: "Fatima Yusuf", username: "fatima", password: "pass123", role: "student", classId: "c2" },
    { id: "u_s6", name: "Kelechi Nwankwo", username: "kelechi", password: "pass123", role: "student", classId: "c2" },
    { id: "u_s7", name: "Zainab Aliyu", username: "zainab", password: "pass123", role: "student", classId: "c3" },
    { id: "u_s8", name: "Emeka Obi", username: "emeka", password: "pass123", role: "student", classId: "c3" },
    { id: "u_s9", name: "Ruth Adeyemi", username: "ruth", password: "pass123", role: "student", classId: "c3" },
    { id: "u_p1", name: "Mrs. Ngozi Johnson", username: "ngozi", password: "pass123", role: "parent", childIds: ["u_s1"] },
  ].map((u) => (u.role === "student" ? { ...u, enrollmentHistory: [{ session: "2026/2027", classId: u.classId }] } : u));

  const subjects = [
    { id: "sub1", name: "Mathematics", classId: "c1", teacherId: "u_t1" },
    { id: "sub2", name: "English Language", classId: "c1", teacherId: "u_t2" },
    { id: "sub3", name: "Basic Science", classId: "c1", teacherId: "u_t3" },
    { id: "sub4", name: "Mathematics", classId: "c2", teacherId: "u_t1" },
    { id: "sub5", name: "English Language", classId: "c2", teacherId: "u_t2" },
    { id: "sub6", name: "Basic Science", classId: "c2", teacherId: "u_t3" },
    { id: "sub7", name: "Mathematics", classId: "c3", teacherId: "u_t1" },
    { id: "sub8", name: "English Language", classId: "c3", teacherId: "u_t2" },
    { id: "sub9", name: "Biology", classId: "c3", teacherId: "u_t3" },
  ];

  const assignments = [
    { id: "a1", subjectId: "sub1", title: "Fractions & Decimals Worksheet", description: "Complete questions 1-20 in your workbook, showing all working.", dueDate: "2026-08-05", maxScore: 100 },
    { id: "a2", subjectId: "sub2", title: "Comprehension: My Village", description: "Read the passage and answer the six questions that follow in full sentences.", dueDate: "2026-08-03", maxScore: 50 },
    { id: "a3", subjectId: "sub7", title: "Quadratic Equations Practice", description: "Solve by factorisation and by completing the square. Show every step.", dueDate: "2026-08-06", maxScore: 100 },
    { id: "a4", subjectId: "sub9", title: "Cell Structure Diagram Labelling", description: "Draw and label a plant cell and an animal cell, noting three differences.", dueDate: "2026-08-04", maxScore: 40 },
  ];

  const submissions = [
    { id: "sm1", assignmentId: "a1", studentId: "u_s1", content: "Attached all 20 working steps as shown in class.", submittedAt: "2026-07-28T10:12:00Z", score: 78, feedback: "Good working. Watch your sign errors in Q14-16." },
  ];

  const attendanceRecords = [
    {
      id: "att1",
      classId: "c1",
      date: "2026-07-28",
      marks: { u_s1: "present", u_s2: "present", u_s3: "absent" },
    },
  ];

  const announcementList = [
    { id: "an1", authorId: "u_admin", authorName: "Mrs. Adaeze Nwosu", title: "Resumption Date for Second Term", body: "All students are to resume for the second term on Monday. Ensure fees are cleared before resumption.", classId: null, date: "2026-07-27T09:00:00Z" },
    { id: "an2", authorId: "u_t1", authorName: "Mr. Tunde Bakare", title: "Bring Your Geometry Set", body: "We start construction next class. Every student must bring a full geometry set.", classId: "c1", date: "2026-07-28T14:30:00Z" },
  ];

  // Timetable: rotate each class's own subjects across a 5-day, 4-period week
  const timetableSlots = [];
  classes.forEach((c) => {
    const classSubjects = subjects.filter((s) => s.classId === c.id);
    if (classSubjects.length === 0) return;
    let i = 0;
    DAYS.forEach((day) => {
      PERIOD_LABELS.forEach((_, period) => {
        timetableSlots.push({
          id: uid("tt"),
          classId: c.id,
          day,
          period,
          subjectId: classSubjects[i % classSubjects.length].id,
        });
        i += 1;
      });
    });
  });

  const exams = [
    {
      id: "ex1",
      subjectId: "sub1",
      title: "First Term Test — Mathematics",
      createdAt: "2026-07-20T08:00:00Z",
      questions: [
        { id: "q1", text: "What is 3/4 written as a decimal?", options: ["0.34", "0.75", "0.43", "1.34"], correctIndex: 1, points: 10 },
        { id: "q2", text: "Simplify: 12 + 8 × 2", options: ["40", "28", "20", "22"], correctIndex: 1, points: 10 },
        { id: "q3", text: "What is the next number in the pattern 2, 4, 8, 16, ...?", options: ["18", "24", "32", "20"], correctIndex: 2, points: 10 },
      ],
    },
    {
      id: "ex2",
      subjectId: "sub7",
      title: "First Term Test — Mathematics",
      createdAt: "2026-07-20T08:00:00Z",
      questions: [
        { id: "q1", text: "Solve for x: x² − 5x + 6 = 0 (smaller root)", options: ["1", "2", "3", "6"], correctIndex: 1, points: 15 },
        { id: "q2", text: "What is the discriminant of x² + 2x + 1 = 0?", options: ["0", "4", "-4", "1"], correctIndex: 0, points: 15 },
      ],
    },
  ];

  const examSubmissions = [
    { id: "es1", examId: "ex1", studentId: "u_s1", answers: { q1: 1, q2: 1, q3: 0 }, score: 20, submittedAt: "2026-07-25T09:15:00Z" },
  ];

  const materials = [
    { id: "m1", subjectId: "sub1", title: "Introduction to Fractions", body: "A fraction represents a part of a whole. The top number (numerator) shows how many parts we have, and the bottom number (denominator) shows how many equal parts the whole is divided into. Today's key idea: to convert a fraction to a decimal, divide the numerator by the denominator.", date: "2026-07-21T09:00:00Z" },
    { id: "m2", subjectId: "sub9", title: "Cell Structure Notes", body: "All living things are made of cells. Plant cells have a cell wall, chloroplasts and a large vacuole, while animal cells do not. Both have a nucleus, cell membrane, mitochondria and cytoplasm. Remember: the mitochondria is the 'powerhouse' of the cell.", date: "2026-07-22T09:00:00Z" },
  ];

  const settings = { currentTerm: "First Term", currentSession: "2026/2027" };

  const resultEntries = [
    { id: "res1", subjectId: "sub1", studentId: "u_s1", term: "First Term", session: "2026/2027", ca1: 15, ca2: 17, exam: 46, updatedAt: "2026-07-29T10:00:00Z" },
    { id: "res2", subjectId: "sub2", studentId: "u_s1", term: "First Term", session: "2026/2027", ca1: 14, ca2: 15, exam: 40, updatedAt: "2026-07-29T10:00:00Z" },
  ];

  const feeSchedule = classes.map((c) => ({ id: uid("fs"), classId: c.id, term: "First Term", session: "2026/2027", amount: 45000 }));
  const feePayments = [
    { id: uid("pay"), studentId: "u_s1", term: "First Term", session: "2026/2027", amount: 30000, date: "2026-07-15T10:00:00Z", note: "Part payment at resumption", recordedBy: "u_admin" },
  ];

  const messageList = [
    { id: uid("msg"), fromId: "u_t1", toId: "u_p1", body: "Good afternoon ma. Amaka is doing well in Mathematics this term — keep encouraging her practice at home.", date: "2026-07-26T13:00:00Z", read: true },
    { id: uid("msg"), fromId: "u_p1", toId: "u_t1", body: "Thank you sir, I appreciate the update. Please let me know if she needs extra support.", date: "2026-07-26T13:20:00Z", read: true },
  ];

  const discussionThreads = [
    { id: "th1", subjectId: "sub1", authorId: "u_t1", title: "Welcome to Mathematics — First Term", body: "Post your questions on any topic here. I check this daily.", date: "2026-07-20T08:30:00Z" },
  ];
  const discussionReplies = [
    { id: "r1", threadId: "th1", authorId: "u_s1", body: "Good day sir, will the fractions worksheet be marked before the test?", date: "2026-07-21T09:00:00Z" },
  ];

  const auditEntries = [
    { id: uid("log"), actorId: "u_admin", actorName: "Mrs. Adaeze Nwosu", action: "School set up for the 2026/2027 session", date: "2026-07-18T08:00:00Z" },
  ];

  return {
    directory: { users, classes, subjects },
    coursework: { assignments, submissions },
    attendance: { records: attendanceRecords },
    announcements: announcementList,
    timetable: { slots: timetableSlots },
    examinations: { exams, submissions: examSubmissions },
    materials: { list: materials },
    settings,
    results: { entries: resultEntries },
    fees: { schedule: feeSchedule, payments: feePayments },
    messages: { list: messageList },
    discussions: { threads: discussionThreads, replies: discussionReplies },
    auditlog: { entries: auditEntries },
  };
}

/** A brand-new school's starting data — no demo content, just the empty shape. The actual first
 *  admin account is written directly by the Super Admin's "create school" flow, not seeded here. */
function blankSeedData(schoolName) {
  return {
    directory: { users: [], classes: [], subjects: [] },
    coursework: { assignments: [], submissions: [] },
    attendance: { records: [] },
    announcements: [],
    timetable: { slots: [] },
    examinations: { exams: [], submissions: [] },
    materials: { list: [] },
    settings: { currentTerm: "First Term", currentSession: "2026/2027" },
    results: { entries: [] },
    fees: { schedule: [], payments: [] },
    messages: { list: [] },
    discussions: { threads: [], replies: [] },
    auditlog: { entries: [{ id: uid("log"), actorId: null, actorName: "Platform", action: `${schoolName} was created`, date: new Date().toISOString() }] },
  };
}

/** Writes every school-scoped storage key for a brand-new school, including its first admin account */
async function provisionSchool({ name, adminName, adminUsername, adminPassword }) {
  const schoolId = uid("sch");
  const trimmedName = adminName.trim();
  const useRealAuth = !!window.USE_REAL_AUTH;

  // Every new school starts from the same rich example content (classes, subjects, sample
  // teachers/students, timetable, assignments, etc.) — only the admin account and the few
  // places that reference the admin by name (not just by id) get swapped out.
  const seed = seedData();
  seed.directory.users = seed.directory.users.map((u) =>
    u.id === "u_admin" ? { ...u, name: trimmedName, username: adminUsername.trim().toLowerCase(), password: adminPassword || "pass123" } : u
  );
  seed.announcements = seed.announcements.map((a) => (a.authorId === "u_admin" ? { ...a, authorName: trimmedName } : a));
  seed.auditlog = {
    entries: seed.auditlog.entries.map((e) =>
      e.actorId === "u_admin" ? { ...e, actorName: trimmedName, action: `${name} was set up on the platform` } : e
    ),
  };

  if (useRealAuth) {
    // Give every seeded person (not just the admin) a real login, so the whole starter roster
    // actually works — the owner is allowed to provision any role for a brand-new school.
    seed.directory.users = await Promise.all(
      seed.directory.users.map(async (u) => {
        const { password, ...rest } = u;
        try {
          const created = await window.auth.createAccount({ username: u.username, password: password || "pass123", role: u.role, schoolId, appUsername: u.username });
          return { ...rest, authId: created.id };
        } catch (err) {
          return rest; // still part of the roster even if their login couldn't be created
        }
      })
    );
  } else {
    seed.directory.users = await Promise.all(seed.directory.users.map(async (u) => ({ ...u, password: await hashPassword(u.password) })));
  }

  const prefix = (key) => `${schoolId}:${key}`;
  await Promise.all([
    setStored(prefix("directory"), true, seed.directory),
    setStored(prefix("coursework"), true, seed.coursework),
    setStored(prefix("attendance"), true, seed.attendance),
    setStored(prefix("announcements"), true, seed.announcements),
    setStored(prefix("timetable"), true, seed.timetable),
    setStored(prefix("examinations"), true, seed.examinations),
    setStored(prefix("materials"), true, seed.materials),
    setStored(prefix("settings"), true, seed.settings),
    setStored(prefix("results"), true, seed.results),
    setStored(prefix("fees"), true, seed.fees),
    setStored(prefix("messages"), true, seed.messages),
    setStored(prefix("discussions"), true, seed.discussions),
    setStored(prefix("auditlog"), true, seed.auditlog),
  ]);
  const adminUser = seed.directory.users.find((u) => u.username === adminUsername.trim().toLowerCase() && u.role === "admin");
  return { schoolId, adminUser };
}

/** Best-effort cleanup of every scoped key belonging to a deleted school */
async function deleteSchoolData(schoolId) {
  try {
    const res = await window.storage.list(`${schoolId}:`, true);
    const keys = res?.keys || [];
    await Promise.all(keys.map((key) => window.storage.delete(key, true).catch(() => {})));
  } catch (e) {
    // no keys to clean up — fine
  }
}

/* ---------------------------------------------------------------------- */
/* SMALL UI PRIMITIVES                                                    */
/* ---------------------------------------------------------------------- */
function NavButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
      style={{
        backgroundColor: active ? "rgba(243,238,225,0.14)" : "transparent",
        color: active ? CREAM : "rgba(243,238,225,0.62)",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <Icon size={17} strokeWidth={2} />
      {label}
    </button>
  );
}

function Card({ children, style, className = "" }) {
  return (
    <div
      className={`rounded-lg border ${className}`}
      style={{ backgroundColor: THEME.card, borderColor: THEME.rule, ...style }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ eyebrow, title, right }) {
  return (
    <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
      <div>
        {eyebrow && (
          <div
            className="text-xs font-semibold tracking-widest uppercase mb-1"
            style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}
          >
            {eyebrow}
          </div>
        )}
        <h2 className="text-2xl" style={{ color: THEME.ink, fontFamily: "Lora, serif", fontWeight: 600 }}>
          {title}
        </h2>
      </div>
      {right}
    </div>
  );
}

function PrimaryButton({ children, onClick, icon: Icon, type = "button", full = false }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 ${full ? "w-full" : ""}`}
      style={{ backgroundColor: THEME.chalk, color: CREAM, fontFamily: "Inter, sans-serif" }}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

function GhostButton({ children, onClick, icon: Icon, danger = false }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors hover:opacity-80 focus:outline-none focus-visible:ring-2"
      style={{
        borderColor: danger ? THEME.margin : THEME.rule,
        color: danger ? THEME.margin : THEME.ink,
        fontFamily: "Inter, sans-serif",
      }}
    >
      {Icon && <Icon size={13} />}
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-semibold mb-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle = {
  fontFamily: "Inter, sans-serif",
  borderColor: THEME.rule,
  color: THEME.ink,
  backgroundColor: THEME.card,
};
const inputClass =
  "w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus-visible:ring-2";

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(30,42,74,0.45)" }}
    >
      <Card className="w-full max-w-md shadow-xl" style={{ maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: THEME.rule }}>
          <h3 style={{ color: THEME.ink, fontFamily: "Lora, serif", fontWeight: 600 }} className="text-lg">
            {title}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:opacity-60 focus:outline-none focus-visible:ring-2" aria-label="Close dialog">
            <X size={18} style={{ color: THEME.muted }} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </Card>
    </div>
  );
}

/** Score badge styled like a teacher's red-pen circled mark */
function ScoreMark({ score, max }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full border-2"
      style={{
        width: 46,
        height: 46,
        borderColor: THEME.margin,
        color: THEME.margin,
        transform: "rotate(-6deg)",
        fontFamily: "Kalam, cursive",
        fontWeight: 700,
        fontSize: score >= 100 ? 13 : 15,
        borderStyle: "solid",
      }}
      title={`${score} / ${max}`}
    >
      {score}
    </span>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return (
    <div
      className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-md shadow-lg text-sm font-medium"
      style={{ backgroundColor: DARK_SURFACE, color: CREAM, fontFamily: "Inter, sans-serif" }}
    >
      {message}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div
      className="text-center py-10 text-sm rounded-md border border-dashed"
      style={{ color: THEME.muted, borderColor: THEME.rule, fontFamily: "Inter, sans-serif" }}
    >
      {text}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* LOGIN SCREEN                                                            */
/* ---------------------------------------------------------------------- */
function LoginScreen({ users, onLogin, loading, darkMode, onToggleDarkMode, schoolName, logoDataUrl, schoolId }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const candidate = users.find((x) => x.username === username.trim().toLowerCase());
    if (!candidate) {
      setError("Username or password not recognised.");
      return;
    }
    setChecking(true);
    try {
      if (window.USE_REAL_AUTH) {
        await window.auth.signIn(username, password, schoolId);
      } else {
        const hashed = await hashPassword(password);
        if (hashed !== candidate.password) throw new Error("bad password");
      }
      setChecking(false);
      setError("");
      onLogin(candidate);
    } catch (err) {
      setChecking(false);
      setError("Username or password not recognised.");
    }
  };

  const quick = window.USE_REAL_AUTH
    ? []
    : [
        { role: "Admin", user: users.find((u) => u.role === "admin") },
        { role: "Teacher", user: users.find((u) => u.role === "teacher") },
        { role: "Student", user: users.find((u) => u.role === "student") },
        { role: "Parent", user: users.find((u) => u.role === "parent") },
      ];

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 relative"
      style={{
        backgroundColor: THEME.paper,
        backgroundImage: `repeating-linear-gradient(${THEME.paper}, ${THEME.paper} 30px, ${THEME.rule} 31px)`,
      }}
    >
      <button
        onClick={onToggleDarkMode}
        className="absolute top-4 right-4 p-2 rounded-full border"
        style={{ borderColor: THEME.rule, color: THEME.ink, backgroundColor: THEME.card }}
        aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
      >
        {darkMode ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <div className="w-full max-w-4xl grid md:grid-cols-2 rounded-xl overflow-hidden shadow-xl" style={{ border: `1px solid ${THEME.rule}` }}>
        {/* left cover panel */}
        <div
          className="relative p-8 md:p-10 flex flex-col justify-between"
          style={{ backgroundColor: DARK_SURFACE, minHeight: 320 }}
        >
          <div className="absolute top-0 bottom-0 left-8 w-px" style={{ backgroundColor: "rgba(181,67,58,0.55)" }} />
          <div className="pl-6">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt={`${schoolName} logo`} className="w-9 h-9 rounded object-contain" style={{ backgroundColor: CREAM }} />
            ) : (
              <School size={30} style={{ color: CREAM }} />
            )}
            <h1
              className="mt-6 text-3xl leading-tight"
              style={{ color: CREAM, fontFamily: "Lora, serif", fontWeight: 700 }}
            >
              {schoolName}
            </h1>
            <p className="mt-3 text-sm max-w-xs" style={{ color: "rgba(243,238,225,0.7)", fontFamily: "Inter, sans-serif" }}>
              The register, gradebook and noticeboard — kept in one place, for every class.
            </p>
          </div>
          <div className="pl-6 text-xs" style={{ color: "rgba(243,238,225,0.45)", fontFamily: "Inter, sans-serif" }}>
            Learning Management System · 2026/2027 Session
          </div>
        </div>

        {/* right login panel */}
        <div className="p-8 md:p-10" style={{ backgroundColor: THEME.card }}>
          <h2 className="text-xl mb-1" style={{ color: THEME.ink, fontFamily: "Lora, serif", fontWeight: 600 }}>
            Sign in
          </h2>
          <p className="text-xs mb-5" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
            Enter your username and password to open your dashboard.
          </p>
          <form onSubmit={submit}>
            <Field label="Username">
              <input
                className={inputClass}
                style={inputStyle}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. amaka"
                autoComplete="off"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                className={inputClass}
                style={inputStyle}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            {error && (
              <p className="text-xs mb-3" style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}>
                {error}
              </p>
            )}
            <PrimaryButton type="submit" full>
              {checking ? "Checking…" : "Sign in"}
            </PrimaryButton>
          </form>

          {quick.length > 0 && (
            <div className="mt-6 pt-5 border-t" style={{ borderColor: THEME.rule }}>
              <p className="text-xs font-semibold mb-2" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                QUICK DEMO LOGIN — password is pass123
              </p>
              <div className="flex flex-wrap gap-2">
                {quick.map(
                  (q) =>
                    q.user && (
                      <button
                        key={q.role}
                        onClick={() => onLogin(q.user)}
                        className="px-3 py-1.5 rounded-md text-xs font-semibold border hover:opacity-80"
                        style={{ borderColor: THEME.rule, color: THEME.ink, fontFamily: "Inter, sans-serif" }}
                      >
                        {q.role}: {q.user.name.split(" ")[0]}
                      </button>
                    )
                )}
              </div>
            </div>
          )}        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* SHELL (sidebar + topbar)                                                */
/* ---------------------------------------------------------------------- */
function Shell({ user, tabs, view, setView, onLogout, darkMode, onToggleDarkMode, schoolName, logoDataUrl, platformAnnouncement, children }) {
  return (
    <div className="min-h-screen flex" style={{ backgroundColor: THEME.paper }}>
      <aside className="w-60 shrink-0 flex flex-col justify-between p-4 hidden md:flex" style={{ backgroundColor: DARK_SURFACE }}>
        <div>
          <div className="flex items-center justify-between px-2 mb-6 pt-1">
            <div className="flex items-center gap-2 min-w-0">
              {logoDataUrl ? (
                <img src={logoDataUrl} alt={`${schoolName} logo`} className="w-5 h-5 rounded object-contain shrink-0" style={{ backgroundColor: CREAM }} />
              ) : (
                <School size={20} style={{ color: CREAM, flexShrink: 0 }} />
              )}
              <span style={{ color: CREAM, fontFamily: "Lora, serif", fontWeight: 600 }} className="text-sm truncate">
                {schoolName}
              </span>
            </div>
            <button
              onClick={onToggleDarkMode}
              className="p-1.5 rounded-full shrink-0"
              style={{ color: CREAM, backgroundColor: "rgba(243,238,225,0.1)" }}
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
          <nav className="space-y-1">
            {tabs.map((t) => (
              <NavButton key={t.key} icon={t.icon} label={t.label} active={view === t.key} onClick={() => setView(t.key)} />
            ))}
          </nav>
        </div>
        <div>
          <div className="flex items-center gap-2 px-2 py-2 mb-2 rounded-md" style={{ backgroundColor: "rgba(243,238,225,0.08)" }}>
            <UserCircle size={22} style={{ color: CREAM }} />
            <div className="leading-tight">
              <div className="text-xs font-semibold" style={{ color: CREAM, fontFamily: "Inter, sans-serif" }}>
                {user.name}
              </div>
              <div className="text-[10px] capitalize" style={{ color: "rgba(243,238,225,0.55)", fontFamily: "Inter, sans-serif" }}>
                {user.role}
              </div>
            </div>
          </div>
          <NavButton icon={LogOut} label="Log out" onClick={onLogout} />
        </div>
      </aside>

      {/* mobile top nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex gap-1 py-2 px-2 border-t overflow-x-auto" style={{ backgroundColor: DARK_SURFACE, borderColor: "rgba(243,238,225,0.1)" }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setView(t.key)} className="p-2 rounded-md shrink-0" style={{ color: view === t.key ? CREAM : "rgba(243,238,225,0.5)" }} aria-label={t.label}>
            <t.icon size={20} />
          </button>
        ))}
        <button onClick={onLogout} className="p-2 rounded-md shrink-0" style={{ color: "rgba(243,238,225,0.5)" }} aria-label="Log out">
          <LogOut size={20} />
        </button>
      </div>

      <main className="flex-1 p-5 md:p-8 pb-20 md:pb-8 overflow-x-hidden">
        {platformAnnouncement && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-md mb-5" style={{ backgroundColor: "rgba(181,67,58,0.1)", border: `1px solid ${THEME.margin}` }}>
            <Radio size={14} style={{ color: THEME.margin, marginTop: 2, flexShrink: 0 }} />
            <div>
              <div className="text-xs font-semibold" style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}>{platformAnnouncement.title}</div>
              <div className="text-xs mt-0.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{platformAnnouncement.body}</div>
            </div>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* ADMIN VIEWS                                                              */
/* ---------------------------------------------------------------------- */
function AdminOverview({ directory, settings, saveSettings, notify, logAction, schoolName }) {
  const [sessionDraft, setSessionDraft] = useState(settings.currentSession);
  const [uploadError, setUploadError] = useState("");
  const stats = [
    { label: "Classes", value: directory.classes.length },
    { label: "Teachers", value: directory.users.filter((u) => u.role === "teacher").length },
    { label: "Students", value: directory.users.filter((u) => u.role === "student").length },
    { label: "Subjects", value: directory.subjects.length },
  ];

  const handleLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    try {
      const read = await readFileAsDataUrl(file);
      saveSettings({ ...settings, logoDataUrl: read.dataUrl });
      notify("School logo updated");
      logAction("Updated school logo");
    } catch (err) {
      setUploadError(err.message);
    }
    e.target.value = "";
  };

  const removeLogo = () => {
    saveSettings({ ...settings, logoDataUrl: null });
    notify("School logo removed");
    logAction("Removed school logo");
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Admin"
        title="School Overview"
        right={
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Session</span>
            <input
              className={inputClass}
              style={{ ...inputStyle, width: 110 }}
              value={sessionDraft}
              onChange={(e) => setSessionDraft(e.target.value)}
              onBlur={() => {
                if (sessionDraft.trim() && sessionDraft !== settings.currentSession) {
                  saveSettings({ ...settings, currentSession: sessionDraft.trim() });
                  notify("Current session updated");
                  logAction(`Changed current session to ${sessionDraft.trim()}`);
                }
              }}
              placeholder="2026/2027"
            />
            <span className="text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Term</span>
            <select
              className={inputClass}
              style={{ ...inputStyle, width: 150 }}
              value={settings.currentTerm}
              onChange={(e) => {
                saveSettings({ ...settings, currentTerm: e.target.value });
                notify("Current term updated");
                logAction(`Changed current term to ${e.target.value}`);
              }}
            >
              {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        }
      />

      <Card className="p-5 mb-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>School branding</h3>
        <div className="flex items-center gap-4 flex-wrap">
          <div
            className="w-16 h-16 rounded-md border flex items-center justify-center overflow-hidden shrink-0"
            style={{ borderColor: THEME.rule, backgroundColor: THEME.paper }}
          >
            {settings.logoDataUrl ? (
              <img src={settings.logoDataUrl} alt={`${schoolName} logo`} className="w-full h-full object-contain" />
            ) : (
              <School size={24} style={{ color: THEME.muted }} />
            )}
          </div>
          <div>
            <p className="text-xs mb-2" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
              Appears on the login screen, sidebar, and every student's report card.
            </p>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border cursor-pointer" style={{ borderColor: THEME.rule, color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
                <Upload size={13} />
                Upload logo
                <input type="file" accept="image/*" onChange={handleLogo} className="hidden" />
              </label>
              {settings.logoDataUrl && <GhostButton icon={Trash2} danger onClick={removeLogo}>Remove</GhostButton>}
            </div>
            {uploadError && <p className="text-xs mt-1.5" style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}>{uploadError}</p>}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="text-3xl" style={{ color: THEME.ink, fontFamily: "Lora, serif", fontWeight: 700 }}>
              {s.value}
            </div>
            <div className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
              {s.label}
            </div>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
          Classes at a glance
        </h3>
        <div className="grid sm:grid-cols-3 gap-3">
          {directory.classes.map((c) => {
            const count = directory.users.filter((u) => u.classId === c.id).length;
            const subjCount = directory.subjects.filter((s) => s.classId === c.id).length;
            const classTeacher = directory.users.find((u) => u.id === c.classTeacherId);
            return (
              <div key={c.id} className="p-3 rounded-md border" style={{ borderColor: THEME.rule }}>
                <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
                  {c.name}
                </div>
                <div className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                  {count} students · {subjCount} subjects
                </div>
                <div className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                  Class teacher: {classTeacher ? classTeacher.name : "— None —"}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function AdminClasses({ directory, saveDirectory, notify, logAction, settings, saveSettings }) {
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [promoteModal, setPromoteModal] = useState(false);
  const [fromClass, setFromClass] = useState("");
  const [toClass, setToClass] = useState("");
  const [selected, setSelected] = useState([]);
  const [targetSession, setTargetSession] = useState(settings.currentSession);
  const [advanceSession, setAdvanceSession] = useState(true);

  const addClass = () => {
    if (!name.trim()) return;
    const next = { ...directory, classes: [...directory.classes, { id: uid("c"), name: name.trim() }] };
    saveDirectory(next);
    notify("Class added");
    logAction(`Added class "${name.trim()}"`);
    setName("");
    setModal(false);
  };

  const removeClass = (id) => {
    const cls = directory.classes.find((c) => c.id === id);
    const next = {
      ...directory,
      classes: directory.classes.filter((c) => c.id !== id),
    };
    saveDirectory(next);
    notify("Class removed");
    if (cls) logAction(`Removed class "${cls.name}"`);
  };

  const openPromote = () => {
    setFromClass(directory.classes[0]?.id || "");
    setToClass(directory.classes[1]?.id || "");
    setSelected([]);
    setTargetSession(settings.currentSession);
    setAdvanceSession(true);
    setPromoteModal(true);
  };

  const fromStudents = directory.users.filter((u) => u.role === "student" && u.classId === fromClass);

  const toggleSelected = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const runPromotion = () => {
    const ids = selected.length > 0 ? selected : fromStudents.map((s) => s.id);
    const session = targetSession.trim() || settings.currentSession;
    if (!toClass || ids.length === 0 || !session) return;
    const next = {
      ...directory,
      users: directory.users.map((u) => (ids.includes(u.id) ? withEnrollment(u, session, toClass) : u)),
    };
    saveDirectory(next);
    if (advanceSession && session !== settings.currentSession) {
      saveSettings({ ...settings, currentSession: session });
    }
    setPromoteModal(false);
    const toName = directory.classes.find((c) => c.id === toClass)?.name;
    const fromName = directory.classes.find((c) => c.id === fromClass)?.name;
    notify(`Promoted ${ids.length} student${ids.length === 1 ? "" : "s"} to ${toName}`);
    logAction(`Promoted ${ids.length} student${ids.length === 1 ? "" : "s"} from ${fromName} to ${toName} for ${session}`);
  };

  const updateClassTeacher = (classId, teacherId) => {
    const cls = directory.classes.find((c) => c.id === classId);
    const next = { ...directory, classes: directory.classes.map((c) => (c.id === classId ? { ...c, classTeacherId: teacherId || null } : c)) };
    saveDirectory(next);
    const teacher = directory.users.find((u) => u.id === teacherId);
    notify("Class teacher updated");
    logAction(teacher ? `Set ${teacher.name} as class teacher for ${cls?.name}` : `Cleared class teacher for ${cls?.name}`);
  };

  const teachers = directory.users.filter((u) => u.role === "teacher");

  return (
    <div>
      <SectionTitle
        eyebrow="Admin"
        title="Classes"
        right={
          <div className="flex gap-2">
            <GhostButton icon={ArrowUpCircle} onClick={openPromote}>Promote students</GhostButton>
            <PrimaryButton icon={Plus} onClick={() => setModal(true)}>Add class</PrimaryButton>
          </div>
        }
      />
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {directory.classes.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
                  {c.name}
                </div>
                <div className="text-xs mt-0.5" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                  {directory.users.filter((u) => u.classId === c.id).length} students
                </div>
              </div>
              <GhostButton icon={Trash2} danger onClick={() => removeClass(c.id)}>Remove</GhostButton>
            </div>
            <Field label="Class teacher">
              <select
                className={inputClass}
                style={inputStyle}
                value={c.classTeacherId || ""}
                onChange={(e) => updateClassTeacher(c.id, e.target.value)}
              >
                <option value="">— None assigned —</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          </Card>
        ))}
        {directory.classes.length === 0 && <EmptyState text="No classes yet. Add the first one to get started." />}
      </div>

      {modal && (
        <Modal title="Add a class" onClose={() => setModal(false)}>
          <Field label="Class name">
            <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. JSS3B" />
          </Field>
          <PrimaryButton full onClick={addClass}>Save class</PrimaryButton>
        </Modal>
      )}

      {promoteModal && (
        <Modal title="Promote students" onClose={() => setPromoteModal(false)}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="From class">
              <select className={inputClass} style={inputStyle} value={fromClass} onChange={(e) => { setFromClass(e.target.value); setSelected([]); }}>
                {directory.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="To class">
              <select className={inputClass} style={inputStyle} value={toClass} onChange={(e) => setToClass(e.target.value)}>
                <option value="">Select class</option>
                {directory.classes.filter((c) => c.id !== fromClass).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="For session">
            <input className={inputClass} style={inputStyle} value={targetSession} onChange={(e) => setTargetSession(e.target.value)} placeholder="e.g. 2027/2028" />
          </Field>
          <label className="flex items-center gap-2 text-xs mb-3" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
            <input type="checkbox" checked={advanceSession} onChange={(e) => setAdvanceSession(e.target.checked)} />
            Also set this as the school's current session
          </label>
          <p className="text-xs mb-2" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
            Leave all unchecked to promote everyone in {directory.classes.find((c) => c.id === fromClass)?.name || "this class"}, or tick specific students. Each student's prior-year results and class stay reachable on their report card.
          </p>
          <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1 mb-4" style={{ borderColor: THEME.rule }}>
            {fromStudents.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
                <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleSelected(s.id)} />
                {s.name}
              </label>
            ))}
            {fromStudents.length === 0 && <p className="text-xs" style={{ color: THEME.muted }}>No students in this class.</p>}
          </div>
          <PrimaryButton full onClick={runPromotion}>Promote {selected.length > 0 ? selected.length : fromStudents.length} student{(selected.length > 0 ? selected.length : fromStudents.length) === 1 ? "" : "s"}</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function AdminSubjects({ directory, saveDirectory, notify, logAction }) {
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", classId: "", teacherId: "" });
  const teachers = directory.users.filter((u) => u.role === "teacher");

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", classId: "", teacherId: "" });
    setModal(true);
  };

  const openEdit = (subject) => {
    setEditingId(subject.id);
    setForm({ name: subject.name, classId: subject.classId, teacherId: subject.teacherId });
    setModal(true);
  };

  const saveSubject = () => {
    if (!form.name.trim() || !form.classId || !form.teacherId) return;
    if (editingId) {
      const before = directory.subjects.find((s) => s.id === editingId);
      const next = { ...directory, subjects: directory.subjects.map((s) => (s.id === editingId ? { ...s, ...form, name: form.name.trim() } : s)) };
      saveDirectory(next);
      notify("Subject updated");
      const teacherChanged = before && before.teacherId !== form.teacherId;
      const newTeacher = directory.users.find((u) => u.id === form.teacherId);
      logAction(
        teacherChanged
          ? `Reassigned "${form.name.trim()}" to ${newTeacher?.name}`
          : `Updated subject "${form.name.trim()}"`
      );
    } else {
      const next = { ...directory, subjects: [...directory.subjects, { id: uid("sub"), ...form, name: form.name.trim() }] };
      saveDirectory(next);
      notify("Subject added");
      logAction(`Added subject "${form.name.trim()}" to ${directory.classes.find((c) => c.id === form.classId)?.name}`);
    }
    setForm({ name: "", classId: "", teacherId: "" });
    setEditingId(null);
    setModal(false);
  };

  const removeSubject = (id) => {
    const subj = directory.subjects.find((s) => s.id === id);
    saveDirectory({ ...directory, subjects: directory.subjects.filter((s) => s.id !== id) });
    notify("Subject removed");
    if (subj) logAction(`Removed subject "${subj.name}"`);
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Admin"
        title="Subjects"
        right={<PrimaryButton icon={Plus} onClick={openAdd}>Add subject</PrimaryButton>}
      />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: THEME.paper }}>
              {["Subject", "Class", "Teacher", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {directory.subjects.map((s) => {
              const cls = directory.classes.find((c) => c.id === s.classId);
              const t = directory.users.find((u) => u.id === s.teacherId);
              return (
                <tr key={s.id} className="border-t" style={{ borderColor: THEME.rule }}>
                  <td className="px-4 py-2.5 font-medium" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{s.name}</td>
                  <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{cls ? cls.name : "—"}</td>
                  <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{t ? t.name : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex gap-2">
                      <GhostButton onClick={() => openEdit(s)}>Edit</GhostButton>
                      <GhostButton icon={Trash2} danger onClick={() => removeSubject(s.id)}>Remove</GhostButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {directory.subjects.length === 0 && <div className="p-4"><EmptyState text="No subjects yet." /></div>}
      </Card>

      {modal && (
        <Modal title={editingId ? "Edit subject" : "Add a subject"} onClose={() => setModal(false)}>
          <Field label="Subject name">
            <input className={inputClass} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Agricultural Science" />
          </Field>
          <Field label="Class">
            <select className={inputClass} style={inputStyle} value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
              <option value="">Select class</option>
              {directory.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Teacher">
            <select className={inputClass} style={inputStyle} value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
              <option value="">Select teacher</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <PrimaryButton full onClick={saveSubject}>{editingId ? "Save changes" : "Save subject"}</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function parseCsv(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()));
}

function BarRow({ label, value, max, suffix = "%", color }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-xs mb-1" style={{ fontFamily: "Inter, sans-serif" }}>
        <span style={{ color: THEME.ink }}>{label}</span>
        <span style={{ color: THEME.muted }}>{value}{suffix}</span>
      </div>
      <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: THEME.rule }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color || THEME.chalk }} />
      </div>
    </div>
  );
}

function AdminAnalytics({ directory, results, attendance, fees, currentTerm, currentSession }) {
  const [broadsheetClass, setBroadsheetClass] = useState(directory.classes[0]?.id || "");

  const classStats = directory.classes.map((c) => {
    const classSubjectIds = directory.subjects.filter((s) => s.classId === c.id).map((s) => s.id);
    const entries = results.entries.filter((r) => classSubjectIds.includes(r.subjectId) && r.term === currentTerm && r.session === currentSession);
    const avgScore = entries.length ? Math.round(entries.reduce((sum, e) => sum + e.ca1 + e.ca2 + e.exam, 0) / entries.length) : 0;

    const classAttendance = attendance.records.filter((r) => r.classId === c.id);
    const marks = classAttendance.flatMap((r) => Object.values(r.marks || {}));
    const attendanceRate = marks.length ? Math.round((marks.filter((m) => m === "present").length / marks.length) * 100) : 0;

    const sched = fees.schedule.find((s) => s.classId === c.id && s.term === currentTerm && s.session === currentSession);
    const classStudents = directory.users.filter((u) => u.role === "student" && u.classId === c.id);
    const totalDue = (sched?.amount || 0) * classStudents.length;
    const totalPaid = fees.payments
      .filter((p) => p.term === currentTerm && p.session === currentSession && classStudents.some((s) => s.id === p.studentId))
      .reduce((sum, p) => sum + p.amount, 0);
    const collectionRate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;

    return { cls: c, avgScore, attendanceRate, collectionRate };
  });

  const exportBroadsheet = () => {
    const cls = directory.classes.find((c) => c.id === broadsheetClass);
    const subjects = directory.subjects.filter((s) => s.classId === broadsheetClass);
    const students = directory.users.filter((u) => u.role === "student" && u.classId === broadsheetClass);
    const rows = [["Student", ...subjects.map((s) => s.name), "Average"]];
    students.forEach((st) => {
      const scores = subjects.map((subj) => {
        const entry = results.entries.find((r) => r.subjectId === subj.id && r.studentId === st.id && r.term === currentTerm && r.session === currentSession);
        return entry ? entry.ca1 + entry.ca2 + entry.exam : "";
      });
      const numeric = scores.filter((v) => v !== "");
      const avg = numeric.length ? Math.round(numeric.reduce((a, b) => a + b, 0) / numeric.length) : "";
      rows.push([st.name, ...scores, avg]);
    });
    downloadCsv(`broadsheet-${cls?.name || "class"}-${currentTerm}-${currentSession}.csv`.replace(/\//g, "-"), rows);
  };

  return (
    <div>
      <SectionTitle eyebrow={`${currentTerm} · ${currentSession}`} title="Analytics" />
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Average score by class</h3>
          {classStats.map((cs) => <BarRow key={cs.cls.id} label={cs.cls.name} value={cs.avgScore} max={100} color={THEME.chalk} />)}
          {classStats.length === 0 && <EmptyState text="No classes yet." />}
        </Card>
        <Card className="p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Attendance rate by class</h3>
          {classStats.map((cs) => <BarRow key={cs.cls.id} label={cs.cls.name} value={cs.attendanceRate} max={100} color={THEME.margin} />)}
          {classStats.length === 0 && <EmptyState text="No classes yet." />}
        </Card>
        <Card className="p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Fee collection by class</h3>
          {classStats.map((cs) => <BarRow key={cs.cls.id} label={cs.cls.name} value={cs.collectionRate} max={100} color={THEME.inkLight} />)}
          {classStats.length === 0 && <EmptyState text="No classes yet." />}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-1" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>Export result broadsheet</h3>
        <p className="text-xs mb-3" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          Every student in a class, every subject's total score, for {currentTerm} · {currentSession}.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <select className={inputClass} style={{ ...inputStyle, width: 160 }} value={broadsheetClass} onChange={(e) => setBroadsheetClass(e.target.value)}>
            {directory.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <PrimaryButton icon={Download} onClick={exportBroadsheet}>Export broadsheet CSV</PrimaryButton>
        </div>
      </Card>
    </div>
  );
}

function AdminSupport({ schoolId, schoolName, currentUser, notify }) {
  const [tickets, setTickets] = useState(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [openTicket, setOpenTicket] = useState(null);
  const [reply, setReply] = useState("");

  useEffect(() => {
    (async () => {
      const stored = await getStored(`${schoolId}:tickets`, true, { list: [] });
      setTickets(stored.list || []);
    })();
  }, [schoolId]);

  const saveTickets = async (nextList) => {
    setTickets(nextList);
    await setStored(`${schoolId}:tickets`, true, { list: nextList });
  };

  const submit = async () => {
    if (!subject.trim() || !body.trim() || !tickets) return;
    const ticket = { id: uid("tix"), schoolId, schoolName, subject: subject.trim(), body: body.trim(), status: "open", createdAt: new Date().toISOString(), replies: [] };
    await saveTickets([...tickets, ticket]);
    setSubject("");
    setBody("");
    notify("Support ticket submitted");
  };

  const postReply = async () => {
    if (!reply.trim() || !openTicket || !tickets) return;
    const nextList = tickets.map((t) =>
      t.id === openTicket.id
        ? { ...t, replies: [...(t.replies || []), { id: uid("tr"), authorRole: "school", authorName: currentUser.name, body: reply.trim(), date: new Date().toISOString() }] }
        : t
    );
    await saveTickets(nextList);
    setReply("");
  };

  if (!tickets) return <EmptyState text="Loading…" />;

  const myTickets = tickets.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (openTicket) {
    const t = tickets.find((x) => x.id === openTicket.id) || openTicket;
    return (
      <div>
        <button onClick={() => setOpenTicket(null)} className="inline-flex items-center gap-1 text-xs font-semibold mb-4 hover:opacity-70" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          <ChevronLeft size={14} /> Back to tickets
        </button>
        <SectionTitle eyebrow={t.status} title={t.subject} />
        <Card className="p-4 mb-3">
          <p className="text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{t.body}</p>
        </Card>
        <div className="space-y-2 mb-4">
          {(t.replies || []).map((r) => (
            <Card key={r.id} className="p-3">
              <div className="text-xs font-semibold" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{r.authorName} {r.authorRole === "owner" && "· Platform Owner"}</div>
              <p className="text-sm mt-1" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{r.body}</p>
            </Card>
          ))}
          {(t.replies || []).length === 0 && <p className="text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>No reply yet.</p>}
        </div>
        {t.status !== "closed" && (
          <div className="flex gap-2">
            <input className={inputClass} style={inputStyle} placeholder="Reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
            <PrimaryButton icon={Send} onClick={postReply}>Reply</PrimaryButton>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <SectionTitle eyebrow="Need help?" title="Support" />
      <Card className="p-4 mb-5">
        <Field label="Subject">
          <input className={inputClass} style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's the issue?" />
        </Field>
        <Field label="Message">
          <textarea rows={4} className={inputClass} style={inputStyle} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <PrimaryButton onClick={submit}>Submit ticket</PrimaryButton>
      </Card>
      <div className="space-y-2">
        {myTickets.map((t) => (
          <Card key={t.id} className="p-4 flex items-center justify-between gap-3">
            <button className="text-left flex-1" onClick={() => setOpenTicket(t)}>
              <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{t.subject}</div>
              <div className="text-xs mt-0.5" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{new Date(t.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
            </button>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase"
              style={{ backgroundColor: t.status === "closed" ? "rgba(47,82,51,0.12)" : "rgba(181,67,58,0.12)", color: t.status === "closed" ? THEME.chalk : THEME.margin, fontFamily: "Inter, sans-serif" }}
            >
              {t.status}
            </span>
          </Card>
        ))}
        {myTickets.length === 0 && <EmptyState text="No tickets submitted yet." />}
      </div>
    </div>
  );
}

function AuditLogView({ auditlog }) {
  const [search, setSearch] = useState("");
  const entries = auditlog.entries
    .filter((e) => !search.trim() || `${e.actorName} ${e.action}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div>
      <SectionTitle
        eyebrow="Admin"
        title="Audit Log"
        right={
          <input className={inputClass} style={{ ...inputStyle, width: 200 }} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        }
      />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: THEME.paper }}>
              {["When", "Who", "Action"].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t" style={{ borderColor: THEME.rule }}>
                <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                  {new Date(e.date).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{e.actorName}</td>
                <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{e.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <div className="p-4"><EmptyState text="No activity recorded yet." /></div>}
      </Card>
    </div>
  );
}

function AdminUsers({ directory, saveDirectory, notify, logAction, currentSession, schoolId }) {
  const [tab, setTab] = useState("teacher");
  const [modal, setModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importSummary, setImportSummary] = useState(null);
  const [form, setForm] = useState({ name: "", username: "", password: "pass123", classId: "", childIds: [] });

  const list = directory.users.filter((u) => u.role === tab);
  const students = directory.users.filter((u) => u.role === "student");

  const usernameTaken = (name) => directory.users.some((u) => u.username === name.trim().toLowerCase());

  const addUser = async () => {
    if (!form.name.trim() || !form.username.trim()) return;
    if (usernameTaken(form.username)) {
      notify("That username is already taken");
      return;
    }
    const uname = form.username.trim().toLowerCase();
    let newUser = {
      id: uid("u"),
      name: form.name.trim(),
      username: uname,
      role: tab,
      ...(tab === "student" ? { classId: form.classId, enrollmentHistory: [{ session: currentSession, classId: form.classId }] } : {}),
      ...(tab === "parent" ? { childIds: form.childIds } : {}),
    };
    try {
      if (window.USE_REAL_AUTH) {
        const created = await window.auth.createAccount({ username: uname, password: form.password || "pass123", role: tab, schoolId, appUsername: uname });
        newUser.authId = created.id;
      } else {
        newUser.password = await hashPassword(form.password || "pass123");
      }
    } catch (err) {
      notify(err.message || "Could not create that account");
      return;
    }
    saveDirectory({ ...directory, users: [...directory.users, newUser] });
    setForm({ name: "", username: "", password: "pass123", classId: "", childIds: [] });
    setModal(false);
    notify(`${tab[0].toUpperCase()}${tab.slice(1)} added`);
    logAction(`Added ${tab} "${newUser.name}"`);
  };

  const removeUser = (id) => {
    const u = directory.users.find((x) => x.id === id);
    saveDirectory({ ...directory, users: directory.users.filter((u) => u.id !== id) });
    notify("User removed");
    if (u) logAction(`Removed ${u.role} "${u.name}"`);
  };

  const toggleChild = (studentId) => {
    setForm((f) => ({
      ...f,
      childIds: f.childIds.includes(studentId) ? f.childIds.filter((id) => id !== studentId) : [...f.childIds, studentId],
    }));
  };

  const runImport = async () => {
    const rows = parseCsv(importText);
    if (rows.length === 0) {
      notify("Paste or upload some CSV rows first");
      return;
    }
    // drop a header row if the first cell looks like a label rather than a name
    const firstCell = (rows[0][0] || "").toLowerCase();
    const dataRows = firstCell === "name" ? rows.slice(1) : rows;

    let added = 0;
    let skipped = 0;
    const newUsers = [];
    const seenUsernames = new Set(directory.users.map((u) => u.username));

    dataRows.forEach((cols) => {
      const [name, username, password, className] = cols;
      if (!name || !username) {
        skipped += 1;
        return;
      }
      const uname = username.trim().toLowerCase();
      if (seenUsernames.has(uname)) {
        skipped += 1;
        return;
      }
      let classId = "";
      if (tab === "student") {
        const cls = directory.classes.find((c) => c.name.toLowerCase() === (className || "").trim().toLowerCase());
        if (!cls) {
          skipped += 1;
          return;
        }
        classId = cls.id;
      }
      seenUsernames.add(uname);
      newUsers.push({
        id: uid("u"),
        name: name.trim(),
        username: uname,
        password: (password || "pass123").trim() || "pass123",
        role: tab,
        ...(tab === "student" ? { classId, enrollmentHistory: [{ session: currentSession, classId }] } : {}),
      });
      added += 1;
    });

    if (newUsers.length > 0) {
      let finalUsers;
      if (window.USE_REAL_AUTH) {
        finalUsers = await Promise.all(
          newUsers.map(async (u) => {
            const { password, ...rest } = u;
            try {
              const created = await window.auth.createAccount({ username: u.username, password, role: tab, schoolId, appUsername: u.username });
              return { ...rest, authId: created.id };
            } catch (err) {
              return null; // couldn't create a real login for this row — drop it rather than leave a broken entry
            }
          })
        );
        finalUsers = finalUsers.filter(Boolean);
        skipped += newUsers.length - finalUsers.length;
        added = finalUsers.length;
      } else {
        finalUsers = await Promise.all(newUsers.map(async (u) => ({ ...u, password: await hashPassword(u.password) })));
      }
      saveDirectory({ ...directory, users: [...directory.users, ...finalUsers] });
    }
    setImportSummary({ added, skipped });
    notify(`Imported ${added} ${tab}${added === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}`);
    if (added > 0) logAction(`Bulk imported ${added} ${tab}${added === 1 ? "" : "s"}`);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result || ""));
    reader.readAsText(file);
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Admin"
        title="People"
        right={
          <div className="flex gap-2">
            {tab !== "parent" && (
              <GhostButton icon={Upload} onClick={() => { setImportModal(true); setImportSummary(null); setImportText(""); }}>Bulk import</GhostButton>
            )}
            <PrimaryButton icon={Plus} onClick={() => setModal(true)}>Add {tab}</PrimaryButton>
          </div>
        }
      />
      <div className="flex gap-2 mb-4">
        {["teacher", "student", "parent"].map((r) => (
          <button
            key={r}
            onClick={() => setTab(r)}
            className="px-4 py-1.5 rounded-full text-xs font-semibold capitalize border"
            style={{
              borderColor: tab === r ? THEME.chalk : THEME.rule,
              backgroundColor: tab === r ? THEME.chalk : "transparent",
              color: tab === r ? CREAM : THEME.ink,
              fontFamily: "Inter, sans-serif",
            }}
          >
            {r}s
          </button>
        ))}
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: THEME.paper }}>
              {["Name", "Username", tab === "student" ? "Class" : tab === "parent" ? "Children" : "Role", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-t" style={{ borderColor: THEME.rule }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{u.name}</td>
                <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{u.username}</td>
                <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
                  {tab === "student" && (directory.classes.find((c) => c.id === u.classId)?.name || "—")}
                  {tab === "teacher" && "Teacher"}
                  {tab === "parent" && ((u.childIds || []).map((id) => students.find((s) => s.id === id)?.name).filter(Boolean).join(", ") || "—")}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <GhostButton icon={Trash2} danger onClick={() => removeUser(u.id)}>Remove</GhostButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="p-4"><EmptyState text={`No ${tab}s yet.`} /></div>}
      </Card>

      {modal && (
        <Modal title={`Add a ${tab}`} onClose={() => setModal(false)}>
          <Field label="Full name">
            <input className={inputClass} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. John Adamu" />
          </Field>
          <Field label="Username">
            <input className={inputClass} style={inputStyle} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="e.g. john" />
          </Field>
          <Field label="Password">
            <input className={inputClass} style={inputStyle} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          {tab === "student" && (
            <Field label="Class">
              <select className={inputClass} style={inputStyle} value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">Select class</option>
                {directory.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          {tab === "parent" && (
            <Field label="Children">
              <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1" style={{ borderColor: THEME.rule }}>
                {students.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
                    <input type="checkbox" checked={form.childIds.includes(s.id)} onChange={() => toggleChild(s.id)} />
                    {s.name} <span style={{ color: THEME.muted }} className="text-xs">({directory.classes.find((c) => c.id === s.classId)?.name})</span>
                  </label>
                ))}
                {students.length === 0 && <p className="text-xs" style={{ color: THEME.muted }}>No students yet.</p>}
              </div>
            </Field>
          )}
          <PrimaryButton full onClick={addUser}>Save {tab}</PrimaryButton>
        </Modal>
      )}

      {importModal && (
        <Modal title={`Bulk import ${tab}s`} onClose={() => setImportModal(false)}>
          <p className="text-xs mb-3" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
            One row per {tab}: <code>name,username,password{tab === "student" ? ",className" : ""}</code>. Upload a .csv file or paste rows below.
          </p>
          <Field label="Upload CSV">
            <input type="file" accept=".csv,text/csv,text/plain" onChange={handleFile} className="text-xs" />
          </Field>
          <Field label="Or paste rows">
            <textarea
              rows={6}
              className={inputClass}
              style={{ ...inputStyle, fontFamily: "monospace" }}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={tab === "student" ? "Halima Bello,halima,pass123,JSS1A" : "Musa Ibrahim,musa,pass123"}
            />
          </Field>
          {importSummary && (
            <p className="text-xs mb-3" style={{ color: THEME.chalk, fontFamily: "Inter, sans-serif" }}>
              Added {importSummary.added}, skipped {importSummary.skipped} (duplicate username or unknown class).
            </p>
          )}
          <PrimaryButton full onClick={runImport}>Import rows</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

/** Shared weekly grid — editable (dropdowns) for admin, read-only for teacher/student */
function TimetableGrid({ classId, directory, timetable, editable = false, onChangeSlot, highlightTeacherId }) {
  const classSubjects = directory.subjects.filter((s) => s.classId === classId);
  const findSlot = (day, period) => timetable.slots.find((s) => s.classId === classId && s.day === day && s.period === period);

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: 640 }}>
        <thead>
          <tr style={{ backgroundColor: THEME.paper }}>
            <th className="text-left px-3 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Period</th>
            {DAYS.map((d) => (
              <th key={d} className="text-left px-3 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIOD_LABELS.map((label, period) => (
            <tr key={period} className="border-t" style={{ borderColor: THEME.rule }}>
              <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{label}</td>
              {DAYS.map((day) => {
                const slot = findSlot(day, period);
                const subject = slot ? classSubjects.find((s) => s.id === slot.subjectId) : null;
                const teacher = subject ? directory.users.find((u) => u.id === subject.teacherId) : null;
                const mine = highlightTeacherId && subject && subject.teacherId === highlightTeacherId;
                if (editable) {
                  return (
                    <td key={day} className="px-2 py-1.5">
                      <select
                        className="w-full text-xs px-1.5 py-1.5 rounded-md border"
                        style={inputStyle}
                        value={slot?.subjectId || ""}
                        onChange={(e) => onChangeSlot(day, period, e.target.value)}
                      >
                        <option value="">— Free —</option>
                        {classSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                  );
                }
                return (
                  <td key={day} className="px-2 py-1.5">
                    {subject ? (
                      <div
                        className="px-2 py-1.5 rounded-md text-xs"
                        style={{
                          backgroundColor: mine ? "rgba(47,82,51,0.12)" : THEME.paper,
                          border: mine ? `1px solid ${THEME.chalk}` : "none",
                          fontFamily: "Inter, sans-serif",
                        }}
                      >
                        <div className="font-semibold" style={{ color: THEME.ink }}>{subject.name}</div>
                        <div style={{ color: THEME.muted }}>{teacher?.name.split(" ").slice(-1)[0]}</div>
                      </div>
                    ) : (
                      <div className="px-2 py-1.5 text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Free</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function AdminTimetable({ directory, timetable, saveTimetable, notify }) {
  const [classId, setClassId] = useState(directory.classes[0]?.id || "");

  const changeSlot = (day, period, subjectId) => {
    const others = timetable.slots.filter((s) => !(s.classId === classId && s.day === day && s.period === period));
    const next = subjectId ? [...others, { id: uid("tt"), classId, day, period, subjectId }] : others;
    saveTimetable({ slots: next });
    notify("Timetable updated");
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Admin"
        title="Timetable"
        right={
          <select className={inputClass} style={{ ...inputStyle, width: 160 }} value={classId} onChange={(e) => setClassId(e.target.value)}>
            {directory.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        }
      />
      {classId ? (
        <TimetableGrid classId={classId} directory={directory} timetable={timetable} editable onChangeSlot={changeSlot} />
      ) : (
        <EmptyState text="Add a class first." />
      )}
    </div>
  );
}

function feeBalance(fees, classId, studentId, term, session) {
  const sched = fees.schedule.find((s) => s.classId === classId && s.term === term && s.session === session);
  const due = sched?.amount || 0;
  const paid = fees.payments.filter((p) => p.studentId === studentId && p.term === term && p.session === session).reduce((sum, p) => sum + p.amount, 0);
  return { due, paid, balance: due - paid };
}

function formatNaira(n) {
  return `₦${Number(n || 0).toLocaleString()}`;
}

/** Builds a CSV file client-side and triggers a browser download — no network or backend needed */
function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** mode="admin": manage per-class fee amounts + record payments. mode="view": read-only balance for one student. */
function FeesView({ mode = "view", directory, fees, saveFees, currentTerm, currentSession, studentId, notify, logAction }) {
  const [classId, setClassId] = useState(directory.classes[0]?.id || "");
  const [payModal, setPayModal] = useState(null); // student being paid
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");

  if (mode === "view") {
    const student = directory.users.find((u) => u.id === studentId);
    if (!student) return <EmptyState text="No student selected." />;
    const { due, paid, balance } = feeBalance(fees, student.classId, studentId, currentTerm, currentSession);
    const history = fees.payments.filter((p) => p.studentId === studentId && p.term === currentTerm && p.session === currentSession).sort((a, b) => new Date(b.date) - new Date(a.date));
    return (
      <div>
        <SectionTitle eyebrow={`${currentTerm} · ${currentSession}`} title="Fees" />
        <div className="grid sm:grid-cols-3 gap-4 mb-5">
          <Card className="p-4">
            <div className="text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Amount due</div>
            <div className="text-2xl mt-1" style={{ color: THEME.ink, fontFamily: "Lora, serif", fontWeight: 700 }}>{formatNaira(due)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Amount paid</div>
            <div className="text-2xl mt-1" style={{ color: THEME.chalk, fontFamily: "Lora, serif", fontWeight: 700 }}>{formatNaira(paid)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Balance</div>
            <div className="text-2xl mt-1" style={{ color: balance > 0 ? THEME.margin : THEME.chalk, fontFamily: "Lora, serif", fontWeight: 700 }}>{formatNaira(balance)}</div>
          </Card>
        </div>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: THEME.paper }}>
                <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Amount</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {history.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: THEME.rule }}>
                  <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{new Date(p.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-4 py-2.5 font-medium" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{formatNaira(p.amount)}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{p.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 && <div className="p-4"><EmptyState text="No payments recorded yet." /></div>}
        </Card>
      </div>
    );
  }

  // admin mode
  const schedFor = (cid) => fees.schedule.find((s) => s.classId === cid && s.term === currentTerm && s.session === currentSession);
  const updateAmount = (cid, amount) => {
    const others = fees.schedule.filter((s) => !(s.classId === cid && s.term === currentTerm && s.session === currentSession));
    saveFees({ ...fees, schedule: [...others, { id: schedFor(cid)?.id || uid("fs"), classId: cid, term: currentTerm, session: currentSession, amount: Number(amount) || 0 }] });
  };
  const students = directory.users.filter((u) => u.role === "student" && u.classId === classId);
  const recordPayment = () => {
    if (!payAmount || Number(payAmount) <= 0) return;
    saveFees({
      ...fees,
      payments: [...fees.payments, { id: uid("pay"), studentId: payModal.id, term: currentTerm, session: currentSession, amount: Number(payAmount), date: new Date().toISOString(), note: payNote.trim() }],
    });
    notify("Payment recorded");
    logAction(`Recorded payment of ${formatNaira(payAmount)} from ${payModal.name} (${currentTerm}, ${currentSession})`);
    setPayModal(null);
    setPayAmount("");
    setPayNote("");
  };

  return (
    <div>
      <SectionTitle eyebrow={`Admin · ${currentTerm} · ${currentSession}`} title="Fees" />
      <Card className="p-4 mb-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>Fee amount per class ({currentTerm}, {currentSession})</h3>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {directory.classes.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <span className="text-xs w-16 shrink-0" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{c.name}</span>
              <input
                type="number"
                className="flex-1 px-2 py-1.5 rounded-md border text-sm"
                style={inputStyle}
                defaultValue={schedFor(c.id)?.amount ?? ""}
                onBlur={(e) => updateAmount(c.id, e.target.value)}
                placeholder="Amount"
              />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>Student ledger</h3>
        <div className="flex items-center gap-2">
          <select className={inputClass} style={{ ...inputStyle, width: 150 }} value={classId} onChange={(e) => setClassId(e.target.value)}>
            {directory.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <GhostButton
            icon={Download}
            onClick={() => {
              const cls = directory.classes.find((c) => c.id === classId);
              const rows = [["Student", "Due", "Paid", "Balance"]];
              students.forEach((s) => {
                const { due, paid, balance } = feeBalance(fees, classId, s.id, currentTerm, currentSession);
                rows.push([s.name, due, paid, balance]);
              });
              downloadCsv(`fees-${cls?.name || "class"}-${currentTerm}-${currentSession}.csv`.replace(/\//g, "-"), rows);
            }}
          >
            Export CSV
          </GhostButton>
        </div>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: THEME.paper }}>
              {["Student", "Due", "Paid", "Balance", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const { due, paid, balance } = feeBalance(fees, classId, s.id, currentTerm, currentSession);
              return (
                <tr key={s.id} className="border-t" style={{ borderColor: THEME.rule }}>
                  <td className="px-4 py-2.5 font-medium" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{s.name}</td>
                  <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{formatNaira(due)}</td>
                  <td className="px-4 py-2.5" style={{ color: THEME.chalk, fontFamily: "Inter, sans-serif" }}>{formatNaira(paid)}</td>
                  <td className="px-4 py-2.5 font-semibold" style={{ color: balance > 0 ? THEME.margin : THEME.chalk, fontFamily: "Inter, sans-serif" }}>{formatNaira(balance)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <GhostButton onClick={() => setPayModal(s)}>Record payment</GhostButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {students.length === 0 && <div className="p-4"><EmptyState text="No students in this class." /></div>}
      </Card>

      {payModal && (
        <Modal title={`Record payment — ${payModal.name}`} onClose={() => setPayModal(null)}>
          <Field label="Amount (₦)">
            <input type="number" className={inputClass} style={inputStyle} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          </Field>
          <Field label="Note (optional)">
            <input className={inputClass} style={inputStyle} value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g. Bank transfer" />
          </Field>
          <PrimaryButton full onClick={recordPayment}>Save payment</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

/** Determines who a given user is allowed to message, based on their role and relationships */
function computeContacts(directory, currentUser) {
  const { users, subjects } = directory;
  const admin = users.filter((u) => u.role === "admin");

  if (currentUser.role === "admin") {
    return users.filter((u) => u.id !== currentUser.id && (u.role === "teacher" || u.role === "parent"));
  }

  if (currentUser.role === "teacher") {
    const myClassIds = [...new Set(subjects.filter((s) => s.teacherId === currentUser.id).map((s) => s.classId))];
    const myStudents = users.filter((u) => u.role === "student" && myClassIds.includes(u.classId));
    const myStudentIds = myStudents.map((s) => s.id);
    const parents = users.filter((u) => u.role === "parent" && (u.childIds || []).some((id) => myStudentIds.includes(id)));
    return [...myStudents, ...parents, ...admin];
  }

  if (currentUser.role === "student") {
    const mySubjectTeacherIds = [...new Set(subjects.filter((s) => s.classId === currentUser.classId).map((s) => s.teacherId))];
    const teachers = users.filter((u) => mySubjectTeacherIds.includes(u.id));
    return [...teachers, ...admin];
  }

  if (currentUser.role === "parent") {
    const childClassIds = (currentUser.childIds || []).map((id) => users.find((u) => u.id === id)?.classId).filter(Boolean);
    const teacherIds = [...new Set(subjects.filter((s) => childClassIds.includes(s.classId)).map((s) => s.teacherId))];
    const teachers = users.filter((u) => teacherIds.includes(u.id));
    return [...teachers, ...admin];
  }

  return [];
}

function MessagesView({ directory, messages, saveMessages, currentUser }) {
  const [openContact, setOpenContact] = useState(null);
  const [draft, setDraft] = useState("");
  const contacts = computeContacts(directory, currentUser);

  const threadWith = (contactId) =>
    messages.list
      .filter((m) => (m.fromId === currentUser.id && m.toId === contactId) || (m.fromId === contactId && m.toId === currentUser.id))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

  const lastMessage = (contactId) => {
    const t = threadWith(contactId);
    return t[t.length - 1];
  };
  const unreadCount = (contactId) => messages.list.filter((m) => m.fromId === contactId && m.toId === currentUser.id && !m.read).length;

  const openThread = (contact) => {
    setOpenContact(contact);
    const next = { list: messages.list.map((m) => (m.fromId === contact.id && m.toId === currentUser.id && !m.read ? { ...m, read: true } : m)) };
    saveMessages(next);
  };

  const send = () => {
    if (!draft.trim() || !openContact) return;
    const next = { list: [...messages.list, { id: uid("msg"), fromId: currentUser.id, toId: openContact.id, body: draft.trim(), date: new Date().toISOString(), read: false }] };
    saveMessages(next);
    setDraft("");
  };

  if (openContact) {
    const thread = threadWith(openContact.id);
    return (
      <div>
        <button onClick={() => setOpenContact(null)} className="inline-flex items-center gap-1 text-xs font-semibold mb-4 hover:opacity-70" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          <ChevronLeft size={14} /> Back to messages
        </button>
        <SectionTitle eyebrow={openContact.role} title={openContact.name} />
        <Card className="p-4 mb-4" style={{ maxHeight: 420, overflowY: "auto" }}>
          <div className="space-y-3">
            {thread.map((m) => {
              const mine = m.fromId === currentUser.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[75%] px-3 py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: mine ? DARK_SURFACE : THEME.paper,
                      color: mine ? CREAM : THEME.ink,
                      fontFamily: "Inter, sans-serif",
                    }}
                  >
                    {m.body}
                    <div className="text-[10px] mt-1 opacity-60">
                      {new Date(m.date).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              );
            })}
            {thread.length === 0 && <EmptyState text="No messages yet — say hello." />}
          </div>
        </Card>
        <div className="flex gap-2">
          <input
            className={inputClass}
            style={inputStyle}
            placeholder="Type a message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <PrimaryButton icon={Send} onClick={send}>Send</PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle eyebrow="Communication" title="Messages" />
      <div className="space-y-2">
        {contacts.map((c) => {
          const last = lastMessage(c.id);
          const unread = unreadCount(c.id);
          return (
            <Card key={c.id} className="p-4 cursor-pointer hover:shadow-md transition-shadow">
              <button className="w-full text-left flex items-center justify-between gap-3" onClick={() => openThread(c)}>
                <div>
                  <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{c.name}</div>
                  <div className="text-xs mt-0.5 capitalize" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                    {last ? (last.body.length > 50 ? `${last.body.slice(0, 50)}…` : last.body) : c.role}
                  </div>
                </div>
                {unread > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: THEME.margin, color: CREAM }}>{unread}</span>
                )}
              </button>
            </Card>
          );
        })}
        {contacts.length === 0 && <EmptyState text="No contacts available yet." />}
      </div>
    </div>
  );
}

function AnnouncementsView({ announcements, addAnnouncement, currentUser, directory, scope, logAction = () => {} }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", classId: "" });

  const visible = announcements
    .filter((a) => {
      if (scope === "school") return true;
      if (scope === "mine") return a.authorId === currentUser.id || a.classId === null;
      // student: school-wide + own class
      return a.classId === null || a.classId === currentUser.classId;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const submit = () => {
    if (!form.title.trim() || !form.body.trim()) return;
    addAnnouncement({
      id: uid("an"),
      authorId: currentUser.id,
      authorName: currentUser.name,
      title: form.title.trim(),
      body: form.body.trim(),
      classId: form.classId || null,
      date: new Date().toISOString(),
    });
    logAction(`Posted announcement "${form.title.trim()}"`);
    setForm({ title: "", body: "", classId: "" });
    setModal(false);
  };

  const canPost = currentUser.role === "admin" || currentUser.role === "teacher";
  const myClasses =
    currentUser.role === "teacher"
      ? directory.subjects.filter((s) => s.teacherId === currentUser.id).map((s) => s.classId)
      : [];
  const uniqueClasses = [...new Set(myClasses)].map((id) => directory.classes.find((c) => c.id === id)).filter(Boolean);

  return (
    <div>
      <SectionTitle
        eyebrow="Noticeboard"
        title="Announcements"
        right={canPost && <PrimaryButton icon={Plus} onClick={() => setModal(true)}>Post announcement</PrimaryButton>}
      />
      <div className="space-y-3">
        {visible.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{a.title}</h3>
                <p className="text-xs mt-0.5" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                  {a.authorName} · {new Date(a.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  {a.classId && ` · ${directory.classes.find((c) => c.id === a.classId)?.name || ""}`}
                  {!a.classId && " · Whole school"}
                </p>
              </div>
            </div>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{a.body}</p>
          </Card>
        ))}
        {visible.length === 0 && <EmptyState text="No announcements yet." />}
      </div>

      {modal && (
        <Modal title="Post an announcement" onClose={() => setModal(false)}>
          <Field label="Title">
            <input className={inputClass} style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Message">
            <textarea rows={4} className={inputClass} style={inputStyle} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </Field>
          {currentUser.role === "teacher" && (
            <Field label="Audience">
              <select className={inputClass} style={inputStyle} value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">All my classes' students (whole school view)</option>
                {uniqueClasses.map((c) => <option key={c.id} value={c.id}>{c.name} only</option>)}
              </select>
            </Field>
          )}
          <PrimaryButton full onClick={submit}>Post</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* TEACHER VIEWS                                                           */
/* ---------------------------------------------------------------------- */
function TeacherSubjects({ directory, currentUser, onOpenSubject }) {
  const mySubjects = directory.subjects.filter((s) => s.teacherId === currentUser.id);
  return (
    <div>
      <SectionTitle eyebrow="Teacher" title="My Subjects" />
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {mySubjects.map((s) => {
          const cls = directory.classes.find((c) => c.id === s.classId);
          const studentCount = directory.users.filter((u) => u.classId === s.classId).length;
          const classTeacher = directory.users.find((u) => u.id === cls?.classTeacherId);
          return (
            <Card key={s.id} className="p-4 cursor-pointer hover:shadow-md transition-shadow" style={{}}>
              <button className="text-left w-full" onClick={() => onOpenSubject(s)}>
                <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}>
                  {cls?.name}
                </div>
                <div className="font-semibold" style={{ color: THEME.ink, fontFamily: "Lora, serif", fontSize: 17 }}>
                  {s.name}
                </div>
                <div className="text-xs mt-2" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                  {studentCount} students
                </div>
                {classTeacher && (
                  <div className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                    Class teacher: {classTeacher.id === currentUser.id ? "You" : classTeacher.name}
                  </div>
                )}
              </button>
            </Card>
          );
        })}
        {mySubjects.length === 0 && <EmptyState text="You have not been assigned any subjects yet. Contact your admin." />}
      </div>
    </div>
  );
}

function TeacherSubjectDetail({ subject, directory, coursework, saveCoursework, attendance, saveAttendance, examinations, saveExaminations, materials, saveMaterials, results, saveResults, currentTerm, currentSession, discussions, saveDiscussions, currentUser, onBack, notify, logAction }) {
  const [tab, setTab] = useState("scores");
  const cls = directory.classes.find((c) => c.id === subject.classId);
  const classTeacher = directory.users.find((u) => u.id === cls?.classTeacherId);
  const students = directory.users.filter((u) => u.classId === subject.classId);
  const subjectAssignments = coursework.assignments.filter((a) => a.subjectId === subject.id);
  const subjectExams = examinations.exams.filter((e) => e.subjectId === subject.id);
  const subjectMaterials = materials.list.filter((m) => m.subjectId === subject.id);

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold mb-4 hover:opacity-70" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
        <ChevronLeft size={14} /> Back to my subjects
      </button>
      <SectionTitle eyebrow={cls?.name} title={subject.name} />
      {classTeacher && (
        <p className="text-xs -mt-4 mb-5" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          Class teacher: <span style={{ color: THEME.ink, fontWeight: 600 }}>{classTeacher.id === currentUser.id ? "You" : classTeacher.name}</span>
        </p>
      )}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { key: "scores", label: "Scores" },
          { key: "assignments", label: "Assignments" },
          { key: "exams", label: "Exams" },
          { key: "materials", label: "Lesson Notes" },
          { key: "discussion", label: "Discussion" },
          { key: "attendance", label: "Attendance" },
          { key: "roster", label: "Roster" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-1.5 rounded-full text-xs font-semibold border"
            style={{
              borderColor: tab === t.key ? THEME.chalk : THEME.rule,
              backgroundColor: tab === t.key ? THEME.chalk : "transparent",
              color: tab === t.key ? CREAM : THEME.ink,
              fontFamily: "Inter, sans-serif",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "scores" && (
        <TeacherScores subject={subject} students={students} results={results} saveResults={saveResults} currentTerm={currentTerm} currentSession={currentSession} notify={notify} logAction={logAction} />
      )}
      {tab === "assignments" && (
        <TeacherAssignments
          subject={subject}
          students={students}
          assignments={subjectAssignments}
          coursework={coursework}
          saveCoursework={saveCoursework}
          notify={notify}
        />
      )}
      {tab === "exams" && (
        <TeacherExams subject={subject} students={students} exams={subjectExams} examinations={examinations} saveExaminations={saveExaminations} notify={notify} />
      )}
      {tab === "materials" && (
        <TeacherMaterials subject={subject} items={subjectMaterials} materials={materials} saveMaterials={saveMaterials} notify={notify} />
      )}
      {tab === "discussion" && (
        <DiscussionBoard subject={subject} directory={directory} discussions={discussions} saveDiscussions={saveDiscussions} currentUser={currentUser} notify={notify} />
      )}
      {tab === "attendance" && (
        <TeacherAttendance classId={subject.classId} students={students} attendance={attendance} saveAttendance={saveAttendance} notify={notify} />
      )}
      {tab === "roster" && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: THEME.paper }}>
                <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Student</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Username</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-t" style={{ borderColor: THEME.rule }}>
                  <td className="px-4 py-2.5 font-medium" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{s.name}</td>
                  <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{s.username}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {students.length === 0 && <div className="p-4"><EmptyState text="No students in this class yet." /></div>}
        </Card>
      )}
    </div>
  );
}

function TeacherAssignments({ subject, students, assignments, coursework, saveCoursework, notify }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", dueDate: "", maxScore: 100 });
  const [openAssignment, setOpenAssignment] = useState(null);

  const createAssignment = () => {
    if (!form.title.trim() || !form.dueDate) return;
    const newA = { id: uid("a"), subjectId: subject.id, title: form.title.trim(), description: form.description.trim(), dueDate: form.dueDate, maxScore: Number(form.maxScore) || 100 };
    saveCoursework({ ...coursework, assignments: [...coursework.assignments, newA] });
    setForm({ title: "", description: "", dueDate: "", maxScore: 100 });
    setModal(false);
    notify("Assignment created");
  };

  const removeAssignment = (id) => {
    saveCoursework({
      ...coursework,
      assignments: coursework.assignments.filter((a) => a.id !== id),
      submissions: coursework.submissions.filter((s) => s.assignmentId !== id),
    });
    notify("Assignment removed");
  };

  const gradeSubmission = (submissionId, score, feedback) => {
    saveCoursework({
      ...coursework,
      submissions: coursework.submissions.map((s) => (s.id === submissionId ? { ...s, score: Number(score), feedback } : s)),
    });
    notify("Grade saved");
  };

  if (openAssignment) {
    const subs = coursework.submissions.filter((s) => s.assignmentId === openAssignment.id);
    return (
      <div>
        <button onClick={() => setOpenAssignment(null)} className="inline-flex items-center gap-1 text-xs font-semibold mb-4 hover:opacity-70" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          <ChevronLeft size={14} /> Back to assignments
        </button>
        <h3 className="text-lg mb-1" style={{ color: THEME.ink, fontFamily: "Lora, serif", fontWeight: 600 }}>{openAssignment.title}</h3>
        <p className="text-xs mb-4" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          Due {new Date(openAssignment.dueDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · Max score {openAssignment.maxScore}
        </p>
        <div className="space-y-3">
          {students.map((st) => {
            const sub = subs.find((s) => s.studentId === st.id);
            return (
              <SubmissionRow key={st.id} student={st} submission={sub} maxScore={openAssignment.maxScore} onGrade={gradeSubmission} />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <PrimaryButton icon={Plus} onClick={() => setModal(true)}>New assignment</PrimaryButton>
      </div>
      <div className="space-y-3">
        {assignments
          .slice()
          .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
          .map((a) => {
            const subCount = coursework.submissions.filter((s) => s.assignmentId === a.id).length;
            return (
              <Card key={a.id} className="p-4 flex items-center justify-between gap-3">
                <button className="text-left flex-1" onClick={() => setOpenAssignment(a)}>
                  <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{a.title}</div>
                  <div className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                    Due {new Date(a.dueDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {subCount}/{students.length} submitted
                  </div>
                </button>
                <GhostButton icon={Trash2} danger onClick={() => removeAssignment(a.id)}>Remove</GhostButton>
              </Card>
            );
          })}
        {assignments.length === 0 && <EmptyState text="No assignments yet for this subject." />}
      </div>

      {modal && (
        <Modal title="New assignment" onClose={() => setModal(false)}>
          <Field label="Title">
            <input className={inputClass} style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Instructions">
            <textarea rows={3} className={inputClass} style={inputStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date">
              <input type="date" className={inputClass} style={inputStyle} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </Field>
            <Field label="Max score">
              <input type="number" className={inputClass} style={inputStyle} value={form.maxScore} onChange={(e) => setForm({ ...form, maxScore: e.target.value })} />
            </Field>
          </div>
          <PrimaryButton full onClick={createAssignment}>Create assignment</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function SubmissionRow({ student, submission, maxScore, onGrade }) {
  const [score, setScore] = useState(submission?.score ?? "");
  const [feedback, setFeedback] = useState(submission?.feedback ?? "");

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{student.name}</div>
          {submission ? (
            <>
              <p className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                Submitted {new Date(submission.submittedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </p>
              <p className="text-sm mt-2 italic" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>"{submission.content}"</p>
              {submission.fileName && (
                <a href={submission.fileData} download={submission.fileName} className="text-xs mt-1.5 inline-flex items-center gap-1 hover:underline" style={{ color: THEME.chalk, fontFamily: "Inter, sans-serif" }}>
                  <Download size={12} /> {submission.fileName}
                </a>
              )}
            </>
          ) : (
            <p className="text-xs mt-1" style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}>Not submitted</p>
          )}
        </div>
        {submission && (
          <div className="flex items-center gap-3">
            {submission.score != null && <ScoreMark score={submission.score} max={maxScore} />}
            <div className="flex flex-col gap-1.5">
              <input
                type="number"
                placeholder={`/ ${maxScore}`}
                className="w-20 px-2 py-1 rounded-md border text-xs"
                style={inputStyle}
                value={score}
                onChange={(e) => setScore(e.target.value)}
              />
              <button
                onClick={() => onGrade(submission.id, score, feedback)}
                className="text-xs font-semibold px-2 py-1 rounded-md"
                style={{ backgroundColor: THEME.chalk, color: CREAM, fontFamily: "Inter, sans-serif" }}
              >
                Save grade
              </button>
            </div>
          </div>
        )}
      </div>
      {submission && (
        <input
          placeholder="Feedback (optional)"
          className="mt-3 w-full px-3 py-1.5 rounded-md border text-xs"
          style={inputStyle}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          onBlur={() => onGrade(submission.id, score, feedback)}
        />
      )}
    </Card>
  );
}

function blankQuestion() {
  return { id: uid("q"), text: "", options: ["", "", "", ""], correctIndex: 0, points: 10 };
}

function TeacherExams({ subject, students, exams, examinations, saveExaminations, notify }) {
  const [modal, setModal] = useState(false);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState([blankQuestion()]);
  const [openExam, setOpenExam] = useState(null);

  const updateQuestion = (qid, patch) => {
    setQuestions((qs) => qs.map((q) => (q.id === qid ? { ...q, ...patch } : q)));
  };
  const updateOption = (qid, idx, value) => {
    setQuestions((qs) => qs.map((q) => (q.id === qid ? { ...q, options: q.options.map((o, i) => (i === idx ? value : o)) } : q)));
  };
  const removeQuestion = (qid) => setQuestions((qs) => (qs.length > 1 ? qs.filter((q) => q.id !== qid) : qs));

  const createExam = () => {
    const clean = questions.filter((q) => q.text.trim() && q.options.every((o) => o.trim()));
    if (!title.trim() || clean.length === 0) {
      notify("Add a title and at least one complete question");
      return;
    }
    const newExam = { id: uid("ex"), subjectId: subject.id, title: title.trim(), createdAt: new Date().toISOString(), questions: clean };
    saveExaminations({ ...examinations, exams: [...examinations.exams, newExam] });
    setTitle("");
    setQuestions([blankQuestion()]);
    setModal(false);
    notify("Exam created");
  };

  const removeExam = (id) => {
    saveExaminations({
      exams: examinations.exams.filter((e) => e.id !== id),
      submissions: examinations.submissions.filter((s) => s.examId !== id),
    });
    notify("Exam removed");
  };

  if (openExam) {
    const subs = examinations.submissions.filter((s) => s.examId === openExam.id);
    const totalPoints = openExam.questions.reduce((sum, q) => sum + q.points, 0);
    return (
      <div>
        <button onClick={() => setOpenExam(null)} className="inline-flex items-center gap-1 text-xs font-semibold mb-4 hover:opacity-70" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          <ChevronLeft size={14} /> Back to exams
        </button>
        <h3 className="text-lg mb-1" style={{ color: THEME.ink, fontFamily: "Lora, serif", fontWeight: 600 }}>{openExam.title}</h3>
        <p className="text-xs mb-4" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          {openExam.questions.length} questions · {totalPoints} points total · auto-graded
        </p>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: THEME.paper }}>
                <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Student</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st) => {
                const sub = subs.find((s) => s.studentId === st.id);
                return (
                  <tr key={st.id} className="border-t" style={{ borderColor: THEME.rule }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{st.name}</td>
                    <td className="px-4 py-2.5" style={{ color: sub ? THEME.ink : THEME.margin, fontFamily: "Inter, sans-serif" }}>
                      {sub ? `${sub.score} / ${totalPoints}` : "Not taken"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <PrimaryButton icon={Plus} onClick={() => setModal(true)}>New exam</PrimaryButton>
      </div>
      <div className="space-y-3">
        {exams.map((ex) => {
          const takenCount = examinations.submissions.filter((s) => s.examId === ex.id).length;
          return (
            <Card key={ex.id} className="p-4 flex items-center justify-between gap-3">
              <button className="text-left flex-1" onClick={() => setOpenExam(ex)}>
                <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{ex.title}</div>
                <div className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                  {ex.questions.length} questions · {takenCount}/{students.length} taken
                </div>
              </button>
              <GhostButton icon={Trash2} danger onClick={() => removeExam(ex.id)}>Remove</GhostButton>
            </Card>
          );
        })}
        {exams.length === 0 && <EmptyState text="No exams yet for this subject." />}
      </div>

      {modal && (
        <Modal title="New exam" onClose={() => setModal(false)}>
          <Field label="Exam title">
            <input className={inputClass} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Second Term Test — Mathematics" />
          </Field>
          <div className="space-y-4 mt-2">
            {questions.map((q, qi) => (
              <div key={q.id} className="p-3 rounded-md border" style={{ borderColor: THEME.rule }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Question {qi + 1}</span>
                  {questions.length > 1 && (
                    <button onClick={() => removeQuestion(q.id)} className="text-xs" style={{ color: THEME.margin }}>Remove</button>
                  )}
                </div>
                <input
                  className={inputClass}
                  style={{ ...inputStyle, marginBottom: 8 }}
                  placeholder="Question text"
                  value={q.text}
                  onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                />
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2 mb-1.5">
                    <input
                      type="radio"
                      name={`correct-${q.id}`}
                      checked={q.correctIndex === oi}
                      onChange={() => updateQuestion(q.id, { correctIndex: oi })}
                    />
                    <input
                      className="flex-1 px-2 py-1 rounded-md border text-xs"
                      style={inputStyle}
                      placeholder={`Option ${oi + 1}`}
                      value={opt}
                      onChange={(e) => updateOption(q.id, oi, e.target.value)}
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Points</span>
                  <input
                    type="number"
                    className="w-16 px-2 py-1 rounded-md border text-xs"
                    style={inputStyle}
                    value={q.points}
                    onChange={(e) => updateQuestion(q.id, { points: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3 mb-4">
            <GhostButton icon={Plus} onClick={() => setQuestions((qs) => [...qs, blankQuestion()])}>Add question</GhostButton>
          </div>
          <PrimaryButton full onClick={createExam}>Create exam</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function TeacherMaterials({ subject, items, materials, saveMaterials, notify }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", body: "" });

  const addMaterial = () => {
    if (!form.title.trim() || !form.body.trim()) return;
    const next = { list: [...materials.list, { id: uid("m"), subjectId: subject.id, title: form.title.trim(), body: form.body.trim(), date: new Date().toISOString() }] };
    saveMaterials(next);
    setForm({ title: "", body: "" });
    setModal(false);
    notify("Lesson note added");
  };

  const removeMaterial = (id) => {
    saveMaterials({ list: materials.list.filter((m) => m.id !== id) });
    notify("Lesson note removed");
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <PrimaryButton icon={Plus} onClick={() => setModal(true)}>New lesson note</PrimaryButton>
      </div>
      <div className="space-y-3">
        {items
          .slice()
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{m.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                    {new Date(m.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </div>
                </div>
                <GhostButton icon={Trash2} danger onClick={() => removeMaterial(m.id)}>Remove</GhostButton>
              </div>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{m.body}</p>
            </Card>
          ))}
        {items.length === 0 && <EmptyState text="No lesson notes posted yet." />}
      </div>

      {modal && (
        <Modal title="New lesson note" onClose={() => setModal(false)}>
          <Field label="Title">
            <input className={inputClass} style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Notes">
            <textarea rows={5} className={inputClass} style={inputStyle} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </Field>
          <PrimaryButton full onClick={addMaterial}>Post note</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function TeacherScores({ subject, students, results, saveResults, currentTerm, currentSession, notify, logAction = () => {} }) {
  const findEntry = (studentId) => results.entries.find((r) => r.subjectId === subject.id && r.studentId === studentId && r.term === currentTerm && r.session === currentSession);

  const [rows, setRows] = useState(() =>
    students.reduce((acc, s) => {
      const e = findEntry(s.id);
      acc[s.id] = { ca1: e?.ca1 ?? "", ca2: e?.ca2 ?? "", exam: e?.exam ?? "" };
      return acc;
    }, {})
  );

  useEffect(() => {
    setRows(
      students.reduce((acc, s) => {
        const e = findEntry(s.id);
        acc[s.id] = { ca1: e?.ca1 ?? "", ca2: e?.ca2 ?? "", exam: e?.exam ?? "" };
        return acc;
      }, {})
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject.id, currentTerm, currentSession, students.length]);

  const updateField = (studentId, field, value) => {
    setRows((r) => ({ ...r, [studentId]: { ...r[studentId], [field]: value } }));
  };

  const totalFor = (studentId) => {
    const r = rows[studentId] || {};
    const ca1 = Number(r.ca1) || 0;
    const ca2 = Number(r.ca2) || 0;
    const exam = Number(r.exam) || 0;
    return ca1 + ca2 + exam;
  };

  const saveAll = () => {
    const others = results.entries.filter((r) => !(r.subjectId === subject.id && r.term === currentTerm && r.session === currentSession));
    const updated = students
      .filter((s) => rows[s.id] && (rows[s.id].ca1 !== "" || rows[s.id].ca2 !== "" || rows[s.id].exam !== ""))
      .map((s) => {
        const existing = findEntry(s.id);
        return {
          id: existing?.id || uid("res"),
          subjectId: subject.id,
          studentId: s.id,
          term: currentTerm,
          session: currentSession,
          ca1: rows[s.id].ca1 === "" ? 0 : Number(rows[s.id].ca1),
          ca2: rows[s.id].ca2 === "" ? 0 : Number(rows[s.id].ca2),
          exam: rows[s.id].exam === "" ? 0 : Number(rows[s.id].exam),
          updatedAt: new Date().toISOString(),
        };
      });
    saveResults({ entries: [...others, ...updated] });
    notify("Scores saved");
    logAction(`Saved scores for ${subject.name} (${currentTerm}, ${currentSession}) — ${updated.length} student${updated.length === 1 ? "" : "s"}`);
  };

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
        {currentTerm} · {currentSession} · 1st CA (/20), 2nd CA (/20) and Exam (/60) combine to a total out of 100 — this feeds each student's report card directly.
      </p>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 560 }}>
          <thead>
            <tr style={{ backgroundColor: THEME.paper }}>
              {["Student", "1st CA /20", "2nd CA /20", "Exam /60", "Total /100", "Grade"].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const total = totalFor(s.id);
              const hasAny = rows[s.id] && (rows[s.id].ca1 !== "" || rows[s.id].ca2 !== "" || rows[s.id].exam !== "");
              const g = hasAny ? letterGrade(total) : null;
              return (
                <tr key={s.id} className="border-t" style={{ borderColor: THEME.rule }}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{s.name}</td>
                  {["ca1", "ca2", "exam"].map((field) => (
                    <td key={field} className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        max={field === "exam" ? 60 : 20}
                        className="w-16 px-2 py-1 rounded-md border text-xs"
                        style={inputStyle}
                        value={rows[s.id]?.[field] ?? ""}
                        onChange={(e) => updateField(s.id, field, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 font-semibold" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{hasAny ? total : "—"}</td>
                  <td className="px-3 py-2" style={{ color: THEME.margin, fontFamily: "Kalam, cursive", fontWeight: 700 }}>{g?.grade || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {students.length === 0 && <div className="p-4"><EmptyState text="No students in this class yet." /></div>}
      </Card>
      {students.length > 0 && (
        <div className="mt-4">
          <PrimaryButton onClick={saveAll}>Save scores</PrimaryButton>
        </div>
      )}
    </div>
  );
}

function DiscussionBoard({ subject, directory, discussions, saveDiscussions, currentUser, notify }) {
  const threads = discussions.threads.filter((t) => t.subjectId === subject.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const [openThread, setOpenThread] = useState(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", body: "" });
  const [reply, setReply] = useState("");

  const authorName = (id) => directory.users.find((u) => u.id === id)?.name || "Unknown";

  const createThread = () => {
    if (!form.title.trim() || !form.body.trim()) return;
    const newThread = { id: uid("th"), subjectId: subject.id, authorId: currentUser.id, title: form.title.trim(), body: form.body.trim(), date: new Date().toISOString() };
    saveDiscussions({ ...discussions, threads: [...discussions.threads, newThread] });
    setForm({ title: "", body: "" });
    setModal(false);
    notify("Discussion posted");
  };

  const removeThread = (id) => {
    saveDiscussions({ threads: discussions.threads.filter((t) => t.id !== id), replies: discussions.replies.filter((r) => r.threadId !== id) });
    notify("Discussion removed");
  };

  const postReply = () => {
    if (!reply.trim() || !openThread) return;
    saveDiscussions({ ...discussions, replies: [...discussions.replies, { id: uid("r"), threadId: openThread.id, authorId: currentUser.id, body: reply.trim(), date: new Date().toISOString() }] });
    setReply("");
  };

  if (openThread) {
    const threadReplies = discussions.replies.filter((r) => r.threadId === openThread.id).sort((a, b) => new Date(a.date) - new Date(b.date));
    return (
      <div>
        <button onClick={() => setOpenThread(null)} className="inline-flex items-center gap-1 text-xs font-semibold mb-4 hover:opacity-70" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          <ChevronLeft size={14} /> Back to discussion
        </button>
        <Card className="p-4 mb-3">
          <div className="text-xs mb-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
            {authorName(openThread.authorId)} · {new Date(openThread.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </div>
          <h3 className="font-semibold text-sm mb-2" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{openThread.title}</h3>
          <p className="text-sm leading-relaxed" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{openThread.body}</p>
        </Card>
        <div className="space-y-2 mb-4">
          {threadReplies.map((r) => (
            <div key={r.id} className="flex gap-2 pl-4" style={{ borderLeft: `2px solid ${THEME.rule}` }}>
              <Reply size={13} style={{ color: THEME.muted, marginTop: 3 }} />
              <div>
                <div className="text-xs font-semibold" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
                  {authorName(r.authorId)} <span className="font-normal" style={{ color: THEME.muted }}>· {new Date(r.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                </div>
                <p className="text-sm mt-0.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{r.body}</p>
              </div>
            </div>
          ))}
          {threadReplies.length === 0 && <p className="text-xs pl-4" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>No replies yet.</p>}
        </div>
        <div className="flex gap-2">
          <input className={inputClass} style={inputStyle} placeholder="Write a reply…" value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && postReply()} />
          <PrimaryButton icon={Send} onClick={postReply}>Reply</PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <PrimaryButton icon={Plus} onClick={() => setModal(true)}>New discussion</PrimaryButton>
      </div>
      <div className="space-y-3">
        {threads.map((t) => {
          const replyCount = discussions.replies.filter((r) => r.threadId === t.id).length;
          return (
            <Card key={t.id} className="p-4 flex items-center justify-between gap-3">
              <button className="text-left flex-1" onClick={() => setOpenThread(t)}>
                <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{t.title}</div>
                <div className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                  {authorName(t.authorId)} · {replyCount} repl{replyCount === 1 ? "y" : "ies"}
                </div>
              </button>
              {t.authorId === currentUser.id && <GhostButton icon={Trash2} danger onClick={() => removeThread(t.id)}>Remove</GhostButton>}
            </Card>
          );
        })}
        {threads.length === 0 && <EmptyState text="No discussions yet — start the conversation." />}
      </div>

      {modal && (
        <Modal title="New discussion" onClose={() => setModal(false)}>
          <Field label="Title">
            <input className={inputClass} style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Message">
            <textarea rows={4} className={inputClass} style={inputStyle} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </Field>
          <PrimaryButton full onClick={createThread}>Post</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function StudentSubjectDetail({ subject, directory, materials, discussions, saveDiscussions, currentUser, onBack, notify }) {
  const [tab, setTab] = useState("discussion");
  const teacher = directory.users.find((u) => u.id === subject.teacherId);
  const subjectMaterials = materials.list.filter((m) => m.subjectId === subject.id).sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold mb-4 hover:opacity-70" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
        <ChevronLeft size={14} /> Back to my subjects
      </button>
      <SectionTitle eyebrow={teacher?.name} title={subject.name} />
      <div className="flex gap-2 mb-5">
        {[
          { key: "discussion", label: "Discussion" },
          { key: "notes", label: "Lesson Notes" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-1.5 rounded-full text-xs font-semibold border"
            style={{
              borderColor: tab === t.key ? THEME.chalk : THEME.rule,
              backgroundColor: tab === t.key ? THEME.chalk : "transparent",
              color: tab === t.key ? CREAM : THEME.ink,
              fontFamily: "Inter, sans-serif",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "discussion" && (
        <DiscussionBoard subject={subject} directory={directory} discussions={discussions} saveDiscussions={saveDiscussions} currentUser={currentUser} notify={notify} />
      )}
      {tab === "notes" && (
        <div className="space-y-3">
          {subjectMaterials.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{m.title}</div>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{m.body}</p>
            </Card>
          ))}
          {subjectMaterials.length === 0 && <EmptyState text="No lesson notes posted yet." />}
        </div>
      )}
    </div>
  );
}

function TeacherTimetable({ directory, currentUser, timetable }) {
  const myClassIds = [...new Set(directory.subjects.filter((s) => s.teacherId === currentUser.id).map((s) => s.classId))];
  const [classId, setClassId] = useState(myClassIds[0] || "");

  if (myClassIds.length === 0) return <EmptyState text="You are not assigned to any classes yet." />;

  return (
    <div>
      <SectionTitle
        eyebrow="Teacher"
        title="Timetable"
        right={
          <select className={inputClass} style={{ ...inputStyle, width: 160 }} value={classId} onChange={(e) => setClassId(e.target.value)}>
            {myClassIds.map((id) => <option key={id} value={id}>{directory.classes.find((c) => c.id === id)?.name}</option>)}
          </select>
        }
      />
      <p className="text-xs mb-3" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Your periods are highlighted in green.</p>
      <TimetableGrid classId={classId} directory={directory} timetable={timetable} highlightTeacherId={currentUser.id} />
    </div>
  );
}

function TeacherAttendance({ classId, students, attendance, saveAttendance, notify }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const existing = attendance.records.find((r) => r.classId === classId && r.date === date);
  const [marks, setMarks] = useState(existing?.marks || {});

  useEffect(() => {
    const rec = attendance.records.find((r) => r.classId === classId && r.date === date);
    setMarks(rec?.marks || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, classId]);

  const toggle = (studentId, status) => {
    setMarks((m) => ({ ...m, [studentId]: status }));
  };

  const save = () => {
    const others = attendance.records.filter((r) => !(r.classId === classId && r.date === date));
    const recordId = existing?.id || uid("att");
    saveAttendance({ records: [...others, { id: recordId, classId, date, marks }] });
    notify("Attendance saved");
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Field label="Date">
          <input type="date" className={inputClass} style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: THEME.paper }}>
              <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Student</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-t" style={{ borderColor: THEME.rule }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{s.name}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggle(s.id, "present")}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border"
                      style={{
                        borderColor: marks[s.id] === "present" ? THEME.chalk : THEME.rule,
                        backgroundColor: marks[s.id] === "present" ? THEME.chalk : "transparent",
                        color: marks[s.id] === "present" ? CREAM : THEME.ink,
                      }}
                    >
                      <CheckCircle2 size={13} /> Present
                    </button>
                    <button
                      onClick={() => toggle(s.id, "absent")}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border"
                      style={{
                        borderColor: marks[s.id] === "absent" ? THEME.margin : THEME.rule,
                        backgroundColor: marks[s.id] === "absent" ? THEME.margin : "transparent",
                        color: marks[s.id] === "absent" ? CREAM : THEME.ink,
                      }}
                    >
                      <XCircle size={13} /> Absent
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="mt-4">
        <PrimaryButton onClick={save}>Save attendance</PrimaryButton>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* STUDENT VIEWS                                                           */
/* ---------------------------------------------------------------------- */
function StudentSubjects({ directory, currentUser, onOpenSubject }) {
  const mySubjects = directory.subjects.filter((s) => s.classId === currentUser.classId);
  const cls = directory.classes.find((c) => c.id === currentUser.classId);
  const classTeacher = directory.users.find((u) => u.id === cls?.classTeacherId);
  return (
    <div>
      <SectionTitle eyebrow={cls?.name} title="My Subjects" />
      {classTeacher && (
        <p className="text-xs mb-4" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          Class teacher: <span style={{ color: THEME.ink, fontWeight: 600 }}>{classTeacher.name}</span>
        </p>
      )}
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {mySubjects.map((s) => {
          const teacher = directory.users.find((u) => u.id === s.teacherId);
          return (
            <Card key={s.id} className="p-4">
              <button className="text-left w-full" onClick={() => onOpenSubject(s)}>
                <div className="font-semibold" style={{ color: THEME.ink, fontFamily: "Lora, serif", fontSize: 17 }}>{s.name}</div>
                <div className="text-xs mt-2" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{teacher?.name}</div>
                <div className="text-xs mt-2" style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}>Discussion & notes →</div>
              </button>
            </Card>
          );
        })}
        {mySubjects.length === 0 && <EmptyState text="No subjects assigned to your class yet." />}
      </div>
    </div>
  );
}

function StudentAssignments({ directory, coursework, saveCoursework, currentUser, notify }) {
  const mySubjectIds = directory.subjects.filter((s) => s.classId === currentUser.classId).map((s) => s.id);
  const myAssignments = coursework.assignments
    .filter((a) => mySubjectIds.includes(a.subjectId))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState(null); // { name, type, size, dataUrl }
  const [uploadError, setUploadError] = useState("");

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadError("");
    try {
      const read = await readFileAsDataUrl(f);
      setFile(read);
    } catch (err) {
      setUploadError(err.message);
      e.target.value = "";
    }
  };

  const submit = (assignmentId) => {
    if (!draft.trim() && !file) return;
    const existingIdx = coursework.submissions.findIndex((s) => s.assignmentId === assignmentId && s.studentId === currentUser.id);
    const fileFields = file ? { fileName: file.name, fileType: file.type, fileSize: file.size, fileData: file.dataUrl } : {};
    let submissions;
    if (existingIdx >= 0) {
      submissions = coursework.submissions.map((s, i) => (i === existingIdx ? { ...s, content: draft.trim(), submittedAt: new Date().toISOString(), ...fileFields } : s));
    } else {
      submissions = [...coursework.submissions, { id: uid("sm"), assignmentId, studentId: currentUser.id, content: draft.trim(), submittedAt: new Date().toISOString(), score: null, feedback: "", ...fileFields }];
    }
    saveCoursework({ ...coursework, submissions });
    setDraft("");
    setFile(null);
    setOpenId(null);
    notify("Assignment submitted");
  };

  return (
    <div>
      <SectionTitle eyebrow="Coursework" title="Assignments" />
      <div className="space-y-3">
        {myAssignments.map((a) => {
          const subject = directory.subjects.find((s) => s.id === a.subjectId);
          const sub = coursework.submissions.find((s) => s.assignmentId === a.id && s.studentId === currentUser.id);
          const overdue = !sub && new Date(a.dueDate) < new Date();
          return (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}>{subject?.name}</div>
                  <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{a.title}</div>
                  <p className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{a.description}</p>
                  <p className="text-xs mt-1.5" style={{ color: overdue ? THEME.margin : THEME.muted, fontFamily: "Inter, sans-serif" }}>
                    Due {new Date(a.dueDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })} {overdue && "· Overdue"}
                  </p>
                  {sub?.fileName && (
                    <a href={sub.fileData} download={sub.fileName} className="text-xs mt-1.5 inline-flex items-center gap-1 hover:underline" style={{ color: THEME.chalk, fontFamily: "Inter, sans-serif" }}>
                      <Download size={12} /> {sub.fileName}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {sub?.score != null && <ScoreMark score={sub.score} max={a.maxScore} />}
                  {!sub?.score && (
                    <GhostButton onClick={() => { setOpenId(a.id); setDraft(sub?.content || ""); setFile(null); setUploadError(""); }}>
                      {sub ? "Edit submission" : "Submit"}
                    </GhostButton>
                  )}
                </div>
              </div>
              {sub?.feedback && (
                <p className="text-xs mt-2 pt-2 border-t" style={{ color: THEME.ink, borderColor: THEME.rule, fontFamily: "Inter, sans-serif" }}>
                  <span className="font-semibold">Teacher feedback: </span>{sub.feedback}
                </p>
              )}
              {openId === a.id && (
                <div className="mt-3 pt-3 border-t" style={{ borderColor: THEME.rule }}>
                  <textarea
                    rows={3}
                    className={inputClass}
                    style={inputStyle}
                    placeholder="Type your answer here…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <div className="mt-2">
                    <input type="file" onChange={handleFile} className="text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }} />
                    {file && <p className="text-xs mt-1" style={{ color: THEME.chalk, fontFamily: "Inter, sans-serif" }}>Attached: {file.name} ({Math.round(file.size / 1024)}KB)</p>}
                    {uploadError && <p className="text-xs mt-1" style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}>{uploadError}</p>}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <PrimaryButton icon={Send} onClick={() => submit(a.id)}>Submit</PrimaryButton>
                    <GhostButton onClick={() => setOpenId(null)}>Cancel</GhostButton>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {myAssignments.length === 0 && <EmptyState text="No assignments yet." />}
      </div>
    </div>
  );
}

function StudentGrades({ directory, coursework, currentUser }) {
  const mySubjectIds = directory.subjects.filter((s) => s.classId === currentUser.classId).map((s) => s.id);
  const graded = coursework.submissions.filter((s) => s.studentId === currentUser.id && s.score != null);
  const avgPct =
    graded.length > 0
      ? Math.round(
          (graded.reduce((sum, s) => {
            const a = coursework.assignments.find((a) => a.id === s.assignmentId);
            return sum + (a ? s.score / a.maxScore : 0);
          }, 0) /
            graded.length) *
            100
        )
      : null;

  return (
    <div>
      <SectionTitle eyebrow="Report" title="My Grades" />
      {avgPct != null && (
        <Card className="p-5 mb-5 inline-block">
          <div className="text-3xl" style={{ color: THEME.chalk, fontFamily: "Lora, serif", fontWeight: 700 }}>{avgPct}%</div>
          <div className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Average across graded work</div>
        </Card>
      )}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: THEME.paper }}>
              {["Subject", "Assignment", "Score", "Feedback"].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coursework.assignments
              .filter((a) => mySubjectIds.includes(a.subjectId))
              .map((a) => {
                const sub = coursework.submissions.find((s) => s.assignmentId === a.id && s.studentId === currentUser.id);
                const subject = directory.subjects.find((s) => s.id === a.subjectId);
                return (
                  <tr key={a.id} className="border-t" style={{ borderColor: THEME.rule }}>
                    <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{subject?.name}</td>
                    <td className="px-4 py-2.5 font-medium" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{a.title}</td>
                    <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
                      {sub?.score != null ? `${sub.score} / ${a.maxScore}` : sub ? "Awaiting grade" : "Not submitted"}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{sub?.feedback || "—"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function StudentAttendance({ attendance, currentUser }) {
  const myRecords = attendance.records
    .filter((r) => r.marks && Object.prototype.hasOwnProperty.call(r.marks, currentUser.id))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const presentCount = myRecords.filter((r) => r.marks[currentUser.id] === "present").length;
  const pct = myRecords.length ? Math.round((presentCount / myRecords.length) * 100) : null;

  return (
    <div>
      <SectionTitle eyebrow="Register" title="My Attendance" />
      {pct != null && (
        <Card className="p-5 mb-5 inline-block">
          <div className="text-3xl" style={{ color: pct >= 75 ? THEME.chalk : THEME.margin, fontFamily: "Lora, serif", fontWeight: 700 }}>{pct}%</div>
          <div className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
            Present {presentCount} of {myRecords.length} recorded days
          </div>
        </Card>
      )}
      <div className="space-y-2">
        {myRecords.map((r) => (
          <Card key={r.id} className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
              {new Date(r.date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
            </span>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: r.marks[currentUser.id] === "present" ? "rgba(47,82,51,0.12)" : "rgba(181,67,58,0.12)",
                color: r.marks[currentUser.id] === "present" ? THEME.chalk : THEME.margin,
                fontFamily: "Inter, sans-serif",
              }}
            >
              {r.marks[currentUser.id] === "present" ? "Present" : "Absent"}
            </span>
          </Card>
        ))}
        {myRecords.length === 0 && <EmptyState text="No attendance recorded yet." />}
      </div>
    </div>
  );
}

function StudentTimetable({ directory, currentUser, timetable }) {
  return (
    <div>
      <SectionTitle eyebrow={directory.classes.find((c) => c.id === currentUser.classId)?.name} title="Timetable" />
      <TimetableGrid classId={currentUser.classId} directory={directory} timetable={timetable} />
    </div>
  );
}

function StudentExams({ directory, examinations, saveExaminations, currentUser, notify }) {
  const mySubjectIds = directory.subjects.filter((s) => s.classId === currentUser.classId).map((s) => s.id);
  const myExams = examinations.exams.filter((e) => mySubjectIds.includes(e.subjectId));
  const [activeExam, setActiveExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [reviewing, setReviewing] = useState(null);

  const startExam = (exam) => {
    setActiveExam(exam);
    setAnswers({});
  };

  const submitExam = () => {
    const totalPoints = activeExam.questions.reduce((sum, q) => sum + q.points, 0);
    const score = activeExam.questions.reduce((sum, q) => (answers[q.id] === q.correctIndex ? sum + q.points : sum), 0);
    const submission = { id: uid("es"), examId: activeExam.id, studentId: currentUser.id, answers, score, submittedAt: new Date().toISOString() };
    saveExaminations({ ...examinations, submissions: [...examinations.submissions.filter((s) => !(s.examId === activeExam.id && s.studentId === currentUser.id)), submission] });
    notify(`Exam submitted — scored ${score}/${totalPoints}`);
    setActiveExam(null);
  };

  if (activeExam) {
    const answeredAll = activeExam.questions.every((q) => answers[q.id] != null);
    return (
      <div>
        <SectionTitle eyebrow="Exam in progress" title={activeExam.title} />
        <div className="space-y-4">
          {activeExam.questions.map((q, qi) => (
            <Card key={q.id} className="p-4">
              <p className="text-sm font-semibold mb-3" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
                {qi + 1}. {q.text} <span style={{ color: THEME.muted, fontWeight: 400 }}>({q.points} pts)</span>
              </p>
              <div className="space-y-2">
                {q.options.map((opt, oi) => (
                  <label key={oi} className="flex items-center gap-2 text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
                    <input type="radio" name={q.id} checked={answers[q.id] === oi} onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))} />
                    {opt}
                  </label>
                ))}
              </div>
            </Card>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <PrimaryButton icon={Send} onClick={submitExam}>{answeredAll ? "Submit exam" : "Submit (some unanswered)"}</PrimaryButton>
          <GhostButton onClick={() => setActiveExam(null)}>Cancel</GhostButton>
        </div>
      </div>
    );
  }

  if (reviewing) {
    const sub = examinations.submissions.find((s) => s.examId === reviewing.id && s.studentId === currentUser.id);
    const totalPoints = reviewing.questions.reduce((sum, q) => sum + q.points, 0);
    return (
      <div>
        <button onClick={() => setReviewing(null)} className="inline-flex items-center gap-1 text-xs font-semibold mb-4 hover:opacity-70" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          <ChevronLeft size={14} /> Back to exams
        </button>
        <SectionTitle eyebrow={`Scored ${sub.score} / ${totalPoints}`} title={reviewing.title} />
        <div className="space-y-3">
          {reviewing.questions.map((q, qi) => {
            const mine = sub.answers[q.id];
            const correct = mine === q.correctIndex;
            return (
              <Card key={q.id} className="p-4">
                <div className="flex items-start gap-2">
                  {correct ? <CheckCircle2 size={16} style={{ color: THEME.chalk, marginTop: 2 }} /> : <XCircle size={16} style={{ color: THEME.margin, marginTop: 2 }} />}
                  <div>
                    <p className="text-sm font-semibold" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{qi + 1}. {q.text}</p>
                    <p className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                      Your answer: {q.options[mine] ?? "—"}{!correct && ` · Correct answer: ${q.options[q.correctIndex]}`}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle eyebrow="Assessment" title="Exams" />
      <div className="space-y-3">
        {myExams.map((ex) => {
          const subject = directory.subjects.find((s) => s.id === ex.subjectId);
          const sub = examinations.submissions.find((s) => s.examId === ex.id && s.studentId === currentUser.id);
          const totalPoints = ex.questions.reduce((sum, q) => sum + q.points, 0);
          return (
            <Card key={ex.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}>{subject?.name}</div>
                <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{ex.title}</div>
                <div className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{ex.questions.length} questions · {totalPoints} points</div>
              </div>
              {sub ? (
                <div className="flex items-center gap-3">
                  <ScoreMark score={sub.score} max={totalPoints} />
                  <GhostButton onClick={() => setReviewing(ex)}>Review</GhostButton>
                </div>
              ) : (
                <PrimaryButton onClick={() => startExam(ex)}>Start exam</PrimaryButton>
              )}
            </Card>
          );
        })}
        {myExams.length === 0 && <EmptyState text="No exams available yet." />}
      </div>
    </div>
  );
}

function StudentMaterials({ directory, materials, currentUser }) {
  const mySubjectIds = directory.subjects.filter((s) => s.classId === currentUser.classId).map((s) => s.id);
  const mine = materials.list
    .filter((m) => mySubjectIds.includes(m.subjectId))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div>
      <SectionTitle eyebrow="Study" title="Lesson Notes" />
      <div className="space-y-3">
        {mine.map((m) => {
          const subject = directory.subjects.find((s) => s.id === m.subjectId);
          return (
            <Card key={m.id} className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}>{subject?.name}</div>
              <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{m.title}</div>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{m.body}</p>
            </Card>
          );
        })}
        {mine.length === 0 && <EmptyState text="No lesson notes posted yet." />}
      </div>
    </div>
  );
}

function StudentReportCard({ directory, results, currentTerm, currentSession, currentUser, schoolName, logoDataUrl }) {
  const availableSessions = [...new Set([currentSession, ...(currentUser.enrollmentHistory || []).map((e) => e.session)])].sort((a, b) => (a < b ? 1 : -1));
  const [session, setSession] = useState(currentSession);
  const [term, setTerm] = useState(currentTerm);

  const classId = classIdForSession(currentUser, session);
  const cls = directory.classes.find((c) => c.id === classId);
  const subjectsThatSession = directory.subjects.filter((s) => s.classId === classId);

  const rows = subjectsThatSession.map((subj) => {
    const entry = results.entries.find((r) => r.subjectId === subj.id && r.studentId === currentUser.id && r.term === term && r.session === session);
    const total = entry ? entry.ca1 + entry.ca2 + entry.exam : null;
    return { subject: subj, entry, total };
  });

  const scoredRows = rows.filter((r) => r.total != null);
  const overallAvg = scoredRows.length ? Math.round(scoredRows.reduce((s, r) => s + r.total, 0) / scoredRows.length) : null;

  return (
    <div>
      <SectionTitle
        eyebrow={`${cls?.name || "No class on record"} · ${term} · ${session}`}
        title="Report Card"
        right={
          <div className="flex items-center gap-2 flex-wrap">
            <select className={inputClass} style={{ ...inputStyle, width: 120 }} value={session} onChange={(e) => setSession(e.target.value)}>
              {availableSessions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={inputClass} style={{ ...inputStyle, width: 140 }} value={term} onChange={(e) => setTerm(e.target.value)}>
              {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <GhostButton icon={Printer} onClick={() => window.print()}>Print</GhostButton>
          </div>
        }
      />
      <Card className="p-6 mb-5">
        <div className="flex flex-col items-center text-center pb-4 mb-4 border-b" style={{ borderColor: THEME.rule }}>
          {logoDataUrl ? (
            <img src={logoDataUrl} alt={`${schoolName} logo`} className="w-14 h-14 rounded object-contain mb-2" />
          ) : (
            <School size={32} style={{ color: THEME.ink, marginBottom: 8 }} />
          )}
          <div style={{ color: THEME.ink, fontFamily: "Lora, serif", fontWeight: 700, fontSize: 18 }}>{schoolName}</div>
          <div className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Student Report Card · {term} · {session}</div>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-4 pb-4 mb-4 border-b" style={{ borderColor: THEME.rule }}>
          <div>
            <div className="text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Student</div>
            <div className="font-semibold" style={{ color: THEME.ink, fontFamily: "Lora, serif", fontSize: 18 }}>{currentUser.name}</div>
          </div>
          <div>
            <div className="text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Class</div>
            <div className="font-semibold" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{cls?.name || "—"}</div>
          </div>
          {overallAvg != null && (
            <div className="text-right">
              <div className="text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Term average</div>
              <div className="text-2xl" style={{ color: THEME.chalk, fontFamily: "Lora, serif", fontWeight: 700 }}>{overallAvg}%</div>
            </div>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr>
              {["Subject", "1st CA /20", "2nd CA /20", "Exam /60", "Total /100", "Grade", "Remark"].map((h) => (
                <th key={h} className="text-left px-2 py-2 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const g = r.total != null ? letterGrade(r.total) : null;
              return (
                <tr key={r.subject.id} className="border-t" style={{ borderColor: THEME.rule }}>
                  <td className="px-2 py-2 font-medium" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{r.subject.name}</td>
                  <td className="px-2 py-2" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{r.entry ? r.entry.ca1 : "—"}</td>
                  <td className="px-2 py-2" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{r.entry ? r.entry.ca2 : "—"}</td>
                  <td className="px-2 py-2" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{r.entry ? r.entry.exam : "—"}</td>
                  <td className="px-2 py-2 font-semibold" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{r.total != null ? r.total : "—"}</td>
                  <td className="px-2 py-2" style={{ color: THEME.margin, fontFamily: "Kalam, cursive", fontWeight: 700 }}>{g?.grade || "—"}</td>
                  <td className="px-2 py-2 text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{g?.remark || "No result entered yet"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                  No class or subjects on record for {session}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <p className="text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
        Scores are entered by each subject teacher for {term.toLowerCase()}. Assignment and exam activity in the Grades tab is separate classwork practice and doesn't feed this report directly.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* PARENT VIEWS                                                            */
/* ---------------------------------------------------------------------- */
function ParentChildren({ directory, currentUser, onOpenChild }) {
  const children = (currentUser.childIds || []).map((id) => directory.users.find((u) => u.id === id)).filter(Boolean);
  return (
    <div>
      <SectionTitle eyebrow="Parent" title="My Children" />
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {children.map((child) => {
          const cls = directory.classes.find((c) => c.id === child.classId);
          const classTeacher = directory.users.find((u) => u.id === cls?.classTeacherId);
          return (
            <Card key={child.id} className="p-4">
              <button className="text-left w-full" onClick={() => onOpenChild(child)}>
                <div className="flex items-center gap-2 mb-1">
                  <Baby size={16} style={{ color: THEME.margin }} />
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}>{cls?.name}</span>
                </div>
                <div className="font-semibold" style={{ color: THEME.ink, fontFamily: "Lora, serif", fontSize: 17 }}>{child.name}</div>
                {classTeacher && (
                  <div className="text-xs mt-1" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>Class teacher: {classTeacher.name}</div>
                )}
                <div className="text-xs mt-2" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>View report card, attendance, timetable & fees</div>
              </button>
            </Card>
          );
        })}
        {children.length === 0 && <EmptyState text="No children linked to your account yet. Contact your school admin." />}
      </div>
    </div>
  );
}

function ParentChildDetail({ child, directory, results, currentTerm, currentSession, attendance, timetable, fees, schoolName, logoDataUrl, onBack }) {
  const [tab, setTab] = useState("reportcard");
  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold mb-4 hover:opacity-70" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
        <ChevronLeft size={14} /> Back to my children
      </button>
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { key: "reportcard", label: "Report Card" },
          { key: "attendance", label: "Attendance" },
          { key: "timetable", label: "Timetable" },
          { key: "fees", label: "Fees" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-1.5 rounded-full text-xs font-semibold border"
            style={{
              borderColor: tab === t.key ? THEME.chalk : THEME.rule,
              backgroundColor: tab === t.key ? THEME.chalk : "transparent",
              color: tab === t.key ? CREAM : THEME.ink,
              fontFamily: "Inter, sans-serif",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "reportcard" && <StudentReportCard directory={directory} results={results} currentTerm={currentTerm} currentSession={currentSession} currentUser={child} schoolName={schoolName} logoDataUrl={logoDataUrl} />}
      {tab === "attendance" && <StudentAttendance attendance={attendance} currentUser={child} />}
      {tab === "timetable" && <StudentTimetable directory={directory} currentUser={child} timetable={timetable} />}
      {tab === "fees" && <FeesView mode="view" directory={directory} fees={fees} currentTerm={currentTerm} currentSession={currentSession} studentId={child.id} />}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* ROOT APP                                                                 */
/* ---------------------------------------------------------------------- */
function SchoolApp({ schoolId, schoolName, isDemo, onExitPlatform }) {
  const k = useCallback((key) => `${schoolId}:${key}`, [schoolId]);
  const [loading, setLoading] = useState(true);
  const [directory, setDirectory] = useState({ users: [], classes: [], subjects: [] });
  const [coursework, setCoursework] = useState({ assignments: [], submissions: [] });
  const [attendance, setAttendance] = useState({ records: [] });
  const [announcements, setAnnouncements] = useState([]);
  const [timetable, setTimetable] = useState({ slots: [] });
  const [examinations, setExaminations] = useState({ exams: [], submissions: [] });
  const [materials, setMaterials] = useState({ list: [] });
  const [settings, setSettings] = useState({ currentTerm: "First Term" });
  const [results, setResults] = useState({ entries: [] });
  const [fees, setFees] = useState({ schedule: [], payments: [] });
  const [messages, setMessages] = useState({ list: [] });
  const [discussions, setDiscussions] = useState({ threads: [], replies: [] });
  const [auditlog, setAuditlog] = useState({ entries: [] });
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState("dashboard");
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedChild, setSelectedChild] = useState(null);
  const [selectedStudentSubject, setSelectedStudentSubject] = useState(null);
  const [toast, setToast] = useState("");
  const [platformAnnouncements, setPlatformAnnouncements] = useState([]);
  const [darkMode, setDarkMode] = useState(false);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => {
    (async () => {
      const seed = seedData();
      let dir = await getStored(k("directory"), true, seed.directory);
      const dirWasSeeded = dir === seed.directory;
      const needsHashing = dir.users.some((u) => u.password && !looksHashed(u.password));
      if (needsHashing) {
        const migratedUsers = await Promise.all(
          dir.users.map(async (u) => (u.password && !looksHashed(u.password) ? { ...u, password: await hashPassword(u.password) } : u))
        );
        dir = { ...dir, users: migratedUsers };
      }
      const dirNeedsSave = dirWasSeeded || needsHashing;
      const cw = await getStored(k("coursework"), true, seed.coursework);
      const att = await getStored(k("attendance"), true, seed.attendance);
      const ann = await getStored(k("announcements"), true, seed.announcements);
      const tt = await getStored(k("timetable"), true, seed.timetable);
      const exm = await getStored(k("examinations"), true, seed.examinations);
      const mat = await getStored(k("materials"), true, seed.materials);
      const set = await getStored(k("settings"), true, seed.settings);
      const res = await getStored(k("results"), true, seed.results);
      const fee = await getStored(k("fees"), true, seed.fees);
      const msg = await getStored(k("messages"), true, seed.messages);
      const disc = await getStored(k("discussions"), true, seed.discussions);
      const log = await getStored(k("auditlog"), true, seed.auditlog);
      setDirectory(dir);
      setCoursework(cw);
      setAttendance(att);
      setAnnouncements(ann);
      setTimetable(tt);
      setExaminations(exm);
      setMaterials(mat);
      setSettings(set);
      setResults(res);
      setFees(fee);
      setMessages(msg);
      setDiscussions(disc);
      setAuditlog(log);

      // ensure the backing store actually has these keys the first time
      if (dirNeedsSave) await setStored(k("directory"), true, dir);
      if (cw === seed.coursework) await setStored(k("coursework"), true, cw);
      if (att === seed.attendance) await setStored(k("attendance"), true, att);
      if (ann === seed.announcements) await setStored(k("announcements"), true, ann);
      if (tt === seed.timetable) await setStored(k("timetable"), true, tt);
      if (exm === seed.examinations) await setStored(k("examinations"), true, exm);
      if (mat === seed.materials) await setStored(k("materials"), true, mat);
      if (set === seed.settings) await setStored(k("settings"), true, set);
      if (res === seed.results) await setStored(k("results"), true, res);
      if (fee === seed.fees) await setStored(k("fees"), true, fee);
      if (msg === seed.messages) await setStored(k("messages"), true, msg);
      if (disc === seed.discussions) await setStored(k("discussions"), true, disc);
      if (log === seed.auditlog) await setStored(k("auditlog"), true, log);

      if (window.USE_REAL_AUTH) {
        const session = await window.auth.getSession();
        if (session) {
          const profile = await window.auth.getMyProfile();
          if (profile && profile.school_id === schoolId) {
            const u = dir.users.find((x) => x.username === profile.app_username);
            if (u) setCurrentUser(u);
          }
        }
      } else {
        const savedUsername = await getStored(k("session"), false, null);
        if (savedUsername) {
          const u = dir.users.find((x) => x.username === savedUsername);
          if (u) setCurrentUser(u);
        }
      }
      const savedDark = await getStored(k("darkmode"), false, false);
      setDarkMode(!!savedDark);
      const announcementsList = await getStored("platform_announcements", true, []);
      setPlatformAnnouncements(announcementsList || []);
      setLoading(false);
    })();
  }, []);

  const saveDirectory = (next) => {
    setDirectory(next);
    setStored(k("directory"), true, next);
  };
  const saveCoursework = (next) => {
    setCoursework(next);
    setStored(k("coursework"), true, next);
  };
  const saveAttendance = (next) => {
    setAttendance(next);
    setStored(k("attendance"), true, next);
  };
  const addAnnouncement = (a) => {
    const next = [...announcements, a];
    setAnnouncements(next);
    setStored(k("announcements"), true, next);
  };
  const saveTimetable = (next) => {
    setTimetable(next);
    setStored(k("timetable"), true, next);
  };
  const saveExaminations = (next) => {
    setExaminations(next);
    setStored(k("examinations"), true, next);
  };
  const saveMaterials = (next) => {
    setMaterials(next);
    setStored(k("materials"), true, next);
  };
  const saveSettings = (next) => {
    setSettings(next);
    setStored(k("settings"), true, next);
  };
  const saveResults = (next) => {
    setResults(next);
    setStored(k("results"), true, next);
  };
  const saveFees = (next) => {
    setFees(next);
    setStored(k("fees"), true, next);
  };
  const saveMessages = (next) => {
    setMessages(next);
    setStored(k("messages"), true, next);
  };
  const saveDiscussions = (next) => {
    setDiscussions(next);
    setStored(k("discussions"), true, next);
  };
  const logAction = useCallback(
    (action) => {
      setAuditlog((prev) => {
        const next = {
          entries: [
            ...prev.entries,
            { id: uid("log"), actorId: currentUser?.id, actorName: currentUser?.name || "System", action, date: new Date().toISOString() },
          ],
        };
        setStored(k("auditlog"), true, next);
        return next;
      });
    },
    [currentUser]
  );

  const handleLogin = (user) => {
    setCurrentUser(user);
    setView("dashboard");
    setStored(k("session"), false, user.username);
  };
  const handleLogout = () => {
    setCurrentUser(null);
    setStored(k("session"), false, null);
    if (window.USE_REAL_AUTH) window.auth.signOut();
  };
  const toggleDarkMode = () => {
    setDarkMode((d) => {
      setStored(k("darkmode"), false, !d);
      return !d;
    });
  };

  if (loading) {
    return (
      <div className={darkMode ? "dark" : ""}>
        <style>{FONT_IMPORT}</style>
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: THEME.paper }}>
          <p style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }} className="text-sm">Loading register…</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className={darkMode ? "dark" : ""}>
        <style>{FONT_IMPORT}</style>
        <LoginScreen users={directory.users} onLogin={handleLogin} loading={loading} darkMode={darkMode} onToggleDarkMode={toggleDarkMode} schoolName={schoolName} logoDataUrl={settings.logoDataUrl} schoolId={schoolId} />
      </div>
    );
  }

  const role = currentUser.role;

  const adminTabs = [
    { key: "dashboard", label: "Overview", icon: LayoutDashboard },
    { key: "classes", label: "Classes", icon: School },
    { key: "subjects", label: "Subjects", icon: BookOpen },
    { key: "timetable", label: "Timetable", icon: CalendarClock },
    { key: "users", label: "People", icon: Users },
    { key: "fees", label: "Fees", icon: Wallet },
    { key: "analytics", label: "Analytics", icon: BarChart3 },
    { key: "messages", label: "Messages", icon: MessageSquare },
    { key: "announcements", label: "Announcements", icon: Megaphone },
    { key: "auditlog", label: "Audit Log", icon: ScrollText },
    { key: "support", label: "Support", icon: LifeBuoy },
  ];
  const teacherTabs = [
    { key: "dashboard", label: "My Subjects", icon: BookOpen },
    { key: "timetable", label: "Timetable", icon: CalendarClock },
    { key: "messages", label: "Messages", icon: MessageSquare },
    { key: "announcements", label: "Announcements", icon: Megaphone },
  ];
  const studentTabs = [
    { key: "dashboard", label: "My Subjects", icon: BookOpen },
    { key: "timetable", label: "Timetable", icon: CalendarClock },
    { key: "assignments", label: "Assignments", icon: ClipboardCheck },
    { key: "exams", label: "Exams", icon: FileQuestion },
    { key: "materials", label: "Lesson Notes", icon: StickyNote },
    { key: "grades", label: "Grades", icon: Award },
    { key: "reportcard", label: "Report Card", icon: GraduationCap },
    { key: "attendance", label: "Attendance", icon: CalendarDays },
    { key: "fees", label: "Fees", icon: Wallet },
    { key: "messages", label: "Messages", icon: MessageSquare },
    { key: "announcements", label: "Announcements", icon: Megaphone },
  ];
  const parentTabs = [
    { key: "dashboard", label: "My Children", icon: Baby },
    { key: "messages", label: "Messages", icon: MessageSquare },
    { key: "announcements", label: "Announcements", icon: Megaphone },
  ];

  const tabs = role === "admin" ? adminTabs : role === "teacher" ? teacherTabs : role === "parent" ? parentTabs : studentTabs;

  let content;
  if (role === "admin") {
    if (view === "dashboard") content = <AdminOverview directory={directory} settings={settings} saveSettings={saveSettings} notify={notify} logAction={logAction} schoolName={schoolName} />;
    else if (view === "classes") content = <AdminClasses directory={directory} saveDirectory={saveDirectory} notify={notify} logAction={logAction} settings={settings} saveSettings={saveSettings} />;
    else if (view === "subjects") content = <AdminSubjects directory={directory} saveDirectory={saveDirectory} notify={notify} logAction={logAction} />;
    else if (view === "timetable") content = <AdminTimetable directory={directory} timetable={timetable} saveTimetable={saveTimetable} notify={notify} />;
    else if (view === "users") content = <AdminUsers directory={directory} saveDirectory={saveDirectory} notify={notify} logAction={logAction} currentSession={settings.currentSession} schoolId={schoolId} />;
    else if (view === "fees") content = <FeesView mode="admin" directory={directory} fees={fees} saveFees={saveFees} currentTerm={settings.currentTerm} currentSession={settings.currentSession} notify={notify} logAction={logAction} />;
    else if (view === "analytics") content = <AdminAnalytics directory={directory} results={results} attendance={attendance} fees={fees} currentTerm={settings.currentTerm} currentSession={settings.currentSession} />;
    else if (view === "messages") content = <MessagesView directory={directory} messages={messages} saveMessages={saveMessages} currentUser={currentUser} />;
    else if (view === "announcements") content = <AnnouncementsView announcements={announcements} addAnnouncement={addAnnouncement} currentUser={currentUser} directory={directory} scope="school" logAction={logAction} />;
    else if (view === "auditlog") content = <AuditLogView auditlog={auditlog} />;
    else if (view === "support") content = <AdminSupport schoolId={schoolId} schoolName={schoolName} currentUser={currentUser} notify={notify} />;
  } else if (role === "teacher") {
    if (view === "dashboard") {
      content = selectedSubject ? (
        <TeacherSubjectDetail
          subject={selectedSubject}
          directory={directory}
          coursework={coursework}
          saveCoursework={saveCoursework}
          attendance={attendance}
          saveAttendance={saveAttendance}
          examinations={examinations}
          saveExaminations={saveExaminations}
          materials={materials}
          saveMaterials={saveMaterials}
          results={results}
          saveResults={saveResults}
          currentTerm={settings.currentTerm}
          currentSession={settings.currentSession}
          discussions={discussions}
          saveDiscussions={saveDiscussions}
          currentUser={currentUser}
          onBack={() => setSelectedSubject(null)}
          notify={notify}
          logAction={logAction}
        />
      ) : (
        <TeacherSubjects directory={directory} currentUser={currentUser} onOpenSubject={setSelectedSubject} />
      );
    } else if (view === "timetable") {
      content = <TeacherTimetable directory={directory} currentUser={currentUser} timetable={timetable} />;
    } else if (view === "messages") {
      content = <MessagesView directory={directory} messages={messages} saveMessages={saveMessages} currentUser={currentUser} />;
    } else if (view === "announcements") {
      content = <AnnouncementsView announcements={announcements} addAnnouncement={addAnnouncement} currentUser={currentUser} directory={directory} scope="mine" logAction={logAction} />;
    }
  } else if (role === "parent") {
    if (view === "dashboard") {
      content = selectedChild ? (
        <ParentChildDetail
          child={selectedChild}
          directory={directory}
          results={results}
          currentTerm={settings.currentTerm}
          currentSession={settings.currentSession}
          attendance={attendance}
          timetable={timetable}
          fees={fees}
          schoolName={schoolName}
          logoDataUrl={settings.logoDataUrl}
          onBack={() => setSelectedChild(null)}
        />
      ) : (
        <ParentChildren directory={directory} currentUser={currentUser} onOpenChild={setSelectedChild} />
      );
    } else if (view === "messages") {
      content = <MessagesView directory={directory} messages={messages} saveMessages={saveMessages} currentUser={currentUser} />;
    } else if (view === "announcements") {
      content = <AnnouncementsView announcements={announcements} addAnnouncement={addAnnouncement} currentUser={currentUser} directory={directory} scope="school" />;
    }
  } else {
    if (view === "dashboard") {
      content = selectedStudentSubject ? (
        <StudentSubjectDetail
          subject={selectedStudentSubject}
          directory={directory}
          materials={materials}
          discussions={discussions}
          saveDiscussions={saveDiscussions}
          currentUser={currentUser}
          onBack={() => setSelectedStudentSubject(null)}
          notify={notify}
        />
      ) : (
        <StudentSubjects directory={directory} currentUser={currentUser} onOpenSubject={setSelectedStudentSubject} />
      );
    }
    else if (view === "timetable") content = <StudentTimetable directory={directory} currentUser={currentUser} timetable={timetable} />;
    else if (view === "assignments") content = <StudentAssignments directory={directory} coursework={coursework} saveCoursework={saveCoursework} currentUser={currentUser} notify={notify} />;
    else if (view === "exams") content = <StudentExams directory={directory} examinations={examinations} saveExaminations={saveExaminations} currentUser={currentUser} notify={notify} />;
    else if (view === "materials") content = <StudentMaterials directory={directory} materials={materials} currentUser={currentUser} />;
    else if (view === "grades") content = <StudentGrades directory={directory} coursework={coursework} currentUser={currentUser} />;
    else if (view === "reportcard") content = <StudentReportCard directory={directory} results={results} currentTerm={settings.currentTerm} currentSession={settings.currentSession} currentUser={currentUser} schoolName={schoolName} logoDataUrl={settings.logoDataUrl} />;
    else if (view === "attendance") content = <StudentAttendance attendance={attendance} currentUser={currentUser} />;
    else if (view === "fees") content = <FeesView mode="view" directory={directory} fees={fees} currentTerm={settings.currentTerm} currentSession={settings.currentSession} studentId={currentUser.id} />;
    else if (view === "messages") content = <MessagesView directory={directory} messages={messages} saveMessages={saveMessages} currentUser={currentUser} />;
    else if (view === "announcements") content = <AnnouncementsView announcements={announcements} addAnnouncement={addAnnouncement} currentUser={currentUser} directory={directory} scope="student" />;
  }

  return (
    <div className={darkMode ? "dark" : ""}>
      <style>{FONT_IMPORT}</style>
      <Shell
        user={currentUser}
        tabs={tabs}
        view={view}
        setView={(v) => {
          setView(v);
          setSelectedSubject(null);
          setSelectedChild(null);
          setSelectedStudentSubject(null);
        }}
        onLogout={handleLogout}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        schoolName={schoolName}
        logoDataUrl={settings.logoDataUrl}
        platformAnnouncement={platformAnnouncements.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0]}
      >
        {content}
      </Shell>
      <Toast message={toast} />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* PLATFORM LAYER — multi-tenant super-admin shell                        */
/* ---------------------------------------------------------------------- */
const PLATFORM_KEY = "platform"; // unscoped — the one key not tied to any school
const PLATFORM_NAME = "LMSbyPetcode";

function readSchoolSlugFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get("school") || "";
  } catch (e) {
    return "";
  }
}

/** Updates the address bar to point at a school's link without a full page navigation
 *  (a real page navigation via window.location can be blocked inside sandboxed iframes,
 *  like Claude's artifact preview — pushState avoids that entirely and also works
 *  identically on a real deployed site). */
function pushSchoolUrl(slug) {
  try {
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set("school", slug);
    else url.searchParams.delete("school");
    window.history.pushState({}, "", url);
  } catch (e) {
    // ignore — URL/history APIs unavailable in this environment
  }
}

function SchoolNotFound({ slug }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: THEME.paper }}>
      <style>{FONT_IMPORT}</style>
      <Card className="p-8 max-w-sm text-center">
        <Building2 size={28} style={{ color: THEME.margin, margin: "0 auto 12px" }} />
        <h1 className="text-lg mb-2" style={{ color: THEME.ink, fontFamily: "Lora, serif", fontWeight: 600 }}>School not found</h1>
        <p className="text-sm" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          There's no school registered at the code "{slug}". Double-check your link with your school admin.
        </p>
      </Card>
    </div>
  );
}

function SchoolSuspended({ school }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: THEME.paper }}>
      <style>{FONT_IMPORT}</style>
      <Card className="p-8 max-w-sm text-center">
        <Ban size={28} style={{ color: THEME.margin, margin: "0 auto 12px" }} />
        <h1 className="text-lg mb-2" style={{ color: THEME.ink, fontFamily: "Lora, serif", fontWeight: 600 }}>{school.name} is suspended</h1>
        <p className="text-sm" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          This school's account is temporarily suspended. Contact the platform owner to reactivate it.
        </p>
      </Card>
    </div>
  );
}

function PlatformEntry({ platform, savePlatform, onOwnerLogin, onNavigate, firstRunRecoveryCodes }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState("");
  const [mode, setMode] = useState("login"); // "login" | "reset"
  const [savedCodes, setSavedCodes] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const candidate = platform.owners.find((o) => o.username === username.trim().toLowerCase());
    if (!candidate) {
      setError("Owner account not recognised.");
      return;
    }
    setChecking(true);
    try {
      if (window.USE_REAL_AUTH) {
        await window.auth.signInOwner(username, password);
      } else {
        const hashed = await hashPassword(password);
        if (hashed !== candidate.password) throw new Error("bad password");
      }
      setChecking(false);
      setError("");
      onOwnerLogin(candidate);
    } catch (err) {
      setChecking(false);
      setError("Owner account not recognised.");
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4" style={{ backgroundColor: THEME.paper }}>
      <style>{FONT_IMPORT}</style>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Crown size={26} style={{ color: THEME.ink, margin: "0 auto 8px" }} />
          <h1 style={{ color: THEME.ink, fontFamily: "Lora, serif", fontWeight: 700 }} className="text-xl">{PLATFORM_NAME}</h1>
          <p className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>Platform Owner sign in — manage every school on this platform.</p>
        </div>

        {firstRunRecoveryCodes && (
          <Card className="p-5 mb-4" style={{ border: `1px solid ${THEME.margin}` }}>
            <p className="text-xs font-semibold mb-2" style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}>
              Save these recovery codes now — they won't be shown again
            </p>
            <p className="text-xs mb-3" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
              Your first owner login is <strong>owner</strong> / <strong>owner123</strong>. If you ever forget that password, one of these codes lets you reset it. Store them somewhere safe (a password manager, printed copy) — there's no email/SMS recovery connected, so losing both the password and every code means losing access permanently.
            </p>
            <div className="grid grid-cols-1 gap-1 p-3 rounded-md mb-3" style={{ backgroundColor: THEME.paper, fontFamily: "monospace" }}>
              {firstRunRecoveryCodes.map((c) => (
                <div key={c} className="text-xs" style={{ color: THEME.ink }}>{c}</div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
              <input type="checkbox" checked={savedCodes} onChange={(e) => setSavedCodes(e.target.checked)} />
              I've saved these codes somewhere safe
            </label>
          </Card>
        )}

        {mode === "login" ? (
          <Card className="p-6">
            <form onSubmit={submit}>
              <Field label="Username">
                <input className={inputClass} style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Password">
                <input type="password" className={inputClass} style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {error && <p className="text-xs mb-3" style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}>{error}</p>}
              <PrimaryButton type="submit" full>{checking ? "Checking…" : "Sign in"}</PrimaryButton>
            </form>
            <button onClick={() => setMode("reset")} className="text-xs mt-4 hover:underline block" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
              Forgot password? Reset with a recovery code
            </button>
          </Card>
        ) : (
          <OwnerPasswordReset platform={platform} savePlatform={savePlatform} onDone={() => setMode("login")} />
        )}

        <Card className="p-5 mt-4">
          <p className="text-xs font-semibold mb-2" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>Looking for your school instead?</p>
          <div className="flex gap-2">
            <input className={inputClass} style={inputStyle} placeholder="your-school-code" value={code} onChange={(e) => setCode(e.target.value)} />
            <PrimaryButton onClick={() => code.trim() && onNavigate(slugify(code))}>Go</PrimaryButton>
          </div>
        </Card>
      </div>
    </div>
  );
}

function OwnerPasswordReset({ platform, savePlatform, onDone }) {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [success, setSuccess] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const candidate = platform.owners.find((o) => o.username === username.trim().toLowerCase());
    if (!candidate || !newPassword.trim()) {
      setError("Check the username and new password.");
      return;
    }
    setChecking(true);
    try {
      if (window.USE_REAL_AUTH) {
        // The Edge Function validates the code and updates the real password server-side —
        // it also burns the used code there, so just refresh our local view of that owner's
        // remaining codes afterward.
        await window.auth.resetOwnerPassword({ username: username.trim(), code: code.trim(), newPassword: newPassword.trim() });
        const codeHash = await hashPassword(code.trim().toUpperCase());
        savePlatform({
          ...platform,
          owners: platform.owners.map((o) => (o.id === candidate.id ? { ...o, recoveryCodeHashes: (o.recoveryCodeHashes || []).filter((h) => h !== codeHash) } : o)),
        });
      } else {
        const codeHash = await hashPassword(code.trim().toUpperCase());
        const matches = (candidate.recoveryCodeHashes || []).includes(codeHash);
        if (!matches) throw new Error("That recovery code isn't valid or has already been used.");
        const newPasswordHash = await hashPassword(newPassword.trim());
        savePlatform({
          ...platform,
          owners: platform.owners.map((o) =>
            o.id === candidate.id ? { ...o, password: newPasswordHash, recoveryCodeHashes: (o.recoveryCodeHashes || []).filter((h) => h !== codeHash) } : o
          ),
        });
      }
      setChecking(false);
      setSuccess(true);
    } catch (err) {
      setChecking(false);
      setError(err.message || "That recovery code isn't valid or has already been used.");
    }
  };

  if (success) {
    return (
      <Card className="p-6">
        <p className="text-sm mb-4" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
          Password reset. That recovery code has been used up — sign in with your new password.
        </p>
        <PrimaryButton full onClick={onDone}>Back to sign in</PrimaryButton>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit}>
        <Field label="Username">
          <input className={inputClass} style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Recovery code">
          <input className={inputClass} style={{ ...inputStyle, fontFamily: "monospace" }} value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" />
        </Field>
        <Field label="New password">
          <input type="password" className={inputClass} style={inputStyle} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
        {error && <p className="text-xs mb-3" style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}>{error}</p>}
        <PrimaryButton type="submit" full>{checking ? "Checking…" : "Reset password"}</PrimaryButton>
      </form>
      <button onClick={onDone} className="text-xs mt-4 hover:underline block" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
        Back to sign in
      </button>
    </Card>
  );
}

async function fetchSchoolData(schoolId, key) {
  return getStored(`${schoolId}:${key}`, true, null);
}

function SAStub({ title, needs, icon: Icon = Plug }) {
  return (
    <div>
      <SectionTitle eyebrow="Not connected" title={title} />
      <Card className="p-6 max-w-lg">
        <Icon size={22} style={{ color: THEME.muted, marginBottom: 10 }} />
        <p className="text-sm mb-2" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>
          This needs a real {needs} connected to actually work — it isn't something that can be wired up without that.
        </p>
        <p className="text-xs" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          Ask Claude to help connect {needs} when you're ready to set that up for real, rather than building a screen here that doesn't actually do anything.
        </p>
      </Card>
    </div>
  );
}

function SANavGroup({ title }) {
  return (
    <div className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(243,238,225,0.4)", fontFamily: "Inter, sans-serif" }}>
      {title}
    </div>
  );
}

function SANavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
      style={{
        backgroundColor: active ? "rgba(243,238,225,0.14)" : "transparent",
        color: active ? CREAM : "rgba(243,238,225,0.62)",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function SAOverview({ platform, schoolStats }) {
  const totalStudents = Object.values(schoolStats).reduce((s, x) => s + (x?.students || 0), 0);
  const totalTeachers = Object.values(schoolStats).reduce((s, x) => s + (x?.teachers || 0), 0);
  const active = platform.schools.filter((s) => s.status === "active").length;
  const trial = platform.schools.filter((s) => s.status === "trial").length;
  const suspended = platform.schools.filter((s) => s.status === "suspended").length;
  const stats = [
    { label: "Schools", value: platform.schools.length },
    { label: "Active", value: active },
    { label: "Trial", value: trial },
    { label: "Suspended", value: suspended },
    { label: "Total students", value: totalStudents },
    { label: "Total teachers", value: totalTeachers },
  ];
  return (
    <div>
      <SectionTitle eyebrow="Platform" title="Dashboard" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="text-3xl" style={{ color: THEME.ink, fontFamily: "Lora, serif", fontWeight: 700 }}>{s.value}</div>
            <div className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{s.label}</div>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>Recently created</h3>
        <div className="space-y-2">
          {platform.schools
            .slice()
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5)
            .map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm" style={{ fontFamily: "Inter, sans-serif" }}>
                <span style={{ color: THEME.ink }}>{s.name}</span>
                <span style={{ color: THEME.muted }} className="text-xs">{new Date(s.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
            ))}
          {platform.schools.length === 0 && <EmptyState text="No schools yet." />}
        </div>
      </Card>
    </div>
  );
}

function SASchoolCard({ school, onNavigate, onSuspendToggle, onDelete, onEdit, onCopyLink }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{school.name}</div>
          <div className="text-xs mt-0.5" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>?school={school.slug}</div>
        </div>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase"
          style={{
            backgroundColor: school.status === "suspended" ? "rgba(181,67,58,0.12)" : school.status === "trial" ? "rgba(138,131,116,0.15)" : "rgba(47,82,51,0.12)",
            color: school.status === "suspended" ? THEME.margin : school.status === "trial" ? THEME.muted : THEME.chalk,
            fontFamily: "Inter, sans-serif",
          }}
        >
          {school.status}
        </span>
      </div>
      <p className="text-[11px] mt-2" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
        Created {new Date(school.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
        {school.isDemo && " · Demo school"}
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <GhostButton icon={Link2} onClick={() => onNavigate(school.slug)}>Open</GhostButton>
        <GhostButton icon={Copy} onClick={() => onCopyLink(school.slug)}>Copy link</GhostButton>
        <GhostButton onClick={() => onEdit(school)}>Edit</GhostButton>
        {school.status !== "suspended" ? (
          <GhostButton icon={Ban} danger onClick={() => onSuspendToggle(school.id, "suspended")}>Suspend</GhostButton>
        ) : (
          <GhostButton icon={CheckCircle2} onClick={() => onSuspendToggle(school.id, "active")}>Reactivate</GhostButton>
        )}
        {!school.isDemo && <GhostButton icon={Trash2} danger onClick={() => onDelete(school)}>Delete</GhostButton>}
      </div>
    </Card>
  );
}

function SASchoolsAll({ platform, savePlatform, onNavigate, logAction }) {
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", adminName: "", adminUsername: "" });

  const setStatus = (schoolId, status) => {
    const school = platform.schools.find((s) => s.id === schoolId);
    savePlatform({ ...platform, schools: platform.schools.map((s) => (s.id === schoolId ? { ...s, status } : s)) });
    logAction(`${status === "suspended" ? "Suspended" : "Reactivated"} "${school?.name}"`);
  };

  const removeSchool = async (school) => {
    if (school.isDemo) {
      alert("The demo school can't be deleted.");
      return;
    }
    if (!confirm(`Delete "${school.name}" and all of its data? This can't be undone.`)) return;
    await deleteSchoolData(school.id);
    savePlatform({ ...platform, schools: platform.schools.filter((s) => s.id !== school.id) });
    logAction(`Deleted "${school.name}"`);
  };

  const copyLink = (slug) => {
    const link = new URL(window.location.href);
    link.search = "";
    link.searchParams.set("school", slug);
    navigator.clipboard?.writeText(link.toString());
  };

  const openEdit = async (school) => {
    const dir = await fetchSchoolData(school.id, "directory");
    const admin = dir?.users?.find((u) => u.role === "admin");
    setEditForm({ name: school.name, adminName: admin?.name || "", adminUsername: admin?.username || "" });
    setEditing({ ...school, _origAdminUsername: admin?.username || null });
  };

  const saveEdit = async () => {
    if (!editForm.name.trim()) return;
    savePlatform({ ...platform, schools: platform.schools.map((s) => (s.id === editing.id ? { ...s, name: editForm.name.trim() } : s)) });
    const dir = await fetchSchoolData(editing.id, "directory");
    if (dir) {
      const nextUsers = dir.users.map((u) =>
        u.role === "admin" && u.username === editing._origAdminUsername
          ? { ...u, name: editForm.adminName.trim() || u.name, username: editForm.adminUsername.trim().toLowerCase() || u.username }
          : u
      );
      await setStored(`${editing.id}:directory`, true, { ...dir, users: nextUsers });
    }
    logAction(`Edited school "${editForm.name.trim()}"`);
    setEditing(null);
  };

  return (
    <div>
      <SectionTitle eyebrow={`${platform.schools.length} school${platform.schools.length === 1 ? "" : "s"}`} title="All Schools" />
      <div className="grid md:grid-cols-2 gap-4">
        {platform.schools.map((s) => (
          <SASchoolCard key={s.id} school={s} onNavigate={onNavigate} onSuspendToggle={setStatus} onDelete={removeSchool} onCopyLink={copyLink} onEdit={openEdit} />
        ))}
        {platform.schools.length === 0 && <EmptyState text="No schools yet." />}
      </div>

      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <Field label="School name">
            <input className={inputClass} style={inputStyle} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </Field>
          <Field label="Admin's full name">
            <input className={inputClass} style={inputStyle} value={editForm.adminName} onChange={(e) => setEditForm({ ...editForm, adminName: e.target.value })} />
          </Field>
          <Field label="Admin's username">
            <input className={inputClass} style={inputStyle} value={editForm.adminUsername} onChange={(e) => setEditForm({ ...editForm, adminUsername: e.target.value })} />
          </Field>
          <p className="text-xs mb-3" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>This updates the first admin account found for this school. Password isn't changed here.</p>
          <PrimaryButton full onClick={saveEdit}>Save changes</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function SASchoolsAdd({ platform, savePlatform, onNavigate, logAction }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", adminName: "", adminUsername: "", adminPassword: "pass123" });
  const [createdLink, setCreatedLink] = useState(null);
  const [createdSlug, setCreatedSlug] = useState(null);

  const slugTaken = (slug) => platform.schools.some((s) => s.slug === slug);

  const createSchool = async () => {
    if (!form.name.trim() || !form.adminName.trim() || !form.adminUsername.trim()) return;
    const slug = form.slug.trim() ? slugify(form.slug) : slugify(form.name);
    if (!slug || slugTaken(slug)) {
      alert("That school code is already taken — choose another.");
      return;
    }
    setCreating(true);
    const { schoolId } = await provisionSchool({ name: form.name.trim(), adminName: form.adminName, adminUsername: form.adminUsername, adminPassword: form.adminPassword });
    const school = { id: schoolId, name: form.name.trim(), slug, status: "trial", plan: "trial", createdAt: new Date().toISOString(), isDemo: false };
    savePlatform({ ...platform, schools: [...platform.schools, school] });
    logAction(`Created school "${form.name.trim()}"`);
    setCreating(false);
    const link = new URL(window.location.href);
    link.search = "";
    link.searchParams.set("school", slug);
    setCreatedLink(link.toString());
    setCreatedSlug(slug);
  };

  const reset = () => {
    setForm({ name: "", slug: "", adminName: "", adminUsername: "", adminPassword: "pass123" });
    setCreatedLink(null);
    setCreatedSlug(null);
  };

  return (
    <div>
      <SectionTitle eyebrow="Provision a new tenant" title="Add School" />
      <Card className="p-6 max-w-md">
        {createdLink ? (
          <div>
            <p className="text-sm mb-3" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>School created — share this link with its admin:</p>
            <div className="p-3 rounded-md border mb-4 text-xs break-all" style={{ borderColor: THEME.rule, color: THEME.ink, fontFamily: "monospace" }}>{createdLink}</div>
            <div className="flex gap-2">
              <PrimaryButton full onClick={() => onNavigate(createdSlug)}>Open now</PrimaryButton>
              <GhostButton onClick={reset}>Add another</GhostButton>
            </div>
          </div>
        ) : (
          <div>
            <Field label="School name">
              <input className={inputClass} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Bright Future Academy" />
            </Field>
            <Field label="School code (used in the link)">
              <input className={inputClass} style={inputStyle} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder={form.name ? slugify(form.name) : "auto-generated from name"} />
            </Field>
            <Field label="Admin's full name">
              <input className={inputClass} style={inputStyle} value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
            </Field>
            <Field label="Admin's username">
              <input className={inputClass} style={inputStyle} value={form.adminUsername} onChange={(e) => setForm({ ...form, adminUsername: e.target.value })} />
            </Field>
            <Field label="Admin's password">
              <input className={inputClass} style={inputStyle} value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
            </Field>
            <p className="text-xs mb-3" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
              The school starts pre-loaded with the same example classes, subjects, and sample data as the demo school, under this admin's login.
            </p>
            <PrimaryButton full onClick={createSchool}>{creating ? "Creating…" : "Create school"}</PrimaryButton>
          </div>
        )}
      </Card>
    </div>
  );
}

function SASchoolsSuspended({ platform, savePlatform, onNavigate, logAction }) {
  const suspended = platform.schools.filter((s) => s.status === "suspended");
  const reactivate = (schoolId) => {
    const school = platform.schools.find((s) => s.id === schoolId);
    savePlatform({ ...platform, schools: platform.schools.map((s) => (s.id === schoolId ? { ...s, status: "active" } : s)) });
    logAction(`Reactivated "${school?.name}"`);
  };
  return (
    <div>
      <SectionTitle eyebrow={`${suspended.length} suspended`} title="Suspended Schools" />
      <div className="grid md:grid-cols-2 gap-4">
        {suspended.map((s) => (
          <Card key={s.id} className="p-4">
            <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{s.name}</div>
            <div className="text-xs mt-1" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>?school={s.slug}</div>
            <div className="mt-3"><PrimaryButton icon={CheckCircle2} onClick={() => reactivate(s.id)}>Reactivate</PrimaryButton></div>
          </Card>
        ))}
        {suspended.length === 0 && <EmptyState text="No suspended schools." />}
      </div>
    </div>
  );
}

function SAOwners({ platform, savePlatform, owner, onOwnerUpdated, logAction }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [newCodes, setNewCodes] = useState(null);

  const openAdd = () => {
    setForm({ name: "", username: "", password: "" });
    setNewCodes(null);
    setModal(true);
  };

  const addOwner = async () => {
    if (!form.name.trim() || !form.username.trim() || !form.password.trim()) return;
    if (platform.owners.some((o) => o.username === form.username.trim().toLowerCase())) {
      alert("That username is already taken.");
      return;
    }
    const { codes, hashes } = await generateRecoveryCodes();
    let newOwner;
    try {
      if (window.USE_REAL_AUTH) {
        const created = await window.auth.createAccount({ username: form.username, password: form.password, role: "owner", schoolId: null, appUsername: form.username.trim().toLowerCase() });
        newOwner = { id: uid("own"), authId: created.id, name: form.name.trim(), username: form.username.trim().toLowerCase(), recoveryCodeHashes: hashes };
      } else {
        const hashed = await hashPassword(form.password);
        newOwner = { id: uid("own"), name: form.name.trim(), username: form.username.trim().toLowerCase(), password: hashed, recoveryCodeHashes: hashes };
      }
    } catch (err) {
      alert(err.message || "Could not create that account.");
      return;
    }
    savePlatform({ ...platform, owners: [...platform.owners, newOwner] });
    logAction(`Added super admin "${newOwner.name}"`);
    setNewCodes(codes);
  };

  const removeOwner = (id) => {
    if (id === owner.id) {
      alert("You can't remove your own account while logged in.");
      return;
    }
    if (platform.owners.length <= 1) {
      alert("At least one super admin account must remain.");
      return;
    }
    const target = platform.owners.find((o) => o.id === id);
    savePlatform({ ...platform, owners: platform.owners.filter((o) => o.id !== id) });
    logAction(`Removed super admin "${target?.name}"`);
  };

  return (
    <div>
      <SectionTitle eyebrow="Platform access" title="Super Admins" right={<PrimaryButton icon={Plus} onClick={openAdd}>Add super admin</PrimaryButton>} />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: THEME.paper }}>
              {["Name", "Username", "Recovery codes", ""].map((h) => <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {platform.owners.map((o) => (
              <tr key={o.id} className="border-t" style={{ borderColor: THEME.rule }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{o.name}{o.id === owner.id && <span style={{ color: THEME.muted }}> (you)</span>}</td>
                <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{o.username}</td>
                <td className="px-4 py-2.5" style={{ color: (o.recoveryCodeHashes || []).length > 0 ? THEME.chalk : THEME.margin, fontFamily: "Inter, sans-serif" }}>
                  {(o.recoveryCodeHashes || []).length} unused
                </td>
                <td className="px-4 py-2.5 text-right">
                  <GhostButton icon={Trash2} danger onClick={() => removeOwner(o.id)}>Remove</GhostButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {modal && (
        <Modal title={newCodes ? "Save these recovery codes" : "Add a super admin"} onClose={() => setModal(false)}>
          {newCodes ? (
            <div>
              <p className="text-xs mb-3" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
                Give these to {form.name.trim()} — they'll need one if they ever forget their password. They won't be shown again.
              </p>
              <div className="grid grid-cols-1 gap-1 p-3 rounded-md mb-4" style={{ backgroundColor: THEME.paper, fontFamily: "monospace" }}>
                {newCodes.map((c) => <div key={c} className="text-xs" style={{ color: THEME.ink }}>{c}</div>)}
              </div>
              <PrimaryButton full onClick={() => setModal(false)}>Done</PrimaryButton>
            </div>
          ) : (
            <div>
              <Field label="Full name"><input className={inputClass} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Username"><input className={inputClass} style={inputStyle} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
              <Field label="Password"><input className={inputClass} style={inputStyle} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
              <PrimaryButton full onClick={addOwner}>Save super admin</PrimaryButton>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function SASchoolAdmins({ platform }) {
  const [admins, setAdmins] = useState(null);

  useEffect(() => {
    (async () => {
      const rows = await Promise.all(
        platform.schools.map(async (s) => {
          const dir = await fetchSchoolData(s.id, "directory");
          const admin = dir?.users?.find((u) => u.role === "admin");
          return { school: s, admin };
        })
      );
      setAdmins(rows);
    })();
  }, [platform.schools]);

  return (
    <div>
      <SectionTitle eyebrow="Across every school" title="School Admins" />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: THEME.paper }}>
              {["School", "Admin name", "Username"].map((h) => <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {(admins || []).map((r) => (
              <tr key={r.school.id} className="border-t" style={{ borderColor: THEME.rule }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{r.school.name}</td>
                <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{r.admin?.name || "—"}</td>
                <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{r.admin?.username || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {admins === null && <div className="p-4"><EmptyState text="Loading…" /></div>}
      </Card>
    </div>
  );
}

function SAAnalytics({ platform, schoolStats }) {
  return (
    <div>
      <SectionTitle eyebrow="Cross-school" title="Analytics" />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: THEME.paper }}>
              {["School", "Students", "Teachers", "Parents", "Classes"].map((h) => <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {platform.schools.map((s) => {
              const stat = schoolStats[s.id];
              return (
                <tr key={s.id} className="border-t" style={{ borderColor: THEME.rule }}>
                  <td className="px-4 py-2.5 font-medium" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{s.name}</td>
                  <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{stat?.students ?? "…"}</td>
                  <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{stat?.teachers ?? "…"}</td>
                  <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{stat?.parents ?? "…"}</td>
                  <td className="px-4 py-2.5" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{stat?.classes ?? "…"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="text-xs mt-3" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
        Revenue analytics isn't shown here since there's no real payment processing connected yet.
      </p>
    </div>
  );
}

function SAAnnouncements({ platform, savePlatform, owner, logAction }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", body: "" });

  const post = () => {
    if (!form.title.trim() || !form.body.trim()) return;
    const entry = { id: uid("pan"), title: form.title.trim(), body: form.body.trim(), authorName: owner.name || owner.username, date: new Date().toISOString() };
    savePlatform({ ...platform, announcements: [...(platform.announcements || []), entry] });
    logAction(`Posted platform announcement "${entry.title}"`);
    setForm({ title: "", body: "" });
    setModal(false);
  };

  const remove = (id) => {
    savePlatform({ ...platform, announcements: (platform.announcements || []).filter((a) => a.id !== id) });
  };

  const list = (platform.announcements || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div>
      <SectionTitle eyebrow="Shown to every school" title="Announcements" right={<PrimaryButton icon={Plus} onClick={() => setModal(true)}>Post announcement</PrimaryButton>} />
      <div className="space-y-3">
        {list.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{a.title}</h3>
                <p className="text-xs mt-0.5" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{a.authorName} · {new Date(a.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</p>
              </div>
              <GhostButton icon={Trash2} danger onClick={() => remove(a.id)}>Remove</GhostButton>
            </div>
            <p className="text-sm mt-2" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{a.body}</p>
          </Card>
        ))}
        {list.length === 0 && <EmptyState text="No platform-wide announcements yet." />}
      </div>

      {modal && (
        <Modal title="Post to every school" onClose={() => setModal(false)}>
          <Field label="Title"><input className={inputClass} style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Message"><textarea rows={4} className={inputClass} style={inputStyle} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          <PrimaryButton full onClick={post}>Post to all schools</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function SASupport({ platform, owner, logAction }) {
  const [allTickets, setAllTickets] = useState(null);
  const [openTicket, setOpenTicket] = useState(null);
  const [reply, setReply] = useState("");

  useEffect(() => {
    (async () => {
      const rows = await Promise.all(
        platform.schools.map(async (s) => {
          const stored = await getStored(`${s.id}:tickets`, true, { list: [] });
          return stored.list || [];
        })
      );
      setAllTickets(rows.flat());
    })();
  }, [platform.schools]);

  const tickets = (allTickets || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const saveSchoolTickets = async (schoolId, nextList) => {
    await setStored(`${schoolId}:tickets`, true, { list: nextList });
    setAllTickets((prev) => [...(prev || []).filter((t) => t.schoolId !== schoolId), ...nextList]);
  };

  const postReply = async () => {
    if (!reply.trim() || !openTicket) return;
    const schoolTickets = (allTickets || []).filter((t) => t.schoolId === openTicket.schoolId);
    const nextList = schoolTickets.map((t) =>
      t.id === openTicket.id
        ? { ...t, replies: [...(t.replies || []), { id: uid("tr"), authorRole: "owner", authorName: owner.name || owner.username, body: reply.trim(), date: new Date().toISOString() }] }
        : t
    );
    await saveSchoolTickets(openTicket.schoolId, nextList);
    setReply("");
  };

  const setStatus = async (ticket, status) => {
    const schoolTickets = (allTickets || []).filter((t) => t.schoolId === ticket.schoolId);
    const nextList = schoolTickets.map((t) => (t.id === ticket.id ? { ...t, status } : t));
    await saveSchoolTickets(ticket.schoolId, nextList);
    logAction(`Marked ticket "${ticket.subject}" as ${status}`);
  };

  if (allTickets === null) return <EmptyState text="Loading…" />;

  if (openTicket) {
    const t = (allTickets || []).find((x) => x.id === openTicket.id) || openTicket;
    return (
      <div>
        <button onClick={() => setOpenTicket(null)} className="inline-flex items-center gap-1 text-xs font-semibold mb-4 hover:opacity-70" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          <ChevronLeft size={14} /> Back to tickets
        </button>
        <SectionTitle eyebrow={t.schoolName} title={t.subject} />
        <Card className="p-4 mb-3">
          <p className="text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{t.body}</p>
        </Card>
        <div className="space-y-2 mb-4">
          {(t.replies || []).map((r) => (
            <Card key={r.id} className="p-3">
              <div className="text-xs font-semibold" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{r.authorName} {r.authorRole === "owner" && "(you)"}</div>
              <p className="text-sm mt-1" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{r.body}</p>
            </Card>
          ))}
        </div>
        <div className="flex gap-2 mb-3">
          <input className={inputClass} style={inputStyle} placeholder="Reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
          <PrimaryButton icon={Send} onClick={postReply}>Reply</PrimaryButton>
        </div>
        {t.status !== "closed" ? (
          <GhostButton onClick={() => setStatus(t, "closed")}>Close ticket</GhostButton>
        ) : (
          <GhostButton onClick={() => setStatus(t, "open")}>Reopen ticket</GhostButton>
        )}
      </div>
    );
  }

  return (
    <div>
      <SectionTitle eyebrow={`${tickets.length} ticket${tickets.length === 1 ? "" : "s"}`} title="Support" />
      <div className="space-y-2">
        {tickets.map((t) => (
          <Card key={t.id} className="p-4 flex items-center justify-between gap-3 cursor-pointer" style={{}}>
            <button className="text-left flex-1" onClick={() => setOpenTicket(t)}>
              <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{t.subject}</div>
              <div className="text-xs mt-0.5" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{t.schoolName} · {new Date(t.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
            </button>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase" style={{ backgroundColor: t.status === "closed" ? "rgba(47,82,51,0.12)" : "rgba(181,67,58,0.12)", color: t.status === "closed" ? THEME.chalk : THEME.margin, fontFamily: "Inter, sans-serif" }}>{t.status}</span>
          </Card>
        ))}
        {tickets.length === 0 && <EmptyState text="No support tickets yet. School admins can submit one from their Admin panel." />}
      </div>
    </div>
  );
}

function SAKnowledgeBase({ platform, savePlatform, logAction }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", body: "" });
  const articles = (platform.articles || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  const add = () => {
    if (!form.title.trim() || !form.body.trim()) return;
    const entry = { id: uid("art"), title: form.title.trim(), body: form.body.trim(), date: new Date().toISOString() };
    savePlatform({ ...platform, articles: [...(platform.articles || []), entry] });
    logAction(`Added knowledge base article "${entry.title}"`);
    setForm({ title: "", body: "" });
    setModal(false);
  };
  const remove = (id) => savePlatform({ ...platform, articles: (platform.articles || []).filter((a) => a.id !== id) });

  return (
    <div>
      <SectionTitle eyebrow="Help articles" title="Knowledge Base" right={<PrimaryButton icon={Plus} onClick={() => setModal(true)}>New article</PrimaryButton>} />
      <div className="space-y-3">
        {articles.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{a.title}</h3>
              <GhostButton icon={Trash2} danger onClick={() => remove(a.id)}>Remove</GhostButton>
            </div>
            <p className="text-sm mt-2" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{a.body}</p>
          </Card>
        ))}
        {articles.length === 0 && <EmptyState text="No articles yet." />}
      </div>
      {modal && (
        <Modal title="New article" onClose={() => setModal(false)}>
          <Field label="Title"><input className={inputClass} style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Content"><textarea rows={5} className={inputClass} style={inputStyle} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          <PrimaryButton full onClick={add}>Publish</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function SASettings() {
  const rows = [
    { label: "Security", status: "Passwords are hashed with SHA-256 client-side. No further config needed.", real: true },
    { label: "Storage", status: "Every school's data lives in its own scoped storage keys — see Audit Logs for activity.", real: true },
    { label: "Email", status: "Needs an email provider (e.g. Resend, Postmark) connected via a backend.", real: false },
    { label: "SMS", status: "Needs an SMS provider (e.g. Termii, Africa's Talking) connected via a backend.", real: false },
    { label: "Payments", status: "Needs a payment gateway (e.g. Paystack, Stripe) connected via a backend.", real: false },
    { label: "API", status: "There's no backend API yet for this to configure — the app talks directly to storage.", real: false },
  ];
  return (
    <div>
      <SectionTitle eyebrow="Platform" title="Settings" />
      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.label} className="p-4 flex items-start gap-3">
            <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: r.real ? THEME.chalk : THEME.margin }} />
            <div>
              <div className="font-semibold text-sm" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>{r.label}</div>
              <div className="text-xs mt-0.5" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>{r.status}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SAAuditLog({ platform }) {
  return <AuditLogView auditlog={{ entries: platform.auditlog || [] }} />;
}

function SAProfile({ owner, platform, savePlatform, onOwnerUpdated }) {
  const [name, setName] = useState(owner.name || "");
  const [newPassword, setNewPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [newCodes, setNewCodes] = useState(null);

  const save = async () => {
    let updated = { ...owner, name: name.trim() || owner.username };
    if (newPassword.trim()) updated.password = await hashPassword(newPassword.trim());
    savePlatform({ ...platform, owners: platform.owners.map((o) => (o.id === owner.id ? updated : o)) });
    onOwnerUpdated(updated);
    setNewPassword("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const regenerateCodes = async () => {
    if (newCodes || (owner.recoveryCodeHashes || []).length > 0) {
      if (!confirm("This replaces all existing recovery codes — old ones stop working. Continue?")) return;
    }
    const { codes, hashes } = await generateRecoveryCodes();
    const updated = { ...owner, recoveryCodeHashes: hashes };
    savePlatform({ ...platform, owners: platform.owners.map((o) => (o.id === owner.id ? updated : o)) });
    onOwnerUpdated(updated);
    setNewCodes(codes);
  };

  const unusedCount = (owner.recoveryCodeHashes || []).length;

  return (
    <div>
      <SectionTitle eyebrow={owner.username} title="Profile" />
      <Card className="p-6 max-w-md mb-4">
        <Field label="Full name"><input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="New password (leave blank to keep current)"><input className={inputClass} style={inputStyle} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field>
        <PrimaryButton onClick={save}>{saved ? "Saved" : "Save changes"}</PrimaryButton>
      </Card>

      <Card className="p-6 max-w-md">
        <h3 className="text-sm font-semibold mb-1" style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }}>Recovery codes</h3>
        <p className="text-xs mb-3" style={{ color: THEME.muted, fontFamily: "Inter, sans-serif" }}>
          {unusedCount > 0 ? `${unusedCount} unused code${unusedCount === 1 ? "" : "s"} remaining.` : "No unused codes — generate some so you can recover this account if you forget your password."}
        </p>
        {newCodes ? (
          <div>
            <p className="text-xs mb-2" style={{ color: THEME.margin, fontFamily: "Inter, sans-serif" }}>Save these now — they won't be shown again:</p>
            <div className="grid grid-cols-1 gap-1 p-3 rounded-md mb-3" style={{ backgroundColor: THEME.paper, fontFamily: "monospace" }}>
              {newCodes.map((c) => <div key={c} className="text-xs" style={{ color: THEME.ink }}>{c}</div>)}
            </div>
            <GhostButton onClick={() => setNewCodes(null)}>Done</GhostButton>
          </div>
        ) : (
          <PrimaryButton icon={KeyRound} onClick={regenerateCodes}>{unusedCount > 0 ? "Regenerate codes" : "Generate codes"}</PrimaryButton>
        )}
      </Card>
    </div>
  );
}

function SuperAdminDashboard({ platform, savePlatform, owner, onLogout, onNavigate, logAction, onOwnerUpdated }) {
  const [view, setView] = useState("dashboard");
  const [schoolStats, setSchoolStats] = useState({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(
        platform.schools.map(async (s) => {
          const dir = await fetchSchoolData(s.id, "directory");
          const students = dir?.users?.filter((u) => u.role === "student").length || 0;
          const teachers = dir?.users?.filter((u) => u.role === "teacher").length || 0;
          const parents = dir?.users?.filter((u) => u.role === "parent").length || 0;
          const classes = dir?.classes?.length || 0;
          return [s.id, { students, teachers, parents, classes }];
        })
      );
      setSchoolStats(Object.fromEntries(entries));
    })();
  }, [platform.schools]);

  const nav = [
    { group: "", items: [{ key: "dashboard", label: "Dashboard", icon: Home }] },
    { group: "Schools", items: [
      { key: "schools-all", label: "All Schools", icon: Building2 },
      { key: "schools-add", label: "Add School", icon: Plus },
      { key: "schools-suspended", label: "Suspended Schools", icon: Ban },
    ] },
    { group: "Users", items: [
      { key: "users-owners", label: "Super Admins", icon: Shield },
      { key: "users-admins", label: "School Admins", icon: UserCog },
    ] },
    { group: "Subscriptions", items: [{ key: "subscriptions", label: "Plans & Billing", icon: CreditCard }] },
    { group: "Payments", items: [{ key: "payments", label: "Transactions", icon: CreditCard }] },
    { group: "Analytics", items: [{ key: "analytics", label: "Schools & Users", icon: BarChart3 }] },
    { group: "Communication", items: [{ key: "announcements", label: "Announcements", icon: Radio }] },
    { group: "Support", items: [
      { key: "support", label: "Tickets", icon: LifeBuoy },
      { key: "kb", label: "Knowledge Base", icon: BookOpen },
    ] },
    { group: "Content", items: [{ key: "content", label: "Templates & Resources", icon: FileQuestion }] },
    { group: "", items: [
      { key: "settings", label: "Settings", icon: Settings },
      { key: "auditlog", label: "Audit Logs", icon: ScrollText },
      { key: "monitoring", label: "System Monitoring", icon: Server },
      { key: "integrations", label: "Integrations", icon: Plug },
      { key: "profile", label: "Profile", icon: UserCircle },
    ] },
  ];

  let content;
  if (view === "dashboard") content = <SAOverview platform={platform} schoolStats={schoolStats} />;
  else if (view === "schools-all") content = <SASchoolsAll platform={platform} savePlatform={savePlatform} onNavigate={onNavigate} logAction={logAction} />;
  else if (view === "schools-add") content = <SASchoolsAdd platform={platform} savePlatform={savePlatform} onNavigate={onNavigate} logAction={logAction} />;
  else if (view === "schools-suspended") content = <SASchoolsSuspended platform={platform} savePlatform={savePlatform} onNavigate={onNavigate} logAction={logAction} />;
  else if (view === "users-owners") content = <SAOwners platform={platform} savePlatform={savePlatform} owner={owner} onOwnerUpdated={onOwnerUpdated} logAction={logAction} />;
  else if (view === "users-admins") content = <SASchoolAdmins platform={platform} />;
  else if (view === "subscriptions") content = <SAStub title="Plans & Billing" needs="payment/subscription provider (e.g. Paystack, Stripe)" icon={CreditCard} />;
  else if (view === "payments") content = <SAStub title="Transactions" needs="payment gateway (e.g. Paystack, Stripe)" icon={CreditCard} />;
  else if (view === "analytics") content = <SAAnalytics platform={platform} schoolStats={schoolStats} />;
  else if (view === "announcements") content = <SAAnnouncements platform={platform} savePlatform={savePlatform} owner={owner} logAction={logAction} />;
  else if (view === "support") content = <SASupport platform={platform} owner={owner} logAction={logAction} />;
  else if (view === "kb") content = <SAKnowledgeBase platform={platform} savePlatform={savePlatform} logAction={logAction} />;
  else if (view === "content") content = <SAStub title="Templates & Resources" needs="way to import shared content into each school (not built yet)" icon={FileQuestion} />;
  else if (view === "settings") content = <SASettings />;
  else if (view === "auditlog") content = <SAAuditLog platform={platform} />;
  else if (view === "monitoring") content = <SAStub title="System Monitoring" needs="server/infrastructure to monitor — this app has no backend server" icon={Server} />;
  else if (view === "integrations") content = <SAStub title="Integrations" needs="third-party services to connect" icon={Plug} />;
  else if (view === "profile") content = <SAProfile owner={owner} platform={platform} savePlatform={savePlatform} onOwnerUpdated={onOwnerUpdated} />;

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ backgroundColor: THEME.paper }}>
      <style>{FONT_IMPORT}</style>

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3" style={{ backgroundColor: DARK_SURFACE }}>
        <button onClick={() => setMobileMenuOpen(true)} className="p-1.5 rounded-md" style={{ color: CREAM }} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <Crown size={16} style={{ color: CREAM }} />
          <span style={{ color: CREAM, fontFamily: "Lora, serif", fontWeight: 600 }} className="text-sm">{PLATFORM_NAME}</span>
        </div>
        <button onClick={onLogout} className="p-1.5 rounded-md" style={{ color: CREAM }} aria-label="Log out">
          <LogOut size={18} />
        </button>
      </div>

      {/* Mobile slide-in drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-72 max-w-[80vw] flex flex-col justify-between p-3 overflow-y-auto" style={{ backgroundColor: DARK_SURFACE }}>
            <div>
              <div className="flex items-center justify-between px-2 mb-4 pt-1">
                <div className="flex items-center gap-2">
                  <Crown size={18} style={{ color: CREAM }} />
                  <span style={{ color: CREAM, fontFamily: "Lora, serif", fontWeight: 600 }} className="text-sm">{PLATFORM_NAME}</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 rounded" style={{ color: CREAM }} aria-label="Close menu">
                  <X size={18} />
                </button>
              </div>
              {nav.map((section, i) => (
                <div key={i}>
                  {section.group && <SANavGroup title={section.group} />}
                  <div className="space-y-0.5">
                    {section.items.map((item) => (
                      <SANavItem
                        key={item.key}
                        icon={item.icon}
                        label={item.label}
                        active={view === item.key}
                        onClick={() => {
                          setView(item.key);
                          setMobileMenuOpen(false);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-3">
              <div className="flex items-center gap-2 px-2 py-2 mb-2 rounded-md" style={{ backgroundColor: "rgba(243,238,225,0.08)" }}>
                <UserCircle size={20} style={{ color: CREAM }} />
                <span className="text-xs font-semibold" style={{ color: CREAM, fontFamily: "Inter, sans-serif" }}>{owner.name || owner.username}</span>
              </div>
              <SANavItem icon={LogOut} label="Log out" onClick={onLogout} />
            </div>
          </div>
          <div className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="w-60 shrink-0 flex-col justify-between p-3 hidden md:flex overflow-y-auto" style={{ backgroundColor: DARK_SURFACE }}>
        <div>
          <div className="flex items-center gap-2 px-2 mb-4 pt-1">
            <Crown size={18} style={{ color: CREAM }} />
            <span style={{ color: CREAM, fontFamily: "Lora, serif", fontWeight: 600 }} className="text-sm">{PLATFORM_NAME}</span>
          </div>
          {nav.map((section, i) => (
            <div key={i}>
              {section.group && <SANavGroup title={section.group} />}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <SANavItem key={item.key} icon={item.icon} label={item.label} active={view === item.key} onClick={() => setView(item.key)} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="pt-3">
          <div className="flex items-center gap-2 px-2 py-2 mb-2 rounded-md" style={{ backgroundColor: "rgba(243,238,225,0.08)" }}>
            <UserCircle size={20} style={{ color: CREAM }} />
            <span className="text-xs font-semibold" style={{ color: CREAM, fontFamily: "Inter, sans-serif" }}>{owner.name || owner.username}</span>
          </div>
          <SANavItem icon={LogOut} label="Log out" onClick={onLogout} />
        </div>
      </aside>
      <main className="flex-1 p-5 md:p-8 overflow-x-hidden">{content}</main>
    </div>
  );
}

export default function Root() {
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState({ schools: [], owners: [] });
  const [owner, setOwner] = useState(null);
  const [schoolSlug, setSchoolSlug] = useState(readSchoolSlugFromUrl());
  const [firstRunRecoveryCodes, setFirstRunRecoveryCodes] = useState(null);

  useEffect(() => {
    const onPopState = () => setSchoolSlug(readSchoolSlugFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((slug) => {
    pushSchoolUrl(slug);
    setSchoolSlug(slug || "");
  }, []);

  useEffect(() => {
    (async () => {
      const useRealAuth = !!window.USE_REAL_AUTH;
      let registry = await getStored("platform_registry", true, null);
      const announcements = await getStored("platform_announcements", true, null);
      const auditlogStore = await getStored("platform_auditlog", true, null);
      const articles = await getStored("platform_articles", true, null);
      let registryDirty = false;
      let bootstrapCodes = null;

      if (!registry) {
        const { codes, hashes } = await generateRecoveryCodes();
        bootstrapCodes = codes;
        let ownerRecord;
        if (useRealAuth) {
          // Creates a real Supabase Auth account too — allowed this one time via the
          // Edge Function's bootstrap exception (see create-user's comments).
          const created = await window.auth.createAccount({ username: "owner", password: "owner123", role: "owner", schoolId: null, appUsername: "Platform Owner" });
          ownerRecord = { id: uid("own"), authId: created.id, name: "Platform Owner", username: "owner", recoveryCodeHashes: hashes };
        } else {
          const hashedPw = await hashPassword("owner123");
          ownerRecord = { id: uid("own"), name: "Platform Owner", username: "owner", password: hashedPw, recoveryCodeHashes: hashes };
        }
        registry = {
          schools: [{ id: "school_demo", name: "Greenfield Secondary School", slug: "greenfield", status: "active", plan: "demo", createdAt: new Date().toISOString(), isDemo: true }],
          owners: [ownerRecord],
        };
        registryDirty = true;
      } else if (!useRealAuth) {
        // Legacy local-password migration — only meaningful when there's no real backend auth
        const needsHashing = (registry.owners || []).some((o) => o.password && !looksHashed(o.password));
        if (needsHashing) {
          const migrated = await Promise.all(
            registry.owners.map(async (o) => (o.password && !looksHashed(o.password) ? { ...o, password: await hashPassword(o.password) } : o))
          );
          registry = { ...registry, owners: migrated };
          registryDirty = true;
        }
      }
      if ((registry.owners || []).some((o) => !o.recoveryCodeHashes)) {
        registry = { ...registry, owners: registry.owners.map((o) => (o.recoveryCodeHashes ? o : { ...o, recoveryCodeHashes: [] })) };
        registryDirty = true;
      }

      if (registryDirty) await setStored("platform_registry", true, registry);
      if (announcements === null) await setStored("platform_announcements", true, []);
      if (auditlogStore === null) await setStored("platform_auditlog", true, { entries: [] });
      if (articles === null) await setStored("platform_articles", true, []);

      const mergedPlatform = { ...registry, announcements: announcements || [], auditlog: (auditlogStore && auditlogStore.entries) || [], articles: articles || [] };
      setPlatform(mergedPlatform);
      if (bootstrapCodes) setFirstRunRecoveryCodes(bootstrapCodes);

      if (useRealAuth) {
        const session = await window.auth.getSession();
        if (session) {
          const profile = await window.auth.getMyProfile();
          if (profile && profile.role === "owner") {
            const matched = mergedPlatform.owners.find((x) => x.username === profile.app_username);
            if (matched) setOwner(matched);
          }
        }
      } else {
        const savedOwnerUsername = await getStored("platform:session", false, null);
        if (savedOwnerUsername) {
          const o = registry.owners.find((x) => x.username === savedOwnerUsername);
          if (o) setOwner(o);
        }
      }
      setLoading(false);
    })();
  }, []);

  const savePlatform = (next) => {
    setPlatform(next);
    setStored("platform_registry", true, { schools: next.schools, owners: next.owners });
    setStored("platform_announcements", true, next.announcements || []);
    setStored("platform_auditlog", true, { entries: next.auditlog || [] });
    setStored("platform_articles", true, next.articles || []);
  };
  const logPlatformAction = useCallback(
    (action) => {
      setPlatform((prev) => {
        const nextEntries = [...(prev.auditlog || []), { id: uid("log"), actorName: owner?.name || owner?.username || "Owner", action, date: new Date().toISOString() }];
        const next = { ...prev, auditlog: nextEntries };
        setStored("platform_auditlog", true, { entries: nextEntries });
        return next;
      });
    },
    [owner]
  );
  const handleOwnerLogin = (o) => {
    setOwner(o);
    setStored("platform:session", false, o.username);
  };
  const handleOwnerLogout = () => {
    setOwner(null);
    setStored("platform:session", false, null);
    if (window.USE_REAL_AUTH) window.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: THEME.paper }}>
        <style>{FONT_IMPORT}</style>
        <p style={{ color: THEME.ink, fontFamily: "Inter, sans-serif" }} className="text-sm">Loading platform…</p>
      </div>
    );
  }

  if (schoolSlug) {
    const school = platform.schools.find((s) => s.slug === schoolSlug);
    if (!school) return <SchoolNotFound slug={schoolSlug} />;
    if (school.status === "suspended") return <SchoolSuspended school={school} />;
    return <SchoolApp schoolId={school.id} schoolName={school.name} isDemo={!!school.isDemo} />;
  }

  if (!owner) {
    return <PlatformEntry platform={platform} savePlatform={savePlatform} onOwnerLogin={handleOwnerLogin} onNavigate={navigate} firstRunRecoveryCodes={firstRunRecoveryCodes} />;
  }

  return (
    <SuperAdminDashboard
      platform={platform}
      savePlatform={savePlatform}
      owner={owner}
      onLogout={handleOwnerLogout}
      onNavigate={navigate}
      logAction={logPlatformAction}
      onOwnerUpdated={setOwner}
    />
  );
}
