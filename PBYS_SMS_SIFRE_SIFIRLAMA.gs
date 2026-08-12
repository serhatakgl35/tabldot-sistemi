/**
 * PBYS - SMS ile Şifre Sıfırlama
 * Google Apps Script / İletiMerkezi / Firebase Authentication
 *
 * Bu dosyayı mevcut Kantin10 SMS Apps Script projenize EKLEYEBİLİRSİNİZ.
 * Mevcut doPost(e) fonksiyonunuzun EN BAŞINA şu iki satırı ekleyin:
 *
var PROJECT_ID = "berber-randevu-14f7f";
var BASE_URL = "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID + "/databases/(default)/documents";
 *
 * Böylece mevcut Kantin10 işlevleri bozulmadan aynı Web App URL'si PBYS için de kullanılır.
 *
 * Script Properties içinde gerekli değerler:
var ILETI_KEY = "bda7bee3c40ba2162715251870c28c82";
var ILETI_HASH = "c4716ed59c3d2fb1c3fbe332e9320ba9c9e30d81bc2e2219d198bc30d0c0a8e5";
var ILETI_SENDER = "SerhatAkgul";
 * - FIREBASE_SERVICE_ACCOUNT_JSON   {
  "type": "service_account",
  "project_id": "gencservi-5d47e",
  "private_key_id": "ed6ffb12ca02135184cc545e81f7c64ef54cb29a",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC6wuXQrbGtkFaw\nnnzIwtcnvNYKLpN/QD+AUJECALjHx+oRYtz2vHTsPrxUQH5RuBmcMCYBRz5x+Sds\nQMd9DJDNqP/grHxL+0fzodUn/UdLCuEFt5B+OdG5EG950ACL2rbWYyv3aQoB9XKa\n0N3pMaAYpSaRR2iuI+lBcirkGoSj4dxRjwH+3pGfL7o65rmuxjMjP0cKqWrHmvB5\nWxWZLXKVUc90KHDF/5xpWf9w5AFK+w2acFEFgMFSugUcKEZHiqSFjHQ2qlDxueX2\nzpZWraYZJ7IoIXDOrwnETkRChQvuOikdDCQI0F9njZ3vM1EOyZK6V0WtOlTkThYw\n2cW/uUBPAgMBAAECggEAJKeE0FiOwzhNc1uftQ1cie2LerMaesKi0+28EA8RNRCc\n9W2YXYquTgGgF88Sm7pMuHVQuDaB4H+ch6gNHxNcxihxk+h2erkmLYBpI/CXUfig\nIm2dG9EAQtihcGBtAwXZlakgI25Hqwu/wvfUXeTB/aRINgI0Xt0odhJQrbUwrDMc\n+wgdW04JEA5HnvGGnunWXVz61lV/MFDfMYpGz2IJJrHFmQhFn9G1b1j1bf2VbA8P\nokOY0zrIkLzoy+9ujIhKwrRzsgwOg/HDI7DgLhU3un9MWfAQF/LryHKHCv+68m8K\n6t6c5q303zDXKR6UtGRxpKX/9GQwgkT9jWXMw7+NSQKBgQD3kK5DyYZYz9ZxjRtH\nBZ6ks3aNhzsJN7SDMPmPWDODc7paOa9LpHwcrHJV/20+j/s6w4FlvFdMsz8Qz/18\n6mv08pkzhtuMTU2/ygYqnipgSsfBIdoWWG/g3r3e5uWmXoFqP5OCziYWWHauaDJ0\ncCLYlvDpWvWqJvysT2zq/f8A+QKBgQDBH99FvPwGVaf3V3GEBvUTyp+mtX11AD2I\nCKwxXXhiz8/++s6D20eqggjVmT/XMA7dxQvGwfMx0ZiZThA06MqC0AmlNLlAf1ue\nP+OpDVcznuLYaPVnI8dzG2UeEMNAsriRxF+G5uCMpV8dvhRhSFHhdFd9vYgW+Mww\nC5KG/qnlhwKBgGbp8kejwwGwhMj3i9tebrCxGhuDl/sg+R2Agn4ggGmo9lMDn+em\nHSIeXfl6EYPsftfS5jvQq8nqydDHZe1D1lUhdKaC7UnJ6QRNi3qz/ZHCBIA4/lxD\nr16fufarrdQXfV0ZyMybviGT7OJb1n2pEBNRzBx1/6IYSvmmmvSlWhihAoGBAJx6\nY6EQ4C+Nxbu+SUbNkFPJ8JPWJ+HeIP0Q8dxJvNprQT97HktuJ+I63EedlUGZOeJs\n3v7bdV5fUkKdIrqMCFH3mGkYkCV3S9esMp1uJsK3sVvhpz07m0Zj4wl6UYohhTTu\npOwcM8Mh1zC1K7QrMdT4PE+wew0J5//h0Ia63xQPAoGAMhaZ0BuidacVhms4HgSc\nuhYttulAAEo4LYk+DxzWZElCPDcoschFAoTLXnhT/mpxd1sMrf40w9mnGh6O+OtP\nb7J5CGzwPf6ZmpuwK2sSgbMySqcWhmXb74/gnNP6NUGS8AUIHoViisghSRYDNIKy\n7GEahGma8WKaeqUGHmOkQ08=\n-----END PRIVATE KEY-----\n",

}

 * - PBYS_RESET_SECRET               (uzun, rastgele bir gizli metin)
 */

