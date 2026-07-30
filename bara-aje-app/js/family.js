import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { db } from "./firebase-init.js";

export const MEMBERS = [
  { id: "dad", name: "아빠", email: "dad@ourfamily.local", color: "#ff6b5e" },
  { id: "mom", name: "박미희", email: "mom@ourfamily.local", color: "#5ec8ff" },
  { id: "son1", name: "송영재", email: "son1@ourfamily.local", color: "#6bd68a" },
  { id: "son2", name: "송윤재", email: "son2@ourfamily.local", color: "#c792ea" },
];

const FALLBACK_COLOR = "#8b93a1";

export function colorForMemberId(memberId) {
  const m = MEMBERS.find((x) => x.id === memberId);
  return m ? m.color : FALLBACK_COLOR;
}

let membersByUid = {};
const listeners = [];
let started = false;

export function subscribeMembers(callback) {
  listeners.push(callback);
  callback(membersByUid);
  if (!started) {
    started = true;
    onSnapshot(collection(db, "members"), (snap) => {
      membersByUid = {};
      snap.docs.forEach((d) => { membersByUid[d.id] = d.data(); });
      listeners.forEach((cb) => cb(membersByUid));
    });
  }
  return membersByUid;
}

export function colorForUid(uid) {
  const m = membersByUid[uid];
  return m ? colorForMemberId(m.memberId) : FALLBACK_COLOR;
}
