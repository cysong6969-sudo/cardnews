import { initAuthUI } from "./auth.js";
import { initChat, setChatUser, onChatTabActivated } from "./chat.js";
import { initPhotos, setPhotosUser } from "./photos.js";
import { initCalendar, setCalendarUser } from "./calendar.js";

const appScreen = document.getElementById("app-screen");
const whoLabel = document.getElementById("who-label");

const tabs = document.querySelectorAll(".tabs button");
const views = {
  chat: document.getElementById("view-chat"),
  photos: document.getElementById("view-photos"),
  calendar: document.getElementById("view-calendar"),
};

tabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabs.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    Object.entries(views).forEach(([key, el]) => {
      el.classList.toggle("hidden", key !== btn.dataset.tab);
    });
    onChatTabActivated();
  });
});

let initialized = false;

function initFeatures() {
  if (initialized) return;
  initialized = true;

  initChat({
    container: document.getElementById("chat-messages"),
    form: document.getElementById("chat-form"),
    input: document.getElementById("chat-input"),
  });

  initPhotos({
    form: document.getElementById("photo-form"),
    fileInput: document.getElementById("photo-file"),
    captionInput: document.getElementById("photo-caption"),
    dateInput: document.getElementById("photo-date"),
    statusEl: document.getElementById("upload-status"),
    grid: document.getElementById("photo-grid"),
  });

  initCalendar({
    grid: document.getElementById("cal-grid"),
    list: document.getElementById("cal-list"),
    label: document.getElementById("cal-label"),
    prevBtn: document.getElementById("cal-prev"),
    nextBtn: document.getElementById("cal-next"),
    addBtn: document.getElementById("cal-add-btn"),
  });
}

initAuthUI({
  onLogin: (user, member) => {
    appScreen.classList.remove("hidden");
    whoLabel.textContent = member ? member.name + "님" : "";
    setChatUser(user, member);
    setPhotosUser(user, member);
    setCalendarUser(user, member);
    initFeatures();
  },
  onLogout: () => {
    appScreen.classList.add("hidden");
    setChatUser(null, null);
    setPhotosUser(null, null);
    setCalendarUser(null, null);
  },
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
