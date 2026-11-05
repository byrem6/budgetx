# Portföy · Yatırım Takibi

Altın, döviz, kripto ve diğer varlıklar için **mobil uygulama deneyimine** sahip,
**çevrimdışı çalışan**, **Microsoft Fluent (Office 365 / Dynamics 365) tasarım diline**
sadık yatırım portföy takip uygulaması.

Uygulama tamamen **statiktir**: sunucu, veritabanı veya hesap gerektirmez. Tüm veriler
cihazın yerel deposunda (IndexedDB / localStorage) tutulur; **hiçbir veri sunucuya gönderilmez.**
Bu sayede doğrudan **GitHub Pages** üzerinden yayınlanabilir.

---

## 📱 Mobil uygulama deneyimi (Dynamics Mobile tarzı)

| Özellik | Açıklama |
|---|---|
| **Renkli uygulama çubuğu** | Üstte marka gradyanlı app bar: hamburger (çekmece), başlık, arama, **+** (yeni işlem), **⋮** (taşma menüsü) |
| **Alt sekme çubuğu** | 5 sekme, ikon + etiket, aktif sekmede üst çubuk ve marka rengi; `safe-area-inset` destekli |
| **Yüzen eylem düğmesi (FAB)** | Sağ altta yeni işlem düğmesi, sekme çubuğunun üzerinde |
| **Sabit alt eylem çubuğu** | Veri girişi ekranında "Kaydet / Yeni ekle" düğmeleri her zaman başparmağın altında |
| **Alt panel (bottom sheet)** | Tüm diyaloglar mobilde alttan kayarak açılır, tutamak ve tam genişlik butonlarla |
| **Sekmeler arası kaydırma** | İçeriğin üzerinde sağa/sola kaydırma ile sekme değiştirme (yatay kaydırılabilir alanlar hariç) |
| **Taşma menüsü** | Kurları yenile, tema, JSON yedeği indir / geri yükle, hakkında |
| **Dokunma hedefleri** | Buton ≥ 44 px, girişler 46 px, çipler ve liste satırları geniş |
| **Güvenli alan (notch)** | `env(safe-area-inset-*)` ile app bar, alt çubuk ve eylem çubuğu uygun konumlanır |
| **Koyu tema** | Otomatik / açık / koyu; sistem tercihini izler |
| **PWA** | Ana ekrana eklenebilir, çevrimdışı çalışır, yükleme önerisi sunar |

---

## ✨ Özellikler

### Genel Bakış (Dashboard)
- **Hero kartı:** toplam portföy değeri, net kâr (₺ ve %), maliyet, net yatırım, gerçekleşen kâr, komisyon
- **KPI kartları:** en çok kazandıran / kaybettiren varlık, bu ay alım, varlık sayısı
- **Hedefler:** varlık veya toplam portföy için hedef tutar, ilerleme çubuğu ve kalan tutar
- **Portföy değeri grafiği:** 6A / 12A / 24A / Tümü aralıkları, değer ve maliyet serisi, dokunmatik ipuçları
- **Dağılım halkası:** varlık payları, dokununca geçmişe filtreli gider
- **Aylık alış grafiği**, **varlık listesi** ve **son işlemler**

### Veri Girişi
- Alış **ve** satım kaydı, 12 hazır varlık + kendi varlığınızı ekleme
- Miktar için hızlı artırma çipleri (gr / birim / kripto bazlı)
- **"Güncel kur"** ile tek dokunuşla piyasa fiyatını forma doldurma
- Canlı özet: toplam tutar, birim fiyat, portföydeki miktar, işlem sonrası miktar ve **yeni ortalama maliyet**
- Hesap/kurum etiketleri, not, komisyon, tarih
- **"Kaydet ve yeni ekle"** ile hızlı (till benzeri) çoklu giriş

### Geçmiş
- Varlık / alış-satış / hesap / metin araması ile filtreleme, 4 farklı sıralama
- Aya göre gruplanmış liste ve aylık net tutar
- Satır içinden düzenleme, silme ve **"Geri al"** (undo) toast'u
- **CSV dışa aktarma** (Türkçe Excel uyumlu, `;` ayraç, BOM)

### Analiz
- Dönem seçimli değer gelişimi grafiği
- Varlık performans tablosu (miktar, ort. alış, güncel, değer, kâr/zarar, %)
- Aylık net yatırım grafiği (alış − satış)
- Hesap dağılımı halkası, gerçekleşen kâr/zarar dökümü

### Ayarlar
- Açık / koyu / otomatik tema
- Görüntüleme para birimi (₺, $, €, £) — tüm tutarlar anında dönüşür
- Altın primi (%), otomatik kur yenileme
- **Her varlık için elle fiyat girişi** (kuralar alınamadığında)
- Hedef tanımlama, hesap/kurum yönetimi, varlık ekleme/gizleme/renklendirme
- JSON yedek indirme / geri yükleme, tüm verileri silme
- **İsteğe bağlı 4 haneli uygulama kilidi** (SHA-256, Web Crypto)

---

## 📁 Klasör yapısı

