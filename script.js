// إعدادات عامة
const CANVAS_SIZE = 1080;
const FRAME_PATH = 'assets/avatar.png'; // تأكد من وضع الملف في هذا المسار

// عناصر DOM
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const dropZone = document.getElementById('drop-zone');
const startBtn = document.getElementById('start-btn');
const canvas = document.getElementById('canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const statusEl = document.getElementById('status');
const downloadBtn = document.getElementById('download-btn');
// زر إعادة القص سيُضاف لاحقًا إلى HTML عبر JS إن لم يكن موجودًا


// رسم نص تمهيدي في وسط اللوحة قبل رفع أي صورة
async function drawPlaceholder(){
  const msg = 'هنا ستعرض الصورة بعد رفعها';
  // تأكد أن أبعاد اللوحة مضبوطة على الحجم الافتراضي في الـ HTML
  canvas.width = canvas.width; // يمسح المحتوى ويحافظ على الأبعاد المحددة سلفًا
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // حجم خط نسبي ليتناسب مع 1080×1080 ويعمل جيدًا عند تصغير المعاينة
  const fontSize = Math.max(24, Math.floor(CANVAS_SIZE * 0.04));
  // حاول تحميل خط Saudi قبل الرسم لضمان ظهوره على اللوحة
  try { await document.fonts?.load(`${fontSize}px 'Saudi'`); } catch(_) {}
  ctx.font = `${fontSize}px 'Saudi', system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
  ctx.fillStyle = '#702414';
  ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
  ctx.restore();
}

// عرض النص التمهيدي عند بدء الصفحة (فقط إذا كانت عناصر الرفع موجودة)
if (canvas && ctx) {
  drawPlaceholder();
}

// تحميل إطار الصورة مسبقاً
let frameImage = new Image();
frameImage.src = FRAME_PATH;
let frameLoaded = false;
let frameReadyResolve;
let frameReadyPromise = new Promise((resolve) => { frameReadyResolve = resolve; });
frameImage.onload = () => { frameLoaded = true; frameReadyResolve?.(); };
frameImage.onerror = () => { frameLoaded = false; warn('تعذر العثور على الإطار assets/avatar.png — سيتم المتابعة بدون إطار'); frameReadyResolve?.(); };

// انتظار إطار الهوية لفترة قصيرة قبل الرسم لضمان دمجه في النتيجة
async function waitForFrame(timeoutMs = 1200){
  if (frameLoaded) return true;
  try{
    await Promise.race([
      frameReadyPromise,
      new Promise((resolve) => setTimeout(resolve, timeoutMs))
    ]);
  }catch(_){/* تجاهل */}
  return frameLoaded;
}

// أدوات مساعدة
function inform(msg){ if (statusEl){ statusEl.textContent = msg; statusEl.style.color = '#d5c4bd'; } }
function warn(msg){ if (statusEl){ statusEl.textContent = msg; statusEl.style.color = '#d3624c'; } }
function clearStatus(){ if (statusEl){ statusEl.textContent = ''; } }

function fitCover(srcW, srcH, dst){
  // يحسب مستطيل القص لرسم الصورة مغطيةً كامل المربع
  const sRatio = srcW / srcH;
  const dRatio = 1; // لأننا نرسم داخل مربع
  let sx, sy, sw, sh;
  if (sRatio > dRatio){
    // الصورة أعرض من المطلوب: قص من العرض
    sh = srcH;
    sw = sh * dRatio;
    sx = (srcW - sw) / 2;
    sy = 0;
  } else {
    // الصورة أطول من المطلوب: قص من الارتفاع
    sw = srcW;
    sh = sw / dRatio;
    sx = 0;
    sy = (srcH - sh) / 2;
  }
  return { sx, sy, sw, sh, dx:0, dy:0, dw:dst, dh:dst };
}

async function renderWithFrame(file){
  clearStatus();
  if (!file) return;

  const img = await readImageFromFile(file);

  // حضّر لوحة الرسم
  if (!canvas || !ctx) return;
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  // قصّ اللوحة إلى دائرة لعرض وتصدير الصورة بشكل دائري (مع شفافية في الزوايا)
  ctx.save();
  ctx.beginPath();
  ctx.arc(CANVAS_SIZE/2, CANVAS_SIZE/2, CANVAS_SIZE/2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  // أرسم الصورة مغطيّة كامل المربع
  const { sx, sy, sw, sh, dx, dy, dw, dh } = fitCover(img.naturalWidth, img.naturalHeight, CANVAS_SIZE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);

  // أرسم الإطار بعد التأكد من جاهزيته قدر الإمكان
  if (await waitForFrame()){
    try { ctx.drawImage(frameImage, 0, 0, CANVAS_SIZE, CANVAS_SIZE); } catch(_){}
  }

  // استعادة السياق بعد القصّ
  ctx.restore();

  if (downloadBtn) downloadBtn.disabled = false;
  clearStatus();
  try { ensureDeleteButton(); } catch(_) {}
}

function readImageFromFile(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// إعداد القص باستخدام Cropper.js
const cropperModal = document.getElementById('cropper-modal');
const cropperImg = document.getElementById('cropper-image');
const cropConfirm = document.getElementById('crop-confirm');
const cropCancel = document.getElementById('crop-cancel');
const backdrop = cropperModal?.querySelector('.modal-backdrop');
let cropper = null;
let lastSelectedDataUrl = null; // للاحتفاظ بآخر صورة تم اختيارها قبل القص
let scaleX = 1, scaleY = 1; // حالات القلب
let lastUploadedOriginal = null; // معلومات آخر رفع للصورة الأصلية إلى التخزين

// قفل تمرير الصفحة عند فتح أي نافذة منبثقة
function refreshBodyScrollLock(){
  try{
    const anyOpen = document.querySelectorAll('.modal.show').length > 0;
    document.body?.classList?.toggle('modal-open', anyOpen);
  }catch(_){}}

// رفع الصورة الأصلية إلى Supabase Storage
async function uploadOriginalFileToStorage(file){
  if (!isSupabaseConfigured()) return null;
  if (!fileInput || !browseBtn || !dropZone) return null; // Guard uploader-related logic
  try{
    const client = getSupabaseClient();
    const bucket = 'uploads';
    const ext = (file.name?.split('.')?.pop() || 'png').toLowerCase();
    const safeExt = ext.match(/^[a-z0-9]+$/) ? ext : 'png';
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2,8);
    const datePrefix = new Date().toISOString().slice(0,10); // YYYY-MM-DD
    const filePath = `${datePrefix}/${stamp}-${rand}.${safeExt}`;
    const { data, error } = await client
      .storage
      .from(bucket)
      .upload(filePath, file, { cacheControl: '3600', upsert: false, contentType: file.type || 'application/octet-stream' });
    if (error) throw error;
    const { data: pub } = client.storage.from(bucket).getPublicUrl(filePath);
    const info = { path: filePath, publicUrl: pub?.publicUrl || null };
    lastUploadedOriginal = info;
    return info;
  }catch(err){
    console.error('Storage upload error:', err);
    return null;
  }finally{
    // لا تعرض/تخفي شريط التقدم أثناء رفع الصورة لتجنب تشتيت المستخدم
  }
}

function openCropper(dataUrl){
  lastSelectedDataUrl = dataUrl;
  // حدّث حالة زر إعادة القص عند اختيار صورة
  try { ensureRecropButton(); } catch(_) {}
  // فعّل زر الحذف عند وجود صورة محددة
  try { ensureDeleteButton(); } catch(_) {}
  cropperImg.src = dataUrl;
  cropperModal.classList.add('show');
  cropperModal.setAttribute('aria-hidden', 'false');
  refreshBodyScrollLock();
  // انتظر تحميل الصورة قبل إنشاء القص
  cropperImg.onload = () => {
    if (cropper) { cropper.destroy(); cropper = null; }
    // إعادة تعيين حالات القلب عند الفتح
    scaleX = 1; scaleY = 1;
    cropper = new Cropper(cropperImg, {
      viewMode: 1,
      aspectRatio: 1,
      dragMode: 'move',
      autoCropArea: 1,
      background: false,
      movable: true,
      zoomable: true,
      rotatable: true,
      scalable: true,
    });
  };
}

function closeCropper(){
  if (cropper) { cropper.destroy(); cropper = null; }
  cropperModal.classList.remove('show');
  cropperModal.setAttribute('aria-hidden', 'true');
  refreshBodyScrollLock();
}

async function handleFileForCrop(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// تأكيد/إلغاء القص
if (cropperModal && cropConfirm && cropCancel) {
  cropConfirm.addEventListener('click', async () => {
    if (!cropper) return;
    const croppedCanvas = cropper.getCroppedCanvas({ width: CANVAS_SIZE, height: CANVAS_SIZE, imageSmoothingEnabled: true, imageSmoothingQuality: 'high' });
    // مرّر الناتج إلى مسار المعالجة الحالي
    const dataUrl = croppedCanvas.toDataURL('image/png');
    // استخدم مسار القراءة الحالي عبر إنشاء Image من dataUrl
    const img = new Image();
    img.onload = async () => {
      await renderFromImage(img);
      closeCropper();
      try { ensureRecropButton(); } catch(_) {}
    };
    img.src = dataUrl;
  });

  cropCancel.addEventListener('click', () => closeCropper());
  backdrop?.addEventListener('click', () => closeCropper());
}

// توصيل أزرار التدوير والقلب وإعادة الضبط
const rotateLeftBtn = document.getElementById('rotate-left');
const rotateRightBtn = document.getElementById('rotate-right');
const flipHBtn = document.getElementById('flip-h');
const flipVBtn = document.getElementById('flip-v');
const resetBtn = document.getElementById('reset');

rotateLeftBtn?.addEventListener('click', () => {
  if (!cropper) { warn('افتح أداة القص أولاً'); return; }
  cropper.rotate(-90);
  inform('تم تدوير الصورة 90° يسار');
});
rotateRightBtn?.addEventListener('click', () => {
  if (!cropper) { warn('افتح أداة القص أولاً'); return; }
  cropper.rotate(90);
  inform('تم تدوير الصورة 90° يمين');
});
flipHBtn?.addEventListener('click', () => {
  if (!cropper) { warn('افتح أداة القص أولاً'); return; }
  scaleX = scaleX * -1; cropper.scaleX(scaleX);
  inform(scaleX === -1 ? 'تم قلب الصورة أفقيًا' : 'تم إرجاع الاتجاه الأفقي');
});
flipVBtn?.addEventListener('click', () => {
  if (!cropper) { warn('افتح أداة القص أولاً'); return; }
  scaleY = scaleY * -1; cropper.scaleY(scaleY);
  inform(scaleY === -1 ? 'تم قلب الصورة عموديًا' : 'تم إرجاع الاتجاه العمودي');
});
resetBtn?.addEventListener('click', () => {
  if (!cropper) { warn('افتح أداة القص أولاً'); return; }
  cropper.reset(); scaleX = 1; scaleY = 1; inform('تمت إعادة الضبط');
});

// دالة ترسم من Image مباشرة (بديلة عن renderWithFrame(file) بعد القص)
async function renderFromImage(img){
  if (!canvas || !ctx) return;
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  ctx.save();
  ctx.beginPath();
  ctx.arc(CANVAS_SIZE/2, CANVAS_SIZE/2, CANVAS_SIZE/2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  // الصورة من cropper بالفعل مربعة بحجم 1080، لكن نستخدم drawImage لملء الكل
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
  if (await waitForFrame()){
    try { ctx.drawImage(frameImage, 0, 0, CANVAS_SIZE, CANVAS_SIZE); } catch(_){}
  }
  ctx.restore();
  downloadBtn.disabled = false;
  clearStatus();
  try { ensureDeleteButton(); } catch(_) {}
}

// أحداث الواجهة
startBtn?.addEventListener('click', () => {
  document.getElementById('book-embed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ——— ملء الشاشة للكُتيّب ———
const fullscreenBtn = document.getElementById('fullscreen-btn');

function getFullscreenElement(){
  // يشمل عنصر ملء الشاشة الأصلي أو وضع المحاكاة (fallback)
  return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || (fsFallbackOn ? fsFallbackTarget : null);
}
function requestFull(el){
  if (!el) return Promise.reject();
  if (el.requestFullscreen) return el.requestFullscreen();
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  if (el.msRequestFullscreen) return el.msRequestFullscreen();
  return Promise.reject();
}
function exitFull(){
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  if (document.msExitFullscreen) return document.msExitFullscreen();
  return Promise.resolve();
}
function setFsBtnLabel(){
  if (!fullscreenBtn) return;
  const inFs = Boolean(getFullscreenElement());
  fullscreenBtn.textContent = inFs ? 'الخروج من ملء الشاشة' : 'ملء الشاشة';
}

// ——— وضع ملء الشاشة البديل (Fallback) للأجهزة التي لا تدعم Fullscreen API (iOS Safari) ———
let fsFallbackOn = false;
let fsFallbackTarget = null;
let fsUiContainer = null;
let fsUiHideTimer = null;
let wakeLock = null;

function setDynamicVh(){
  try{
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }catch(_){/* تجاهل */}
}

function enableFsFallback(target){
  if (!target) return;
  fsFallbackOn = true;
  fsFallbackTarget = target;
  setDynamicVh();
  window.addEventListener('resize', setDynamicVh);
  document.body.classList.add('fs-fallback-open');
  target.classList.add('fs-fallback-target');
}

function disableFsFallback(){
  if (!fsFallbackOn) return;
  fsFallbackOn = false;
  window.removeEventListener('resize', setDynamicVh);
  document.body.classList.remove('fs-fallback-open');
  if (fsFallbackTarget){
    fsFallbackTarget.classList.remove('fs-fallback-target');
    fsFallbackTarget = null;
  }
}

// ——— تحسينات تجربة ملء الشاشة (واجهات، منع الخمول، إخفاء عناصر غير لازمة) ———
function buildFsUi(){
  if (fsUiContainer) return fsUiContainer;
  const div = document.createElement('div');
  div.className = 'fs-ui';
  // زر إغلاق علوي يمين مع مساحة آمنة للحواف
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'fs-close-btn';
  closeBtn.setAttribute('aria-label', 'الخروج من ملء الشاشة');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => {
    // يدعم الخروج من كلا الوضعين
    try { exitFull(); } catch(_){}
    disableFsFallback();
    exitFsEnhancements();
    setFsBtnLabel();
  });
  div.appendChild(closeBtn);

  // شريط تلميح مبسّط للايماءات (اختياري)
  const hint = document.createElement('div');
  hint.className = 'fs-hint';
  hint.textContent = ' اسحب الصفحات للتقليب بين طيات المجلة';
  div.appendChild(hint);

  fsUiContainer = div;
  return div;
}

function showFsUiTemporarily(){
  if (!fsUiContainer) return;
  fsUiContainer.classList.remove('hidden');
  clearTimeout(fsUiHideTimer);
  fsUiHideTimer = setTimeout(() => {
    fsUiContainer?.classList.add('hidden');
  }, 2000);
}

async function requestWakeLock(){
  try{
    if ('wakeLock' in navigator && navigator.wakeLock?.request){
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { /* لا شيء */ });
    }
  }catch(_){ wakeLock = null; }
}

async function releaseWakeLock(){
  try{ await wakeLock?.release?.(); }catch(_){}
  wakeLock = null;
}

function enterFsEnhancements(target){
  // أخف عناصر الواجهة غير الضرورية وارفع تراكب الأدوات
  document.body.classList.add('fs-active');
  const ui = buildFsUi();
  if (target && !target.contains(ui)) target.appendChild(ui);
  // مستمعات لإظهار الأدوات عند التفاعل ثم إخفائها تلقائيًا
  const reveal = () => showFsUiTemporarily();
  document.addEventListener('mousemove', reveal, { passive: true, once: false });
  document.addEventListener('touchstart', reveal, { passive: true, once: false });
  showFsUiTemporarily();
  // محاولة منع خمول الشاشة
  requestWakeLock();
}

function exitFsEnhancements(){
  document.body.classList.remove('fs-active');
  if (fsUiContainer){
    fsUiContainer.remove();
    fsUiContainer = null;
  }
  clearTimeout(fsUiHideTimer); fsUiHideTimer = null;
  document.removeEventListener('mousemove', showFsUiTemporarily, { capture: false });
  document.removeEventListener('touchstart', showFsUiTemporarily, { capture: false });
  releaseWakeLock();
}

// إعادة طلب Wake Lock عند العودة من الخلفية أثناء ملء الشاشة
document.addEventListener('visibilitychange', () => {
  const inFs = Boolean(getFullscreenElement());
  if (document.visibilityState === 'visible' && inFs){
    requestWakeLock();
  }
});

fullscreenBtn?.addEventListener('click', async () => {
  try{
    const inFs = Boolean(getFullscreenElement());
    if (inFs){
      // الخروج من الوضعين: الأصلي أو البديل
      try { await exitFull(); } catch(_){ /* تجاهل */ }
      disableFsFallback();
      exitFsEnhancements();
    } else {
      // استخدم عنصر PageFlip إن وُجد وإلا استخدم #book
      const target = window.__pageFlipEl || document.getElementById('book');
      try{
        await requestFull(target);
        enterFsEnhancements(target);
      }catch(_){
        // إذا فشل طلب ملء الشاشة، فعّل الوضع البديل المتوافق مع iOS
        enableFsFallback(target);
        enterFsEnhancements(target);
      }
    }
  }catch(_){/* تجاهل */}
  setFsBtnLabel();
});

['fullscreenchange','webkitfullscreenchange','msfullscreenchange'].forEach(evt => {
  document.addEventListener(evt, () => {
    setFsBtnLabel();
    const el = getFullscreenElement();
    if (el){
      // دخلنا ملء الشاشة بنجاح عبر النظام
      enterFsEnhancements(el);
    } else {
      // خرجنا من ملء الشاشة عبر النظام
      disableFsFallback();
      exitFsEnhancements();
    }
  });
});
// ضبط التسمية عند التحميل
setTimeout(setFsBtnLabel, 400);

// تدوير عبارة العنوان الثانية: بطموحنا، برؤيتنا، بفزعتنا
const rotatorEl = document.getElementById('hero-rotator');
if (rotatorEl) {
  const phrases = ['بطموحنا', 'برؤيتنا', 'بفزعتنا', 'بجودنا', 'بأصالتنا'];
  let idx = 0;
  // ابدأ من العنصر الحالي ثم بدّل مع حركة انزلاقية لأعلى ثم دخول من أسفل
  setInterval(() => {
    // خروج لأعلى
    rotatorEl.classList.add('slide-out');
    setTimeout(() => {
      // بدّل النص ثم حضّر لوضعية دخول من أسفل
      idx = (idx + 1) % phrases.length;
      rotatorEl.textContent = phrases[idx];
      rotatorEl.classList.remove('slide-out');
      rotatorEl.classList.add('pre-slide-in');
      // اترك المتصفح يسجّل الوضعية ثم أزلها ليحدث الانتقال للأعلى
      requestAnimationFrame(() => {
        // إجبار إعادة التدفق لضمان بدء الحركة بسلاسة في بعض المتصفحات
        void rotatorEl.offsetHeight;
        rotatorEl.classList.remove('pre-slide-in');
      });
    }, 460);
  }, 2400);
}
if (fileInput && browseBtn && dropZone && canvas) {
  browseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      try { uploadOriginalFileToStorage(file); } catch(_) {}
      const dataUrl = await handleFileForCrop(file);
      openCropper(dataUrl);
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')){
      try { uploadOriginalFileToStorage(file); } catch(_) {}
      const dataUrl = await handleFileForCrop(file);
      openCropper(dataUrl);
    } else {
      warn('رجاءً أفلت ملف صورة صالح');
    }
  });
}

// زر إعادة القص بجانب التنزيل
let recropBtn = document.getElementById('recrop-btn');
function ensureRecropButton(){
  if (!recropBtn){
    recropBtn = document.createElement('button');
    recropBtn.id = 'recrop-btn';
    recropBtn.className = 'btn';
    recropBtn.textContent = 'إعادة قص';
    const actions = document.querySelector('.actions');
    actions?.insertBefore(recropBtn, actions.firstChild);
  }
  recropBtn.disabled = !lastSelectedDataUrl;
}

try { ensureRecropButton(); } catch(_) {}
if (recropBtn) {
  recropBtn.addEventListener('click', () => {
    if (!lastSelectedDataUrl) return;
    openCropper(lastSelectedDataUrl);
  });
}

// زر حذف الصورة
let deleteBtn = document.getElementById('delete-btn');
function ensureDeleteButton(){
  if (!deleteBtn){
    deleteBtn = document.createElement('button');
    deleteBtn.id = 'delete-btn';
    deleteBtn.className = 'btn';
    deleteBtn.textContent = 'حذف الصورة';
    const actions = document.querySelector('.actions');
    // ضع زر الحذف قبل زر إعادة القص ليكون ترتيبه: حذف، إعادة قص، تنزيل
    actions?.insertBefore(deleteBtn, actions.firstChild);
  }
  deleteBtn.disabled = !lastSelectedDataUrl;
}

function clearImage(){
  // مسح اللوحة وإظهار النص التمهيدي
  if (canvas && ctx) drawPlaceholder();
  // تعطيل التنزيل وإعادة القص
  if (downloadBtn) downloadBtn.disabled = true;
  lastSelectedDataUrl = null;
  ensureRecropButton();
  ensureDeleteButton();
  clearStatus();
}

try { ensureDeleteButton(); } catch(_) {}
if (deleteBtn) {
  deleteBtn.addEventListener('click', clearImage);
}

// تنزيل الناتج
async function tryShareImageBlob(blob){
  try{
    const file = new File([blob], 'كُل عام وسعوديتنا بخير.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })){
      await navigator.share({
        files: [file],
        title: 'مولّد صورة أدِيب',
        text: 'حفظ ومشاركة صورتي بإطار اليوم الوطني 🇸🇦',
      });
      return true;
    }
  }catch(err){
    console.warn('Web Share failed or not permitted:', err);
  }
  return false;
}

if (downloadBtn && canvas) {
  downloadBtn.addEventListener('click', () => {
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      // جرّب مشاركة الملف عبر Web Share API (iOS/Android) ليسهل حفظه في الاستديو
      const shared = await tryShareImageBlob(blob);
      if (!shared){
        // بديل آمن: تنزيل الملف محليًا
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'كُل عام وسعوديتنا بخير.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        // افتح نافذة المشاركة بعد بدء التنزيل
        try { openShareModal(); } catch(_) {}
      }
    }, 'image/png');
  });
}

// نموذج تواصل معنا — Supabase أولاً ثم mailto كبديل
const contactForm = document.getElementById('contact-form');

function isSupabaseConfigured(){
  try{
    const cfg = window.APP_CONFIG || {};
    return Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase?.createClient);
  }catch(_){ return false; }
}

function getSupabaseClient(){
  if (!isSupabaseConfigured()) return null;
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// شريط التقدم العلوي العام
const progressBar = document.getElementById('progress-bar');
function showProgress(on){
  if (!progressBar) return;
  if (on){
    progressBar.classList.add('show');
    progressBar.setAttribute('aria-hidden', 'false');
  } else {
    progressBar.classList.remove('show');
    progressBar.setAttribute('aria-hidden', 'true');
  }
}

contactForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const to = form?.dataset?.email || 'clubadeeb@example.com';
  const name = form.querySelector('input[name="name"]')?.value?.trim() || '';
  const email = form.querySelector('input[name="email"]')?.value?.trim() || '';
  const message = form.querySelector('textarea[name="message"]')?.value?.trim() || '';

  // محاولة الإرسال إلى Supabase
  let savedToSupabase = false;
  if (isSupabaseConfigured()){
    try{
      showProgress(true);
      const client = getSupabaseClient();
      const { error } = await client
        .from('contacts')
        .insert([{ name, email, message }]);
      if (error) throw error;
      savedToSupabase = true;
      // عرض نافذة نجاح بدلاً من رسالة نصية
      try { openSuccessModal(); } catch(_) { inform('تم استلام رسالتك بنجاح — شكرًا لتواصلك!'); }
      form.reset();
      showProgress(false);
    }catch(err){
      console.error('Supabase insert error:', err);
      warn('تعذّر الحفظ في قاعدة البيانات — سيتم فتح البريد كبديل');
      showProgress(false);
    }
  }

  // بديل mailto عند عدم التهيئة أو حدوث خطأ
  if (!savedToSupabase){
    showProgress(false);
    const subject = encodeURIComponent(`رسالة من ${name || 'زائر'}`);
    const bodyLines = [
      `الاسم: ${name}`,
      `البريد: ${email}`,
      '',
      'الرسالة:',
      message,
      '',
      '— مرسلة من موقع مولّد صورة أدِيب —'
    ];
    const body = encodeURIComponent(bodyLines.join('\n'));
    const href = `mailto:${to}?subject=${subject}&body=${body}`;
    window.location.href = href;
    inform('تم فتح برنامج البريد لإرسال رسالتك');
    form.reset();
  }
});

// ——— نافذة مشاركة الرابط بعد التنزيل ———
const shareModal = document.getElementById('share-modal');
const shareXBtn = document.getElementById('share-x');
const shareWhatsappBtn = document.getElementById('share-whatsapp');
const shareInstagramBtn = document.getElementById('share-instagram');
const copyLinkBtn = document.getElementById('copy-link');
const copyHintEl = document.getElementById('copy-hint');
const shareCloseBtn = document.getElementById('share-close');
const shareBackdrop = shareModal?.querySelector('.modal-backdrop');

function getShareUrl(){
  try { return window.location.origin + window.location.pathname; } catch(_) { return window.location.href; }
}

function populateShareLinks(){
  const url = encodeURIComponent(getShareUrl());
  const text = encodeURIComponent('جرّبت مولّد صورة أدِيب – كُل عام وسعوديتنا بخير 🇸🇦');
  if (shareXBtn) shareXBtn.href = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
  if (shareWhatsappBtn) shareWhatsappBtn.href = `https://wa.me/?text=${text}%20${url}`;
  // Instagram لا يدعم مشاركة روابط عبر واجهة ويب مباشرة؛ سنعالجها بنسخ الرابط وفتح التطبيق/الموقع.
}

function openShareModal(){
  populateShareLinks();
  if (!shareModal) return;
  shareModal.classList.add('show');
  shareModal.setAttribute('aria-hidden', 'false');
  refreshBodyScrollLock();
}

function closeShareModal(){
  if (!shareModal) return;
  shareModal.classList.remove('show');
  shareModal.setAttribute('aria-hidden', 'true');
  if (copyHintEl) copyHintEl.textContent = '';
  refreshBodyScrollLock();
}

// تمت إزالة زر المشاركة النظامية من الواجهة

copyLinkBtn?.addEventListener('click', async () => {
  const url = getShareUrl();
  try{
    await navigator.clipboard?.writeText(url);
    if (copyHintEl) copyHintEl.textContent = 'تم نسخ الرابط!';
  }catch(_){
    // بديل بسيط إن فشل الوصول للحافظة
    const temp = document.createElement('input');
    temp.value = url;
    document.body.appendChild(temp);
    temp.select();
    try { document.execCommand('copy'); if (copyHintEl) copyHintEl.textContent = 'تم نسخ الرابط!'; } catch(__){ if (copyHintEl) copyHintEl.textContent = url; }
    temp.remove();
  }
});

shareCloseBtn?.addEventListener('click', closeShareModal);
shareBackdrop?.addEventListener('click', closeShareModal);

// مشاركة إنستغرام: انسخ الرابط وافتح instagram.com ليقوم المستخدم باللصق يدويًا
shareInstagramBtn?.addEventListener('click', async (e) => {
  e.preventDefault();
  const url = getShareUrl();
  try { await navigator.clipboard?.writeText(url); if (copyHintEl) copyHintEl.textContent = 'تم نسخ الرابط!'; } catch(_) {}
  window.open('https://instagram.com/', '_blank', 'noopener');
});

// ——— نافذة نجاح إرسال التواصل ———
const successModal = document.getElementById('success-modal');
const successCloseBtn = document.getElementById('success-close');
const successBackdrop = successModal?.querySelector('.modal-backdrop');

function openSuccessModal(){
  if (!successModal) return;
  successModal.classList.add('show');
  successModal.setAttribute('aria-hidden', 'false');
  refreshBodyScrollLock();
}

function closeSuccessModal(){
  if (!successModal) return;
  successModal.classList.remove('show');
  successModal.setAttribute('aria-hidden', 'true');
  refreshBodyScrollLock();
}

successCloseBtn?.addEventListener('click', closeSuccessModal);
successBackdrop?.addEventListener('click', closeSuccessModal);

// ——— عدّاد الزوار وتسجيل الزيارات ———
const visitorCountEl = document.getElementById('visitor-count');

function getOrCreateVisitorId(){
  try{
    let id = localStorage.getItem('visitor_id');
    if (!id){
      id = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem('visitor_id', id);
    }
    return id;
  }catch(_){
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

async function logVisit(){
  if (!isSupabaseConfigured()) return;
  try{
    const client = getSupabaseClient();
    const id = getOrCreateVisitorId();
    const ua = navigator.userAgent || null;
    const path = (location && (location.pathname + location.search)) || '/';
    const ref = document.referrer || null;

    // سجّل الزائر بشكل فريد (إن توفّرت جدول visitors)
    try{
      await client
        .from('visitors')
        .upsert({ id, first_seen: new Date().toISOString(), user_agent: ua }, { onConflict: 'id', ignoreDuplicates: true });
    }catch(_){ /* تجاهل في حال عدم وجود الجدول */ }

    // سجّل الزيارة (page view)
    try{
      await client
        .from('visits')
        .insert([{ visitor_id: id, path, referrer: ref, user_agent: ua }]);
    }catch(_){ /* تجاهل إذا لم يوجد الجدول */ }
  }catch(err){
    console.warn('visit log failed:', err);
  }
}

async function refreshVisitorCount(){
  if (!isSupabaseConfigured() || !visitorCountEl) return;
  const client = getSupabaseClient();
  // حاول أولاً عدّ الزوّار الفريدين
  try{
    const { count: uniqueCount, error } = await client
      .from('visitors')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    if (typeof uniqueCount === 'number'){
      visitorCountEl.textContent = uniqueCount.toLocaleString('ar-EG');
      return;
    }
  }catch(_){ /* تجاهل إن لم يوجد الجدول */ }

  // بديل: عدّ إجمالي الزيارات
  try{
    const { count: totalVisits, error: vErr } = await client
      .from('visits')
      .select('*', { count: 'exact', head: true });
    if (vErr) throw vErr;
    if (typeof totalVisits === 'number'){
      visitorCountEl.textContent = totalVisits.toLocaleString('ar-EG');
      return;
    }
  }catch(_){ /* تجاهل */ }

  // في حال الفشل
  visitorCountEl.textContent = '—';
}

// نفّذ عند التحميل
(async function initVisitors(){
  try{
    await logVisit();
    await refreshVisitorCount();
  }catch(_){ /* تجاهل */ }
})();
