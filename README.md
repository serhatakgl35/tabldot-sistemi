# PBYS V9.3.0 — Toplu Güncelleme

Bu paket V9.2.6 tabanı üzerine hazırlanmıştır. Önceki yıllık izin tercih yönetimi ve Karakol Komutanı yetkileri korunmuştur.

## Bu pakette yapılanlar

### Yoklama Özeti
- Haftalık görünümde M, MS, N, Nİ, R vb. durum rozetleri `attendance.manage` yetkisi olan kullanıcılar için tıklanabilir hale getirildi.
- Rozete tıklanınca doğrudan ilgili personelin ilgili güne ait yoklama düzenleme ekranı açılır.
- Haftalık tablonun gün/tarih başlıkları aşağı kaydırırken üstte sabit kalır; personel sütunu solda sabit kalır.
- “Diğer durumda” ana kartı kaldırıldı.
- Toplam / Mevcut / İzinli ana kartlarının altına Nöbetçi, Mesai, Nöbet İstirahati, Raporlu/İstirahatli, Görevli, Geçici Görevli, Kurs/Eğitim, Sevkli vb. küçük durum kartları eklendi.
- Küçük durum kartlarında kişi sayısı ve toplam aktif personele göre yüzde oranı gösterilir.
- Mevcudiyet hesabı `Mevcut + Mesai + Nöbetçi + Nöbet İstirahati` toplamı üzerinden gösterilir.
- Bugünkü detay ve konum dağılımında personel adları virgülle yan yana değil, alt alta gösterilir.

### Çamaşır Sayacı
- Randevu sistemi kullanılmaz; sayaç yapısı korunur.
- Sayacı başlatan personelin adı kullanım kaydına ayrıca yazılır.
- Personelin kendi başlattığı sayacı durduramama / sıfırlayamama Firestore yetki hatası giderildi.
- Gün içinde makineyi kullanan personeller başlangıç ve bitiş/durdurma saatleriyle “Bugünkü Makine Kullanımları” bölümünde listelenir.
- Sayaç tamamlandığında veya sıfırlandığında kullanım geçmişi silinmez.
- Süresi bitmiş sayaç makineyi gereksiz yere bloke etmez.
- Eski kayıtlarda kullanıcı adı kayıt içine daha önce yazılmadıysa isim bulunamayabilir; V9.3.0 ile başlayan yeni kullanımlarda isim kaydı korunur.

### Oturum ve geri tuşu
- Firebase Authentication yerel kalıcılığı güçlendirildi; sayfa yenilemede mevcut oturumun geri yüklenmesi beklenir.
- PBYS içindeki sayfa geçişleri tarayıcı geçmişine yazılır.
- Telefon / tarayıcı geri tuşu uygulama içindeki önceki PBYS ekranına döner.
- Ana sayfada yanlışlıkla geri tuşuna basılması için uygulama içi koruma eklendi.

### Haftalık Faaliyetler
- Düzenle / Sil butonları faaliyet metninin üzerine binmeyecek şekilde ayrı alt satıra alındı.

### Yıllık İzin Tercihi
- V9.2.6 özellikleri korunur: Admin ve Karakol Komutanı tercih sistemini açıp kapatabilir, toplu sıfırlama yapabilir ve personelin sıfırlama taleplerini onaylayıp reddedebilir.
- Firestore Rules içinde Karakol Komutanının `leavePreferencesOpen` ayarını değiştirebilmesi için eksik güvenlik kuralı tamamlandı.

### SMS ile Şifre Sıfırlama
- Giriş ekranına “Şifremi Unuttum” bölümü eklendi.
- Telefon numarasına 6 haneli SMS kodu gönderme ve kodla yeni Firebase Authentication şifresi belirleme istemci akışı eklendi.
- SMS/Firebase yönetici anahtarları web sitesine veya GitHub'a yazılmaz.
- `PBYS_SMS_SIFRE_SIFIRLAMA.gs` sunucu tarafı Apps Script kodu ve `PBYS_SMS_KURULUM.txt` kurulum yönergesi pakete dahildir.

## GitHub'a yüklenecek dosyalar
Aşağıdakileri sitenin ana dizinindeki aynı isimli dosyaların üzerine yükleyin:

1. `index.html`
2. `app.js`
3. `styles.css`
4. `firebase.js`
5. `sw.js`

## Firebase Rules — ÖNEMLİ
`firestore.rules` dosyası da güncellendi. Özellikle normal personelin kendi çamaşır sayacını durdurup sıfırlayabilmesi için bu dosyanın Firebase'e yayımlanması gerekir.

Firebase Console > Firestore Database > Rules bölümünden dosya içeriğini yayımlayabilir veya Firebase CLI kullanıyorsanız:

`firebase deploy --only firestore:rules`

## SMS kurulumu — ÖNEMLİ
Site dosyalarını yüklemek SMS şifre sıfırlamayı tek başına tamamlamaz; şifre Firebase Authentication üzerinde sunucu yetkisiyle değiştirildiği için Apps Script tarafı bir kez kurulmalıdır.

`PBYS_SMS_KURULUM.txt` içindeki adımları uygulayın. Mevcut Kantin10 SMS Apps Script projesine PBYS handler'ı eklenirse aynı Web App URL'si kullanılabilir ve mevcut Kantin10 işlemleri korunur.

**İletiMerkezi API anahtarı/hash ve Firebase servis hesabı JSON'u hiçbir zaman GitHub'a yüklemeyin.** Bunlar yalnızca Apps Script > Script Properties içinde tutulmalıdır.

## Önbellek
Statik dosya sürümü ve service worker önbelleği `9.3.0` olarak güncellendi.
