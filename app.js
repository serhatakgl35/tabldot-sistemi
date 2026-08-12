const APP_KEY = 'personel_yasam_v6';
const LEGACY_APP_KEYS = [];

// PBYS şifre sıfırlama SMS servisi.
// Mevcut Kantin10 Google Apps Script Web App adresi varsayılan olarak kullanılır.
// PBYS_SMS_SIFRE_SIFIRLAMA.gs ayrı dağıtılırsa bu URL yeni dağıtım adresiyle değiştirilmelidir.
const PBYS_SMS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbw32Q03nQD1FJ9iSz2LgpB2S_QEzAdSSeLK1K3IIRI39eqOXowlloGVjYRGuoezqrFLlQ/exec';
const PBYS_PAGE_HISTORY_KEY = 'pbys_page_history_v1';

const seed = {
  users: [], mealSelections: {}, expenses: [], payments: [], debts: [], leaveRequests: [], leavePreferences: [],
  leavePlanResults: [], laundry: [], laundryRuns: [], laundryFaults: [], attendance: [], auditLogs: [], weeklyActivities: [], dailyMenus: {},
  settings: {
    systemName: 'PBYS',
    iban: 'TR00 0000 0000 0000 0000 0000 00',
    accountName: 'Ortak Tabldot Hesabı',
    bankName: '',
    weeklyLaundryLimit: 2,
    leavePlanYear: 2027,
    leavePreferencesOpen: true,
    leaveConcurrentPercent: 25,
    roadAllowanceDefault: 2,
    planningSecondChoiceBonus: 20,
    planningFirstChoiceBonus: 0,
    laundryMachineStatus: { 'Beyaz Çamaşır Makinesi': 'active', 'Gri Çamaşır Makinesi': 'active', 'Kurutma Makinesi': 'broken' }
  }
};

let db = loadDB();
let cloudSyncChain = Promise.resolve();
let firebaseBooted = false;
let currentUser = null;
let currentPage = 'dashboard';
let leaveCalendarCursor = startOfMonth(new Date());
let mealWeekCursor = startOfWeek(new Date());
let mealManagementWeekCursor = startOfWeek(new Date());
let cookDateCursor = new Date();
let attendanceDateCursor = new Date();
let attendanceWeekCursor = startOfWeek(new Date());
let balanceViewPeriod = `${new Date().getFullYear()}-${pad(new Date().getMonth()+1)}`;
let laundryWatcherTimer = null;
let laundryCountdownTimer = null;
let laundryVisualExpiredIds = new Set();

const roleNames = { admin: 'Admin', staff: 'Personel', cook: 'Aşçı', tabldot: 'Tabldot Sorumlusu', administrative: 'İdari İşler', commander: 'Karakol Komutanı' };
const rolePermissions = {
  staff: [],
  cook: ['kitchen.view','menu.manage'],
  tabldot: ['meal.manage','finance.manage','reports.view'],
  administrative: ['personnel.view','attendance.view','attendance.manage','leave.view','leave.manage','meal.manage','finance.manage','reports.view'],
  commander: ['personnel.view','attendance.view','leave.view','leave.approve','leave.plan','leave.preference.manage','reports.view'],
  admin: ['*']
};
const mealNames = { breakfast: 'Sabah', dinner: 'Akşam' };
const mealStatusNames = { yes: 'Yiyecek (varsayılan)', no: 'Yemeyecek', duty: 'Görevdeyim / Ayır', leave: 'Yıllık izin · Tabldot dışı', '': 'Yiyecek (varsayılan)' };
const attendanceStatuses = {
  present: { label: 'Mevcut', short: 'M', icon: '✅' },
  work: { label: 'Mesai', short: 'MS', icon: '🕘' },
  watch: { label: 'Nöbetçi', short: 'N', icon: '🛡️' },
  annual_leave: { label: 'Yıllık İzin', short: 'İ', icon: '🏖️' },
  excuse_leave: { label: 'Mazeret İzni', short: 'Mİ', icon: '📅' },
  road_leave: { label: 'Yol İzni', short: 'Yİ', icon: '🛣️' },
  medical: { label: 'Raporlu / İstirahatli', short: 'R', icon: '🏥' },
  duty: { label: 'Görevli', short: 'G', icon: '📍' },
  temporary_duty: { label: 'Geçici Görevli', short: 'GG', icon: '🚗' },
  course: { label: 'Kurs / Eğitim', short: 'K', icon: '📚' },
  referral: { label: 'Sevkli', short: 'S', icon: '🚑' },
  rest: { label: 'Nöbet İstirahati', short: 'Nİ', icon: '😴' },
  other: { label: 'Diğer', short: 'D', icon: '•' }
};

function getNavGroups() {
  const personal = [
    ['dashboard', '⌂', 'Ana Sayfa'],
    ['my-meals', '🍽', 'Yemek Tercihim'],
    ['my-finance', '₺', 'Borç ve Ödemelerim'],
    ['balance-view', '📊', 'Tabldot Bilançosu'],
    ['my-leaves', '📅', 'İzinlerim'],
    ['leave-preference', '🗓', 'Yıllık İzin Tercihim'],
    ['laundry', '🧺', 'Çamaşır Sayacı'],
    ['profile', '👤', 'Profilim']
  ];
  let kitchenInsert = 1;
  if (hasPermission('menu.manage')) personal.splice(kitchenInsert++, 0, ['daily-menu-management', '🍲', 'Yemek Yönetimi']);
  if (hasPermission('kitchen.view')) personal.splice(kitchenInsert++, 0, ['cook-dashboard', '👨‍🍳', 'Aşçı Yemek Ekranı']);

  const management = [];
  if (hasPermission('personnel.view')) management.push(['members', '👥', 'Personel Listesi']);
  if (hasPermission('attendance.manage')) management.push(['attendance-management', '📝', 'Yoklama Girişi']);
  if (hasPermission('attendance.view')) management.push(['attendance-overview', '📋', 'Yoklama Özeti']);
  if (hasPermission('meal.manage')) management.push(['meal-management', '🍲', 'Tabldot Yemek Yönetimi']);
  if (hasPermission('finance.manage')) management.push(['finance-management', '📊', 'Tabldot Bilanço']);
  if (hasPermission('leave.view')) management.push(['leave-management', '🧭', 'İzin Yönetimi']);
  if (hasPermission('leave.plan')) management.push(['leave-planning', '📈', 'Yıllık İzin Anket Sonuçları']);
  if (hasPermission('reports.view')) management.push(['reports', '📊', 'Raporlar']);
  if (isAdmin()) management.push(['settings', '⚙', 'Sistem Ayarları']);
  return { personal, management };
}
function getNavItems() {
  const { personal, management } = getNavGroups();
  if (isCommander()) return [personal[0], ...management, ...personal.slice(1)];
  return [...personal, ...management];
}
function createEmptyDB() {
  return {
    users: [], mealSelections: {}, expenses: [], payments: [], debts: [], leaveRequests: [], leavePreferences: [],
    leavePlanResults: [], laundry: [], laundryRuns: [], laundryFaults: [], attendance: [], auditLogs: [], weeklyActivities: [], dailyMenus: {}, settings: { ...seed.settings, systemName: 'PBYS' }
  };
}
function loadDB() {
  try {
    const stored = JSON.parse(localStorage.getItem(APP_KEY));
    if (stored) return ensureV6Data(stored);
  } catch (_) {}
  return createEmptyDB();
}
function ensureV6Data(data) {
  data ||= createEmptyDB();
  data.users ||= [];
  data.mealSelections ||= {};
  data.expenses ||= [];
  data.payments ||= [];
  data.debts ||= [];
  data.leaveRequests ||= [];
  data.leavePreferences ||= [];
  data.leavePlanResults ||= [];
  data.leavePreferences = data.leavePreferences.map(normalizePreferenceRecord);
  data.leavePlanResults = data.leavePlanResults.map(normalizeLeavePlanResult);
  data.laundry ||= [];
  data.laundryRuns ||= [];
  data.laundryFaults ||= [];
  data.attendance ||= [];
  data.auditLogs ||= [];
  data.weeklyActivities ||= [];
  data.dailyMenus ||= {};
  data.settings = { ...seed.settings, systemName: 'PBYS', ...(data.settings || {}) };
  const roleMap = { admin: ['staff','admin'], staff: ['staff'], cook: ['staff','cook'], tabldot: ['staff','tabldot'], administrative: ['staff','administrative'], commander: ['staff','commander'] };
  data.users.forEach(u => {
    // V8.2: Müdür rolü kaldırıldı. Eski manager kayıtları güvenli biçimde Personel rolüne düşürülür.
    if (u.role === 'manager') u.role = 'staff';
    u.roles = Array.isArray(u.roles) && u.roles.length ? u.roles.filter(r => r !== 'manager') : (roleMap[u.role] || ['staff']);
    if (!u.roles.length) u.roles = ['staff'];
    if (!u.roles.includes('staff')) u.roles.unshift('staff');
    u.extraPermissions ||= [];
    u.annualAllowance = Number(u.annualAllowance ?? 30);
    u.roadAllowance = Number(u.roadAllowance ?? 2);
    u.usedLeave = Number(u.usedLeave ?? 0);
    u.usedRoadLeave = Number(u.usedRoadLeave ?? 0);
    u.approved = Boolean(u.approved);
    u.rejected = Boolean(u.rejected);
    delete u.password;
  });
  return data;
}
function setCloudStatus(state, text) {
  const el = document.getElementById('cloudStatus');
  if (!el) return;
  el.classList.remove('online','offline');
  if (state) el.classList.add(state);
  const label = el.querySelector('span:last-child');
  if (label) label.textContent = text;
}
function applyCloudState(nextState, rerender = true) {
  db = ensureV6Data(nextState);
  localStorage.setItem(APP_KEY, JSON.stringify(db));
  const authUid = window.FirebaseBridge?.currentAuthUser()?.uid;
  if (authUid) {
    const fresh = db.users.find(u => u.uid === authUid);
    if (fresh) currentUser = fresh;
  }
  if (rerender && currentUser) {
    renderNav();
    renderPage();
  }
}
function saveDB() {
  localStorage.setItem(APP_KEY, JSON.stringify(db));
  if (!firebaseBooted || !currentUser || !window.FirebaseBridge) return;
  const snapshot = structuredClone(db);
  setCloudStatus('', 'Senkronize ediliyor');
  cloudSyncChain = cloudSyncChain
    .then(() => window.FirebaseBridge.saveState(snapshot))
    .then(() => setCloudStatus('online', 'Firestore bağlı'))
    .catch(error => {
      console.error(error);
      setCloudStatus('offline', 'Senkron hatası');
      toast(window.FirebaseBridge.errorMessage(error));
    });
}
function normalizePhone(value) { let d = String(value || '').replace(/\D/g, ''); if (d.startsWith('90') && d.length === 12) d = '0' + d.slice(2); if (d.length === 10 && d.startsWith('5')) d = '0' + d; return d; }
function money(value) { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value || 0)); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[s])); }
function pad(value) { return String(value).padStart(2, '0'); }
function toISO(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function parseISO(value) { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function addDays(date, amount) { const next = new Date(date); next.setDate(next.getDate() + amount); return next; }
function startOfWeek(date) { const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12); next.setDate(next.getDate() - ((next.getDay() + 6) % 7)); return next; }
function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1, 12); }
function formatDate(value) { return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(parseISO(value)); }
function formatShortDate(value) { return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parseISO(value)); }
function formatDayDate(value) { return new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(parseISO(value)); }
function daysBetween(start, end) { return Math.max(1, Math.round((parseISO(end) - parseISO(start)) / 86400000) + 1); }
function initials(name) { return String(name).split(' ').map(x => x[0]).filter(Boolean).slice(0, 2).join('').toUpperCase(); }
function getUser(id) { return db.users.find(u => u.id === Number(id)); }
function userRoles(user = currentUser) { return user ? (Array.isArray(user.roles) && user.roles.length ? user.roles : [user.role || 'staff']) : []; }
function hasRole(role, user = currentUser) { return userRoles(user).includes(role); }
function hasPermission(permission, user = currentUser) {
  if (!user) return false;
  const roles = userRoles(user);
  if (roles.includes('admin')) return true;
  const permissions = new Set(user.extraPermissions || []);
  roles.forEach(role => (rolePermissions[role] || []).forEach(p => permissions.add(p)));
  return permissions.has(permission);
}
function hasManagementPermission() { return currentUser && ['personnel.view','attendance.view','meal.manage','finance.manage','leave.view','leave.plan','reports.view'].some(p => hasPermission(p)); }
function hasCookPermission() { return hasPermission('kitchen.view'); }
function canEditPaymentStatus() { return isAdmin() || hasRole('tabldot'); }
function hasDashboardEditorPermission() { return hasPermission('activity.manage') || hasPermission('menu.manage'); }
function isAdmin() { return hasRole('admin'); }
function canManageLeavePreferences() { return hasPermission('leave.preference.manage'); }
function userRoleLabels(user = currentUser) { return userRoles(user).map(r => roleNames[r] || r).join(' + '); }
function logAudit(action, details) { db.auditLogs ||= []; db.auditLogs.unshift({ id: Date.now() + Math.random(), at: new Date().toISOString(), userId: currentUser?.id || null, action, details }); db.auditLogs = db.auditLogs.slice(0, 500); }
function approvedUsers() { return db.users.filter(u => u.approved && !u.rejected); }
function planningUsers() { return approvedUsers(); }

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function showModal(title, body) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalBackdrop').classList.remove('hidden');
}
function closeModal() { document.getElementById('modalBackdrop').classList.add('hidden'); }
function statusBadge(status) {
  const map = {
    approved: ['success', 'Onaylandı'], pending: ['warning', 'Onay Bekliyor'], rejected: ['danger', 'Reddedildi'],
    report: ['danger', 'Sağlık İzni'], paid: ['success', 'Ödendi'], partial: ['warning', 'Kısmi Ödendi'], unpaid: ['danger', 'Ödenmedi'],
    submitted: ['info', 'Tercih Verildi'], unsubmitted: ['neutral', 'Tercih Yok'], allocated1: ['success', '1. Tercih'],
    allocated2: ['info', '2. Tercih'], waitlist: ['warning', 'Bekleme Listesi'], published: ['success', 'Açıklandı'], accepted: ['success','Kabul Edildi'], reselect: ['warning','Tekrar Tercih İstendi'], draft: ['neutral','Taslak'], warning: ['warning','Tekrar Tercih İstendi']
  };
  const [cls, label] = map[status] || ['neutral', status || '—'];
  return `<span class="status ${cls}">${label}</span>`;
}
function metric(icon, label, value, sub) { return `<div class="card metric-card"><div class="metric-icon">${icon}</div><div><span>${label}</span><strong>${value}</strong><small>${sub}</small></div></div>`; }
function quick(icon, title, sub, action) { return `<button class="quick-item" onclick="${action}" style="width:100%;text-align:left"><div class="quick-item-main"><div class="metric-icon">${icon}</div><div><strong>${title}</strong><span>${sub}</span></div></div><b>›</b></button>`; }
function notice(title, sub) { return `<div class="quick-item"><div><strong>${title}</strong><span>${sub}</span></div></div>`; }


async function registerNotificationWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  try { return await navigator.serviceWorker.register('./sw.js?v=9.2.5'); }
  catch (error) { console.warn('Bildirim service worker kaydı yapılamadı:', error); return null; }
}
async function requestSiteNotifications() {
  if (!window.isSecureContext) return toast('Tarayıcı bildirimleri HTTPS aktif olduktan sonra kullanılabilir.');
  if (!('Notification' in window)) return toast('Bu tarayıcı web bildirimlerini desteklemiyor.');
  try {
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission === 'granted') {
      await registerNotificationWorker();
      toast('Bildirimler açıldı. Çamaşır süresi bittiğinde tarayıcı bildirimi alacaksınız.');
      checkLaundryTimers();
    } else if (permission === 'denied') toast('Bildirim izni tarayıcı tarafından engellendi. Site ayarlarından yeniden açabilirsiniz.');
    else toast('Bildirim izni verilmedi.');
  } catch (error) { console.error(error); toast('Bildirim izni alınamadı.'); }
}
function laundryNotificationKey(run) { return `pbys_laundry_notified_${run.id}`; }
async function sendSiteNotification(title, body, tag='pbys') {
  if (!window.isSecureContext || !('Notification' in window) || Notification.permission !== 'granted') return false;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await registerNotificationWorker();
      if (reg) await reg.showNotification(title, { body, tag, renotify: true, data: { url: location.href } });
      else new Notification(title, { body, tag });
    } else new Notification(title, { body, tag });
    return true;
  } catch (error) { console.warn('Bildirim gönderilemedi:', error); return false; }
}
function updateLaundryCountdowns() {
  document.querySelectorAll('[data-run-end]').forEach(el => {
    const ms = new Date(el.dataset.runEnd).getTime() - Date.now();
    if (ms <= 0) { el.textContent = 'Tamamlandı'; return; }
    const totalSec = Math.ceil(ms / 1000), min = Math.floor(totalSec / 60), sec = totalSec % 60;
    el.textContent = `${min}:${String(sec).padStart(2,'0')}`;
  });
}
async function checkLaundryTimers() {
  if (!currentUser) return;
  db.laundryRuns ||= [];
  const now = Date.now();
  let changed = false;
  let visualRefreshNeeded = false;

  // Bir kullanıcının yalnızca kendi sayaç kaydı kendisi tarafından güncellenir.
  for (const run of db.laundryRuns) {
    if (run.status === 'running' && new Date(run.endAt).getTime() <= now) {
      if (!laundryVisualExpiredIds.has(run.id)) {
        laundryVisualExpiredIds.add(run.id);
        visualRefreshNeeded = true;
      }
      if (run.userId === currentUser.id) {
        run.status = 'finished';
        run.finishedAt = run.finishedAt || run.endAt || new Date().toISOString();
        changed = true;
      }
    }
  }

  const mine = db.laundryRuns.filter(run =>
    run.userId === currentUser.id &&
    laundryEffectiveStatus(run) === 'finished' &&
    !run.clearedAt
  );
  for (const run of mine) {
    const key = laundryNotificationKey(run);
    if (localStorage.getItem(key)) continue;
    const sent = await sendSiteNotification('Çamaşır makinesi tamamlandı', `${run.machine} programı bitti. Çamaşırınızı alabilirsiniz.`, `laundry-${run.id}`);
    if (sent) localStorage.setItem(key, '1');
  }

  if (changed) {
    logAudit('laundry.finish', 'Kullanıcının süresi dolan çamaşır sayacı tamamlandı olarak işaretlendi.');
    saveDB();
  }
  if ((changed || visualRefreshNeeded) && currentPage === 'laundry') renderLaundry();
  updateLaundryCountdowns();
}
function startLaundryTimerWatcher() {
  stopLaundryTimerWatcher();
  checkLaundryTimers();
  laundryWatcherTimer = setInterval(checkLaundryTimers, 5000);
  laundryCountdownTimer = setInterval(updateLaundryCountdowns, 1000);
}
function stopLaundryTimerWatcher() {
  if (laundryWatcherTimer) clearInterval(laundryWatcherTimer);
  if (laundryCountdownTimer) clearInterval(laundryCountdownTimer);
  laundryWatcherTimer = null; laundryCountdownTimer = null;
}

function firebaseReadyPromise() {
  if (window.FirebaseBridge?.ready) return Promise.resolve();
  return new Promise(resolve => window.addEventListener('firebase-ready', resolve, { once: true }));
}
async function bootFirebase() {
  try {
    await firebaseReadyPromise();
    firebaseBooted = true;
    setCloudStatus('', 'Firestore kontrol ediliyor');
    await window.FirebaseBridge.ensureSettings();
    const hasAdmin = await window.FirebaseBridge.hasAnyAdmin();
    document.getElementById('bootstrapBox').classList.toggle('hidden', hasAdmin);
    const authUser = await window.FirebaseBridge.waitForAuthState();
    if (authUser) {
      const profile = await window.FirebaseBridge.getUserProfile(authUser.uid);
      if (profile?.approved && !profile?.rejected) await enterAuthenticatedApp(profile);
      else await window.FirebaseBridge.signOut();
    }
    setCloudStatus('online', 'Firestore bağlı');
  } catch (error) {
    console.error(error);
    setCloudStatus('offline', 'Firebase bağlantı hatası');
    toast(window.FirebaseBridge?.errorMessage(error) || 'Firebase bağlantısı kurulamadı.');
  }
}
async function enterAuthenticatedApp(profile) {
  setCloudStatus('', 'Veriler yükleniyor');
  const cloudState = await window.FirebaseBridge.loadState();
  applyCloudState(cloudState, false);
  const freshProfile = db.users.find(u => u.uid === profile.uid) || profile;
  if (!freshProfile.approved || freshProfile.rejected) {
    await window.FirebaseBridge.signOut();
    throw new Error(freshProfile.rejected ? 'Üyelik başvurunuz reddedildi.' : 'Üyeliğiniz henüz onaylanmadı.');
  }
  login(freshProfile);
  window.FirebaseBridge.startRealtime(nextState => applyCloudState(nextState, true));
  setCloudStatus('online', 'Firestore bağlı');
}
function openBootstrapModal() {
  showModal('İlk Admin Hesabını Oluştur', `<form id="bootstrapForm" class="form-grid">
    <label>Ad soyad<input name="name" required></label><label>Telefon<input name="phone" type="tel" required></label>
    <label class="span-2">Görev / rütbe<input name="title" value="Sistem Yöneticisi" required></label>
    <label class="span-2">Şifre<input name="password" type="password" minlength="6" required></label>
    <div class="span-2"><button class="btn btn-warning btn-block">İlk Admini Oluştur</button></div>
  </form>`);
  document.getElementById('bootstrapForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      setCloudStatus('', 'Admin oluşturuluyor');
      const profile = await window.FirebaseBridge.bootstrapAdmin({ name: f.get('name').trim(), phone: normalizePhone(f.get('phone')), title: f.get('title').trim(), password: f.get('password') });
      closeModal();
      document.getElementById('bootstrapBox').classList.add('hidden');
      await enterAuthenticatedApp(profile);
      toast('İlk admin hesabı oluşturuldu.');
    } catch (error) { toast(window.FirebaseBridge.errorMessage(error)); setCloudStatus('offline', 'Kurulum hatası'); }
  });
}
function forgotPasswordMessage(message, type = '') {
  const el = document.getElementById('forgotPasswordMessage');
  if (!el) return;
  el.textContent = message || '';
  el.className = `forgot-password-message ${type}`.trim();
}
function toggleForgotPasswordBox() {
  const box = document.getElementById('forgotPasswordBox');
  if (!box) return;
  const opening = box.classList.contains('hidden');
  box.classList.toggle('hidden');
  forgotPasswordMessage('');
  if (opening) {
    const phone = document.getElementById('loginPhone')?.value || '';
    const target = document.getElementById('forgotPhone');
    if (target) {
      target.value = phone;
      setTimeout(() => target.focus(), 50);
    }
  }
}
function normalizeSmsPhone10(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('90')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
}
async function pbysSmsRequest(payload) {
  if (!PBYS_SMS_WEB_APP_URL || PBYS_SMS_WEB_APP_URL.includes('BURAYA')) throw new Error('SMS Web App adresi tanımlı değil.');
  const response = await fetch(PBYS_SMS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, system: 'PBYS' })
  });
  return await response.json();
}
async function sendForgotPasswordCode() {
  const phoneInput = document.getElementById('forgotPhone');
  const button = document.getElementById('forgotSendBtn');
  const phone10 = normalizeSmsPhone10(phoneInput?.value);
  if (phone10.length !== 10 || !phone10.startsWith('5')) return forgotPasswordMessage('Geçerli bir cep telefonu numarası girin.', 'error');
  forgotPasswordMessage('');
  button.disabled = true;
  const oldText = button.textContent;
  button.textContent = 'Kod gönderiliyor…';
  try {
    const data = await pbysSmsRequest({ action: 'pbysSifreKodGonder', telefon: phone10 });
    if (data?.success === false) throw new Error(data.message || 'Doğrulama kodu gönderilemedi.');
    document.getElementById('forgotVerifyArea')?.classList.remove('hidden');
    forgotPasswordMessage(data?.message || 'Telefon kayıtlıysa doğrulama kodu SMS ile gönderildi.', 'success');
    setTimeout(() => document.getElementById('forgotCode')?.focus(), 80);
  } catch (error) {
    console.error(error);
    forgotPasswordMessage(error?.message || 'SMS servisine bağlanılamadı.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
}
async function verifyForgotPasswordCode() {
  const phone10 = normalizeSmsPhone10(document.getElementById('forgotPhone')?.value);
  const code = String(document.getElementById('forgotCode')?.value || '').trim();
  const password = String(document.getElementById('forgotNewPassword')?.value || '');
  const button = document.getElementById('forgotVerifyBtn');
  if (phone10.length !== 10 || !phone10.startsWith('5')) return forgotPasswordMessage('Geçerli bir cep telefonu numarası girin.', 'error');
  if (!/^\d{6}$/.test(code)) return forgotPasswordMessage('SMS ile gelen 6 haneli kodu girin.', 'error');
  if (password.length < 6) return forgotPasswordMessage('Yeni şifre en az 6 karakter olmalıdır.', 'error');
  button.disabled = true;
  const oldText = button.textContent;
  button.textContent = 'Doğrulanıyor…';
  try {
    const data = await pbysSmsRequest({ action: 'pbysSifreKodDogrula', telefon: phone10, kod: code, yeniSifre: password });
    if (!data?.success) throw new Error(data?.message || 'Kod doğrulanamadı.');
    const loginPhone = document.getElementById('loginPhone');
    const loginPassword = document.getElementById('loginPassword');
    if (loginPhone) loginPhone.value = `0${phone10}`;
    if (loginPassword) loginPassword.value = password;
    document.getElementById('forgotCode').value = '';
    document.getElementById('forgotNewPassword').value = '';
    forgotPasswordMessage(data.message || 'Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.', 'success');
    setTimeout(() => document.getElementById('forgotPasswordBox')?.classList.add('hidden'), 1100);
  } catch (error) {
    console.error(error);
    forgotPasswordMessage(error?.message || 'Şifre değiştirilemedi.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
}

function init() {
  document.querySelectorAll('.auth-tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('loginForm').classList.toggle('hidden', btn.dataset.authTab !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', btn.dataset.authTab !== 'register');
  }));
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const phone = normalizePhone(document.getElementById('loginPhone').value);
    const password = document.getElementById('loginPassword').value;
    try {
      setCloudStatus('', 'Giriş yapılıyor');
      const authUser = await window.FirebaseBridge.signIn(phone, password);
      const profile = await window.FirebaseBridge.getUserProfile(authUser.uid);
      if (!profile) { await window.FirebaseBridge.signOut(); return toast('Kullanıcı profili bulunamadı.'); }
      if (profile.rejected) { await window.FirebaseBridge.signOut(); return toast('Üyelik başvurunuz reddedilmiş.'); }
      if (!profile.approved) { await window.FirebaseBridge.signOut(); return toast('Üyeliğiniz henüz admin tarafından onaylanmadı.'); }
      await enterAuthenticatedApp(profile);
    } catch (error) { setCloudStatus('offline', 'Giriş başarısız'); toast(window.FirebaseBridge.errorMessage(error)); }
  });
  document.getElementById('registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const phone = normalizePhone(document.getElementById('registerPhone').value);
    try {
      setCloudStatus('', 'Kayıt oluşturuluyor');
      await window.FirebaseBridge.registerPending({
        name: document.getElementById('registerName').value.trim(), phone,
        title: document.getElementById('registerTitle').value.trim(),
        password: document.getElementById('registerPassword').value
      });
      e.target.reset();
      toast('Başvurunuz Firestore’a kaydedildi. Admin onayından sonra giriş yapabilirsiniz.');
      document.querySelector('[data-auth-tab="login"]').click();
      setCloudStatus('online', 'Firestore bağlı');
    } catch (error) { setCloudStatus('offline', 'Kayıt başarısız'); toast(window.FirebaseBridge.errorMessage(error)); }
  });
  document.getElementById('bootstrapBtn').addEventListener('click', openBootstrapModal);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  document.getElementById('menuBtn').addEventListener('click', () => sidebar.classList.toggle('open'));
  sidebarBackdrop?.addEventListener('click', () => sidebar.classList.remove('open'));
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });
  document.getElementById('notificationBtn').addEventListener('click', requestSiteNotifications);

  document.getElementById('forgotPasswordBtn')?.addEventListener('click', toggleForgotPasswordBox);
  document.getElementById('forgotSendBtn')?.addEventListener('click', sendForgotPasswordCode);
  document.getElementById('forgotVerifyBtn')?.addEventListener('click', verifyForgotPasswordCode);
  document.getElementById('forgotCode')?.addEventListener('input', e => {
    e.target.value = String(e.target.value || '').replace(/\D/g, '').slice(0, 6);
  });
  document.getElementById('forgotNewPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); verifyForgotPasswordCode(); }
  });

  window.addEventListener('popstate', event => {
    if (!currentUser) return;
    const page = event.state?.pbysPage;
    if (page) {
      navigateToPage(page, { fromPopState: true });
      if (page === 'dashboard' && !event.state?.pbysGuard) {
        history.pushState({ ...(event.state || {}), pbys: true, pbysPage: 'dashboard', pbysGuard: true }, '', `${location.pathname}${location.search}#dashboard`);
      }
      return;
    }
    navigateToPage('dashboard', { replace: true });
    history.pushState({ pbys: true, pbysPage: 'dashboard', pbysGuard: true }, '', `${location.pathname}${location.search}#dashboard`);
  });

  registerNotificationWorker();
  document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
  bootFirebase();
}

