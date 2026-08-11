# PBYS V8.7

Bu sürüm V8.6 tabanı üzerine hazırlanmıştır.

## V8.7 yenilikleri
- Mobil yan menüde yalnızca menü içeriği kayar; kullanıcı kartı ve **Çıkış Yap** butonu ekranın altında sabit kalır.
- Her kullanıcının Ana Sayfasında **Haftalık Faaliyet Takvimi** görünür.
- Karakol Komutanı Ana Sayfası ilk iki bölüm: **Personel İzin Durumları** ve **Günlük ve Haftalık Faaliyetler**.
- `activity.manage` özel yetkisi verilen personel faaliyet ekleyebilir, düzenleyebilir ve silebilir.
- Her kullanıcının Ana Sayfasında **Bugünün Menüsü** (Sabah / Akşam) görünür.
- `menu.manage` özel yetkisi verilen personel günlük menüyü oluşturabilir ve düzenleyebilir. Menü yönetimi Aşçı rolüne otomatik bağlı değildir; özel yetkiyle verilir.
- Haftalık faaliyetler ve günlük menüler Firestore üzerinde `weeklyActivities` ve `dailyMenus` koleksiyonlarıyla cihazlar arasında senkronize edilir.
- Tabldot bilanço PDF önizlemesinde yıllık izinli personel kaybolmaz; izin tarih aralığı ve kaç gün tabldot dışında kaldığı açıkça gösterilir.
- `index.html` dosyasına V8.7 önbellek kırıcı parametreler eklendi (`?v=8.7`). Güncellemenin görünmesi için bu sürümde `index.html`, `app.js`, `styles.css` ve `firebase.js` birlikte yüklenmelidir.

## Yükleme
GitHub Pages ana dizinine şu dosyaları birlikte yükleyin:
1. `index.html`
2. `app.js`
3. `styles.css`
4. `firebase.js`
5. `README.md` (isteğe bağlı)

> Firebase/Firestore şu anda geliştirme ortamıdır. Gerçek personel ve mali verileri üretimde kullanmadan önce Firestore Security Rules kapatılmalıdır.