var PBYS_PROJECT_ID = 'gencservi-5d47e';
var PBYS_AUTH_EMAIL_DOMAIN = 'gencservi.app';
var PBYS_RESET_TTL_SECONDS = 300; // 5 dakika
var PBYS_RESET_RATE_SECONDS = 60; // aynı numaraya 60 sn içinde tekrar kod yok
var PBYS_RESET_MAX_ATTEMPTS = 5;

/**
 * Mevcut doPost(e) içinden çağrılır.
 * PBYS action değilse null döner; böylece mevcut Kantin10 kodunuz çalışmaya devam eder.
 */
function pbysPasswordResetDoPost(e) {
  var data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return null;
  }

  var action = String(data.action || '');
  if (action !== 'pbysSifreKodGonder' && action !== 'pbysSifreKodDogrula') return null;

  try {
    if (action === 'pbysSifreKodGonder') return pbysJson_(pbysSifreKodGonder_(data));
    return pbysJson_(pbysSifreKodDogrula_(data));
  } catch (err) {
    console.error('PBYS şifre sıfırlama:', err);
    return pbysJson_({ success:false, message:'İşlem şu anda tamamlanamadı. Lütfen daha sonra tekrar deneyin.' });
  }
}

function pbysSifreKodGonder_(data) {
  var telefon = pbysTelefon10_(data.telefon);
  if (!telefon) return { success:false, message:'Geçerli bir cep telefonu numarası girin.' };

  var cache = CacheService.getScriptCache();
  var rateKey = 'pbys_reset_rate_' + telefon;
  if (cache.get(rateKey)) {
    return { success:false, message:'Yeni kod istemeden önce kısa bir süre bekleyin.' };
  }
  cache.put(rateKey, '1', PBYS_RESET_RATE_SECONDS);

  // Hesap var/yok bilgisini dışarı vermemek için bulunamazsa da genel başarı mesajı döndürülür.
  var user = pbysFirebaseUserByPhone_(telefon);
  if (!user || !user.localId) {
    return { success:true, message:'Telefon kayıtlı ve onaylıysa doğrulama kodu SMS ile gönderilecektir.' };
  }

  if (!pbysApprovedProfile_(user.localId)) {
    return { success:true, message:'Telefon kayıtlı ve onaylıysa doğrulama kodu SMS ile gönderilecektir.' };
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

  var mesaj = 'PBYS sifre sifirlama kodunuz: ' + kod + '. Kod 5 dakika gecerlidir. Bu kodu kimseyle paylasmayin.';
  if (!pbysSmsGonder_(telefon, mesaj)) {
    cache.remove('pbys_reset_' + telefon);
    return { success:false, message:'SMS gönderilemedi. Lütfen biraz sonra tekrar deneyin.' };
  }

  return { success:true, message:'Telefon kayıtlı ve onaylıysa doğrulama kodu SMS ile gönderilecektir.' };
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
  if (!raw) return { success:false, message:'Doğrulama kodunun süresi dolmuş. Yeni kod isteyin.' };

  var entry = JSON.parse(raw);
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
    cache.put(key, JSON.stringify(entry), Math.max(1, Math.floor((Number(entry.expiresAt) - Date.now()) / 1000)));
    return { success:false, message:'Doğrulama kodu hatalı.' };
  }

  var user = pbysFirebaseUserByPhone_(telefon);
  if (!user || !user.localId || user.localId !== entry.uid || !pbysApprovedProfile_(user.localId)) {
    cache.remove(key);
    return { success:false, message:'Hesap doğrulanamadı. Yöneticiye başvurun.' };
  }

  pbysFirebasePasswordUpdate_(user.localId, yeniSifre);
  cache.remove(key);
  cache.remove('pbys_reset_rate_' + telefon);
  return { success:true, message:'Şifreniz başarıyla değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.' };
}

function pbysTelefon10_(value) {
  var digits = String(value || '').replace(/\D/g, '');
  if (digits.indexOf('90') === 0) digits = digits.substring(2);
  if (digits.indexOf('0') === 0) digits = digits.substring(1);
  return /^5\d{9}$/.test(digits) ? digits : '';
}

function pbysSixDigitCode_() {
  var source = Utilities.getUuid() + ':' + Date.now() + ':' + Math.random();
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, source, Utilities.Charset.UTF_8);
  var n = 0;
  for (var i = 0; i < 4; i++) n = (n * 256 + (digest[i] & 255)) >>> 0;
  return String(n % 1000000).padStart(6, '0');
}