```
.
├── index.html                 # uygulama kabuğu (kabuk + yükleme ekranı)
├── manifest.webmanifest       # PWA manifesti
├── sw.js                      # service worker (çevrimdışı önbellek)
├── server.js                  # yalnızca yerel geliştirme için statik sunucu
├── .nojekyll                  # GitHub Pages için
└── assets/
    ├── css/app.css            # Fluent tasarım belirteçleri + bileşenler
    ├── icon.svg, icon-maskable.svg
    └── js/
        ├── app.js             # yönlendirme, durum yönetimi, tema, kilit
        ├── util.js            # biçimlendirme ve DOM yardımcıları
        ├── store.js           # IndexedDB / localStorage veri katmanı
        ├── catalog.js         # varlık kataloğu + ayar varsayılanları
        ├── rates.js           # piyasa verisi (döviz / metal / kripto)
        ├── calc.js            # portföy muhasebesi (ortalama maliyet)
        ├── charts.js          # bağımlılıksız SVG grafikler
        ├── ui.js              # ikon, toast, modal, onay diyaloğu
        └── views/
            ├── dashboard.js
            ├── entry.js
            ├── history.js
            ├── analytics.js
            └── settings.js
```

## ▶️ Çalıştırma

```bash
# Yerel geliştirme (statik sunucu)
npm start           # http://localhost:3000

# Ya da herhangi bir statik sunucu
python -m http.server 8000
```

Uygulama ES modülleri kullandığı için `file://` ile açılmaz; bir HTTP sunucusu gerekir.

## 🌐 GitHub Pages ile Yayınlama

### Önce zorunlu adım (tek seferlik)

`Settings → Pages → Build and deployment → Source: **GitHub Actions**` seçin.
Bu seçim yapılmazsa iş akışı “Get Pages site failed / Not Found” hatası verir.

### Yöntem A — GitHub Actions ile (önerilen)

`.github/workflows/pages.yml` her `main` push'unda otomatik çalışır:

1. Sözdizimi kontrolü (`node --check`)
2. `node build.js` ile temiz statik çıktı (`_site/`) üretimi
3. Paketin yüklenmesi ve GitHub Pages'e yayınlanması

İş akışı `actions/checkout@v7`, `configure-pages@v6`, `upload-pages-artifact@v5`,
`deploy-pages@v5` kullanır (Node 24 tabanlı güncel sürümler) ve `ubuntu-24.04` çalıştırıcısında
çalışır.

Adres: `https://<kullanici>.github.io/<repo>/`

### Yöntem B — Branch'ten yayınlama (CI gerekmez)

`Settings → Pages → Source: **Deploy from a branch**` → branch `main`, folder `/ (root)`.
Depo kökü zaten statik site olduğu için ek derleme gerekmez (`.nojekyll` Jekyll'i devre dışı bırakır).

### Yerel derleme denetimi

```bash
npm run build     # _site/ klasörünü üretir
npm run check     # sözdizimi kontrolü
```

### Telefonda kullanım
- iOS: Safari → *Paylaş* → **Ana Ekrana Ekle**
- Android: Chrome → ⋮ → **Uygulamayı yükle / Install app**
- Uygulama çevrimdışı çalışır; kurlar son başarılı değerden önbellekten gelir.

---

## 💱 Kur verisi kaynakları

| Varlık türü | Kaynak (sırayla) |
|---|---|
| Döviz (USD, EUR, GBP, CHF + özel) | `exchangerate-api.com` → `open.er-api.com` → `cdn.jsdelivr.net` (currency-api) |
| Altın / Gümüş (ons → gram) | `api.gold-api.com` → `cdn.jsdelivr.net` (currency-api) |
| Kripto | `api.coingecko.com` → `api.coinbase.com` |

Tüm kaynaklar CORS uyumludur ve tarayıcıdan doğrudan çağrılır. Kurlar 30 dakika önbelleğe alınır;
Ayarlar ekranından **elle fiyat** girilerek her varlık için geçersiz kılınabilir.

Gram altın fiyatı = (ons altın USD ÷ 31,1034768) × USD/TRY × (1 + altın primi %)

## 🗄️ Veri modeli

```jsonc
{
  "id": "uuid",
  "date": "2025-06-02",
  "assetId": "XAU",
  "side": "buy",          // buy | sell
  "amount": 10,           // miktar (gr, $, BTC …)
  "unitPrice": 3200,      // birim fiyat (₺)
  "fee": 0,               // komisyon (₺)
  "total": 32000,         // otomatik hesaplanır
  "account": "Midas",
  "note": ""
}
```

Kâr/zarar **ortalama maliyet yöntemiyle** hesaplanır; satışlarda gerçekleşen kâr portföyden ayrılır.
"Net yatırım" = alışlar − satışlar.

## 🔒 Gizlilik

- Veriler yalnızca tarayıcıda saklanır (IndexedDB; desteklenmezse localStorage).
- Analitik, reklam veya üçüncü taraf izleme kodu **yoktur**.
- JSON yedeği ile veriler başka cihaza aktarılabilir.

## 📄 Lisans

MIT
