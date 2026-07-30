import {
  collection, addDoc, deleteDoc, doc, query, orderBy, limit, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { cloudinaryConfig } from "./firebase-config.js";

let currentUser = null;
let unsubscribe = null;
let photosCache = [];

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function uploadToCloudinary(file, onProgress) {
  const url = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", cloudinaryConfig.uploadPreset);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error("업로드 실패 (" + xhr.status + ")"));
      }
    };
    xhr.onerror = () => reject(new Error("네트워크 오류"));
    xhr.send(formData);
  });
}

function renderGrid(grid) {
  grid.innerHTML = photosCache.map((snap) => {
    const p = snap.data();
    return `<div class="thumb" data-id="${snap.id}"><img src="${p.url}" loading="lazy" alt=""></div>`;
  }).join("");
}

function openLightbox(photoId) {
  const snap = photosCache.find((s) => s.id === photoId);
  if (!snap) return;
  const p = snap.data();
  const root = document.getElementById("modal-root");
  const canDelete = currentUser && p.uploadedByUid === currentUser.uid;
  root.innerHTML = `
    <div class="lightbox" id="lightbox">
      <img src="${p.url}" alt="">
      <div class="lightbox-info">
        <div>
          <div class="caption">${escapeHtml(p.caption || "")}</div>
          <div class="meta">${escapeHtml(p.uploadedByName || "")} · ${escapeHtml(p.photoDate || "")}</div>
        </div>
        <div style="display:flex; gap:8px;">
          ${canDelete ? `<button class="lightbox-delete" id="lightbox-delete-btn">삭제</button>` : ""}
          <button class="lightbox-close" id="lightbox-close-btn">닫기</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("lightbox-close-btn").addEventListener("click", () => { root.innerHTML = ""; });
  const delBtn = document.getElementById("lightbox-delete-btn");
  if (delBtn) {
    delBtn.addEventListener("click", async () => {
      if (!confirm("이 사진을 삭제할까요?")) return;
      await deleteDoc(doc(db, "photos", photoId));
      root.innerHTML = "";
    });
  }
}

export function initPhotos({ form, fileInput, captionInput, dateInput, statusEl, grid }) {
  const q = query(collection(db, "photos"), orderBy("uploadedAt", "desc"), limit(60));
  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(q, (snap) => {
    photosCache = snap.docs;
    renderGrid(grid);
  });

  grid.addEventListener("click", (e) => {
    const thumb = e.target.closest(".thumb");
    if (thumb) openLightbox(thumb.dataset.id);
  });

  const today = new Date();
  dateInput.value = today.toISOString().slice(0, 10);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const files = Array.from(fileInput.files);
    if (files.length === 0 || !currentUser) return;
    const caption = captionInput.value.trim();
    const photoDate = dateInput.value || today.toISOString().slice(0, 10);

    let done = 0;
    let failed = 0;
    for (const file of files) {
      statusEl.textContent = files.length > 1
        ? `업로드 중... (${done + 1}/${files.length}) 0%`
        : "업로드 중... 0%";
      try {
        const result = await uploadToCloudinary(file, (pct) => {
          statusEl.textContent = files.length > 1
            ? `업로드 중... (${done + 1}/${files.length}) ${pct}%`
            : `업로드 중... ${pct}%`;
        });
        await addDoc(collection(db, "photos"), {
          url: result.secure_url,
          publicId: result.public_id,
          caption,
          photoDate,
          uploadedByUid: currentUser.uid,
          uploadedByName: currentUser.displayName,
          uploadedAt: serverTimestamp(),
        });
        done++;
      } catch (err) {
        failed++;
      }
    }

    statusEl.textContent = failed > 0
      ? `${done}장 업로드 완료, ${failed}장 실패`
      : `${done}장 업로드 완료`;
    form.reset();
    dateInput.value = today.toISOString().slice(0, 10);
    setTimeout(() => { statusEl.textContent = ""; }, 2500);
  });
}

export function setPhotosUser(user, member) {
  currentUser = user ? { uid: user.uid, displayName: member ? member.name : "" } : null;
}
