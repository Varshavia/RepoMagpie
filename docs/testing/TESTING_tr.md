# Betayı test etmek

[English](../../TESTING.md) · **Türkçe**

_İngilizce rehber esas metindir; bu çeviri ondan geride kalabilir._

RepoMagpie'yi bir hafta test ettiğin için teşekkürler. 1. gün yaklaşık 20 dakika sürer. Sonrasında kodlama ajanını her zamanki gibi kullanırsın ve bir paketi seçtiğinde ya da bıraktığında bir satır yazarsın. 7. gün kısa bir formu doldurursun.

## Başlamadan önce

- **Node.js 22.12 veya üstü.** `node --version` ile kontrol et.
  - Windows: [nodejs.org](https://nodejs.org/) adresinden LTS sürümünü kur.
  - macOS: [Homebrew](https://brew.sh/) ile kur: `brew install node`. nodejs.org'daki kurulum programı da çalışır, ama o zaman `npm install -g` başarısız olabilir (aşağıda "Bilinen tuzaklar").
- **Bir kodlama ajanı.** README'deki [tablodaki](../readme/README_tr.md#her-ajan-ne-alır) yedi ajandan herhangi biri: Claude Code, Codex CLI, Cursor, Gemini CLI, VS Code (GitHub Copilot), Antigravity CLI veya Copilot CLI. VS Code'da hook yoktur: orada kurulumdan önceki kontrol, ajanın skill'e uymasına bağlıdır.

## 1. gün (yaklaşık 20 dakika)

### 1. Kur, ayarla ve kontrol et

```bash
npm install -g repomagpie@beta
repomagpie setup
repomagpie doctor
```

- `setup` bulduğu ajanları listeler, hangi dosyada neyi değiştireceğini gösterir ve önce sorar. Her dosyayı değiştirmeden önce yedekler. Hiçbir şeyi değiştirmeden planı görmek için `repomagpie setup --dry-run` çalıştır.
- `setup` söylediğinde ajanlarını yeniden başlat.
- `doctor` her ajanda neyin bağlı olduğunu gösterir ve bir "To do" listesiyle biter. **Çıktısının ekran görüntüsünü al.**

### 2. Bilinen tuzaklar

- **Windows PowerShell "running scripts is disabled on this system" diyor.** PowerShell'in varsayılan çalıştırma ilkesi npm'in `.ps1` betiklerini engeller. `repomagpie` yerine `repomagpie.cmd` (ve `npm` yerine `npm.cmd`) kullan ya da komutları Komut İstemi'nde (Command Prompt) çalıştır.
- **macOS: `npm install -g` `EACCES` ile başarısız oluyor.** nodejs.org kurulum programıyla gelen Node, global paketleri kullanıcının yazamadığı bir klasöre koyar. `sudo` kullanma. Bunun yerine Node'u Homebrew ile kur (`brew install node`), sonra `npm install -g repomagpie@beta` komutunu yeniden çalıştır. npm'in [EACCES hataları](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally) sayfasında başka yollar da var.
- **Bir ajanın klasörü var, ama komutu ya da uygulaması yok** (eski bir kurulum ya da başka bir aracın açtığı bir klasör). `setup` onu `not chosen: found ~/.codex only` diye listeler ve dokunmaz. O ajanı kullanıyorsan `repomagpie setup --agents codex` çalıştır (ajanın adıyla).
- **Komutu olmayan Codex CLI: kaydı elle yapıştır.** `setup`, Codex'in MCP kaydını `codex mcp add` ile ekler. `PATH`'te `codex` yoksa kaydı yazdırır: onu `~/.codex/config.toml` dosyasına kendin yapıştır. `repomagpie setup --dry-run --agents codex` kaydı yeniden yazdırır.
- **Codex CLI yeni bir hook'u ancak ona güvendiğinde çalıştırır.** Codex'te `/hooks` açıp RepoMagpie'nin hook'una güven. `repomagpie doctor` komutunu yeniden çalıştır: Codex satırında `trusted` yazar.
- **Node.js sürümünü değiştiriyorsun** (nvm, fnm, Volta). `setup`, çalıştığı Node.js'in yolunu yazar. Sürüm değiştirdikten sonra `repomagpie doctor`, ardından yeniden `repomagpie setup` çalıştır.
- **GitHub sınırı.** Token olmadan GitHub saatte 60 isteğe izin verir ve bir GitHub URL'sinden not birkaç istek yapar. Sınıra takılırsan bir saat bekle ya da GitHub CLI ile giriş yap (`gh auth login`): RepoMagpie onun girişini kullanır, ayarlanacak bir değişken yok. Bulup bulmadığını `repomagpie doctor` söyler.

### 3. Kendi deneyiminden üç not yaz

Gerçekten kullandığın paketleri seç. Tırnak içindeki metin senin Verdict'indir: kendi sözlerinle tek satır.

`--type npm`, adın bir npm paketi olduğunu söyler. Bir projenin içinde RepoMagpie bunu `package.json`, `pyproject.toml` ya da `Cargo.toml` dosyasından okur; başka bir yerde npm, PyPI ve crates.io'yu ayırt edemez ve sorar. Diğerleri için `--type pypi` ya da `--type cargo` yaz.

1. Bıraktığın bir paket. Verdict'i `avoid:` ile başlat ve yerine ne kullandığını `--alternative` ile yaz: ajanın onu notla birlikte görür.

   ```bash
   repomagpie note pdfkit "avoid: async streams painful; use puppeteer" --type npm --alternative puppeteer
   ```

2. Sevdiğin bir paket.

   ```bash
   repomagpie note zod "default for validating input" --type npm --use-when "checking API input"
   ```

   `--use-when`, onu ne zaman kullanacağını kendi sözlerinle ekler; böylece not sonra yalnızca adıyla değil, neye ihtiyacın olduğuyla da bulunur. Daha fazlası için tekrarla; `--avoid-when` da aynı şekilde çalışır.

3. Metinsiz bir GitHub deposu. RepoMagpie açıklamasını, lisansını ve konularını çeker; not, 6. adımda gözden geçirmen için gelen kutusuna (inbox) düşer.

   ```bash
   repomagpie note https://github.com/microsoft/playwright
   ```

`pdfkit`, `puppeteer`, `zod` ve URL yerine kendi paketlerini yaz.

### 4. Ajanından kaçınmayı not ettiğin paketi kurmasını iste

Ajanını gerçek bir projede değil, bir deneme klasöründe aç ve "Install pdfkit" de (1. nottaki paketin). RepoMagpie durdurduğunda ya da sorduğunda Hayır de.

Ne olduğunu not et:
- Ajan kurmadan önce sana sordu mu?
- `RepoMagpie:` ile başlayan bir satır gördün mü?
- Tam olarak ne gördün? Ekran görüntüsü işe yarar.

Beklenen: Claude Code, Gemini CLI ve Antigravity CLI'de hook sana sorar. Codex CLI, Cursor ve Copilot CLI'de ilk denemeyi durdurur ve ajanın sana sorması gerekir. VS Code'da ajanın notlarına bakıp sorması gerekir.

### 5. Ajanına notlarını sor

"What do I have for …?" diye, notlarından birine dair kelimelerle sor ("What do I have for validation?"). Notu bulup bulmadığını yaz.

### 6. Uygulamayı aç

```bash
repomagpie ui
```

Günlüklerini tarayıcıda açar.

1. **3. adımdaki gelen kutusu notunu gözden geçir:** bir Verdict yaz; tür (kind), etiketler (tags) ve puanı (rating) seç; Ctrl+Enter'a bas (macOS'te Cmd+Enter).
2. **Bir deneme notunu sil ve geri al.** Önce atılacak bir not yaz:

   ```bash
   repomagpie note left-pad "test: delete me" --type npm
   ```

   Uygulamada notu aç, **Delete note**'a bas, onayla, sonra çıkan mesajda **Undo**'ya bas. 10 saniyen var. Not geri gelmeli.

Uygulamayı kendi terminalinde Ctrl+C ile durdur.

## 2. ile 7. günler arası

- Her zamanki gibi çalış.
- Bir paketi seçtiğinde ya da bıraktığında tek satır yaz (`repomagpie note <ad> "<neden>" --type npm`) ya da ajanından onu RepoMagpie'ye kaydetmesini iste.
- Bir paketi seçtiğin, değiştirdiğin ya da bıraktığın bir işin sonunda ajanın bu kararı kaydetmeyi bir kez önerebilir. Birkaç kelimeyle nedenini söylemen yeterli; "hayır" demek de olur.
- Başka hiçbir şey gerekmiyor.

## 7. gün: geri bildirimini gönder

Bir [Beta feedback issue'su](https://github.com/Varshavia/RepoMagpie/issues/new?template=beta-feedback.yml) aç. Dokuz kısa soru sorar. Form İngilizcedir; Türkçe yanıt verebilirsin. Herkese açık yazmak istemezsen aynı yanıtları bakımcıya özelden gönder.

`repomagpie doctor` her günlükte kaç not olduğunu gösterir.

## Bir şey bozulduğunda

Şunları gönder:
- `repomagpie doctor --json` çıktısı;
- çalıştırdığın komut ve ne gördüğün;
- işletim sistemin, Node.js sürümün (`node --version`) ve ajan.

`doctor --json`, okuduğu yapılandırma dosyalarındaki gizli görünen değerleri (token'lar, API anahtarları, parolalar) `<redacted>` ile değiştirir ve ortam değişkenlerini yalnızca adlarıyla gösterir. Yolları **gizlemez**: yollar ev klasörünü, yani kullanıcı adını içerir. İstersen yapıştırmadan önce değiştir.

## Kaldırmak

```bash
repomagpie setup --remove
repomagpie setup --delete-backups
npm uninstall -g repomagpie
```

`setup --remove` yalnızca RepoMagpie'nin kendi MCP kayıtlarını, hook'larını ve skill klasörlerini çıkarır; sonradan yaptığın değişikliklerin üzerine asla bir yedeği geri yüklemez. `setup` gibi, her dosyayı değiştirmeden önce yedekler.

`setup --delete-backups`, `setup`'ın yedeklerini tarihleriyle listeler ve silmeden önce sorar. `~/.claude.json` kopyaları oturum token'ları içerebilir. Her dosyanın en yeni yedeğini tutmak için `--keep-latest` ekle. İkisini de `npm uninstall`'dan önce çalıştır.

Notlarını, `~/.magpie` ve her projenin `.magpie/` klasöründe bırakır.

Antigravity CLI, `~/.gemini/antigravity-cli/mcp/` klasörünü temizleyene kadar kaldırılmış bir kaydı listelemeye devam edebilir.
