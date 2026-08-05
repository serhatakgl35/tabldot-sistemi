const APP_KEY = 'personel_yasam_v1';

const seed = {
  users: [
    { id: 1, name: 'Serhat Admin', phone: '05000000001', password: '123456', role: 'admin', title: 'Sistem Yöneticisi', approved: true, annualAllowance: 30, usedLeave: 8 },
    { id: 2, name: 'Mehmet Müdür', phone: '05000000002', password: '123456', role: 'manager', title: 'Müdür', approved: true, annualAllowance: 30, usedLeave: 12 },
    { id: 3, name: 'Ahmet Yılmaz', phone: '05000000003', password: '123456', role: 'staff', title: 'Personel', approved: true, annualAllowance: 30, usedLeave: 6 },
    { id: 4, name: 'Mustafa Kaya', phone: '05000000004', password: '123456', role: 'staff', title: 'Personel', approved: true, annualAllowance: 30, usedLeave: 14 },
    { id: 5, name: 'Ali Demir', phone: '05000000005', password: '123456', role: 'staff', title: 'Personel', approved: false, annualAllowance: 30, usedLeave: 0 }
  ],
  mealSelections: {},
  expenses: [
    { id: 1, date: '2026-08-03', name: 'Haftalık market alışverişi', amount: 7250 },
    { id: 2, date: '2026-08-04', name: 'Ekmek gideri', amount: 1350 },
    { id: 3, date: '2026-08-05', name: 'Et ve tavuk', amount: 4900 }
  ],
  payments: [
    { id: 1, userId: 3, period: 'Ağustos 2026', amount: 1450, status: 'pending', date: '2026-08-05' },
    { id: 2, userId: 4, period: 'Ağustos 2026', amount: 1200, status: 'approved', date: '2026-08-04' }
  ],
  debts: [
    { userId: 3, period: 'Ağustos 2026', amount: 1450, paid: 0 },
    { userId: 4, period: 'Ağustos 2026', amount: 1200, paid: 1200 },
    { userId: 5, period: 'Ağustos 2026', amount: 1320, paid: 0 }
  ],
  leaveRequests: [
    { id: 1, userId: 3, type: 'Yıllık İzin', start: '2026-08-17', end: '2026-08-23', days: 7, city: 'İzmir', note: 'Aile ziyareti', status: 'pending' },
    { id: 2, userId: 4, type: 'Yıllık İzin', start: '2026-08-10', end: '2026-08-14', days: 5, city: 'Ankara', note: '', status: 'approved' },
    { id: 3, userId: 2, type: 'Sağlık İzni', start: '2026-08-26', end: '2026-08-27', days: 2, city: 'Bingöl', note: '', status: 'report' }
  ],
  laundry: [
    { id: 1, userId: 3, date: '2026-08-06', time: '09:00', machine: 'Makine 1' },
    { id: 2, userId: 4, date: '2026-08-06', time: '10:30', machine: 'Makine 2' },
    { id: 3, userId: 2, date: '2026-08-06', time: '13:30', machine: 'Kurutma' }
  ],
  settings: {
    iban: 'TR00 0000 0000 0000 0000 0000 00',
    accountName: 'Ortak Tabldot Hesabı',
    mealDeadline: 'Cuma 20:00',
    weeklyLaundryLimit: 2
  }
};

let db = loadDB();
let currentUser = null;
let currentPage = 'dashboard';

const roleNames = { admin: 'Admin', manager: 'Müdür', staff: 'Personel' };
const navByRole = {
  admin: [
    ['dashboard', '⌂', 'Yönetim Özeti'],
    ['members', '👥', 'Üyelik Onayları'],
    ['meals', '🍽', 'Yemek Yönetimi'],
    ['finance', '₺', 'Ödeme ve Bilanço'],
    ['leaves', '📅', 'İzin Yönetimi'],
    ['laundry', '🧺', 'Çamaşır Randevuları'],
    ['reports', '📊', 'Raporlar'],
    ['settings', '⚙', 'Sistem Ayarları']
  ],
  manager: [
    ['dashboard', '⌂', 'Yönetim Özeti'],
    ['meals', '🍽', 'Yemek Durumu'],
    ['finance', '₺', 'Bilanço'],
    ['leaves', '📅', 'İzin Takvimi'],
    ['laundry', '🧺', 'Çamaşır Randevuları'],
    ['reports', '📊', 'Raporlar']
  ],
  staff: [
    ['dashboard', '⌂', 'Ana Sayfa'],
    ['meals', '🍽', 'Yemek Tercihim'],
    ['finance', '₺', 'Borç ve Ödemelerim'],
    ['leaves', '📅', 'İzinlerim'],
    ['laundry', '🧺', 'Çamaşır Randevusu'],
    ['profile', '👤', 'Profilim']
  ]
};

function loadDB() {
  try {
    const stored = JSON.parse(localStorage.getItem(APP_KEY));
    if (stored) return stored;
  } catch (_) {}
  localStorage.setItem(APP_KEY, JSON.stringify(seed));
  return structuredClone(seed);
}
function saveDB() { localStorage.setItem(APP_KEY, JSON.stringify(db)); }
function normalizePhone(value) { return value.replace(/\D/g, ''); }
function money(value) { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value); }
function formatDate(value) { return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value + 'T12:00:00')); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[s])); }
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message; el.classList.add('show');
  clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function showModal(title, body) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalBackdrop').classList.remove('hidden');
}
function closeModal() { document.getElementById('modalBackdrop').classList.add('hidden'); }
function getUser(id) { return db.users.find(u => u.id === Number(id)); }
function daysBetween(start, end) { return Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1); }
function initials(name) { return name.split(' ').map(x => x[0]).slice(0,2).join('').toUpperCase(); }

