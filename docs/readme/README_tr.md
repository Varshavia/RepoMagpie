<div align="center">

[English](../../README.md) · Türkçe · [Deutsch](README_de.md) · [Español](README_es.md) · [简体中文](README_zh-CN.md) · [日本語](README_ja.md)

_Bu, İngilizce README'nin çevirisidir ve ondan geride kalabilir; esas metin İngilizce olandır. Çevrildiği metin: 2026-11-23 tarihli İngilizce README._

<img src="../assets/logo.svg" width="96" height="96" alt="RepoMagpie logosu: yandan görünen bir saksağan">

# RepoMagpie

### Kodlama ajanın denediğin depoları ve onlar hakkında ne düşündüğünü hatırlar.

**RepoMagpie, denediğin açık kaynak depoların ve araçların (kütüphaneler, CLI'lar, MCP sunucuları, ajan skill'leri) kişisel günlüğüdür; her birinde kendi kararın yazılıdır. Kodlama ajanın bir araç seçmeden önce ona bakar: işine yarayanları önerir, elediklerinde durur.**

[![npm sürümü](https://img.shields.io/npm/v/repomagpie?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/repomagpie)
[![MCP sunucusu](https://img.shields.io/badge/MCP-server-5c4ee5?style=flat-square&logo=modelcontextprotocol&logoColor=white)](../spec.md#repomagpie-mcp)
[![Node.js 22.12 veya üstü](https://img.shields.io/badge/Node.js-22.12%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#her-ajan-ne-alır)
[![CI durumu](https://img.shields.io/github/actions/workflow/status/Varshavia/RepoMagpie/ci.yml?branch=main&style=flat-square&label=CI&logo=githubactions&logoColor=white)](https://github.com/Varshavia/RepoMagpie/actions/workflows/ci.yml?query=branch%3Amain)
[![MIT lisansı](https://img.shields.io/badge/licence-MIT-f4c430?style=flat-square)](../../LICENSE)

[Hızlı başlangıç](#hızlı-başlangıç) · [Nasıl çalışır](#nasıl-çalışır) · [Her ajan ne alır](#her-ajan-ne-alır) · [Claude Code eklentisi](#claude-code-eklentisi) · [SSS](#sss) · [Belgeler](#belgeler)

<code>npm install -g repomagpie</code><br>
<code>repomagpie setup</code>

</div>

Aylar önce pdfkit'i denemiş, sonra vazgeçmiştin. Bugün ajanın onu yeniden kurmak üzere; Claude Code'da RepoMagpie'nin hook'u, senin notunla önce sana soruyor:

```text
$ npm install pdfkit

RepoMagpie: you noted to avoid pdfkit (personal journal)
Verdict: "avoid: async streams painful; use puppeteer"
Alternatives in your personal journal: "puppeteer" (Verdict: "default for PDF rendering")
~/.magpie/notes/npm--pdfkit.md

Do you want to proceed?
```

- **Not al:** denediğin her depo ve araç için kararını kendi sözlerinle yaz: ne zaman kullanılır, ne zaman kaçınılır, yerine ne kullanılır. `repomagpie note pdfkit "avoid: async streams painful; use puppeteer"` bir not yazar; ajanın da bir işin sonunda, bir kararı senin nedeninle kaydetmeyi bir kez önerir. Her not, sahibi olduğun bir Markdown dosyasıdır.
- **Hatırla:** ajanın bir araç seçmeden önce, skill ve MCP sunucusu üzerinden bu kararlara bakar. "Tarayıcı testleri için neyim var?" diye istediğin dilde sor ya da `repomagpie suggest` bir projeye uyan notları listelesin. Ajanın elediğin bir şeyi kurmaya kalkarsa hook onu durdurur, böylece önce sana sorulur.
- **Keşfet:** GitHub'da kelimeyle, ilgi alanıyla ve türle yeni depolar bul, onları kendi yorumunla günlüğüne ekle: `repomagpie discover` ya da uygulama. Her sonuç neden orada olduğunu söyler.

[Yedi kodlama ajanında](#her-ajan-ne-alır) çalışır; aralarında Claude Code, Codex CLI, Cursor ve Gemini CLI var. Her şey yerelde kalır: makinendeki düz Markdown dosyaları; hesap yok, bulut sunucusu yok. Ekipler için aynı notlar depoda durabilir ve git ile paylaşılabilir ([aşağıda](#notlarını-ekibinle-paylaş)).

**Durum:** kararlı sürüm, geliştirme sürüyor. [Değişiklik kaydı](../../CHANGELOG.md) her sürümü listeler; [yol haritası](../roadmap.md) sırada ne olduğunu gösterir.

## Hızlı başlangıç

1. `repomagpie` komutunu yükle ve kodlama ajanlarında ayarla:

   ```bash
   npm install -g repomagpie
   repomagpie setup
   ```

   `setup` hangi dosyaları değiştireceğini gösterir, önce sorar ve düzenlediği her dosyanın yedeğini alır; `repomagpie setup --dry-run` yalnızca planı gösterir ([ajanlar](../agents.md)). Claude Code'da `setup` çalıştırmak yerine [eklentiyi kurabilirsin](#claude-code-eklentisi).

2. Her ajanda neyin bağlı olduğunu kontrol et:

   ```bash
   repomagpie doctor
   ```

   `doctor`, `setup`'ın yedeklerini de listeler; bu yedekler ajanlarının gizli bilgilerini içerebilir ([SECURITY.md](../../SECURITY.md#what-repomagpie-reads-writes-and-sends)). `repomagpie setup --delete-backups` onları siler.

3. İlk notunu yaz. Bir GitHub URL'si deponun lisansını, konularını (topics) ve ajan skill'lerini de çeker; `--use-when` ise notu sonra neye ihtiyacın olduğuyla bulmanı sağlar:

   ```bash
   repomagpie note pdfkit "avoid: async streams painful; use puppeteer" --type npm --alternative puppeteer
   repomagpie note https://github.com/microsoft/playwright-cli "use for agent browser tests" --use-when "an agent checks a web UI"
   ```

   Token olmadan GitHub saatte 60 isteğe izin verir. Sınırı yükseltmek için GitHub CLI ile giriş yap (`gh auth login`): RepoMagpie onun girişini kullanır. Ya da `GITHUB_TOKEN` veya `GH_TOKEN` ayarla. Hangisini kullandığını `repomagpie doctor` söyler.

> [!IMPORTANT]
> RepoMagpie yalnızca üç yerden gelir: [bu depo](https://github.com/Varshavia/RepoMagpie) (Claude Code eklentisinin marketplace'i de burasıdır), [`repomagpie`](https://www.npmjs.com/package/repomagpie) npm paketi ve [skills.sh](https://skills.sh/varshavia/repomagpie) üzerindeki ajan skill'i. Kurulum programı, `.exe` ya da başka bir indirme, başka bir paket ve başka bir web sitesi yoktur: kendine RepoMagpie diyen başka her şey bizim değildir ([SECURITY.md](../../SECURITY.md#official-channels)).

## Nasıl çalışır

![RepoMagpie nasıl çalışır: ajanın npm install pdfkit çalıştırmak üzere; önce skill ya da MCP aracı recall kontrol eder, hook ise kurulum komutunu son güvence olarak kontrol eder; ikisi de ~/.magpie'deki kişisel günlüğünü ve .magpie/ içindeki proje günlüğünü okur; Verdict'in, "avoid: async streams painful; use puppeteer", geri gelir ve ajanın kurmadan önce sana sorar.](../assets/how-it-works.svg)

Ajanın bir araç seçmeden önce skill, ona günlüklerine bakmasını söyler: seçerken `search` ya da `suggest`, kurulumdan önce `recall`; MCP araçları ya da `repomagpie` komutları olarak. Önce senin kararların gelir. İşine yarayanlar önerilir; bir not paketten kaçınmanı söylüyorsa ajanın notu sana gösterir ve önce sorar. Ajan bu adımı atlarsa diye hook, kurulum komutunun kendisini kontrol eder.

Ek bir model, API anahtarı ya da telemetri yoktur. RepoMagpie, ajanın skill'e uyduğu kadar işe yarar; hook yoksa bu, kurulumdan önceki kontrol için de geçerlidir.

## Ajanına sor

- **What do I have for browser testing?** (Tarayıcı testi için elimde ne var?) Ajanın günlüklerinde arar ve bulduğu notlarla, Verdict'i başta olmak üzere yanıt verir.
- **Veritabanı güvenliği bu projede nasıl olmalı?** Ajanın, security ve database alanlarındaki notlarından projeye uyanlarla yanıt verir ve nedenini söyler.
- **Install pdfkit.** (pdfkit'i kur.) Ajanın önce pdfkit'e dair notlarına bakar, kaçınma notunu alternatifleriyle gösterir ve bir şey kurmadan önce sana sorar.
- **Which of my tools fit this project?** (Araçlarımdan hangileri bu projeye uyar?) `suggest` projenin manifest dosyalarını ve README'sini okur; ajanın uyan notları seçer ve projede kullanılan, kaçınmayı not ettiğin bağımlılıkları belirtir.

## Her ajan ne alır

`repomagpie setup`'ın Linux, Windows ya da macOS'ta, Node.js 22.12 veya üstüyle her ajanda ayarladıkları ([ajanlar](../agents.md)):

| Ajan | MCP | Skill | Hook | Bir not paketten kaçınmanı söylediğinde |
|---|---|---|---|---|
| Claude Code | evet | evet | evet | hook sana sorar |
| Codex CLI | evet | evet | evet | hook ilk denemeyi durdurur; ajanın sana sorar |
| Cursor | evet | evet | evet | hook ilk denemeyi durdurur; ajanın sana sorar |
| Gemini CLI | evet | evet | evet | hook sana sorar |
| VS Code (GitHub Copilot) | evet | evet | hayır | hook yok; MCP sunucusu ve skill kontrol eder |
| Antigravity CLI | evet | evet | evet | hook sana sorar |
| Copilot CLI | evet | evet | evet | hook ilk denemeyi durdurur; ajanın sana sorar |

Claude Code'da [eklenti](#claude-code-eklentisi), `setup` olmadan aynı MCP sunucusunu, skill'i ve hook'u verir; not aracı (note tool) sen açana kadar kapalıdır. Codex CLI yeni bir hook'u ancak sen ona `/hooks` içinde güvendikten sonra çalıştırır. MCP ya da [Agent Skills](https://agentskills.io) destekleyen diğer ajanlar sunucuyu ya da skill'i kullanabilir: [elle kurulum](../setup-by-hand.md) sayfasına bak. Paketin çalışma zamanı bağımlılığı yoktur ve ASCII dışında harfler içeren yollar çalışır.

## Claude Code eklentisi

Claude Code'da eklenti; skill'i, MCP sunucusunu ve hook'u tek adımda kurar, `repomagpie setup` gerekmez.

Önce marketplace'i ekle:

```text
/plugin marketplace add Varshavia/RepoMagpie
```

Sonra eklentiyi kur:

```text
/plugin install repomagpie@repomagpie
```

Terminalden: `claude plugin marketplace add Varshavia/RepoMagpie`, ardından `claude plugin install repomagpie@repomagpie`. Claude Code, `repomagpie` paketini npm'den, bu deponun marketplace'inin listelediği sürümle çeker.

- **`PATH` üzerinde Node.js 22.12 veya üstü gerekir.** Eklenti, hook için de MCP sunucusu için de `node`'u adıyla başlatır. Claude Code'u başlattığın yerde `node --version` çalıştır.
- **Not aracı varsayılan olarak kapalıdır.** Eklenti notlarını okur, ama sen `/config` içinde **Note tool**'u açıp (eklentinin satırı, "Note tool · repomagpie") Claude Code'u yeniden başlatana kadar Claude bir Verdict kaydedemez. Sonra Claude yalnızca senin sözlerini kaydeder, bir Verdict'in yerine asla başkasını yazmaz ve her kayıttan önce sormaz ([karar 0065](../decisions/0065-the-plugin-note-tool-off-by-default.md)).
- **Komutla aynı günlüğü okur:** `~/.magpie` ya da Claude Code başladığında `MAGPIE_HOME`'un gösterdiği klasör.
- **`repomagpie` komutunu eklemez.** `repomagpie note`, `ui`, `discover`, `doctor` ve diğer ajanların için npm paketini de yükle (`npm install -g repomagpie`). O zaman eklenti açıkken `repomagpie setup` Claude Code'u atlar, `repomagpie doctor` da eklentiyi raporlar.
- **Daha önce `setup` ile mi kurdun?** İkisinden birini tut: `repomagpie setup --remove --agents claude-code`, setup'ın Claude Code girdilerini kaldırır. O zamana kadar `doctor` uyarır ve kaçındığın bir kurulum yine yalnızca bir kez sorulur.
- **Güncellemek için:** `claude plugin marketplace update repomagpie`, ardından `claude plugin update repomagpie@repomagpie`. Otomatik güncellemesini açmadıkça (`/plugin`, Marketplaces) Claude Code bu marketplace'i kendiliğinden güncellemez.
- **Kaldırmak için:** `/plugin uninstall repomagpie@repomagpie`. Claude Code eklentinin klasörünü önbelleğinde tutabilir; `repomagpie doctor` buna önbellekteki kopya (cached copy) der.

## RepoMagpie neyi çalıştırır, ne gönderir, ne indirir

Eklenti için de npm kurulumu için de aynıdır. Her ayrıntı [SECURITY.md](../../SECURITY.md#what-repomagpie-reads-writes-and-sends) içinde.

- **Kurulum:** npm, eklenti içinse Claude Code, `repomagpie` paketini npm kayıt deposundan (registry) çeker. Paketin kurulum betiği ve çalışma zamanı bağımlılığı yoktur.
- **Hook**, ajanının çalıştırdığı her kabuk komutundan önce çalışır (Claude Code'da `Bash`, `PowerShell` ve `Monitor` araçları). Node, komutu okuyan `repomagpie hook`'u başlatır; komut paket kuruyorsa hook günlüklerini okur ve senin notunla yanıt verir ya da hiçbir şey söylemez. Komutu asla çalıştırmaz, asla onaylamaz ve ağı asla kullanmaz. Codex CLI, Cursor ve Copilot CLI hook'ları, günlüğünün `.cache/` klasöründe bir yeniden deneme kaydı tutar.
- **MCP sunucusu**, ajanın açık olduğu sürece çalışır. Ajan onu başlatır ve onunla stdin ve stdout üzerinden konuşur: port yok, ağ isteği yok. Araçları günlüklerini okur; `note` aracı, yalnızca sen açtığında, Verdict'ini yazar.
- **Senin çalıştırdığın komutlar:**
  - GitHub'ın API'si (`api.github.com`), salt okuma GET istekleriyle: `repomagpie note`'a, `import`'a ya da uygulamanın Add sayfasına bir GitHub deposu verdiğinde ve `repomagpie discover` ya da uygulamanın Discover sayfasıyla aradığında. Bunlar o deponun adını ya da aramanı, varsa GitHub token'ını gönderir, notlarını asla göndermez.
  - `gh auth token`, bir kez: bunlardan biri ya da `doctor` bir token'a ihtiyaç duyduğunda ve ne `GITHUB_TOKEN` ne de `GH_TOKEN` ayarlı olduğunda.
  - `repomagpie setup`, sen onay verdikten sonra girdilerini eklemek ya da kaldırmak için ajanlarının kendi komutlarını (`claude`, `codex`, `gemini`, `code`) çalıştırır. `setup` ve `doctor`, `claude --version` çalıştırır.
  - `repomagpie ui` yalnızca `127.0.0.1` üzerinde dinler ve tarayıcını açar. Project görünümü yerel `git`'ini çalıştırır, fetch yapmaz.
- **Asla:** telemetri, kendine ait bir model ya da API anahtarı, notlarını göndermek, bir paket kurmak ya da bir notta bulunan bir komutu çalıştırmak.

## Notlarını ekibinle paylaş

Proje günlüğü, depodaki bir `.magpie/` klasörüdür ve kodla birlikte commit'lenir. RepoMagpie'nin hook'u ve `recall` onu her katkıcı için, kişinin kendi günlüğünün yanında okur.

```sh
repomagpie note pdfkit "avoid: async streams painful; use puppeteer" --to project
git add .magpie && git commit -m "Add our note on pdfkit"
```

Ya da kendi notlarından birini oraya kopyala: `repomagpie adopt pdfkit`. Bir ekip arkadaşının ajanı `npm install pdfkit` çalıştırmak üzereyken hook önce ona sorar; onun `search` ve `suggest` komutları da notu bulur. Depoyu okuyabilen herkes notlarını da okuyabilir.

`repomagpie ui`'da Project görünümü deponun adını verir ve paylaşılan notların commit ve push edilip edilmediğini söyler.

![repomagpie ui'da Project görünümü: github.com'daki acme/checkout ve "Shared notes are committed." satırı, altında proje günlüğünün üç notu; zod açık ve kişisel günlüğünde de onunla ilgili bir not olduğunu söylüyor](../assets/screen-project.png)

## Yerel uygulama

`repomagpie ui` günlüklerini tarayıcıda açar. Search (Arama) sen yazmadan önce notlarını listeler, Import (İçe aktar) yapıştırdığın bir listeyi alır. Gelen kutusundaki (Inbox) bir notu gözden geçir: Verdict'i yaz, türü, alanları, etiketleri ve puanı seç, Ctrl+Enter'a bas.

![repomagpie ui'da gelen kutusu incelemesi: Understand-Anything için yazılmakta olan Verdict; önerilen alanlar olarak çerçeveli ai ve tooling, altında seçilecek etiketler](../assets/screen-inbox-review.png)

Bir paketi kontrol et (Check a package): kurulumdan önce günlüklerinin ne dediği ve hook'un her ajanda ne yaptığı.

![repomagpie ui'da Check a package: pdfkit'in kaçınma notu, ajana göre hook'un önce sorduğunu ya da ilk denemeyi durdurduğunu söylüyor; left-pad'in notu yok, bu yüzden hook sessiz kalıyor](../assets/screen-check-package.png)

Bu proje için öneri (Suggest for this project): uyan notlar ve her birinin neden aday olduğu.

![repomagpie ui'da Suggest: @playwright/test bağımlılığıyla eşleşen microsoft/playwright ilk sırada; pdfkit, kaçınma notu olan ve kullanımda olan bir paket olarak en sonda listeleniyor, yerine pdf-lib ve puppeteer var](../assets/screen-suggest.png)

Bir günlüğü grafik olarak gör: notlar, etiketleri, `[[links]]` ve alternatifler; istersen alana göre renkli. Bir nota tıkla, grafiğin yanında oku ve düzenle.

![repomagpie ui'daki grafik sayfası, alana göre renkli: 42 not, 13 etiket ve 75 bağlantı; #self-hosting, #ai-agents ve #frontend gibi en çok bağlantısı olanlar yanında listeleniyor](../assets/screen-graph.png)

## Benzerleriyle karşılaştırma

| Araç | Ne bilir | Ne zaman görürsün |
|---|---|---|
| Yıldız yöneticileri, örneğin [Starcat](https://github.com/starcat-app/Starcat) ve [GithubStarsManager](https://github.com/AmintaCCCP/GithubStarsManager) | Yıldızladığın depolar, etiketleri ve notlarıyla | Daha sonra aradığında |
| Tedarik zinciri tarayıcıları, örneğin [Socket Firewall Free](https://github.com/SocketDev/sfw-free) | Küresel verilerden kötü amaçlı yazılım, güvenlik açıkları ve popülerlik | Bir kurulumdan önce |
| RepoMagpie | Senin ve ekibinin kararları | Bir kurulumdan önce, arama yaptığında ve bir projeye başladığında |

`CLAUDE.md` içindeki "avoid pdfkit" gibi bir satır tek bir projeyi kapsar. Bir RepoMagpie notu bütün projelerinde geçerlidir, aramada çıkar ve hook onu her kurulumda kontrol eder. Oturum ya da sohbet belleği değildir: araçlar hakkında senin yazdığın kararları hatırlar. Bir yıldız listesinde ya da awesome listesinde ajanının kullanabileceği bir görüş yoktur; bir notta vardır. RepoMagpie bir tarayıcı değildir: kötü amaçlı yazılım ya da güvenlik açığı bulduğunu asla iddia etmez; yanında bir tarayıcı çalıştır ([vizyon](../vision.md#non-goals)).

## SSS

<details>
<summary><strong>RepoMagpie notlarımı bir yere gönderiyor mu?</strong></summary>

Hayır. Günlüklerin makinendeki Markdown dosyalarıdır ve telemetri yoktur. Tek ağ istekleri GitHub'ın API'sine yapılan salt okuma çağrılarıdır: bir GitHub deposundan not eklediğinde ya da `discover` ile aradığında. Bunlar o deponun adını ya da aramanı, varsa GitHub token'ını (`GITHUB_TOKEN`, `GH_TOKEN` ya da GitHub CLI girişi) gönderir, notlarını asla göndermez. `repomagpie ui` yalnızca `127.0.0.1` üzerinde dinler. Ajanının okuduğu notları ajanın model sağlayıcısı da görür. [SECURITY.md](../../SECURITY.md#what-repomagpie-reads-writes-and-sends) sayfasına bak.

</details>

<details>
<summary><strong>RepoMagpie yapay zekâ kullanıyor mu?</strong></summary>

Kendine ait bir model kullanmaz: komutları adları ve kelimeleri eşleştirir, hiçbir modeli çağırmaz. Yapay zekâ, zaten kullandığın kodlama ajanıdır; notlarını skill ve MCP araçları üzerinden okur ve kaydeder. Skill ona Verdict'ini asla senin yerine yazmamasını, adını vermediğin bir notu asla silmemesini ve kaçınmayı not ettiğin bir paketi sana sormadan asla kurmamasını söyler; bu sonuncusunu bir hook da kontrol eder.

</details>

<details>
<summary><strong>Hook kurulumları engelliyor mu?</strong></summary>

Hiçbir kurulumu kalıcı olarak engellemez ve hiçbirini onaylamaz. Bir not paketten kaçınmanı söylediğinde hook sana sorar ya da ilk denemeyi durdurur ve ajanın sana sorar ([tablo](#her-ajan-ne-alır)); bir durdurmadan sonra aynı kurulum 10 dakika boyunca geçer. Başka bir not ya da RepoMagpie'deki bir hata hiçbir kurulumu durdurmaz. [Hook sözleşmesine](../spec.md#6-hook-contract) bak.

</details>

<details>
<summary><strong>Nasıl kaldırırım?</strong></summary>

`repomagpie setup --remove` çalıştır. Yalnızca RepoMagpie'nin kendi MCP girdilerini, hook'larını ve skill klasörlerini kaldırır, sonradan yaptığın değişikliklerin üzerine asla bir yedeği geri yüklemez; günlüklerini ve `setup`'ın yedeklerini bırakır. `--agents` ile, ortak skill klasörü başka bir ajan onu hâlâ okuyorsa yerinde kalır. Sonra `repomagpie setup --delete-backups` sorduktan sonra yedekleri siler, `npm uninstall -g repomagpie` de komutu kaldırır. Claude Code eklentisi için: `/plugin uninstall repomagpie@repomagpie`.

</details>

<details>
<summary><strong>Bir ekip onunla kurallarda anlaşabilir mi?</strong></summary>

Evet. Proje günlüğü, depodaki `.magpie/`, kodla birlikte commit'lenir ve her ekip arkadaşının ajanı `git pull` sonrası onu okur. Proje notuyla kişisel bir not çeliştiğinde proje notu geçerlidir. Kural değişikliklerini pull request'lerde gözden geçirin ve bir `CODEOWNERS` satırıyla onayı liderlere bırakın. Bkz. [ekip olarak çalışmak](../teams.md) (İngilizce).

</details>

<details>
<summary><strong>Notlarım nerede, onları elle düzenleyebilir miyim?</strong></summary>

Her not, YAML frontmatter'ı olan bir Markdown dosyasıdır: `~/.magpie/notes/` içinde ya da bir projenin `.magpie/notes/` klasöründe ([not şeması](../note-schema.md)). Onları herhangi bir editörde düzenle: RepoMagpie, alanları ya da bölümleri eksik olsa da elle yazılmış notları okur ve senin bölümlerini asla yeniden yazmaz. Günlüğünü başka bir yerde tutmak için `MAGPIE_HOME`'u ayarla ya da `--home` ver. `repomagpie delete` bir notu günlüğün `.trash/` klasörüne taşır.

</details>

## Belgeler

Belgeler İngilizcedir.

- [Spec](../spec.md): her komut, bayrak ve `--json` belgesi (`repomagpie --help` komutları listeler)
- [Ajanlar](../agents.md): her kodlama ajanının neyi desteklediği ve [elle kurulum](../setup-by-hand.md)
- [Not şeması](../note-schema.md): bir notun biçimi
- [Yerel uygulama](../ui.md): ekranlar, API ve güvenlik kuralları
- [RepoMagpie'yi bir hafta test etmek](../testing/TESTING_tr.md): RepoMagpie ile bir haftanın adımları ve geri bildirimin nasıl gönderileceği
- [Vizyon](../vision.md), [rakipler](../competitors.md) ve [kararlar](../decisions/)

## Katkıda bulunmak

Hata bildirimlerine, fikirlere ve pull request'lere açığız. [CONTRIBUTING.md](../../CONTRIBUTING.md) beş dakikalık kurulumu, çalıştırılacak testleri ve bir issue'yu nasıl üstleneceğini anlatır: [`good first issue`](https://github.com/Varshavia/RepoMagpie/labels/good%20first%20issue) etiketli olanlara bak. Herkes [davranış kurallarına](../../CODE_OF_CONDUCT.md) uyar. Bir güvenlik açığı bildirmek için [SECURITY.md](../../SECURITY.md) sayfasına bak.

## Lisans

[MIT](../../LICENSE) © 2026 Yusuf Suat Babacan
