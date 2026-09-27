// Resize locally and re-encode: EXIF/location metadata never enters the saved image.
export async function prepareRecordPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPEG, PNG veya WebP fotoğraf seçin.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Fotoğraf en fazla 10 MB olabilir.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.65, 0.45, 0.25]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= 350000) return { dataUrl, width: canvas.width, height: canvas.height };
    }
    throw new Error('Fotoğraf sıkıştırılamadı. Daha küçük bir görsel seçin.');
  } finally { bitmap.close(); }
}