function pbysCodeHash_(telefon, kod) {
  var secret = PropertiesService.getScriptProperties().getProperty('PBYS_RESET_SECRET');
  if (!secret) throw new Error('PBYS_RESET_SECRET Script Property tanımlı değil.');
  var raw = telefon + ':' + kod + ':' + secret;
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}

function pbysFirebaseUserByPhone_(telefon) {
  var email = '0' + telefon + '@' + PBYS_AUTH_EMAIL_DOMAIN;
  var token = pbysGoogleAccessToken_();
  var url = 'https://identitytoolkit.googleapis.com/v1/projects/' + encodeURIComponent(PBYS_PROJECT_ID) + '/accounts:lookup';
  var res = UrlFetchApp.fetch(url, {
    method:'post',
    contentType:'application/json',
    headers:{ Authorization:'Bearer ' + token },
    payload:JSON.stringify({ email:[email] }),
    muteHttpExceptions:true
  });
  if (res.getResponseCode() === 200) {
    var parsed = JSON.parse(res.getContentText() || '{}');
    return parsed.users && parsed.users.length ? parsed.users[0] : null;
  }
  if (res.getResponseCode() === 404) return null;
  throw new Error('Firebase kullanıcı sorgusu başarısız: ' + res.getResponseCode() + ' ' + res.getContentText());
}

function pbysApprovedProfile_(uid) {
  var token = pbysGoogleAccessToken_();
  var url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(PBYS_PROJECT_ID) + '/databases/(default)/documents/users/' + encodeURIComponent(uid);
  var res = UrlFetchApp.fetch(url, {
    method:'get',
    headers:{ Authorization:'Bearer ' + token },
    muteHttpExceptions:true
  });
  if (res.getResponseCode() !== 200) return false;
  var doc = JSON.parse(res.getContentText() || '{}');
  var fields = doc.fields || {};
  var approved = !!(fields.approved && fields.approved.booleanValue === true);
  var rejected = !!(fields.rejected && fields.rejected.booleanValue === true);
  return approved && !rejected;
}

function pbysFirebasePasswordUpdate_(uid, password) {
  var token = pbysGoogleAccessToken_();
  var url = 'https://identitytoolkit.googleapis.com/v1/projects/' + encodeURIComponent(PBYS_PROJECT_ID) + '/accounts:update';
  var res = UrlFetchApp.fetch(url, {
    method:'post',
    contentType:'application/json',
    headers:{ Authorization:'Bearer ' + token },
    payload:JSON.stringify({ localId:uid, password:password }),
    muteHttpExceptions:true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Firebase şifre güncellemesi başarısız: ' + res.getResponseCode() + ' ' + res.getContentText());
  }
}

function pbysSmsGonder_(telefon, mesaj) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ILETI_KEY');
  var hash = props.getProperty('ILETI_HASH');
  var sender = props.getProperty('ILETI_SENDER');
  if (!key || !hash || !sender) throw new Error('İletiMerkezi Script Properties eksik.');

  var payload = {
    request:{
      authentication:{ key:key, hash:hash },
      order:{
        sender:sender,
        sendDateTime:[],
        iys:'0',
        iysList:'BIREYSEL',
        message:{ text:mesaj, receipents:{ number:[telefon] } }
      }
    }
  };

  var res = UrlFetchApp.fetch('https://api.iletimerkezi.com/v1/send-sms/json', {
    method:'post',
    contentType:'application/json',
    payload:JSON.stringify(payload),
    muteHttpExceptions:true
  });
  console.log('PBYS SMS cevap: ' + res.getResponseCode() + ' ' + res.getContentText());
  return res.getResponseCode() === 200;
}

function pbysGoogleAccessToken_() {
  var raw = PropertiesService.getScriptProperties().getProperty('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON Script Property tanımlı değil.');
  var sa = JSON.parse(raw);
  if (!sa.client_email || !sa.private_key) throw new Error('Firebase servis hesabı JSON geçersiz.');

  var now = Math.floor(Date.now() / 1000);
  var header = pbysB64Url_(JSON.stringify({ alg:'RS256', typ:'JWT' }));
  var claim = pbysB64Url_(JSON.stringify({
    iss:sa.client_email,
    scope:'https://www.googleapis.com/auth/cloud-platform',
    aud:'https://oauth2.googleapis.com/token',
    iat:now,
    exp:now + 3600
  }));
  var unsigned = header + '.' + claim;
  var signature = Utilities.computeRsaSha256Signature(unsigned, sa.private_key);
  var assertion = unsigned + '.' + Utilities.base64EncodeWebSafe(signature).replace(/=+$/g, '');

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method:'post',
    payload:{
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:assertion
    },
    muteHttpExceptions:true
  });
  if (res.getResponseCode() !== 200) throw new Error('Google OAuth token alınamadı: ' + res.getContentText());
  var data = JSON.parse(res.getContentText() || '{}');
  if (!data.access_token) throw new Error('Google OAuth access_token yok.');
  return data.access_token;
}

function pbysB64Url_(text) {
  return Utilities.base64EncodeWebSafe(text, Utilities.Charset.UTF_8).replace(/=+$/g, '');
}

function pbysJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
