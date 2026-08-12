/**
 * PBYS - SMS + Admin Şifre Sıfırlama (V9.3.3)
 *
 * Bu sürüm:
 * - FIREBASE_SERVICE_ACCOUNT_JSON İSTEMEZ.
 * - ILETI_KEY / ILETI_HASH / ILETI_SENDER'ı tekrar istemez.
 * - Mevcut Kantin10 Apps Script projesindeki smsGonderIletiMerkezi() fonksiyonunu kullanır.
 * - PBYS_RESET_SECRET değerini otomatik üretir ve Script Properties'e kendisi kaydeder.
 * - Firebase Authentication kullanıcılarını ScriptApp.getOAuthToken() ile yönetir.
 * - Admin panelindeki geçici şifre işlemini Firebase ID token + Firestore admin rolü ile doğrular.
 *
 * Mevcut doPost(e) fonksiyonunun en başında şu iki satır bulunmalıdır:
 *
 *   var pbysCevap = pbysPasswordResetDoPost(e);
 *   if (pbysCevap) return pbysCevap;
 *
 * ÖNEMLİ:
 * Apps Script'i dağıtan Google hesabının gencservi-5d47e projesinde
 * Firebase Authentication kullanıcılarını görüntüleme/güncelleme yetkisi olmalıdır.
 */

var PBYS_PROJECT_ID = 'gencservi-5d47e';
var PBYS_AUTH_EMAIL_DOMAIN = 'gencservi.app';
var PBYS_WEB_API_KEY = 'AIzaSyAUAdNiglZ0UM3JcAUW4JbEAHJg5JwnQD8'; // Firebase Web API key; gizli anahtar değildir.
var PBYS_RESET_TTL_SECONDS = 300; // 5 dakika
var PBYS_RESET_RATE_SECONDS = 60; // 60 saniye tekrar kod yok
var PBYS_RESET_MAX_ATTEMPTS = 5;

/**
 * Mevcut doPost(e) içinden çağrılır.
 * PBYS isteği değilse null döner ve eski Kantin10 doPost kodu çalışmaya devam eder.
 */
function pbysPasswordResetDoPost(e) {
  var data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return null;
  }

  var action = String(data.action || '');
  if (action !== 'pbysSifreKodGonder' &&
      action !== 'pbysSifreKodDogrula' &&
      action !== 'pbysAdminSifreSifirla') {
    return null;
  }

  try {
    if (action === 'pbysSifreKodGonder') {
      return pbysJson_(pbysSifreKodGonder_(data));
    }
    if (action === 'pbysAdminSifreSifirla') {
      return pbysJson_(pbysAdminSifreSifirla_(data));
    }
    return pbysJson_(pbysSifreKodDogrula_(data));
  } catch (err) {
    console.error('PBYS şifre sıfırlama hatası:', err);
    return pbysJson_({
      success: false,
      message: pbysKullaniciHataMesaji_(err)
    });
  }
}

function pbysSifreKodGonder_(data) {
  var telefon = pbysTelefon10_(data.telefon);
  if (!telefon) {
    return { success:false, message:'Geçerli bir cep telefonu numarası girin.' };
  }

  var cache = CacheService.getScriptCache();
  var rateKey = 'pbys_reset_rate_' + telefon;

  if (cache.get(rateKey)) {
    return { success:false, message:'Yeni kod istemeden önce 60 saniye bekleyin.' };
  }

  // Önce Firebase Authentication hesabını bul.
  var user = pbysFirebaseUserByPhone_(telefon);

  // Kullanıcı var/yok bilgisini dışarı vermemek için genel cevap döndür.
  if (!user || !user.localId) {
    cache.put(rateKey, '1', PBYS_RESET_RATE_SECONDS);
    return {
      success:true,
      message:'Telefon sistemde kayıtlıysa doğrulama kodu SMS ile gönderilecektir.'
    };
  }

  var kod = pbysSixDigitCode_();
  var now = Date.now();
  var entry = {
    hash: pbysCodeHash_(telefon, kod),
    uid: user.localId,
    expiresAt: now + PBYS_RESET_TTL_SECONDS * 1000,
    attempts: 0
  };

  cache.put('pbys_reset_' + telefon, JSON.stringify(entry), PBYS_RESET_TTL_SECONDS);
  cache.put(rateKey, '1', PBYS_RESET_RATE_SECONDS);

  var mesaj = 'PBYS sifre sifirlama kodunuz: ' + kod +
    '. Kod 5 dakika gecerlidir. Bu kodu kimseyle paylasmayin.';

  if (!pbysSmsGonder_(telefon, mesaj)) {
    cache.remove('pbys_reset_' + telefon);
    cache.remove(rateKey);
    return { success:false, message:'SMS gönderilemedi. Lütfen biraz sonra tekrar deneyin.' };
  }

  return {
    success:true,
    message:'Telefon sistemde kayıtlıysa doğrulama kodu SMS ile gönderilecektir.'
  };
}

