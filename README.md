# PBYS V9.2

Bu sürüm V9.1 üzerine hazırlanmıştır.

## Değişiklikler
- Karakol Komutanı rolünden Yoklama Girişi yetkisi kaldırıldı; Yoklama Özeti görüntüleme devam eder.
- Ana Sayfa üzerindeki Menü Oluştur / Düzenle butonu kaldırıldı; ana sayfa menüyü yalnızca görüntüler.
- Aşçı Yemek Ekranı, “Aşçı İşlemleri” olarak güncellendi.
- Günlük Menü Yönetimi Aşçı İşlemleri ekranına taşındı.
- `menu.manage` özel yetkisi olan kullanıcı, Aşçı rolü olmasa dahi Aşçı İşlemleri ekranından menü oluşturabilir/düzenleyebilir.
- Kayıtlı menü tarih seçilerek tekrar yüklenir ve düzenlenebilir.
- Ana Sayfada 00:00–18:59 arasında “Bugünün Yemek Menüsü” gösterilir.
- 19:00–23:59 arasında ertesi günün menüsü “Yarının Yemek Menüsü” başlığıyla gösterilir.
- Sayfa açık kalırsa 19:00 ve 00:00 geçişlerinde menü kartı otomatik yenilenir.
- V9.1 mobil Rol / Yetki modal kaydırma ve Admin personel silme düzenlemeleri korunur.

GitHub'a `index.html`, `app.js`, `styles.css` dosyalarını birlikte yükleyin. `firebase.js` değişmedi ancak tam paket içinde yer alır.
