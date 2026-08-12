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
  leavePreferencesOpen: true,
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
    'permission-denied': 'Firestore erişim izni reddedildi. Sistem yöneticisi veri yetkilerini kontrol etmelidir.',
    'firestore/permission-denied': 'Firestore erişim izni reddedildi. Sistem yöneticisi veri yetkilerini kontrol etmelidir.'
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

async function waitForAuthState() {
  // browserLocalPersistence ile oturum yenilemede korunur. Firebase ilk auth
  // durumunu çözümlene kadar bekleyerek kısa süreli null dönmesini engeller.
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
    return auth.currentUser;
  }
  return await new Promise(resolve => {
    let unsub = () => {};
    unsub = onAuthStateChanged(auth, user => { unsub(); resolve(user); });
  });
}

async function changePassword(newPassword) {
  if (!auth.currentUser) throw new Error('Oturum bulunamadı.');
  await updatePassword(auth.currentUser, newPassword);
}
async function getIdToken(forceRefresh = false) {
  if (!auth.currentUser) throw new Error('Oturum bulunamadı.');
  return await auth.currentUser.getIdToken(Boolean(forceRefresh));
}

async function collectionData(name) {
  const snap = await getDocs(collection(firestore, name));
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}

function isPermissionDenied(error) {
  return error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied';
}

async function collectionDataSafe(name) {
  try {
    return await collectionData(name);
  } catch (error) {
    if (isPermissionDenied(error)) {
      // Aşçı / tabldot gibi operasyonel roller kullanıcı koleksiyonunun tamamını
      // değil, yalnızca onaylı aktif personeli okuyabilir. Firestore Rules bu
      // sorguya izin verdiği için kendi profiline düşme sorunu yaşanmaz.
      if (name === COLLECTIONS.users) {
        try {
          const snap = await getDocs(query(collection(firestore, COLLECTIONS.users), where('approved', '==', true)));
          return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
        } catch (fallbackError) {
          if (!isPermissionDenied(fallbackError)) throw fallbackError;
        }
      }
      console.warn(`Firestore koleksiyonu bu kullanıcı için kapalı: ${name}. Aşçı ekranında izin/yoklama görünmüyorsa V9.4.2 firestore.rules dosyasını Firebase Console'da yayımlayın.`);
      return [];
    }
    throw error;
  }
}

