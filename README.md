# Box Viewer (2D → 3D)
Sol tarafta 2D kutu görselleri (önden küçük önizleme), sağda Three.js ile canlı 3D kutu önizleme.

## Kurulum / Çalıştırma
1. Bu klasörü bir statik server ile aç:
   - VSCode Live Server
   - veya terminalde: `python -m http.server` (Python 3)
   - ya da: `npx serve`

2. Tarayıcıda `http://localhost:8000` (veya kullanılan port) adresine git.

3. Soldan SKU seç; sağda 3D model döner, yakınlaştır, çevir.

## Kendi verilerin
- `assets/boxes/<SKU>/` altında yüz görsellerini koy:
  - `front.jpg, back.jpg, left.jpg, right.jpg, top.jpg, bottom.jpg`
  - Eğer tek görsel kullanacaksan `single.jpg` yeterli.
- Ölçüler (mm) ve görsel yollarını `config.json` içine ekle.

## Notlar
- Eksik yüzlerde karton rengi fallback uygulanır.
- Görseller sRGB olarak alınır; karton için metalness=0, roughness=0.95 kullanıldı.
