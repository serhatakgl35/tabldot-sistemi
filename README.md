# Personel Yaşam ve Tabldot Sistemi – İlk Prototip

Bu paket, 35 kişilik çalışma ortamı için hazırlanan telefon uyumlu çalışan ön yüz prototipidir.

## İçerdiği modüller

- Telefon numarası ve şifre ile giriş
- Admin onaylı üyelik başvurusu
- Admin, müdür ve personel rolleri
- Haftalık kahvaltı / öğle / akşam yemek seçimi
- Gider kayıtları ve yemek yönetimi
- Borç, ödeme bildirimi ve IBAN ekranı
- Bilanço özeti
- Yıllık izin talebi, onay/red ve takvim görünümü
- Çamaşır makinesi randevu paneli
- CSV rapor indirme
- Yerel JSON yedekleme

## Demo hesapları

- Admin: `0500 000 00 01` / `123456`
- Müdür: `0500 000 00 02` / `123456`
- Personel: `0500 000 00 03` / `123456`

## Çalıştırma

`index.html` dosyasını Chrome veya Edge ile açın.

Veriler bu prototipte tarayıcının localStorage alanında tutulur. Bu nedenle gerçek kullanıma açılmadan önce sunucu tarafı kimlik doğrulama, veritabanı, dosya yükleme, erişim yetkileri ve yedekleme sistemi kurulmalıdır.

## Canlı sistem için önerilen altyapı

- Next.js
- Supabase PostgreSQL
- Supabase Auth veya özel telefon/şifre doğrulama
- Supabase Storage (dekont ve belgeler)
- Vercel dağıtımı

