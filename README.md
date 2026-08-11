# PBYS – Çamaşır Sayacı Güncellemesi

Bu paket, en son PBYS dosya seti temel alınarak hazırlanmıştır.

## Değişiklikler
- “Çamaşır Randevusu” menü adı “Çamaşır Sayacı” olarak değiştirildi.
- Saatlik/günlük randevu tablosu ve “Randevu Al” işlemleri arayüzden tamamen kaldırıldı.
- Çamaşır sayacı/makine kullanım kartları bırakıldı.
- Sayacı başlatan kullanıcı çalışan sayacı durdurabilir.
- Sayacı başlatan kullanıcı çalışan, durdurulmuş veya tamamlanmış sayacı sıfırlayabilir.
- Başka kullanıcılar başkasının sayacını durduramaz veya sıfırlayamaz.
- Durdurulan sayaç kalan süreyi sabit olarak gösterir.
- Sıfırlama sonrası makine yeniden kullanılabilir hale gelir.
- Çamaşır raporu yalnızca sayaç kullanım kayıtlarını gösterir; randevu kayıtları yeni rapora dahil edilmez.
- Eski Firestore randevu verileri silinmez; yalnızca yeni arayüzde kullanılmaz.

## Yükleme
GitHub/deploy ana dizinindeki aşağıdaki dosyaları bu pakettekilerle değiştirin:
- index.html
- app.js
- styles.css
- firebase.js
- sw.js

Tarayıcı önbelleği için dosya sürüm parametreleri 9.2.4 olarak güncellenmiştir.


## V9.2.5 – Yıllık İzin Tercih Yönetimi
- Admin, Sistem Ayarları ekranından yıllık izin tercihlerini açıp kapatabilir.
- Sistem kapalıyken personel mevcut tercihini görür ancak yeni kayıt/güncelleme yapamaz.
- Admin, seçili planlama yılındaki tüm tercihleri ve plan sonuçlarını topluca sıfırlayabilir.
- Personel kendi tercihi için “Sıfırlama Talebi Gönder” işlemini kullanabilir.
- Personel talebi doğrudan tercihi silmez; mevcut tercih Admin kararına kadar korunur.
- Admin, Yıllık İzin Anket Sonuçları ekranından talebi “Onayla ve Sıfırla” veya “Reddet” ile sonuçlandırır.
- Onaylanan bireysel sıfırlamada yalnızca ilgili personelin seçili yıla ait tercihi ve plan sonucu temizlenir.

Tarayıcı önbellek sürümü 9.2.5 olarak güncellenmiştir.
