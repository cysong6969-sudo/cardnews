import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";

export const MEMBERS = [
  { id: "dad", name: "아빠", email: "dad@ourfamily.local", color: "#ff6b5e" },
  { id: "mom", name: "박미희", email: "mom@ourfamily.local", color: "#5ec8ff" },
  { id: "son1", name: "송영재", email: "son1@ourfamily.local", color: "#6bd68a" },
  { id: "son2", name: "송윤재", email: "son2@ourfamily.local", color: "#c792ea" },
];

const PIN_SALT = ":bara-aje-2026";
const PIN_LENGTH = 4;

function toPassword(pin) {
  return pin + PIN_SALT;
}

async function ensureMemberDoc(user, member) {
  if (!member) return;
  try {
    const ref = doc(db, "members", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        name: member.name,
        memberId: member.id,
        uid: user.uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn("members 문서 확인 실패:", err.message);
  }
}

export function initAuthUI({ onLogin, onLogout }) {
  const profileGrid = document.getElementById("profile-grid");
  const profileScreen = document.getElementById("profile-screen");
  const pinOverlay = document.getElementById("pin-overlay");
  const switchBtn = document.getElementById("switch-profile-btn");

  MEMBERS.forEach((member) => {
    const btn = document.createElement("button");
    btn.className = "profile-btn";
    btn.innerHTML = `
      <span class="avatar" style="background:${member.color}">${member.name.slice(-2)}</span>
      <span class="name">${member.name}</span>
    `;
    btn.addEventListener("click", () => openPinPad(member));
    profileGrid.appendChild(btn);
  });

  let pin = "";
  let activeMember = null;

  function openPinPad(member) {
    activeMember = member;
    pin = "";
    renderPinPad("");
    pinOverlay.classList.remove("hidden");
  }

  function closePinPad() {
    pinOverlay.classList.add("hidden");
    activeMember = null;
    pin = "";
  }

  function renderPinPad(message, isError) {
    const dots = Array.from({ length: PIN_LENGTH }, (_, i) =>
      `<span class="${i < pin.length ? "filled" : ""}"></span>`
    ).join("");
    const keys = ["1","2","3","4","5","6","7","8","9","","0","del"];
    const keyHtml = keys.map((k) => {
      if (k === "") return `<span></span>`;
      if (k === "del") return `<button data-key="del">⌫</button>`;
      return `<button data-key="${k}">${k}</button>`;
    }).join("");

    pinOverlay.innerHTML = `
      <span class="avatar" style="background:${activeMember.color}">${activeMember.name.slice(-2)}</span>
      <div>${activeMember.name} PIN 입력</div>
      <div class="pin-dots">${dots}</div>
      <div class="pin-msg ${isError ? "error" : ""}">${message || ""}</div>
      <div class="pin-pad">${keyHtml}</div>
      <button class="pin-cancel" id="pin-cancel-btn">취소</button>
    `;

    pinOverlay.querySelectorAll(".pin-pad button[data-key]").forEach((btn) => {
      btn.addEventListener("click", () => handleKey(btn.dataset.key));
    });
    pinOverlay.querySelector("#pin-cancel-btn").addEventListener("click", closePinPad);
  }

  function handleKey(key) {
    if (key === "del") {
      pin = pin.slice(0, -1);
      renderPinPad("");
      return;
    }
    if (pin.length >= PIN_LENGTH) return;
    pin += key;
    renderPinPad("");
    if (pin.length === PIN_LENGTH) submitPin();
  }

  async function submitPin() {
    renderPinPad("확인 중...");
    const email = activeMember.email;
    const password = toPassword(pin);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential" || err.code === "auth/invalid-login-credentials") {
        renderPinPad("처음 사용하는 프로필이면, 방금 입력한 번호로 새로 만들어요...");
        try {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          await setDoc(doc(db, "members", cred.user.uid), {
            name: activeMember.name,
            memberId: activeMember.id,
            uid: cred.user.uid,
            createdAt: serverTimestamp(),
          });
        } catch (createErr) {
          if (createErr.code === "auth/email-already-in-use") {
            pin = "";
            renderPinPad("번호가 틀렸어요. 다시 입력해 주세요.", true);
          } else {
            pin = "";
            renderPinPad("오류가 발생했어요: " + createErr.message, true);
          }
          return;
        }
      } else if (err.code === "auth/wrong-password") {
        pin = "";
        renderPinPad("번호가 틀렸어요. 다시 입력해 주세요.", true);
      } else {
        pin = "";
        renderPinPad("오류가 발생했어요: " + err.message, true);
      }
    }
  }

  switchBtn.addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      pinOverlay.classList.add("hidden");
      profileScreen.classList.add("hidden");
      const member = MEMBERS.find((m) => m.email === user.email) || null;
      ensureMemberDoc(user, member);
      onLogin(user, member);
    } else {
      profileScreen.classList.remove("hidden");
      onLogout();
    }
  });
}