async function settingsDataSafe() {
  try {
    const snap = await getDoc(doc(firestore, 'settings', 'app'));
    if (snap.exists()) return snap.data();
    try {
      return await ensureSettings();
    } catch (error) {
      if (isPermissionDenied(error)) return DEFAULT_SETTINGS;
      throw error;
    }
  } catch (error) {
    if (isPermissionDenied(error)) return DEFAULT_SETTINGS;
    throw error;
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
    laundryRuns: [],
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
  maps.laundryRuns = new Map((state.laundryRuns || []).map(x => [`run_${x.id}`, clean({ ...x, _pbysType: 'run', _docId: undefined })]));
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
  const collectionMap = { ...COLLECTIONS, laundryRuns: COLLECTIONS.laundry, settings: 'settings' };

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
  const state = emptyState(await settingsDataSafe());

  // Bir personelin erişemediği yönetim koleksiyonu tüm giriş akışını bozmamalı.
  // Her koleksiyon bağımsız okunur; Firestore Rules izin vermiyorsa yalnızca o veri boş bırakılır.
  const [users, meals, expenses, payments, debts, leaves, prefs, plans, laundryAll, laundryFaults, attendance, audits, activities, menus] = await Promise.all([
    collectionDataSafe(COLLECTIONS.users),
    collectionDataSafe(COLLECTIONS.mealChoices),
    collectionDataSafe(COLLECTIONS.expenses),
    collectionDataSafe(COLLECTIONS.payments),
    collectionDataSafe(COLLECTIONS.debts),
    collectionDataSafe(COLLECTIONS.leaveRequests),
    collectionDataSafe(COLLECTIONS.leavePreferences),
    collectionDataSafe(COLLECTIONS.leavePlanResults),
    collectionDataSafe(COLLECTIONS.laundry),
    collectionDataSafe(COLLECTIONS.laundryFaults),
    collectionDataSafe(COLLECTIONS.attendance),
    collectionDataSafe(COLLECTIONS.auditLogs),
    collectionDataSafe(COLLECTIONS.weeklyActivities),
    collectionDataSafe(COLLECTIONS.dailyMenus)
  ]);

  state.users = users.map(x => ({ ...x, uid: x.uid || x._docId })).map(({ _docId, ...x }) => x);
  // Kullanıcı listesini topluca okuma yetkisi olmasa bile oturum sahibinin kendi profili sisteme eklenir.
  if (auth.currentUser && !state.users.some(u => u.uid === auth.currentUser.uid)) {
    try {
      const ownProfile = await getUserProfile(auth.currentUser.uid);
      if (ownProfile) state.users.push(ownProfile);
    } catch (error) {
      if (!isPermissionDenied(error)) throw error;
    }
  }
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
  state.laundry = strip(laundryAll.filter(x => x._pbysType !== 'run'));
  state.laundryRuns = strip(laundryAll.filter(x => x._pbysType === 'run')).map(({ _pbysType, ...x }) => x);
  state.laundryFaults = strip(laundryFaults);
  state.attendance = strip(attendance);
  state.auditLogs = strip(audits).sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 500);
  state.weeklyActivities = strip(activities);
  state.dailyMenus = Object.fromEntries(menus.map(({ _docId, date, ...menu }) => [date || _docId, menu]));

  if (updateSnapshot) lastMaps = stateToMaps(state);
  return state;
}

function stopRealtime() {
  realtimeUnsubs.forEach(fn => fn());
  realtimeUnsubs = [];
  if (realtimeTimer) clearTimeout(realtimeTimer);
}

function startRealtime(callback) {
  stopRealtime();
  const names = [...Object.values(COLLECTIONS), 'settings'];
  const schedule = snap => {
    if (snap?.metadata?.hasPendingWrites) return;
    clearTimeout(realtimeTimer);
    realtimeTimer = setTimeout(async () => {
      try {
        const state = await loadState(true);
        callback(state);
      } catch (error) {
        console.error('Realtime refresh error', error);
      }
    }, 350);
  };
  names.forEach(name => {
    const attachApprovedUsersFallback = () => {
      const approvedUsersQuery = query(collection(firestore, COLLECTIONS.users), where('approved', '==', true));
      realtimeUnsubs.push(onSnapshot(approvedUsersQuery, schedule, fallbackError => {
        if (isPermissionDenied(fallbackError)) {
          console.warn('Realtime onaylı personel erişimi de kapalı: users');
          return;
        }
        console.error('Listener users (approved fallback)', fallbackError);
      }));
    };

    realtimeUnsubs.push(onSnapshot(collection(firestore, name), schedule, error => {
      if (isPermissionDenied(error)) {
        // Aşçı rolü tüm aktif personeli özel yetki olmadan izleyebilsin.
        // users koleksiyonunun tam liste sorgusu reddedilirse yalnızca approved=true
        // personeller için güvenli sorguya otomatik geçilir.
        if (name === COLLECTIONS.users) attachApprovedUsersFallback();
        else console.warn(`Realtime erişimi bu kullanıcı için kapalı: ${name}`);
        return;
      }
      console.error(`Listener ${name}`, error);
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
  bootstrapAdmin,
  registerPending,
  adminCreateUser,
  signIn,
  signOut: signOutUser,
  waitForAuthState,
  currentAuthUser: () => auth.currentUser,
  changePassword,
  getIdToken,
  loadState,
  saveState,
  startRealtime,
  stopRealtime
};

window.dispatchEvent(new CustomEvent('firebase-ready'));