function pbysSifreKodDogrula_(data) {
  var telefon = pbysTelefon10_(data.telefon);
  var kod = String(data.kod || '').replace(/\D/g, '');
  var yeniSifre = String(data.yeniSifre || '');

  if (!telefon) return { success:false, message:'Telefon numarası hatalı.' };
  if (!/^\d{6}$/.test(kod)) return { success:false, message:'6 haneli doğrulama kodunu girin.' };
  if (yeniSifre.length < 6) return { success:false, message:'Yeni şifre en az 6 karakter olmalıdır.' };

  var cache = CacheService.getScriptCache();
  var key = 'pbys_reset_' + telefon;
  var raw = cache.get(key);

  if (!raw) {
    return { success:false, message:'Doğrulama kodunun süresi dolmuş. Yeni kod isteyin.' };
  }

  var entry;
  try {
    entry = JSON.parse(raw);
  } catch (err) {
    cache.remove(key);
    return { success:false, message:'Doğrulama kaydı geçersiz. Yeni kod isteyin.' };
  }

  if (!entry.expiresAt || Date.now() > Number(entry.expiresAt)) {
    cache.remove(key);
    return { success:false, message:'Doğrulama kodunun süresi dolmuş. Yeni kod isteyin.' };
  }

  entry.attempts = Number(entry.attempts || 0) + 1;
  if (entry.attempts > PBYS_RESET_MAX_ATTEMPTS) {
    cache.remove(key);
    return { success:false, message:'Çok fazla hatalı deneme yapıldı. Yeni kod isteyin.' };
  }

  if (entry.hash !== pbysCodeHash_(telefon, kod)) {
    var kalan = Math.max(1, Math.floor((Number(entry.expiresAt) - Date.now()) / 1000));
    cache.put(key, JSON.stringify(entry), kalan);
    return { success:false, message:'Doğrulama kodu hatalı.' };
  }

  var user = pbysFirebaseUserByPhone_(telefon);
  if (!user || !user.localId || user.localId !== entry.uid) {
    cache.remove(key);
    return { success:false, message:'Hesap doğrulanamadı. Yöneticiye başvurun.' };
  }

  pbysFirebasePasswordUpdate_(user.localId, yeniSifre);

  cache.remove(key);
  cache.remove('pbys_reset_rate_' + telefon);

  return {
    success:true,
    message:'Şifreniz başarıyla değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.'
  };
}


/**
 * Admin panelinden geçici şifre atar.
 * İstek yapan kişinin Firebase ID token'ı doğrulanır ve Firestore users/{uid}
 * belgesinde admin rolü taşıdığı ayrıca kontrol edilir.
 */
