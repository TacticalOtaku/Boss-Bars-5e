# Точки встраивания UI в Foundry 14.367 (тикет #3)

Только факты из исходников. Пути Foundry даны от `D:\Foundry\Foundry Virtual Tabletop\resources\app`,
пути dnd5e — от `D:\Foundry\reference\dnd5e-5.3.3`. Номера строк — по этим файлам.

## 0. Какие версии читались

- Установленный Foundry на этой машине — **14.367**, а не 14.368, как сказано в общем `CLAUDE.md`:
  `package.json:9` — `"build": 367`, `package.json:90` — `"version": "14.367.0"`. Значит, всё ниже прочитано прямо
  в целевой версии.
- Установленный `Data/systems/dnd5e/system.json` тоже **5.3.3**, а не 6.0.6. Эталон
  `D:\Foundry\reference\dnd5e-5.3.3` совпадает с целевой версией. dnd5e 5.3.3 в `system.json:6-9` указывает
  совместимость `minimum 13.347`, `verified 14`.
- Отличия 14.368 взяты только из официальных заметок к выпуску https://foundryvtt.com/releases/14.368
  (16.09.2026), см. раздел 8.

## 1. Слой оверлея: `#interface`, `#ui-middle` и соседи

### Разметка (`templates/views/game.hbs:1-32`)

```
body.game
├─ <template id="camera-views">      ← док камер (вставляется до или после #interface)
├─ #interface
│  ├─ section#ui-left  > #ui-left-column-1 (scene-controls, players) | #ui-left-column-2 (scene-navigation)
│  ├─ section#ui-middle
│  │   ├─ header#ui-top    > #loading (полоса загрузки сцены)
│  │   └─ footer#ui-bottom > #hotbar
│  └─ section#ui-right > #ui-right-column-1 (уведомления чата) | #sidebar
├─ #hud                                ← HTML-HUD над холстом, в координатах мира
├─ canvas#board
└─ #pause
```

### Геометрия (`public/css/foundry2.css`)

- `body.game`: `position: fixed; display: flex; overflow: hidden` (15326-15332).
- `#interface`: `display: flex; flex: 1; justify-content: center; position: relative` (15333-15339).
- `#ui-middle`: `flex: none; width: 60%`, по центру `#interface`, колонка `space-between`,
  `pointer-events: none`, `z-index: var(--z-index-app)` (= 30), `transform: scale(var(--ui-scale))`,
  `transform-origin: top center`, `height: calc(100% / var(--ui-scale))` (15340-15352).
- `#ui-top` и `#ui-bottom` — по `height: 50%`, `width: 100%`. `#ui-top` прижат к верху, `#ui-bottom` к низу
  (15353-15364).
- `#ui-left`: `position: absolute; left: 0; width: 50%; padding: 16px`. Колонка 1 — 2×32 px кнопок контролов,
  колонка 2 (навигация сцен) — `flex: 0 0 200px` (15368-15394).
- `#ui-right`: `position: absolute; inset: 0 0 0 auto` (15395-15405). `#ui-right-column-1` — `flex: 1`, туда
  `ChatLog` кладёт всплывающие уведомления чата (`client/applications/sidebar/tabs/chat.mjs:462`).
- Шкала z-index на `body` (`foundry2.css:325-332`): canvas 0, app 30, ui 60, window 100, tooltip 9999,
  notification 99999. `#hud` и `#pause` имеют `calc(var(--z-index-canvas) + 1)` (8881-8886, 8370-8384).
- `#notifications` (всплывашки `ui.notifications`): `position: fixed; top: 10vh; width: 100%; padding: 0 20%`,
  z-index 99999 (8678-8691). Они ложатся поверх верхней части `#ui-middle`.
- `#pause`: `position: fixed; top: calc(50vh - 100px); height: 180px; width: 100%` (8370-8384), то есть по центру
  экрана.
- Класс `.faded-ui` даёт полупрозрачность `--ui-fade-opacity` до наведения (8791-8798). Его носят
  `#scene-controls`, `#players`, `#scene-navigation`, `#hotbar`.

