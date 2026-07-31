import {
  collection, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { db } from "./firebase-init.js";

const EVENT_COLORS = ["#ff6b5e", "#5ec8ff", "#6bd68a", "#c792ea"];
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

let currentUser = null;
let viewDate = new Date();
viewDate.setDate(1);
let unsubscribe = null;
let eventsCache = [];
let refs = null;

function pad(n) { return String(n).padStart(2, "0"); }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function monthRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: toDateStr(start), end: toDateStr(end) };
}

function subscribeMonth() {
  const { start, end } = monthRange(viewDate);
  const q = query(
    collection(db, "events"),
    where("date", ">=", start),
    where("date", "<=", end),
    orderBy("date", "asc")
  );
  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(q, (snap) => {
    eventsCache = snap.docs;
    renderAll();
  });
}

function renderAll() {
  renderGrid();
  renderList();
}

function renderGrid() {
  const { grid, label } = refs;
  label.textContent = `${viewDate.getFullYear()}년 ${viewDate.getMonth() + 1}월`;

  const firstDow = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const todayStr = toDateStr(new Date());

  const eventsByDay = {};
  eventsCache.forEach((snap) => {
    const e = snap.data();
    (eventsByDay[e.date] = eventsByDay[e.date] || []).push(e);
  });

  let html = DOW.map((d, i) =>
    `<div class="dow ${i === 0 ? "sun" : ""} ${i === 6 ? "sat" : ""}">${d}</div>`
  ).join("");
  for (let i = 0; i < firstDow; i++) html += `<div class="cal-cell empty"></div>`;
  const MAX_CHIPS = 3;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${viewDate.getFullYear()}-${pad(viewDate.getMonth() + 1)}-${pad(day)}`;
    const isToday = dateStr === todayStr;
    const dow = new Date(viewDate.getFullYear(), viewDate.getMonth(), day).getDay();
    const dayEvents = eventsByDay[dateStr] || [];
    const chips = dayEvents.slice(0, MAX_CHIPS).map((e) =>
      `<span class="evt-dot" style="background:${e.color || "var(--accent2)"}">${escapeHtml(e.title)}</span>`
    ).join("");
    const more = dayEvents.length > MAX_CHIPS
      ? `<span class="evt-more">+${dayEvents.length - MAX_CHIPS}</span>`
      : "";
    html += `<div class="cal-cell ${isToday ? "today" : ""} ${dow === 0 ? "sun" : ""} ${dow === 6 ? "sat" : ""}" data-date="${dateStr}">
      <span class="daynum">${day}</span>${chips}${more}
    </div>`;
  }
  grid.innerHTML = html;
}

function renderList() {
  const { list } = refs;
  if (eventsCache.length === 0) {
    list.innerHTML = `<div class="upload-status">이번 달 일정이 없어요.</div>`;
    return;
  }
  list.innerHTML = eventsCache.map((snap) => {
    const e = snap.data();
    const memoPreview = (e.memo || "").trim().slice(0, 40);
    return `
      <div class="cal-event-item" data-id="${snap.id}">
        <span class="dot" style="background:${e.color || "#5ec8ff"}"></span>
        <div class="title">
          <div>${escapeHtml(e.title)}</div>
          <div class="meta" style="color:var(--sub); font-size:11px;">${e.date}${e.startTime ? " · " + e.startTime : ""} · ${escapeHtml(e.createdByName || "")}</div>
          ${memoPreview ? `<div class="meta memo-preview" data-id="${snap.id}" style="color:var(--sub); font-size:11px; margin-top:2px;">${escapeHtml(memoPreview)}${e.memo.trim().length > 40 ? "…" : ""}</div>` : ""}
        </div>
        <button class="del" data-id="${snap.id}">✕</button>
      </div>
    `;
  }).join("");
}

function openMemoReadModal(snap) {
  const e = snap.data();
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-overlay" id="memo-read-overlay">
      <div class="modal-sheet">
        <h3>${escapeHtml(e.title)}</h3>
        <div class="msg-detail-time">${e.date}${e.startTime ? " · " + e.startTime : ""} · ${escapeHtml(e.createdByName || "")}</div>
        <div class="msg-detail-text">${escapeHtml(e.memo || "")}</div>
        <div class="modal-actions">
          <button id="memo-read-close" class="primary">닫기</button>
        </div>
      </div>
    </div>
  `;
  root.querySelector("#memo-read-overlay").addEventListener("click", (ev) => {
    if (ev.target.id === "memo-read-overlay") root.innerHTML = "";
  });
  root.querySelector("#memo-read-close").addEventListener("click", () => { root.innerHTML = ""; });
}

