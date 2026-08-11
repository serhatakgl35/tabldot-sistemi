# PBYS V10.0 – Üretim Sürümü

Bu paket demo/test paketi değildir. `gencservi.com.tr` üzerinde gerçek kullanım için hazırlanmıştır.

## Web sitesinde kullanılacak ana dosyalar
- `index.html`
- `app.js`
- `styles.css`
- `firebase.js`
- `CNAME`
- `.nojekyll`

`CNAME` değeri: `gencservi.com.tr`

## Firebase güvenlik dosyaları
- `firestore.rules` — rol/yetki bazlı üretim Firestore kuralları
- `firebase.json` — Firebase CLI ile rules dağıtımı için
- `.firebaserc` — Firebase proje eşlemesi (`gencservi-5d47e`)

## Üretim güvenliği
- İlk-admin/kurulum ekranı kaldırılmıştır.
- Yeni üyelikler yalnızca `Personel` rolünde ve `onay bekliyor` durumunda kayıt olabilir.
- Kullanıcı kendi rolünü, onay durumunu, izin hakkını veya planlama puanını yükseltemez.
- Normal personelin Firestore sorguları kendi kişisel verileriyle sınırlandırılmıştır.
- Aşçı/Tabldot tarafı görev için gerekli ortak verileri görür; mali ve yönetim yazmaları yetkiye bağlıdır.
- Personel tarafından arıza bildirimi oluşturulabilir; cihazın sistem durumunu değiştirme yetkisi personele verilmez.
- Yönetim işlemleri rol/yetki bazlı Firestore Security Rules ile korunacak şekilde hazırlanmıştır.

## YAYINA ALMADAN ÖNCE ZORUNLU
1. Firestore `users` koleksiyonunda mevcut admin hesabının `approved: true` olduğundan ve `roles` dizisinde `admin` bulunduğundan emin olun.
2. Firebase Console > Firestore Database > Rules bölümünde `firestore.rules` içeriğini yayımlayın.
3. Firebase Authentication > Sign-in method altında Email/Password açık olmalıdır.
4. Firebase Authentication > Settings > Authorized domains bölümüne `gencservi.com.tr` ve `www.gencservi.com.tr` ekleyin.
5. GitHub Pages üzerinde yeni dosyaları yayımlayın ve `https://gencservi.com.tr` üzerinden giriş yapın.
6. Gerçek personel verisi girmeden önce Admin, Personel, Aşçı, Tabldot Sorumlusu, İdari İşler ve Karakol Komutanı hesaplarıyla yetki kontrolünü tamamlayın.

## Sürüm kontrolü
Giriş ekranında ve sol menüde `Sürüm 10.0 · Üretim` görünmelidir.

## Temel iş kuralları
- Karakol Komutanı ana sayfasında önce izin talepleri, sonra bugünkü personel durumu gösterilir.
- Yıllık izin tercihi: Kış 1 + Kış 2 (10 gün), Yaz 1 + Yaz 2 (20 gün).
- Yemek sistemi: Sabah + Akşam.
- `Yemeyeceğim` seçimi yalnızca aşçının hazırlık sayısını düşürür; ortak tabldot giderinden düşürmez.
- Tabldot maliyetinden yalnızca onaylı yıllık izin günleri çıkarılır.
