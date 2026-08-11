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
  limit,
  where,
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
let activeProfile = null;
let activeAccessSignature = '';

const ROLE_PERMISSIONS = {
  staff: [],
  cook: ['kitchen.view'],
  tabldot: ['meal.manage','finance.manage','reports.view'],
  administrative: ['personnel.view','attendance.view','attendance.manage','leave.view','leave.manage','meal.manage','finance.manage','reports.view'],
  commander: ['personnel.view','attendance.view','leave.view','leave.approve','leave.plan','reports.view'],
  admin: ['*']
};

function profileRoles(profile) {
  if (!profile) return [];
  return Array.isArray(profile.roles) && profile.roles.length ? profile.roles : [profile.role || 'staff'];
}
function profileHasRole(profile, role) { return profileRoles(profile).includes(role); }
function profileHasPermission(profile, permission) {
  if (!profile) return false;
  if (profileHasRole(profile, 'admin')) return true;
  const permissions = new Set(profile.extraPermissions || []);
  profileRoles(profile).forEach(role => (ROLE_PERMISSIONS[role] || []).forEach(p => permissions.add(p)));
  return permissions.has(permission);
}
function accessSignature(profile) {
  return JSON.stringify({ roles: profileRoles(profile).slice().sort(), extra: (profile?.extraPermissions || []).slice().sort(), id: profile?.id, approved: profile?.approved, rejected: profile?.rejected });
}
function requireAuth() {
  if (!auth.currentUser) throw new Error('Oturum bulunamadı. Lütfen yeniden giriş yapın.');
}
function requireApprovedProfile(profile) {
  requireAuth();
  if (!profile || profile.uid !== auth.currentUser.uid) throw new Error('Kullanıcı profili doğrulanamadı.');
  if (!profile.approved || profile.rejected) throw new Error(profile.rejected ? 'Üyelik başvurunuz reddedildi.' : 'Üyeliğiniz henüz yönetici tarafından onaylanmadı.');
}
function canReadAllUsers(profile) {
  return ['personnel.view','leave.view','leave.plan','attendance.view','finance.manage','meal.manage','kitchen.view','laundry.manage'].some(p => profileHasPermission(profile, p));
}
function canReadAllMeals(profile) { return profileHasPermission(profile, 'meal.manage') || profileHasPermission(profile, 'kitchen.view'); }
function canReadFinance(profile) { return profileHasPermission(profile, 'finance.manage'); }
function canReadAllLeaves(profile) { return profileHasPermission(profile, 'leave.view') || profileHasPermission(profile, 'leave.manage') || profileHasPermission(profile, 'leave.approve') || profileHasPermission(profile, 'leave.plan'); }
function canReadAnnualLeaveForOperations(profile) { return profileHasPermission(profile, 'kitchen.view') || profileHasPermission(profile, 'finance.manage'); }
function canReadAllPreferences(profile) { return profileHasPermission(profile, 'leave.plan'); }
function canReadAllAttendance(profile) { return profileHasPermission(profile, 'attendance.view') || profileHasPermission(profile, 'attendance.manage'); }
function canReadAudits(profile) { return profileHasRole(profile, 'admin'); }


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
    'auth/operation-not-allowed': 'Firebase Authentication içinde Email/Password giriş yöntemi henüz etkinleştirilmemiş.'
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
  requireAuth();
  const profile = await getUserProfile(auth.currentUser.uid);
  if (!profileHasRole(profile, 'admin')) throw new Error('Bu işlem yalnızca Admin tarafından yapılabilir.');
  const snap = await getDocs(query(collection(firestore, 'users'), limit(1)));
  return !snap.empty;
}

