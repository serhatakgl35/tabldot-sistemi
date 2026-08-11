import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  limit,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAUAdNiglZ0UM3JcAUW4JbEAHJg5JwnQD8',
  authDomain: 'gencservi-5d47e.firebaseapp.com',
  projectId: 'gencservi-5d47e',
  storageBucket: 'gencservi-5d47e.firebasestorage.app',
  messagingSenderId: '368555262601',
  appId: '1:368555262601:web:ebc9a6bbefd5c5655ffc58'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);
await setPersistence(auth, browserLocalPersistence);

const DEFAULT_SETTINGS = {
  systemName: 'PBYS',
  iban: 'TR00 0000 0000 0000 0000 0000 00',
  accountName: 'Ortak Tabldot Hesabı',
  bankName: '',
  weeklyLaundryLimit: 2,
  leavePlanYear: 2027,
  leaveConcurrentPercent: 25,
  roadAllowanceDefault: 2,
  planningSecondChoiceBonus: 20,
  planningFirstChoiceBonus: 0,
  laundryMachineStatus: { 'Beyaz Çamaşır Makinesi': 'active', 'Gri Çamaşır Makinesi': 'active', 'Kurutma Makinesi': 'broken' },
  initializedAt: new Date().toISOString()
};

const COLLECTIONS = {
  users: 'users',
  mealChoices: 'mealChoices',
  expenses: 'mealExpenses',
  payments: 'payments',
  debts: 'debts',
  leaveRequests: 'leaveRequests',
  leavePreferences: 'leavePreferences',
  leavePlanResults: 'leavePlanResults',
  laundry: 'laundryReservations',
  laundryFaults: 'laundryFaults',
  attendance: 'attendance',
  auditLogs: 'auditLogs',
  weeklyActivities: 'weeklyActivities',
  dailyMenus: 'dailyMenus'
};

let lastMaps = null;
let realtimeUnsubs = [];
let realtimeTimer = null;
let accessProfile = null;
let lastAccessSignature = '';
let lastPermissionWarnings = [];

function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clean(v)]));
  }
  return value;
}

function phoneToEmail(phone) {
  return `${String(phone || '').replace(/\D/g, '')}@gencservi.app`;
}

function firebaseErrorMessage(error) {
  const code = error?.code || '';
  const map = {
    'auth/email-already-in-use': 'Bu telefon numarasıyla daha önce kayıt oluşturulmuş.',
    'auth/invalid-credential': 'Telefon numarası veya şifre hatalı.',
    'auth/invalid-login-credentials': 'Telefon numarası veya şifre hatalı.',
    'auth/weak-password': 'Şifre en az 6 karakter olmalıdır.',
    'auth/too-many-requests': 'Çok fazla deneme yapıldı. Bir süre sonra tekrar deneyin.',
    'auth/network-request-failed': 'Firebase bağlantısı kurulamadı. İnternet bağlantınızı kontrol edin.',
    'auth/operation-not-allowed': 'Firebase Authentication içinde Email/Password giriş yöntemi henüz etkinleştirilmemiş.',
    'permission-denied': 'Firestore erişim izni reddedildi. Güvenlik kurallarını kontrol edin.',
    'firestore/permission-denied': 'Firestore erişim izni reddedildi. Güvenlik kurallarını kontrol edin.'
  };
  return map[code] || error?.message || 'Firebase işlemi tamamlanamadı.';
}

async function ensureSettings() {
  const ref = doc(firestore, 'settings', 'app');
  const snap = await getDoc(ref);
  if (!snap.exists()) await setDoc(ref, DEFAULT_SETTINGS);
  return snap.exists() ? snap.data() : DEFAULT_SETTINGS;
}

async function hasAnyUsers() {
  const snap = await getDocs(query(collection(firestore, 'users'), limit(1)));
  return !snap.empty;
}

async function hasAnyAdmin() {
  const snap = await getDocs(collection(firestore, 'users'));
  return snap.docs.some(d => {
    const data = d.data() || {};
    return data.role === 'admin' || (Array.isArray(data.roles) && data.roles.includes('admin'));
  });
}

async function getUserProfile(uid) {
  const snap = await getDoc(doc(firestore, 'users', uid));
  return snap.exists() ? { ...snap.data(), uid: snap.id } : null;
}