### Кто уже живёт в `#ui-top`

- Ядро: только `#loading` (`game.hbs:14-19`).
- **dnd5e 5.3.3 кладёт туда свой календарь.** `BaseCalendarHUD` (`id: "calendar-hud"`, `frame: false`,
  `positioned: false`, `dnd5e.mjs:2811-2823`) переопределяет `_insertElement` и делает
  `document.querySelector("#ui-middle #ui-top").append(...)` (`dnd5e.mjs:2860-2867`). Рендерится в
  `Hooks.once("ready")` (`dnd5e.mjs:82869`, `82892-82894`), если включён world-флаг `calendarConfig.enabled`
  (BooleanField, по умолчанию `false`, `dnd5e.mjs:48637`) и user-флаг `calendarPreferences.visible`
  (по умолчанию `true`, `dnd5e.mjs:48663`). CSS: `margin-block-start: 16px; margin-inline: 16px;
  block-size: var(--control-size); pointer-events: all` (`dnd5e.css:11997-12011`).

### Как туда встраиваться — готовый образец

- В ядре каждое singleton-приложение UI рендерится в свой `<template id="...">`: `ApplicationV2#_insertElement`
  заменяет элемент с тем же `id`, иначе делает `document.body.append` (`client/applications/api/application.mjs:952-973`).
- Образец модульного встраивания в `#ui-top` — тот же `_insertElement` календаря dnd5e (см. выше). Приложение
  с `window: {frame: false, positioned: false}` не позиционируется: `setPosition` сразу выходит при
  `!positioned` (`application.mjs:1094-1095`).
- В `CONFIG.ui` можно положить класс; в `Game#initializeUI` для каждого ключа создаётся `ui[k] = new cls()`
  (`client/game.mjs:1028-1030`). Но авторендер есть только у фиксированного списка ядра (`game.mjs:1042-1048`),
  поэтому свой элемент нужно рендерить самому.
- Порядок жизненного цикла: `init` (652) → регистрация настроек ядра (660) → `setup` (740) →
  `initializeCanvas` + `initializeUI` (763-764) → `activateSocketListeners` (778) → `ready` (779)
  (`client/game.mjs`). DOM `#interface` существует с `initializeUI`, то есть к `ready` гарантированно.

### Масштаб интерфейса (`core.uiConfig`)

- Схема настройки: `uiScale` 0.5–1.5, шаг 0.05; `fontScale`; `colorScheme.applications/interface`;
  `chatNotifications`; `fade.opacity/speed` (`client/applications/settings/menus/ui-config.mjs:59-80`).
- `Game#configureUI` ставит на `body` `--ui-scale`, `--ui-fade-*` (`client/game.mjs:1830-1833`), меняет
  `font-size` у `<html>` (1836-1838). Класс `performance-<low|med|high|max>` добавляется на `body` (1841-1843).
  Тема интерфейса — классы `themed theme-dark|theme-light` на `#interface` (1860-1880).
- **Ловушка:** `#ui-middle` уже масштабирован через `transform: scale(var(--ui-scale))`. Всё, что лежит внутри
  него, получает масштаб автоматически, а координаты `getBoundingClientRect()` — уже масштабированные. Позиции
  в процентах от `#ui-middle` считаются от его немасштабированного бокса (60% ширины `#interface` ×
  `100% / uiScale` высоты).
- **Ловушка:** при смене системной темы ОС вызывается `this.configureUI()` **без аргументов**
  (`client/game.mjs:1025`), и `--ui-scale` сбрасывается на `1`, пока настройку не применят снова. Надёжный
  источник масштаба — `game.settings.get("core", "uiConfig").uiScale`, а не CSS-переменная.
- В CSS и JS ядра нет обработки `prefers-reduced-motion` (поиск по `foundry2.css` и `client/` пуст). Для
  `performance-low` ядро только снимает размытие с окон (`foundry2.css:15536-15543`).