function statusBadge(status) {
  const map = {
    approved: ['success', 'Onaylandı'], pending: ['warning', 'Onay Bekliyor'], rejected: ['danger', 'Reddedildi'],
    report: ['danger', 'Sağlık İzni'], paid: ['success', 'Ödendi'], unpaid: ['danger', 'Ödenmedi'], neutral: ['neutral', 'Bekliyor']
  };
  const [cls, label] = map[status] || ['neutral', status];
  return `<span class="status ${cls}">${label}</span>`;
}

function init() {
  document.querySelectorAll('.auth-tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    const login = btn.dataset.authTab === 'login';
    document.getElementById('loginForm').classList.toggle('hidden', !login);
    document.getElementById('registerForm').classList.toggle('hidden', login);
  }));

  document.getElementById('loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const phone = normalizePhone(document.getElementById('loginPhone').value);
    const password = document.getElementById('loginPassword').value;
    const user = db.users.find(u => u.phone === phone && u.password === password);
    if (!user) return toast('Telefon numarası veya şifre hatalı.');
    if (!user.approved) return toast('Üyeliğiniz henüz admin tarafından onaylanmadı.');
    login(user);
  });

  document.getElementById('registerForm').addEventListener('submit', e => {
    e.preventDefault();
    const phone = normalizePhone(document.getElementById('registerPhone').value);
    if (db.users.some(u => u.phone === phone)) return toast('Bu telefon numarası zaten kayıtlı.');
    db.users.push({
      id: Date.now(), name: document.getElementById('registerName').value.trim(), phone,
      password: document.getElementById('registerPassword').value, role: 'staff',
      title: document.getElementById('registerTitle').value.trim(), approved: false, annualAllowance: 30, usedLeave: 0
    });
    saveDB(); e.target.reset(); toast('Başvurunuz alındı. Admin onayından sonra giriş yapabilirsiniz.');
    document.querySelector('[data-auth-tab="login"]').click();
  });

  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('menuBtn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });
  document.getElementById('notificationBtn').addEventListener('click', () => toast('3 yeni işlem bildirimi bulunuyor.'));
  document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
}

function login(user) {
  currentUser = user;
  document.getElementById('authView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');
  document.getElementById('sidebarName').textContent = user.name;
  document.getElementById('sidebarRole').textContent = roleNames[user.role];
  document.getElementById('sidebarAvatar').textContent = initials(user.name);
  document.getElementById('topAvatar').textContent = initials(user.name);
  currentPage = 'dashboard';
  renderNav(); renderPage();
}
function logout() {
  currentUser = null;
  document.getElementById('appView').classList.add('hidden');
  document.getElementById('authView').classList.remove('hidden');
  document.getElementById('loginForm').reset();
}
function renderNav() {
  const nav = document.getElementById('mainNav');
  nav.innerHTML = navByRole[currentUser.role].map(([id, icon, label]) => `<button class="nav-item ${id === currentPage ? 'active' : ''}" data-page="${id}"><span class="nav-icon">${icon}</span>${label}</button>`).join('');
  nav.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => {
    currentPage = btn.dataset.page; document.getElementById('sidebar').classList.remove('open'); renderNav(); renderPage();
  }));
}
function renderPage() {
  const titles = Object.fromEntries(navByRole[currentUser.role].map(x => [x[0], x[2]]));
  document.getElementById('pageTitle').textContent = titles[currentPage] || 'Panel';
  const pages = { dashboard: renderDashboard, members: renderMembers, meals: renderMeals, finance: renderFinance, leaves: renderLeaves, laundry: renderLaundry, reports: renderReports, settings: renderSettings, profile: renderProfile };
  (pages[currentPage] || renderDashboard)();
}