function pageFromHistoryState() {
  const page = history.state?.pbysPage || sessionStorage.getItem(PBYS_PAGE_HISTORY_KEY) || 'dashboard';
  const valid = new Set(getNavItems().map(x => x[0]));
  return valid.has(page) ? page : 'dashboard';
}
function syncPageHistory(page, replace = false) {
  if (!currentUser) return;
  sessionStorage.setItem(PBYS_PAGE_HISTORY_KEY, page);
  const state = { ...(history.state || {}), pbys: true, pbysPage: page };
  const url = `${location.pathname}${location.search}#${encodeURIComponent(page)}`;
  if (replace) history.replaceState(state, '', url);
  else history.pushState(state, '', url);
}
function login(user) {
  currentUser = user;
  document.getElementById('authView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');
  document.getElementById('sidebarName').textContent = user.name;
  document.getElementById('sidebarRole').textContent = userRoleLabels(user) + (hasManagementPermission() || hasDashboardEditorPermission() ? ' · Yetkili hesap' : hasCookPermission() ? ' · Mutfak görünümü aktif' : '');
  document.getElementById('sidebarAvatar').textContent = initials(user.name);
  document.getElementById('topAvatar').textContent = initials(user.name);

  const hashPage = decodeURIComponent(String(location.hash || '').replace(/^#/, ''));
  const valid = new Set(getNavItems().map(x => x[0]));
  currentPage = valid.has(hashPage) ? hashPage : pageFromHistoryState();
  renderNav();
  renderPage();
  syncPageHistory(currentPage, true);
  // İlk geri tuşunun siteden çıkmak yerine PBYS içinde yakalanması için koruma kaydı.
  if (currentPage === 'dashboard') {
    history.pushState({ ...(history.state || {}), pbys: true, pbysPage: 'dashboard', pbysGuard: true }, '', `${location.pathname}${location.search}#dashboard`);
  }
  startLaundryTimerWatcher();
}
async function logout() {
  stopLaundryTimerWatcher();
  try { window.FirebaseBridge?.stopRealtime(); await window.FirebaseBridge?.signOut(); } catch (_) {}
  currentUser = null;
  sessionStorage.removeItem(PBYS_PAGE_HISTORY_KEY);
  history.replaceState({}, '', `${location.pathname}${location.search}`);
  document.getElementById('appView').classList.add('hidden');
  document.getElementById('authView').classList.remove('hidden');
  document.getElementById('loginForm').reset();
  setCloudStatus('online', 'Firestore bağlı');
}
function navIconSvg(id, fallback = '') {
  const icons = {
    dashboard:'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></svg>',
    members:'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    'attendance-management':'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 4h16v16H4z"/><path d="M8 2v4M16 2v4M4 9h16M8 13h3M8 17h6"/></svg>',
    'attendance-overview':'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M9 5h11M9 12h11M9 19h11"/><path d="m3 5 1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2"/></svg>',
    'meal-management':'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 3v7a3 3 0 0 0 3 3V3M7 13v8M18 3v18M14 8c0-3 1.5-5 4-5v8c-2.5 0-4-1-4-3Z"/></svg>',
    'cook-dashboard':'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M6 11h12l2 9H4l2-9Z"/><path d="M8 11V8a4 4 0 0 1 8 0v3M9 4.5 7 2M15 4.5 17 2"/></svg>',
    'daily-menu-management':'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    'balance-view':'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m3 6 6-3 6 4 6-4"/></svg>',
    'finance-management':'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m3 6 6-3 6 4 6-4"/></svg>',
    'leave-management':'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/></svg>',
    'leave-planning':'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/><path d="m4 7 6-4 6 7 5-4"/></svg>',
    reports:'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 13h8M8 17h6M8 9h2"/></svg>',
    settings:'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.5v-.1A1.7 1.7 0 0 0 8.4 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2V9.5h.3A1.7 1.7 0 0 0 4 8.4a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.46 3.6l.06.06A1.7 1.7 0 0 0 8.4 4a1.7 1.7 0 0 0 1-.6A1.7 1.7 0 0 0 9.8 2.3V2h4.1v.3A1.7 1.7 0 0 0 15 4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.4a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.3v4.1h-.3a1.7 1.7 0 0 0-1.7 1.1Z"/></svg>',
    'my-meals':'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 3v7a3 3 0 0 0 3 3V3M7 13v8M18 3v18M14 8c0-3 1.5-5 4-5v8c-2.5 0-4-1-4-3Z"/></svg>',
    'my-finance':'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M7 4h10M7 9h8M9 2v20M5 14h9a4 4 0 0 1 0 8H8"/></svg>',
    'my-leaves':'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h3M8 17h6"/></svg>',
    'leave-preference':'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m8 15 2 2 5-5"/></svg>',
    laundry:'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="14" r="5"/><path d="M7 6h.01M10 6h3"/></svg>',
    profile:'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>'
  };
  return icons[id] || `<span>${fallback}</span>`;
}

function renderNav() {
  const nav = document.getElementById('mainNav');
  const items = getNavItems();
  const { personal, management } = getNavGroups();
  const managementIds = new Set(management.map(x => x[0]));
  const personalIds = new Set(personal.map(x => x[0]));
  let managementLabelShown = false;
  let personalLabelShown = false;
  let kitchenLabelShown = false;

  nav.innerHTML = items.map(([id, icon, label]) => {
    let prefix = '';
    if (managementIds.has(id) && !managementLabelShown) {
      prefix += '<div class="nav-section-label">Yönetim</div>';
      managementLabelShown = true;
    }
    if (isCommander() && id !== 'dashboard' && personalIds.has(id) && !personalLabelShown) {
      prefix += '<div class="nav-section-label">Kişisel İşlemler</div>';
      personalLabelShown = true;
    }
    if (!isCommander() && ['daily-menu-management','cook-dashboard'].includes(id) && !kitchenLabelShown) {
      prefix += '<div class="nav-section-label">Mutfak</div>';
      kitchenLabelShown = true;
    }
    return `${prefix}<button class="nav-item ${id === currentPage ? 'active' : ''}" data-page="${id}"><span class="nav-icon">${navIconSvg(id, icon)}</span><span class="nav-label">${label}</span></button>`;
  }).join('');

  nav.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => {
    navigateToPage(btn.dataset.page);
  }));
}
function renderPage() {
  const titles = Object.fromEntries(getNavItems().map(x => [x[0], x[2]]));
  document.getElementById('pageTitle').textContent = titles[currentPage] || 'Panel';
  const pages = {
    dashboard: renderDashboard,
    members: renderMembers,
    'my-meals': renderMyMeals,
    'meal-management': renderMealManagement,
    'cook-dashboard': renderCookDashboard,
    'daily-menu-management': renderDailyMenuManagement,
    'attendance-management': renderAttendanceManagement,
    'attendance-overview': renderAttendanceOverview,
    'my-finance': renderMyFinance,
    'balance-view': renderBalanceView,
    'finance-management': renderFinanceManagement,
    'my-leaves': renderMyLeaves,
    'leave-management': renderLeaveManagement,
    'leave-preference': renderMyLeavePreference,
    'leave-planning': renderLeavePlanning,
    laundry: renderLaundry,
    reports: renderReports,
    settings: renderSettings,
    profile: renderProfile
  };
  (pages[currentPage] || renderDashboard)();
}
function navigateToPage(page, { replace = false, fromPopState = false } = {}) {
  const valid = new Set(getNavItems().map(x => x[0]));
  const target = valid.has(page) ? page : 'dashboard';
  currentPage = target;
  document.getElementById('sidebar')?.classList.remove('open');
  renderNav();
  renderPage();
  if (!fromPopState) syncPageHistory(target, replace);
}
function goPage(page) { navigateToPage(page); }

function concurrentLeaveCapacity() {
  const total = approvedUsers().length;
  return Math.max(1, Math.floor(total * Number(db.settings.leaveConcurrentPercent || 25) / 100));
}
function elapsedApprovedLeaveDays(record, today = toISO(new Date())) {
  if (!record || record.status !== 'approved' || !record.start || !record.end) return 0;
  // İzin günü, ancak o gün tamamlandıktan sonra "kullanılmış" sayılır.
  // Örn. başlangıç 10 Ağustos ise 10 Ağustos günü 0; 11 Ağustos günü 1 gün kullanılmış görünür.
  if (today <= record.start) return 0;
  const yesterday = toISO(addDays(parseISO(today), -1));
  const usedEnd = record.end < yesterday ? record.end : yesterday;
  if (usedEnd < record.start) return 0;
  return daysBetween(record.start, usedEnd);
}
function getApprovedAnnualDays(userId, futureToo = true) {
  return db.leaveRequests
    .filter(x => x.userId === Number(userId) && x.status === 'approved' && x.type === 'Yıllık İzin')
    .reduce((sum, x) => sum + (futureToo ? Number(x.days || daysBetween(x.start, x.end)) : elapsedApprovedLeaveDays(x)), 0);
}
function getApprovedRoadDays(userId, futureToo = true) {
  return db.leaveRequests
    .filter(x => x.userId === Number(userId) && x.status === 'approved' && x.type === 'Yol İzni')
    .reduce((sum, x) => sum + (futureToo ? Number(x.days || daysBetween(x.start, x.end)) : elapsedApprovedLeaveDays(x)), 0);
}
function getUsedLeaveRanges(userId, type = 'Yıllık İzin') {
  const today = toISO(new Date());
  const yesterday = toISO(addDays(parseISO(today), -1));
  return db.leaveRequests
    .filter(x => x.userId === Number(userId) && x.status === 'approved' && x.type === type && x.start < today)
    .map(x => {
      const usedEnd = x.end < yesterday ? x.end : yesterday;
      const usedDays = usedEnd >= x.start ? daysBetween(x.start, usedEnd) : 0;
      return { ...x, usedEnd, usedDays };
    })
    .filter(x => x.usedDays > 0)
    .sort((a,b) => a.start.localeCompare(b.start));
}
function leaveStatusBadge(request) {
  if (!request || request.status !== 'approved') return statusBadge(request?.status);
  const today = toISO(new Date());
  if (today <= request.start) return statusBadge('approved');
  if (today > request.end) return '<span class="status success">İzin Kullanıldı</span>';
  return '<span class="status info">İzin Kullanılıyor</span>';
}
function getRoadRemaining(user) {
  return Math.max(0, Number(user.roadAllowance ?? 2) - Number(user.usedRoadLeave || 0) - getApprovedRoadDays(user.id, false));
}
function isApprovedAnnualLeaveOnDate(userId, date) {
  return db.leaveRequests.some(x => x.userId === Number(userId) && x.status === 'approved' && x.type === 'Yıllık İzin' && x.start <= date && x.end >= date);
}
function effectiveMealStatus(userId, date, meal) {
  if (isApprovedAnnualLeaveOnDate(userId, date)) return 'leave';
  const explicit = getMealDay(userId, date)[meal];
  if (explicit === 'no' || explicit === 'duty') return explicit;
  return 'yes';
}
function isBillableTabldotSlot(userId, date) {
  // Ortak tabldot giderinden yalnızca onaylı yıllık izin günleri düşülür.
  // "Yemeyeceğim" tercihi aşçı sayısını azaltır ancak mali payı azaltmaz.
  return !isApprovedAnnualLeaveOnDate(userId, date);
}
function tabldotMealCountForRange(userId, start, end) {
  let count = 0;
  dateRange(start, end).forEach(date => {
    if (isBillableTabldotSlot(userId, date)) count += 2; // Sabah + Akşam
  });
  return count;
}
function preferenceDurationForDate(dateValue) {
  if (!dateValue) return 0;
  const month = parseISO(dateValue).getMonth() + 1;
  return [6,7,8,9].includes(month) ? 20 : 10;
}
function preferenceEndForStart(start) {
  const days = preferenceDurationForDate(start);
  return days ? toISO(addDays(parseISO(start), days - 1)) : '';
}
function preferenceSeason(dateValue) {
  if (!dateValue) return '';
  const month = parseISO(dateValue).getMonth() + 1;
  return [6,7,8,9].includes(month) ? 'summer' : 'winter';
}
function isValidPreferenceSeason(dateValue, season) {
  return Boolean(dateValue) && preferenceSeason(dateValue) === season;
}
function normalizePreferenceRecord(pref) {
  if (!pref) return null;
  if (pref.winterFirstStart || pref.winterSecondStart || pref.summerFirstStart || pref.summerSecondStart) return pref;
  const migrated = { ...pref };
  const oldChoices = [
    { start: pref.firstStart, end: pref.firstEnd },
    { start: pref.secondStart, end: pref.secondEnd }
  ].filter(x => x.start);
  oldChoices.forEach(choice => {
    const season = preferenceSeason(choice.start);
    const firstKey = season === 'summer' ? 'summerFirstStart' : 'winterFirstStart';
    const firstEndKey = season === 'summer' ? 'summerFirstEnd' : 'winterFirstEnd';
    const secondKey = season === 'summer' ? 'summerSecondStart' : 'winterSecondStart';
    const secondEndKey = season === 'summer' ? 'summerSecondEnd' : 'winterSecondEnd';
    if (!migrated[firstKey]) { migrated[firstKey] = choice.start; migrated[firstEndKey] = choice.end || preferenceEndForStart(choice.start); }
    else if (!migrated[secondKey]) { migrated[secondKey] = choice.start; migrated[secondEndKey] = choice.end || preferenceEndForStart(choice.start); }
  });
  return migrated;
}
function normalizeLeavePlanResult(result) {
  if (!result) return null;
  if ('winterChoice' in result || 'summerChoice' in result) return result;
  const migrated = { ...result, winterChoice:0, summerChoice:0, winterStatus:'pending', summerStatus:'pending' };
  if (result.start && result.end && result.choice) {
    const season = preferenceSeason(result.start);
    migrated[`${season}Choice`] = result.choice;
    migrated[`${season}Start`] = result.start;
    migrated[`${season}End`] = result.end;
    migrated[`${season}Status`] = result.status || 'accepted';
  }
  return migrated;
}
function preferenceRangeText(pref, season, choice) {
  const p = normalizePreferenceRecord(pref);
  if (!p) return '—';
  const key = `${season}${choice === 1 ? 'First' : 'Second'}`;
  const start = p[`${key}Start`], end = p[`${key}End`];
  return start && end ? `${formatShortDate(start)} – ${formatShortDate(end)}` : '—';
}
function resultSeasonLabel(result, season) {
  if (!result) return 'Değerlendirme bekleniyor';
  const choice = result[`${season}Choice`];
  const status = result[`${season}Status`];
  if (status === 'reselect' || !choice) return 'Tekrar tercih isteniyor';
  if (choice === 1) return '1. tercih kabul';
  if (choice === 2) return '2. tercih kabul';
  return 'Değerlendirme bekleniyor';
}
const TR_HOLIDAYS_2027 = [
  {start:'2027-01-01', end:'2027-01-01', name:'Yılbaşı'},
  {start:'2027-03-08', end:'2027-03-11', name:'Ramazan Bayramı'},
  {start:'2027-04-23', end:'2027-04-23', name:'23 Nisan'},
  {start:'2027-05-01', end:'2027-05-01', name:'Emek ve Dayanışma Günü'},
  {start:'2027-05-15', end:'2027-05-19', name:'Kurban Bayramı'},
  {start:'2027-05-19', end:'2027-05-19', name:'19 Mayıs'},
  {start:'2027-07-15', end:'2027-07-15', name:'15 Temmuz'},
  {start:'2027-08-30', end:'2027-08-30', name:'30 Ağustos'},
  {start:'2027-10-28', end:'2027-10-29', name:'Cumhuriyet Bayramı'}
];
function holidaysForYear(year) {
  if (Number(year) === 2027) return TR_HOLIDAYS_2027;
  return [
    {start:`${year}-01-01`, end:`${year}-01-01`, name:'Yılbaşı'},
    {start:`${year}-04-23`, end:`${year}-04-23`, name:'23 Nisan'},
    {start:`${year}-05-01`, end:`${year}-05-01`, name:'Emek ve Dayanışma Günü'},
    {start:`${year}-05-19`, end:`${year}-05-19`, name:'19 Mayıs'},
    {start:`${year}-07-15`, end:`${year}-07-15`, name:'15 Temmuz'},
    {start:`${year}-08-30`, end:`${year}-08-30`, name:'30 Ağustos'},
    {start:`${year}-10-28`, end:`${year}-10-29`, name:'Cumhuriyet Bayramı'}
  ];
}
function rangeHolidayNames(start, end, year) {
  return holidaysForYear(year).filter(h => start <= h.end && end >= h.start).map(h => h.name);
}
function isCommander(user=currentUser) { return hasRole('commander', user); }