## 2. Сворачивание сайдбара

- `Sidebar` — `id: "sidebar"`, `frame: false`, `positioned: false` (`client/applications/sidebar/sidebar.mjs:25-35`).
- Состояние: `ui.sidebar.expanded` — класс `expanded` на `#sidebar-content` (113-115). Переключение:
  `collapse()`, `expand()`, `toggleExpanded(expanded)` (264-294).
- Хук: `Hooks.callAll("collapseSidebar", sidebar, collapsed)` (293). Второй аргумент — `true`, если **свёрнут**.
  Хук вызывается синхронно, в момент смены класса.
- Анимация чисто CSS: у `#sidebar-content` `margin-right: calc(var(--sidebar-full-width) * -1)`, в состоянии
  `expanded` — `0`, `transition: margin-right 250ms ease` (`foundry2.css:9177-9198`). Ширина
  `--sidebar-width: 300px` плюс `--sidebar-scroll-gutter: 12px` (9169-9171).
- **Факт для раскладки:** `#ui-right` абсолютный (`inset: 0 0 0 auto`), а `#ui-middle` — 60% ширины `#interface`
  по центру, от сайдбара не зависит. При сворачивании сайдбара `#ui-middle` **не двигается и не меняет размер**.
  Сайдбар просто уезжает за правый край поверх слоя.
- **Ловушка:** в момент хука сайдбар ещё в начале 250 ms анимации. Ядро само признаёт, что ширину в этот момент
  не измерить, и захардкодило `380 + 300 * expanded` для смещения хотбара (`chat.mjs:1554-1562`).
- Перекрытие (вычислено по CSS, на живом клиенте не проверено). `#ui-middle` начинается с 20% ширины
  `#interface` и заканчивается на 80%. Слева занято примерно 16 + 72 + 16 + 200 ≈ 304 px. Справа развёрнутый
  сайдбар — около 312 px плюс колонка вкладок. Пересечения нет примерно при ширине `#interface ≥ 1520 px`
  слева и примерно `≥ 1750–1800 px` справа (при `uiScale = 1`). На 1366–1680 px края `#ui-middle` уходят под навигацию сцен
  и развёрнутый сайдбар. Оба слоя `pointer-events: none`, но их интерактивные дети (`pointer-events: all`)
  перекрываются.

## 3. Смена разрешения окна

- Ядро вешает один слушатель `window.resize` (`client/game.mjs:2165`). `#onWindowResize` (2306-2316) вызывает:
  `setPosition` для приложений V1 и V2, `ui.webrtc.setPosition`, `ui.hotbar._onResize()`, `canvas._onResize()`.
- **Отдельного хука для модулей нет** (поиск `Hooks.call*` по resize пуст). Свой оверлей должен слушать
  `resize` сам или жить на чистом CSS.
- `Canvas#_onResize` пересчитывает `dimensions`, делает `renderer.resize(innerWidth, innerHeight)` и `pan`
  (`client/canvas/board.mjs:2445-2462`). При этом срабатывает `canvasPan` (`board.mjs:1775`).
- `Hotbar#_onResize` вешает классы `lg/md/sm/min` по `innerWidth / uiScale` и наличию вертикального дока камер
  (`client/applications/ui/hotbar.mjs:414-424`). Высота `#hotbar` меняется: `compact`, `sm` и `md.offset`
  дают две строки (`foundry2.css:8235-8239`).
- Минимум ядра: экран 1366×768, вьюпорт 1024×768 (`client/helpers/client-issues.mjs:43`, `49`). Ниже —
  только предупреждение (с debounce 250 ms, 250).
- **Ловушка — док камер.** `CameraViews#_onRender` ставит элемент дока **до или после `#interface`** внутри
  flex-`body`, а для горизонтального дока переключает `body.flexcol`
  (`client/applications/apps/av/cameras.mjs:223-230`). Значит, «игровая область» `#interface` меньше окна, когда
  включён AV-док, и её размер меняется без события `resize`.

## 4. Смена сцены