function openEventModal(prefillDate, existing) {
  const root = document.getElementById("modal-root");
  const e = existing ? existing.data() : null;
  let selectedColor = e ? (e.color || EVENT_COLORS[0]) : EVENT_COLORS[0];

  root.innerHTML = `
    <div class="modal-overlay" id="event-modal-overlay">
      <div class="modal-sheet">
        <h3>${existing ? "일정 보기 / 수정" : "일정 추가"}</h3>
        <input id="evt-title" type="text" placeholder="제목" value="${e ? escapeHtml(e.title) : ""}">
        <input id="evt-date" type="date" value="${e ? e.date : (prefillDate || toDateStr(new Date()))}">
        <div class="time-select-row">
          <select id="evt-hour">
            <option value="">시간 미정</option>
            ${Array.from({ length: 24 }, (_, h) => pad(h)).map((h) =>
              `<option value="${h}" ${e && e.startTime && e.startTime.split(":")[0] === h ? "selected" : ""}>${h}시</option>`
            ).join("")}
          </select>
          <select id="evt-minute">
            ${["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].map((m) =>
              `<option value="${m}" ${e && e.startTime && e.startTime.split(":")[1] === m ? "selected" : ""}>${m}분</option>`
            ).join("")}
          </select>
        </div>
        <textarea id="evt-memo" rows="7" placeholder="메모, 에세이, 시 등 자유롭게 적어주세요 (선택)">${e ? escapeHtml(e.memo || "") : ""}</textarea>
        <div style="display:flex; gap:8px;">
          ${EVENT_COLORS.map((c) => `<span class="dot color-dot" style="background:${c}; width:22px; height:22px; cursor:pointer; ${c === selectedColor ? "box-shadow:0 0 0 2px var(--text);" : ""}" data-color="${c}"></span>`).join("")}
        </div>
        <div class="modal-actions">
          ${existing ? `<button id="evt-close">닫기</button><button id="evt-delete" style="color:var(--accent);">삭제</button>` : `<button id="evt-cancel">취소</button>`}
          <button id="evt-save" class="primary">저장</button>
        </div>
      </div>
    </div>
  `;
  root.querySelectorAll(".color-dot").forEach((dot) => {
    dot.addEventListener("click", () => {
      selectedColor = dot.dataset.color;
      root.querySelectorAll(".color-dot").forEach((d) => {
        d.style.boxShadow = d.dataset.color === selectedColor ? "0 0 0 2px var(--text)" : "none";
      });
    });
  });
  root.querySelector("#event-modal-overlay").addEventListener("click", (ev) => {
    if (ev.target.id === "event-modal-overlay") root.innerHTML = "";
  });
  const cancelBtn = root.querySelector("#evt-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", () => { root.innerHTML = ""; });
  const closeBtn = root.querySelector("#evt-close");
  if (closeBtn) closeBtn.addEventListener("click", () => { root.innerHTML = ""; });

  const deleteBtn = root.querySelector("#evt-delete");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!confirm("이 일정을 삭제할까요?")) return;
      await deleteDoc(doc(db, "events", existing.id));
      root.innerHTML = "";
    });
  }

  root.querySelector("#evt-save").addEventListener("click", async () => {
    const title = root.querySelector("#evt-title").value.trim();
    const date = root.querySelector("#evt-date").value;
    if (!title || !date || !currentUser) return;
    const hour = root.querySelector("#evt-hour").value;
    const minute = root.querySelector("#evt-minute").value;
    const payload = {
      title,
      date,
      startTime: hour ? `${hour}:${minute}` : null,
      memo: root.querySelector("#evt-memo").value.trim(),
      color: selectedColor,
    };
    if (existing) {
      await updateDoc(doc(db, "events", existing.id), { ...payload, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, "events"), {
        ...payload,
        createdByUid: currentUser.uid,
        createdByName: currentUser.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    root.innerHTML = "";
  });
}

function goToMonth(delta) {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1);
  subscribeMonth();
}

export function initCalendar({ grid, list, label, prevBtn, nextBtn, addBtn }) {
  refs = { grid, list, label };
  subscribeMonth();

  prevBtn.addEventListener("click", () => goToMonth(-1));
  nextBtn.addEventListener("click", () => goToMonth(1));
  addBtn.addEventListener("click", () => openEventModal());

  grid.addEventListener("click", (e) => {
    const cell = e.target.closest(".cal-cell:not(.empty)");
    if (cell) openEventModal(cell.dataset.date);
  });

  let touchStartX = 0;
  let touchStartY = 0;
  grid.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  grid.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goToMonth(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  list.addEventListener("click", async (e) => {
    const delBtn = e.target.closest(".del");
    if (delBtn) {
      if (!confirm("이 일정을 삭제할까요?")) return;
      await deleteDoc(doc(db, "events", delBtn.dataset.id));
      return;
    }
    const memoPreview = e.target.closest(".memo-preview");
    if (memoPreview) {
      const snap = eventsCache.find((s) => s.id === memoPreview.dataset.id);
      if (snap) openMemoReadModal(snap);
      return;
    }
    const item = e.target.closest(".cal-event-item");
    if (item) {
      const snap = eventsCache.find((s) => s.id === item.dataset.id);
      if (snap) openEventModal(null, snap);
    }
  });
}

export function setCalendarUser(user, member) {
  currentUser = user ? { uid: user.uid, displayName: member ? member.name : "" } : null;
}
