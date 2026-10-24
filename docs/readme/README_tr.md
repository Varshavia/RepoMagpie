<div align="center">

[English](../../README.md) · **Türkçe**

_İngilizce README esas metindir; bu çeviri ondan geride kalabilir._

<img src="../assets/logo.svg" width="96" height="96" alt="RepoMagpie logosu: yandan görünen bir saksağan">

# RepoMagpie

### Kodlama ajanın bir şey kurmadan önce bağımlılık notlarına bakar.

**Bir paketten neden vazgeçtiğini yaz; ajanın onu yeniden kurmadan önce notunu okur.**

[![npm sürümü](https://img.shields.io/npm/v/repomagpie?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/repomagpie)
[![MCP sunucusu](https://img.shields.io/badge/MCP-server-5c4ee5?style=flat-square&logo=modelcontextprotocol&logoColor=white)](../spec.md#repomagpie-mcp)
[![Node.js 22.12 veya üstü](https://img.shields.io/badge/Node.js-22.12%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#platformlar)
[![CI durumu](https://img.shields.io/github/actions/workflow/status/Varshavia/RepoMagpie/ci.yml?branch=main&style=flat-square&label=CI&logo=githubactions&logoColor=white)](https://github.com/Varshavia/RepoMagpie/actions/workflows/ci.yml?query=branch%3Amain)
[![MIT lisansı](https://img.shields.io/badge/licence-MIT-f4c430?style=flat-square)](../../LICENSE)

[Hızlı başlangıç](#hızlı-başlangıç) · [Nasıl çalışır](#nasıl-çalışır) · [Her ajan ne alır](#her-ajan-ne-alır) · [SSS](#sss) · [Belgeler](#belgeler)

<code>npm install -g repomagpie@beta</code><br>
<code>repomagpie setup</code>

</div>

Aylar önce pdfkit'i denemiş, sonra vazgeçmiştin. Bugün ajanın onu yeniden kurmak üzere ve RepoMagpie önce notunu gösterip sana soruyor:

```text
$ npm install pdfkit

RepoMagpie: you noted to avoid pdfkit (personal journal)
Verdict: "avoid: async streams painful; use puppeteer"
Alternatives in your personal journal: "puppeteer" (Verdict: "default for PDF rendering")
~/.magpie/notes/npm--pdfkit.md

Do you want to proceed?
```

Claude Code'da: kurulum çalışmadan önce RepoMagpie'nin hook'u sordu.

- **Not al:** kararını tek satırda yaz: `repomagpie note pdfkit "avoid: async streams painful; use puppeteer"`. Ajanın da bir işin sonunda, o işte verilen bir bağımlılık kararını, senin nedeninle, senin sözlerinle Verdict olarak kaydetmeyi bir kez önerir. Notlar, sahibi olduğun Markdown dosyalarıdır.
- **Kurulumdan önce hatırlat:** ajanın `npm install pdfkit` çalıştırdığında önce senin notunu görür.
- **Öner:** `repomagpie suggest` bir projenin manifest dosyalarını ve README'sini okur, projeye uyan notları listeler.

**Durum:** erken test edenler için ön sürüm `0.2.0-beta.10`. [Değişiklik kaydına](../../CHANGELOG.md) ve [yol haritasına](../roadmap.md) bak.

## Hızlı başlangıç

1. `repomagpie` komutunu yükle ve kodlama ajanlarında ayarla. Node.js 22.12 veya üstü gerekir. `PATH`'inde başka bir `magpie` komutu yoksa `magpie` kısa takma ad olarak çalışır. <!-- check:commands allow -->

   ```bash
   npm install -g repomagpie@beta
   repomagpie setup
   ```

   `setup` ajanlarını komutlarından ya da uygulamalarından bulur (yalnızca klasörü kalmış bir ajan listelenir, seçilmez), hangi dosyada neyi değiştireceğini gösterir, önce sorar ve düzenlediği her dosyanın yedeğini alır; `repomagpie setup --dry-run` yalnızca planı gösterir. [Ajanlar](../agents.md) ya da [elle kurulum](../setup-by-hand.md) sayfasına bak.

2. Her ajanda neyin bağlı olduğunu kontrol et:

   ```bash
   repomagpie doctor
   ```

   `doctor`, `setup`'ın yedeklerini de listeler. Her yedek, dosyasının tam bir kopyasıdır ve `~/.claude.json` kopyaları oturum token'larını ve MCP sunucularının gizli bilgilerini içerebilir. `repomagpie setup --delete-backups` sorduktan sonra onları siler; `--keep-latest` her dosyanın en yenisini tutar.

3. İlk notunu yaz. Bir paket adı ver ya da deponun lisansını, konularını (topics) ve ajan skill'lerini de çekmek için bir GitHub URL'si ver:

   ```bash
   repomagpie note pdfkit "avoid: async streams painful; use puppeteer" --type npm
   repomagpie note https://github.com/microsoft/playwright-cli "use for agent browser tests"
   ```

   `--type npm`, adın bir npm paketi olduğunu söyler. Bir projenin içinde RepoMagpie bunu manifest dosyasından okur; başka bir yerde sorar.

   Token olmadan GitHub saatte 60 isteğe izin verir. [GitHub CLI](https://cli.github.com/) kullanıyorsan, sınırı yükseltmek için açık kabuk oturumunda RepoMagpie'ye onun token'ını ver: `export GITHUB_TOKEN=$(gh auth token)`, PowerShell'de ise `$env:GITHUB_TOKEN = gh auth token`.

> [!IMPORTANT]
> RepoMagpie yalnızca üç yerden gelir: [bu depo](https://github.com/Varshavia/RepoMagpie), [`repomagpie`](https://www.npmjs.com/package/repomagpie) npm paketi ve [skills.sh](https://skills.sh/varshavia/repomagpie) üzerindeki ajan skill'i. Kurulum programı, `.exe` ya da başka bir indirme, başka bir paket ve başka bir web sitesi yoktur: kendine RepoMagpie diyen başka her şey bizim değildir ([SECURITY.md](../../SECURITY.md#official-channels)).

## Nasıl çalışır

![RepoMagpie nasıl çalışır: ajanın npm install pdfkit çalıştırmak üzere; önce skill ya da MCP aracı recall kontrol eder, hook ise kurulum komutunu son güvence olarak kontrol eder; ikisi de ~/.magpie'deki kişisel günlüğünü ve .magpie/ içindeki proje günlüğünü okur; Verdict'in, "avoid: async streams painful; use puppeteer", geri gelir ve ajanın kurmadan önce sana sorar.](../assets/how-it-works.svg)

Bir kurulumdan önce skill, ajanına paketi MCP sunucusunun `recall` aracıyla ya da `repomagpie recall` komutuyla aramasını söyler. RepoMagpie makinendeki iki günlüğü de okur ve notlarını döndürür; biri paketten kaçınmanı söylüyorsa ajanın notu sana gösterir ve önce sorar. Ajan bu adımı atlarsa diye hook, kurulum komutunun kendisini kontrol eder.

Ek bir model, API anahtarı ya da telemetri yoktur. RepoMagpie zaten kullandığın ajan üzerinden çalışır; bu yüzden o ajanın skill'e uyduğu kadar işe yarar: hook yoksa bu, kurulumdan önceki kontrol için de geçerlidir.

## Ajanına sor

- **What do I have for browser testing?** (Tarayıcı testi için elimde ne var?) Ajanın günlüklerinde arar ve bulduğu notlarla, Verdict'i başta olmak üzere yanıt verir; küçük bir günlükte her notu tek bir listede okuyabilir.
- **Install pdfkit.** (pdfkit'i kur.) Ajanın kurulumdan önce pdfkit'e dair notlarına bakar. Kaçınma notun alternatifleriyle birlikte gelir ve ajanın bir şey kurmadan önce sana sorar.
- **Which of my tools fit this project?** (Araçlarımdan hangileri bu projeye uyar?) `suggest` projenin manifest dosyalarını ve README'sini okur, eşleşen notları döndürür; ajanın uyanları seçer, nedenini söyler ve projede kullanılan, kaçınmayı not ettiğin bağımlılıkları belirtir.

## Her ajan ne alır

`repomagpie setup`'ın her ajanda ayarladıkları ([ajanlar](../agents.md)):

| Ajan | MCP | Skill | Hook | Bir not paketten kaçınmanı söylediğinde |
|---|---|---|---|---|
| Claude Code | evet | evet | evet | hook sana sorar |
| Codex CLI | evet | evet | evet | hook ilk denemeyi durdurur; ajanın sana sorar |
| Cursor | evet | evet | evet | hook ilk denemeyi durdurur; ajanın sana sorar |
| Gemini CLI | evet | evet | evet | hook sana sorar |
| VS Code (GitHub Copilot) | evet | evet | hayır | hook yok; MCP sunucusu ve skill kontrol eder |
| Antigravity CLI | evet | evet | evet | hook sana sorar |
| Copilot CLI | evet | evet | evet | hook ilk denemeyi durdurur; ajanın sana sorar |

Codex CLI yeni bir hook'u ancak sen ona `/hooks` içinde güvendikten sonra çalıştırır.

## Yerel uygulama

`repomagpie ui` günlüklerini tarayıcıda açar. Gelen kutusundaki (Inbox) bir notu gözden geçir: Verdict'i yaz, türü, etiketleri ve puanı seç, Ctrl+Enter'a bas.

![repomagpie ui'da gelen kutusu incelemesi: yazılmakta olan Verdict'in üstünde bir GitHub deposunun açıklaması ve Use when taslakları, altında seçilecek etiketler](../assets/screen-inbox-review.png)

Bir paketi kontrol et (Check a package): kurulumdan önce günlüklerinin ne dediği ve hook'un her ajanda ne yaptığı.

![repomagpie ui'da Check a package: pdfkit'in kaçınma notu, ajana göre hook'un önce sorduğunu ya da ilk denemeyi durdurduğunu söylüyor; left-pad'in notu yok, bu yüzden hook sessiz kalıyor](../assets/screen-check-package.png)

Bu proje için öneri (Suggest for this project): uyan notlar ve her birinin neden aday olduğu.

![repomagpie ui'da Suggest: @playwright/test bağımlılığıyla eşleşen microsoft/playwright ilk sırada; pdfkit, kaçınma notu olan ve kullanımda olan bir paket olarak ayrı listeleniyor, yerine pdf-lib ve puppeteer var](../assets/screen-suggest.png)

Bir günlüğü grafik olarak gör: notlar, etiketleri, `[[links]]` ve alternatifler. Bir nota tıkla, grafiğin yanında oku ve düzenle.

![repomagpie ui'daki grafik sayfası, proje sahibinin kendi günlüğünde: 39 not, 67 etiket ve 157 bağlantı; #llm, #ai, #mcp ve #claude-code gibi en çok bağlantısı olan etiketler ve notlar grafiğin yanında listeleniyor](../assets/screen-graph.png)

## Benzerleriyle karşılaştırma

| Araç | Ne bilir | Ne zaman görürsün |
|---|---|---|
| Yıldız yöneticileri, örneğin [Starcat](https://github.com/starcat-app/Starcat) ve [GithubStarsManager](https://github.com/AmintaCCCP/GithubStarsManager) | Yıldızladığın depolar, etiketleri ve notlarıyla | Daha sonra aradığında |
| Tedarik zinciri tarayıcıları, örneğin [Socket Firewall Free](https://github.com/SocketDev/sfw-free) | Küresel verilerden kötü amaçlı yazılım, güvenlik açıkları ve popülerlik | Bir kurulumdan önce |
| RepoMagpie | Senin ve ekibinin kararları | Bir kurulumdan önce, arama yaptığında ve bir projeye başladığında |

`CLAUDE.md` içindeki "avoid pdfkit" gibi bir satır tek bir projeyi kapsar. Bir RepoMagpie notu bütün projelerinde geçerlidir, aramada çıkar ve hook onu her kurulumda kontrol eder.

## Platformlar

- Node.js 22.12 veya üstü; paketin çalışma zamanı bağımlılığı yoktur (MCP sunucusunun kütüphaneleri pakete gömülüdür). CI; Linux, Windows ve macOS'ta, Node 22, 24 ve 26 ile çalışır.
- Windows'ta Codex CLI, Copilot CLI, Gemini CLI ve Cursor, hook'u Windows PowerShell üzerinden başlatır; bu her seferinde yaklaşık 350 ms ekler. Antigravity CLI'ın `cmd`'si yaklaşık 90 ms ekler. Copilot CLI hook'u her araç çağrısından önce, diğerleri her kabuk komutundan önce çalıştırır.
- `C:\Users\Şuat` gibi ASCII dışında harfler içeren yollar desteklenir.

## SSS

<details>
<summary><strong>RepoMagpie notlarımı bir yere gönderiyor mu?</strong></summary>

Hayır. Kişisel günlüğün, makinende Markdown dosyalarından oluşan bir klasördür; bir proje günlüğü, deposu kadar görünürdür ve telemetri yoktur. Tek ağ istekleri, `repomagpie note`, `repomagpie import` ya da uygulamanın Add sayfasına bir GitHub deposu verdiğinde GitHub'ın API'sine gider: deponun meta verilerini, dosya listesini ve kökteki manifest dosyalarını okur, ayarladıysan `GITHUB_TOKEN`'ı gönderir, günlüklerinden hiçbir şey göndermez. `repomagpie ui` yalnızca `127.0.0.1` üzerinde dinler; `repomagpie mcp` ise hiçbir ağ bağlantısı ya da port açmaz: ajanınla stdio üzerinden konuşur. Ajanının okuduğu notlar, konuşmanın bir parçası olarak ajanın model sağlayıcısına da gider. [SECURITY.md](../../SECURITY.md#what-repomagpie-reads-writes-and-sends) sayfasına bak.

</details>

<details>
<summary><strong>RepoMagpie yapay zekâ kullanıyor mu?</strong></summary>

Kendine ait bir model kullanmaz. RepoMagpie'nin komutları paket adlarını ve kelimeleri eşleştirir, hiçbir modeli çağırmaz. Yapay zekâ, zaten kullandığın kodlama ajanıdır: skill ve MCP araçları üzerinden bir kurulumdan önce notlarını hatırlatır, elinde ne olduğunu sorduğunda onlarda arar ve bir işin sonunda bir bağımlılık kararını kaydetmeyi bir kez önerir. Skill ona Verdict'ini asla senin yerine yazmamasını (yalnızca senin sözlerin ya da hiçbir şey), sen o notu adıyla istemedikçe asla bir notu silmemesini ve kaçınmayı not ettiğin bir paketi sana sormadan asla kurmamasını söyler; ajanında hook varsa bu sonuncusunu hook da kontrol eder. RepoMagpie'nin kendisi günlüklerinden hiçbir şeyi bir yere göndermez. Yukarıdaki yanıtta dendiği gibi, ajanının okuduğunu ajanının model sağlayıcısı da görür.

</details>

<details>
<summary><strong>Hook kurulumları engelliyor mu?</strong></summary>

Hiçbir kurulumu kalıcı olarak engellemez ve hiçbirini onaylamaz. Bir not paketten kaçınmanı söylediğinde hook, Claude Code, Gemini CLI ve Antigravity CLI'da sana sorar; Codex CLI, Cursor ve Copilot CLI'da ilk denemeyi durdurur, ajanın sana sorar ve aynı kurulum ardından 10 dakika boyunca geçer. Kaçınmanı söylemeyen bir not hiçbir kurulumu durdurmaz, RepoMagpie'deki bir hata da durdurmaz: hook o zaman hiçbir şey yapmaz. [Hook sözleşmesine](../spec.md#6-hook-contract) ve [karar 0036'ya](../decisions/0036-hooks-in-other-agents.md) bak.

</details>

<details>
<summary><strong>Bir güvenlik tarayıcısı mı?</strong></summary>

Hayır. RepoMagpie senin ve ekibinin not ettiklerini gösterir: kötü amaçlı yazılım ya da güvenlik açığı bulduğunu asla iddia etmez ve hiçbir şey kurmaz. Yanında [Socket Firewall Free](https://github.com/SocketDev/sfw-free) gibi bir tarayıcı çalıştır ([vizyon](../vision.md#non-goals), [rakipler](../competitors.md)).

</details>

<details>
<summary><strong>Hangi ajanlarla çalışıyor?</strong></summary>

`repomagpie setup`, [Her ajan ne alır](#her-ajan-ne-alır) bölümündeki yedi ajanı ayarlar. MCP destekleyen diğer ajanlar MCP sunucusunu, [Agent Skills](https://agentskills.io) destekleyenler skill'i kullanabilir: yazılacak girdiler [elle kurulum](../setup-by-hand.md) sayfasında, her ajanın neyi desteklediği [ajanlar](../agents.md) sayfasındadır.

</details>

<details>
<summary><strong>Nasıl kaldırırım?</strong></summary>

`repomagpie setup --remove` çalıştır. Yalnızca RepoMagpie'nin kendi MCP girdilerini, hook'larını ve skill klasörlerini kaldırır; sonradan yaptığın değişikliklerin üzerine asla bir yedeği geri yüklemez. Günlüklerini (`~/.magpie` ve projelerdeki `.magpie/`) ve `setup`'ın yedeklerini bırakır: yedekleri sorduktan sonra silmek için `repomagpie setup --delete-backups` çalıştır, sonra `npm uninstall -g repomagpie` çalıştır. Antigravity CLI, sen `~/.gemini/antigravity-cli/mcp/` klasörünü temizleyene kadar kaldırılmış bir girdiyi listelemeye devam edebilir ([ajanlar](../agents.md#antigravity-cli)).

</details>

<details>
<summary><strong>Notlarım nerede, onları elle düzenleyebilir miyim?</strong></summary>

Her not, YAML frontmatter'ı olan bir Markdown dosyasıdır: kişisel günlüğün için `~/.magpie/notes/` içinde, bir projeninki için `.magpie/notes/` içinde ([not şeması](../note-schema.md)). Onları herhangi bir editörde düzenle: RepoMagpie, alanları ya da bölümleri eksik olsa da elle yazılmış notları okur ve senin bölümlerini asla yeniden yazmaz. `repomagpie ui` aynı dosyaları tarayıcıda düzenler. Kişisel günlüğü başka bir yerde tutmak için `MAGPIE_HOME`'u ayarla ya da `--home` ver.

`repomagpie delete <name>` ya da uygulamadaki Delete, bir notu günlüğün `.trash/` klasörüne taşır.

</details>

<details>
<summary><strong>Notları ekibimle nasıl paylaşırım?</strong></summary>

Bir notu `--to project` ile yaz ya da kişisel günlüğündeki bir notu `repomagpie adopt <name>` ile kopyala: ikisi de deponun `.magpie/` klasörüne gider. Onu commit'le; ekip arkadaşlarının ajanları da tıpkı seninki gibi recall, search ve suggest sırasında notu görür. Bir proje günlüğü, deposu kadar görünürdür: depoyu okuyabilen herkes notlarını da okuyabilir ([karar 0013](../decisions/0013-two-journal-scopes.md)).

</details>

## Belgeler

Belgeler İngilizcedir.

- [Spec](../spec.md): her komut (`search`, `recall`, `catalog`, `adopt`, `import`, `delete` ve diğerleri; `repomagpie --help` hepsini listeler), bayrak ve `--json` belgesi
- [Ajanlar](../agents.md): her kodlama ajanının neyi desteklediği ve [elle kurulum](../setup-by-hand.md)
- [Not şeması](../note-schema.md): bir notun biçimi
- [Yerel uygulama](../ui.md): ekranlar, API ve güvenlik kuralları
- [Yol haritası](../roadmap.md) ve [değişiklik kaydı](../../CHANGELOG.md)
- [Betayı test etmek](../testing/TESTING_tr.md): beta ile bir haftanın adımları ve geri bildirimin nasıl gönderileceği
- [Vizyon](../vision.md), [rakipler](../competitors.md) ve [kararlar](../decisions/)

Hatalar ve fikirler için bir issue aç. Proje henüz pull request kabul etmiyor ([CONTRIBUTING.md](../../CONTRIBUTING.md)). Bir güvenlik açığı bildirmek için [SECURITY.md](../../SECURITY.md) sayfasına bak.

## Lisans

[MIT](../../LICENSE) © 2026 Yusuf Suat Babacan
