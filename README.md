# PBYS V8.5 Test

Bu sürüm V8.4 üzerine aşağıdaki düzenlemeleri ekler:

- Karakol Komutanı girişinde **İzin Talepleri** ana sayfanın en üstünde gösterilir.
- Bekleyen izin yoksa komutan yine "Onay bekleyen izin talebi bulunmuyor" bilgisini görür.
- Yemek tercihleri mali hesaptan ayrıldı: **Yemeyeceğim** aşçı sayısını azaltır fakat tabldot borcunu azaltmaz.
- Ortak tabldot giderinden yalnızca **onaylı yıllık izin** günleri düşülür.
- Tabldot hesabı günde iki öğün (Sabah + Akşam) üzerinden hesaplanır.
- Tabldot Bilanço mobil görünümünde kart ve tablo genişlikleri standartlaştırıldı.
- Tabldot Bilanço sayfasına **Ödeme Onayı** bölümü eklendi.
- Yetkili kullanıcı ödeme bildirimini Onayla / Reddet işlemiyle yönetebilir.
- Onaylanan ödeme ilgili dönem borcunun ödenen tutarına işlenir.
- Ödeme bildirim geçmişi bilanço ekranında görünür.

Firestore verileri korunur; mevcut koleksiyonlar kullanılmaya devam edilir.


## V8.6
- Yıllık izin planlaması Kış ve Yaz dönemi olarak ayrıldı.
- Kış dönemi: Ocak-Mayıs ve Ekim-Aralık, 10 gün, iki tercih.
- Yaz dönemi: Haziran-Eylül, 20 gün, iki tercih.
- Personelden toplam dört tercih alınır.
- Yönetim anketleri, karar tabloları ve izin planlama PDF raporu Kış/Yaz olarak ayrı gösterilir.

Not: V8.6, önceki tek 1./2. tercih yapısından Kış 1-2 ve Yaz 1-2 olmak üzere toplam 4 tercihe geçer. Eski test tercihleri mümkün olduğunca dönemine göre otomatik taşınır; eksik kalan tercihleri personel formdan tamamlar.
