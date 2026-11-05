# Portföy · Yatırım Takibi

Altın, döviz, kripto ve diğer varlıklar için **mobil uygulama deneyimine** sahip,
**çevrimdışı çalışan**, **modern ve tamamen düz (flat)** tasarıma sahip yatırım portföy
takip uygulaması. Ana renk **kırmızı**; ilham kaynağı yeni nesil mobil uygulamalar.

Uygulama **statiktir**: sunucu, veritabanı veya build adımı gerektirmez. Veriler
cihazın yerel deposunda tutulur ve isteğe bağlı olarak **GitHub Gist** üzerinden
tüm cihazlar arasında paylaşılır. Doğrudan **GitHub Pages** üzerinden yayınlanabilir.

---

## 🔐 Giriş

Uygulama açılışında giriş ekranı gelir. Sabit hesap:

| Kullanıcı adı | Şifre |
|---|---|
| `admin` | `admin` |

> Not: Bu istemci tarafı bir uygulamadır; giriş cihazı başkasına karşı korur,
> sunucu tabanlı kimlik doğrulama değildir. Oturum 30 gün geçerlidir,
> “⋮ → Çıkış yap” ile sonlandırılabilir.

---

## 🔐 Veri şifreleme (Kasa)

Yatırım bilgileriniz **AES-256-GCM** ile şifrelenerek saklanır — hem cihazda hem de bulutta.

**Ayarlar → Veri şifreleme → “Şifrelemeyi başlat”** ile bir **kasa şifresi** belirleyin:

| | |
|---|---|
| **Algoritma** | AES-256-GCM (Web Crypto) |
| **Anahtar türetme** | PBKDF2-HMAC-SHA256, 210.000 tur, 16 bayt rastgele tuz |
| **Yerel depo** | IndexedDB'de tek bir şifreli zarf (`vault`) — düz metin **yok** |
| **Bulut (Gist)** | Gist içeriği de aynı şifreyle şifrelenir → Gist herkese açık olsa bile içerik okunamaz |
| **Şifre saklama** | Şifre **hiçbir yere kaydedilmez**; yalnızca bellekte (oturum) tutulur |

**Kullanım:**

- Şifreleme aktifken uygulama açılışında **“Kasa Kilidi”** ekranı çıkar → şifreyi girerek açılır.
- **Yeni bir cihazda** bulut verisini almak için: Ayarlar → **“Şifreyi bu cihazda gir”**
  (veya app bar’daki bulut simgesine basınca şifreyi sorar) → aynı şifreyle o cihaz da şifrelenir.
- **Şifreyi değiştir** → veriler yeni şifreyle yeniden şifrelenir.
- **Şifrelemeyi kaldır** → veriler düz metne döner.

> ⚠️ Şifreyi unutursanız şifreli veriler açılamaz (kurtarma yoktur). Şifreyi bir yere not edin.

---

## ☁️ Veri kaybolmasın: Bulut senkronizasyonu (GitHub Gist)

GitHub Pages statik barındırmadır; bu yüzden verilerin paylaşılması için **Gist**
kullanılır. Veriler `portfoy.json` adlı tek bir dosyada tutulur.

**Kurulum (2 dakika):**

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained**
   → yeni jeton. İzinler: **Gists → Read and write**.
   *(Klasik jeton kullanılacaksa `gist` kapsamı yeterlidir.)*
2. Uygulamada **Ayarlar → Bulut senkronizasyonu**:
   - **Gist ID** boş bırakılır, **Erişim jetonu** yapıştırılır → **“Bulut verisi oluştur”**
     (jeton, herkese açık bir Gist oluşturur ve ID'yi otomatik yazar).
   - Ya da kendi Gist'iniz varsa: `portfoy.json` adlı dosya içeren **herkese açık**
     bir Gist oluşturup ID'yi (URL'deki son kısım) yapıştırın.
3. **“Kaydet ve senkronize et”** → tüm cihazlarda aynı veri görünür.

**Nasıl çalışır?**

- **Okuma:** herkese açık Gist için jeton gerekmez → diğer cihazlar sadece Gist ID ile veriyi görür.
- **Yazma:** jeton olan cihaz yazabilir; değişiklikler 4 sn sonra otomatik gönderilir.
- **Birleştirme:** kayıt `id` + `updatedAt` ile karşılaştırılır, **son yazan kazanır**.
- **Silme:** “mezar taşı” ile taşınır, böylece silme de tüm cihazlara yayılır.
- **Çevrimdışı:** internet yoksa yerel veriler çalışır; bağlantı gelince birleştirilir.
- **Şifreli mod:** şifreleme etkinse Gist'e yazılan içerik şifreli zarf olur; okumak için kasa şifresi gerekir.
- Uygulama çubuğundaki **bulut simgesi** durumu gösterir; **⋮ → Bulut ile senkronize et** ile elle tetiklenir.

