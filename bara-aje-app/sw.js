const CACHE_NAME = "bara-aje-shell-v18";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/main.js",
  "./js/firebase-config.js",
  "./js/firebase-init.js",
  "./js/auth.js",
  "./js/family.js",
  "./js/chat.js",
  "./js/photos.js",
  "./js/calendar.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/family-hero.png",
];

const PASSTHROUGH_HOSTS = [
  "firestore.googleapis.com",
  "firebasestorage.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "api.cloudinary.com",
  "res.cloudinary.com",
  "www.gstatic.com",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (PASSTHROUGH_HOSTS.includes(url.hostname)) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