async function createProfile(uid, profile) {
  const payload = clean({
    ...profile,
    uid,
    createdAt: profile.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  await setDoc(doc(firestore, 'users', uid), payload, { merge: true });
  return payload;
}

async function bootstrapAdmin({ name, phone, title, password }) {
  if (await hasAnyAdmin()) throw new Error('Sistemde zaten bir admin hesabı bulunuyor.');

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, phoneToEmail(phone), password);
  } catch (error) {
    if (error?.code !== 'auth/email-already-in-use') throw error;
    // Kullanıcı daha önce Kayıt Ol ekranından hesap açtıysa aynı telefon/şifreyle
    // mevcut Authentication hesabını ilk admin olarak yükselt.
    cred = await signInWithEmailAndPassword(auth, phoneToEmail(phone), password);
  }

  const existing = await getUserProfile(cred.user.uid);
  const profile = await createProfile(cred.user.uid, {
    ...(existing || {}),
    id: existing?.id || 1,
    name: name || existing?.name || 'Sistem Yöneticisi',
    phone,
    title: title || existing?.title || 'Sistem Yöneticisi',
    role: 'admin',
    roles: Array.from(new Set([...(existing?.roles || ['staff']), 'staff', 'admin'])),
    extraPermissions: existing?.extraPermissions || [],
    approved: true,
    rejected: false,
    annualAllowance: existing?.annualAllowance ?? 30,
    roadAllowance: existing?.roadAllowance ?? 2,
    usedLeave: existing?.usedLeave ?? 0,
    usedRoadLeave: existing?.usedRoadLeave ?? 0,
    planningScore: existing?.planningScore ?? 50,
    planningScoreNote: existing?.planningScoreNote || ''
  });
  await ensureSettings();
  return profile;
}

async function registerPending({ name, phone, title, password }) {
  const cred = await createUserWithEmailAndPassword(auth, phoneToEmail(phone), password);
  await createProfile(cred.user.uid, {
    id: Date.now(),
    name,
    phone,
    title,
    role: 'staff',
    roles: ['staff'],
    extraPermissions: [],
    approved: false,
    rejected: false,
    annualAllowance: 30,
    roadAllowance: 2,
    usedLeave: 0,
    usedRoadLeave: 0,
    planningScore: 50,
    planningScoreNote: ''
  });
  await signOut(auth);
}

