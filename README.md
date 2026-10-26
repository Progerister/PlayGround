# AION 2 · Путь к 2000 GS

Гайд-трекер по прокачке gear score с **1600 до 2000** в Aion 2 Global: что фармить,
где брать карты Арканы, сколько тратить Odyle и какие подземелья открывают следующие
пороги. Один и тот же код работает как сайт и как Android-приложение (WebView-оболочка
с Material You).

## Ссылки

- 🌐 **Сайт:** <https://raw.githack.com/Progerister/PlayGround/web/>
- 📦 **APK 1.0.1:** <https://raw.githack.com/Progerister/PlayGround/web/apk/aion2gs-1.0.1.apk>
- 📡 **Живые данные:** <https://raw.githubusercontent.com/Progerister/PlayGround/web/data/guide.json>
- 🌿 **Ветка деплоя:** [`web`](https://github.com/Progerister/PlayGround/tree/web)

Установка APK: разрешите установку из неизвестных источников (Android 8+), пакет
`com.playground.aion2gs`, minSdk 26.

## Что внутри

| Экран | Что делает |
| --- | --- |
| Маршрут | Три порога GS, следующий шаг, трекер текущего GS (1600 → 2000) |
| Фарм | 10 карточок локаций: что падает, сколько стоит, куда идти |
| Аркана | Калькулятор 5 слотов: градус × уровень карты → GS (до 400) |
| Чеклист | 21 пункт, дневные/недельные блоки со сбросом по серверу |
| Данные | Источники, таблицы порогов, лента обновлений |

- **Живые данные:** контент лежит в `data/guide.json`, приложение тянет его из сети
  (pull-to-refresh или кнопка «обновить») и показывает источник в строке ленты —
  `из сети` / `из памяти` / `встроенная копия` / `офлайн`. Встроенная копия
  (`js/guide-data.js`) работает без интернета.
- **Material You:** палитра берётся из обоёв Android 13+ через
  `AndroidBridge.getDynamicColors()`, тема — Авто/Светлая/Тёмная.
- **Офлайн:** service worker отдаёт оболочку из кэша, но JS/CSS/гайд обновляет
  по сети сразу после публикации.

## Сборка

```bash
# 1. контент: guide/source.json -> data/guide.json (+ проверка источников в сети)
node scripts/build-guide.mjs --online

# 2. Android-пакет (aapt2 -> javac -> d8 -> apksigner, без Gradle)
GUIDE_URL="https://raw.githubusercontent.com/Progerister/PlayGround/web/data/guide.json" \
APK_URL="https://raw.githack.com/Progerister/PlayGround/web/apk/aion2gs-1.0.1.apk" \
VERSION_NAME=1.0.1 VERSION_CODE=2 ./build.sh        # -> dist/aion2gs-1.0.1.apk

# 3. статическая версия для деплоя (web/ пересобирается целиком)
node scripts/build-web.mjs && cp dist/*.apk web/apk/
```

Требуется Android SDK (`ANDROID_HOME`) с `build-tools/35.0.0` и `platforms/android-35`,
Java 17+ и `zip`/`unzip`. `DEBUG=1 ./build.sh` собирает отладочный пакет с
`android:debuggable` (для Chrome DevTools над WebView).

Деплой — ветка `web`: её содержимое и есть опубликованный сайт.

## Источники цифр

Числа сверяются автоматически при сборке (`--online`, сейчас 4/4 отвечают 200):

- [Raid Relay — Gear Score Guide](https://raidrelay.com/aion-2-gear-score-guide)
- [Aion 2 Companion — Gear score](https://aion2.grimvane.app/companion/wiki/item-level/)
- [Aion 2 Guides (akunito) — Gear](https://aion2.akunito.com/en/systems/gear/)
- [MMOexp — AION 2 Gear Score Guide](https://www.mmoexp.com/aion2/gear-score-guide.html)

---

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/Progerister/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/Progerister/PlayGround)

- 🎮 [Open the project](https://omgithub.com/Progerister/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=Progerister%2FPlayGround).
- 💻 [Explore the source](https://github.com/Progerister/PlayGround).
- 🛠️ [Check build runs](https://github.com/Progerister/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/Progerister/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/Progerister).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->
