# PBYS V9.4.2 — İzin Özeti, Takvim Renkleri, A-Z ve Arama

## V9.4.2 yenilikleri
## V9.4.2 ek düzenleme — Raporlarda A-Z
- Yıllık İzin Raporu > İzin Bakiyeleri personel adına göre Türkçe A-Z sıralanır.
- Yıllık İzin Raporu > Kullanılan İzin Tarihleri personel adına göre Türkçe A-Z gruplanır.
- Borç/Tahsilat, İzin Planlama, Çamaşır Sayaç ve Aylık Bilanço raporlarındaki personel satırları da Türkçe A-Z sıralanır.
- Tarih bazlı Yemek Katılım ve Gider listelerinde doğal kronolojik sıralama korunur.

- Personel izin detayında kullanılan Yıllık İzin, Sağlık Raporu, Mazeret, Günübirlik, Yol ve diğer izinler ayrı toplamlarla gösterilir; yıllık kalan bakiye görünür.
- İzin takviminde yalnız onaylı/rapor kayıtları yer alır; renkler onay durumuna göre değil izin türüne göre belirlenir.
- Büyük takvim/yazdırma görünümünde de aynı izin türü renkleri ve açıklama anahtarı kullanılır.
- Personel Durumları, Bugünkü Detay, Konum Dağılımı, Aşçı personel listesi ve Haftalık Yoklama personel isimleri Türkçe A-Z sıralıdır.
- Bu listelerin üstüne anlık arama/filtre kutuları eklenmiştir.

## V9.4.0 yenilikleri
- İzin Yönetimi içindeki mevcut mobil ay takvimi aynen korunur.
- Takvim kartına **Yeni Sekmede Aç** düğmesi eklendi.
- Yeni sekmede takvim geniş, masaüstü odaklı büyük görünümde açılır.
- Büyük görünümde Önceki Ay / Bu Ay / Sonraki Ay gezinmesi bulunur.
- Hem ana ekranda hem büyük görünümde **Yazdır / PDF** özelliği vardır.
- Yazdırma düzeni A4 yatay sayfaya optimize edilmiştir.
- Baskıda ay içindeki izin kayıtları isim, izin türü ve tarih aralığıyla ayrıca listelenir.

## V9.3.9 — İzin kayıt ekranı

- Geçmiş / Yönetici İzin Kaydı ekranındaki **Personel** açılır listesi Türkçe alfabetik **A-Z** sıralanır.
- İzin türlerine **Sağlık Raporu** eklendi. Mevcut **Sağlık İzni** kaydı geriye dönük uyumluluk için korunur.
- **İzin gün sayısı** alanı eklendi.
- Başlangıç tarihi + gün sayısı girildiğinde **Bitiş tarihi otomatik hesaplanır**. Gün hesabı başlangıç günü dahil yapılır: 10 gün = başlangıç + 9 gün.
- Bitiş tarihi elle değiştirilirse gün sayısı otomatik yeniden hesaplanır.
- **Günübirlik İzin** seçildiğinde gün sayısı otomatik 1 olur ve bitiş tarihi başlangıç tarihiyle eşitlenir.
- V9.3.8 mobil takvim ve Aşçı yıllık izin düzeltmeleri korunmuştur.

## V9.3.9 — Mobil izin takvimi + Aşçı yıllık izin düzeltmesi

- İzin Yönetimi ay takvimi mobilde 7 sütun ekran içine sığacak şekilde kompaktlaştırıldı.
- Aynı güne birden fazla izin düşerse ilk isim gösterilir, kalanlar `+N` olarak açılır.
- Aşçı ekranında **onaylı Yıllık İzin**, yemek tercihinden daha yüksek önceliğe alındı.
- Yıllık izinli personel artık `Yemeyecek` yerine `Yıllık izin` grubuna düşer ve hazırlanacak yemekten çıkarılır.
- Eski kayıtlardaki kullanıcı no / tarih / durum biçimlerine karşı izin eşleştirmesi daha dayanıklı hale getirildi.
- Aşçı rolünün `leaveRequests` ve `attendance` koleksiyonlarını okuyabilmesi için Firestore Rules açıkça `get/list` olarak tanımlandı.

**Önemli:** `firestore.rules` GitHub'a yüklemek tek başına Firebase kurallarını etkinleştirmez. Firebase Console > Firestore Database > Rules bölümünde bu dosyanın içeriğini ayrıca yayımlayın.


## V9.3.7 ek düzenlemeleri

- Personel Listesi artık ad-soyada göre Türkçe **A-Z** sıralanır.
- İşlem butonları aynı hücre içinde satır kırarak yerleşir; sağ taraftan sayfa dışına taşmaz.
- Personel tablosunun sütun genişlikleri masaüstü ve mobil yatay kaydırma için dengelendi.

- **Aşçı Yemek Ekranı**, yemek tercihlerine ek olarak aynı tarihin personel durumunu da okur.
- Personel tablosuna **Personel Durumu** sütunu eklendi: Mevcut, Yıllık İzin, Mazeret İzni, Yol İzni, Raporlu / İstirahatli, Görevli, Geçici Görevli, Kurs / Eğitim, Sevkli, Nöbet İstirahati vb.
- Durum verisi önce **Yoklama** kaydından, yoksa onaylı izin/rapor kaydından, hiçbiri yoksa **Mevcut** varsayımından alınır.
- Aşçı ekranının üstüne Yıllık İzinli, Raporlu/İstirahatli, Görev/Geçici/Kurs/Sevk ve Mazeret/Yol İzni sayaçları eklendi.
- İsim listesi pencerelerinde personelin yemek durumu yanında günlük personel durumu da gösterilir.
- **Aşçı bu verileri yalnızca okur; yoklama veya izin kaydı düzenleyemez.**
- Firestore kuralları Aşçı rolünün `attendance` ve izin kayıtlarını okuyabilmesi için güncellendi.

