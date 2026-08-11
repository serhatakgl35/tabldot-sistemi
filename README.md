# PBYS V9.3 – Firebase giriş güvenlik düzeltmesi

- Giriş ekranı açılırken artık anonim Firestore `settings` / `users` sorgusu yapılmaz.
- Önce Firebase Authentication oturumu kontrol edilir; Firestore yalnızca oturum varsa okunur.
- Bu sayede güvenli Firestore kurallarında görülen `Missing or insufficient permissions` uyarısı giriş ekranında tetiklenmez.
- Firestore permission-denied hataları Türkçe ve daha anlaşılır gösterilir.
- V9.2 yemek menüsü, faaliyet, modern tasarım ve diğer özellikler korunur.

> Not: Girişten sonra aynı hata görülürse Firestore Rules içinde özellikle `weeklyActivities` ve `dailyMenus` koleksiyonları için yetki kontrolü gerekir.