- `canvas#board`, `#hud` и `#interface` — разные элементы. Перерисовка холста DOM интерфейса не трогает.
- Порядок `Canvas#draw`: `canvasTearDown` (старой сцены, `board.mjs:1346`, аргументы `(canvas, {nextScene,
  nextLevel})`) → `canvasConfig` (759) → `canvasInit` (1170) → `canvasDraw` (1213) → `canvasReady` (1243;
  через `Hooks.call`, а не `callAll`, поэтому обработчик, вернувший `false`, обрывает цепочку).
- **В v14 есть уровни (Levels) сцены.** `Scene#view` перерисовывает холст и при смене **уровня** в той же сцене
  (`client/documents/scene.mjs:271-280`). Поэтому `canvasTearDown`/`canvasReady` срабатывают и без смены сцены.
- Пустой холст (нет сцены или уровня): `#drawBlank()` (`board.mjs:1139-1142`, `1444`), `canvasReady` **не**
  вызывается, `canvas.scene === null`, `canvas.ready === false`.
- Изменение флагов сцены холст не перерисовывает: полная перерисовка — только для размеров, сетки, вложенных
  коллекций и `weather` (`scene.mjs:1284-1291`).

## 5. Кнопка на HUD токена

- Класс: `TokenHUD extends HandlebarsApplicationMixin(BasePlaceableHUD)`, `id: "token-hud"`, одна часть
  `hud` с `root: true` и шаблоном `templates/hud/token-hud.hbs` (`client/applications/hud/token-hud.mjs:18-38`).
  Экземпляр — `canvas.hud.token` (`client/applications/hud/container.mjs:30`), класс берётся из
  `CONFIG.Token.hudClass`. dnd5e 5.3.3 класс не подменяет.
- `BasePlaceableHUD`: `tag: "form"`, `submitOnChange: true`, `frame: false`, `positioned: true`, свои
  `actions` (`placeable-hud.mjs:18-39`). Привязка: `bind(object)` → `render({force, position, object})`
  (184-186). Позиция — по `object.bounds` с учётом `canvas.dimensions.uiScale` (113-119).
- Шаблон — три колонки: `.col.left` (высота, уровни, сортировка, замок, настройки), `.col.middle` (bar1/bar2),
  `.col.right` (видимость, статусы, движение, …) (`templates/hud/token-hud.hbs:1-80`).
- Хук: рендер-хуки ApplicationV2 вызываются для каждого класса цепочки
  (`application.mjs:1724-1730`). Для HUD это `renderTokenHUD`, `renderHandlebarsApplication`,
  `renderBasePlaceableHUD`, `renderApplicationV2`, с аргументами `(app, element: HTMLElement, context,
  options)` (`application.mjs:542`, `591-594`).
- dnd5e сам пользуется `Hooks.on("renderTokenHUD", ...)` и захватывающим `click`/`contextmenu` на `document`
  (`dnd5e.mjs:25213-25218`, `25261-25275`, `25295-25305`). Это образец.
- **Ловушки:**
  - `root: true`: каждый рендер полностью заменяет содержимое, поэтому кнопку нужно добавлять в каждом
    `renderTokenHUD`.
  - Корень — `<form>` с `submitOnChange`: своя кнопка должна быть `type="button"`.
  - `data-action` срабатывает только для ключей из `options.actions` (`application.mjs:1920-1921`). Свой
    обработчик вешается напрямую на элемент.
  - HUD открывается только тем, кто может: `Token#_canHUD` — GM или OWNER актёра при активном слое токенов
    (`client/canvas/placeables/token.mjs:4695-4701`). Скрытие кнопки от игрока нужно делать самим
    (`game.user.isGM`).
  - `app.document` — TokenDocument, `app.actor` — `document.actor` (`token-hud.mjs:46-48`). Для незалинкованного
    токена это **синтетический актёр**: `actor.isToken`, его parent — TokenDocument
    (`client/documents/actor.mjs:138-141`). Его флаги пишутся в `ActorDelta` токена (`flags` есть в схеме
    дельты, `common/documents/actor-delta.mjs:55`), а не в базового актёра. Базовый актёр — `token.baseActor`.

