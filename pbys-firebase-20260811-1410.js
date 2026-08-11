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
  auditLogs: 'auditLogs'
};

const ROLE_PERMISSIONS = {
  staff: [],
  cook: ['kitchen.view'],
  tabldot: ['meal.manage','finance.manage','reports.view'],
  administrative: ['personnel.view','attendance.view','attendance.manage','leave.view','leave.manage','meal.manage','finance.manage','reports.view'],
  commander: ['personnel.view','attendance.view','leave.view','leave.approve','leave.plan','reports.view'],
  admin: ['*']
};

let lastMaps = null;
let activeProfile = null;
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

function rolesOf(profile) {
  if (!profile) return [];
  return Array.isArray(profile.roles) && profile.roles.length ? profile.roles : [profile.role || 'staff'];
}

function profileHasPermission(profile, permission) {
  if (!profile) return false;
  const roles = rolesOf(profile);
  if (roles.includes('admin')) return true;
  const permissions = new Set(profile.extraPermissions || []);
  roles.forEach(role => (ROLE_PERMISSIONS[role] || []).forEach(p => permissions.add(p)));
  return permissions.has(permission);
}

function profileIsAdmin(profile) {
  return rolesOf(profile).includes('admin');
}

function firebaseErrorMessage(error) {
  const code = error?.code || '';
  const map = {
    'auth/email-already-in-use': 'Bu telefon numarasıyla daha önce kayıt oluşturulmuş.',
    'auth/invalid-credential': 'Telefon numarası veya şifre hatalı.',
    'auth/invalid-login-credentials': 'Telefon numarası veya şifre hatalı.',
    'auth/weak-password': 'Şifre belirlenen güvenlik politikasını karşılamıyor.',
    'auth/too-many-requests': 'Çok fazla deneme yapıldı. Bir süre sonra tekrar deneyin.',
    'auth/network-request-failed': 'Firebase bağlantısı kurulamadı. İnternet bağlantınızı kontrol edin.',
    'auth/operation-not-allowed': 'Firebase Authentication içinde Email/Password giriş yöntemi etkin değil.',
    'permission-denied': 'Bu işlem için yetkiniz bulunmuyor.',
    'firestore/permission-denied': 'Bu veri için Firestore erişim yetkiniz bulunmuyor.'
  };
  return map[code] || error?.message || 'Firebase işlemi tamamlanamadı.';
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

async function registerPending({ name, phone, title, password }) {
  const cred = await createUserWithEmailAndPassword(auth, phoneToEmail(phone), password);
  try {
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
  } finally {
    await signOut(auth);
  }
}

async function adminCreateUser(profile, password) {
  if (!activeProfile || !profileIsAdmin(activeProfile)) throw new Error('Bu işlem yalnızca admin tarafından yapılabilir.');
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
  activeProfile = null;
  lastMaps = null;
  stopRealtime();
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

async function collectionData(name, constraints = []) {
  const base = collection(firestore, name);
  const ref = constraints.length ? query(base, ...constraints) : base;
  const snap = await getDocs(ref);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}

async function singleDocData(name, id) {
  const snap = await getDoc(doc(firestore, name, id));
  return snap.exists() ? [{ ...snap.data(), _docId: snap.id }] : [];
}

function uniqueDocs(items) {
  const map = new Map();
  items.flat().forEach(item => map.set(String(item._docId || item.id), item));
  return [...map.values()];
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
    settings: { ...DEFAULT_SETTINGS, ...settings }
  };
}

function needsAllUsers(profile) {
  return ['personnel.view','attendance.view','attendance.manage','leave.view','leave.manage','leave.approve','leave.plan','kitchen.view','meal.manage','finance.manage']
    .some(permission => profileHasPermission(profile, permission));
}

function canReadAllMeals(profile) {
  return ['kitchen.view','meal.manage','finance.manage'].some(permission => profileHasPermission(profile, permission));
}

function canReadAllLeaves(profile) {
  return ['leave.view','leave.manage','leave.approve','leave.plan','attendance.view','attendance.manage']
    .some(permission => profileHasPermission(profile, permission));
}

function needsOperationalAnnualLeaves(profile) {
  return ['kitchen.view','meal.manage','finance.manage'].some(permission => profileHasPermission(profile, permission));
}

function canReadAllPreferences(profile) {
  return ['leave.view','leave.plan'].some(permission => profileHasPermission(profile, permission));
}

function canReadAllAttendance(profile) {
  return ['attendance.view','attendance.manage'].some(permission => profileHasPermission(profile, permission));
}

async function ensureSettingsForAdmin(profile) {
  const ref = doc(firestore, 'settings', 'app');
  const snap = await getDoc(ref);
  if (!snap.exists() && profileIsAdmin(profile)) {
    await setDoc(ref, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  return snap.exists() ? snap.data() : DEFAULT_SETTINGS;
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
  if (!activeProfile) throw new Error('Aktif kullanıcı profili bulunamadı.');
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
  const state = await loadState(activeProfile, false);
  return stateToMaps(state);
}

async function loadState(profile, updateSnapshot = true) {
  if (!profile?.uid) throw new Error('Kullanıcı profili bulunamadı.');
  activeProfile = profile;
  const numericUserId = Number(profile.id);
  const settings = await ensureSettingsForAdmin(profile);
  const state = emptyState(settings);

  const usersPromise = needsAllUsers(profile)
    ? collectionData(COLLECTIONS.users)
    : singleDocData(COLLECTIONS.users, profile.uid);

  const mealsPromise = canReadAllMeals(profile)
    ? collectionData(COLLECTIONS.mealChoices)
    : collectionData(COLLECTIONS.mealChoices, [where('userId', '==', numericUserId)]);

  const expensesPromise = profileHasPermission(profile, 'finance.manage')
    ? collectionData(COLLECTIONS.expenses)
    : Promise.resolve([]);

  const paymentsPromise = profileHasPermission(profile, 'finance.manage')
    ? collectionData(COLLECTIONS.payments)
    : collectionData(COLLECTIONS.payments, [where('userId', '==', numericUserId)]);

  const debtsPromise = profileHasPermission(profile, 'finance.manage')
    ? collectionData(COLLECTIONS.debts)
    : collectionData(COLLECTIONS.debts, [where('userId', '==', numericUserId)]);

  let leavesPromise;
  if (canReadAllLeaves(profile)) {
    leavesPromise = collectionData(COLLECTIONS.leaveRequests);
  } else {
    const ownLeaves = collectionData(COLLECTIONS.leaveRequests, [where('userId', '==', numericUserId)]);
    if (needsOperationalAnnualLeaves(profile)) {
      const annualLeaves = collectionData(COLLECTIONS.leaveRequests, [where('type', '==', 'Yıllık İzin'), where('status', '==', 'approved')]);
      leavesPromise = Promise.all([ownLeaves, annualLeaves]).then(uniqueDocs);
    } else {
      leavesPromise = ownLeaves;
    }
  }

  const prefsPromise = canReadAllPreferences(profile)
    ? collectionData(COLLECTIONS.leavePreferences)
    : collectionData(COLLECTIONS.leavePreferences, [where('userId', '==', numericUserId)]);

  const plansPromise = profileHasPermission(profile, 'leave.plan') || profileHasPermission(profile, 'leave.view')
    ? collectionData(COLLECTIONS.leavePlanResults)
    : collectionData(COLLECTIONS.leavePlanResults, [where('userId', '==', numericUserId)]);

  const attendancePromise = canReadAllAttendance(profile)
    ? collectionData(COLLECTIONS.attendance)
    : collectionData(COLLECTIONS.attendance, [where('userId', '==', numericUserId)]);

  const auditPromise = profileIsAdmin(profile)
    ? collectionData(COLLECTIONS.auditLogs)
    : Promise.resolve([]);

  const [users, meals, expenses, payments, debts, leaves, prefs, plans, laundry, laundryFaults, attendance, audits] = await Promise.all([
    usersPromise,
    mealsPromise,
    expensesPromise,
    paymentsPromise,
    debtsPromise,
    leavesPromise,
    prefsPromise,
    plansPromise,
    collectionData(COLLECTIONS.laundry),
    collectionData(COLLECTIONS.laundryFaults),
    attendancePromise,
    auditPromise
  ]);

  state.users = users.map(x => ({ ...x, uid: x.uid || x._docId })).map(({ _docId, ...x }) => x);
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

  if (updateSnapshot) lastMaps = stateToMaps(state);
  return state;
}

function stopRealtime() {
  realtimeUnsubs.forEach(fn => fn());
  realtimeUnsubs = [];
  if (realtimeTimer) clearTimeout(realtimeTimer);
}

function buildRealtimeTargets(profile) {
  const numericUserId = Number(profile.id);
  const targets = [doc(firestore, 'settings', 'app')];

  targets.push(needsAllUsers(profile) ? collection(firestore, COLLECTIONS.users) : doc(firestore, COLLECTIONS.users, profile.uid));
  targets.push(canReadAllMeals(profile) ? collection(firestore, COLLECTIONS.mealChoices) : query(collection(firestore, COLLECTIONS.mealChoices), where('userId', '==', numericUserId)));

  if (profileHasPermission(profile, 'finance.manage')) {
    targets.push(collection(firestore, COLLECTIONS.expenses));
    targets.push(collection(firestore, COLLECTIONS.payments));
    targets.push(collection(firestore, COLLECTIONS.debts));
  } else {
    targets.push(query(collection(firestore, COLLECTIONS.payments), where('userId', '==', numericUserId)));
    targets.push(query(collection(firestore, COLLECTIONS.debts), where('userId', '==', numericUserId)));
  }

  if (canReadAllLeaves(profile)) {
    targets.push(collection(firestore, COLLECTIONS.leaveRequests));
  } else {
    targets.push(query(collection(firestore, COLLECTIONS.leaveRequests), where('userId', '==', numericUserId)));
    if (needsOperationalAnnualLeaves(profile)) {
      targets.push(query(collection(firestore, COLLECTIONS.leaveRequests), where('type', '==', 'Yıllık İzin'), where('status', '==', 'approved')));
    }
  }

  targets.push(canReadAllPreferences(profile)
    ? collection(firestore, COLLECTIONS.leavePreferences)
    : query(collection(firestore, COLLECTIONS.leavePreferences), where('userId', '==', numericUserId)));

  targets.push((profileHasPermission(profile, 'leave.plan') || profileHasPermission(profile, 'leave.view'))
    ? collection(firestore, COLLECTIONS.leavePlanResults)
    : query(collection(firestore, COLLECTIONS.leavePlanResults), where('userId', '==', numericUserId)));

  targets.push(collection(firestore, COLLECTIONS.laundry));
  targets.push(collection(firestore, COLLECTIONS.laundryFaults));
  targets.push(canReadAllAttendance(profile)
    ? collection(firestore, COLLECTIONS.attendance)
    : query(collection(firestore, COLLECTIONS.attendance), where('userId', '==', numericUserId)));

  if (profileIsAdmin(profile)) targets.push(collection(firestore, COLLECTIONS.auditLogs));
  return targets;
}

function startRealtime(profile, callback) {
  stopRealtime();
  activeProfile = profile;
  const schedule = snap => {
    if (snap?.metadata?.hasPendingWrites) return;
    clearTimeout(realtimeTimer);
    realtimeTimer = setTimeout(async () => {
      try {
        const state = await loadState(activeProfile, true);
        callback(state);
      } catch (error) {
        console.error('Realtime refresh error', error);
      }
    }, 350);
  };
  buildRealtimeTargets(profile).forEach(ref => realtimeUnsubs.push(onSnapshot(ref, schedule, error => console.error('Realtime listener', error))));
  return stopRealtime;
}

window.FirebaseBridge = {
  ready: true,
  projectId: firebaseConfig.projectId,
  phoneToEmail,
  errorMessage: firebaseErrorMessage,
  getUserProfile,
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

window.dispatchEvent(new Event('firebase-ready'));
