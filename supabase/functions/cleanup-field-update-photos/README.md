# Saha Akışı fotoğraf temizliği

Bu Edge Function, Supabase Dashboard > Integrations > Cron altında
`cleanup-field-update-photos-daily` işiyle canlıya bağlanmıştır. İş yarım kalan
yüklemeleri ve değiştirilen fotoğrafları gecikmeden temizlemek için her saat
`17 * * * *` ifadesiyle çalışır. İş aktif ve Edge Function'a
publishable key'i hem `apikey` hem `Authorization: Bearer` başlıklarıyla POST gönderir.
Function'ın service role anahtarı
yalnızca Supabase çalışma ortamındaki secret'tan okunur; tarayıcıya açılmaz.

Mevcut zamanlamayı güvenli biçimde doğrulamak veya yeniden kurmak için proje
kökünde `npm run supabase:cron:field-photos` çalıştırılır. Komut doğru ve aktif
işi bulursa hiçbir değişiklik yapmaz; eksik veya farklı ayarlıysa tek bir
`cleanup-field-update-photos-daily` işi olacak şekilde eşitler. `.env.local`
ve `.env.supabase.local` yerel kalmalıdır; bu komutun çıktısı gizli değerleri
göstermez.

İşlem idempotenttir: önce `record_photo_gc` kuyruğundaki yarım kalan, değiştirilmiş
ve kaldırılmış dosyaları temizler. Ardından önceki güne ait Saha Akışı fotoğraflarını
en eski kayıttan başlayarak sınırlı gruplar hâlinde kaldırır ve
`field_updates.photo_path` alanını boşaltıp `photo_removed` işaretini günceller.
Metin, konum ve notlar korunur. Hatalı satırlar sonraki çalıştırmaya bırakılır.