## 6. Контролы сцены (панель ГМа)

- `SceneControls`, `id: "scene-controls"`, `.faded-ui`, `frame: false`, `positioned: false`
  (`client/applications/ui/scene-controls.mjs:101-113`).
- Хук: `Hooks.callAll("getSceneControlButtons", controls)` (392). Начиная с v13 `controls` — **объект**
  `Record<string, SceneControl>`, а `tools` — объект `Record<string, SceneControlTool>`, а не массивы.
- Поля `SceneControl`: `name, order, title, icon, visible, tools, activeTool, onChange(event, active),
  onToolChange(event, tool, active)`. Поля `SceneControlTool`: `name, order, title, icon, visible, toggle,
  active, button, onChange(event, active), toolclip, …` (13-49).
- Чистка после хука: `visible === false` удаляет контрол или инструмент. `toggle && button` одновременно
  запрещено (сбрасывается `button`). Группа, у которой были инструменты, а после фильтра не осталось ни одного,
  удаляется (395-417).
- **Ловушки:**
  - Контролы готовятся один раз, при первом рендере (комментарий 377 и `#prepareControls` на 277). Чтобы
    перестроить их, нужен `ui.controls.render({reset: true})` (опция `reset`, 70).
  - Клики по контролам и инструментам игнорируются при `!canvas.ready` (580-581, 593-594). Без сцены панель
    мёртвая.
  - Инструмент-`button` не становится активным: вызывается только `onChange(event, true)` (600-603).
    `toggle` переключает `active` (606-608).
  - Своя группа без слоя (`layer`) слой холста не активирует. У слоёв это делает их собственный
    `onChange`, например `canvas.tokens.activate()` (`client/canvas/layers/tokens.mjs:684-686`).
  - `onClick` устарел с v13 и будет удалён в v15 (`scene-controls.mjs:491-497`).

## 7. Кнопка в шапке листа актёра dnd5e 5.3.3

- Листы актёров dnd5e 5.3.3 — ApplicationV2: `BaseActorSheet extends PrimarySheetMixin(ApplicationV2Mixin(
  foundry.applications.sheets.ActorSheetV2))` (`dnd5e.mjs:55714-55716`). Подклассы: `CharacterActorSheet`
  (57813), `NPCActorSheet` (60353), `VehicleActorSheet` (60973), `GroupActorSheet` (59741),
  `EncounterActorSheet` (59399). Регистрация — `dnd5e.mjs:82467-82491`.
- Цепочка классов для хуков у NPC: `NPCActorSheet → BaseActorSheet → PrimarySheet5e (53128) →
  DragDropApplication (50563) → BaseApplication5e (1548) → HandlebarsApplication → ActorSheetV2 →
  DocumentSheetV2 → ApplicationV2`.
- **Пункт меню шапки (⋮).** Хук `getHeaderControls{Class}` вызывается из `_headerControlButtons()` с
  аргументами `(app, controls[])`. Массив можно мутировать (`application.mjs:761-772`, `hookResponse: true`).
  dnd5e вызывает его при каждом открытии меню (`dnd5e.mjs:1826-1829` → `_getHeaderControlContextEntries`
  1612-1628). Поля записи: `action, icon, label, visible, onClick, ownership`. `ownership` (например,
  `"OWNER"`) фильтрует `DocumentSheetV2` (`client/applications/api/document-sheet.mjs:152`, тип —
  `client/applications/_types.mjs:57-66`).
  - Ловушка: обёртка dnd5e вызывает `onClick(window.event)` — только событие, без `target`
    (`dnd5e.mjs:1622-1623`). У ядра `onClick(event, li)` (`application.mjs:793`).
  - Свои контролы dnd5e: только `restoreTransformation` с `ownership: "OWNER"` (`dnd5e.mjs:55751-55761`).
