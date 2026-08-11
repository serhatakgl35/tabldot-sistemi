# PBYS V8.8 – Yetkili Firestore / Güvenli Oturum

Bu paket V8.7 özelliklerini korur ve giriş ekranında görülen `Missing or insufficient permissions` sorununun kalıcı çözümü için veri erişim akışını değiştirir.

## V8.8 güvenlik değişiklikleri
- Firebase Authentication doğrulanmadan Firestore okuması yapılmaz.
- `users` ve `settings` giriş ekranında sorgulanmaz.
- Oturumdan sonra koleksiyonlar rol ve özel yetkiye göre yüklenir.
- Personel kendi borç, ödeme, izin, yıllık tercih ve yoklama verisini görür.
- Yetkili roller gerekli yönetim koleksiyonlarını okuyabilir.
- `weeklyActivities` ve `dailyMenus` tüm onaylı personele okunur; yazma işlemleri `activity.manage` ve `menu.manage` özel yetkileri ile korunur.
- Firestore verileri localStorage içinde kalıcı tutulmaz; çıkışta yerel veri belleği temizlenir.
- İlk Admin oluşturma ekranı üretim güvenliği nedeniyle devre dışıdır; mevcut Admin hesabı kullanılmalıdır.

## Kurulum
GitHub'a en az `index.html`, `app.js`, `firebase.js`, `styles.css` dosyalarını yükleyin.

Ardından Firebase Console > Firestore Database > Rules bölümünde `firestore.rules` içeriğini yayınlayın.
Ayrıntılı adımlar `FIRESTORE_RULES_KURULUM.txt` dosyasındadır.

## Not
Mevcut Firestore koleksiyonlarını veya Firebase Authentication kullanıcılarını silmeyin.