function pbysAdminSifreSifirla_(data) {
  var adminIdToken = String(data.adminIdToken || '');
  var targetUid = String(data.targetUid || '');
  var yeniSifre = String(data.yeniSifre || '');

  if (!adminIdToken) return { success:false, message:'Admin oturumu doğrulanamadı. Yeniden giriş yapın.' };
  if (!targetUid) return { success:false, message:'Personel kullanıcı kimliği bulunamadı.' };
  if (yeniSifre.length < 6) return { success:false, message:'Geçici şifre en az 6 karakter olmalıdır.' };

  var caller = pbysFirebaseUserByIdToken_(adminIdToken);
  if (!caller || !caller.localId) {
    return { success:false, message:'Admin oturumu doğrulanamadı. Yeniden giriş yapın.' };
  }
  if (!pbysFirestoreUserIsAdmin_(caller.localId)) {
    return { success:false, message:'Bu işlem yalnızca Admin hesabı tarafından yapılabilir.' };
  }

  // Hedef hesabın gerçekten var olduğunu yönetici API'sinden doğrula.
  var target = pbysFirebaseUserByUid_(targetUid);
  if (!target || !target.localId) {
    return { success:false, message:'Firebase Authentication hesabı bulunamadı.' };
  }

  pbysFirebasePasswordUpdate_(targetUid, yeniSifre);
  pbysFirestoreMarkTemporaryPassword_(targetUid, caller.localId);

  return {
    success:true,
    message:'Geçici şifre oluşturuldu. Personel ilk girişte kendi şifresini belirleyecektir.'
  };
}

/**
 * Son kullanıcı Firebase ID token'ından hesabı çözer.
 */
function pbysFirebaseUserByIdToken_(idToken) {
  var url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' +
    encodeURIComponent(PBYS_WEB_API_KEY);

  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ idToken: idToken }),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code === 200) {
    var parsed = JSON.parse(text || '{}');
    return parsed.users && parsed.users.length ? parsed.users[0] : null;
  }
  if (code === 400 || code === 401) return null;
  throw new Error('Admin oturum doğrulaması başarısız: ' + code + ' ' + text);
}

/**
 * Yönetici OAuth erişimi ile UID üzerinden Authentication kullanıcısını bulur.
 */
function pbysFirebaseUserByUid_(uid) {
  var token = pbysGoogleAccessToken_();
  var url = 'https://identitytoolkit.googleapis.com/v1/projects/' +
    encodeURIComponent(PBYS_PROJECT_ID) + '/accounts:lookup';

  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ localId: [uid] }),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code === 200) {
    var parsed = JSON.parse(text || '{}');
    return parsed.users && parsed.users.length ? parsed.users[0] : null;
  }
  if (code === 404) return null;
  if (code === 401 || code === 403) {
    throw new Error('PBYS_FIREBASE_YETKI: Firebase kullanıcı sorgulama yetkisi eksik.');
  }
  throw new Error('Firebase UID sorgusu başarısız: ' + code + ' ' + text);
}

/**
 * Firestore kullanıcı profilinde admin rolünü kontrol eder.
 */
function pbysFirestoreUserIsAdmin_(uid) {
  var token = pbysGoogleAccessToken_();
  var url = 'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(PBYS_PROJECT_ID) +
    '/databases/(default)/documents/users/' + encodeURIComponent(uid);

  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code === 404) return false;
  if (code === 401 || code === 403) {
    throw new Error('PBYS_FIREBASE_YETKI: Firestore kullanıcı profilini okuma yetkisi eksik.');
  }
  if (code !== 200) throw new Error('Firestore profil sorgusu başarısız: ' + code + ' ' + text);

  var doc = JSON.parse(text || '{}');
  var fields = doc.fields || {};
  var role = fields.role && fields.role.stringValue ? String(fields.role.stringValue) : '';
  if (role === 'admin') return true;

  var values = fields.roles && fields.roles.arrayValue && fields.roles.arrayValue.values
    ? fields.roles.arrayValue.values
    : [];
  return values.some(function(v) { return String(v.stringValue || '') === 'admin'; });
}

/**
 * Geçici şifre verildiğini Firestore profiline işler.
 * Böylece personel giriş yaptığında uygulama şifre değiştirme ekranını zorunlu açar.
 */