- **Видимая кнопка в шапке.** У ядра `_getFrameButtons` без хука, только переопределение
  (`application.mjs:738-740`, `877-888`). dnd5e сам дописывает кнопки в `.window-header` в `_renderFrame`
  (например, `NPCActorSheet` 60819-60823, ползунок режима `_renderModeToggle` 1710-1727). Модулю остаётся
  вставлять DOM в хуке `renderActorSheetV2` или `renderBaseActorSheet`. Шапка (`_renderFrame`) строится только
  при первом рендере, а хук `render*` срабатывает при каждом — нужна проверка на дубль.
- Ловушка (та же, что в п. 5): лист, открытый с незалинкованного токена, показывает синтетического актёра
  (`this.document.isToken`). Запись профиля на «актёра» из такого листа попадёт в дельту токена.

## 8. Настройки, флаги, сокет, запросы

### Настройки (`client/helpers/client-settings.mjs`)

- Области — `CONST.SETTING_SCOPES`: `client` (localStorage), `world` (БД, для всех), `user` (БД, на
  пользователя) (`common/constants.mjs:2258-2273`). Неизвестная область молча становится `client`
  (`client-settings.mjs:128`).
- `type` — DataField, DataModel или функция-конструктор, иначе ошибка (132-147). Значения по умолчанию не бывают
  `undefined`, только `null` (150). Поля `SettingConfig` — `client/_types.mjs:530-542`: `name, hint, scope,
  config, type, choices, range, default, onChange, input` (+ `requiresReload` в примерах 83, 103).
- `set` для `world`/`user` до `ready` бросает ошибку (292). Для `client` вызывается `onChange` и хук
  `clientSettingChanged` (325-328). Для `world`/`user` `onChange(value, options, userId)` срабатывает из
  `_onCreate`/`_onUpdate` документа Setting (`client/documents/setting.mjs:39-52`).
- Право на запись `world`: `SETTINGS_MODIFY`, по умолчанию с роли ASSISTANT (`common/constants.mjs:1381-1386`,
  `common/documents/setting.mjs:75-94`). `user`-настройку пользователь пишет себе сам (88-92).
- `registerMenu(namespace, key, {type: ApplicationV2|FormApplication, restricted, …})` (185-191).

### Флаги

- `getFlag/setFlag/unsetFlag` проверяют, что scope есть в `getFlagScopes()`, иначе бросают ошибку
  (`common/abstract/document.mjs:947-1004`). Активный список: `core`, `world`, id системы и id **активных**
  модулей (`client/data/client-backend.mjs:646-653`). Флаг выключенного модуля прочитать через `getFlag` нельзя
  (только через `document.flags[id]`).
- **В v14 новый синтаксис удаления:** `unsetFlag` пишет `{[key]: _del}` (`document.mjs:1000`). `_del` —
  глобальный `ForcedDeletion` (`client/client.mjs:68`), замена — `_replace(value)` / `ForcedReplacement`
  (`common/data/operators.mjs:81-92`). Старые ключи `-=key` и `==key` работают, но пишут предупреждение
  совместимости (`common/utils/helpers.mjs:455-467`).
- Флаги сцены: у сцены `ownership` по умолчанию `NONE` для игроков (`common/documents/scene.mjs:165`,
  `common/data/fields.mjs:3790-3792`), поэтому писать их может только ГМ (или владелец). Перерисовки холста
  такая запись не вызывает (п. 4).

### Сокет модуля

- В `module.json` нужно `"socket": true` (`common/packages/base-package.mjs:391`). Сервер регистрирует канал
  `module.<id>` (`dist/packages/package.mjs`, `registerCustomSocket`; вызов для мира, системы и модулей —
  `dist/packages/world.mjs`).
- Серверный ретранслятор `handleCustomSocket(data, {recipients}, ack)` (`dist/server/sockets.mjs`, минифицирован):
  - без `recipients` — `broadcast` **всем, кроме отправителя**;
  - с `recipients: [userId…]` — только этим пользователям (во все их сокеты);
  - получатель видит `(data, senderUserId)` — id отправителя **подставляет сервер**;
  - `ack` вызывается сервером сразу, без данных, то есть это не подтверждение от получателя.