> Alternatif: **Ayarlar → Veri → JSON yedeği indir / geri yükle** (yedekleme için).

---

## 📱 Modern mobil uygulama deneyimi

| Özellik | Açıklama |
|---|---|
| **Renkli app bar** | Kırmızı marka çubuğu: hamburger (çekmece), başlık, bulut (senkronizasyon), arama, **+**, **⋮** |
| **Yüzen sekme çubuğu** | 5 sekme, yuvarlatılmış kart içinde, aktif sekmede kırmızı hap; `safe-area` destekli |
| **FAB** | Sağ altta yeni işlem düğmesi; kaydırma sırasında gizlenir |
| **Sabit alt eylem çubuğu** | Veri girişinde “Kaydet / Yeni ekle” her zaman başparmağın altında |
| **Bottom sheet** | Tüm diyaloglar alttan kayarak açılır |
| **Özel rakam tuş takımı** | Büyük tuşlarla sayısal giriş — sistem klavyesi açılmaz (Ayarlar'dan kapatılabilir) |
| **Varlık seçici paneli** | Aramalı alt panel (12+ varlıkta en kolay yöntem) |
| **Sekmeler arası kaydırma** | İçerik üzerinde sağa/sola kaydırma ile sekme değiştirme |
| **Tam güvenli alan** | `env(safe-area-inset-*)` → notch, home bar ve yatay modda tam uyum |
| **Koyu tema** | Otomatik / açık / koyu |
| **PWA** | Ana ekrana eklenebilir, çevrimdışı çalışır |

---

## 📊 Analiz dashboard'u

- **Özet kartı:** toplam değer, net kâr (₺ ve %), maliyet, net yatırım, bu ay alım/satış,
  gerçekleşen kâr, komisyon
- **Portföy değeri grafiği:** 6A / 12A / 24A / Tümü + dönem başı–sonu değişimi
- **Hedefler:** varlık veya toplam portföy hedefi, ilerleme çubuğu, kalan tutar
- **Dağılım:** halka grafik + paylar + **yoğunlaşma riski uyarısı**
- **KPI'lar:** en çok kazandıran / kaybettiren, bu ay alım, komisyon
- **Varlık performansı:** miktar, ortalama maliyet, portföy ağırlığı çubuğu, kâr %
- **Aylık net yatırım** grafiği (alış − satış)
- **Yıl özeti:** alış, satış, net, gerçekleşen kâr
- **Hesap dağılımı** ve **son işlemler**

## ✍️ Veri girişi (mobil için tasarlandı)

- Tek ekran, az alan: **Alış/Satış**, **varlık seçici**, **miktar**, **birim fiyat**
- Büyük tuş takımı ile miktar/fiyat girişi, `+0,1 / +1 / +10` hızlı artırma çipleri
- **“Güncel kur”** ile piyasa fiyatını tek dokunuşla forma doldurma
- Canlı özet: toplam tutar, portföydeki miktar, **yeni ortalama maliyet**
- “Ek ayarlar” altında: komisyon, tarih (native tarih seçici), hesap/kurum, not
- “Kaydet ve yeni ekle” ile toplu (till benzeri) giriş

## 🔍 Diğer sayfalar

- **Geçmiş:** arama, varlık çipleri, filtre paneli (tür/hesap/sıralama), aylık gruplama,
  düzenleme, silme + geri alma, CSV dışa aktarma
- **Analiz:** dönem seçimli değer grafiği, varlık performans tablosu (mobilde kart listesi),
  aylık net yatırım, hesap dağılımı, gerçekleşen kâr
- **Ayarlar:** tema, para birimi, altın primi, rakam tuş takımı, kurlar (elle fiyat),
  hedefler, hesaplar, varlıklar, **bulut senkronizasyonu**, yedekleme, PIN kilidi

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

- Veriler cihazda **şifreli** (AES-256-GCM) saklanır; şifreleme açıksa düz metin hiçbir yerde bulunmaz.
- Analitik, reklam veya üçüncü taraf izleme kodu **yoktur**.
- Bulut senkronizasyonu **açıkça etkinleştirilirse** veriler sizin seçtiğiniz Gist'e yazılır
  (şifreleme etkinse şifreli zarf olarak).

## 📄 Lisans

MIT