function pbysFirestoreMarkTemporaryPassword_(targetUid, adminUid) {
  var token = pbysGoogleAccessToken_();
  var base = 'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(PBYS_PROJECT_ID) +
    '/databases/(default)/documents/users/' + encodeURIComponent(targetUid);

  var fields = [
    'mustChangePassword',
    'passwordResetAt',
    'passwordResetByUid'
  ];
  var query = fields.map(function(f) {
    return 'updateMask.fieldPaths=' + encodeURIComponent(f);
  }).join('&');

  var payload = {
    fields: {
      mustChangePassword: { booleanValue: true },
      passwordResetAt: { timestampValue: new Date().toISOString() },
      passwordResetByUid: { stringValue: adminUid }
    }
  };

  var res = UrlFetchApp.fetch(base + '?' + query, {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('Geçici şifre işareti Firestore profiline yazılamadı: ' + code + ' ' + res.getContentText());
  }
}

function pbysTelefon10_(value) {
  var digits = String(value || '').replace(/\D/g, '');
  if (digits.indexOf('90') === 0) digits = digits.substring(2);
  if (digits.indexOf('0') === 0) digits = digits.substring(1);
  return /^5\d{9}$/.test(digits) ? digits : '';
}

function pbysSixDigitCode_() {
  var source = Utilities.getUuid() + ':' + Date.now() + ':' + Math.random();
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    source,
    Utilities.Charset.UTF_8
  );

  var n = 0;
  for (var i = 0; i < 4; i++) {
    n = (n * 256 + (digest[i] & 255)) >>> 0;
  }
  return String(n % 1000000).padStart(6, '0');
}

/**
 * Gizli hash anahtarı kullanıcıdan istenmez.
 * İlk kullanımda otomatik oluşturulup Script Properties'e kaydedilir.
 */
function pbysResetSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('PBYS_AUTO_RESET_SECRET');

  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('PBYS_AUTO_RESET_SECRET', secret);
  }

  return secret;
}

function pbysCodeHash_(telefon, kod) {
  var raw = telefon + ':' + kod + ':' + pbysResetSecret_();
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    raw,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}

/**
 * Firebase Authentication kullanıcısını, PBYS'nin telefon->e-posta formatı ile bulur.
 */
function pbysFirebaseUserByPhone_(telefon) {
  var email = '0' + telefon + '@' + PBYS_AUTH_EMAIL_DOMAIN;
  var token = pbysGoogleAccessToken_();
  var url = 'https://identitytoolkit.googleapis.com/v1/projects/' +
    encodeURIComponent(PBYS_PROJECT_ID) + '/accounts:lookup';

  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ email: [email] }),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var text = res.getContentText();

  if (code === 200) {
    var parsed = JSON.parse(text || '{}');
    return parsed.users && parsed.users.length ? parsed.users[0] : null;
  }

  if (code === 404) return null;

  if (code === 401 || code === 403) {
    throw new Error(
      'PBYS_FIREBASE_YETKI: Google Apps Script hesabının gencservi-5d47e Firebase Authentication yetkisi yok veya Identity Toolkit OAuth izni eksik.'
    );
  }

  throw new Error('Firebase kullanıcı sorgusu başarısız: ' + code + ' ' + text);
}

function pbysFirebasePasswordUpdate_(uid, password) {
  var token = pbysGoogleAccessToken_();
  var url = 'https://identitytoolkit.googleapis.com/v1/projects/' +
    encodeURIComponent(PBYS_PROJECT_ID) + '/accounts:update';

  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      localId: uid,
      password: password
    }),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var text = res.getContentText();

  if (code !== 200) {
    if (code === 401 || code === 403) {
      throw new Error(
        'PBYS_FIREBASE_YETKI: Google Apps Script hesabının Firebase Authentication kullanıcı güncelleme yetkisi yok veya Identity Toolkit OAuth izni eksik.'
      );
    }
    throw new Error('Firebase şifre güncellemesi başarısız: ' + code + ' ' + text);
  }
}

/**
 * Mevcut Kantin10 SMS fonksiyonunu aynen kullanır.
 * ILETI_KEY, ILETI_HASH, ILETI_SENDER burada tekrar tanımlanmaz.
 */
function pbysSmsGonder_(telefon, mesaj) {
  if (typeof smsGonderIletiMerkezi !== 'function') {
    throw new Error(
      'PBYS_SMS_FONKSIYON_YOK: Mevcut projede smsGonderIletiMerkezi(telefon, mesaj) fonksiyonu bulunamadı.'
    );
  }

  return smsGonderIletiMerkezi(telefon, mesaj) === true;
}