- Добавление `socket` в `module.json` требует перезапуска сервера: канал регистрирует сервер при запуске мира.

### Запросы пользователю (`User#query`, с v13)

- `user.query(name, data, {timeout})` и `User.queryMany(users, …)` (`client/documents/user.mjs:289-351`).
  Имя должно быть в `CONFIG.queries`, а модульные имена обязаны иметь префикс `"<id>.<name>"`
  (`client/config.mjs:2961-2967`). Нужно право `QUERY_USER` (по умолчанию с роли PLAYER,
  `common/constants.mjs:1423-1428`). Получатель должен быть `active` (`user.mjs:306`).
- Обработчик на получателе — `CONFIG.queries[name](queryData, {timeout, user})`, где `user` — отправитель по id
  от сервера. Возвращаемое значение уходит отправителю как результат promise, исключение — как reject
  (`client/documents/collections/users.mjs:218-241`). Транспорт — служебный канал `userQuery`, флаг
  `socket` в `module.json` не нужен.
- Активный ГМ: `game.users.activeGM` (ГМ с наивысшей ролью среди активных) и `user.isActiveGM`
  (`client/documents/collections/users.mjs:70-72`, `client/documents/user.mjs:86-88`). Связка «игрок →
  `activeGM.query(...)` → ГМ перепроверяет и пишет» укладывается в общий инвариант авторитета.

## 9. Что изменилось в 14.368

По официальным заметкам (https://foundryvtt.com/releases/14.368, 16.09.2026) ничего из тем тикета не менялось:
раскладка `#interface`/`#ui-*`, сайдбар, Token HUD, `getSceneControlButtons`, `getHeaderControls`, ActorSheetV2,
настройки, флаги, сокеты, запросы, хуки холста. Косвенно касаются модуля:

- #14710 — колесо мыши вращает наведённые вращаемые объекты (токены и т. п.). Важно, если оверлей пропускает
  колесо на холст.
- #14713 — хук `hotbarDrop` теперь срабатывает после проверки замка хотбара.
- #14690 — массовые обновления дельт через Scene снова переинициализируют синтетических актёров (касается
  профиля на незалинкованных токенах).
- #14698 — верх уровня по умолчанию стал `4 × grid distance` вместо 20.

Сверить 14.367 и 14.368 по коду на этой машине нельзя: установлен 14.367 (п. 0).

## 10. Сводка ловушек

1. В `#ui-top` уже стоят `#loading` и, если ГМ включил календарь dnd5e, `#calendar-hud`. Сверху оверлей
   перекрывают `#notifications` (fixed, 10vh, z 99999).
2. `#ui-middle` уже масштабирован `--ui-scale`. CSS-переменная может временно сброситься на 1 при смене темы ОС.
3. Сворачивание сайдбара `#ui-middle` не двигает. Хук `collapseSidebar` приходит до 250 ms CSS-анимации.
4. Хука на resize нет. Док камер меняет размер `#interface` без события `resize`.
5. Смена **уровня** сцены тоже перерисовывает холст (`canvasTearDown`/`canvasReady`). Пустой холст
   `canvasReady` не вызывает.
6. Token HUD перерисовывается целиком, корень — `<form>`, `data-action` без регистрации не работает.
7. `getSceneControlButtons` — объекты, а не массивы. Кэш до `render({reset: true})`. Без `canvas.ready` клики
   глушатся.
8. Меню шапки dnd5e вызывает `onClick(window.event)` без `target`. Видимую кнопку шапки — только через DOM в
   `render*`, с защитой от дубля.
9. Синтетический актёр незалинкованного токена пишет флаги в дельту токена.
10. Сокет модуля: отправитель своё сообщение не получает, `ack` — от сервера, а не от получателя, id отправителя
    надёжен (подставляет сервер). Требует `"socket": true` и перезапуска сервера.