async function adminCreateUser(profile, password) {
  const secondary = initializeApp(firebaseConfig, `secondary-${Date.now()}-${Math.random()}`);
  try {
    const secondaryAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, phoneToEmail(profile.phone), password);
    await setDoc(doc(firestore, 'users', cred.user.uid), clean({
      ...profile,
      uid: cred.user.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    await signOut(secondaryAuth);
    return { ...profile, uid: cred.user.uid };
  } finally {
    await deleteApp(secondary);
  }
}

async function signIn(phone, password) {
  const cred = await signInWithEmailAndPassword(auth, phoneToEmail(phone), password);
  return cred.user;
}

async function signOutUser() {
  await signOut(auth);
}

function waitForAuthState() {
  return new Promise(resolve => {
    let unsub = () => {};
    unsub = onAuthStateChanged(auth, user => { unsub(); resolve(user); });
  });
}

async function changePassword(newPassword) {
  if (!auth.currentUser) throw new Error('Oturum bulunamadı.');
  await updatePassword(auth.currentUser, newPassword);
}

function accessSignature(profile) {
  if (!profile) return '';
  const roles = Array.isArray(profile.roles) ? [...profile.roles].sort() : [];
  const extras = Array.isArray(profile.extraPermissions) ? [...profile.extraPermissions].sort() : [];
  return JSON.stringify({
    uid: profile.uid || '',
    role: profile.role || '',
    roles,
    extras,
    approved: !!profile.approved,
    rejected: !!profile.rejected,
    id: profile.id ?? null
  });
}

function setAccessProfile(profile) {
  const next = profile ? { ...profile } : null;
  const nextSignature = accessSignature(next);
  const changed = nextSignature !== lastAccessSignature;
  accessProfile = next;
  lastAccessSignature = nextSignature;
  if (changed) lastMaps = null;
  return changed;
}

async function refreshAccessProfile() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Oturum bulunamadı.');
  const profile = await getUserProfile(uid);
  if (!profile) throw new Error('Kullanıcı profili bulunamadı.');
  setAccessProfile(profile);
  return profile;
}

function isPermissionDenied(error) {
  const code = String(error?.code || '');
  return code === 'permission-denied' || code === 'firestore/permission-denied';
}

function profileRoles(profile = accessProfile) {
  const roles = new Set(Array.isArray(profile?.roles) ? profile.roles : []);
  if (profile?.role) roles.add(profile.role);
  return roles;
}

function accessApproved() {
  return !!(accessProfile?.approved && !accessProfile?.rejected);
}

function accessHasRole(role) {
  return accessApproved() && profileRoles().has(role);
}

function accessHasExtra(permission) {
  return accessApproved() && Array.isArray(accessProfile?.extraPermissions) && accessProfile.extraPermissions.includes(permission);
}

function accessIsAdmin() { return accessHasRole('admin'); }
function personnelViewer() { return accessIsAdmin() || accessHasRole('administrative') || accessHasRole('commander') || accessHasExtra('personnel.view'); }
function kitchenViewer() { return accessIsAdmin() || accessHasRole('cook') || accessHasExtra('kitchen.view'); }
function mealManager() { return accessIsAdmin() || accessHasRole('tabldot') || accessHasRole('administrative') || accessHasExtra('meal.manage'); }
function financeManager() { return accessIsAdmin() || accessHasRole('tabldot') || accessHasRole('administrative') || accessHasExtra('finance.manage'); }
function attendanceViewer() { return accessIsAdmin() || accessHasRole('administrative') || accessHasRole('commander') || accessHasExtra('attendance.view') || accessHasExtra('attendance.manage'); }
function leaveViewer() { return accessIsAdmin() || accessHasRole('administrative') || accessHasRole('commander') || accessHasExtra('leave.view') || accessHasExtra('leave.manage') || accessHasExtra('leave.approve') || accessHasExtra('leave.plan'); }
function leavePlanner() { return accessIsAdmin() || accessHasRole('commander') || accessHasExtra('leave.plan'); }
function laundryManager() { return accessIsAdmin() || accessHasExtra('laundry.manage'); }
function ownNumericId() { return Number(accessProfile?.id); }

async function collectionData(name, constraints = []) {
  const ref = constraints.length ? query(collection(firestore, name), ...constraints) : collection(firestore, name);
  const snap = await getDocs(ref);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}

function collectionRef(name, constraints = []) {
  return constraints.length ? query(collection(firestore, name), ...constraints) : collection(firestore, name);
}

function readPlan() {
  if (!accessApproved()) throw new Error('Onaylı kullanıcı oturumu bulunamadı.');
  const myId = ownNumericId();
  if (!Number.isFinite(myId)) throw new Error('Kullanıcı personel kimliği bulunamadı.');

  const fullUsers = personnelViewer() || leaveViewer() || attendanceViewer();
  const approvedUsers = !fullUsers && (kitchenViewer() || mealManager() || financeManager() || laundryManager());

  return {
    myId,
    users: fullUsers ? { mode: 'collection' } : approvedUsers ? { mode: 'query', constraints: [where('approved', '==', true)] } : { mode: 'ownDoc' },
    mealChoices: (mealManager() || kitchenViewer()) ? { mode: 'collection' } : { mode: 'query', constraints: [where('userId', '==', myId)] },
    expenses: financeManager() ? { mode: 'collection' } : { mode: 'none' },
    payments: financeManager() ? { mode: 'collection' } : { mode: 'query', constraints: [where('userId', '==', myId)] },
    debts: financeManager() ? { mode: 'collection' } : { mode: 'query', constraints: [where('userId', '==', myId)] },
    leaveRequests: leaveViewer()
      ? { mode: 'collection' }
      : (kitchenViewer() || financeManager())
        ? { mode: 'query', constraints: [where('status', '==', 'approved'), where('type', '==', 'Yıllık İzin')] }
        : { mode: 'query', constraints: [where('userId', '==', myId)] },
    leavePreferences: leavePlanner() ? { mode: 'collection' } : { mode: 'query', constraints: [where('userId', '==', myId)] },
    leavePlanResults: leavePlanner() ? { mode: 'collection' } : { mode: 'query', constraints: [where('userId', '==', myId)] },
    laundry: { mode: 'collection' },
    laundryFaults: { mode: 'collection' },
    attendance: attendanceViewer() ? { mode: 'collection' } : { mode: 'query', constraints: [where('userId', '==', myId)] },
    auditLogs: accessIsAdmin() ? { mode: 'collection' } : { mode: 'none' },
    weeklyActivities: { mode: 'collection' },
    dailyMenus: { mode: 'collection' }
  };
}

async function readByPlan(name, plan) {
  if (!plan || plan.mode === 'none') return [];
  if (plan.mode === 'ownDoc') {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];
    const snap = await getDoc(doc(firestore, COLLECTIONS.users, uid));
    return snap.exists() ? [{ ...snap.data(), _docId: snap.id }] : [];
  }
  return collectionData(name, plan.constraints || []);
}