/**
 * Service Account JSON yerine Apps Script'i dağıtan Google hesabının OAuth belirtecini kullanır.
 * Hesabın gencservi-5d47e projesinde firebaseauth.users.get ve firebaseauth.users.update
 * izinlerini içeren bir rolü olmalıdır.
 */
function pbysGoogleAccessToken_() {
  return ScriptApp.getOAuthToken();
}

function pbysKullaniciHataMesaji_(err) {
  var text = String((err && err.message) || err || '');

  if (text.indexOf('PBYS_FIREBASE_YETKI') >= 0) {
    return 'Firebase yetkisi eksik. Google Apps Script hesabının PBYS Firebase projesine erişimini kontrol edin.';
  }

  if (text.indexOf('PBYS_SMS_FONKSIYON_YOK') >= 0) {
    return 'Mevcut Kantin10 SMS fonksiyonu bulunamadı. Yöneticiye bildirin.';
  }

  if (text.indexOf('Admin oturum') >= 0) {
    return 'Admin oturumu doğrulanamadı. Çıkış yapıp yeniden giriş yapın.';
  }

  return 'İşlem şu anda tamamlanamadı. Lütfen daha sonra tekrar deneyin.';
}

function pbysJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * TEK SEFERLİK KONTROL:
 * Apps Script editöründe bu fonksiyonu elle çalıştırın.
 * SMS göndermez; mevcut SMS fonksiyonunu ve Firebase OAuth erişimini kontrol eder.
 */
function pbysKurulumKontrol() {
  Logger.log('PBYS kurulum kontrolü başladı.');

  if (typeof smsGonderIletiMerkezi !== 'function') {
    throw new Error('smsGonderIletiMerkezi() bulunamadı.');
  }
  Logger.log('1/4 SMS fonksiyonu bulundu.');

  pbysResetSecret_();
  Logger.log('2/4 Gizli doğrulama anahtarı otomatik hazırlandı.');

  var token = pbysGoogleAccessToken_();
  if (!token) throw new Error('Google OAuth token alınamadı.');

  // Var olmayan örnek bir e-posta ile yalnızca API yetkisini test eder.
  var url = 'https://identitytoolkit.googleapis.com/v1/projects/' +
    encodeURIComponent(PBYS_PROJECT_ID) + '/accounts:lookup';
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ email: ['pbys-kurulum-kontrol-yok@gencservi.app'] }),
    muteHttpExceptions: true
  });

  Logger.log('Firebase test HTTP kodu: ' + res.getResponseCode());
  Logger.log('Firebase test cevabı: ' + res.getContentText());

  if (res.getResponseCode() === 401 || res.getResponseCode() === 403) {
    throw new Error(
      'Firebase OAuth yetkisi eksik. Apps Script manifestine Identity Toolkit scope eklenmesi veya Google hesabının proje yetkisinin kontrol edilmesi gerekiyor.'
    );
  }

  if (res.getResponseCode() !== 200 && res.getResponseCode() !== 404) {
    throw new Error('Firebase API testi başarısız: HTTP ' + res.getResponseCode());
  }

  Logger.log('3/4 Firebase Authentication erişimi başarılı.');

  var firestoreUrl = 'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(PBYS_PROJECT_ID) +
    '/databases/(default)/documents/users/pbys-kurulum-kontrol-yok';
  var firestoreRes = UrlFetchApp.fetch(firestoreUrl, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  Logger.log('Firestore test HTTP kodu: ' + firestoreRes.getResponseCode());
  if (firestoreRes.getResponseCode() === 401 || firestoreRes.getResponseCode() === 403) {
    throw new Error('Firestore OAuth/IAM yetkisi eksik. Admin şifre sıfırlama personel profilini doğrulayamaz.');
  }
  if (firestoreRes.getResponseCode() !== 200 && firestoreRes.getResponseCode() !== 404) {
    throw new Error('Firestore API testi başarısız: HTTP ' + firestoreRes.getResponseCode());
  }

  Logger.log('4/4 Firestore erişimi başarılı.');
  Logger.log('PBYS SMS + Admin şifre sıfırlama kurulumu hazır.');
}
