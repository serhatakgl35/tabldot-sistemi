# PBYS – Üretime Alma Kontrol Listesi

## 1. Önce mevcut veriyi yedekle
Admin hesabı ile PBYS > Sistem Ayarları > JSON Yedek İndir.

## 2. Admin hesabını doğrula
Firebase Console > Firestore Database > Data > users altında kendi kullanıcı belgeni aç.
Şunlar bulunmalı:
- approved: true
- rejected: false
- role: admin (veya roles içinde admin)
- roles: staff, admin

Bu kontrol yapılmadan Security Rules yayımlanırsa yönetim erişimini kaybetme riski vardır.

## 3. Firestore Security Rules yayımla
Firebase Console > Firestore Database > Rules.
Bu paketteki `firestore.rules` dosyasının tamamını yapıştır ve Publish/Yayınla.

## 4. Authentication ayarları
Firebase Console > Authentication:
- Email/Password giriş yöntemi açık olmalı.
- Settings > Authorized domains: `gencservi.com.tr` ve `www.gencservi.com.tr` ekli olmalı.
- Mümkünse Password policy üzerinden daha güçlü parola şartı etkinleştir.

## 5. GitHub Pages dosyaları
GitHub `main` / root dizininde yeni sürümü yayımla.
Ana web dosyaları:
- index.html
- app.js
- styles.css
- firebase.js
- CNAME
- .nojekyll

Eski `app-v88.js`, `styles-v88.css`, `firebase-v88.js` gibi artık kullanılmayan dosyalar kaldırılabilir.

## 6. Adres kontrolü
`https://gencservi.com.tr` açıldığında giriş ekranında `Sürüm 10.0 · Üretim` yazmalıdır.

## 7. Rol kontrolü
Gerçek veri girişinden önce mevcut hesaplarla aşağıdaki erişimleri doğrula:
- Personel: sadece kendi kişisel işlemleri
- Aşçı: mutfak sayıları
- Tabldot Sorumlusu: yemek maliyeti / bilanço / tahsilat
- İdari İşler: personel / yoklama / izin / yemek / mali yönetim
- Karakol Komutanı: izin talepleri, personel durumu, yıllık planlama
- Admin: tüm sistem

## 8. Gerçek kullanım
Yukarıdaki kontroller tamamlandıktan sonra personel ve mali kayıtları gerçek kullanım için girebilirsin.