function renderDashboard() {
  const pendingMembers = db.users.filter(u => !u.approved).length;
  const pendingLeaves = db.leaveRequests.filter(x => x.status === 'pending').length;
  const unpaid = db.debts.reduce((s, x) => s + Math.max(0, x.amount - x.paid), 0);
  const approvedUsers = db.users.filter(u => u.approved).length;
  const isStaff = currentUser.role === 'staff';
  const ownDebt = db.debts.filter(x => x.userId === currentUser.id).reduce((s,x) => s + Math.max(0,x.amount-x.paid), 0);
  const ownLeave = currentUser.annualAllowance - currentUser.usedLeave;

  document.getElementById('pageContent').innerHTML = isStaff ? `
    <div class="grid grid-4">
      ${metric('🍽','Bu hafta yemek','5 gün','Tercihlerinizi cuma 20:00’ye kadar güncelleyin')}
      ${metric('₺','Güncel borcunuz',money(ownDebt),'IBAN bilgisi ödeme ekranında')}
      ${metric('📅','Kalan yıllık izin',ownLeave + ' gün','Kullanılan: ' + currentUser.usedLeave + ' gün')}
      ${metric('🧺','Haftalık kullanım','1 / 2','Bir randevu hakkınız kaldı')}
    </div>
    <div class="grid grid-2 section-gap">
      <div class="card"><div class="card-header"><div><h3>Hızlı işlemler</h3><p>En sık kullanılan işlemler</p></div></div><div class="card-body quick-list">
        ${quick('🍽','Gelecek haftanın yemek tercihini yap','Pazartesi–Pazar',"goPage('meals')")}
        ${quick('📅','Yıllık izin talebi oluştur','Kalan hakkınız: '+ownLeave+' gün',"goPage('leaves')")}
        ${quick('🧺','Çamaşır makinesi randevusu al','Bugün uygun saatler var',"goPage('laundry')")}
      </div></div>
      <div class="card"><div class="card-header"><div><h3>Duyurular</h3><p>Son yayınlanan bilgilendirmeler</p></div></div><div class="card-body quick-list">
        ${notice('Yemek tercihi son zamanı','Cuma günü saat 20:00')}
        ${notice('Ağustos dönemi ödemeleri','Son ödeme tarihi 10 Ağustos')}
        ${notice('Çamaşır makinesi bakımı','Makine 2, pazar 14:00–16:00 kapalıdır')}
      </div></div>
    </div>` : `
    <div class="grid grid-5">
      ${metric('👥','Aktif personel',approvedUsers,'Toplam kayıt: '+db.users.length)}
      ${metric('🕓','Onay bekleyen üyelik',pendingMembers,'İşlem gerekli')}
      ${metric('🍽','Haftalık yemek katılımı','29 kişi','6 kişi tercih yapmadı')}
      ${metric('₺','Bekleyen ödeme',money(unpaid),'3 personelin ödemesi eksik')}
      ${metric('📅','Onay bekleyen izin',pendingLeaves,'Müdür değerlendirmesi')}
    </div>
    <div class="grid grid-2 section-gap">
      <div class="card"><div class="card-header"><div><h3>İşlem bekleyenler</h3><p>Yönetici müdahalesi gereken kayıtlar</p></div></div><div class="card-body quick-list">
        ${quick('👤',pendingMembers+' üyelik başvurusu bekliyor','Telefon ve görev bilgilerini kontrol edin',"goPage('members')")}
        ${quick('📅',pendingLeaves+' izin talebi değerlendirilmedi','Takvim yoğunluğunu kontrol edin',"goPage('leaves')")}
        ${quick('₺','1 ödeme bildirimi onay bekliyor','Dekont ve tutar kontrolü',"goPage('finance')")}
      </div></div>
      <div class="card"><div class="card-header"><div><h3>Bugünün durumu</h3><p>6 Ağustos 2026</p></div></div><div class="card-body quick-list">
        ${notice('Yemek yiyecek personel','31 / 35 kişi')}
        ${notice('İzinli personel','2 kişi')}
        ${notice('Çamaşır randevusu','8 rezervasyon')}
        ${notice('Mevcut kasa','4.950 TL')}
      </div></div>
    </div>
    <div class="card section-gap"><div class="card-header"><div><h3>Son izin talepleri</h3><p>En güncel personel talepleri</p></div><button class="btn btn-secondary btn-sm" onclick="goPage('leaves')">Tümünü Gör</button></div>${leaveTable(db.leaveRequests.slice().reverse().slice(0,5), true)}</div>`;
}
function metric(icon, label, value, sub) { return `<div class="card metric-card"><div class="metric-icon">${icon}</div><div><span>${label}</span><strong>${value}</strong><small>${sub}</small></div></div>`; }
function quick(icon, title, sub, action) { return `<button class="quick-item" onclick="${action}" style="width:100%;text-align:left"><div class="quick-item-main"><div class="metric-icon">${icon}</div><div><strong>${title}</strong><span>${sub}</span></div></div><b>›</b></button>`; }
function notice(title, sub) { return `<div class="quick-item"><div><strong>${title}</strong><span>${sub}</span></div></div>`; }
function goPage(page) { currentPage = page; renderNav(); renderPage(); }

