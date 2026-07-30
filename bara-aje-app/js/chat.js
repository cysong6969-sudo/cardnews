import {
  collection, addDoc, deleteDoc, doc, setDoc, updateDoc, deleteField, query, orderBy, limit, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { subscribeMembers, colorForMemberId } from "./family.js";

let currentUser = null;
let unsubscribe = null;
let messagesCache = {};
let openPickerId = null;
let lastDocs = [];
let membersCache = {};
let readsCache = {};
let containerEl = null;
let lastSeenMessageId = null;
let hasInitialSnapshot = false;
let pinchStartDist = null;
let pinchStartSize = null;
let longPressTimer = null;
let longPressTargetEl = null;

const LONG_PRESS_MS = 550;

const FONT_SIZE_KEY = "bara_chat_font_size";
const FONT_SIZE_MIN = 13;
const FONT_SIZE_MAX = 26;
const FONT_SIZE_DEFAULT = 15;

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
  const names = unread.map((uid) => (membersCache[uid] ? membersCache[uid].name : "")).filter(Boolean).join(", ");
  return `<span class="read-badge" title="안읽음: ${escapeHtml(names)}">${unread.length}</span>`;
}

function scrollToBottom(container) {
  container.scrollTop = container.scrollHeight;
}

function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.3);
    });
  } catch (err) {
    console.warn("알림음 재생 실패:", err.message);
  }
}

function playNotification() {
  try {
    if ("speechSynthesis" in window) {
      playChime();
      const utter = new SpeechSynthesisUtterance("아제");
      utter.lang = "ko-KR";
      utter.rate = 1.1;
      utter.pitch = 1.3;
      utter.volume = 0.85;
      window.speechSynthesis.speak(utter);
    } else {
      playChime();
    }
  } catch (err) {
    playChime();
  }
}

function getChatFontSize() {
  const stored = parseFloat(localStorage.getItem(FONT_SIZE_KEY));
  return stored >= FONT_SIZE_MIN && stored <= FONT_SIZE_MAX ? stored : FONT_SIZE_DEFAULT;
}

function setChatFontSize(px) {
  const clamped = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(px)));
  document.documentElement.style.setProperty("--chat-font-size", clamped + "px");
  localStorage.setItem(FONT_SIZE_KEY, String(clamped));
  return clamped;
}

function touchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
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
    const senderInfo = membersCache[m.senderUid];
    const bubbleStyle = senderInfo
      ? `style="background:${colorForMemberId(senderInfo.memberId)}26; border-color:${colorForMemberId(senderInfo.memberId)}66;"`
      : "";
    return `
      <div class="msg ${mine ? "me" : ""} ${long ? "truncated" : ""}" data-id="${snap.id}" ${bubbleStyle}>
        ${mine ? "" : `<div class="sender" style="color:${senderInfo ? colorForMemberId(senderInfo.memberId) : "var(--sub)"}">${escapeHtml(m.senderName || "")}</div>`}
        <div class="text">${escapeHtml(text)}</div>
        ${long ? `<div class="more-link">더보기</div>` : ""}
        <div class="msg-actions">
          <button class="react-trigger" data-id="${snap.id}">🙂+</button>
          ${mine ? `<button class="msg-delete-trigger" data-id="${snap.id}">🗑</button>` : ""}
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
  if (shouldScroll && !openPickerId) scrollToBottom(container);
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

function openDeleteConfirmModal(messageId) {
  const m = messagesCache[messageId];
  if (!m || !currentUser || m.senderUid !== currentUser.uid) return;
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-overlay" id="delete-confirm-overlay">
      <div class="modal-sheet">
        <h3>메시지 삭제</h3>
        <div class="msg-detail-text">${escapeHtml(m.text || "")}</div>
        <div class="modal-actions">
          <button id="delete-cancel">취소</button>
          <button id="delete-confirm" style="color:var(--accent);">삭제</button>
        </div>
      </div>
    </div>
  `;
  root.querySelector("#delete-confirm-overlay").addEventListener("click", (e) => {
    if (e.target.id === "delete-confirm-overlay") root.innerHTML = "";
  });
  root.querySelector("#delete-cancel").addEventListener("click", () => { root.innerHTML = ""; });
  root.querySelector("#delete-confirm").addEventListener("click", async () => {
    root.innerHTML = "";
    try {
      await deleteDoc(doc(db, "messages", messageId));
    } catch (err) {
      console.warn("메시지 삭제 실패:", err.message);
    }
  });
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

  setChatFontSize(getChatFontSize());

  const q = query(collection(db, "messages"), orderBy("createdAt", "asc"), limit(50));
  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(q, (snap) => {
    const lastDoc = snap.docs[snap.docs.length - 1];
    if (hasInitialSnapshot && lastDoc && lastDoc.id !== lastSeenMessageId) {
      const data = lastDoc.data();
      if (currentUser && data.senderUid !== currentUser.uid) playNotification();
    }
    if (lastDoc) lastSeenMessageId = lastDoc.id;
    hasInitialSnapshot = true;

    renderMessages(container, snap.docs, true);
    if (isChatVisible(container)) markChatRead();
  });

  subscribeMembers((map) => {
    membersCache = map;
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

  container.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".msg-delete-trigger");
    if (!btn) return;
    longPressTargetEl = btn;
    btn.classList.add("pressing");
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      btn.classList.remove("pressing");
      openDeleteConfirmModal(btn.dataset.id);
    }, LONG_PRESS_MS);
  });

  const cancelLongPress = () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (longPressTargetEl) { longPressTargetEl.classList.remove("pressing"); longPressTargetEl = null; }
  };
  container.addEventListener("pointerup", cancelLongPress);
  container.addEventListener("pointerleave", cancelLongPress, true);
  container.addEventListener("pointercancel", cancelLongPress);

  container.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      pinchStartDist = touchDistance(e.touches);
      pinchStartSize = getChatFontSize();
    }
  }, { passive: true });

  container.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && pinchStartDist) {
      const ratio = touchDistance(e.touches) / pinchStartDist;
      setChatFontSize(pinchStartSize * ratio);
    }
  }, { passive: true });

  container.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) pinchStartDist = null;
  }, { passive: true });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !currentUser) return;
    input.value = "";
    input.style.height = "auto";
    await addDoc(collection(db, "messages"), {
      senderUid: currentUser.uid,
      senderName: currentUser.displayName,
      text,
      createdAt: serverTimestamp(),
    });
  });
}

export function onChatTabActivated() {
  if (containerEl && isChatVisible(containerEl)) {
    markChatRead();
    scrollToBottom(containerEl);
  }
}

export function setChatUser(user, member) {
  currentUser = user ? { uid: user.uid, displayName: member ? member.name : "" } : null;
}