async function safeReadByPlan(label, name, plan) {
  try {
    return await readByPlan(name, plan);
  } catch (error) {
    if (!isPermissionDenied(error)) throw error;
    console.warn(`[PBYS] ${label} koleksiyonu mevcut yetkiyle okunamadı; bu bölüm boş bırakıldı.`, error);
    lastPermissionWarnings.push(label);
    return [];
  }
}

function emptyState(settings = DEFAULT_SETTINGS) {
  return {
    users: [],
    mealSelections: {},
    expenses: [],
    payments: [],
    debts: [],
    leaveRequests: [],
    leavePreferences: [],
    leavePlanResults: [],
    laundry: [],
    laundryFaults: [],
    attendance: [],
    auditLogs: [],
    weeklyActivities: [],
    dailyMenus: {},
    settings: { ...DEFAULT_SETTINGS, ...settings }
  };
}

function stateToMaps(state) {
  const maps = {};
  maps.users = new Map((state.users || []).filter(u => u.uid).map(u => [String(u.uid), clean({ ...u, password: undefined, _docId: undefined })]));

  const mealMap = new Map();
  Object.entries(state.mealSelections || {}).forEach(([userId, dates]) => {
    Object.entries(dates || {}).forEach(([dateValue, choice]) => {
      mealMap.set(`${userId}_${dateValue}`, clean({ userId: Number(userId), date: dateValue, breakfast: choice?.breakfast || '', dinner: choice?.dinner || '' }));
    });
  });
  maps.mealChoices = mealMap;

  const arrayMap = (items, idFn = x => String(x.id)) => new Map((items || []).map(x => [idFn(x), clean({ ...x, _docId: undefined })]));
  maps.expenses = arrayMap(state.expenses);
  maps.payments = arrayMap(state.payments);
  maps.debts = arrayMap(state.debts, x => `${x.userId}_${String(x.period || '').replace(/[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ_-]+/g, '_')}`);
  maps.leaveRequests = arrayMap(state.leaveRequests);
  maps.leavePreferences = arrayMap(state.leavePreferences, x => `${x.userId}_${x.year}`);
  maps.leavePlanResults = arrayMap(state.leavePlanResults, x => `${x.userId}_${x.year}`);
  maps.laundry = arrayMap(state.laundry);
  maps.laundryFaults = arrayMap(state.laundryFaults);
  maps.attendance = arrayMap(state.attendance);
  maps.auditLogs = arrayMap(state.auditLogs);
  maps.weeklyActivities = arrayMap(state.weeklyActivities);
  maps.dailyMenus = new Map(Object.entries(state.dailyMenus || {}).map(([dateValue, menu]) => [dateValue, clean({ date: dateValue, ...(menu || {}) })]));
  maps.settings = new Map([['app', clean(state.settings || DEFAULT_SETTINGS)]]);
  return maps;
}

function sameData(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function commitOps(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(firestore);
    ops.slice(i, i + 400).forEach(op => {
      const ref = doc(firestore, op.collection, op.id);
      if (op.type === 'delete') batch.delete(ref);
      else batch.set(ref, op.data, { merge: false });
    });
    await batch.commit();
  }
}

async function saveState(state) {
  const next = stateToMaps(state);
  if (!lastMaps) lastMaps = await currentCloudMaps();
  const ops = [];
  const collectionMap = { ...COLLECTIONS, settings: 'settings' };

  Object.entries(next).forEach(([key, nextMap]) => {
    const oldMap = lastMaps[key] || new Map();
    nextMap.forEach((value, id) => {
      if (!oldMap.has(id) || !sameData(oldMap.get(id), value)) {
        ops.push({ type: 'set', collection: collectionMap[key], id, data: value });
      }
    });
    oldMap.forEach((value, id) => {
      if (!nextMap.has(id)) ops.push({ type: 'delete', collection: collectionMap[key], id });
    });
  });

  if (ops.length) await commitOps(ops);
  lastMaps = next;
  return ops.length;
}

async function currentCloudMaps() {
  const state = await loadState(false);
  return stateToMaps(state);
}

