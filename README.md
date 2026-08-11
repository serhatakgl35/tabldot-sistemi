# PBYS V9.2 — Toplu Güncelleme

Bu sürüm V9.1 temel alınarak son toplu talepler uygulanmıştır.

## Ana Sayfa
- Karakol Komutanı: **Personel İzinleri → Günlük/Haftalık Faaliyetler → Yemek Menüsü**.
- Onay bekleyen izin talepleri Personel İzinleri kartında ilk bölümde gösterilir.
- Normal personel: **Günlük/Haftalık Faaliyetler → Yemek Menüsü**.
- `hasManagementPermission()` callback hatası düzeltildi; komutan/yönetim ana sayfa sıralaması artık role göre doğru çalışır.

## Yemek Menüsü
- Ana Sayfa yalnızca menüyü gösterir; oluşturma/düzenleme butonu kaldırıldı.
- Saat 19:00–23:59 arasında **Yarının Yemek Menüsü**, 00:00–18:59 arasında **Bugünün Yemek Menüsü** gösterilir.
- `Yemek Yönetimi` ayrı sayfa olarak eklendi.
- Aşçı rolü otomatik olarak `menu.manage` yetkisine sahiptir.
- Aşçı olmayan kullanıcıya da `menu.manage` özel yetkisi verilebilir.

## Yoklama
- Karakol Komutanı rolünden `attendance.manage` kaldırıldı.
- Yoklama Girişi: Admin, İdari İşler veya özel `attendance.manage` yetkisi olan kullanıcılar.
- Karakol Komutanı Yoklama Özeti'ni görmeye devam eder.

## Tabldot / Ödeme
- Tüm personel için salt okunur `Tabldot Bilançosu` sayfası eklendi.
- Personel giderleri, birim maliyeti, personel hesaplarını ve yıllık izin düşümlerini görebilir.
- Admin ve Tabldot Sorumlusu ödeme durumunu `Ödenmedi / Kısmi Ödendi / Ödendi` olarak elle düzeltebilir.
- Ödeme bildirimini onaylama/reddetme Admin ve Tabldot Sorumlusuna sınırlandı.
- Yıllık izin PDF önizlemesinde mobilde personel adı ilk sütunda sabit görünür.

## Çamaşırhane
- Randevu sistemi korunmuştur.
- Her makine için `Makineyi Başlat` + dakika girişi eklendi.
- Tüm kullanıcılar makinede kimin çamaşırının olduğunu, başlangıç/bitiş saatini ve canlı kalan süreyi görür.
- Süre bitince `Tamamlandı / Çamaşır bekliyor` durumu oluşur.
- Çamaşır sahibi veya yetkili `Makineyi Boşalttım` diyerek makineyi tekrar müsait yapar.
- Tarayıcı bildirim izni açıldığında süre sonunda `Çamaşır makinesi tamamlandı` bildirimi gösterilir.
- Yeni Firestore koleksiyonu: `laundryRuns`.
- `sw.js` service worker eklendi.

> Not: Mevcut tarayıcı bildirimi uygulama/sekme çalışırken güvenilir şekilde tetiklenir. Tarayıcı tamamen kapalıyken kesin zamanlı push için ayrıca Firebase Cloud Messaging + güvenli sunucu/Cloud Function kurulumu gerekir.

## Yükleme
GitHub deposundaki aşağıdaki dosyaları birlikte güncelleyin:
- `index.html`
- `styles.css`
- `app.js`
- `firebase.js`
- `sw.js`

`index.html` cache parametreleri V9.2 olarak güncellenmiştir.