function todayMenuRecord(date = toISO(new Date())) {
  return db.dailyMenus?.[date] || { breakfast: '', dinner: '' };
}
function dashboardMenuTarget(now = new Date()) {
  const showTomorrow = now.getHours() >= 19;
  const dateObj = showTomorrow ? addDays(now, 1) : now;
  return { date: toISO(dateObj), title: showTomorrow ? 'Yarının Yemek Menüsü' : 'Bugünün Yemek Menüsü' };
}
function menuTextLines(value) {
  return String(value || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
}
function renderMenuItems(value) {
  const items = menuTextLines(value);
  return items.length ? `<ul class="dashboard-menu-list">${items.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<div class="menu-empty">Menü henüz girilmedi.</div>';
}
function renderTodayMenuCard() {
  const target = dashboardMenuTarget(new Date());
  const menu = todayMenuRecord(target.date);
  const hasMenu = menuTextLines(menu.breakfast).length || menuTextLines(menu.dinner).length;
  return `<div class="card dashboard-menu-card section-gap">
    <div class="card-header"><div><h3>🍲 ${target.title}</h3><p>${formatDayDate(target.date)}</p></div></div>
    <div class="card-body dashboard-menu-grid">
      <section><div class="dashboard-menu-title"><span>☕</span><strong>Sabah</strong></div>${renderMenuItems(menu.breakfast)}</section>
      <section><div class="dashboard-menu-title"><span>🍽</span><strong>Akşam</strong></div>${renderMenuItems(menu.dinner)}</section>
    </div>
    ${!hasMenu ? `<div class="card-body menu-info-note">${target.title} henüz oluşturulmadı.</div>` : ''}
  </div>`;
}
function renderDailyMenuManagement() {
  if (!hasPermission('menu.manage')) return goPage('dashboard');
  const selected = db.settings.menuManagementDate || dashboardMenuTarget(new Date()).date;
  const menu = todayMenuRecord(selected);
  const hasMenu = menuTextLines(menu.breakfast).length || menuTextLines(menu.dinner).length;
  document.getElementById('pageContent').innerHTML = `
    <div class="card menu-management-page">
      <div class="card-header calendar-toolbar"><div><h3>🍲 Yemek Yönetimi</h3><p>Günlük Sabah ve Akşam menüsünü oluşturun veya daha sonra düzenleyin.</p></div><div class="calendar-actions"><input type="date" value="${selected}" onchange="setMenuManagementDate(this.value)"><button class="btn btn-primary btn-sm" onclick="dailyMenuModal('${selected}')">${hasMenu ? 'Menüyü Düzenle' : 'Menü Oluştur'}</button></div></div>
      <div class="card-body dashboard-menu-grid">
        <section><div class="dashboard-menu-title"><span>☕</span><strong>Sabah</strong></div>${renderMenuItems(menu.breakfast)}</section>
        <section><div class="dashboard-menu-title"><span>🍽</span><strong>Akşam</strong></div>${renderMenuItems(menu.dinner)}</section>
      </div>
      <div class="card-body menu-info-note">Bu menü tüm personelin Ana Sayfasında görüntülenir. Saat 19:00'dan sonra Ana Sayfa otomatik olarak ertesi günün menüsünü gösterir.</div>
    </div>`;
}
function setMenuManagementDate(date) {
  if (!date) return;
  db.settings.menuManagementDate = date;
  saveDB();
  renderDailyMenuManagement();
}
function dailyMenuModal(date = dashboardMenuTarget(new Date()).date) {
  if (!hasPermission('menu.manage')) return toast('Günlük menü yönetimi yetkiniz yok.');
  const menu = todayMenuRecord(date);
  showModal('Günlük Yemek Menüsü', `<form id="dailyMenuForm" class="form-grid">
    <label class="span-2">Tarih<input name="date" type="date" value="${date}" required></label>
    <label class="span-2">Sabah menüsü<textarea name="breakfast" placeholder="Her yemeği ayrı satıra yazabilirsiniz">${escapeHtml(menu.breakfast || '')}</textarea></label>
    <label class="span-2">Akşam menüsü<textarea name="dinner" placeholder="Her yemeği ayrı satıra yazabilirsiniz">${escapeHtml(menu.dinner || '')}</textarea></label>
    <div class="span-2 form-hint">Kaydedilen menü personelin Ana Sayfasında salt okunur olarak görüntülenir.</div>
    <div class="span-2"><button class="btn btn-primary btn-block">Menüyü Kaydet</button></div>
  </form>`);
  document.getElementById('dailyMenuForm').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target); const targetDate = String(f.get('date'));
    db.dailyMenus ||= {};
    db.dailyMenus[targetDate] = { breakfast: String(f.get('breakfast') || '').trim(), dinner: String(f.get('dinner') || '').trim(), updatedBy: currentUser.id, updatedAt: new Date().toISOString() };
    db.settings.menuManagementDate = targetDate;
    logAudit('menu.update', `${targetDate} günlük menüsü güncellendi.`);
    saveDB(); closeModal();
    if (currentPage === 'daily-menu-management') renderDailyMenuManagement(); else renderDashboard();
    toast('Günlük menü kaydedildi.');
  });
}
function activitiesForRange(start, end) {
  return (db.weeklyActivities || []).filter(x => x.date >= start && x.date <= end).slice().sort((a,b) => `${a.date} ${a.time || ''} ${a.title || ''}`.localeCompare(`${b.date} ${b.time || ''} ${b.title || ''}`, 'tr'));
}
function activityRow(activity, compact = false) {
  const action = hasPermission('activity.manage') ? `<span class="activity-actions"><button class="btn btn-secondary btn-sm" onclick="activityModal(${activity.id})">Düzenle</button><button class="btn btn-danger btn-sm" onclick="deleteActivity(${activity.id})">Sil</button></span>` : '';
  return `<div class="activity-row ${activity.date === toISO(new Date()) ? 'today' : ''}">
    <div class="activity-time">${escapeHtml(activity.time || '—')}</div>
    <div class="activity-main"><strong>${escapeHtml(activity.title || 'Faaliyet')}</strong>${activity.place ? `<span>📍 ${escapeHtml(activity.place)}</span>` : ''}${!compact && activity.note ? `<small>${escapeHtml(activity.note)}</small>` : ''}</div>${action}
  </div>`;
}
function renderWeeklyActivitiesCard(commanderView = false) {
  const start = toISO(startOfWeek(new Date())); const end = toISO(addDays(startOfWeek(new Date()), 6)); const today = toISO(new Date());
  const activities = activitiesForRange(start, end); const todays = activities.filter(x => x.date === today);
  const dates = getWeekDates(new Date());
  return `<div class="card weekly-activities-card section-gap">
    <div class="card-header"><div><h3>${commanderView ? '📌 Günlük ve Haftalık Faaliyetler' : '📅 Haftalık Faaliyet Takvimi'}</h3><p>${formatShortDate(start)} – ${formatShortDate(end)} · Tüm personel için ortak faaliyet planı</p></div>${hasPermission('activity.manage') ? '<button class="btn btn-primary btn-sm" onclick="activityModal()">+ Faaliyet Ekle</button>' : ''}</div>
    ${commanderView ? `<div class="card-body today-activity-block"><div class="activity-section-title"><strong>Bugünkü faaliyetler</strong><span>${formatDayDate(today)}</span></div>${todays.length ? todays.map(x => activityRow(x)).join('') : '<div class="empty compact-empty">Bugün için faaliyet kaydı bulunmuyor.</div>'}</div>` : ''}
    <div class="card-body weekly-activity-days">${dates.map(date => { const dayItems=activities.filter(x=>x.date===date); return `<section class="weekly-activity-day ${date===today?'today':''}"><div class="weekly-day-head"><strong>${new Intl.DateTimeFormat('tr-TR',{weekday:'long'}).format(parseISO(date))}</strong><span>${formatShortDate(date)}</span></div>${dayItems.length ? dayItems.map(x=>activityRow(x,true)).join('') : '<div class="activity-none">Faaliyet yok</div>'}</section>`; }).join('')}</div>
  </div>`;
}
function activityModal(editId = null) {
  if (!hasPermission('activity.manage')) return toast('Haftalık faaliyet yönetimi yetkiniz yok.');
  const editing = editId ? (db.weeklyActivities || []).find(x => x.id === Number(editId)) : null;
  showModal(editing ? 'Faaliyeti Düzenle' : 'Yeni Faaliyet Ekle', `<form id="activityForm" class="form-grid">
    <label>Tarih<input name="date" type="date" value="${editing?.date || toISO(new Date())}" required></label>
    <label>Saat<input name="time" type="time" value="${escapeHtml(editing?.time || '')}"></label>
    <label class="span-2">Faaliyet başlığı<input name="title" value="${escapeHtml(editing?.title || '')}" required placeholder="Örn. İçtima / Eğitim / Denetleme"></label>
    <label class="span-2">Yer / görev yeri<input name="place" value="${escapeHtml(editing?.place || '')}" placeholder="Örn. Karakol / Eğitim alanı"></label>
    <label class="span-2">Açıklama<textarea name="note" placeholder="Faaliyetle ilgili kısa açıklama">${escapeHtml(editing?.note || '')}</textarea></label>
    <div class="span-2"><button class="btn btn-primary btn-block">${editing ? 'Değişiklikleri Kaydet' : 'Faaliyeti Kaydet'}</button></div>
  </form>`);
  document.getElementById('activityForm').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target);
    const payload = { date:String(f.get('date')), time:String(f.get('time') || ''), title:String(f.get('title') || '').trim(), place:String(f.get('place') || '').trim(), note:String(f.get('note') || '').trim(), updatedBy:currentUser.id, updatedAt:new Date().toISOString() };
    db.weeklyActivities ||= [];
    if (editing) Object.assign(editing, payload); else db.weeklyActivities.push({ id:Date.now(), ...payload, createdBy:currentUser.id, createdAt:new Date().toISOString() });
    logAudit(editing ? 'activity.update' : 'activity.create', `${payload.date} ${payload.time} · ${payload.title}`);
    saveDB(); closeModal(); renderDashboard(); toast(editing ? 'Faaliyet güncellendi.' : 'Faaliyet eklendi.');
  });
}
function deleteActivity(id) {
  if (!hasPermission('activity.manage')) return;
  const item = (db.weeklyActivities || []).find(x => x.id === Number(id)); if (!item) return;
  if (!confirm(`${item.title} faaliyeti silinsin mi?`)) return;
  db.weeklyActivities = db.weeklyActivities.filter(x => x.id !== Number(id));
  logAudit('activity.delete', `${item.date} ${item.time || ''} · ${item.title}`); saveDB(); renderDashboard(); toast('Faaliyet silindi.');
}
function renderCommanderLeaveStatusCard() {
  const today = toISO(new Date());
  const onLeave = db.leaveRequests.filter(x => x.status === 'approved' && x.start <= today && x.end >= today).sort((a,b)=>String(a.end).localeCompare(String(b.end)));
  const pending = db.leaveRequests.filter(x => x.status === 'pending').sort((a,b)=>String(a.start).localeCompare(String(b.start))).slice(0,8);
  return `<div class="card commander-status-card">
    <div class="card-header"><div><h3>🏖️ Personel İzinleri</h3><p>Bugün izinli personel ve değerlendirme bekleyen talepler</p></div><button class="btn btn-primary btn-sm" onclick="goPage('leave-management')">İzin Yönetimi</button></div>
    <div class="card-body commander-leave-summary"><div><strong>${onLeave.length}</strong><span>Bugün izinli</span></div><div><strong>${db.leaveRequests.filter(x=>x.status==='pending').length}</strong><span>Onay bekleyen talep</span></div></div>
    <div class="card-body pending-leave-inline"><div class="activity-section-title"><strong>Onay bekleyen izin talepleri</strong><span>${pending.length ? 'İnceleme gerekli' : 'Bekleyen talep yok'}</span></div>${pending.length ? `<div class="table-wrap"><table><thead><tr><th>Personel</th><th>Tür</th><th>Tarih</th><th>Gün</th><th></th></tr></thead><tbody>${pending.map(x=>`<tr><td>${escapeHtml(getUser(x.userId)?.name||'-')}</td><td>${escapeHtml(x.type||'-')}</td><td>${formatShortDate(x.start)} – ${formatShortDate(x.end)}</td><td>${Number(x.days||daysBetween(x.start,x.end))}</td><td><button class="btn btn-secondary btn-sm" onclick="goPage('leave-management')">İncele</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty compact-empty">Onay bekleyen izin talebi bulunmuyor.</div>'}</div>
    <div class="card-body"><div class="activity-section-title"><strong>Bugün izinli personel</strong><span>${formatDayDate(today)}</span></div>${onLeave.length ? `<div class="table-wrap"><table><thead><tr><th>Personel</th><th>İzin Türü</th><th>Tarih Aralığı</th><th>Gün</th></tr></thead><tbody>${onLeave.map(x=>`<tr><td><strong>${escapeHtml(getUser(x.userId)?.name||'-')}</strong></td><td>${escapeHtml(x.type||'-')}</td><td>${formatShortDate(x.start)} – ${formatShortDate(x.end)}</td><td>${Number(x.days||daysBetween(x.start,x.end))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty compact-empty">Bugün izinli personel bulunmuyor.</div>'}</div>
  </div>`;
}

function renderDashboard() {
  const ownDebt = db.debts.filter(x => x.userId === currentUser.id).reduce((s, x) => s + Math.max(0, x.amount - x.paid), 0);
  const remaining = getRemainingLeave(currentUser);
  const preference = db.leavePreferences.find(x => x.userId === currentUser.id && x.year === db.settings.leavePlanYear);
  const currentWeek = getWeekDates(mealWeekCursor);
  const mealCount = currentWeek.reduce((sum, date) => sum + (isBillableTabldotSlot(currentUser.id, date) ? 2 : 0), 0);
  const kitchenMealCount = currentWeek.reduce((sum, date) => sum + ['breakfast','dinner'].filter(meal => ['yes','duty'].includes(effectiveMealStatus(currentUser.id,date,meal))).length, 0);

  const personal = `
    <div class="grid grid-4">
      ${metric('🍽', 'Bu haftaki tabldot öğünü', mealCount, 'Aşçıya ayrılacak: ' + kitchenMealCount + ' öğün')}
      ${metric('₺', 'Güncel borcunuz', money(ownDebt), 'Ödeme bilgileri kendi ekranınızda')}
      ${metric('📅', 'Kullanılabilir yıllık izin', remaining + ' gün', 'Yıllık hak: ' + (currentUser.annualAllowance ?? 30) + ' gün')}
      ${metric('🛣️', 'Kalan yol izni', getRoadRemaining(currentUser) + ' gün', 'Yol izni hakkı: ' + (currentUser.roadAllowance ?? 2) + ' gün')}
    </div>
    <div class="grid grid-2 section-gap">
      <div class="card"><div class="card-header"><div><h3>Kişisel işlemlerim</h3><p>Tek hesapla kişisel ve yetkili işlemler birlikte yürütülür</p></div></div><div class="card-body quick-list">
        ${quick('🍽', 'Tarihli yemek listesini güncelle', 'Varsayılan olarak yemek yiyecek kabul edilirsiniz', "goPage('my-meals')")}
        ${hasCookPermission() ? quick('👨‍🍳', 'Bugünün yemek sayılarını aç', 'Sabah ve akşam hazırlık sayıları', "goPage('cook-dashboard')") : ''}
        ${!isCommander() ? quick('📅', 'Yeni izin talebi oluştur', 'Yıllık, günübirlik ve diğer izin talepleri', "leaveModal()") : ''}
        ${quick('⭐', 'Yıllık izin tercihlerini gönder', 'Kış için 2, yaz için 2 tercih alınır', "goPage('leave-preference')")}
      </div></div>
      <div class="card"><div class="card-header"><div><h3>Duyurular</h3><p>Ortak bilgilendirmeler</p></div></div><div class="card-body quick-list">
        ${notice('Yemek sistemi', 'Tercih yapmayan personel yemek yiyecek kabul edilir.')}
        ${notice('İzin planlaması', db.settings.leavePlanYear + ' yılı için kış ve yaz dönemlerinde ikişer tercih alınmaktadır.')}
        ${notice('Yıllık izin tercihi', preference ? 'Tercihiniz sisteme kaydedildi.' : 'Henüz tercih göndermediniz.')}
      </div></div>
    </div>`;

  const sharedMenu = renderTodayMenuCard();
  const sharedActivities = renderWeeklyActivitiesCard(isCommander());

  if (!hasManagementPermission()) {
    document.getElementById('pageContent').innerHTML = sharedActivities + sharedMenu + personal;
    return;
  }

  const pendingMembers = db.users.filter(u => !u.approved).length;
  const pendingLeaveRows = db.leaveRequests.filter(x => x.status === 'pending').sort((a,b) => String(a.start || '').localeCompare(String(b.start || ''))).slice(0, 8);
  const pendingLeaves = db.leaveRequests.filter(x => x.status === 'pending').length;
  const submitted = db.leavePreferences.filter(x => x.year === db.settings.leavePlanYear && x.status !== 'reselect').length;

  const pendingLeaveCard = hasPermission('leave.view') && pendingLeaveRows.length ? `
    <div class="card commander-leave-card section-gap"><div class="card-header"><div><h3>⏳ İzin Talepleri</h3><p>Onay bekleyen izin talepleri</p></div><button class="btn btn-primary btn-sm" onclick="goPage('leave-management')">Tümünü Gör</button></div>
    <div class="table-wrap"><table><thead><tr><th>Personel</th><th>İzin türü</th><th>Tarih</th><th>Gün</th><th>İşlem</th></tr></thead><tbody>${pendingLeaveRows.map(x => `<tr><td><strong>${escapeHtml(getUser(x.userId)?.name || '-')}</strong></td><td>${escapeHtml(x.type || '-')}</td><td>${formatShortDate(x.start)} – ${formatShortDate(x.end)}</td><td>${Number(x.days || daysBetween(x.start,x.end))}</td><td><button class="btn btn-secondary btn-sm" onclick="goPage('leave-management')">İncele</button></td></tr>`).join('')}</tbody></table></div></div>` : '';

  const management = `
    <div class="management-banner section-gap"><strong>${userRoleLabels(currentUser)} yetkileri açık</strong><span>Aynı hesapla kişisel ve yönetim işlemlerine erişebilirsiniz.</span></div>
    <div class="grid grid-4 section-gap">
      ${metric('👥', 'Aktif personel', approvedUsers().length, pendingMembers + ' üyelik onay bekliyor')}
      ${metric('🕓', 'Bekleyen izin talebi', pendingLeaves, pendingLeaves ? 'Değerlendirme gerekli' : 'Bekleyen talep yok')}
      ${metric('⭐', 'Yıllık tercih veren', submitted + ' kişi', db.settings.leavePlanYear + ' planlama yılı')}
      ${metric('📏', 'Aynı anda izinli sınırı', concurrentLeaveCapacity() + ' kişi', '%' + (db.settings.leaveConcurrentPercent || 25) + ' mevcut sınırı')}
    </div>
    <div class="card section-gap"><div class="card-header"><div><h3>Yönetim kısa yolları</h3><p>Yetkinize bağlı ortak ekranlar</p></div></div><div class="card-body quick-list">
      ${hasPermission('personnel.view') ? quick('👥', 'Personel listesini aç', 'Bilgi, rol/yetki ve izin geçmişi', "goPage('members')") : ''}
      ${hasPermission('attendance.manage') ? quick('📝', 'Bugünkü yoklamayı gir', 'İzin, rapor, görev ve bulunduğu yer', "goPage('attendance-management')") : ''}
      ${hasPermission('attendance.view') ? quick('📋', 'Günlük / haftalık yoklamayı gör', 'Mevcut ve mevcut olmayan personel özeti', "goPage('attendance-overview')") : ''}
      ${hasPermission('meal.manage') ? quick('📊', 'Tabldot bilançosunu aç', 'Malzeme gideri, tabldot payı ve kişi borcu', "goPage('finance-management')") : ''}
      ${hasPermission('leave.plan') ? quick('📈', 'Yıllık izin anket sonuçlarını aç', 'Tercih yoğunluğu, tatiller ve değerlendirme', "goPage('leave-planning')") : ''}
    </div></div>`;

  if (isCommander()) {
    document.getElementById('pageContent').innerHTML = renderCommanderLeaveStatusCard() + sharedActivities + sharedMenu + management + personal;
  } else {
    document.getElementById('pageContent').innerHTML = sharedActivities + sharedMenu + personal + management + pendingLeaveCard;
  }
}

function renderMembers() {
  if (!hasPermission('personnel.view')) return goPage('dashboard');
  const pending = db.users.filter(u => !u.approved && !u.rejected);
  const active = approvedUsers();
  document.getElementById('pageContent').innerHTML = `
    <div class="grid grid-3">
      ${metric('👥', 'Toplam kayıt', db.users.length, 'Tüm kullanıcılar')}
      ${metric('✅', 'Aktif kullanıcı', active.length, 'Sisteme giriş yapabilir')}
      ${metric('🕓', 'Onay bekleyen', pending.length, isAdmin() ? 'Admin işlemi gerekli' : 'Yetkili görüntüleme')}
    </div>
    <div class="card section-gap"><div class="card-header"><div><h3>Onay bekleyen üyelikler</h3><p>Tek giriş ekranından yapılan kayıtlar</p></div></div>
      ${pending.length ? `<div class="table-wrap"><table><thead><tr><th>Personel</th><th>Telefon</th><th>Görev</th><th>İşlem</th></tr></thead><tbody>${pending.map(u => `<tr><td><strong>${escapeHtml(u.name)}</strong></td><td>${u.phone}</td><td>${escapeHtml(u.title)}</td><td>${isAdmin() ? `<button class="btn btn-success btn-sm" onclick="approveMember(${u.id})">Onayla</button> <button class="btn btn-danger btn-sm" onclick="rejectMember(${u.id})">Reddet</button>` : 'Admin onayı bekleniyor'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Onay bekleyen üyelik bulunmuyor.</div>'}
    </div>
    <div class="card section-gap"><div class="card-header"><div><h3>Tüm aktif personeller</h3><p>Personel bilgileri, izin geçmişi ve yetkiler tek noktadan yönetilir.</p></div>${isAdmin() ? '<button class="btn btn-primary btn-sm" onclick="newMemberModal()">Personel Ekle</button>' : ''}</div>
      <div class="table-wrap"><table><thead><tr><th>Ad soyad</th><th>Telefon</th><th>Rol</th><th>Görev</th><th>Yıllık kalan</th><th>Yol kalan</th><th>İşlem</th></tr></thead><tbody>${active.map(u => `<tr><td><button class="person-link" onclick="openPersonnelLeaves(${u.id})">${escapeHtml(u.name)}</button></td><td>${u.phone}</td><td>${escapeHtml(userRoleLabels(u))}</td><td>${escapeHtml(u.title)}</td><td>${getRemainingLeave(u)} gün</td><td>${getRoadRemaining(u)} gün</td><td>
        <button class="btn btn-secondary btn-sm" onclick="openPersonnelLeaves(${u.id})">İzinleri</button>
        ${(isAdmin() || hasPermission('leave.manage')) ? `<button class="btn btn-secondary btn-sm" onclick="editMemberModal(${u.id})">Bilgileri Düzenle</button>` : ''}
        ${isAdmin() ? `<button class="btn btn-primary btn-sm" onclick="roleModal(${u.id})">Rol / Yetki</button> <button class="btn btn-danger btn-sm" onclick="deletePersonnel(${u.id})">Personeli Sil</button>` : ''}
      </td></tr>`).join('')}</tbody></table></div>
    </div>`;
}
function approveMember(id) { if (!isAdmin()) return; const u = getUser(id); if (u) { u.approved = true; u.rejected = false; saveDB(); renderMembers(); toast('Üyelik onaylandı.'); } }
function rejectMember(id) { if (!isAdmin()) return; const u = getUser(id); if (u) { u.approved = false; u.rejected = true; saveDB(); renderMembers(); toast('Başvuru reddedildi. Firebase Authentication hesabı güvenlik nedeniyle silinmedi.'); } }

function deletePersonnel(userId) {
  if (!isAdmin()) return;
  const user = getUser(userId); if (!user) return;
  if (user.id === currentUser?.id) return toast('Kendi personel kaydınızı silemezsiniz.');
  if (userRoles(user).includes('admin')) {
    const otherAdmins = approvedUsers().filter(u => u.id !== user.id && userRoles(u).includes('admin'));
    if (!otherAdmins.length) return toast('Sistemdeki son admin personel kaydı silinemez.');
  }
  const warning = `${user.name} personel kaydı sistemden silinecek. Bu işlem kullanıcının PBYS profilini ve kullanıcıya bağlı izin, yoklama, yemek tercihi, borç/ödeme, çamaşır ve yıllık izin planlama kayıtlarını kaldırır.\n\nDevam etmek istiyor musunuz?`;
  if (!confirm(warning)) return;

  db.users = db.users.filter(u => u.id !== user.id);
  delete db.mealSelections?.[user.id];
  db.payments = (db.payments || []).filter(x => x.userId !== user.id);
  db.debts = (db.debts || []).filter(x => x.userId !== user.id);
  db.leaveRequests = (db.leaveRequests || []).filter(x => x.userId !== user.id);
  db.leavePreferences = (db.leavePreferences || []).filter(x => x.userId !== user.id);
  db.leavePlanResults = (db.leavePlanResults || []).filter(x => x.userId !== user.id);
  db.laundry = (db.laundry || []).filter(x => x.userId !== user.id);
  db.laundryRuns = (db.laundryRuns || []).filter(x => x.userId !== user.id);
  db.laundryFaults = (db.laundryFaults || []).filter(x => x.userId !== user.id && x.reporterId !== user.id);
  db.attendance = (db.attendance || []).filter(x => x.userId !== user.id);
  logAudit('personnel.delete', `${user.name} personel kaydı admin tarafından silindi`);
  saveDB();
  renderMembers();
  renderNav();
  toast('Personel kaydı silindi. Firebase Authentication hesabı ayrıca yönetici backendinden silinmelidir.');
}
function newMemberModal() {
  if (!isAdmin()) return;
  showModal('Yeni Personel Ekle', `<form id="newMemberForm" class="form-grid">
    <label>Ad soyad<input name="name" required></label><label>Telefon<input name="phone" required></label>
    <label>Görev / rütbe<input name="title" required></label><label>Rol<select name="role"><option value="staff">Personel</option><option value="cook">Aşçı</option><option value="tabldot">Tabldot Sorumlusu</option><option value="administrative">İdari İşler</option><option value="commander">Karakol Komutanı</option><option value="admin">Admin</option></select></label>
    <label>Yıllık izin hakkı<input name="annualAllowance" type="number" value="30" min="0"></label><label>Yol izni hakkı<input name="roadAllowance" type="number" value="2" min="0"></label><label>Planlama puanı<input name="planningScore" type="number" value="50" min="0" max="1000"></label>
    <label class="span-2">Geçici şifre<input name="password" type="password" minlength="6" placeholder="En az 6 karakter" required></label>
    <div class="span-2"><button class="btn btn-primary btn-block">Personeli Kaydet</button></div></form>`);
  document.getElementById('newMemberForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const role = f.get('role');
    const profile = { id: Date.now(), name: f.get('name').trim(), phone: normalizePhone(f.get('phone')), title: f.get('title').trim(), role, roles: role === 'staff' ? ['staff'] : ['staff', role], extraPermissions: [], approved: true, rejected: false, annualAllowance: Number(f.get('annualAllowance')), roadAllowance: Number(f.get('roadAllowance') || 2), usedLeave: 0, usedRoadLeave: 0, planningScore: Number(f.get('planningScore')), planningScoreNote: '' };
    try {
      await window.FirebaseBridge.adminCreateUser(profile, f.get('password'));
      closeModal(); await refreshFromCloud(false); renderMembers(); toast('Firebase Authentication hesabı ve personel kaydı oluşturuldu.');
    } catch (error) { toast(window.FirebaseBridge.errorMessage(error)); }
  });
}

function editMemberModal(userId) {
  if (!isAdmin() && !hasPermission('leave.manage')) return;
  const user = getUser(userId); if (!user) return;
  showModal(`${user.name} · Personel Bilgileri`, `<form id="editMemberForm" class="form-grid">
    <label>Ad soyad<input name="name" value="${escapeHtml(user.name)}" required></label>
    <label>Telefon<input name="phone" value="${escapeHtml(user.phone)}" readonly required><small class="form-note">Giriş kimliği olduğu için bu test sürümünde değiştirilemez.</small></label>
    <label>Görev / rütbe<input name="title" value="${escapeHtml(user.title || '')}" required></label>
    <label>Yıllık izin hakkı<input name="annualAllowance" type="number" min="0" value="${user.annualAllowance ?? 30}"></label>
    <label>Yol izni hakkı<input name="roadAllowance" type="number" min="0" value="${user.roadAllowance ?? 2}"></label>
    <label>Kullanılmış yıllık izin (eski manuel bakiye)<input name="usedLeave" type="number" min="0" value="${user.usedLeave ?? 0}"></label>
    <label>Kullanılmış yol izni (eski manuel bakiye)<input name="usedRoadLeave" type="number" min="0" value="${user.usedRoadLeave ?? 0}"></label>
    <div class="span-2"><button class="btn btn-primary btn-block">Bilgileri Kaydet</button></div>
  </form>`);
  document.getElementById('editMemberForm').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target);
    user.name = f.get('name').trim();
    user.title = f.get('title').trim();
    user.annualAllowance = Number(f.get('annualAllowance') || 30);
    user.roadAllowance = Number(f.get('roadAllowance') || 2);
    user.usedLeave = Number(f.get('usedLeave') || 0);
    user.usedRoadLeave = Number(f.get('usedRoadLeave') || 0);
    logAudit('personnel.update', `${user.name} personel bilgileri güncellendi`);
    saveDB(); closeModal(); renderMembers(); toast('Personel bilgileri güncellendi.');
  });
}

function planningScoreModal(userId) {
  if (!hasPermission('leave.plan')) return;
  const user = getUser(userId); if (!user) return;
  showModal(`${user.name} · Planlama Puanı`, `<form id="scoreForm" class="form-grid">
    <label class="span-2">Puan<input name="score" type="number" min="0" max="1000" value="${user.planningScore ?? 0}" required></label>
    <label class="span-2">Puan açıklaması<textarea name="note" placeholder="Puanın hangi ölçütlerle verildiğini yazın">${escapeHtml(user.planningScoreNote || '')}</textarea></label>
    <div class="span-2"><button class="btn btn-primary btn-block">Puanı Kaydet</button></div></form>`);
  document.getElementById('scoreForm').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target);
    user.planningScore = Number(f.get('score')); user.planningScoreNote = f.get('note');
    db.leavePlanResults = [];
    saveDB(); closeModal();
    if (currentPage === 'leave-planning') renderLeavePlanning(); else renderMembers();
    toast('Planlama puanı güncellendi.');
  });
}


function roleModal(userId) {
  if (!isAdmin()) return;
  const user = getUser(userId); if (!user) return;
  const available = ['staff','cook','tabldot','administrative','commander','admin'];
  const permissionLabels = {
    'personnel.view':'Personel listesini gör','attendance.view':'Yoklama özetini gör','attendance.manage':'Yoklama girişi yap',
    'leave.view':'Tüm izinleri gör','leave.manage':'İzin kaydı ekle/düzenle','leave.approve':'İzin taleplerini onayla','leave.plan':'Yıllık izin planlamasını yönet',
    'meal.manage':'Tabldot yemek yönetimini gör','finance.manage':'Tabldot bilançosunu yönet','kitchen.view':'Aşçı ekranını gör','activity.manage':'Haftalık faaliyetleri ekle/düzenle','menu.manage':'Günlük yemek menüsünü ekle/düzenle','laundry.manage':'Çamaşır/arızaları yönet','leave.preference.manage':'Yıllık izin tercih sistemini yönet','reports.view':'Raporları gör'
  };
  showModal(`${user.name} · Rol ve Yetki`, `<form id="roleForm">
    <p class="form-note">Bir kullanıcıya birden fazla rol verilebilir. Son admin hesabının admin yetkisi kaldırılamaz.</p>
    <div class="role-check-grid section-gap">${available.map(role => `<label class="role-check"><input type="checkbox" name="roles" value="${role}" ${userRoles(user).includes(role) ? 'checked' : ''}><span><strong>${roleNames[role]}</strong><small>${(rolePermissions[role] || []).join(', ') || 'Temel personel işlevleri'}</small></span></label>`).join('')}</div>
    <h4 class="section-gap">Ek özel yetkiler</h4><p class="form-note">Rol paketine ek olarak kişiye özel yetki verilebilir.</p>
    <div class="role-check-grid section-gap">${Object.entries(permissionLabels).map(([key,label])=>`<label class="role-check"><input type="checkbox" name="extraPermissions" value="${key}" ${(user.extraPermissions||[]).includes(key)?'checked':''}><span><strong>${label}</strong><small>${key}</small></span></label>`).join('')}</div>
    <div class="section-gap"><button class="btn btn-primary btn-block">Rol ve Yetkileri Kaydet</button></div>
  </form>`);
  document.getElementById('roleForm').addEventListener('submit', e => {
    e.preventDefault(); const fd=new FormData(e.target); const roles=[...fd.getAll('roles')]; if(!roles.length)roles.push('staff');
    const removingAdmin=userRoles(user).includes('admin')&&!roles.includes('admin');
    const otherAdmins=approvedUsers().filter(u=>u.id!==user.id&&userRoles(u).includes('admin'));
    if(removingAdmin&&otherAdmins.length===0)return toast('Sistemde en az bir admin kalmalıdır. Son admin yetkisi kaldırılamaz.');
    if(removingAdmin&&user.id===currentUser.id&&!confirm('Kendi admin yetkinizi kaldırıyorsunuz. Devam etmek istiyor musunuz?'))return;
    user.roles=[...new Set(roles)]; user.extraPermissions=[...new Set(fd.getAll('extraPermissions'))];
    user.role=roles.includes('admin')?'admin':roles.includes('commander')?'commander':roles.includes('administrative')?'administrative':roles.includes('tabldot')?'tabldot':roles.includes('cook')?'cook':'staff';
    logAudit('role.update',`${user.name}: ${userRoleLabels(user)} · Ek: ${(user.extraPermissions||[]).join(', ')}`);
    saveDB();closeModal();renderMembers();renderNav();toast('Rol ve yetkiler güncellendi.');
  });
}
function attendanceStatusMeta(status) { return attendanceStatuses[status] || attendanceStatuses.other; }
function attendanceStatusFromLeave(req) {
  const text = `${req.type || ''}`.toLocaleLowerCase('tr-TR');
  if (text.includes('yıllık')) return 'annual_leave';
  if (text.includes('mazeret')) return 'excuse_leave';
  if (text.includes('yol')) return 'road_leave';
  if (text.includes('sağlık') || req.status === 'report') return 'medical';
  return 'other';
}
const attendancePlaceSuggestions = ['Karakol', 'Yemekhane', 'Nizamiye', 'İdari İşler', 'Devriye', 'Araç Görevi', 'Dış Görev'];
function attendanceForUserDate(userId, date) {
  const manual = (db.attendance || []).filter(x => x.userId === Number(userId) && x.start <= date && x.end >= date).sort((a,b) => b.id - a.id)[0];
  if (manual) return { status: manual.status, task: manual.task || manual.note || '', note: manual.note || '', location: manual.location || '', source: 'manual', record: manual };
  const leave = (db.leaveRequests || []).find(x => x.userId === Number(userId) && ['approved','report'].includes(x.status) && x.start <= date && x.end >= date);
  if (leave) return { status: attendanceStatusFromLeave(leave), task: '', note: leave.type, location: '', source: 'leave', record: leave };
  return { status: 'present', task: '', note: '', location: '', source: 'default', record: null };
}
function dailyAttendanceStats(date) {
  const stats = { total: 0, present: 0 };
  approvedUsers().forEach(user => {
    const a = attendanceForUserDate(user.id, date);
    stats.total++;
    stats[a.status] = (stats[a.status] || 0) + 1;
  });
  stats.leaveTotal = (stats.annual_leave || 0) + (stats.excuse_leave || 0) + (stats.road_leave || 0);
  stats.effectivePresent = (stats.present || 0) + (stats.work || 0) + (stats.watch || 0) + (stats.rest || 0);
  stats.absent = Math.max(0, stats.total - stats.effectivePresent);
  return stats;
}
function attendancePercent(count, total) {
  if (!total) return '—';
  const value = Number(count || 0) / total * 100;
  return `%${value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
}
function attendanceMiniSummary(stats) {
  const keys = ['watch','work','rest','medical','duty','temporary_duty','course','referral','excuse_leave','road_leave','other'];
  return `<div class="attendance-mini-summary">${keys.map(key => {
    const meta = attendanceStatusMeta(key);
    const count = Number(stats[key] || 0);
    return `<div class="attendance-mini-card att-mini-${key}">
      <span class="attendance-mini-icon">${meta.icon}</span>
      <div><small>${escapeHtml(meta.label)}</small><strong>${count} kişi</strong><em>${attendancePercent(count, stats.total)}</em></div>
    </div>`;
  }).join('')}</div>`;
}
function changeAttendanceDate(delta) { attendanceDateCursor = addDays(attendanceDateCursor, delta); attendanceWeekCursor = startOfWeek(attendanceDateCursor); currentPage === 'attendance-management' ? renderAttendanceManagement() : renderAttendanceOverview(); }
function goTodayAttendance() { attendanceDateCursor = new Date(); attendanceWeekCursor = startOfWeek(new Date()); currentPage === 'attendance-management' ? renderAttendanceManagement() : renderAttendanceOverview(); }
function setAttendanceDate(value) { if (!value) return; attendanceDateCursor = parseISO(value); attendanceWeekCursor = startOfWeek(attendanceDateCursor); currentPage === 'attendance-management' ? renderAttendanceManagement() : renderAttendanceOverview(); }
function changeAttendanceWeek(delta) { attendanceWeekCursor = addDays(attendanceWeekCursor, delta * 7); renderAttendanceOverview(); }
function attendanceBadge(status, compact=false) { const m = attendanceStatusMeta(status); return `<span class="attendance-badge att-${status}" title="${m.label}">${compact ? m.short : `${m.icon} ${m.label}`}</span>`; }
function attendanceEditModal(userId, targetDate = null) {
  if (!hasPermission('attendance.manage')) return;
  const user = getUser(userId); if (!user) return;
  const date = targetDate || toISO(attendanceDateCursor);
  const current = attendanceForUserDate(userId, date);
  showModal(`${user.name} · ${formatShortDate(date)} Yoklama Durumu`, `<form id="attendanceForm" class="form-grid">
    <label>Durum<select name="status">${Object.entries(attendanceStatuses).map(([key,val]) => `<option value="${key}" ${current.status === key ? 'selected' : ''}>${val.label}</option>`).join('')}</select></label>
    <label>Bulunduğu yer / görev yeri<input name="location" list="attendancePlaces" value="${escapeHtml(current.source === 'manual' ? current.location : '')}" placeholder="Örn. Yemekhane, Nizamiye"></label>
    <datalist id="attendancePlaces">${attendancePlaceSuggestions.map(x => `<option value="${escapeHtml(x)}"></option>`).join('')}</datalist>
    <label>Başlangıç<input name="start" type="date" value="${date}" required></label>
    <label>Bitiş<input name="end" type="date" value="${date}" required></label>
    <label class="span-2">Görev / Açıklama<input name="task" value="${escapeHtml(current.source === 'manual' ? (current.task || current.note || '') : '')}" placeholder="Örn. Şehir merkezine çıkış yaptı"></label>
    <label class="span-2">Ek not<textarea name="note" placeholder="Varsa ek açıklama, rapor detayı vb.">${escapeHtml(current.source === 'manual' ? (current.note || '') : '')}</textarea></label>
    <div class="span-2 form-note">“Durum” yoklama halini, “Bulunduğu yer” görev yerini; “Görev / Açıklama” ise serbest metinle o günkü görevi belirtir.</div>
    <div class="span-2"><button class="btn btn-primary btn-block">Durumu Kaydet</button></div>
  </form>`);
  document.getElementById('attendanceForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const start=f.get('start'), end=f.get('end');
    if (end < start) return toast('Bitiş tarihi başlangıçtan önce olamaz.');
    db.attendance = (db.attendance || []).filter(x => !(x.userId === user.id && x.start <= date && x.end >= date));
    const location = String(f.get('location') || '').trim();
    db.attendance.push({ id: Date.now(), userId: user.id, status: f.get('status'), start, end, location, task: String(f.get('task') || '').trim(), note: f.get('note'), source: 'manual' });
    logAudit('attendance.update', `${user.name}: ${start}–${end} ${attendanceStatusMeta(f.get('status')).label}${location ? ` · ${location}` : ''}`);
    saveDB();
    closeModal();
    if (currentPage === 'attendance-overview') renderAttendanceOverview();
    else renderAttendanceManagement();
    toast('Yoklama durumu kaydedildi.');
  });
}
function clearManualAttendance(userId) {
  if (!hasPermission('attendance.manage')) return;
  const date = toISO(attendanceDateCursor); const before = db.attendance.length;
  db.attendance = db.attendance.filter(x => !(x.userId === Number(userId) && x.start <= date && x.end >= date));
  if (db.attendance.length === before) return toast('Bu tarihte el ile girilmiş kayıt yok.');
  logAudit('attendance.clear', `${getUser(userId)?.name || userId}: ${date}`); saveDB(); renderAttendanceManagement(); toast('El ile girilen yoklama kaydı kaldırıldı.');
}
function openAttendanceHistory(userId) {
  if (!hasPermission('attendance.view')) return;
  const user=getUser(userId); if(!user) return;
  const manual=(db.attendance||[]).filter(x=>x.userId===user.id).sort((a,b)=>b.start.localeCompare(a.start));
  const leaves=(db.leaveRequests||[]).filter(x=>x.userId===user.id && ['approved','report'].includes(x.status)).sort((a,b)=>b.start.localeCompare(a.start));
  showModal(`${user.name} · Yoklama Geçmişi`, `<div class="quick-list">${[...manual.map(x=>({start:x.start,end:x.end,label:attendanceStatusMeta(x.status).label,location:x.location||'',note:[x.task,x.note].filter(Boolean).join(' · ')||'El ile kayıt'})),...leaves.map(x=>({start:x.start,end:x.end,label:attendanceStatusMeta(attendanceStatusFromLeave(x)).label,location:'',note:`${x.type} · İzin sisteminden`}))].sort((a,b)=>b.start.localeCompare(a.start)).map(x=>`<div class="quick-item"><div><strong>${x.label}${x.location ? ` · ${escapeHtml(x.location)}` : ''}</strong><span>${formatShortDate(x.start)} – ${formatShortDate(x.end)} · ${escapeHtml(x.note)}</span></div></div>`).join('') || '<div class="empty">Geçmiş kayıt bulunmuyor.</div>'}</div>`);
}
function renderAttendanceManagement() {
  if (!hasPermission('attendance.manage')) return goPage('dashboard');
  const date=toISO(attendanceDateCursor), stats=dailyAttendanceStats(date);
  const users=approvedUsers();
  document.getElementById('pageContent').innerHTML=`
    <div class="attendance-toolbar"><div><span class="kitchen-eyebrow">İDARİ İŞLER · GÜNLÜK YOKLAMA</span><h2>${formatDayDate(date)}</h2><p>Personel varsayılan olarak Mevcut kabul edilir. Sadece istisnaları girmeniz yeterlidir.</p></div><div class="calendar-actions"><button class="btn btn-secondary btn-sm" onclick="changeAttendanceDate(-1)">‹ Önceki Gün</button><button class="btn btn-secondary btn-sm" onclick="goTodayAttendance()">Bugün</button><input type="date" value="${date}" onchange="setAttendanceDate(this.value)"><button class="btn btn-primary btn-sm" onclick="changeAttendanceDate(1)">Sonraki Gün ›</button></div></div>
    <div class="grid grid-4 section-gap">${metric('👥','Toplam personel',stats.total+' kişi','Aktif üyeler')}${metric('✅','Mevcut',stats.present+' kişi','Varsayılan durum')}${metric('📌','Mevcut değil',stats.absent+' kişi','İzin, rapor, görev vb.')}${metric('📅','Onaylı izin',((stats.annual_leave||0)+(stats.excuse_leave||0)+(stats.road_leave||0))+' kişi','İzin sisteminden otomatik')}</div>
    <div class="card section-gap"><div class="card-header"><div><h3>Personel durumları</h3><p>İzin sistemi otomatik; idari işler ayrıca personelin bulunduğu yeri (Yemekhane, Nizamiye vb.) kaydedebilir.</p></div></div><div class="table-wrap"><table><thead><tr><th>Personel</th><th>Rütbe / Görev</th><th>Bugünkü durum</th><th>Bulunduğu yer</th><th>Görev / Açıklama</th><th>Kaynak</th><th>Ek not</th><th>İşlem</th></tr></thead><tbody>${users.map(user=>{const a=attendanceForUserDate(user.id,date);return `<tr><td><button class="person-link" onclick="openAttendanceHistory(${user.id})">${escapeHtml(user.name)}</button></td><td>${escapeHtml(user.title||'')}</td><td>${attendanceBadge(a.status)}</td><td><strong>${escapeHtml(a.location||'—')}</strong></td><td>${escapeHtml(a.task||'—')}</td><td>${a.source==='leave'?'İzin sistemi':a.source==='manual'?'İdari işler':'Varsayılan'}</td><td>${escapeHtml(a.note||'—')}</td><td><button class="btn btn-primary btn-sm" onclick="attendanceEditModal(${user.id})">Düzenle</button>${a.source==='manual'?` <button class="btn btn-secondary btn-sm" onclick="clearManualAttendance(${user.id})">Kaydı Kaldır</button>`:''}</td></tr>`}).join('')}</tbody></table></div></div>`;
}
function attendanceGroupHtml(date) {
  const groups={};
  approvedUsers().forEach(u=>{ const a=attendanceForUserDate(u.id,date); (groups[a.status] ||= []).push({user:u, attendance:a}); });
  return Object.entries(attendanceStatuses).filter(([key])=>groups[key]?.length).map(([key])=>`
    <div class="attendance-group">
      <div>${attendanceBadge(key)}<strong>${groups[key].length} kişi</strong></div>
      <div class="attendance-name-list">${groups[key].map(x=>`
        <div class="attendance-name-line">
          <strong>${escapeHtml(x.user.name)}</strong>
          ${x.attendance.location ? `<span>(${escapeHtml(x.attendance.location)})</span>` : ''}
          ${x.attendance.task ? `<small>— ${escapeHtml(x.attendance.task)}</small>` : ''}
        </div>`).join('')}</div>
    </div>`).join('');
}
function attendanceLocationHtml(date) {
  const groups = {};
  approvedUsers().forEach(u => {
    const a = attendanceForUserDate(u.id, date);
    const location = String(a.location || '').trim();
    if (!location) return;
    (groups[location] ||= []).push(u);
  });
  const entries = Object.entries(groups).sort((a,b) => a[0].localeCompare(b[0], 'tr'));
  if (!entries.length) return '<div class="empty">Bu tarih için konum / görev yeri kaydı girilmemiş.</div>';
  return entries.map(([location, users]) => `<div class="attendance-group"><div><span class="attendance-badge att-present">📍 ${escapeHtml(location)}</span><strong>${users.length} kişi</strong></div><div class="attendance-name-list">${users.map(u=>`<div class="attendance-name-line"><strong>${escapeHtml(u.name)}</strong></div>`).join('')}</div></div>`).join('');
}
function renderAttendanceOverview() {
  if (!hasPermission('attendance.view')) return goPage('dashboard');
  const date=toISO(attendanceDateCursor), stats=dailyAttendanceStats(date), week=getWeekDates(attendanceWeekCursor);
  const canEdit = hasPermission('attendance.manage');
  document.getElementById('pageContent').innerHTML=`
    <div class="attendance-toolbar"><div><span class="kitchen-eyebrow">KOMUTANLIK · PERSONEL DURUMU</span><h2>${formatDayDate(date)}</h2><p>Günlük mevcut ile haftalık personel hareketleri tek ekranda.</p></div><div class="calendar-actions"><button class="btn btn-secondary btn-sm" onclick="changeAttendanceDate(-1)">‹ Önceki Gün</button><button class="btn btn-secondary btn-sm" onclick="goTodayAttendance()">Bugün</button><input type="date" value="${date}" onchange="setAttendanceDate(this.value)"><button class="btn btn-primary btn-sm" onclick="changeAttendanceDate(1)">Sonraki Gün ›</button></div></div>

    <div class="grid grid-3 section-gap attendance-main-metrics">
      ${metric('👥','Toplam',stats.total+' kişi','Aktif personel')}
      ${metric('✅','Mevcut',stats.effectivePresent+' kişi',stats.total?(attendancePercent(stats.effectivePresent,stats.total)+' mevcudiyet'):'—')}
      ${metric('🏖️','İzinli',stats.leaveTotal+' kişi','Yıllık, mazeret ve yol izni')}
    </div>

    ${attendanceMiniSummary(stats)}

    <div class="card section-gap"><div class="card-header"><div><h3>Bugünkü detay</h3><p>Durumlara göre isimler alt alta gösterilir; girilmişse bulunduğu yer de görünür.</p></div></div><div class="card-body attendance-groups">${attendanceGroupHtml(date)}</div></div>
    <div class="card section-gap"><div class="card-header"><div><h3>Bulunduğu yere göre dağılım</h3><p>Yemekhane, Nizamiye ve el ile girilen diğer görev yerleri</p></div></div><div class="card-body attendance-groups">${attendanceLocationHtml(date)}</div></div>

    <div class="card section-gap">
      <div class="card-header calendar-toolbar"><div><h3>Haftalık yoklama</h3><p>${weekRangeText(attendanceWeekCursor)}${canEdit ? ' · Rozete dokunarak o günün yoklamasını düzenleyebilirsiniz.' : ''}</p></div><div class="calendar-actions"><button class="btn btn-secondary btn-sm" onclick="changeAttendanceWeek(-1)">‹ Önceki Hafta</button><button class="btn btn-secondary btn-sm" onclick="attendanceWeekCursor=startOfWeek(new Date());renderAttendanceOverview()">Bu Hafta</button><button class="btn btn-primary btn-sm" onclick="changeAttendanceWeek(1)">Sonraki Hafta ›</button></div></div>
      <div class="attendance-week-wrap"><table class="attendance-week-table"><thead><tr><th>Personel</th>${week.map(d=>`<th>${new Intl.DateTimeFormat('tr-TR',{weekday:'short'}).format(parseISO(d))}<small>${formatShortDate(d).slice(0,5)}</small></th>`).join('')}</tr></thead><tbody>${approvedUsers().map(user=>`<tr><td><button class="person-link" onclick="openAttendanceHistory(${user.id})">${escapeHtml(user.name)}</button><small class="table-sub">${escapeHtml(user.title||'')}</small></td>${week.map(d=>{const a=attendanceForUserDate(user.id,d); const content=`${attendanceBadge(a.status,true)}${a.location ? `<small class="attendance-location-mini">${escapeHtml(a.location)}</small>` : ''}${a.task ? `<small class="attendance-task-mini">${escapeHtml(a.task)}</small>` : ''}`; return `<td title="${escapeHtml(a.location || attendanceStatusMeta(a.status).label)}">${canEdit ? `<button class="attendance-cell-button" onclick="attendanceEditModal(${user.id}, '${d}')" aria-label="${escapeHtml(user.name)} ${formatShortDate(d)} yoklamasını düzenle">${content}</button>` : content}</td>`}).join('')}</tr>`).join('')}</tbody></table></div>
    </div>`;
}

function getWeekDates(cursor) { return Array.from({ length: 7 }, (_, i) => toISO(addDays(startOfWeek(cursor), i))); }
function weekRangeText(cursor) { const dates = getWeekDates(cursor); return `${formatShortDate(dates[0])} – ${formatShortDate(dates[6])}`; }
function changeMealWeek(delta, management = false) {
  if (management) mealManagementWeekCursor = addDays(mealManagementWeekCursor, delta * 7);
  else mealWeekCursor = addDays(mealWeekCursor, delta * 7);
  management ? renderMealManagement() : renderMyMeals();
}
function goCurrentMealWeek(management = false) {
  if (management) mealManagementWeekCursor = startOfWeek(new Date());
  else mealWeekCursor = startOfWeek(new Date());
  management ? renderMealManagement() : renderMyMeals();
}
function getMealDay(userId, date) { return db.mealSelections?.[userId]?.[date] || { breakfast: '', dinner: '' }; }
function setMealDay(userId, date, value) {
  db.mealSelections[userId] ||= {};
  db.mealSelections[userId][date] = value;
}
function mealDayReservedCount(day, userId = currentUser?.id, date = '') {
  if (!userId || !date) return Object.values(day || {}).filter(v => v !== 'no').length;
  return ['breakfast','dinner'].filter(meal => ['yes','duty'].includes(effectiveMealStatus(userId,date,meal))).length;
}
function mealChoice(name, value, selected) {
  const labels = { no: 'Yemeyeceğim', duty: 'Görevdeyim / Ayır' };
  return `<label class="meal-pill ${selected === value ? 'selected' : ''}"><input type="radio" name="${name}" value="${value}" ${selected === value ? 'checked' : ''}><span>${labels[value]}</span></label>`;
}
function bindMealPills() {
  document.querySelectorAll('.meal-pill input').forEach(input => input.addEventListener('change', () => {
    document.querySelectorAll(`input[name="${CSS.escape(input.name)}"]`).forEach(x => x.closest('.meal-pill').classList.toggle('selected', x.checked));
  }));
}
function fillAllMeals(value) {
  document.querySelectorAll('#mealForm .meal-pill input').forEach(input => {
    input.checked = input.value === value;
    input.closest('.meal-pill').classList.toggle('selected', input.checked);
  });
}
function renderMyMeals() {
  const dates = getWeekDates(mealWeekCursor);
  const totalReserved = dates.reduce((sum, date) => sum + ['breakfast','dinner'].filter(meal => ['yes','duty'].includes(effectiveMealStatus(currentUser.id,date,meal))).length, 0);
  const dutyCount = dates.reduce((sum, date) => sum + ['breakfast','dinner'].filter(meal => effectiveMealStatus(currentUser.id,date,meal) === 'duty').length, 0);
  document.getElementById('pageContent').innerHTML = `
    <div class="summary-strip"><div><strong>${weekRangeText(mealWeekCursor)} yemek listesi</strong><div class="form-note">Seçimler aşçıya hazırlanacak yemek sayısını bildirir. “Yemeyeceğim” tabldot borcunu azaltmaz.</div></div><div><strong>Aşçıya ayrılacak: ${totalReserved} öğün</strong><div class="form-note">Görevde ayrılacak: ${dutyCount} öğün</div></div></div>
    <div class="card section-gap"><div class="card-header calendar-toolbar"><div><h3>Tarihli yemek tercihleri</h3><p>Seçimler mutfak hazırlık sayısı içindir. “Yemeyeceğim” seçimi ortak tabldot giderinden düşmez; yalnızca onaylı yıllık izin günleri tabldot dışıdır.</p></div><div class="calendar-actions"><button class="btn btn-secondary btn-sm" onclick="changeMealWeek(-1)">‹ Önceki Hafta</button><button class="btn btn-secondary btn-sm" onclick="goCurrentMealWeek()">Bu Hafta</button><button class="btn btn-primary btn-sm" onclick="changeMealWeek(1)">Sonraki Hafta ›</button></div></div>
      <div class="card-body">
        <form id="mealForm">
          <div class="meal-mobile-list">
          ${dates.map(date => {
            const day = getMealDay(currentUser.id, date);
            const leave = isApprovedAnnualLeaveOnDate(currentUser.id,date);
            return `<section class="meal-day-card ${leave ? 'meal-on-leave' : ''}">
              <div class="meal-day-head"><div><strong>${formatDayDate(date)}</strong><small>${date}</small></div>${leave ? '<span class="status warning">Yıllık izin · Tabldot dışı</span>' : '<span class="status success">Varsayılan: Yiyecek</span>'}</div>
              <div class="meal-day-grid">${['breakfast','dinner'].map(meal => `<div class="meal-unit"><strong>${mealNames[meal]}</strong>${leave ? '<span class="meal-leave-note">İzin nedeniyle ücret yansımaz</span>' : `<div class="meal-choice-group">${mealChoice(`${date}-${meal}`,'no',day[meal])}${mealChoice(`${date}-${meal}`,'duty',day[meal])}</div><button type="button" class="text-button meal-reset" onclick="clearMealChoice('${date}','${meal}')">Varsayılana dön</button>`}</div>`).join('')}</div>
            </section>`;
          }).join('')}
          </div>
          <button class="btn btn-primary section-gap" type="submit">Tarihli Listeyi Kaydet</button>
        </form>
      </div></div>`;
  bindMealPills();
  document.getElementById('mealForm').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target);
    dates.forEach(date => {
      if (isApprovedAnnualLeaveOnDate(currentUser.id,date)) return;
      setMealDay(currentUser.id, date, {
        breakfast: f.get(`${date}-breakfast`) || '',
        dinner: f.get(`${date}-dinner`) || ''
      });
    });
    saveDB(); renderMyMeals(); toast('Yemek tercihleriniz kaydedildi.');
  });
}

function clearMealChoice(date, meal) {
  const day = getMealDay(currentUser.id, date);
  day[meal] = '';
  setMealDay(currentUser.id, date, day);
  saveDB(); renderMyMeals(); toast('Öğün varsayılan Yiyecek durumuna döndürüldü.');
}

function mealDateSummary(date) {
  const users = approvedUsers();
  const summary = { breakfast: 0, dinner: 0, duty: 0, no: 0, leave: 0 };
  users.forEach(user => {
    ['breakfast','dinner'].forEach(meal => {
      const status = effectiveMealStatus(user.id,date,meal);
      if (status === 'yes' || status === 'duty') summary[meal]++;
      if (status === 'duty') summary.duty++;
      if (status === 'no') summary.no++;
      if (status === 'leave') summary.leave++;
    });
  });
  return summary;
}
function renderMealManagement() {
  if (!hasPermission('meal.manage')) return goPage('dashboard');
  const dates = getWeekDates(mealManagementWeekCursor);
  const users = approvedUsers();
  const total = dates.reduce((sum, date) => { const x = mealDateSummary(date); return sum + x.breakfast + x.dinner; }, 0);
  document.getElementById('pageContent').innerHTML = `
    <div class="grid grid-4">${metric('🍲', 'Hazırlanacak toplam öğün', total, weekRangeText(mealManagementWeekCursor))}${metric('👥', 'Aktif personel', users.length + ' kişi', 'Tercih yoksa yemek hazırlanır')}${metric('🏖️', 'İzin nedeniyle düşen', dates.reduce((s,d)=>s+mealDateSummary(d).leave,0) + ' öğün', 'Sadece onaylı yıllık izin')}${metric('🧾', 'Kayıtlı malzeme gideri', money(db.expenses.reduce((s, x) => s + x.amount, 0)), 'Mali dağıtım bilanço sayfasındadır')}</div>
    <div class="card section-gap"><div class="card-header calendar-toolbar"><div><h3>Tarihli toplu yemek listesi</h3><p>Varsayılan durum Yiyecek; sadece Yemeyeceğim, Görevde/Ayır ve onaylı yıllık izin istisnaları gösterilir.</p></div><div class="calendar-actions"><button class="btn btn-secondary btn-sm" onclick="changeMealWeek(-1,true)">‹ Önceki Hafta</button><button class="btn btn-secondary btn-sm" onclick="goCurrentMealWeek(true)">Bu Hafta</button><button class="btn btn-primary btn-sm" onclick="changeMealWeek(1,true)">Sonraki Hafta ›</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>Tarih</th><th>Sabah</th><th>Akşam</th><th>Görevde/Ayır</th><th>Yemeyecek</th><th>İzin düşümü</th><th>Detay</th></tr></thead><tbody>${dates.map(date => { const x = mealDateSummary(date); return `<tr><td><strong>${formatDayDate(date)}</strong></td><td>${x.breakfast} kişi</td><td>${x.dinner} kişi</td><td>${x.duty} öğün</td><td>${x.no} öğün</td><td>${x.leave} öğün</td><td><button class="btn btn-secondary btn-sm" onclick="openMealDateDetail('${date}')">Personel Listesi</button></td></tr>`; }).join('')}</tbody></table></div>
    </div>`;
}
function openMealDateDetail(date) {
  if (!hasPermission('meal.manage')) return;
  const rows = approvedUsers().map(user => `<tr><td><strong>${escapeHtml(user.name)}</strong></td>${['breakfast','dinner'].map(meal => `<td>${mealStatusChip(effectiveMealStatus(user.id,date,meal))}</td>`).join('')}</tr>`).join('');
  showModal(`${formatDayDate(date)} · Yemek Durumu`, `<div class="table-wrap"><table><thead><tr><th>Personel</th><th>Sabah</th><th>Akşam</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}
function mealStatusChip(status) {
  const label = status === 'yes' ? 'Yiyecek (varsayılan)' : status === 'duty' ? 'Görevde / Ayır' : status === 'no' ? 'Yemeyecek' : status === 'leave' ? 'Yıllık izin · Tabldot dışı' : 'Yiyecek (varsayılan)';
  const cls = status === 'yes' ? 'success' : status === 'duty' ? 'info' : status === 'no' ? 'neutral' : status === 'leave' ? 'warning' : 'success';
  return `<span class="status ${cls}">${label}</span>`;
}
function expenseModal() {
  if (!hasPermission('meal.manage')) return;
  showModal('Yeni Gider Ekle', `<form id="expenseForm" class="form-grid"><label>Tarih<input name="date" type="date" value="${toISO(new Date())}" required></label><label>Tutar<input name="amount" type="number" step="0.01" required></label><label class="span-2">Açıklama<input name="name" required></label><div class="span-2"><button class="btn btn-primary btn-block">Gideri Kaydet</button></div></form>`);
  document.getElementById('expenseForm').addEventListener('submit', e => { e.preventDefault(); const f = new FormData(e.target); db.expenses.push({ id: Date.now(), date: f.get('date'), name: f.get('name'), amount: Number(f.get('amount')) }); logAudit('expense.create', `${f.get('date')} · ${f.get('name')} · ${money(Number(f.get('amount')))}`); saveDB(); closeModal(); currentPage === 'finance-management' ? renderFinanceManagement() : renderMealManagement(); toast('Gider kaydı eklendi.'); });
}

function editExpenseModal(id) {
  if (!hasPermission('finance.manage') && !hasPermission('meal.manage')) return;
  const x = db.expenses.find(e => e.id === Number(id)); if (!x) return;
  showModal('Malzeme / Gider Düzenle', `<form id="editExpenseForm" class="form-grid">
    <label>Tarih<input name="date" type="date" value="${x.date}" required></label>
    <label>Tutar<input name="amount" type="number" step="0.01" min="0" value="${Number(x.amount || 0)}" required></label>
    <label class="span-2">Malzeme / Açıklama<input name="name" value="${escapeHtml(x.name || '')}" required></label>
    <div class="span-2"><button class="btn btn-primary btn-block">Değişiklikleri Kaydet</button></div>
  </form>`);
  document.getElementById('editExpenseForm').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target);
    const before = { date: x.date, name: x.name, amount: x.amount };
    const oldPeriod = String(x.date).slice(0,7);
    x.date = f.get('date'); x.name = String(f.get('name') || '').trim(); x.amount = Number(f.get('amount') || 0);
    const newPeriod = String(x.date).slice(0,7);
    logAudit('expense.update', `${before.date} · ${before.name} · ${money(before.amount)} → ${x.date} · ${x.name} · ${money(x.amount)}`);
    recalculateExistingPeriodDebts(oldPeriod);
    if (newPeriod !== oldPeriod) recalculateExistingPeriodDebts(newPeriod);
    saveDB(); closeModal(); renderFinanceManagement(); toast('Gider kaydı güncellendi; mevcut dönem borçları yeniden hesaplandı.');
  });
}
function deleteExpense(id) {
  if (!hasPermission('finance.manage') && !hasPermission('meal.manage')) return;
  const x = db.expenses.find(e => e.id === Number(id)); if (!x) return;
  if (!confirm(`${x.name} gider kaydı silinsin mi?`)) return;
  const period = String(x.date).slice(0,7);
  db.expenses = db.expenses.filter(e => e.id !== Number(id));
  logAudit('expense.delete', `${x.date} · ${x.name} · ${money(x.amount)} silindi`);
  recalculateExistingPeriodDebts(period);
  saveDB(); renderFinanceManagement(); toast('Gider kaydı silindi; mevcut dönem borçları yeniden hesaplandı.');
}
function periodLabelFromKey(period) {
  const [y,m] = period.split('-').map(Number);
  return new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric'}).format(new Date(y,m-1,1));
}
function balanceRowsForPeriod(period) {
  const [py,pm] = period.split('-').map(Number), lastDay = new Date(py,pm,0).getDate();
  const start = `${py}-${pad(pm)}-01`, end = `${py}-${pad(pm)}-${pad(lastDay)}`;
  const totalExpense = db.expenses.filter(x=>x.date>=start&&x.date<=end).reduce((a,x)=>a+Number(x.amount||0),0);
  const rows = approvedUsers().map(user => ({ user, count: tabldotMealCountForRange(user.id, start, end) }));
  const totalMeals = rows.reduce((a,x)=>a+x.count,0), unit = totalMeals ? totalExpense / totalMeals : 0;
  return { start, end, totalExpense, rows, totalMeals, unit, label: periodLabelFromKey(period) };
}
function annualLeaveRangesForPeriod(userId, start, end) {
  return db.leaveRequests
    .filter(x => x.userId === Number(userId) && x.status === 'approved' && x.type === 'Yıllık İzin' && x.start <= end && x.end >= start)
    .map(x => {
      const clippedStart = x.start < start ? start : x.start;
      const clippedEnd = x.end > end ? end : x.end;
      return { ...x, clippedStart, clippedEnd, periodDays: daysBetween(clippedStart, clippedEnd), totalDays: Number(x.days || daysBetween(x.start, x.end)) };
    })
    .sort((a,b) => a.clippedStart.localeCompare(b.clippedStart));
}
function annualLeavePeriodHtml(userId, start, end) {
  const ranges = annualLeaveRangesForPeriod(userId, start, end);
  return ranges.length ? ranges.map(x => `<div class="report-leave-range"><strong>${formatShortDate(x.clippedStart)} – ${formatShortDate(x.clippedEnd)}</strong><span>${x.periodDays} gün${(x.clippedStart !== x.start || x.clippedEnd !== x.end) ? ` · Tam izin: ${formatShortDate(x.start)} – ${formatShortDate(x.end)} (${x.totalDays} gün)` : ''}</span></div>`).join('') : '—';
}
function recalculateExistingPeriodDebts(period) {
  if (!period) return;
  const calc = balanceRowsForPeriod(period);
  if (!db.debts.some(d => d.period === calc.label)) return;
  calc.rows.forEach(x => {
    const amount = Number((x.count * calc.unit).toFixed(2));
    const d = db.debts.find(d => d.userId === x.user.id && d.period === calc.label);
    if (d) d.amount = amount;
  });
}



function getMealStatusGroups(date, meal) {
  const groups = { yes: [], duty: [], no: [], leave: [] };
  approvedUsers().forEach(user => groups[effectiveMealStatus(user.id,date,meal)].push(user));
  return groups;
}
function cookMealStats(date, meal) {
  const groups = getMealStatusGroups(date, meal);
  return { prepared: groups.yes.length + groups.duty.length, yes: groups.yes.length, duty: groups.duty.length, no: groups.no.length, leave: groups.leave.length, total: approvedUsers().length };
}
function changeCookDate(delta) {
  cookDateCursor = addDays(cookDateCursor, delta);
  renderCookDashboard();
}
function goTodayCookDate() {
  cookDateCursor = new Date();
  renderCookDashboard();
}
function setCookDate(value) {
  if (!value) return;
  cookDateCursor = parseISO(value);
  renderCookDashboard();
}
function kitchenMealCard(date, meal) {
  const stats = cookMealStats(date, meal);
  const warning = stats.leave ? `<div class="kitchen-ready">🏖️ ${stats.leave} personel yıllık izin nedeniyle tabldot dışı</div>` : `<div class="kitchen-ready">✓ Varsayılan yemek listesi aktif</div>`;
  return `<article class="card kitchen-meal-card">
    <div class="kitchen-meal-head"><div><span>${meal === 'breakfast' ? '☕' : '🍽'}</span><h3>${mealNames[meal]}</h3></div><button class="btn btn-secondary btn-sm" onclick="openCookMealDetail('${date}','${meal}')">İsim Listesi</button></div>
    <div class="kitchen-main-number"><strong>${stats.prepared}</strong><span>yemek hazırlanacak</span></div>
    <div class="kitchen-stat-grid">
      <div><strong>${stats.yes}</strong><span>Yerinde yiyecek</span></div>
      <div><strong>${stats.duty}</strong><span>Görevde / Ayrılacak</span></div>
      <div><strong>${stats.no}</strong><span>Yemeyecek</span></div>
      <div><strong>${stats.leave}</strong><span>Yıllık izin</span></div>
    </div>
    ${warning}
  </article>`;
}
function renderCookDashboard() {
  if (!hasCookPermission()) return goPage('dashboard');
  const date = toISO(cookDateCursor);
  const stats = ['breakfast', 'dinner'].map(meal => cookMealStats(date, meal));
  const totalPrepared = stats.reduce((sum, x) => sum + x.prepared, 0);
  const totalDuty = stats.reduce((sum, x) => sum + x.duty, 0);
  const totalLeave = stats.reduce((sum, x) => sum + x.leave, 0);
  document.getElementById('pageContent').innerHTML = `
    <div class="kitchen-topbar">
      <div><span class="kitchen-eyebrow">GÜNLÜK MUTFAK PLANI</span><h2>${formatDayDate(date)}</h2><p>Tercih yapmayan personel varsayılan olarak yiyecek kabul edilir; Görevdeyim / Ayır da hazırlanacak sayıya dahildir.</p></div>
      <div class="calendar-actions kitchen-date-actions"><button class="btn btn-secondary btn-sm" onclick="changeCookDate(-1)">‹ Önceki Gün</button><button class="btn btn-secondary btn-sm" onclick="goTodayCookDate()">Bugün</button><input type="date" value="${date}" onchange="setCookDate(this.value)" aria-label="Mutfak tarihi"><button class="btn btn-primary btn-sm" onclick="changeCookDate(1)">Sonraki Gün ›</button></div>
    </div>
    <div class="grid grid-4 section-gap kitchen-overview">
      ${metric('🍽', 'Toplam hazırlanacak', totalPrepared + ' öğün', 'İki öğünün toplamı')}
      ${metric('📦', 'Görev için ayrılacak', totalDuty + ' paket', 'Görevdeyim / Ayır seçimleri')}
      ${metric('👥', 'Aktif personel', approvedUsers().length + ' kişi', 'Her öğün için değerlendirilen')}
      ${metric('🏖️', 'Yıllık izin düşümü', totalLeave + ' öğün', 'Onaylı yıllık izin nedeniyle hazırlanmayacak')}
    </div>
    <div class="kitchen-meals section-gap">${['breakfast', 'dinner'].map(meal => kitchenMealCard(date, meal)).join('')}</div>
    <div class="card section-gap"><div class="card-header"><div><h3>Günlük hazırlık özeti</h3><p>Aşçının hızlı kontrol listesi</p></div><div class="toolbar-right"><button class="btn btn-secondary btn-sm" onclick="renderCookDashboard()">↻ Yenile</button><button class="btn btn-secondary btn-sm" onclick="window.print()">Yazdır</button></div></div>
      <div class="table-wrap"><table class="kitchen-summary-table"><thead><tr><th>Öğün</th><th>Hazırlanacak</th><th>Yerinde yiyecek</th><th>Görevde / Ayrılacak</th><th>Yemeyecek</th><th>Yıllık izin</th><th>Liste</th></tr></thead><tbody>${['breakfast','dinner'].map(meal => { const x = cookMealStats(date, meal); return `<tr><td><strong>${mealNames[meal]}</strong></td><td><span class="kitchen-table-total">${x.prepared}</span></td><td>${x.yes}</td><td>${x.duty}</td><td>${x.no}</td><td>${x.leave}</td><td><button class="btn btn-secondary btn-sm" onclick="openCookMealDetail('${date}','${meal}')">İsimleri Gör</button></td></tr>`; }).join('')}</tbody></table></div>
    </div>`;
}
function openCookMealDetail(date, meal) {
  if (!hasCookPermission()) return;
  const groups = getMealStatusGroups(date, meal);
  const groupBlock = (title, users, cls) => `<section class="kitchen-name-group ${cls}"><div><strong>${title}</strong><span>${users.length} kişi</span></div>${users.length ? `<ul>${users.map(user => `<li>${escapeHtml(user.name)}<small>${escapeHtml(user.title || '')}</small></li>`).join('')}</ul>` : '<p>Personel bulunmuyor.</p>'}</section>`;
  showModal(`${formatDayDate(date)} · ${mealNames[meal]}`, `<div class="kitchen-detail-summary"><strong>${groups.yes.length + groups.duty.length}</strong><span>toplam yemek hazırlanacak</span></div><div class="kitchen-name-groups">${groupBlock('Yerinde yiyecek', groups.yes, 'yes')}${groupBlock('Görevde / Ayrılacak', groups.duty, 'duty')}${groupBlock('Yemeyecek', groups.no, 'no')}${groupBlock('Yıllık izin / Tabldot dışı', groups.leave, 'missing')}</div>`);
}

function renderMyFinance() {
  const debts = db.debts.filter(x => x.userId === currentUser.id);
  document.getElementById('pageContent').innerHTML = `
    <div class="grid grid-3">${metric('₺', 'Toplam borç', money(debts.reduce((s, x) => s + x.amount, 0)), 'Dönem borçları')}${metric('✅', 'Ödenen', money(debts.reduce((s, x) => s + x.paid, 0)), 'Onaylanan ödemeler')}${metric('⏳', 'Kalan', money(debts.reduce((s, x) => s + Math.max(0, x.amount - x.paid), 0)), 'Ödeme bekleniyor')}</div>
    <div class="grid grid-2 section-gap"><div class="card"><div class="card-header"><div><h3>Ödeme bilgileri</h3><p>Havale açıklamasına ad soyad yazınız</p></div></div><div class="card-body">${db.settings.bankName ? `<label>Banka<input value="${escapeHtml(db.settings.bankName)}" readonly></label>` : ''}<label class="${db.settings.bankName ? 'section-gap' : ''}">Hesap sahibi<input value="${escapeHtml(db.settings.accountName)}" readonly></label><label class="section-gap">IBAN<input id="ibanInput" value="${escapeHtml(db.settings.iban)}" readonly></label><button class="btn btn-secondary section-gap" onclick="copyIban()">IBAN'ı Kopyala</button></div></div>
    <div class="card"><div class="card-header"><div><h3>Ödeme bildirimi</h3><p>Yaptığınız ödemeyi yönetime gönderin</p></div></div><div class="card-body"><button class="btn btn-primary" onclick="paymentModal()">Ödeme Bildir</button></div></div></div>
    <div class="card section-gap"><div class="card-header"><div><h3>Borç dökümü</h3><p>Dönem bazında ödeme durumunuz</p></div></div><div class="table-wrap"><table><thead><tr><th>Dönem</th><th>Borç</th><th>Ödenen</th><th>Kalan</th><th>Durum</th></tr></thead><tbody>${debts.map(x => `<tr><td>${x.period}</td><td>${money(x.amount)}</td><td>${money(x.paid)}</td><td><strong>${money(Math.max(0, x.amount - x.paid))}</strong></td><td>${statusBadge(x.paid >= x.amount ? 'paid' : 'unpaid')}</td></tr>`).join('')}</tbody></table></div></div>`;
}

function renderBalanceView() {
  const period = balanceViewPeriod;
  const calc = balanceRowsForPeriod(period);
  const expenses = db.expenses.filter(x => x.date >= calc.start && x.date <= calc.end);
  const own = calc.rows.find(x => x.user.id === currentUser.id);
  const debt = db.debts.find(x => x.userId === currentUser.id && x.period === calc.label);
  document.getElementById('pageContent').innerHTML = `<div class="finance-page public-balance-page">
    <div class="card"><div class="card-header calendar-toolbar"><div><h3>📊 Tabldot Bilançosu · ${calc.label}</h3><p>Personel için salt okunur aylık bilanço görünümü. Ortak giderden yalnızca onaylı yıllık izin günleri düşülür.</p></div><div class="calendar-actions"><input type="month" value="${period}" onchange="setBalanceViewPeriod(this.value)"><button class="btn btn-secondary btn-sm" onclick="printBalance('${period}')">PDF / Yazdır</button></div></div></div>
    <div class="grid grid-4 section-gap finance-summary">
      ${metric('🧾','Toplam gider',money(calc.totalExpense),expenses.length+' gider kaydı')}
      ${metric('🍽','Toplam tabldot öğünü',calc.totalMeals,'Sabah + Akşam')}
      ${metric('₺','Öğün birim maliyeti',money(calc.unit),'Gider / toplam tabldot öğünü')}
      ${metric('👤','Sizin hesaplanan payınız',money((own?.count||0)*calc.unit),`${own?.count||0} tabldot öğünü`)}
    </div>
    ${debt ? `<div class="card section-gap personal-balance-highlight"><div class="card-body"><strong>Kayıtlı dönem borcunuz: ${money(debt.amount)}</strong><span>Ödenen: ${money(debt.paid)} · Kalan: ${money(Math.max(0,debt.amount-debt.paid))}</span></div></div>` : ''}
    <div class="grid grid-2 section-gap finance-detail-grid">
      <div class="card"><div class="card-header"><div><h3>Alınan malzemeler / giderler</h3><p>${formatShortDate(calc.start)} – ${formatShortDate(calc.end)}</p></div></div><div class="table-wrap"><table><thead><tr><th>Tarih</th><th>Malzeme / Açıklama</th><th>Tutar</th></tr></thead><tbody>${expenses.map(x=>`<tr><td>${formatShortDate(x.date)}</td><td>${escapeHtml(x.name)}</td><td><strong>${money(x.amount)}</strong></td></tr>`).join('')||'<tr><td colspan="3">Bu dönemde gider kaydı yok.</td></tr>'}</tbody></table></div></div>
      <div class="card"><div class="card-header"><div><h3>Personel tabldot hesabı</h3><p>Şeffaf aylık hesap dökümü · ödeme durumları bu tabloda gösterilmez.</p></div></div><div class="table-wrap"><table><thead><tr><th>Personel</th><th>Öğün</th><th>Hesaplanan Tutar</th><th>Yıllık İzin</th></tr></thead><tbody>${calc.rows.map(x=>`<tr class="${x.user.id===currentUser.id?'current-user-row':''}"><td><strong>${escapeHtml(x.user.name)}</strong></td><td>${x.count}</td><td>${money(x.count*calc.unit)}</td><td>${annualLeavePeriodHtml(x.user.id,calc.start,calc.end)}</td></tr>`).join('')}</tbody></table></div></div>
    </div>
  </div>`;
}
function setBalanceViewPeriod(value) { if (!value) return; balanceViewPeriod = value; renderBalanceView(); }

function paymentInfoModal() {
  if (!hasPermission('finance.manage')) return;
  showModal('Ödeme / IBAN Bilgilerini Düzenle', `<form id="paymentInfoForm" class="form-grid">
    <label class="span-2">Banka adı<input name="bankName" value="${escapeHtml(db.settings.bankName || '')}" placeholder="Örn. Ziraat Bankası"></label>
    <label class="span-2">Hesap sahibi<input name="accountName" value="${escapeHtml(db.settings.accountName || '')}" required></label>
    <label class="span-2">IBAN<input name="iban" value="${escapeHtml(db.settings.iban || '')}" required></label>
    <div class="span-2"><button class="btn btn-primary btn-block">Ödeme Bilgilerini Kaydet</button></div>
  </form>`);
  document.getElementById('paymentInfoForm').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target);
    const before = `${db.settings.bankName || ''} | ${db.settings.accountName || ''} | ${db.settings.iban || ''}`;
    db.settings.bankName = String(f.get('bankName') || '').trim();
    db.settings.accountName = String(f.get('accountName') || '').trim();
    db.settings.iban = String(f.get('iban') || '').trim();
    logAudit('finance.payment_info', `Ödeme bilgileri güncellendi: ${before} → ${db.settings.bankName} | ${db.settings.accountName} | ${db.settings.iban}`);
    saveDB(); closeModal(); renderFinanceManagement(); toast('IBAN ve hesap bilgileri güncellendi.');
  });
}

function renderFinanceManagement() {
  if (!hasPermission('finance.manage')) return goPage('dashboard');
  const now = new Date();
  const period = db.settings.balancePeriod || `${now.getFullYear()}-${pad(now.getMonth()+1)}`;
  const calc = balanceRowsForPeriod(period);
  const periodExpenses = db.expenses.filter(x => x.date >= calc.start && x.date <= calc.end);
  const existingDebts = db.debts.filter(x => x.period === calc.label);
  const periodPayments = db.payments.filter(x => x.period === calc.label).sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
  const pendingPayments = periodPayments.filter(x => x.status === 'pending');

  document.getElementById('pageContent').innerHTML=`
    <div class="finance-page">
      <div class="card"><div class="card-header calendar-toolbar"><div><h3>Tabldot Bilanço · ${calc.label}</h3><p>Ortak gider tüm personele Sabah + Akşam tabldot payı üzerinden dağıtılır. “Yemeyeceğim” yalnızca aşçı sayısını azaltır; borcu azaltmaz. Sadece onaylı yıllık izin günleri mali hesaptan düşer.</p></div><div class="calendar-actions"><input id="balancePeriodInput" type="month" value="${period}" onchange="setBalancePeriod(this.value)"><button class="btn btn-secondary btn-sm" onclick="paymentInfoModal()">IBAN / Hesap</button><button class="btn btn-secondary btn-sm" onclick="expenseModal()">Malzeme / Gider Ekle</button><button class="btn btn-primary btn-sm" onclick="calculateBalanceDebts()">Borçları Hesapla</button><button class="btn btn-secondary btn-sm" onclick="printBalance()">PDF / Yazdır</button></div></div></div>
      <div class="grid grid-4 section-gap finance-summary">
        ${metric('🧾','Toplam malzeme gideri',money(calc.totalExpense),periodExpenses.length+' kalem')}
        ${metric('🍽','Toplam tabldot öğünü',calc.totalMeals,'Sadece onaylı yıllık izin düşülür')}
        ${metric('₺','Öğün birim maliyeti',money(calc.unit),'Gider / toplam tabldot öğünü')}
        ${metric('👥','Borçlandırılacak personel',calc.rows.filter(x=>x.count>0).length+' kişi','Yıllık izinde olmayan personel')}
      </div>
      ${pendingPayments.length ? `<div class="card section-gap payment-approval-card"><div class="card-header"><div><h3>Ödeme Onayı</h3><p>${pendingPayments.length} ödeme bildirimi onay bekliyor.</p></div></div><div class="table-wrap"><table><thead><tr><th>Personel</th><th>Dönem</th><th>Tarih</th><th>Tutar</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>${pendingPayments.map(p=>`<tr><td><strong>${escapeHtml(getUser(p.userId)?.name||'-')}</strong></td><td>${escapeHtml(p.period||'-')}</td><td>${p.date?formatShortDate(p.date):'—'}</td><td>${money(p.amount)}</td><td>${statusBadge('pending')}</td><td>${canEditPaymentStatus()?`<button class="btn btn-success btn-sm" onclick="approvePayment(${p.id})">Onayla</button> <button class="btn btn-danger btn-sm" onclick="rejectPayment(${p.id})">Reddet</button>`:'Admin / Tabldot onayı'}</td></tr>`).join('')}</tbody></table></div></div>` : `<div class="card section-gap payment-approval-card"><div class="card-header"><div><h3>Ödeme Onayı</h3><p>Bu dönemde onay bekleyen ödeme bildirimi bulunmuyor.</p></div></div><div class="empty">Onay bekleyen ödeme yok.</div></div>`}
      <div class="grid grid-2 section-gap finance-detail-grid">
        <div class="card"><div class="card-header"><div><h3>Alınan malzemeler / giderler</h3><p>${formatShortDate(calc.start)} – ${formatShortDate(calc.end)}</p></div></div><div class="table-wrap"><table><thead><tr><th>Tarih</th><th>Malzeme / Açıklama</th><th>Tutar</th><th>İşlem</th></tr></thead><tbody>${periodExpenses.map(x=>`<tr><td>${formatShortDate(x.date)}</td><td>${escapeHtml(x.name)}</td><td><strong>${money(x.amount)}</strong></td><td><button class="btn btn-secondary btn-sm" onclick="editExpenseModal(${x.id})">Düzenle</button> <button class="btn btn-danger btn-sm" onclick="deleteExpense(${x.id})">Sil</button></td></tr>`).join('')||'<tr><td colspan="4">Bu dönemde gider kaydı yok.</td></tr>'}</tbody></table></div></div>
        <div class="card"><div class="card-header"><div><h3>Personel tabldot hesabı</h3><p>Kişi borcu = tabldot öğünü × birim maliyet. “Yemeyeceğim” mali payı değiştirmez.</p></div></div><div class="table-wrap"><table><thead><tr><th>Personel</th><th>Tabldot Öğünü</th><th>Hesaplanan Tutar</th><th>Kayıtlı Borç</th></tr></thead><tbody>${calc.rows.map(x=>{const d=existingDebts.find(d=>d.userId===x.user.id);return `<tr><td>${escapeHtml(x.user.name)}</td><td>${x.count}</td><td>${money(x.count*calc.unit)}</td><td>${d?money(d.amount):'—'}</td></tr>`}).join('')}</tbody></table></div></div>
      </div>
      <div class="card section-gap"><div class="card-header"><div><h3>Ödeme ve tahsilat</h3><p>Onaylanmış ödemeler ve dönem borçları${canEditPaymentStatus() ? ' · Admin ve Tabldot Sorumlusu ödeme durumunu elle düzeltebilir.' : ''}</p></div></div><div class="table-wrap"><table><thead><tr><th>Personel</th><th>Dönem</th><th>Borç</th><th>Ödenen</th><th>Kalan</th><th>Durum</th>${canEditPaymentStatus()?'<th>İşlem</th>':''}</tr></thead><tbody>${existingDebts.map(x=>`<tr><td>${escapeHtml(getUser(x.userId)?.name||'-')}</td><td>${escapeHtml(x.period)}</td><td>${money(x.amount)}</td><td>${money(x.paid)}</td><td>${money(Math.max(0,x.amount-x.paid))}</td><td>${statusBadge(x.paid>=x.amount?'paid':x.paid>0?'partial':'unpaid')}</td>${canEditPaymentStatus()?`<td><button class="btn btn-secondary btn-sm" onclick="editDebtPaymentModal(${x.id})">Düzenle</button></td>`:''}</tr>`).join('')||`<tr><td colspan="${canEditPaymentStatus()?7:6}">Bu dönem borçları henüz hesaplanmadı.</td></tr>`}</tbody></table></div></div>
      ${periodPayments.length ? `<div class="card section-gap"><div class="card-header"><div><h3>Ödeme bildirim geçmişi</h3><p>Personelin gönderdiği ödeme bildirimlerinin durumu.</p></div></div><div class="table-wrap"><table><thead><tr><th>Personel</th><th>Tarih</th><th>Tutar</th><th>Durum</th></tr></thead><tbody>${periodPayments.map(p=>`<tr><td>${escapeHtml(getUser(p.userId)?.name||'-')}</td><td>${p.date?formatShortDate(p.date):'—'}</td><td>${money(p.amount)}</td><td>${statusBadge(p.status || 'pending')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    </div>`;
}


function editDebtPaymentModal(id) {
  if (!canEditPaymentStatus()) return toast('Ödeme durumunu yalnızca Admin veya Tabldot Sorumlusu düzenleyebilir.');
  const debt = db.debts.find(x => x.id === Number(id)); if (!debt) return;
  const currentStatus = Number(debt.paid||0) >= Number(debt.amount||0) ? 'paid' : Number(debt.paid||0) > 0 ? 'partial' : 'unpaid';
  showModal(`${getUser(debt.userId)?.name || 'Personel'} · Ödeme Durumu`, `<form id="debtPaymentEditForm" class="form-grid">
    <label>Borç tutarı<input value="${money(debt.amount)}" readonly></label>
    <label>Durum<select name="status"><option value="unpaid" ${currentStatus==='unpaid'?'selected':''}>Ödenmedi</option><option value="partial" ${currentStatus==='partial'?'selected':''}>Kısmi ödendi</option><option value="paid" ${currentStatus==='paid'?'selected':''}>Ödendi</option></select></label>
    <label class="span-2">Ödenen tutar<input name="paid" type="number" min="0" step="0.01" value="${Number(debt.paid||0).toFixed(2)}"></label>
    <label class="span-2">Düzeltme notu<textarea name="note" placeholder="İsteğe bağlı açıklama"></textarea></label>
    <div class="span-2"><button class="btn btn-primary btn-block">Ödeme Durumunu Kaydet</button></div>
  </form>`);
  document.getElementById('debtPaymentEditForm').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target); const status = String(f.get('status')); const before = Number(debt.paid||0);
    let paid = Number(f.get('paid') || 0);
    if (status === 'paid') paid = Number(debt.amount||0);
    if (status === 'unpaid') paid = 0;
    if (status === 'partial') paid = Math.max(0, Math.min(Number(debt.amount||0), paid));
    debt.paid = Number(paid.toFixed(2)); debt.paymentEditedAt = new Date().toISOString(); debt.paymentEditedBy = currentUser.id; debt.paymentEditNote = String(f.get('note')||'').trim();
    logAudit('finance.payment_status_edit', `${getUser(debt.userId)?.name||'-'} · ${debt.period}: ${money(before)} → ${money(debt.paid)}${debt.paymentEditNote ? ' · '+debt.paymentEditNote : ''}`);
    saveDB(); closeModal(); renderFinanceManagement(); toast('Ödeme durumu güncellendi.');
  });
}

function setBalancePeriod(value) {
  if(!value)return;
  db.settings.balancePeriod=value;
  saveDB();renderFinanceManagement();
}
function calculateBalanceDebts() {
  if(!hasPermission('finance.manage'))return;
  const period=db.settings.balancePeriod||`${new Date().getFullYear()}-${pad(new Date().getMonth()+1)}`;
  const calc = balanceRowsForPeriod(period);
  calc.rows.forEach(x=>{
    const amount=Number((x.count*calc.unit).toFixed(2));
    let d=db.debts.find(d=>d.userId===x.user.id&&d.period===calc.label);
    if(d)d.amount=amount;else db.debts.push({id:Date.now()+x.user.id,userId:x.user.id,period:calc.label,amount,paid:0});
  });
  logAudit('balance.calculate',`${calc.label}: ${money(calc.totalExpense)} / ${calc.totalMeals} tabldot öğünü = ${money(calc.unit)}`);
  saveDB();renderFinanceManagement();toast('Tabldot borçları yıllık izin düşümlerine göre hesaplandı ve personele yansıtıldı.');
}
function printBalance(periodOverride = null) {
  const previous = db.settings.balancePeriod;
  if (periodOverride) db.settings.balancePeriod = periodOverride;
  const html = reportHtml('balance');
  if (periodOverride) db.settings.balancePeriod = previous;
  showModal('Aylık Tabldot Bilançosu · PDF Önizleme', `<div class="pdf-preview" id="reportPreview">${html}</div><div class="section-gap report-preview-actions"><button class="btn btn-primary" onclick="printReportPreviewForPeriod('balance','${periodOverride || ''}')">PDF / Yazdır</button></div>`);
}
function printReportPreviewForPeriod(type, periodOverride = '') {
  const previous = db.settings.balancePeriod;
  if (periodOverride) db.settings.balancePeriod = periodOverride;
  printReportPreview(type);
  if (periodOverride) db.settings.balancePeriod = previous;
}

function copyIban() { navigator.clipboard?.writeText(db.settings.iban); toast('IBAN panoya kopyalandı.'); }
function paymentModal() {
  const debts = db.debts.filter(x => x.userId === currentUser.id).sort((a,b)=>String(b.period||'').localeCompare(String(a.period||'')));
  const options = debts.length ? debts.map(d=>`<option value="${escapeHtml(d.period)}">${escapeHtml(d.period)} · Kalan ${money(Math.max(0,d.amount-d.paid))}</option>`).join('') : `<option>${periodLabelFromKey(reportPeriodKey())}</option>`;
  showModal('Ödeme Bildir', `<form id="paymentForm" class="form-grid"><label>Dönem<select name="period">${options}</select></label><label>Tutar<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Ödeme tarihi<input name="date" type="date" value="${toISO(new Date())}" required></label><label>Dekont<input name="receipt" type="file" accept="image/*,.pdf"></label><div class="span-2"><button class="btn btn-primary btn-block">Bildirimi Gönder</button></div></form>`);
  document.getElementById('paymentForm').addEventListener('submit', e => { e.preventDefault(); const f = new FormData(e.target); db.payments.push({ id: Date.now(), userId: currentUser.id, period: f.get('period'), amount: Number(f.get('amount')), date: f.get('date'), status: 'pending' }); logAudit('payment.submit', `${currentUser.name} · ${f.get('period')} · ${money(Number(f.get('amount')))}`); saveDB(); closeModal(); toast('Ödeme bildiriminiz onaya gönderildi.'); });
}
function approvePayment(id) {
  if (!canEditPaymentStatus()) return toast('Ödemeyi yalnızca Admin veya Tabldot Sorumlusu onaylayabilir.');
  const p = db.payments.find(x => x.id === Number(id));
  if (!p || p.status === 'approved') return;
  p.status = 'approved'; p.reviewedAt = new Date().toISOString(); p.reviewedBy = currentUser.id;
  const d = db.debts.find(x => x.userId === p.userId && x.period === p.period);
  if (d) d.paid = Math.min(Number(d.amount||0), Number(d.paid||0) + Number(p.amount||0));
  logAudit('payment.approve', `${getUser(p.userId)?.name || '-'} · ${p.period} · ${money(p.amount)}`);
  saveDB(); renderFinanceManagement(); toast('Ödeme onaylandı ve borca işlendi.');
}
function rejectPayment(id) {
  if (!canEditPaymentStatus()) return toast('Ödemeyi yalnızca Admin veya Tabldot Sorumlusu reddedebilir.');
  const p = db.payments.find(x => x.id === Number(id));
  if (!p || p.status === 'approved') return;
  if (!confirm('Bu ödeme bildirimi reddedilsin mi?')) return;
  p.status = 'rejected'; p.reviewedAt = new Date().toISOString(); p.reviewedBy = currentUser.id;
  logAudit('payment.reject', `${getUser(p.userId)?.name || '-'} · ${p.period} · ${money(p.amount)}`);
  saveDB(); renderFinanceManagement(); toast('Ödeme bildirimi reddedildi.');
}

function getRemainingLeave(user) {
  return Math.max(0, Number(user.annualAllowance ?? 30) - Number(user.usedLeave || 0) - getApprovedAnnualDays(user.id, false));
}
function monthTitle(year, month) { return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1)); }
function changeLeaveMonth(delta) { leaveCalendarCursor = new Date(leaveCalendarCursor.getFullYear(), leaveCalendarCursor.getMonth() + delta, 1); renderLeaveManagement(); }
function goCurrentLeaveMonth() { leaveCalendarCursor = startOfMonth(new Date()); renderLeaveManagement(); }
function renderMyLeaves() {
  const own = db.leaveRequests.filter(x => x.userId === currentUser.id).sort((a, b) => b.start.localeCompare(a.start));
  const usedAnnual = Number(currentUser.usedLeave || 0) + getApprovedAnnualDays(currentUser.id, false);
  const usedRoad = Number(currentUser.usedRoadLeave || 0) + getApprovedRoadDays(currentUser.id, false);
  document.getElementById('pageContent').innerHTML = `
    <div class="grid grid-4">
      ${metric('📅', 'Yıllık izin hakkı', (currentUser.annualAllowance ?? 30) + ' gün', 'Temel hak')}
      ${metric('✅', 'Kullanılan yıllık', usedAnnual + ' gün', 'Geçmiş kesinleşen kullanım')}
      ${metric('⏳', 'Kalan yıllık', getRemainingLeave(currentUser) + ' gün', 'Tamamlanan izin günleri düşülür')}
      ${metric('🛣️', 'Yol izni', getRoadRemaining(currentUser) + ' / ' + (currentUser.roadAllowance ?? 2) + ' gün', 'Kullanılan: ' + usedRoad + ' gün')}
    </div>
    <div class="card section-gap"><div class="card-header"><div><h3>İzinlerim</h3><p>İzin geçmişiniz ve talepleriniz</p></div>${!isCommander() ? '<button class="btn btn-primary btn-sm" onclick="leaveModal()">Yeni İzin Talebi</button>' : ''}</div>${own.length ? leaveTable(own, false) : '<div class="empty">Henüz izin kaydınız bulunmuyor.</div>'}</div>`;
}
function renderLeaveManagement() {
  if (!hasPermission('leave.view')) return goPage('dashboard');
  const year = leaveCalendarCursor.getFullYear(), month = leaveCalendarCursor.getMonth();
  const monthStart = `${year}-${pad(month + 1)}-01`;
  const monthEnd = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
  const monthly = db.leaveRequests.filter(x => x.start <= monthEnd && x.end >= monthStart).sort((a, b) => a.start.localeCompare(b.start));
  document.getElementById('pageContent').innerHTML = `
    <div class="grid grid-4">${metric('📅', 'Toplam izin kaydı', db.leaveRequests.length, 'Tüm dönemler')}${metric('⏳', 'Onay bekleyen', db.leaveRequests.filter(x => x.status === 'pending').length, 'Değerlendirme gerekli')}${metric('✅', 'Onaylanan', db.leaveRequests.filter(x => x.status === 'approved').length, 'Planlanan izinler')}${metric('👥', monthTitle(year, month) + ' izinli', new Set(monthly.map(x => x.userId)).size + ' kişi', 'Ay içinde izin kaydı bulunan')}</div>
    <div class="card section-gap"><div class="card-header calendar-toolbar"><div><h3>${monthTitle(year, month)} izin takvimi</h3><p>Önceki ve gelecek aylara sınırsız geçiş yapılabilir</p></div><div class="calendar-actions"><button class="btn btn-secondary btn-sm" onclick="changeLeaveMonth(-1)">‹ Önceki Ay</button><button class="btn btn-secondary btn-sm" onclick="goCurrentLeaveMonth()">Bu Ay</button><button class="btn btn-primary btn-sm" onclick="changeLeaveMonth(1)">Sonraki Ay ›</button></div></div><div class="card-body">${calendarHtml(year, month)}</div></div>
    <div class="card section-gap"><div class="card-header"><div><h3>${monthTitle(year, month)} izinli personel listesi</h3><p>Gösterilen ayla kesişen bütün izinler</p></div>${hasPermission('leave.manage') ? '<button class="btn btn-secondary btn-sm" onclick="leaveModal(true)">Geçmiş İzin / Kayıt Ekle</button>' : ''}</div>${monthly.length ? leaveTable(monthly, true) : '<div class="empty">Bu ay için izin kaydı bulunmuyor.</div>'}</div>
    <div class="card section-gap"><div class="card-header"><div><h3>Tüm izin talepleri</h3><p>Personel adına tıklayarak bütün izin geçmişini açabilirsiniz</p></div></div>${leaveTable(db.leaveRequests, true)}</div>`;
}
function canEditOwnLeave(request) {
  return !!request && request.userId === currentUser?.id && request.status === 'pending';
}
function canDeleteOwnLeave(request) {
  return !!request && request.userId === currentUser?.id && ['pending','rejected'].includes(request.status);
}
function leaveTable(items, actions, compact = false) {
  const hasOwnEditable = items.some(x => canEditOwnLeave(x) || canDeleteOwnLeave(x));
  const showActionColumn = actions || hasOwnEditable;
  return `<div class="table-wrap"><table><thead><tr><th>Personel</th><th>İzin türü</th><th>Başlangıç</th><th>Bitiş</th><th>Gün</th>${compact ? '' : '<th>Şehir</th>'}<th>Durum</th>${showActionColumn ? '<th>İşlem</th>' : ''}</tr></thead><tbody>${items.map(x => {
    const ownEdit = `${canEditOwnLeave(x) ? `<button class="btn btn-secondary btn-sm" onclick="leaveModal(false, ${x.id})">Düzenle</button>` : ''}${canDeleteOwnLeave(x) ? ` <button class="btn btn-danger btn-sm" onclick="deleteLeaveRequest(${x.id})">Sil / İptal Et</button>` : ''}`.trim();
    const privilegedDelete = actions && hasPermission('leave.manage') ? `<button class="btn btn-danger btn-sm" onclick="deleteLeaveRequest(${x.id}, true)">Sil</button>` : '';
    const managementActions = actions && x.status === 'pending' && (hasPermission('leave.approve') || hasPermission('leave.manage'))
      ? `<button class="btn btn-success btn-sm" onclick="approveLeave(${x.id})">Onayla</button> <button class="btn btn-danger btn-sm" onclick="rejectLeave(${x.id})">Reddet</button>`
      : '';
    const actionCell = [ownEdit, managementActions, privilegedDelete].filter(Boolean).join(' ') || '—';
    return `<tr><td>${(hasPermission('personnel.view') || hasPermission('leave.view')) ? `<button class="person-link" onclick="openPersonnelLeaves(${x.userId})">${escapeHtml(getUser(x.userId)?.name || '-')}</button>` : `<strong>${escapeHtml(getUser(x.userId)?.name || '-')}</strong>`}</td><td>${escapeHtml(x.type)}</td><td>${formatDate(x.start)}</td><td>${formatDate(x.end)}</td><td>${x.days}</td>${compact ? '' : `<td>${escapeHtml(x.city || '-')}</td>`}<td>${leaveStatusBadge(x)}</td>${showActionColumn ? `<td>${actionCell}</td>` : ''}</tr>`;
  }).join('')}</tbody></table></div>`;
}
function calendarHtml(year, month) {
  const first = new Date(year, month, 1); const last = new Date(year, month + 1, 0); const mondayIndex = (first.getDay() + 6) % 7; const total = Math.ceil((mondayIndex + last.getDate()) / 7) * 7;
  const heads = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(x => `<div class="calendar-head">${x}</div>`).join('');
  let days = '';
  for (let i = 0; i < total; i++) {
    const day = i - mondayIndex + 1;
    if (day < 1 || day > last.getDate()) { days += '<div class="calendar-day muted"></div>'; continue; }
    const date = `${year}-${pad(month + 1)}-${pad(day)}`;
    const events = db.leaveRequests.filter(x => date >= x.start && date <= x.end);
    days += `<div class="calendar-day"><div class="day-num">${day}</div>${events.map(e => `<button class="calendar-event ${e.status}" onclick="openPersonnelLeaves(${e.userId})">${escapeHtml(getUser(e.userId)?.name || '-')}</button>`).join('')}</div>`;
  }
  return `<div class="calendar">${heads}${days}</div>`;
}
function openPersonnelLeaves(userId) {
  if (!hasPermission('personnel.view') && !hasPermission('leave.view')) return;
  const user = getUser(userId); if (!user) return;
  const records = db.leaveRequests.filter(x => x.userId === userId).sort((a, b) => b.start.localeCompare(a.start));
  const preference = db.leavePreferences.find(x => x.userId === userId && x.year === db.settings.leavePlanYear);
  showModal(`${user.name} · Personel ve İzin Bilgileri`, `
    <div class="grid grid-4 compact-metrics">
      ${metric('📅', 'Yıllık hak', (user.annualAllowance ?? 30) + ' gün', 'Tanımlı hak')}
      ${metric('⏳', 'Yıllık kalan', getRemainingLeave(user) + ' gün', 'Kullanılmış günler düşülmüştür')}
      ${metric('🛣️', 'Yol izni hakkı', (user.roadAllowance ?? 2) + ' gün', 'Ayrı bakiye')}
      ${metric('🛣️', 'Yol izni kalan', getRoadRemaining(user) + ' gün', 'Kullanılmış günler düşülmüştür')}
    </div>
    <div class="person-summary section-gap"><div><strong>Rol</strong><span>${escapeHtml(userRoleLabels(user))}</span></div>${hasPermission('leave.plan') ? `<div><strong>Planlama puanı</strong><span>${user.planningScore ?? 0}</span></div>` : ''}<div><strong>${db.settings.leavePlanYear} tercihi</strong><span>${preference ? 'Gönderildi' : 'Gönderilmedi'}</span></div></div>
    ${preference ? (()=>{const p=normalizePreferenceRecord(preference);return `<div class="preference-period-title section-gap"><strong>❄️ Kış dönemi · 10 gün</strong><span>Ocak–Mayıs ve Ekim–Aralık</span></div><div class="preference-summary"><div><strong>Kış 1. tercih</strong><span>${p.winterFirstStart?`${formatDate(p.winterFirstStart)} – ${formatDate(p.winterFirstEnd)}`:'—'}</span></div><div><strong>Kış 2. tercih</strong><span>${p.winterSecondStart?`${formatDate(p.winterSecondStart)} – ${formatDate(p.winterSecondEnd)}`:'—'}</span></div></div><div class="preference-period-title section-gap"><strong>☀️ Yaz dönemi · 20 gün</strong><span>Haziran–Eylül</span></div><div class="preference-summary"><div><strong>Yaz 1. tercih</strong><span>${p.summerFirstStart?`${formatDate(p.summerFirstStart)} – ${formatDate(p.summerFirstEnd)}`:'—'}</span></div><div><strong>Yaz 2. tercih</strong><span>${p.summerSecondStart?`${formatDate(p.summerSecondStart)} – ${formatDate(p.summerSecondEnd)}`:'—'}</span></div></div>`})() : ''}
    <div class="section-gap"><h3>Tüm izin kayıtları</h3>${records.length ? leaveTable(records, false, true) : '<div class="empty">Bu personele ait izin kaydı bulunmuyor.</div>'}</div>`);
}
function leaveModal(asManager = false, editId = null) {
  if (!asManager && isCommander()) return toast('Karakol Komutanı için yeni izin talebi bu sistemden oluşturulmaz.');
  const users = approvedUsers();
  const editing = editId ? db.leaveRequests.find(x => x.id === Number(editId)) : null;
  if (editing && (asManager || !canEditOwnLeave(editing))) return toast('Bu izin talebi artık personel tarafından düzenlenemez.');
  const selectedType = editing?.type || 'Yıllık İzin';
  const types = ['Yıllık İzin','Günübirlik İzin','Mazeret İzni','Sağlık İzni','Görev / Kurs','Yol İzni'];
  const title = editing ? 'İzin Talebini Düzenle' : (asManager ? 'Geçmiş / Yönetici İzin Kaydı Ekle' : 'Yeni İzin Talebi');
  showModal(title, `<form id="leaveForm" class="form-grid">
    ${asManager ? `<label class="span-2">Personel<select name="userId">${users.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('')}</select></label>` : ''}
    <label>İzin türü<select name="type">${types.map(type => `<option${type === selectedType ? ' selected' : ''}>${type}</option>`).join('')}</select></label>
    <label>İzne gidilecek şehir<input name="city" value="${escapeHtml(editing?.city || '')}" ${asManager ? '' : 'required'}></label>
    <label>Başlangıç tarihi<input name="start" type="date" value="${editing?.start || ''}" required></label>
    <label>Bitiş tarihi<input name="end" type="date" value="${editing?.end || ''}" required></label>
    <label class="span-2">Açıklama<textarea name="note">${escapeHtml(editing?.note || '')}</textarea></label>
    ${asManager ? '<div class="span-2 form-hint">Admin/İdari İşler geçmiş aylarda kullanılmış izinleri buradan ekleyebilir. Kayıt onaylı olarak işlenir ve bakiyeyi otomatik etkiler.</div>' : ''}
    <div class="span-2"><button class="btn btn-primary btn-block">${editing ? 'Değişiklikleri Kaydet' : (asManager ? 'İzin Kaydını Ekle' : 'Talebi Gönder')}</button></div>
  </form>`);
  document.getElementById('leaveForm').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target), start = f.get('start'), end = f.get('end'), type = f.get('type');
    if (end < start) return toast('Bitiş tarihi başlangıçtan önce olamaz.');
    if (type === 'Günübirlik İzin' && start !== end) return toast('Günübirlik izin için başlangıç ve bitiş aynı gün olmalıdır.');
    const payload = { type, city: f.get('city') || '-', start, end, days: daysBetween(start, end), note: f.get('note') };
    if (editing) {
      Object.assign(editing, payload, { status: 'pending', updatedAt: new Date().toISOString() });
      logAudit('leave_request_updated', `${currentUser.name} izin talebini güncelledi: ${start} - ${end}`);
    } else {
      const record = { id: Date.now(), userId: asManager ? Number(f.get('userId')) : currentUser.id, ...payload, status: asManager ? 'approved' : 'pending', source: asManager ? 'historical-or-authorized' : 'request', createdAt: new Date().toISOString() };
      db.leaveRequests.push(record);
      logAudit(asManager ? 'leave_historical_created' : 'leave_request_created', `${getUser(record.userId)?.name || currentUser.name}: ${type} ${start} - ${end}`);
    }
    saveDB(); closeModal(); asManager ? renderLeaveManagement() : renderMyLeaves(); toast(editing ? 'İzin talebiniz güncellendi.' : (asManager ? 'İzin kaydı eklendi ve bakiye güncellendi.' : 'İzin talebiniz onaya gönderildi.'));
  });
}
function deleteLeaveRequest(id, asManager = false) {
  const x = db.leaveRequests.find(r => r.id === Number(id));
  if (!x) return;
  const ownAllowed = x.userId === currentUser?.id && ['pending','rejected'].includes(x.status);
  const privilegedAllowed = asManager && hasPermission('leave.manage');
  if (!ownAllowed && !privilegedAllowed) return toast('Bu izin kaydını silme yetkiniz yok.');
  if (x.status === 'approved' && !privilegedAllowed) return toast('Onaylanmış izin personel tarafından silinemez.');
  const userName = getUser(x.userId)?.name || 'Personel';
  if (!confirm(`${userName} için ${formatShortDate(x.start)} - ${formatShortDate(x.end)} izin kaydı silinsin mi?`)) return;
  db.leaveRequests = db.leaveRequests.filter(r => r.id !== Number(id));
  logAudit('leave.delete', `${userName}: ${x.type} ${x.start} - ${x.end} (${x.status}) silindi`);
  saveDB();
  if (currentPage === 'leave-management') renderLeaveManagement(); else renderMyLeaves();
  toast('İzin kaydı silindi.');
}

function approveLeave(id) {
  if (!hasPermission('leave.approve') && !hasPermission('leave.manage')) return;
  const x=db.leaveRequests.find(r=>r.id===id); if(!x)return;
  if(x.type==='Yıllık İzin'){
    const capacity=concurrentLeaveCapacity();
    const blocked=dateRange(x.start,x.end).find(date=>{
      const count=db.leaveRequests.filter(r=>r.id!==x.id&&r.status==='approved'&&r.type==='Yıllık İzin'&&r.start<=date&&r.end>=date).length;
      return count>=capacity;
    });
    if(blocked) return toast(`${formatShortDate(blocked)} tarihinde eşzamanlı izin sınırı (${capacity} kişi) dolu.`);
  }
  x.status='approved'; x.approvedAt=new Date().toISOString(); x.approvedBy=currentUser.id;
  logAudit('leave.approve',`${getUser(x.userId)?.name||x.userId}: ${x.start} - ${x.end}`);
  saveDB(); renderLeaveManagement(); toast('İzin talebi onaylandı.');
}
function rejectLeave(id) { if (!hasPermission('leave.approve') && !hasPermission('leave.manage')) return; const x = db.leaveRequests.find(r => r.id === id); if (x) { x.status = 'rejected'; saveDB(); renderLeaveManagement(); toast('İzin talebi reddedildi.'); } }

function renderMyLeavePreference() {
  const year = db.settings.leavePlanYear;
  const preferenceOpen = db.settings.leavePreferencesOpen !== false;
  const rawPreference = db.leavePreferences.find(x => x.userId === currentUser.id && x.year === year);
  const preference = normalizePreferenceRecord(rawPreference);
  const resetPending = preference?.resetRequestStatus === 'pending';
  const result = normalizeLeavePlanResult(db.leavePlanResults.find(x => x.userId === currentUser.id && x.year === year && x.announced));
  const v = key => preference?.[key] || '';
  const formDisabled = (!preferenceOpen || resetPending) ? 'disabled' : '';
  const resetInfo = preference ? (resetPending
    ? `<div class="management-banner"><strong>Sıfırlama talebiniz admin onayı bekliyor</strong><span>Admin onaylayana kadar mevcut tercihleriniz korunur.</span></div>`
    : preference.resetRequestStatus === 'rejected'
      ? `<div class="management-banner"><strong>Son sıfırlama talebiniz reddedildi</strong><span>Mevcut tercihleriniz korunuyor. Gerekirse yeniden talep gönderebilirsiniz.</span></div>`
      : '') : '';
  document.getElementById('pageContent').innerHTML = `
    <div class="grid grid-3">${metric('🗓', 'Planlama yılı', year, 'Yönetim tarafından belirlenir')}${metric('🔐', 'Tercih sistemi', preferenceOpen ? 'Açık' : 'Kapalı', preferenceOpen ? 'Tercih girişi ve güncelleme yapılabilir' : 'Admin tarafından geçici olarak kapatıldı')}${metric('📌', 'Planlama sonucu', result ? resultLabel(result) : 'Değerlendirme bekleniyor', result ? 'Kış ve yaz sonuçları yönetim tarafından açıklandı' : 'Puan ve iç değerlendirme personele gösterilmez')}</div>
    ${!preferenceOpen ? `<div class="management-banner section-gap"><strong>Yıllık izin tercihleri şu anda kapalı</strong><span>Mevcut tercihinizi görüntüleyebilirsiniz ancak yeni tercih kaydedemez veya düzenleyemezsiniz.</span></div>` : ''}
    ${resetInfo}
    <div class="card section-gap"><div class="card-header"><div><h3>${year} yıllık izin tercih formu</h3><p>Toplam 4 tercih alınır: Kış döneminde 10 günlük 2 tercih, yaz döneminde 20 günlük 2 tercih.</p></div></div><div class="card-body">
      ${preference?.status === 'reselect' ? '<div class="management-banner"><strong>Tekrar tercih istendi</strong><span>Yönetim tercihlerinizi yeniden düzenlemenizi istiyor.</span></div>' : ''}
      <form id="preferenceForm" class="form-grid section-gap">
        <div class="span-2 preference-period-title"><strong>❄️ KIŞ DÖNEMİ · 10 GÜN</strong><span>Ocak, Şubat, Mart, Nisan, Mayıs, Ekim, Kasım, Aralık</span></div>
        <div class="span-2 preference-heading"><strong>Kış 1. Tercih</strong><span>Öncelikli kış izin dönemi</span></div>
        <label>Başlangıç<input id="winterFirstStartInput" name="winterFirstStart" type="date" value="${v('winterFirstStart')}" required ${formDisabled}></label>
        <label>Bitiş (otomatik)<input id="winterFirstEndInput" type="date" value="${v('winterFirstStart') ? preferenceEndForStart(v('winterFirstStart')) : ''}" readonly></label>
        <div class="span-2 preference-heading"><strong>Kış 2. Tercih</strong><span>İlk kış tercihi uygun olmazsa değerlendirilir</span></div>
        <label>Başlangıç<input id="winterSecondStartInput" name="winterSecondStart" type="date" value="${v('winterSecondStart')}" required ${formDisabled}></label>
        <label>Bitiş (otomatik)<input id="winterSecondEndInput" type="date" value="${v('winterSecondStart') ? preferenceEndForStart(v('winterSecondStart')) : ''}" readonly></label>

        <div class="span-2 preference-period-title preference-summer"><strong>☀️ YAZ DÖNEMİ · 20 GÜN</strong><span>Haziran, Temmuz, Ağustos, Eylül</span></div>
        <div class="span-2 preference-heading"><strong>Yaz 1. Tercih</strong><span>Öncelikli yaz izin dönemi</span></div>
        <label>Başlangıç<input id="summerFirstStartInput" name="summerFirstStart" type="date" value="${v('summerFirstStart')}" required ${formDisabled}></label>
        <label>Bitiş (otomatik)<input id="summerFirstEndInput" type="date" value="${v('summerFirstStart') ? preferenceEndForStart(v('summerFirstStart')) : ''}" readonly></label>
        <div class="span-2 preference-heading"><strong>Yaz 2. Tercih</strong><span>İlk yaz tercihi uygun olmazsa değerlendirilir</span></div>
        <label>Başlangıç<input id="summerSecondStartInput" name="summerSecondStart" type="date" value="${v('summerSecondStart')}" required ${formDisabled}></label>
        <label>Bitiş (otomatik)<input id="summerSecondEndInput" type="date" value="${v('summerSecondStart') ? preferenceEndForStart(v('summerSecondStart')) : ''}" readonly></label>
        <label class="span-2">Açıklama<textarea name="note" placeholder="Varsa planlamada dikkate alınmasını istediğiniz husus" ${formDisabled}>${escapeHtml(preference?.note || '')}</textarea></label>
        <div class="span-2"><button class="btn btn-primary btn-block" ${formDisabled}>${resetPending ? 'Sıfırlama Talebi Sonuçlanana Kadar Kilitli' : preferenceOpen ? '4 Tercihimi Kaydet' : 'Tercih Sistemi Kapalı'}</button></div>
      </form>
    </div></div>
    ${preference ? `<div class="grid grid-2 section-gap">
      <div class="card"><div class="card-header"><div><h3>❄️ Kış dönemi tercih özeti</h3><p>10 günlük izin planlaması</p></div></div><div class="card-body preference-summary"><div><strong>1. tercih</strong><span>${v('winterFirstStart')?`${formatDate(v('winterFirstStart'))} – ${formatDate(v('winterFirstEnd'))}`:'—'}</span></div><div><strong>2. tercih</strong><span>${v('winterSecondStart')?`${formatDate(v('winterSecondStart'))} – ${formatDate(v('winterSecondEnd'))}`:'—'}</span></div></div></div>
      <div class="card"><div class="card-header"><div><h3>☀️ Yaz dönemi tercih özeti</h3><p>20 günlük izin planlaması</p></div>${statusBadge(preference.status === 'reselect' ? 'warning' : 'submitted')}</div><div class="card-body preference-summary"><div><strong>1. tercih</strong><span>${v('summerFirstStart')?`${formatDate(v('summerFirstStart'))} – ${formatDate(v('summerFirstEnd'))}`:'—'}</span></div><div><strong>2. tercih</strong><span>${v('summerSecondStart')?`${formatDate(v('summerSecondStart'))} – ${formatDate(v('summerSecondEnd'))}`:'—'}</span></div></div></div>
    </div>
    <div class="card section-gap"><div class="card-header"><div><h3>Tercihlerimi sıfırla</h3><p>Sıfırlama doğrudan yapılmaz; talep Admin onayına gönderilir.</p></div></div><div class="card-body">${resetPending ? `<div class="management-banner"><strong>Onay bekleniyor</strong><span>Talebiniz Admin tarafından incelendikten sonra sonuçlanacaktır.</span></div>` : `<button class="btn btn-danger" onclick="requestOwnLeavePreferenceReset()">Sıfırlama Talebi Gönder</button>`}</div></div>` : ''}`;

  const pairs = [
    ['winterFirstStartInput','winterFirstEndInput'], ['winterSecondStartInput','winterSecondEndInput'],
    ['summerFirstStartInput','summerFirstEndInput'], ['summerSecondStartInput','summerSecondEndInput']
  ];
  const syncEnds = () => pairs.forEach(([startId,endId]) => { const input=document.getElementById(startId); if(input) document.getElementById(endId).value=input.value?preferenceEndForStart(input.value):''; });
  pairs.forEach(([startId]) => document.getElementById(startId)?.addEventListener('change', syncEnds));
  document.getElementById('preferenceForm')?.addEventListener('submit', e => {
    e.preventDefault();
    if (db.settings.leavePreferencesOpen === false) return toast('Yıllık izin tercih sistemi Admin tarafından kapatıldı.');
    if (preference?.resetRequestStatus === 'pending') return toast('Sıfırlama talebiniz sonuçlanana kadar tercihinizi değiştiremezsiniz.');
    const f = new FormData(e.target);
    const winterFirstStart=f.get('winterFirstStart'), winterSecondStart=f.get('winterSecondStart');
    const summerFirstStart=f.get('summerFirstStart'), summerSecondStart=f.get('summerSecondStart');
    if (![winterFirstStart,winterSecondStart].every(x=>isValidPreferenceSeason(x,'winter'))) return toast('Kış tercihleri yalnızca Ocak-Mayıs veya Ekim-Aralık aylarından başlamalıdır.');
    if (![summerFirstStart,summerSecondStart].every(x=>isValidPreferenceSeason(x,'summer'))) return toast('Yaz tercihleri yalnızca Haziran-Eylül aylarından başlamalıdır.');
    if (winterFirstStart===winterSecondStart) return toast('Kış 1. ve 2. tercihi aynı başlangıç tarihi olamaz.');
    if (summerFirstStart===summerSecondStart) return toast('Yaz 1. ve 2. tercihi aynı başlangıç tarihi olamaz.');
    const winterFirstEnd=preferenceEndForStart(winterFirstStart), winterSecondEnd=preferenceEndForStart(winterSecondStart);
    const summerFirstEnd=preferenceEndForStart(summerFirstStart), summerSecondEnd=preferenceEndForStart(summerSecondStart);
    const allDates=[winterFirstStart,winterFirstEnd,winterSecondStart,winterSecondEnd,summerFirstStart,summerFirstEnd,summerSecondStart,summerSecondEnd];
    if (!allDates.every(x => Number(x.slice(0,4)) === Number(year))) return toast(`Bütün tercih tarihleri ${year} yılı içinde olmalıdır.`);
    const existing = db.leavePreferences.find(x => x.userId === currentUser.id && x.year === year);
    const payload = { userId: currentUser.id, year, winterFirstStart,winterFirstEnd,winterSecondStart,winterSecondEnd,summerFirstStart,summerFirstEnd,summerSecondStart,summerSecondEnd,note:f.get('note'),submittedAt:new Date().toISOString(),status:'submitted',revision:(existing?.revision || 0) + 1 };
    if (existing) {
      Object.assign(existing,payload);
      delete existing.firstStart; delete existing.firstEnd; delete existing.secondStart; delete existing.secondEnd;
      delete existing.resetRequestStatus; delete existing.resetRequestedAt; delete existing.resetRequestedBy; delete existing.resetReviewedAt; delete existing.resetReviewedBy;
    } else db.leavePreferences.push({id:Date.now(),...payload});
    db.leavePlanResults = db.leavePlanResults.filter(x => !(x.year===year && x.userId===currentUser.id));
    saveDB(); renderMyLeavePreference(); toast('Kış ve yaz dönemi için toplam 4 tercihiniz yönetim değerlendirmesine gönderildi.');
  });
}
function requestOwnLeavePreferenceReset() {
  const year = db.settings.leavePlanYear;
  const preference = db.leavePreferences.find(x => x.userId === currentUser.id && x.year === year);
  if (!preference) return toast('Sıfırlanacak yıllık izin tercihiniz bulunmuyor.');
  if (preference.resetRequestStatus === 'pending') return toast('Sıfırlama talebiniz zaten yönetim onayı bekliyor.');
  if (!confirm(`${year} yılı yıllık izin tercihlerinizin sıfırlanması için Admin / Karakol Komutanı onayına talep gönderilsin mi?`)) return;
  preference.resetRequestStatus = 'pending';
  preference.resetRequestedAt = new Date().toISOString();
  preference.resetRequestedBy = currentUser.id;
  delete preference.resetReviewedAt;
  delete preference.resetReviewedBy;
  logAudit('leave.preference_reset_request', `${currentUser.name}: ${year} yıllık izin tercihi sıfırlama talebi gönderdi`);
  saveDB(); renderMyLeavePreference(); toast('Sıfırlama talebiniz Admin / Karakol Komutanı onayına gönderildi.');
}
function approveLeavePreferenceReset(userId) {
  if (!canManageLeavePreferences()) return toast('Bu işlem için yıllık izin tercih yönetimi yetkiniz yok.');
  userId = Number(userId);
  const year = db.settings.leavePlanYear;
  const preference = db.leavePreferences.find(x => x.userId === userId && x.year === year && x.resetRequestStatus === 'pending');
  if (!preference) return toast('Bekleyen sıfırlama talebi bulunamadı.');
  const user = getUser(userId);
  if (!confirm(`${user?.name || 'Personel'} kullanıcısının ${year} yılı yıllık izin tercihleri sıfırlansın mı?`)) return;
  db.leavePreferences = db.leavePreferences.filter(x => !(x.userId === userId && x.year === year));
  db.leavePlanResults = db.leavePlanResults.filter(x => !(x.userId === userId && x.year === year));
  logAudit('leave.preference_reset_approve', `${user?.name || userId}: ${year} yıllık izin tercihi sıfırlandı`);
  saveDB(); renderLeavePlanning(); toast('Personelin yıllık izin tercihleri sıfırlandı.');
}
function rejectLeavePreferenceReset(userId) {
  if (!canManageLeavePreferences()) return toast('Bu işlem için yıllık izin tercih yönetimi yetkiniz yok.');
  userId = Number(userId);
  const year = db.settings.leavePlanYear;
  const preference = db.leavePreferences.find(x => x.userId === userId && x.year === year && x.resetRequestStatus === 'pending');
  if (!preference) return toast('Bekleyen sıfırlama talebi bulunamadı.');
  preference.resetRequestStatus = 'rejected';
  preference.resetReviewedAt = new Date().toISOString();
  preference.resetReviewedBy = currentUser.id;
  logAudit('leave.preference_reset_reject', `${getUser(userId)?.name || userId}: ${year} yıllık izin tercihi sıfırlama talebi reddedildi`);
  saveDB(); renderLeavePlanning(); toast('Sıfırlama talebi reddedildi; mevcut tercihler korundu.');
}
function resultLabel(result) {
  if (result.status === 'reselect') return 'Tekrar tercih isteniyor';
  return `Kış: ${resultSeasonLabel(result,'winter')} · Yaz: ${resultSeasonLabel(result,'summer')}`;
}
function renderLeavePlanning() {
  if (!hasPermission('leave.plan')) return goPage('dashboard');
  const year = db.settings.leavePlanYear;
  const users = planningUsers();
  const preferences = db.leavePreferences.filter(x => x.year === year).map(normalizePreferenceRecord);
  const results = db.leavePlanResults.filter(x => x.year === year).map(normalizeLeavePlanResult);
  const capacity = concurrentLeaveCapacity();
  const pendingResetRequests = preferences.filter(p => p.resetRequestStatus === 'pending');
  const preferenceOpen = db.settings.leavePreferencesOpen !== false;
  const canManagePreferences = canManageLeavePreferences();
  const resetRequestRows = pendingResetRequests.map(p => { const u=getUser(p.userId); return `<tr><td><strong>${escapeHtml(u?.name || 'Bilinmeyen Kullanıcı')}</strong><small class="table-sub">${escapeHtml(u?.title || '')}</small></td><td>${p.resetRequestedAt ? new Intl.DateTimeFormat('tr-TR',{dateStyle:'short',timeStyle:'short'}).format(new Date(p.resetRequestedAt)) : '—'}</td><td><button class="btn btn-success btn-sm" onclick="approveLeavePreferenceReset(${p.userId})">Onayla ve Sıfırla</button> <button class="btn btn-danger btn-sm" onclick="rejectLeavePreferenceReset(${p.userId})">Reddet</button></td></tr>`; }).join('');
  const monthCounts = Array.from({length:12},(_,i)=>({month:i,w1:0,w2:0,s1:0,s2:0}));
  preferences.forEach(p => {
    if(p.winterFirstStart) monthCounts[parseISO(p.winterFirstStart).getMonth()].w1++;
    if(p.winterSecondStart) monthCounts[parseISO(p.winterSecondStart).getMonth()].w2++;
    if(p.summerFirstStart) monthCounts[parseISO(p.summerFirstStart).getMonth()].s1++;
    if(p.summerSecondStart) monthCounts[parseISO(p.summerSecondStart).getMonth()].s2++;
  });
  const chartFor = (season, months) => {
    const firstKey=season==='winter'?'w1':'s1', secondKey=season==='winter'?'w2':'s2';
    const maxCount=Math.max(1,...months.flatMap(m=>[monthCounts[m][firstKey],monthCounts[m][secondKey]]));
    return months.map(m=>{const x=monthCounts[m];return `<div class="survey-month"><strong>${new Intl.DateTimeFormat('tr-TR',{month:'long'}).format(new Date(year,m,1))}</strong><div class="survey-bar-row"><span>1.</span><div class="survey-bar"><i style="width:${Math.round(x[firstKey]/maxCount*100)}%"></i></div><b>${x[firstKey]}</b></div><div class="survey-bar-row second"><span>2.</span><div class="survey-bar"><i style="width:${Math.round(x[secondKey]/maxCount*100)}%"></i></div><b>${x[secondKey]}</b></div></div>`}).join('');
  };
  const winterCharts=chartFor('winter',[0,1,2,3,4,9,10,11]);
  const summerCharts=chartFor('summer',[5,6,7,8]);

  const seasonRows = season => users.slice().sort((a,b)=>(b.planningScore??0)-(a.planningScore??0)||a.name.localeCompare(b.name,'tr')).map(user=>{
    const p=preferences.find(x=>x.userId===user.id), r=results.find(x=>x.userId===user.id);
    const prefix=season==='winter'?'winter':'summer';
    const firstStart=p?.[`${prefix}FirstStart`], firstEnd=p?.[`${prefix}FirstEnd`];
    const secondStart=p?.[`${prefix}SecondStart`], secondEnd=p?.[`${prefix}SecondEnd`];
    const h1=firstStart?rangeHolidayNames(firstStart,firstEnd,year):[], h2=secondStart?rangeHolidayNames(secondStart,secondEnd,year):[];
    const cls=(h1.length||h2.length)?'holiday-hit':'';
    const decision=r ? resultSeasonLabel(r,season) : '—';
    return `<tr class="${cls}"><td><button class="person-link" onclick="openPersonnelLeaves(${user.id})">${escapeHtml(user.name)}</button><small class="table-sub">${escapeHtml(user.title||'')}</small></td><td><strong>${user.planningScore??0}</strong></td><td>${firstStart?`${formatShortDate(firstStart)} – ${formatShortDate(firstEnd)}${h1.length?`<small class="holiday-note">🎉 ${escapeHtml(h1.join(', '))}</small>`:''}`:'—'}</td><td>${secondStart?`${formatShortDate(secondStart)} – ${formatShortDate(secondEnd)}${h2.length?`<small class="holiday-note">🎉 ${escapeHtml(h2.join(', '))}</small>`:''}`:'—'}</td><td>${p?statusBadge(p.status==='reselect'?'warning':'submitted'):statusBadge('unsubmitted')}</td><td>${escapeHtml(decision)}</td><td>${p?`<button class="btn btn-success btn-sm" onclick="acceptLeavePreference(${user.id},'${season}',1)">1. Tercihi Kabul</button> <button class="btn btn-success btn-sm" onclick="acceptLeavePreference(${user.id},'${season}',2)">2. Tercihi Kabul</button>`:'—'}</td></tr>`;
  }).join('');

  document.getElementById('pageContent').innerHTML=`
    <div class="grid grid-4">${metric('🗓','Planlama yılı',year,'Yıllık genel plan')}${metric('📨','4 tercihi veren',preferences.filter(p=>p.winterFirstStart&&p.winterSecondStart&&p.summerFirstStart&&p.summerSecondStart&&p.status!=='reselect').length+' / '+users.length,'Kış 2 + Yaz 2 tercih')}${metric('📏','Eşzamanlı izin sınırı',capacity+' kişi','Aktif personelin %'+(db.settings.leaveConcurrentPercent||25)+'\'i')}${metric('⭐','Puanlama','Yönetim içi','Personel puanı görmez')}</div>
    ${canManagePreferences ? `<div class="card section-gap"><div class="card-header"><div><h3>🗓 Yıllık izin tercih yönetimi</h3><p>Admin ve Karakol Komutanı tercih sistemini açıp kapatabilir, toplu sıfırlama yapabilir ve personel sıfırlama taleplerini sonuçlandırabilir.</p></div><span class="status ${preferenceOpen ? 'success' : 'danger'}">${preferenceOpen ? 'Tercihler Açık' : 'Tercihler Kapalı'}</span></div><div class="card-body"><div class="grid grid-3">${metric('🔐','Tercih sistemi',preferenceOpen?'Açık':'Kapalı',preferenceOpen?'Personel tercih kaydedebilir':'Personel formu salt okunur')}${metric('📨','Kayıtlı tercih',preferences.length+' kişi',year+' yılı')}${metric('🔄','Sıfırlama talebi',pendingResetRequests.length+' bekleyen','Admin / Karakol Komutanı onayı')}</div><div class="sync-actions section-gap"><button class="btn ${preferenceOpen ? 'btn-warning' : 'btn-success'}" onclick="toggleLeavePreferenceSystem()">${preferenceOpen ? 'Yıllık İzin Tercihlerini Kapat' : 'Yıllık İzin Tercihlerini Aç'}</button><button class="btn btn-danger" onclick="resetAllLeavePreferences()">${year} Tercihlerini Toplu Sıfırla</button></div><p class="form-note section-gap">Bu yetkiler yalnızca yıllık izin tercih yönetimi içindir; Karakol Komutanına diğer Admin sistem ayarları açılmaz.</p></div></div><div class="card section-gap"><div class="card-header"><div><h3>🔄 Tercih sıfırlama talepleri</h3><p>Personelin kendi tercihlerini sıfırlama talepleri Admin veya Karakol Komutanı onayıyla uygulanır.</p></div><span class="status ${pendingResetRequests.length?'warning':'success'}">${pendingResetRequests.length ? pendingResetRequests.length+' bekleyen' : 'Bekleyen yok'}</span></div><div class="table-wrap"><table><thead><tr><th>Personel</th><th>Talep zamanı</th><th>İşlem</th></tr></thead><tbody>${resetRequestRows || '<tr><td colspan="3">Bekleyen sıfırlama talebi bulunmuyor.</td></tr>'}</tbody></table></div></div>` : ''}
    <div class="grid grid-2 section-gap">
      <div class="card"><div class="card-header"><div><h3>❄️ Kış dönemi anket özeti</h3><p>10 günlük tercihler · Ocak-Mayıs ve Ekim-Aralık</p></div></div><div class="card-body"><div class="survey-chart survey-chart-season">${winterCharts}</div></div></div>
      <div class="card"><div class="card-header"><div><h3>☀️ Yaz dönemi anket özeti</h3><p>20 günlük tercihler · Haziran-Eylül</p></div></div><div class="card-body"><div class="survey-chart survey-chart-season">${summerCharts}</div></div></div>
    </div>
    <div class="card section-gap"><div class="card-header"><div><h3>${year} Türkiye resmî tatilleri</h3><p>Tatil dönemine denk gelen tercihler değerlendirme tablolarında vurgulanır.</p></div></div><div class="card-body holiday-list">${holidaysForYear(year).map(h=>`<span><strong>${escapeHtml(h.name)}</strong> ${formatShortDate(h.start)}${h.end!==h.start?' – '+formatShortDate(h.end):''}</span>`).join('')}</div></div>
    <div class="card section-gap"><div class="card-header"><div><h3>❄️ Kış Dönemi Değerlendirmesi</h3><p>Her personelin 10 günlük iki kış tercihinden biri değerlendirilir.</p></div><div class="calendar-actions"><button class="btn btn-primary btn-sm" onclick="generateLeavePlan()">Otomatik Taslak Oluştur</button><button class="btn btn-warning btn-sm" onclick="requestAllIncompletePreferences()">Eksik/Tekrar Tercihleri Göster</button></div></div><div class="table-wrap"><table><thead><tr><th>Personel</th><th>İç Puan</th><th>Kış 1</th><th>Kış 2</th><th>Durum</th><th>Kış Kararı</th><th>İşlem</th></tr></thead><tbody>${seasonRows('winter')}</tbody></table></div></div>
    <div class="card section-gap"><div class="card-header"><div><h3>☀️ Yaz Dönemi Değerlendirmesi</h3><p>Her personelin 20 günlük iki yaz tercihinden biri değerlendirilir.</p></div><div class="calendar-actions"><button class="btn btn-warning btn-sm" onclick="requestPreferenceAgainSelectedHint()">Tekrar Tercih Gerekenlerde personel satırını kullan</button><button class="btn btn-success btn-sm" onclick="announceLeavePlan()">Sonuçları Açıkla</button></div></div><div class="table-wrap"><table><thead><tr><th>Personel</th><th>İç Puan</th><th>Yaz 1</th><th>Yaz 2</th><th>Durum</th><th>Yaz Kararı</th><th>İşlem</th></tr></thead><tbody>${seasonRows('summer')}</tbody></table></div></div>
    <div class="card section-gap"><div class="card-header"><div><h3>Tekrar tercih işlemi</h3><p>Bir personelin kış veya yaz tercihleri uygun değilse formun tamamını yeniden açabilirsiniz.</p></div></div><div class="card-body"><select id="reselectUserSelect"><option value="">Personel seçin</option>${users.map(u=>`<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('')}</select><button class="btn btn-warning section-gap" onclick="requestPreferenceAgain(document.getElementById('reselectUserSelect').value)">Seçili Personelden Tekrar Tercih İste</button></div></div>`;
}
function requestAllIncompletePreferences(){ toast('Eksik tercih veren personeller tabloda “Tercih Yok” veya “Tekrar Tercih” olarak görünür.'); }
function requestPreferenceAgainSelectedHint(){ toast('Tekrar tercih için sayfanın altındaki personel seçim alanını kullanın.'); }
function dateRange(start, end) {
  const result = []; let cursor = parseISO(start); const last = parseISO(end);
  while (cursor <= last) { result.push(toISO(cursor)); cursor = addDays(cursor, 1); }
  return result;
}
function canAllocate(start, end, occupancy, capacity) { return dateRange(start, end).every(date => (occupancy[date] || 0) < capacity); }
function occupyRange(start, end, occupancy) { dateRange(start, end).forEach(date => { occupancy[date] = (occupancy[date] || 0) + 1; }); }
function generateLeavePlan() {
  if (!hasPermission('leave.plan')) return;
  const year=db.settings.leavePlanYear, capacity=concurrentLeaveCapacity(), occupancy={};
  const ordered=planningUsers().slice().sort((a,b)=>(b.planningScore??0)-(a.planningScore??0)||a.name.localeCompare(b.name,'tr'));
  const results=[];
  const allocateSeason=(p,season)=>{
    const prefix=season==='winter'?'winter':'summer';
    for(const choice of [1,2]){
      const key=`${prefix}${choice===1?'First':'Second'}`;
      const start=p?.[`${key}Start`], end=p?.[`${key}End`];
      if(start&&end&&canAllocate(start,end,occupancy,capacity)){ occupyRange(start,end,occupancy); return {choice,start,end,status:'draft'}; }
    }
    return {choice:0,start:'',end:'',status:'reselect'};
  };
  ordered.forEach(user=>{
    const raw=db.leavePreferences.find(x=>x.userId===user.id&&x.year===year&&x.status!=='reselect'); if(!raw)return;
    const p=normalizePreferenceRecord(raw);
    const winter=allocateSeason(p,'winter'), summer=allocateSeason(p,'summer');
    results.push({id:Date.now()+user.id,userId:user.id,year,score:user.planningScore??0,status:(winter.choice&&summer.choice)?'draft':'reselect',announced:false,winterChoice:winter.choice,winterStart:winter.start,winterEnd:winter.end,winterStatus:winter.status,summerChoice:summer.choice,summerStart:summer.start,summerEnd:summer.end,summerStatus:summer.status});
  });
  db.leavePlanResults=db.leavePlanResults.filter(x=>x.year!==year).concat(results);
  saveDB();renderLeavePlanning();toast('Kış ve yaz dönemleri ayrı ayrı eşzamanlı izin sınırı ve puan sırasına göre taslaklandı.');
}
function publishLeavePlan() { announceLeavePlan(); }
function acceptLeavePreference(userId, season, choice) {
  if (!hasPermission('leave.plan')) return;
  const year=db.settings.leavePlanYear, raw=db.leavePreferences.find(x=>x.userId===Number(userId)&&x.year===year); if(!raw)return;
  const p=normalizePreferenceRecord(raw), prefix=season==='winter'?'winter':'summer', key=`${prefix}${choice===1?'First':'Second'}`;
  const start=p[`${key}Start`], end=p[`${key}End`]; if(!start||!end)return toast('Bu tercih tarihi girilmemiş.');
  let result=db.leavePlanResults.find(x=>x.userId===Number(userId)&&x.year===year);
  if(!result){ result={id:Date.now()+Number(userId),userId:Number(userId),year,score:getUser(userId)?.planningScore??0,status:'draft',announced:false,winterChoice:0,summerChoice:0,winterStatus:'pending',summerStatus:'pending'}; db.leavePlanResults.push(result); }
  result[`${prefix}Choice`]=choice; result[`${prefix}Start`]=start; result[`${prefix}End`]=end; result[`${prefix}Status`]='accepted'; result.announced=false;
  result.status=(result.winterChoice&&result.summerChoice)?'accepted':'draft';
  saveDB();renderLeavePlanning();toast(`${season==='winter'?'Kış':'Yaz'} dönemi ${choice}. tercih kabul edildi. Sonuç açıklanana kadar personele gösterilmez.`);
}
function requestPreferenceAgain(userId) {
  if (!hasPermission('leave.plan')) return;
  userId=Number(userId); if(!userId)return toast('Önce personel seçin.');
  const year=db.settings.leavePlanYear, p=db.leavePreferences.find(x=>x.userId===userId&&x.year===year); if(!p)return;
  p.status='reselect';
  const old=db.leavePlanResults.find(x=>x.userId===userId&&x.year===year);
  if(old)Object.assign(old,{status:'reselect',announced:false,winterChoice:0,winterStart:'',winterEnd:'',winterStatus:'reselect',summerChoice:0,summerStart:'',summerEnd:'',summerStatus:'reselect'});
  else db.leavePlanResults.push({id:Date.now()+userId,userId,year,status:'reselect',announced:false,winterChoice:0,winterStart:'',winterEnd:'',winterStatus:'reselect',summerChoice:0,summerStart:'',summerEnd:'',summerStatus:'reselect'});
  saveDB();renderLeavePlanning();toast('Personelden kış ve yaz yıllık izin tercihlerini yeniden göndermesi istendi.');
}
function announceLeavePlan() {
  if (!hasPermission('leave.plan')) return;
  const year=db.settings.leavePlanYear;
  const preferences=planningUsers().map(u=>normalizePreferenceRecord(db.leavePreferences.find(x=>x.userId===u.id&&x.year===year)));
  const complete=preferences.filter(p=>p&&p.status!=='reselect'&&p.winterFirstStart&&p.winterSecondStart&&p.summerFirstStart&&p.summerSecondStart).length;
  if(complete<planningUsers().length)return toast(`Sonuçlar açıklanamaz: ${planningUsers().length-complete} personelin 4 tercihi tamamlanmamış.`);
  const missingDecision=planningUsers().filter(u=>{const r=db.leavePlanResults.find(x=>x.userId===u.id&&x.year===year);return !r||!r.winterChoice||!r.summerChoice;});
  if(missingDecision.length)return toast(`Sonuçlar açıklanamaz: ${missingDecision.length} personelin kış veya yaz kararı eksik.`);
  db.leavePlanResults.filter(x=>x.year===year).forEach(r=>{
    r.announced=true; r.status='accepted';
    const user=getUser(r.userId); if(!user)return;
    for(const season of ['winter','summer']){
      const choice=r[`${season}Choice`], bonusFlag=`${season}ScoreBonusApplied`;
      if(r[bonusFlag])continue;
      if(choice===2)user.planningScore=(user.planningScore??0)+Number(db.settings.planningSecondChoiceBonus||20);
      else if(choice===1)user.planningScore=(user.planningScore??0)+Number(db.settings.planningFirstChoiceBonus||0);
      r[bonusFlag]=true;
    }
  });
  saveDB();renderLeavePlanning();toast('Kış ve yaz yıllık izin planlama sonuçları personele açıklandı.');
}
function machineStatusModal(machine) {
  if (!isAdmin()) return toast('Cihaz durumunu yalnızca Admin değiştirebilir.');
  const current = db.settings.laundryMachineStatus?.[machine] || 'active';
  showModal(`${machine} · Cihaz Durumu`, `<form id="machineStatusForm">
    <label>Durum<select name="status"><option value="active" ${current==='active'?'selected':''}>Aktif</option><option value="broken" ${current==='broken'?'selected':''}>Arızalı</option><option value="maintenance" ${current==='maintenance'?'selected':''}>Bakımda</option></select></label>
    <button class="btn btn-primary btn-block section-gap">Durumu Kaydet</button>
  </form>`);
  document.getElementById('machineStatusForm').addEventListener('submit', e => {
    e.preventDefault(); const next = new FormData(e.target).get('status');
    const before = db.settings.laundryMachineStatus[machine] || 'active';
    db.settings.laundryMachineStatus[machine] = next;
    logAudit('laundry.machine_status', `${machine}: ${before} → ${next}`);
    saveDB(); closeModal(); renderLaundry(); toast(`${machine} durumu güncellendi.`);
  });
}

const laundryMachines = ['Beyaz Çamaşır Makinesi','Gri Çamaşır Makinesi','Kurutma Makinesi'];
function laundryMachineState(machine) { return (db.settings.laundryMachineStatus || {})[machine] || 'active'; }
function laundryStateLabel(state) { return state === 'broken' ? 'Arızalı' : state === 'maintenance' ? 'Bakımda' : 'Aktif'; }
function laundryEffectiveStatus(run) {
  if (!run) return 'idle';
  if (run.status === 'running' && run.endAt && new Date(run.endAt).getTime() <= Date.now()) return 'finished';
  return run.status || 'finished';
}
function activeLaundryRun(machine) {
  return (db.laundryRuns || [])
    .filter(x => x.machine === machine && !x.clearedAt && ['running','stopped'].includes(laundryEffectiveStatus(x)))
    .sort((a,b)=>Number(b.id)-Number(a.id))[0] || null;
}
function formatClockFromIso(value) { return value ? new Date(value).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '—'; }
function formatLaundryRemaining(ms) {
  const totalSec = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const min = Math.floor(totalSec / 60), sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2,'0')}`;
}
function laundryRunOwnerName(run) { return String(run?.userName || getUser(run?.userId)?.name || 'Bilinmeyen personel'); }
function laundryActualEnd(run) {
  if (!run) return null;
  if (run.resetAt) return run.resetAt;
  if (run.stoppedAt) return run.stoppedAt;
  if (run.finishedAt) return run.finishedAt;
  if (run.endAt && new Date(run.endAt).getTime() <= Date.now()) return run.endAt;
  return null;
}
function laundryRunStatusLabel(run) {
  const status = laundryEffectiveStatus(run);
  if (run?.resetAt) return 'Sıfırlandı';
  if (status === 'stopped') return 'Durduruldu';
  if (status === 'finished') return 'Tamamlandı';
  if (status === 'running') return 'Çalışıyor';
  return 'Geçmiş';
}
function renderLaundryRunCard(machine) {
  const state = laundryMachineState(machine), run = activeLaundryRun(machine);
  if (run) {
    const status = laundryEffectiveStatus(run);
    const running = status === 'running', stopped = status === 'stopped';
    const isOwner = run.userId === currentUser.id;
    const cardState = running ? 'running' : 'stopped';
    const badge = running ? 'Çalışıyor' : 'Durduruldu';
    const ownerSub = running ? 'çamaşırını yıkıyor' : '· sayacı durdurdu';
    const remaining = stopped ? formatLaundryRemaining(run.remainingMs) : '—';
    const actionButtons = isOwner ? `<div class="laundry-run-actions">
      ${running ? `<button class="btn btn-warning" onclick="stopLaundryRun(${run.id})">Sayacı Durdur</button>` : ''}
      <button class="btn btn-danger" onclick="resetLaundryRun(${run.id})">Sayacı Sıfırla</button>
    </div>` : '';
    return `<article class="laundry-live-card ${cardState}">
      <div class="laundry-live-head"><div><span class="laundry-machine-dot"></span><strong>${escapeHtml(machine)}</strong></div><span class="laundry-live-badge ${cardState}">${badge}</span></div>
      <div class="laundry-owner"><span>Sayacı başlatan</span><strong>${escapeHtml(laundryRunOwnerName(run))}</strong><small>${ownerSub}</small></div>
      <div class="laundry-live-meta"><div><span>Başlangıç</span><strong>${formatClockFromIso(run.startAt)}</strong></div><div><span>${running?'Tahmini bitiş':'Durduruldu'}</span><strong>${running?formatClockFromIso(run.endAt):formatClockFromIso(run.stoppedAt)}</strong></div><div><span>Kalan süre</span><strong ${running?`data-run-end="${run.endAt}"`:''}>${running?'—':remaining}</strong></div></div>
      ${actionButtons}
    </article>`;
  }
  return `<article class="laundry-live-card idle ${state!=='active'?'disabled':''}">
    <div class="laundry-live-head"><div><span class="laundry-machine-dot"></span><strong>${escapeHtml(machine)}</strong></div><span class="laundry-live-badge ${state==='active'?'idle':'disabled'}">${laundryStateLabel(state)}</span></div>
    <div class="laundry-owner"><span>Sayaç durumu</span><strong>${state==='active'?'Hazır':laundryStateLabel(state)}</strong><small>${state==='active'?'Başlatılmayı bekliyor':'Sayaç başlatılamaz'}</small></div>
    ${state==='active' ? `<button class="btn btn-primary btn-block" onclick="startLaundryModal('${machine}')">Sayacı Başlat</button>` : ''}
  </article>`;
}
function isSameLocalDay(iso, date = new Date()) {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === date.getDate();
}
function renderLaundryTodayHistory() {
  const rows = (db.laundryRuns || []).filter(run => isSameLocalDay(run.startAt)).sort((a,b)=>new Date(b.startAt)-new Date(a.startAt));
  if (!rows.length) return '<div class="empty">Bugün henüz çamaşır makinesi kullanımı kaydedilmedi.</div>';
  return `<div class="laundry-history-list">${rows.map(run => {
    const end = laundryActualEnd(run);
    return `<div class="laundry-history-row">
      <div class="laundry-history-person"><span>${escapeHtml(run.machine || 'Çamaşır Makinesi')}</span><strong>${escapeHtml(laundryRunOwnerName(run))}</strong></div>
      <div class="laundry-history-time"><span>${formatClockFromIso(run.startAt)}</span><b>→</b><span>${end ? formatClockFromIso(end) : 'Devam ediyor'}</span></div>
      <span class="laundry-history-status">${escapeHtml(laundryRunStatusLabel(run))}</span>
    </div>`;
  }).join('')}</div>`;
}
function renderLaundry() {
  db.settings.laundryMachineStatus ||= {'Beyaz Çamaşır Makinesi':'active','Gri Çamaşır Makinesi':'active','Kurutma Makinesi':'broken'};
  db.laundryRuns ||= [];
  const permission = ('Notification' in window) ? Notification.permission : 'unsupported';
  const notificationText = permission === 'granted' ? 'Bildirimler açık' : permission === 'denied' ? 'Bildirimler engelli' : permission === 'unsupported' ? 'Desteklenmiyor' : 'Bildirimleri aç';
  document.getElementById('pageContent').innerHTML=`
    <div class="card laundry-live-panel"><div class="card-header"><div><h3>🧺 Çamaşır Sayacı</h3><p>Makineyi kullanan kişi sayacı başlatır. Sayacı yalnızca başlatan kullanıcı durdurabilir veya sıfırlayabilir.</p></div><button class="btn btn-secondary btn-sm" onclick="requestSiteNotifications()">🔔 ${notificationText}</button></div><div class="card-body laundry-live-grid">${laundryMachines.map(renderLaundryRunCard).join('')}</div></div>
    <div class="card section-gap"><div class="card-header"><div><h3>Bugünkü Makine Kullanımları</h3><p>Sayaç tamamlansa veya sıfırlansa bile kayıt korunur. Makinede unutulan çamaşırın son kullanıcısı buradan görülebilir.</p></div></div><div class="card-body">${renderLaundryTodayHistory()}</div></div>`;
  updateLaundryCountdowns();
}
function startLaundryModal(machine) {
  if (laundryMachineState(machine) !== 'active') return toast('Bu makine aktif değil.');
  if (activeLaundryRun(machine)) return toast('Bu makinede aktif bir sayaç bulunuyor.');
  showModal(`${machine} · Sayacı Başlat`, `<form id="laundryStartForm" class="form-grid">
    <div class="span-2 laundry-start-owner"><span>Sayacı başlatan personel</span><strong>${escapeHtml(currentUser.name)}</strong></div>
    <label class="span-2">Program süresi (dakika)<input name="minutes" type="number" min="1" max="240" value="60" required></label>
    <div class="span-2 form-hint">Başlattığınız anda adınız ve kalan süre tüm personele görünür. Sayacı durdurma ve sıfırlama yetkisi yalnızca sizde olur.</div>
    <div class="span-2"><button class="btn btn-primary btn-block">Sayacı Başlat</button></div>
  </form>`);
  document.getElementById('laundryStartForm').addEventListener('submit', async e => {
    e.preventDefault();
    const minutes = Math.max(1, Math.min(240, Number(new FormData(e.target).get('minutes') || 0)));
    if (activeLaundryRun(machine)) return toast('Makinede başka bir aktif sayaç bulunuyor.');
    const startAt = new Date(), endAt = new Date(startAt.getTime() + minutes * 60000), id = Date.now();
    db.laundryRuns ||= [];
    db.laundryRuns.push({ id, userId: currentUser.id, userName: currentUser.name, machine, durationMinutes: minutes, startAt: startAt.toISOString(), endAt: endAt.toISOString(), status: 'running', createdAt: startAt.toISOString() });
    localStorage.removeItem(laundryNotificationKey({id}));
    logAudit('laundry.start', `${currentUser.name} · ${machine} · ${minutes} dakika`);
    saveDB(); closeModal(); renderLaundry(); toast(`${machine} sayacı ${minutes} dakika için başlatıldı.`);
    if ('Notification' in window && Notification.permission === 'default') requestSiteNotifications();
  });
}
function stopLaundryRun(id) {
  const run=(db.laundryRuns||[]).find(x=>x.id===Number(id)); if(!run)return;
  if(run.userId!==currentUser.id)return toast('Bu sayacı yalnızca başlatan kullanıcı durdurabilir.');
  if(laundryEffectiveStatus(run)!=='running')return toast('Sayaç zaten çalışmıyor.');
  const now=new Date();
  run.remainingMs=Math.max(0,new Date(run.endAt).getTime()-now.getTime());
  run.status='stopped'; run.stoppedAt=now.toISOString(); run.stoppedBy=currentUser.id;
  localStorage.setItem(laundryNotificationKey(run),'1');
  logAudit('laundry.stop', `${currentUser.name} · ${run.machine} · sayaç durduruldu`);
  saveDB(); renderLaundry(); toast('Sayaç durduruldu.');
}
function resetLaundryRun(id) {
  const run=(db.laundryRuns||[]).find(x=>x.id===Number(id)); if(!run)return;
  if(run.userId!==currentUser.id)return toast('Bu sayacı yalnızca başlatan kullanıcı sıfırlayabilir.');
  const now = new Date().toISOString();
  if (!run.stoppedAt && laundryEffectiveStatus(run) === 'running') run.stoppedAt = now;
  run.status='reset'; run.resetAt=now; run.clearedAt=now; run.resetBy=currentUser.id;
  localStorage.setItem(laundryNotificationKey(run),'1');
  logAudit('laundry.reset', `${currentUser.name} · ${run.machine} · sayaç sıfırlandı`);
  saveDB(); renderLaundry(); toast('Sayaç sıfırlandı. Geçmiş kullanım kaydı korunarak makine yeniden kullanıma açıldı.');
}

function canViewReport(type) {
  if (isAdmin()) return true;
  if (type === 'meal') return hasPermission('meal.manage') || hasPermission('kitchen.view');
  if (type === 'finance' || type === 'balance') return hasPermission('finance.manage');
  if (type === 'leave') return hasPermission('leave.view');
  if (type === 'planning') return hasPermission('leave.plan');
  if (type === 'laundry') return hasPermission('laundry.manage');
  return false;
}
function renderReports() {
  if (!hasPermission('reports.view')) return goPage('dashboard');
  const cards = [
    ['meal','🍽','Yemek Katılım Raporu','Tarih ve öğün bazında katılım dökümü'],
    ['finance','₺','Borç ve Tahsilat Raporu','Dönemsel borç, ödeme ve bakiye özeti'],
    ['leave','📅','Yıllık İzin Raporu','Personel bazında kullanılan ve kalan izinler'],
    ['planning','⭐','İzin Planlama Raporu','Tercih, yönetim puanı ve dağıtım sonuçları'],
    ['laundry','🧺','Çamaşır Sayaç Raporu','Makine sayaç kullanım kayıtları'],
    ['balance','📊','Aylık Bilanço','Malzeme, öğün maliyeti ve personel borçları']
  ].filter(x=>canViewReport(x[0]));
  document.getElementById('pageContent').innerHTML = cards.length
    ? `<div class="grid grid-3">${cards.map(x=>`<div class="card"><div class="card-body">${reportCard(...x)}</div></div>`).join('')}</div>`
    : '<div class="empty">Rolünüz için tanımlı rapor bulunmuyor.</div>';
}

function reportCard(type, icon, title, desc) {
  return `<div class="metric-icon">${icon}</div><h3>${title}</h3><p class="form-note">${desc}</p><div class="section-gap report-actions"><button class="btn btn-primary btn-sm" onclick="downloadCsv('${title}')">Excel/CSV İndir</button> <button class="btn btn-secondary btn-sm" onclick="openReportPreview('${type}')">PDF Önizle</button></div>`;
}
function reportPeriodKey() { return db.settings.balancePeriod || `${new Date().getFullYear()}-${pad(new Date().getMonth()+1)}`; }
function reportHtml(type) {
  const generated = new Date().toLocaleString('tr-TR');
  const head = title => `<div class="report-head"><div><h1>PBYS</h1><p>Personel Bilgi Yönetim Sistemi</p></div><div><strong>${title}</strong><span>Oluşturma: ${generated}</span></div></div>`;
  if (type === 'meal') {
    const period = reportPeriodKey(), [y,m] = period.split('-').map(Number), last = new Date(y,m,0).getDate();
    const rows = Array.from({length:last},(_,i)=>`${y}-${pad(m)}-${pad(i+1)}`).map(date=>{const x=mealDateSummary(date);return `<tr><td>${formatDayDate(date)}</td><td>${x.breakfast}</td><td>${x.dinner}</td><td>${x.duty}</td><td>${x.no}</td><td>${x.leave}</td></tr>`}).join('');
    return `${head('Yemek Katılım Raporu')}<table><thead><tr><th>Tarih</th><th>Sabah</th><th>Akşam</th><th>Görev/Ayır</th><th>Yemeyecek</th><th>İzin</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  if (type === 'finance') {
    const rows = db.debts.map(d=>`<tr><td>${escapeHtml(getUser(d.userId)?.name||'-')}</td><td>${escapeHtml(d.period)}</td><td>${money(d.amount)}</td><td>${money(d.paid)}</td><td>${money(Math.max(0,d.amount-d.paid))}</td></tr>`).join('');
    return `${head('Borç ve Tahsilat Raporu')}<table><thead><tr><th>Personel</th><th>Dönem</th><th>Borç</th><th>Ödenen</th><th>Kalan</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Kayıt yok.</td></tr>'}</tbody></table>`;
  }
  if (type === 'leave') {
    const summaryRows = approvedUsers().map(u => {
      const usedAnnual = Number(u.usedLeave || 0) + getApprovedAnnualDays(u.id, false);
      const usedRoad = Number(u.usedRoadLeave || 0) + getApprovedRoadDays(u.id, false);
      return `<tr><td>${escapeHtml(u.name)}</td><td>${u.annualAllowance??30}</td><td>${usedAnnual}</td><td>${getRemainingLeave(u)}</td><td>${u.roadAllowance??2}</td><td>${usedRoad}</td><td>${getRoadRemaining(u)}</td></tr>`;
    }).join('');
    const usedRows = [];
    approvedUsers().forEach(u => {
      getUsedLeaveRanges(u.id, 'Yıllık İzin').forEach(x => usedRows.push(`<tr><td>${escapeHtml(u.name)}</td><td>Yıllık İzin</td><td>${formatShortDate(x.start)} – ${formatShortDate(x.usedEnd)}</td><td>${x.usedDays}</td></tr>`));
      getUsedLeaveRanges(u.id, 'Yol İzni').forEach(x => usedRows.push(`<tr><td>${escapeHtml(u.name)}</td><td>Yol İzni</td><td>${formatShortDate(x.start)} – ${formatShortDate(x.usedEnd)}</td><td>${x.usedDays}</td></tr>`));
      if (Number(u.usedLeave || 0)) usedRows.push(`<tr><td>${escapeHtml(u.name)}</td><td>Yıllık İzin</td><td>Eski manuel kayıt · tarih girilmemiş</td><td>${Number(u.usedLeave)}</td></tr>`);
      if (Number(u.usedRoadLeave || 0)) usedRows.push(`<tr><td>${escapeHtml(u.name)}</td><td>Yol İzni</td><td>Eski manuel kayıt · tarih girilmemiş</td><td>${Number(u.usedRoadLeave)}</td></tr>`);
    });
    return `${head('Yıllık İzin Raporu')}<p class="report-note">Onaylanan gelecek izinler hemen kullanılmış izne düşmez. İzin başlangıcının ertesi günü ilk tamamlanan gün kullanılmış sayılır.</p><h3>İzin Bakiyeleri</h3><table><thead><tr><th>Personel</th><th>Yıllık Hak</th><th>Yıllık Kullanılan</th><th>Yıllık Kalan</th><th>Yol Hak</th><th>Yol Kullanılan</th><th>Yol Kalan</th></tr></thead><tbody>${summaryRows}</tbody></table><h3>Kullanılan İzin Tarihleri</h3><table><thead><tr><th>Personel</th><th>İzin Türü</th><th>Kullanılan Tarih Aralığı</th><th>Gün</th></tr></thead><tbody>${usedRows.join('') || '<tr><td colspan="4">Henüz kullanılmış izin kaydı bulunmuyor.</td></tr>'}</tbody></table>`;
  }
  if (type === 'planning') {
    const year=db.settings.leavePlanYear;
    const winterRows=planningUsers().map(u=>{const p=normalizePreferenceRecord(db.leavePreferences.find(x=>x.userId===u.id&&x.year===year));const r=db.leavePlanResults.find(x=>x.userId===u.id&&x.year===year);return `<tr><td>${escapeHtml(u.name)}</td><td>${u.planningScore??0}</td><td>${p&&p.winterFirstStart?`${formatShortDate(p.winterFirstStart)} - ${formatShortDate(p.winterFirstEnd)}`:'—'}</td><td>${p&&p.winterSecondStart?`${formatShortDate(p.winterSecondStart)} - ${formatShortDate(p.winterSecondEnd)}`:'—'}</td><td>${r?resultSeasonLabel(r,'winter'):'—'}</td></tr>`}).join('');
    const summerRows=planningUsers().map(u=>{const p=normalizePreferenceRecord(db.leavePreferences.find(x=>x.userId===u.id&&x.year===year));const r=db.leavePlanResults.find(x=>x.userId===u.id&&x.year===year);return `<tr><td>${escapeHtml(u.name)}</td><td>${u.planningScore??0}</td><td>${p&&p.summerFirstStart?`${formatShortDate(p.summerFirstStart)} - ${formatShortDate(p.summerFirstEnd)}`:'—'}</td><td>${p&&p.summerSecondStart?`${formatShortDate(p.summerSecondStart)} - ${formatShortDate(p.summerSecondEnd)}`:'—'}</td><td>${r?resultSeasonLabel(r,'summer'):'—'}</td></tr>`}).join('');
    return `${head(`${year} İzin Planlama Raporu`)}<h3>❄️ Kış Dönemi · 10 Gün</h3><p class="report-note">Ocak-Mayıs ve Ekim-Aralık dönemlerinde ikişer tercih alınır.</p><table><thead><tr><th>Personel</th><th>İç Puan</th><th>Kış 1</th><th>Kış 2</th><th>Karar</th></tr></thead><tbody>${winterRows}</tbody></table><h3>☀️ Yaz Dönemi · 20 Gün</h3><p class="report-note">Haziran-Eylül dönemlerinde ikişer tercih alınır.</p><table><thead><tr><th>Personel</th><th>İç Puan</th><th>Yaz 1</th><th>Yaz 2</th><th>Karar</th></tr></thead><tbody>${summerRows}</tbody></table>`;
  }
  if (type === 'laundry') {
    const runs=(db.laundryRuns||[]).slice().sort((a,b)=>String(b.startAt||'').localeCompare(String(a.startAt||''))).map(x=>{
      const status=x.status==='reset'?'Sıfırlandı':x.status==='stopped'?'Durduruldu':x.status==='finished'?'Tamamlandı':'Çalışıyor';
      return `<tr><td>${new Date(x.startAt).toLocaleDateString('tr-TR')}</td><td>${formatClockFromIso(x.startAt)}</td><td>${escapeHtml(x.machine)}</td><td>${escapeHtml(getUser(x.userId)?.name||'-')}</td><td>${Number(x.durationMinutes||0)} dk · ${status}</td></tr>`;
    });
    return `${head('Çamaşır Sayaç Raporu')}<table><thead><tr><th>Tarih</th><th>Saat</th><th>Cihaz</th><th>Personel</th><th>Durum</th></tr></thead><tbody>${runs.join('')||'<tr><td colspan="5">Kayıt yok.</td></tr>'}</tbody></table>`;
  }
  const calc=balanceRowsForPeriod(reportPeriodKey());
  const expenseRows=db.expenses.filter(x=>x.date>=calc.start&&x.date<=calc.end).map(x=>`<tr><td>${formatShortDate(x.date)}</td><td>${escapeHtml(x.name)}</td><td>${money(x.amount)}</td></tr>`).join('');
  const personRows=calc.rows.map(x=>`<tr><td>${escapeHtml(x.user.name)}</td><td>${x.count}</td><td>${money(x.count*calc.unit)}</td><td>${annualLeavePeriodHtml(x.user.id,calc.start,calc.end)}</td></tr>`).join('');
  const leaveRows=calc.rows.flatMap(x=>annualLeaveRangesForPeriod(x.user.id,calc.start,calc.end).map(r=>`<tr><td>${escapeHtml(x.user.name)}</td><td>${formatShortDate(r.clippedStart)} – ${formatShortDate(r.clippedEnd)}</td><td>${r.periodDays} gün</td><td>${r.totalDays} gün</td></tr>`)).join('');
  return `${head(`Aylık Tabldot Bilançosu · ${calc.label}`)}<div class="report-summary"><span>Toplam gider: <strong>${money(calc.totalExpense)}</strong></span><span>Toplam tabldot öğünü: <strong>${calc.totalMeals}</strong></span><span>Öğün birim maliyeti: <strong>${money(calc.unit)}</strong></span></div><p class="report-note">Yemek tercihi ortak gider payını değiştirmez. Bu raporda yalnızca onaylı yıllık izin günleri tabldot hesabından düşülür ve izinli personel tarih aralığıyla birlikte ayrıca gösterilir.</p><h3>Giderler</h3><table><thead><tr><th>Tarih</th><th>Malzeme</th><th>Tutar</th></tr></thead><tbody>${expenseRows||'<tr><td colspan="3">Gider yok.</td></tr>'}</tbody></table><h3>Personel Hesabı</h3><table><thead><tr><th>Personel</th><th>Tabldot Öğünü</th><th>Tutar</th><th>Dönem İçindeki Yıllık İzin</th></tr></thead><tbody>${personRows}</tbody></table><h3>Yıllık İzin Nedeniyle Tabldot Dışında Kalan Personel</h3><table><thead><tr><th>Personel</th><th>İzin Tarih Aralığı</th><th>Bu Dönemde Hariç Gün</th><th>İznin Toplam Süresi</th></tr></thead><tbody>${leaveRows||'<tr><td colspan="4">Bu dönemde yıllık izin nedeniyle tabldot dışında kalan personel bulunmuyor.</td></tr>'}</tbody></table>`;
}
function openReportPreview(type) {
  if (!hasPermission('reports.view') || !canViewReport(type)) return toast('Bu raporu görüntüleme yetkiniz yok.');
  const titleMap={meal:'Yemek Katılım Raporu',finance:'Borç ve Tahsilat Raporu',leave:'Yıllık İzin Raporu',planning:'İzin Planlama Raporu',laundry:'Çamaşır Sayaç Raporu',balance:'Aylık Bilanço'};
  showModal(`${titleMap[type] || 'Rapor'} · PDF Önizleme`, `<div class="pdf-preview" id="reportPreview">${reportHtml(type)}</div><div class="section-gap report-preview-actions"><button class="btn btn-primary" onclick="printReportPreview('${type}')">PDF / Yazdır</button></div>`);
}
function printReportPreview(type) {
  const existing=document.getElementById('reportPrintArea'); if(existing) existing.remove();
  const area=document.createElement('div'); area.id='reportPrintArea'; area.className='report-print-area'; area.innerHTML=reportHtml(type); document.body.appendChild(area);
  document.body.classList.add('printing-report');
  const cleanup=()=>{document.body.classList.remove('printing-report');area.remove();window.removeEventListener('afterprint',cleanup);};
  window.addEventListener('afterprint',cleanup);
  window.print();
  setTimeout(()=>{if(document.body.classList.contains('printing-report'))cleanup();},30000);
}
function downloadCsv(title) {
  let csv = 'Rapor;Tarih;Değer\n';
  if (title.includes('Borç')) csv += db.debts.map(d=>`${getUser(d.userId)?.name||'-'};${d.period};${d.amount-d.paid}`).join('\n');
  else if (title.includes('İzin')) csv += approvedUsers().map(u=>`${u.name};${toISO(new Date())};${getRemainingLeave(u)} gün kalan`).join('\n');
  else csv += `${title};${toISO(new Date())};PBYS raporu`;
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = title.replaceAll(' ', '_') + '.csv'; a.click(); URL.revokeObjectURL(a.href); toast('Rapor indirildi.');
}

function renderSettings() {
  if (!isAdmin()) return goPage('dashboard');
  const year = db.settings.leavePlanYear;
  const preferenceOpen = db.settings.leavePreferencesOpen !== false;
  const yearPreferenceCount = db.leavePreferences.filter(x => x.year === year).length;
  const pendingResetCount = db.leavePreferences.filter(x => x.year === year && x.resetRequestStatus === 'pending').length;
  document.getElementById('pageContent').innerHTML = `<div class="grid grid-2"><div class="card"><div class="card-header"><div><h3>PBYS sistem ayarları</h3><p>Ortak ayarlar Firestore settings/app belgesine yazılır.</p></div></div><div class="card-body"><form id="settingsForm">
    <label>Sistem adı<input name="systemName" value="${escapeHtml(db.settings.systemName || 'PBYS')}"></label>
    <label class="section-gap">Banka adı<input name="bankName" value="${escapeHtml(db.settings.bankName || '')}"></label>
    <label class="section-gap">Hesap sahibi<input name="accountName" value="${escapeHtml(db.settings.accountName)}"></label>
    <label class="section-gap">IBAN<input name="iban" value="${escapeHtml(db.settings.iban)}"></label>
    <label class="section-gap">Haftalık çamaşır kullanım limiti<input name="weeklyLaundryLimit" type="number" min="1" value="${db.settings.weeklyLaundryLimit}"></label>
    <label class="section-gap">Yıllık izin planlama yılı<input name="leavePlanYear" type="number" min="2026" value="${db.settings.leavePlanYear}"></label>
    <label class="section-gap">Aynı anda izinli azami oran (%)<input name="leaveConcurrentPercent" type="number" min="1" max="100" value="${db.settings.leaveConcurrentPercent || 25}"></label>
    <label class="section-gap">2. tercih kabul puan bonusu<input name="planningSecondChoiceBonus" type="number" min="0" value="${db.settings.planningSecondChoiceBonus ?? 20}"></label>
    <button class="btn btn-primary section-gap">Ayarları Kaydet</button></form></div></div>
    <div class="card"><div class="card-header"><div><h3>Firebase / Firestore</h3><p>Veriler site üzerinden yönetilir.</p></div></div><div class="card-body"><div class="firebase-card"><strong>Proje: ${escapeHtml(window.FirebaseBridge?.projectId || 'gencservi-5d47e')}</strong><span>Kullanıcı, yemek, izin, yoklama, ödeme, arıza ve çamaşır verileri Firestore koleksiyonlarında tutulur.</span><div class="sync-actions"><button class="btn btn-primary btn-sm" onclick="refreshFromCloud()">Buluttan Yenile</button><button class="btn btn-secondary btn-sm" onclick="exportBackup()">JSON Yedek İndir</button></div></div><p class="form-note section-gap">Test aşamasından sonra Firestore Security Rules rol/yetki sistemine göre kilitlenmelidir.</p></div></div></div>
    <div class="card section-gap"><div class="card-header"><div><h3>🗓 Yıllık izin tercih yönetimi</h3><p>${year} yılı tercih ekranını Admin olarak açabilir, kapatabilir veya tüm tercihleri sıfırlayabilirsiniz. Karakol Komutanı aynı işlemleri Yıllık İzin Anket Sonuçları ekranından yapabilir.</p></div><span class="status ${preferenceOpen ? 'success' : 'danger'}">${preferenceOpen ? 'Tercihler Açık' : 'Tercihler Kapalı'}</span></div><div class="card-body"><div class="grid grid-3">${metric('🔐','Tercih sistemi',preferenceOpen?'Açık':'Kapalı',preferenceOpen?'Personel tercih kaydedebilir':'Personel formu salt okunur')}${metric('📨','Kayıtlı tercih',yearPreferenceCount+' kişi',year+' yılı')}${metric('🔄','Sıfırlama talebi',pendingResetCount+' bekleyen','Onay/ret: Yıllık İzin Anket Sonuçları')}</div><div class="sync-actions section-gap"><button class="btn ${preferenceOpen ? 'btn-warning' : 'btn-success'}" onclick="toggleLeavePreferenceSystem()">${preferenceOpen ? 'Yıllık İzin Tercihlerini Kapat' : 'Yıllık İzin Tercihlerini Aç'}</button><button class="btn btn-danger" onclick="resetAllLeavePreferences()">${year} Tercihlerini Toplu Sıfırla</button>${pendingResetCount ? `<button class="btn btn-secondary" onclick="goPage('leave-planning')">${pendingResetCount} Sıfırlama Talebini İncele</button>` : ''}</div><p class="form-note section-gap">Toplu sıfırlama yalnızca seçili planlama yılının tercihlerini ve o yıla ait planlama sonuçlarını temizler. Personelin bireysel sıfırlama talebi ise Admin veya Karakol Komutanı onaylayana kadar mevcut tercihi silmez.</p></div></div>`;
  document.getElementById('settingsForm').addEventListener('submit', e => {
    e.preventDefault(); const f=new FormData(e.target);
    db.settings={...db.settings,systemName:f.get('systemName'),bankName:f.get('bankName'),accountName:f.get('accountName'),iban:f.get('iban'),weeklyLaundryLimit:Number(f.get('weeklyLaundryLimit')),leavePlanYear:Number(f.get('leavePlanYear')),leaveConcurrentPercent:Number(f.get('leaveConcurrentPercent')),planningSecondChoiceBonus:Number(f.get('planningSecondChoiceBonus'))};
    saveDB();renderSettings();toast('Sistem ayarları kaydedildi.');
  });
}
function toggleLeavePreferenceSystem() {
  if (!canManageLeavePreferences()) return toast('Bu işlem için yıllık izin tercih yönetimi yetkiniz yok.');
  const next = db.settings.leavePreferencesOpen === false;
  const action = next ? 'açılsın' : 'kapatılsın';
  if (!confirm(`${db.settings.leavePlanYear} yıllık izin tercih sistemi ${action} mı?`)) return;
  db.settings.leavePreferencesOpen = next;
  logAudit('leave.preference_system', `${db.settings.leavePlanYear} tercih sistemi ${next ? 'açıldı' : 'kapatıldı'}`);
  saveDB(); currentPage === 'settings' && isAdmin() ? renderSettings() : renderLeavePlanning(); toast(`Yıllık izin tercih sistemi ${next ? 'açıldı' : 'kapatıldı'}.`);
}
function resetAllLeavePreferences() {
  if (!canManageLeavePreferences()) return toast('Bu işlem için yıllık izin tercih yönetimi yetkiniz yok.');
  const year = db.settings.leavePlanYear;
  const count = db.leavePreferences.filter(x => x.year === year).length;
  if (!count) return toast(`${year} yılı için sıfırlanacak tercih bulunmuyor.`);
  if (!confirm(`${year} yılına ait ${count} personelin TÜM yıllık izin tercihleri ve planlama sonuçları sıfırlanacak. Bu işlem uygulansın mı?`)) return;
  db.leavePreferences = db.leavePreferences.filter(x => x.year !== year);
  db.leavePlanResults = db.leavePlanResults.filter(x => x.year !== year);
  logAudit('leave.preference_reset_all', `${year}: ${count} personelin yıllık izin tercihleri topluca sıfırlandı`);
  saveDB(); currentPage === 'settings' && isAdmin() ? renderSettings() : renderLeavePlanning(); toast(`${year} yılı yıllık izin tercihleri topluca sıfırlandı.`);
}
function exportBackup() { const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'gencservi-v6-firestore-yedek.json'; a.click(); URL.revokeObjectURL(a.href); toast('Yedek dosyası indirildi.'); }
function resetDemo() { refreshFromCloud(); }

function renderProfile() {
  document.getElementById('pageContent').innerHTML = `<div class="grid grid-2"><div class="card"><div class="card-header"><div><h3>Profil bilgilerim</h3><p>Tek giriş hesabınızın kişisel bilgileri</p></div></div><div class="card-body"><form id="profileForm"><label>Ad soyad<input name="name" value="${escapeHtml(currentUser.name)}"></label><label class="section-gap">Telefon<input value="${currentUser.phone}" readonly></label><label class="section-gap">Görev / rütbe<input name="title" value="${escapeHtml(currentUser.title)}"></label><label class="section-gap">Yetki<input value="${escapeHtml(userRoleLabels(currentUser))}${hasManagementPermission() ? ' + Personel işlevleri' : ''}" readonly></label><button class="btn btn-primary section-gap">Bilgileri Kaydet</button></form></div></div><div class="card"><div class="card-header"><div><h3>Şifre güvenliği</h3><p>Şifrenizi düzenli olarak güncelleyin</p></div></div><div class="card-body"><button class="btn btn-secondary" onclick="openPasswordModal()">Şifremi Değiştir</button></div></div></div>`;
  document.getElementById('profileForm').addEventListener('submit', e => { e.preventDefault(); const f = new FormData(e.target); currentUser.name = f.get('name'); currentUser.title = f.get('title'); saveDB(); login(currentUser); toast('Profil bilgileriniz güncellendi.'); });
}

function openPasswordModal() {
  showModal('Şifre Değiştir', `<form id="passwordForm" class="form-grid"><label class="span-2">Yeni şifre<input name="password" type="password" minlength="6" required></label><label class="span-2">Yeni şifre tekrar<input name="confirm" type="password" minlength="6" required></label><div class="span-2"><button class="btn btn-primary btn-block">Şifreyi Güncelle</button></div></form>`);
  document.getElementById('passwordForm').addEventListener('submit', async e => {
    e.preventDefault(); const f = new FormData(e.target);
    if (f.get('password') !== f.get('confirm')) return toast('Şifreler aynı değil.');
    try { await window.FirebaseBridge.changePassword(f.get('password')); closeModal(); toast('Firebase Authentication şifreniz güncellendi.'); }
    catch (error) { toast(window.FirebaseBridge.errorMessage(error)); }
  });
}

init();