async function loadState(updateSnapshot = true) {
  // Yetki değişiklikleri Firestore Rules tarafında anında geçerlidir. Her veri
  // yüklemesinden önce kendi profilimizi tekrar okuyarak eski rol/yetki planıyla
  // sorgu göndermeyi engelliyoruz.
  await refreshAccessProfile();
  const plan = readPlan();
  lastPermissionWarnings = [];

  let settings = DEFAULT_SETTINGS;
  try {
    const settingsSnap = await getDoc(doc(firestore, 'settings', 'app'));
    settings = settingsSnap.exists()
      ? settingsSnap.data()
      : (accessIsAdmin() ? await ensureSettings() : DEFAULT_SETTINGS);
  } catch (error) {
    if (!isPermissionDenied(error)) throw error;
    console.warn('[PBYS] settings/app mevcut yetkiyle okunamadı; varsayılan ayarlar kullanılıyor.', error);
    lastPermissionWarnings.push('settings/app');
  }

  const state = emptyState(settings);
  const [users, meals, expenses, payments, debts, leaves, prefs, plans, laundry, laundryFaults, attendance, audits, activities, menus] = await Promise.all([
    safeReadByPlan('users', COLLECTIONS.users, plan.users),
    safeReadByPlan('mealChoices', COLLECTIONS.mealChoices, plan.mealChoices),
    safeReadByPlan('mealExpenses', COLLECTIONS.expenses, plan.expenses),
    safeReadByPlan('payments', COLLECTIONS.payments, plan.payments),
    safeReadByPlan('debts', COLLECTIONS.debts, plan.debts),
    safeReadByPlan('leaveRequests', COLLECTIONS.leaveRequests, plan.leaveRequests),
    safeReadByPlan('leavePreferences', COLLECTIONS.leavePreferences, plan.leavePreferences),
    safeReadByPlan('leavePlanResults', COLLECTIONS.leavePlanResults, plan.leavePlanResults),
    safeReadByPlan('laundryReservations', COLLECTIONS.laundry, plan.laundry),
    safeReadByPlan('laundryFaults', COLLECTIONS.laundryFaults, plan.laundryFaults),
    safeReadByPlan('attendance', COLLECTIONS.attendance, plan.attendance),
    safeReadByPlan('auditLogs', COLLECTIONS.auditLogs, plan.auditLogs),
    safeReadByPlan('weeklyActivities', COLLECTIONS.weeklyActivities, plan.weeklyActivities),
    safeReadByPlan('dailyMenus', COLLECTIONS.dailyMenus, plan.dailyMenus)
  ]);

  state.users = users.map(x => ({ ...x, uid: x.uid || x._docId })).map(({ _docId, ...x }) => x);
  if (!state.users.some(u => u.uid === accessProfile?.uid) && accessProfile) state.users.push({ ...accessProfile });

  meals.forEach(({ _docId, userId, date, breakfast = '', dinner = '' }) => {
    state.mealSelections[userId] ||= {};
    state.mealSelections[userId][date] = { breakfast, dinner };
  });
  const strip = arr => arr.map(({ _docId, ...x }) => x);
  state.expenses = strip(expenses);
  state.payments = strip(payments);
  state.debts = strip(debts);
  state.leaveRequests = strip(leaves);
  state.leavePreferences = strip(prefs);
  state.leavePlanResults = strip(plans);
  state.laundry = strip(laundry);
  state.laundryFaults = strip(laundryFaults);
  state.attendance = strip(attendance);
  state.auditLogs = strip(audits).sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 500);
  state.weeklyActivities = strip(activities);
  state.dailyMenus = Object.fromEntries(menus.map(({ _docId, date, ...menu }) => [date || _docId, menu]));
  state.permissionWarnings = [...lastPermissionWarnings];

  if (updateSnapshot) lastMaps = stateToMaps(state);
  return state;
}

function stopRealtime() {
  realtimeUnsubs.forEach(fn => fn());
  realtimeUnsubs = [];
  if (realtimeTimer) clearTimeout(realtimeTimer);
}

