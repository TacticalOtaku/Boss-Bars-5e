# Шрифты OFL с кириллицей для 30 пресетов

Тикет: [#5](https://github.com/TacticalOtaku/Boss-Bars-5e/issues/5), карта [#1](https://github.com/TacticalOtaku/Boss-Bars-5e/issues/1). Дата: 2026-10-25.

## Коротко

- **38 шрифтов** из Google Fonts под **SIL OFL 1.1** покрывают кириллицу и латиницу и подходят для имён боссов. Ещё 18 оставлены в резерве.
- **Настоящих готических (блэклеттер) и рунических шрифтов с кириллицей под OFL нет.** Все блэклеттеры Google Fonts и рунный Noto содержат только латиницу (таблица ниже). Вместо готики берём церковнославянский устав проекта Ponomar (Ponomar, Triodion, Monomakh, Shafarik) и Ruslan Display. Для «рун» подходят угловатые шрифты: Tektur, Stalinist One, Handjet.
- **Вес набора из 38 шрифтов** (подмножества `cyrillic` + `latin`): обычное начертание около **1,6 МБ**, вместе с жирным или вариативным файлом около **2,0 МБ**. Подмножества `cyrillic-ext` и `latin-ext` добавят ещё около 1,2 МБ (только 400). Для сравнения: в старом `boss-bar` было 4 шрифта на 251 КБ.
- **Лениво грузить можно, и проще всего через CSS.** Правило `@font-face` в стилях модуля с `unicode-range` по спецификации скачивается только тогда, когда шрифт реально используется на странице. `CONFIG.fontDefinitions`, наоборот, грузит все начертания сразу при старте канваса. Для 38 шрифтов его брать нельзя.

## Как мерили

- Список, подмножества, начертания и лицензия взяты из API Fontsource, это зеркало Google Fonts: `https://api.fontsource.org/v1/fonts?subsets=cyrillic` (297 шрифтов) и `https://api.fontsource.org/v1/fonts/<id>`. У всех шрифтов ниже `license: "OFL-1.1"`, `type: "google"`.
- Размеры получены HEAD-запросом (`Content-Length`) к CDN Fontsource. Статические файлы: `https://cdn.jsdelivr.net/fontsource/fonts/<id>@latest/<subset>-<weight>-normal.woff2`, вариативные: `.../<id>:vf@latest/<subset>-wght-normal.woff2`. Файлы не скачивались.
- Проверка метода: `forum` cyrillic 400 на CDN весит 16 528 байт. Ровно столько же весит `forum-cyrillic-400-normal.woff2` в старом `boss-bar` (`%LOCALAPPDATA%/FoundryVTT/Data/modules/boss-bar/assets/fonts`).
- Размеры указаны в КБ (1024 байт) на одно начертание и одно подмножество. Это примерные числа: Google периодически пересобирает шрифты.
- Источник для каждого шрифта: `https://fonts.google.com/specimen/<Имя+Шрифта>` и `https://fontsource.org/fonts/<id>`. В таблице стоит id Fontsource.

## Основной набор: 38 шрифтов

Сокращения: «Кир», «Лат» — обычное начертание (400) в подмножествах `cyrillic` и `latin`. В колонке «Жирный» указан либо статический 700 (кир/лат), либо вариативный файл (VF) с диапазоном весов (кир/лат). VF заменяет оба статических файла. «нет» значит, что начертание одно. Тогда браузер нарисует синтетический жирный, если не запретить это через `font-synthesis`.

### Антиква и дисплейные с засечками (благородство, магия, древность)

| # | Шрифт (id) | Кир | Лат | Жирный | Заметка |
|---|---|---|---|---|---|
| 1 | Cormorant (`cormorant`) | 13.2 | 21.9 | VF 300–700: 21.5 / 34.5 | уже был в boss-bar |
| 2 | Cormorant Unicase (`cormorant-unicase`) | 10.7 | 20.6 | 700: 10.5 / 20.2 | унициал, «эльфийский» вид |
| 3 | Forum (`forum`) | 16.1 | 23.3 | нет | уже был в boss-bar, римская капитель |
| 4 | Yeseva One (`yeseva-one`) | 11.1 | 17.1 | нет | уже был в boss-bar |
| 5 | Playfair Display SC (`playfair-display-sc`) | 14.2 | 24.4 | 700: 14.8 / 25.9 | контрастные капители |
| 6 | Prata (`prata`) | 12.8 | 18.8 | нет | дидона |
| 7 | Old Standard TT (`old-standard-tt`) | 14.2 | 23.1 | 700: 14.1 / 23.5 | дореволюционная книжная |
| 8 | Oranienbaum (`oranienbaum`) | 12.4 | 20.0 | нет | узкая контрастная |
| 9 | Alegreya SC (`alegreya-sc`) | 16.4 | 28.4 | 700: 17.4 / 29.9 | каллиграфические капители |
| 10 | Vollkorn SC (`vollkorn-sc`) | 16.8 | 22.9 | 700: 16.7 / 23.3 | тяжёлые капители |
| 11 | Bona Nova SC (`bona-nova-sc`) | 21.6 | 32.9 | 700: 21.5 / 32.8 | польская антиква |
| 12 | Viaoda Libre (`viaoda-libre`) | 20.1 | 27.6 | нет | высококонтрастная узкая |
| 13 | Philosopher (`philosopher`) | 13.2 | 21.5 | 700: 12.8 / 21.7 | «мистический» гуманист |
| 14 | Kurale (`kurale`) | 14.5 | 24.0 | нет | сказочная, с изломами |

### Древнерусский устав (замена готики)

| # | Шрифт (id) | Кир | Лат | Жирный | Заметка |
|---|---|---|---|---|---|
| 15 | Ruslan Display (`ruslan-display`) | 4.5 | 8.3 | нет | уже был в boss-bar |
| 16 | Ponomar (`ponomar`) | 19.4 | 27.8 | нет | церковнославянский устав |
| 17 | Triodion (`triodion`) | 17.2 | 26.3 | нет | устав, тяжелее |
| 18 | Monomakh (`monomakh`) | 18.1 | 24.4 | нет | полуустав |
| 19 | Shafarik (`shafarik`) | 16.5 | 25.3 | нет | устав и глаголица |

У всех пяти в Fontsource есть подмножество `latin`, и весит оно 24–28 КБ, то есть это полная латиница. Как латиница выглядит в уставном стиле, нужно проверить глазами до выбора пресета.

### Sci-fi, техно, «руны»

| # | Шрифт (id) | Кир | Лат | Жирный | Заметка |
|---|---|---|---|---|---|
| 20 | Tektur (`tektur`) | 5.0 | 7.1 | VF 400–900: 8.5 / 11.9 | угловатая, годится под «руны» |
| 21 | Stalinist One (`stalinist-one`) | 6.5 | 11.1 | нет | широкая, тяжёлая |
| 22 | Russo One (`russo-one`) | 4.4 | 7.2 | нет | техно |
| 23 | Exo 2 (`exo-2`) | 7.7 | 16.3 | VF 100–900: 19.1 / 39.9 | sci-fi |
| 24 | Jura (`jura`) | 7.3 | 13.8 | VF 300–700: 12.9 / 23.7 | тонкая sci-fi |
| 25 | Unbounded (`unbounded`) | 11.9 | 19.5 | VF 200–900: 30.7 / 49.7 | широкий гротеск |
| 26 | Handjet (`handjet`) | 4.7 | 7.2 | VF 100–900: 5.0 / 7.5 | точечно-матричная, «руническая» |
| 27 | Press Start 2P (`press-start-2p`) | 6.7 | 12.2 | нет | пиксель-арт |
| 28 | Dela Gothic One (`dela-gothic-one`) | 7.1 | 13.5 | нет | жирный «готический» гротеск (японская школа) |

### Рукописные и каллиграфия

| # | Шрифт (id) | Кир | Лат | Жирный | Заметка |
|---|---|---|---|---|---|
| 29 | Bad Script (`bad-script`) | 25.2 | 33.9 | нет | беглый почерк |
| 30 | Marck Script (`marck-script`) | 10.3 | 13.0 | нет | перьевая |
| 31 | Great Vibes (`great-vibes`) | 44.2 | 41.8 | нет | вязь, тяжёлая |
| 32 | Amatic SC (`amatic-sc`) | 20.3 | 27.6 | 700: 20.0 / 26.6 | узкий маркер |
| 33 | Neucha (`neucha`) | 18.9 | 24.8 | нет | небрежная |

### Хоррор, гранж, гротеск

| # | Шрифт (id) | Кир | Лат | Жирный | Заметка |
|---|---|---|---|---|---|
| 34 | Rubik Wet Paint (`rubik-wet-paint`) | 39.3 | 74.5 | нет | подтёки, «кровь» |
| 35 | Rubik Glitch (`rubik-glitch`) | 36.2 | 71.2 | нет | глитч, демоны и киберпанк |
| 36 | Rubik Beastly (`rubik-beastly`) | 56.9 | 98.8 | нет | «звериные» формы |
| 37 | Underdog (`underdog`) | 11.6 | 16.4 | нет | кривой, гоблинский |
| 38 | Oi (`oi`) | 14.7 | 25.8 | нет | ультражирный, «варвар» |

Жирное начертание есть у 14 шрифтов из 38: 7 вариативных и 7 со статическим 700. У остальных 24 оно одно, и обычно это уже дисплейный, визуально жирный рисунок.

## Резерв: 18 шрифтов

Все под OFL 1.1, с кириллицей и латиницей. Цифры: кир / лат 400, КБ.

- Cormorant SC (`cormorant-sc`) 10.7 / 20.4, есть 700. Alice (`alice`) 17.4 / 25.2. Ledger (`ledger`) 5.1 / 10.8. EB Garamond (`eb-garamond`) 13.0 / 23.3, VF. Spectral SC (`spectral-sc`) 19.8 / 26.9, есть 700.
- Pochaevsk (`pochaevsk`) 16.5 / 25.5, устав.
- Days One (`days-one`) 9.1 / 14.9. Pixelify Sans (`pixelify-sans`) 3.1 / 7.5, VF.
- Caveat (`caveat`) 44.1 / 47.7, VF. Comforter Brush (`comforter-brush`) 61.7 / 130.3, слишком тяжёлая латиница.
- Rubik Burned (`rubik-burned`) 55.9 / 96.9. Rubik Dirt (`rubik-dirt`) 194.1 / 302.3 и Rubik Distressed (`rubik-distressed`) 123.5 / 192.0 — очень тяжёлые, не брать.
- Kelly Slab (`kelly-slab`) 12.4 / 15.4. Lobster (`lobster`) 39.0 / 33.1. Seymour One (`seymour-one`) 15.5 / 26.6. Poiret One (`poiret-one`) 4.5 / 7.6. Orelega One (`orelega-one`) 12.9 / 23.5.

## Что проверено и не подходит (нет кириллицы)

По API Fontsource у этих шрифтов только латиница (и вьетнамский, и руны у Noto). Все под OFL 1.1:

| id | Подмножества |
|---|---|
| `pirata-one` | latin, latin-ext |
| `grenze-gotisch` | latin, latin-ext, vietnamese |
| `unifrakturmaguntia`, `unifrakturcook` | latin |
| `germania-one`, `macondo` | latin |
| `new-rocker`, `metamorphous`, `medievalsharp`, `uncial-antiqua`, `almendra` | latin, latin-ext |
| `cinzel`, `cinzel-decorative` | latin, latin-ext |
| `noto-sans-runic` | latin, latin-ext, runic |

Вне Google Fonts искал так:

- OFL-фрактуры из [Freie Fraktur](https://gin.g-node.org/TheChymera/freie-fraktur) и textura [Missaali](https://tug.ctan.org/obsolete/help/Catalogue/entries/missaali.html) кириллицу не заявляют.
- Кириллические блэклеттеры, которые нашлись, коммерческие: Blonde Fraktur (ParaType) и [Gaudeamus](https://www.myfonts.com/fonts/znakomesto/gaudeamus).
- Рунные OFL-шрифты на fontlibrary.org ([RunaSans](https://fontlibrary.org/en/font/runasans), Runa Mono) покрывают только Basic Latin и руны.

Вывод: нужен готический или рунический шрифт с кириллицей под OFL — придётся делать производный шрифт самим (OFL это разрешает при смене имени). Это отдельная работа, в тикет не входит.

## Как Foundry грузит шрифты (исходники 14.368)

Все пути от `D:\Foundry\Foundry Virtual Tabletop\resources\app`.

1. **`CONFIG.fontDefinitions`** (`client/config.mjs:1606–1658`) — это `Record<family, {editor, fonts: FontDefinition[]}>`, где `FontDefinition` = `FontFaceDescriptors & {urls}`. Сам Foundry регистрирует там Amiri, Bruno Ace, Modesto Condensed и Signika.
2. **`FontConfig._loadFonts()`** (`client/applications/settings/menus/font-config.mjs:201–223`) обходит `CONFIG.fontDefinitions` и настройку `core.fonts` (`_collectDefinitions`, строка 232). Для каждого семейства вызывается `loadFont`, гонка идёт с таймаутом 4500 мс.
3. **`FontConfig.loadFont(family, definition, {document})`** (строки 164–190) для каждого начертания делает `new FontFace(...)`, `await fontFace.load()` и `document.fonts.add()`. Вызов `FontFace.load()` скачивает файл сразу, независимо от того, используется ли шрифт и что указано в `unicodeRange`. Если `definition.editor`, семейство попадает в `getAvailableFontChoices()`, а это выпадающие списки шрифтов в рисунках и заметках (`client/applications/sheets/drawing-config.mjs:110`, `note-config.mjs:59`, `palette/drawing-palette.mjs:74`).
4. **Когда это происходит:** `Game#initializeCanvas` первым делом выполняет `await FontConfig._loadFonts()` (`client/game.mjs:1057–1060`). Он запускается после хука `setup` (строки 740 и 763) и до `ready` (779). Значит, всё, что модуль положил в `CONFIG.fontDefinitions` в `init`, скачивается целиком при каждой загрузке клиента и задерживает отрисовку канваса до 4,5 с.
5. **Отсоединённые окна:** `client/applications/detached/window-manager.mjs:213` копирует в новое окно все `link[rel="stylesheet"]` и `style`, а в строке 237 снова вызывает `_loadFonts({document})`. Поэтому шрифты из CSS модуля работают и в pop-out окнах, а шрифты из `CONFIG.fontDefinitions` грузятся туда повторно.
6. **Сам Foundry** объявляет свои шрифты обычным `@font-face` в `public/css/foundry2.css:142` и далее. В манифесте пакета поля для шрифтов нет: `common/packages/base-package.mjs` слово `fonts` не содержит.

### Варианты ленивой загрузки

- **A. `@font-face` в CSS модуля с `unicode-range`. Рекомендуется.** Так был устроен старый `boss-bar`: `styles/bar/fonts.css`, по правилу на каждое подмножество и вес, `font-display: swap`. CSS Fonts 4, §4.8.1 ([w3.org/TR/css-fonts-4](https://www.w3.org/TR/css-fonts-4/#font-face-loading)): браузер обязан скачивать только шрифты, на которые ссылаются применённые стили, а качать все объявленные — нарушение спецификации. MDN про [`unicode-range`](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/unicode-range): если на странице нет ни одного символа из диапазона, файл не скачивается. Итог: в мире, где у боссов два-три пресета, клиент скачает только их шрифты и только нужный алфавит. Остальные 35 лежат в архиве модуля и трафика не дают. Цена: при первом показе босса возможна вспышка запасного шрифта (FOUT). Её снимает `document.fonts.load('1em "Family"')` перед анимацией появления.
- **B. `FontConfig.loadFont(family, {editor:false, fonts:[...]})` по требованию.** Это публичный статический метод, его можно вызвать в момент показа босса. Минусы: каждое начертание скачивается целиком без учёта `unicode-range`, грузится только в текущий `document`, а для pop-out окон нужен свой вызов. Смысл есть только если шрифт нужен на канвасе PIXI или в редакторе текста Foundry.
- **C. `CONFIG.fontDefinitions`. Не годится для 38 шрифтов:** 1,6–2,0 МБ уйдут каждому клиенту при каждой загрузке и задержат канвас. Подходит разве что для одного-двух шрифтов, которые ГМ хочет видеть в рисунках и заметках.

Библиотека и редактор пресетов, где показаны превью всех 38 шрифтов сразу, при открытии скачают их все (≈1,6 МБ). Это нормально: только у ГМа и только при открытии.

## Вес модуля

| Вариант | Вес woff2 |
|---|---|
| 38 шрифтов, только 400, `cyrillic` + `latin` | ≈ 1 596 КБ |
| 38 шрифтов, 400 + жирный (700 или VF вместо обоих), `cyrillic` + `latin` | ≈ 2 057 КБ |
| плюс `cyrillic-ext` + `latin-ext` (400) | + ≈ 1 174 КБ |
| для сравнения: старый `boss-bar` (4 шрифта, 4 подмножества) | 251 КБ |

Почти четверть веса (≈ 377 КБ) дают три шрифта Rubik: Wet Paint, Glitch и Beastly. Без них 35 шрифтов уложатся примерно в 1,2 МБ. Ещё нужно положить 38 файлов `OFL.txt` (≈ 4,5 КБ каждый): лицензия требует распространять её вместе со шрифтом.

## Открытые вопросы

1. Брать ли `-ext`-подмножества (≈ +1,2 МБ)? Обычный `cyrillic` (`U+0400-045F, U+0490-0491`) уже покрывает русский, украинский (ґ, є, і, ї) и белорусский (ў). `latin` (`U+0000-00FF`) покрывает западноевропейскую латиницу. `cyrillic-ext` нужен для казахского, татарского и церковнославянского, `latin-ext` — для польских, чешских и прочих диакритик.
2. Как быть с жирным у 24 шрифтов с одним начертанием: скрывать переключатель «жирный» в пресете или разрешить синтетический (`font-synthesis: weight`)?
3. Нужен ли настоящий готический или рунический шрифт с кириллицей настолько, чтобы делать свой производный OFL-шрифт?
4. Должны ли шрифты пресетов быть доступны в рисунках и заметках Foundry (`editor: true` через вариант B), или это только внутренняя деталь полос?
