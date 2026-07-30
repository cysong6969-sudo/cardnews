import {
  collection, addDoc, doc, setDoc, updateDoc, deleteField, query, orderBy, limit, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { db } from "./firebase-init.js";

let currentUser = null;
let unsubscribe = null;
let messagesCache = {};
let openPickerId = null;
let lastDocs = [];
let membersCache = {};
let readsCache = {};
let containerEl = null;

const LONG_TEXT_CHARS = 80;
const LONG_TEXT_LINES = 7;
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function isLongText(text) {
  return text.length > LONG_TEXT_CHARS || (text.match(/\n/g) || []).length >= LONG_TEXT_LINES;
}

function renderReactions(m) {
  const reactions = m.reactions || {};
  const counts = {};
  Object.values(reactions).forEach((emoji) => { counts[emoji] = (counts[emoji] || 0) + 1; });
  const emojis = Object.keys(counts);
  if (emojis.length === 0) return "";
  const mine = currentUser ? reactions[currentUser.uid] : null;
  return `
    <div class="msg-reactions">
      ${emojis.map((emoji) => `
        <button class="reaction-pill ${emoji === mine ? "mine" : ""}" data-emoji="${emoji}">
          ${emoji} <span>${counts[emoji]}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function unreadUidsFor(m) {
  if (!currentUser || !m.createdAt || !m.createdAt.toMillis) return null;
  const others = Object.keys(membersCache).filter((uid) => uid !== currentUser.uid);
  if (others.length === 0) return null;
  const msgMillis = m.createdAt.toMillis();
  return others.filter((uid) => {
    const read = readsCache[uid];
    const readMillis = read && read.toMillis ? read.toMillis() : 0;
    return readMillis < msgMillis;
  });
}

function renderReadBadge(m, mine) {
  if (!mine) return "";
  const unread = unreadUidsFor(m);
  if (!unread || unread.length === 0) return "";
  const names = unread.map((uid) => membersCache[uid] || "").filter(Boolean).join(", ");
  return `<span class="read-badge" title="안읽음: ${escapeHtml(names)}">${unread.length}</span>`;
}

function renderMessages(container, docs, shouldScroll) {
  lastDocs = docs;
  messagesCache = {};
  docs.forEach((snap) => { messagesCache[snap.id] = snap.data(); });

  container.innerHTML = docs.map((snap) => {
    const m = snap.data();
    const mine = currentUser && m.senderUid === currentUser.uid;
    const text = m.text || "";
    const long = isLongText(text);
    return `
      <div class="msg ${mine ? "me" : ""} ${long ? "truncated" : ""}" data-id="${snap.id}">
        ${mine ? "" : `<div class="sender">${escapeHtml(m.senderName || "")}</div>`}
        <div class="text">${escapeHtml(text)}</div>
        ${long ? `<div class="more-link">더보기</div>` : ""}
        <div class="msg-actions">
          <button class="react-trigger" data-id="${snap.id}">🙂+</button>
          ${renderReadBadge(m, mine)}
          <div class="time">${formatTime(m.createdAt)}</div>
        </div>
        ${renderReactions(m)}
        ${openPickerId === snap.id ? `
          <div class="reaction-picker">
            ${REACTION_EMOJIS.map((e) => `<button class="picker-emoji" data-emoji="${e}">${e}</button>`).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }).join("");
  if (shouldScroll && !openPickerId) container.scrollTop = container.scrollHeight;
}

async function toggleReaction(messageId, emoji) {
  if (!currentUser) return;
  const m = messagesCache[messageId];
  const current = m && m.reactions ? m.reactions[currentUser.uid] : null;
  const field = `reactions.${currentUser.uid}`;
  try {
    await updateDoc(doc(db, "messages", messageId), {
      [field]: current === emoji ? deleteField() : emoji,
    });
  } catch (err) {
    console.warn("반응 저장 실패:", err.message);
  }
}

function openMessageModal(id) {
  const m = messagesCache[id];
  if (!m) return;
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-overlay" id="msg-modal-overlay">
      <div class="modal-sheet">
        <h3>${escapeHtml(m.senderName || "")}</h3>
        <div class="msg-detail-text">${escapeHtml(m.text || "")}</div>
        <div class="msg-detail-time">${formatTime(m.createdAt)}</div>
        <div class="modal-actions">
          <button id="msg-close" class="primary">닫기</button>
        </div>
      </div>
    </div>
  `;
  root.querySelector("#msg-modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "msg-modal-overlay") root.innerHTML = "";
  });
  root.querySelector("#msg-close").addEventListener("click", () => { root.innerHTML = ""; });
}

export async function markChatRead() {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "chatReads", currentUser.uid), { lastReadAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.warn("읽음 상태 저장 실패:", err.message);
  }
}

function isChatVisible(container) {
  const view = container.closest(".view");
  return view && !view.classList.contains("hidden");
}

export function initChat({ container, form, input }) {
  containerEl = container;

  const q = query(collection(db, "messages"), orderBy("createdAt", "asc"), limit(50));
  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(q, (snap) => {
    renderMessages(container, snap.docs, true);
    if (isChatVisible(container)) markChatRead();
  });

  onSnapshot(collection(db, "members"), (snap) => {
    membersCache = {};
    snap.docs.forEach((d) => { membersCache[d.id] = d.data().name; });
    renderMessages(container, lastDocs, false);
  });

  onSnapshot(collection(db, "chatReads"), (snap) => {
    readsCache = {};
    snap.docs.forEach((d) => { readsCache[d.id] = d.data().lastReadAt; });
    renderMessages(container, lastDocs, false);
  });

  markChatRead();

  container.addEventListener("click", (e) => {
    const pickerEmoji = e.target.closest(".picker-emoji");
    if (pickerEmoji) {
      const msgId = e.target.closest(".msg").dataset.id;
      openPickerId = null;
      toggleReaction(msgId, pickerEmoji.dataset.emoji);
      return;
    }
    const pill = e.target.closest(".reaction-pill");
    if (pill) {
      const msgId = e.target.closest(".msg").dataset.id;
      toggleReaction(msgId, pill.dataset.emoji);
      return;
    }
    const trigger = e.target.closest(".react-trigger");
    if (trigger) {
      openPickerId = openPickerId === trigger.dataset.id ? null : trigger.dataset.id;
      renderMessages(container, lastDocs, false);
      return;
    }
    const moreLink = e.target.closest(".more-link");
    const textEl = e.target.closest(".text");
    if (moreLink || textEl) {
      const msg = e.target.closest(".msg.truncated");
      if (msg) openMessageModal(msg.dataset.id);
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !currentUser) return;
    input.value = "";
    await addDoc(collection(db, "messages"), {
      senderUid: currentUser.uid,
      senderName: currentUser.displayName,
      text,
      createdAt: serverTimestamp(),
    });
  });
}

export function onChatTabActivated() {
  if (containerEl && isChatVisible(containerEl)) markChatRead();
}

export function setChatUser(user, member) {
  currentUser = user ? { uid: user.uid, displayName: member ? member.name : "" } : null;
}