function renderMembers() {
  if (currentUser.role !== 'admin') return goPage('dashboard');
  const pending = db.users.filter(u => !u.approved);
  const active = db.users.filter(u => u.approved);
  document.getElementById('pageContent').innerHTML = `
    <div class="grid grid-3">
      ${metric('👥','Toplam kayıt',db.users.length,'Tüm kullanıcılar')}
      ${metric('✅','Aktif kullanıcı',active.length,'Sisteme giriş yapabilir')}
      ${metric('🕓','Onay bekleyen',pending.length,'İşlem gerekli')}
    </div>
    <div class="card section-gap"><div class="card-header"><div><h3>Onay bekleyen üyelikler</h3><p>Yeni kayıt başvuruları</p></div></div>
      ${pending.length ? `<div class="table-wrap"><table><thead><tr><th>Personel</th><th>Telefon</th><th>Görev</th><th>İşlem</th></tr></thead><tbody>${pending.map(u => `<tr><td><strong>${escapeHtml(u.name)}</strong></td><td>${u.phone}</td><td>${escapeHtml(u.title)}</td><td><button class="btn btn-success btn-sm" onclick="approveMember(${u.id})">Onayla</button> <button class="btn btn-danger btn-sm" onclick="rejectMember(${u.id})">Reddet</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Onay bekleyen üyelik bulunmuyor.</div>'}
    </div>
    <div class="card section-gap"><div class="card-header"><div><h3>Aktif personeller</h3><p>Rol ve izin bakiyesi bilgileri</p></div><button class="btn btn-primary btn-sm" onclick="newMemberModal()">Personel Ekle</button></div>
      <div class="table-wrap"><table><thead><tr><th>Ad soyad</th><th>Telefon</th><th>Rol</th><th>Görev</th><th>Kalan izin</th><th>Durum</th></tr></thead><tbody>${active.map(u => `<tr><td><strong>${escapeHtml(u.name)}</strong></td><td>${u.phone}</td><td>${roleNames[u.role]}</td><td>${escapeHtml(u.title)}</td><td>${u.annualAllowance-u.usedLeave} gün</td><td>${statusBadge('approved')}</td></tr>`).join('')}</tbody></table></div>
    </div>`;
}
function approveMember(id) { const u=getUser(id); if(u){u.approved=true;saveDB();renderMembers();toast('Üyelik onaylandı.');} }
function rejectMember(id) { db.users=db.users.filter(u=>u.id!==id); saveDB(); renderMembers(); toast('Başvuru reddedildi.'); }
function newMemberModal() {
  showModal('Yeni Personel Ekle', `<form id="newMemberForm" class="form-grid">
    <label>Ad soyad<input name="name" required></label><label>Telefon<input name="phone" required></label>
    <label>Görev / rütbe<input name="title" required></label><label>Rol<select name="role"><option value="staff">Personel</option><option value="manager">Müdür</option><option value="admin">Admin</option></select></label>
    <label>Yıllık izin hakkı<input name="annualAllowance" type="number" value="30" min="0"></label><label>Geçici şifre<input name="password" value="123456" required></label>
    <div class="span-2"><button class="btn btn-primary btn-block">Personeli Kaydet</button></div></form>`);
  document.getElementById('newMemberForm').addEventListener('submit', e => { e.preventDefault(); const f=new FormData(e.target); db.users.push({id:Date.now(),name:f.get('name'),phone:normalizePhone(f.get('phone')),title:f.get('title'),role:f.get('role'),password:f.get('password'),approved:true,annualAllowance:Number(f.get('annualAllowance')),usedLeave:0});saveDB();closeModal();renderMembers();toast('Personel eklendi.'); });
}

function renderMeals() {
  const weekDays = ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];
  const key = `2026-W32-${currentUser.id}`;
  const selection = db.mealSelections[key] || Object.fromEntries(weekDays.map(d => [d,{breakfast:'yes',lunch:'yes',dinner:'yes'}]));
  if (currentUser.role === 'staff') {
    document.getElementById('pageContent').innerHTML = `
      <div class="summary-strip"><div><strong>4–10 Ağustos 2026 haftası</strong><div class="form-note">Son değişiklik zamanı: ${db.settings.mealDeadline}</div></div><div><strong>Toplam seçiminiz: 21 öğün</strong></div></div>
      <div class="card section-gap"><div class="card-header"><div><h3>Haftalık yemek tercihi</h3><p>Her öğün için katılım durumunuzu seçin</p></div></div><div class="card-body">
        <form id="mealForm"><div class="meal-grid">
          <div class="head">Gün</div><div class="head">Kahvaltı</div><div class="head">Öğle</div><div class="head">Akşam</div>
          ${weekDays.map(d => `<div><strong>${d}</strong></div>${['breakfast','lunch','dinner'].map(m => `<div class="choice"><label><input type="radio" name="${d}-${m}" value="yes" ${selection[d][m]==='yes'?'checked':''}> Yiyeceğim</label><label><input type="radio" name="${d}-${m}" value="no" ${selection[d][m]==='no'?'checked':''}> Yemeyeceğim</label></div>`).join('')}`).join('')}
        </div><button class="btn btn-primary section-gap" type="submit">Tercihleri Kaydet</button></form>
      </div></div>`;
    document.getElementById('mealForm').addEventListener('submit', e => { e.preventDefault(); const data={}; weekDays.forEach(d=>{data[d]={};['breakfast','lunch','dinner'].forEach(m=>data[d][m]=new FormData(e.target).get(`${d}-${m}`));});db.mealSelections[key]=data;saveDB();toast('Yemek tercihleriniz kaydedildi.'); });
  } else {
    const names = db.users.filter(u=>u.approved && u.role==='staff');
    document.getElementById('pageContent').innerHTML = `
      <div class="grid grid-4">${metric('🍽','Haftalık katılım','29 kişi','35 personelden')}${metric('⏳','Tercih yapmayan','6 kişi','Hatırlatma gönderilebilir')}${metric('🧾','Toplam gider',money(db.expenses.reduce((s,x)=>s+x.amount,0)),'Ağustos dönemi')}${metric('📌','Kişi/gün maliyeti','52,40 TL','Otomatik hesaplama')}</div>
      <div class="card section-gap"><div class="card-header"><div><h3>Personel yemek durumu</h3><p>4–10 Ağustos haftası</p></div><button class="btn btn-primary btn-sm" onclick="expenseModal()">Gider Ekle</button></div>
      <div class="table-wrap"><table><thead><tr><th>Personel</th><th>Pzt</th><th>Sal</th><th>Çar</th><th>Per</th><th>Cum</th><th>Cmt</th><th>Paz</th><th>Toplam</th></tr></thead><tbody>${names.map((u,i)=>`<tr><td><strong>${escapeHtml(u.name)}</strong></td>${[0,1,2,3,4,5,6].map((_,d)=>`<td>${(i+d)%5===0?'—':'3'}</td>`).join('')}<td><strong>${18+(i%4)}</strong></td></tr>`).join('')}</tbody></table></div></div>
      <div class="card section-gap"><div class="card-header"><div><h3>Gider kayıtları</h3><p>Bu döneme ait harcamalar</p></div></div><div class="table-wrap"><table><thead><tr><th>Tarih</th><th>Açıklama</th><th>Tutar</th></tr></thead><tbody>${db.expenses.map(x=>`<tr><td>${formatDate(x.date)}</td><td>${escapeHtml(x.name)}</td><td><strong>${money(x.amount)}</strong></td></tr>`).join('')}</tbody></table></div></div>`;
  }
}
function expenseModal() { showModal('Yeni Gider Ekle', `<form id="expenseForm" class="form-grid"><label>Tarih<input name="date" type="date" value="2026-08-06" required></label><label>Tutar<input name="amount" type="number" step="0.01" required></label><label class="span-2">Açıklama<input name="name" required></label><div class="span-2"><button class="btn btn-primary btn-block">Gideri Kaydet</button></div></form>`); document.getElementById('expenseForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);db.expenses.push({id:Date.now(),date:f.get('date'),name:f.get('name'),amount:Number(f.get('amount'))});saveDB();closeModal();renderMeals();toast('Gider kaydı eklendi.');}); }

function renderFinance() {
  const own = currentUser.role === 'staff';
  const debts = own ? db.debts.filter(x=>x.userId===currentUser.id) : db.debts;
  const totalExpense = db.expenses.reduce((s,x)=>s+x.amount,0);
  const collected = db.debts.reduce((s,x)=>s+x.paid,0);
  const waiting = db.debts.reduce((s,x)=>s+Math.max(0,x.amount-x.paid),0);
  document.getElementById('pageContent').innerHTML = own ? `
    <div class="grid grid-3">${metric('₺','Toplam borç',money(debts.reduce((s,x)=>s+x.amount,0)),'Dönem borçları')}${metric('✅','Ödenen',money(debts.reduce((s,x)=>s+x.paid,0)),'Onaylanan ödemeler')}${metric('⏳','Kalan',money(debts.reduce((s,x)=>s+Math.max(0,x.amount-x.paid),0)),'Ödeme bekleniyor')}</div>
    <div class="grid grid-2 section-gap"><div class="card"><div class="card-header"><div><h3>Ödeme bilgileri</h3><p>Havale açıklamasına ad soyad yazınız</p></div></div><div class="card-body"><label>Hesap sahibi<input value="${escapeHtml(db.settings.accountName)}" readonly></label><label class="section-gap">IBAN<input id="ibanInput" value="${escapeHtml(db.settings.iban)}" readonly></label><button class="btn btn-secondary section-gap" onclick="copyIban()">IBAN'ı Kopyala</button></div></div>
    <div class="card"><div class="card-header"><div><h3>Ödeme bildirimi</h3><p>Yaptığınız ödemeyi yönetime gönderin</p></div></div><div class="card-body"><button class="btn btn-primary" onclick="paymentModal()">Ödeme Bildir</button></div></div></div>
    <div class="card section-gap"><div class="card-header"><div><h3>Borç dökümü</h3><p>Dönem bazında ödeme durumunuz</p></div></div><div class="table-wrap"><table><thead><tr><th>Dönem</th><th>Borç</th><th>Ödenen</th><th>Kalan</th><th>Durum</th></tr></thead><tbody>${debts.map(x=>`<tr><td>${x.period}</td><td>${money(x.amount)}</td><td>${money(x.paid)}</td><td><strong>${money(Math.max(0,x.amount-x.paid))}</strong></td><td>${statusBadge(x.paid>=x.amount?'paid':'unpaid')}</td></tr>`).join('')}</tbody></table></div></div>` : `
    <div class="grid grid-4">${metric('🏦','Önceki dönem devri',money(3200),'Temmuz kapanışı')}${metric('✅','Tahsil edilen',money(collected),'Onaylanan ödemeler')}${metric('🧾','Yapılan gider',money(totalExpense),'Ağustos dönemi')}${metric('⏳','Bekleyen tahsilat',money(waiting),'Personel borçları')}</div>
    <div class="card section-gap"><div class="card-header"><div><h3>Personel borç ve ödeme durumu</h3><p>Güncel dönem hesap özeti</p></div></div><div class="table-wrap"><table><thead><tr><th>Personel</th><th>Dönem</th><th>Borç</th><th>Ödenen</th><th>Kalan</th><th>Durum</th></tr></thead><tbody>${debts.map(x=>`<tr><td><strong>${escapeHtml(getUser(x.userId)?.name||'Silinmiş kullanıcı')}</strong></td><td>${x.period}</td><td>${money(x.amount)}</td><td>${money(x.paid)}</td><td>${money(Math.max(0,x.amount-x.paid))}</td><td>${statusBadge(x.paid>=x.amount?'paid':'unpaid')}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card section-gap"><div class="card-header"><div><h3>Onay bekleyen ödeme bildirimleri</h3><p>Dekont ve tutar kontrolü</p></div></div><div class="table-wrap"><table><thead><tr><th>Personel</th><th>Tarih</th><th>Dönem</th><th>Tutar</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>${db.payments.map(p=>`<tr><td>${escapeHtml(getUser(p.userId)?.name||'-')}</td><td>${formatDate(p.date)}</td><td>${p.period}</td><td>${money(p.amount)}</td><td>${statusBadge(p.status)}</td><td>${p.status==='pending'?`<button class="btn btn-success btn-sm" onclick="approvePayment(${p.id})">Onayla</button>`:'—'}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function copyIban() { navigator.clipboard?.writeText(db.settings.iban); toast('IBAN panoya kopyalandı.'); }
function paymentModal() { showModal('Ödeme Bildir', `<form id="paymentForm" class="form-grid"><label>Dönem<select name="period"><option>Ağustos 2026</option></select></label><label>Tutar<input name="amount" type="number" required></label><label>Ödeme tarihi<input name="date" type="date" value="2026-08-06" required></label><label>Dekont<input name="receipt" type="file" accept="image/*,.pdf"></label><div class="span-2"><button class="btn btn-primary btn-block">Bildirimi Gönder</button></div></form>`); document.getElementById('paymentForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);db.payments.push({id:Date.now(),userId:currentUser.id,period:f.get('period'),amount:Number(f.get('amount')),date:f.get('date'),status:'pending'});saveDB();closeModal();toast('Ödeme bildiriminiz onaya gönderildi.');}); }
function approvePayment(id) { const p=db.payments.find(x=>x.id===id);if(!p)return;p.status='approved';const d=db.debts.find(x=>x.userId===p.userId&&x.period===p.period);if(d)d.paid=Math.min(d.amount,d.paid+p.amount);saveDB();renderFinance();toast('Ödeme onaylandı.'); }

function renderLeaves() {
  if (currentUser.role === 'staff') {
    const own = db.leaveRequests.filter(x=>x.userId===currentUser.id);
    const remaining = currentUser.annualAllowance-currentUser.usedLeave-own.filter(x=>x.status==='approved').reduce((s,x)=>s+x.days,0);
    document.getElementById('pageContent').innerHTML = `
      <div class="grid grid-3">${metric('📅','Yıllık izin hakkı',currentUser.annualAllowance+' gün','2026 yılı')}${metric('✅','Kullanılan izin',currentUser.usedLeave+' gün','Kesinleşen kullanım')}${metric('⏳','Kullanılabilir izin',remaining+' gün','Onaylı gelecek izinler düşülmüştür')}</div>
      <div class="card section-gap"><div class="card-header"><div><h3>İzin taleplerim</h3><p>Talep ve onay durumları</p></div><button class="btn btn-primary btn-sm" onclick="leaveModal()">Yeni İzin Talebi</button></div>${own.length?leaveTable(own,false):'<div class="empty">Henüz izin talebiniz bulunmuyor.</div>'}</div>`;
  } else {
    document.getElementById('pageContent').innerHTML = `
      <div class="grid grid-4">${metric('📅','Toplam izin kaydı',db.leaveRequests.length,'2026 yılı')}${metric('⏳','Onay bekleyen',db.leaveRequests.filter(x=>x.status==='pending').length,'Değerlendirme gerekli')}${metric('✅','Onaylanan',db.leaveRequests.filter(x=>x.status==='approved').length,'Planlanan izinler')}${metric('👥','Bugün izinli','2 kişi','Birimde 33 kişi')}</div>
      <div class="card section-gap"><div class="card-header"><div><h3>Ağustos 2026 izin takvimi</h3><p>Onaylanan, bekleyen ve sağlık izinleri</p></div><div class="legend"><span><i style="background:#dcfce7"></i>Onaylı</span><span><i style="background:#fef3c7"></i>Bekleyen</span><span><i style="background:#fee2e2"></i>Sağlık</span></div></div><div class="card-body">${calendarHtml(2026,7)}</div></div>
      <div class="card section-gap"><div class="card-header"><div><h3>İzin talepleri</h3><p>Personel bazlı talep listesi</p></div><button class="btn btn-secondary btn-sm" onclick="leaveModal(true)">Yönetici Kaydı Ekle</button></div>${leaveTable(db.leaveRequests,true)}</div>`;
  }
}
function leaveTable(items, actions) { return `<div class="table-wrap"><table><thead><tr><th>Personel</th><th>İzin türü</th><th>Başlangıç</th><th>Bitiş</th><th>Gün</th><th>Şehir</th><th>Durum</th>${actions?'<th>İşlem</th>':''}</tr></thead><tbody>${items.map(x=>`<tr><td><strong>${escapeHtml(getUser(x.userId)?.name||'-')}</strong></td><td>${escapeHtml(x.type)}</td><td>${formatDate(x.start)}</td><td>${formatDate(x.end)}</td><td>${x.days}</td><td>${escapeHtml(x.city||'-')}</td><td>${statusBadge(x.status)}</td>${actions?`<td>${x.status==='pending'?`<button class="btn btn-success btn-sm" onclick="approveLeave(${x.id})">Onayla</button> <button class="btn btn-danger btn-sm" onclick="rejectLeave(${x.id})">Reddet</button>`:'—'}</td>`:''}</tr>`).join('')}</tbody></table></div>`; }
function calendarHtml(year, month) {
  const first = new Date(year, month, 1); const last = new Date(year, month+1,0); const mondayIndex=(first.getDay()+6)%7; const total=Math.ceil((mondayIndex+last.getDate())/7)*7;
  const heads=['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(x=>`<div class="calendar-head">${x}</div>`).join('');
  let days='';
  for(let i=0;i<total;i++){const day=i-mondayIndex+1;if(day<1||day>last.getDate()){days+=`<div class="calendar-day muted"></div>`;continue;}const date=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;const events=db.leaveRequests.filter(x=>date>=x.start&&date<=x.end);days+=`<div class="calendar-day"><div class="day-num">${day}</div>${events.map(e=>`<div class="calendar-event ${e.status}">${escapeHtml(getUser(e.userId)?.name||'-')}</div>`).join('')}</div>`;}
  return `<div class="calendar">${heads}${days}</div>`;
}
function leaveModal(asAdmin=false) {
  const users = db.users.filter(u=>u.approved&&u.role!=='admin');
  showModal(asAdmin?'İzin Kaydı Ekle':'Yeni İzin Talebi', `<form id="leaveForm" class="form-grid">
    ${asAdmin?`<label class="span-2">Personel<select name="userId">${users.map(u=>`<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('')}</select></label>`:''}
    <label>İzin türü<select name="type"><option>Yıllık İzin</option><option>Mazeret İzni</option><option>Sağlık İzni</option><option>Görev / Kurs</option><option>Yol İzni</option></select></label>
    <label>İzne gidilecek şehir<input name="city" required></label><label>Başlangıç tarihi<input name="start" type="date" required></label><label>Bitiş tarihi<input name="end" type="date" required></label>
    <label class="span-2">Açıklama<textarea name="note"></textarea></label><div class="span-2"><button class="btn btn-primary btn-block">Talebi Gönder</button></div></form>`);
  document.getElementById('leaveForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target), start=f.get('start'),end=f.get('end');if(end<start)return toast('Bitiş tarihi başlangıçtan önce olamaz.');db.leaveRequests.push({id:Date.now(),userId:asAdmin?Number(f.get('userId')):currentUser.id,type:f.get('type'),city:f.get('city'),start,end,days:daysBetween(start,end),note:f.get('note'),status:asAdmin?'approved':'pending'});saveDB();closeModal();renderLeaves();toast(asAdmin?'İzin kaydı eklendi.':'İzin talebiniz onaya gönderildi.');});
}
function approveLeave(id){const x=db.leaveRequests.find(r=>r.id===id);if(x){x.status='approved';saveDB();renderLeaves();toast('İzin talebi onaylandı.');}}
function rejectLeave(id){const x=db.leaveRequests.find(r=>r.id===id);if(x){x.status='rejected';saveDB();renderLeaves();toast('İzin talebi reddedildi.');}}

function renderLaundry() {
  const date='2026-08-06', times=['09:00','10:30','12:00','13:30','15:00','16:30','18:00','19:30','21:00'];
  const machines=['Makine 1','Makine 2','Kurutma'];
  document.getElementById('pageContent').innerHTML = `
    <div class="grid grid-4">${metric('🧺','Bugünkü randevu',db.laundry.filter(x=>x.date===date).length,'Tüm makineler')}${metric('✅','Uygun saat','24 slot','Bugün')}${metric('👤','Haftalık hakkınız','1 / 2','Kalan: 1 kullanım')}${metric('🛠','Bakım durumu','Tümü aktif','Arıza bildirimi yok')}</div>
    <div class="card section-gap"><div class="card-header"><div><h3>6 Ağustos Perşembe</h3><p>Boş saate tıklayarak randevu oluşturabilirsiniz</p></div><button class="btn btn-secondary btn-sm" onclick="toast('Takvim tarihi değiştirilebilir.')">Tarih Değiştir</button></div><div class="card-body"><div class="laundry-board">
      <div class="head">Saat</div>${machines.map(m=>`<div class="head">${m}</div>`).join('')}
      ${times.map(time=>`<div><strong>${time}</strong></div>${machines.map(machine=>{const booking=db.laundry.find(x=>x.date===date&&x.time===time&&x.machine===machine);return booking?`<div class="slot busy"><strong>${escapeHtml(getUser(booking.userId)?.name||'-')}</strong>${currentUser.role==='admin'||booking.userId===currentUser.id?`<button class="btn btn-danger btn-sm" onclick="cancelLaundry(${booking.id})">İptal</button>`:'Rezerve'}</div>`:`<div class="slot free" onclick="bookLaundry('${date}','${time}','${machine}')">+ Randevu Al</div>`;}).join('')}`).join('')}
    </div></div></div>`;
}
function bookLaundry(date,time,machine){const userId=currentUser.role==='staff'?currentUser.id:3;if(db.laundry.some(x=>x.userId===userId&&x.date===date&&x.time===time))return toast('Bu saatte başka bir randevunuz bulunuyor.');db.laundry.push({id:Date.now(),userId,date,time,machine});saveDB();renderLaundry();toast(`${machine} için ${time} randevusu oluşturuldu.`);}
function cancelLaundry(id){db.laundry=db.laundry.filter(x=>x.id!==id);saveDB();renderLaundry();toast('Randevu iptal edildi.');}

function renderReports() {
  document.getElementById('pageContent').innerHTML = `
    <div class="grid grid-3">
      <div class="card"><div class="card-body">${reportCard('🍽','Yemek Katılım Raporu','Haftalık kişi ve öğün bazında katılım dökümü')}</div></div>
      <div class="card"><div class="card-body">${reportCard('₺','Borç ve Tahsilat Raporu','Dönemsel borç, ödeme ve bakiye özeti')}</div></div>
      <div class="card"><div class="card-body">${reportCard('📅','Yıllık İzin Raporu','Personel bazında kullanılan ve kalan izinler')}</div></div>
      <div class="card"><div class="card-body">${reportCard('🧺','Çamaşır Kullanım Raporu','Makine ve personel bazında kullanım sıklığı')}</div></div>
      <div class="card"><div class="card-body">${reportCard('📊','Aylık Bilanço','Gelir, gider, tahsilat ve kasa durumu')}</div></div>
      <div class="card"><div class="card-body">${reportCard('🕓','İşlem Geçmişi','Yönetici işlemleri ve zaman kayıtları')}</div></div>
    </div>`;
}
function reportCard(icon,title,desc){return `<div class="metric-icon">${icon}</div><h3>${title}</h3><p class="form-note">${desc}</p><div class="section-gap"><button class="btn btn-primary btn-sm" onclick="downloadCsv('${title}')">Excel/CSV İndir</button> <button class="btn btn-secondary btn-sm" onclick="toast('PDF raporu demo sürümünde önizlendi.')">PDF</button></div>`;}
function downloadCsv(title){const csv='Rapor;Tarih;Deger\n'+title+';06.08.2026;Demo rapor\n';const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=title.replaceAll(' ','_')+'.csv';a.click();URL.revokeObjectURL(a.href);toast('Rapor indirildi.');}

function renderSettings() {
  if(currentUser.role!=='admin')return goPage('dashboard');
  document.getElementById('pageContent').innerHTML=`<div class="grid grid-2"><div class="card"><div class="card-header"><div><h3>Ödeme ayarları</h3><p>Personelin göreceği hesap bilgileri</p></div></div><div class="card-body"><form id="settingsForm"><label>Hesap sahibi<input name="accountName" value="${escapeHtml(db.settings.accountName)}"></label><label class="section-gap">IBAN<input name="iban" value="${escapeHtml(db.settings.iban)}"></label><label class="section-gap">Yemek tercihi son zamanı<input name="mealDeadline" value="${escapeHtml(db.settings.mealDeadline)}"></label><label class="section-gap">Haftalık çamaşır kullanım limiti<input name="weeklyLaundryLimit" type="number" value="${db.settings.weeklyLaundryLimit}"></label><button class="btn btn-primary section-gap">Ayarları Kaydet</button></form></div></div><div class="card"><div class="card-header"><div><h3>Veri yönetimi</h3><p>Demo verilerini yedekleme ve sıfırlama</p></div></div><div class="card-body quick-list">${quick('💾','Tarayıcı verilerini yedekle','JSON dosyası indir',"exportBackup()")}${quick('♻','Demo verilerini sıfırla','Tüm yerel değişiklikler silinir',"resetDemo()")}</div></div></div>`;
  document.getElementById('settingsForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);db.settings={...db.settings,accountName:f.get('accountName'),iban:f.get('iban'),mealDeadline:f.get('mealDeadline'),weeklyLaundryLimit:Number(f.get('weeklyLaundryLimit'))};saveDB();toast('Sistem ayarları kaydedildi.');});
}
function exportBackup(){const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='personel-yasam-yedek.json';a.click();URL.revokeObjectURL(a.href);toast('Yedek dosyası indirildi.');}
function resetDemo(){if(!confirm('Tüm demo değişiklikleri silinsin mi?'))return;localStorage.removeItem(APP_KEY);db=loadDB();renderPage();toast('Demo verileri sıfırlandı.');}

function renderProfile() {
  document.getElementById('pageContent').innerHTML=`<div class="grid grid-2"><div class="card"><div class="card-header"><div><h3>Profil bilgilerim</h3><p>Kişisel hesap bilgileri</p></div></div><div class="card-body"><form id="profileForm"><label>Ad soyad<input name="name" value="${escapeHtml(currentUser.name)}"></label><label class="section-gap">Telefon<input value="${currentUser.phone}" readonly></label><label class="section-gap">Görev / rütbe<input name="title" value="${escapeHtml(currentUser.title)}"></label><button class="btn btn-primary section-gap">Bilgileri Kaydet</button></form></div></div><div class="card"><div class="card-header"><div><h3>Şifre güvenliği</h3><p>Şifrenizi düzenli olarak güncelleyin</p></div></div><div class="card-body"><button class="btn btn-secondary" onclick="toast('Şifre değiştirme bağlantısı açıldı.')">Şifremi Değiştir</button></div></div></div>`;
  document.getElementById('profileForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);currentUser.name=f.get('name');currentUser.title=f.get('title');saveDB();login(currentUser);toast('Profil bilgileriniz güncellendi.');});
}

init();