function realtimeRefs() {
  const plan = readPlan();
  const refs = [{ label: 'settings/app', ref: doc(firestore, 'settings', 'app') }];
  const add = (label, name, itemPlan) => {
    if (!itemPlan || itemPlan.mode === 'none') return;
    if (itemPlan.mode === 'ownDoc') {
      const uid = auth.currentUser?.uid;
      if (uid) refs.push({ label, ref: doc(firestore, name, uid) });
      return;
    }
    refs.push({ label, ref: collectionRef(name, itemPlan.constraints || []) });
  };
  add('users', COLLECTIONS.users, plan.users);
  add('mealChoices', COLLECTIONS.mealChoices, plan.mealChoices);
  add('mealExpenses', COLLECTIONS.expenses, plan.expenses);
  add('payments', COLLECTIONS.payments, plan.payments);
  add('debts', COLLECTIONS.debts, plan.debts);
  add('leaveRequests', COLLECTIONS.leaveRequests, plan.leaveRequests);
  add('leavePreferences', COLLECTIONS.leavePreferences, plan.leavePreferences);
  add('leavePlanResults', COLLECTIONS.leavePlanResults, plan.leavePlanResults);
  add('laundryReservations', COLLECTIONS.laundry, plan.laundry);
  add('laundryFaults', COLLECTIONS.laundryFaults, plan.laundryFaults);
  add('attendance', COLLECTIONS.attendance, plan.attendance);
  add('auditLogs', COLLECTIONS.auditLogs, plan.auditLogs);
  add('weeklyActivities', COLLECTIONS.weeklyActivities, plan.weeklyActivities);
  add('dailyMenus', COLLECTIONS.dailyMenus, plan.dailyMenus);
  return refs;
}

function startRealtime(callback) {
  stopRealtime();
  let restarting = false;

  const reload = async () => {
    try {
      const state = await loadState(true);
      callback(state);
    } catch (error) {
      console.error('Realtime refresh error', error);
    }
  };

  const restartForPermissions = async () => {
    if (restarting) return;
    restarting = true;
    try {
      const before = lastAccessSignature;
      await refreshAccessProfile();
      // Eski listener'lar önceki rolün sorgularını taşımış olabilir. Profil
      // değişmiş olsun veya olmasın permission-denied sonrası planı yeniden kur.
      stopRealtime();
      await reload();
      startRealtime(callback);
      if (before !== lastAccessSignature) console.info('[PBYS] Yetki değişikliği algılandı; Firestore dinleyicileri yenilendi.');
    } catch (error) {
      console.error('Yetki planı yenilenemedi', error);
    } finally {
      restarting = false;
    }
  };

  const schedule = snap => {
    if (snap?.metadata?.hasPendingWrites) return;
    clearTimeout(realtimeTimer);
    realtimeTimer = setTimeout(reload, 350);
  };

  // Kendi kullanıcı belgemizi ayrıca dinliyoruz. Admin rol/yetkiyi değiştirdiği
  // anda yeni profil okunur ve listener planı otomatik yeniden kurulur.
  const uid = auth.currentUser?.uid;
  if (uid) {
    const ownRef = doc(firestore, COLLECTIONS.users, uid);
    realtimeUnsubs.push(onSnapshot(ownRef, async snap => {
      if (!snap.exists()) return;
      const nextProfile = { ...snap.data(), uid: snap.id };
      const changed = setAccessProfile(nextProfile);
      if (changed) {
        stopRealtime();
        await reload();
        startRealtime(callback);
      }
    }, error => {
      console.error('Listener access-profile', error);
    }));
  }

  realtimeRefs().forEach(({ label, ref }) => {
    // users ownDoc zaten access-profile ile dinleniyor; çift listener gereksiz.
    if (label === 'users' && ref?.path === `${COLLECTIONS.users}/${uid}`) return;
    realtimeUnsubs.push(onSnapshot(ref, schedule, error => {
      console.error(`Listener ${label}`, error);
      if (isPermissionDenied(error)) restartForPermissions();
    }));
  });
  return stopRealtime;
}

window.FirebaseBridge = {
  ready: true,
  projectId: firebaseConfig.projectId,
  phoneToEmail,
  errorMessage: firebaseErrorMessage,
  ensureSettings,
  hasAnyUsers,
  hasAnyAdmin,
  getUserProfile,
  setAccessProfile,
  refreshAccessProfile,
  bootstrapAdmin,
  registerPending,
  adminCreateUser,
  signIn,
  signOut: signOutUser,
  waitForAuthState,
  currentAuthUser: () => auth.currentUser,
  changePassword,
  loadState,
  saveState,
  startRealtime,
  stopRealtime,
  permissionWarnings: () => [...lastPermissionWarnings]
};

window.dispatchEvent(new CustomEvent('firebase-ready'));