async function hasAnyAdmin() {
  requireAuth();
  const profile = await getUserProfile(auth.currentUser.uid);
  if (!profileHasRole(profile, 'admin')) throw new Error('Bu işlem yalnızca Admin tarafından yapılabilir.');
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

async function bootstrapAdmin() {
  throw new Error('Güvenli üretim sürümünde ilk Admin oluşturma ekranı devre dışıdır. Mevcut Admin hesabıyla giriş yapın.');
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

async function collectionData(name, source = null) {
  requireAuth();
  const snap = await getDocs(source || collection(firestore, name));
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}

function ownQuery(name, profile) {
  return query(collection(firestore, name), where('userId', '==', Number(profile.id)));
}
function approvedUsersQuery() {
  return query(collection(firestore, COLLECTIONS.users), where('approved', '==', true));
}
function approvedAnnualLeaveQuery() {
  return query(collection(firestore, COLLECTIONS.leaveRequests), where('status', '==', 'approved'), where('type', '==', 'Yıllık İzin'));
}

async function getSettingsForProfile(profile) {
  requireApprovedProfile(profile);
  const ref = doc(firestore, 'settings', 'app');
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  if (profileHasRole(profile, 'admin')) return await ensureSettings();
  return DEFAULT_SETTINGS;
}

function usersSource(profile) {
  if (profileHasPermission(profile, 'personnel.view') || profileHasPermission(profile, 'leave.view') || profileHasPermission(profile, 'leave.plan') || profileHasPermission(profile, 'attendance.view')) return collection(firestore, COLLECTIONS.users);
  if (canReadAllUsers(profile)) return approvedUsersQuery();
  return doc(firestore, COLLECTIONS.users, profile.uid);
}

function leaveSource(profile) {
  if (canReadAllLeaves(profile)) return collection(firestore, COLLECTIONS.leaveRequests);
  if (canReadAnnualLeaveForOperations(profile)) return approvedAnnualLeaveQuery();
  return ownQuery(COLLECTIONS.leaveRequests, profile);
}

async function dataFromSource(name, source) {
  if (source?.type === 'document') {
    const snap = await getDoc(source);
    return snap.exists() ? [{ ...snap.data(), _docId: snap.id }] : [];
  }
  return collectionData(name, source);
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
  if (!activeProfile) {
    requireAuth();
    activeProfile = await getUserProfile(auth.currentUser.uid);
  }
  const state = await loadState(activeProfile, false);
  return stateToMaps(state);
}

async function loadState(profile, updateSnapshot = true) {
  requireApprovedProfile(profile);
  activeProfile = profile;
  activeAccessSignature = accessSignature(profile);
  const settings = await getSettingsForProfile(profile);
  const state = emptyState(settings);

  const userSource = usersSource(profile);
  const mealSource = canReadAllMeals(profile) ? collection(firestore, COLLECTIONS.mealChoices) : ownQuery(COLLECTIONS.mealChoices, profile);
  const paymentSource = canReadFinance(profile) ? collection(firestore, COLLECTIONS.payments) : ownQuery(COLLECTIONS.payments, profile);
  const debtSource = canReadFinance(profile) ? collection(firestore, COLLECTIONS.debts) : ownQuery(COLLECTIONS.debts, profile);
  const leaveReqSource = leaveSource(profile);
  const prefSource = canReadAllPreferences(profile) ? collection(firestore, COLLECTIONS.leavePreferences) : ownQuery(COLLECTIONS.leavePreferences, profile);
  const planSource = canReadAllPreferences(profile) ? collection(firestore, COLLECTIONS.leavePlanResults) : ownQuery(COLLECTIONS.leavePlanResults, profile);
  const attendanceSource = canReadAllAttendance(profile) ? collection(firestore, COLLECTIONS.attendance) : ownQuery(COLLECTIONS.attendance, profile);

  const [users, meals, expenses, payments, debts, leaves, prefs, plans, laundry, laundryFaults, attendance, audits, activities, menus] = await Promise.all([
    dataFromSource(COLLECTIONS.users, userSource),
    dataFromSource(COLLECTIONS.mealChoices, mealSource),
    canReadFinance(profile) ? collectionData(COLLECTIONS.expenses) : Promise.resolve([]),
    dataFromSource(COLLECTIONS.payments, paymentSource),
    dataFromSource(COLLECTIONS.debts, debtSource),
    dataFromSource(COLLECTIONS.leaveRequests, leaveReqSource),
    dataFromSource(COLLECTIONS.leavePreferences, prefSource),
    dataFromSource(COLLECTIONS.leavePlanResults, planSource),
    collectionData(COLLECTIONS.laundry),
    collectionData(COLLECTIONS.laundryFaults),
    dataFromSource(COLLECTIONS.attendance, attendanceSource),
    canReadAudits(profile) ? collectionData(COLLECTIONS.auditLogs) : Promise.resolve([]),
    collectionData(COLLECTIONS.weeklyActivities),
    collectionData(COLLECTIONS.dailyMenus)
  ]);

  state.users = users.map(x => ({ ...x, uid: x.uid || x._docId })).map(({ _docId, ...x }) => x);
  if (!state.users.some(u => u.uid === profile.uid)) state.users.push({ ...profile });
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

  if (updateSnapshot) lastMaps = stateToMaps(state);
  return state;
}

function stopRealtime() {
  realtimeUnsubs.forEach(fn => fn());
  realtimeUnsubs = [];
  if (realtimeTimer) clearTimeout(realtimeTimer);
}

function realtimeSources(profile) {
  const sources = [
    doc(firestore, 'settings', 'app'),
    usersSource(profile),
    canReadAllMeals(profile) ? collection(firestore, COLLECTIONS.mealChoices) : ownQuery(COLLECTIONS.mealChoices, profile),
    canReadFinance(profile) ? collection(firestore, COLLECTIONS.payments) : ownQuery(COLLECTIONS.payments, profile),
    canReadFinance(profile) ? collection(firestore, COLLECTIONS.debts) : ownQuery(COLLECTIONS.debts, profile),
    leaveSource(profile),
    canReadAllPreferences(profile) ? collection(firestore, COLLECTIONS.leavePreferences) : ownQuery(COLLECTIONS.leavePreferences, profile),
    canReadAllPreferences(profile) ? collection(firestore, COLLECTIONS.leavePlanResults) : ownQuery(COLLECTIONS.leavePlanResults, profile),
    collection(firestore, COLLECTIONS.laundry),
    collection(firestore, COLLECTIONS.laundryFaults),
    canReadAllAttendance(profile) ? collection(firestore, COLLECTIONS.attendance) : ownQuery(COLLECTIONS.attendance, profile),
    collection(firestore, COLLECTIONS.weeklyActivities),
    collection(firestore, COLLECTIONS.dailyMenus)
  ];
  if (canReadFinance(profile)) sources.push(collection(firestore, COLLECTIONS.expenses));
  if (canReadAudits(profile)) sources.push(collection(firestore, COLLECTIONS.auditLogs));
  return sources;
}

function startRealtime(profile, callback) {
  requireApprovedProfile(profile);
  stopRealtime();
  activeProfile = profile;
  activeAccessSignature = accessSignature(profile);
  const schedule = snap => {
    if (snap?.metadata?.hasPendingWrites) return;
    clearTimeout(realtimeTimer);
    realtimeTimer = setTimeout(async () => {
      try {
        const freshProfile = await getUserProfile(auth.currentUser.uid);
        if (!freshProfile?.approved || freshProfile?.rejected) {
          await signOutUser();
          return;
        }
        const previousSignature = activeAccessSignature;
        const state = await loadState(freshProfile, true);
        callback(state);
        if (accessSignature(freshProfile) !== previousSignature) startRealtime(freshProfile, callback);
      } catch (error) {
        console.error('Realtime refresh error', error);
      }
    }, 350);
  };
  realtimeSources(profile).forEach(source => realtimeUnsubs.push(onSnapshot(source, schedule, error => console.error('PBYS listener', error))));
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
  loadState,
  saveState,
  startRealtime,
  stopRealtime
};

window.dispatchEvent(new CustomEvent('firebase-ready'));