## V9.3.4 düzenlemeleri

- **Aşçı rolü**, Aşçı Yemek Ekranında seçili gün için tüm aktif personeli ad/görev bilgisiyle ve Sabah-Akşam yemek durumlarıyla görür.
- **Aşçı rolü `menu.manage` yetkisini otomatik taşır**; günlük yemek menüsünü düzenleyebilir.
- **Yemek Tercihim** ekranı büyük kartlar yerine kompakt satır + açılır liste yapısına geçirildi.
- Personelin yemek tercih listesinde **bugünden eski tarihler gösterilmez**. Dünün tercihi bugün listede görünmez; geçmiş kayıtlar rapor/bilanço geçmişi için veritabanında korunur.
- Personel yemek ekranında geçmiş haftaya geri gidilemez; gelecek haftadan bu haftaya dönülebilir.


Bu sürüm **PBYS V9.3.2 Faaliyet Detay** tabanı üzerine hazırlanmıştır.

## Yeni düzenlemeler

### 1. SMS şifre değiştirme korunuyor
- Giriş ekranındaki **Şifremi Unuttum / SMS ile Şifre Sıfırlama** bölümü aynen kalır.
- Web App JSON yerine HTML döndürürse artık ham `Unexpected token '<'` hatası yerine
  anlaşılır servis/dağıtım uyarısı gösterilir.

### 2. Admin panelinden geçici şifre
- **Personel Listesi** içindeki her aktif personelde Admin için **Şifre Sıfırla** butonu eklendi.
- Admin en az 6 karakterlik geçici şifreyi kendisi yazabilir veya **Rastgele Şifre Oluştur** kullanabilir.
- İşlem sunucu tarafında Admin Firebase ID token'ı ve Firestore rolü doğrulandıktan sonra
  Firebase Authentication parolasını değiştirir.
- Personel geçici şifre ile giriş yaptığında kapatılamayan **Geçici Şifrenizi Değiştirin**
  penceresi açılır ve kendi şifresini belirlemeden PBYS kullanımına devam edemez.
- Normal **Profilim > Şifremi Değiştir** işlevi de korunur.

### 3. Yıllık izin 30 + 2 = 32 gün
- Personelin temel hakkı **30 gün yıllık izin + 2 gün yol izni = 32 gün** olarak birlikte hesaplanır.
- Yeni izin girişinde ayrı **Yol İzni** türü kaldırıldı.
- **Yıllık İzin** kaydında personelin kullanılmamış yol izni varsa, en fazla kalan yol hakkı
  önce otomatik olarak yol bakiyesinden; kalan günler yıllık izin bakiyesinden düşer.
- Örnek: Yol hakkı 2 gün duruyorsa 12 günlük yıllık izin kaydı kullanıldıkça
  **2 gün yol + 10 gün yıllık izin** olarak hesaplanır.
- Yol hakkı bittikten sonraki yıllık izinler tamamen 30 günlük yıllık izin bakiyesinden düşer.
- Eski sürümlerde ayrı oluşturulmuş **Yol İzni** kayıtları silinmez; geriye dönük uyumluluk için hesaba katılır.
- Toplam onaylı/kullanılmış izin 32 günlük tanımlı hakkı aşarsa yeni yıllık izin onayı engellenir.
- Ana sayfa, İzinlerim, Personel Listesi ve izin raporu toplam hak/kalan ile yıllık-yol dağılımını gösterir.

## Güncellenecek dosyalar

GitHub/Vercel projenizde şu dosyaları birlikte değiştirin:

- `index.html`
- `styles.css`
- `app.js`
- `firebase.js`
- `firestore.rules`
- `sw.js`

Google Apps Script tarafında ayrıca:

- `PBYS_SMS_SIFRE_SIFIRLAMA.gs`

dosyasını güncelleyin ve **New version** ile Web App'i yeniden dağıtın.

Ayrıntılı Apps Script adımları için `PBYS_SMS_KURULUM.txt` dosyasını okuyun.

## Sürüm

Önbellek/asset sürümü: **9.4.2**


## V9.3.7 — Aşçı rolü otomatik yetkileri
- `Aşçı` rolü için ayrıca **Özel Yetki** seçmeye gerek yoktur.
- Aşçı, Aşçı Yemek Ekranı'nda **tüm onaylı/aktif personeli** otomatik görür.
- Seçili günün **yıllık izin, rapor/istirahat, görev, geçici görev, kurs/eğitim, sevk, mazeret/yol izni ve yoklama durumları** salt okunur gösterilir.
- Aşçı, `Yemek Yönetimi` ekranında günlük yemek menüsünü otomatik düzenleyebilir.
- Firestore kullanıcı sorgusunda aşçı için `approved == true` güvenli geri dönüş sorgusu eklenmiştir; böylece kullanıcı listesi yalnızca aşçının kendi hesabına düşmez.
