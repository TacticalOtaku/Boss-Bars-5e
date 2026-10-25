# Midi QOL и DAE: как они меняют ХП и статусы

Ответ на тикет #15 карты #1. Только факты из исходников, без проектных решений. Ловушки помечены **Ловушка**.
Контекст — [факты dnd5e 5.3.3](https://github.com/TacticalOtaku/Boss-Bars-5e/blob/research/dnd5e-facts/research/dnd5e-facts.md)
(тикет #2): сигнал изменения ХП там — `dnd5e.damageActor` / `dnd5e.healActor` из `onUpdateHP`.

## Источники и версии

- midi-qol **14.0.12**: `%LOCALAPPDATA%/FoundryVTT/Data/modules/midi-qol/midi-qol.js` — несжатая сборка esbuild
  (40 391 строк, исходные `src/module/*.ts` видны по комментариям `// src/...`). Ссылки `midi:N` — строки этого файла.
- DAE **14.0.14**: `%LOCALAPPDATA%/FoundryVTT/Data/modules/dae/` — несобранные ES-модули. Ссылки `dae/module/...:N`.
- dnd5e 5.3.3: `D:\Foundry\reference\dnd5e-5.3.3\dnd5e.mjs` (`dnd5e.mjs:N`). Foundry 14.367:
  `D:\Foundry\Foundry Virtual Tabletop\resources\app` (`client/...`, `common/...`).
- Зависимости: midi требует `socketlib`, `lib-wrapper`, `dae`; DAE — `lib-wrapper`, `socketlib` (`module.json`, `relationships.requires`).
- Живых проверок не было. Настройки по умолчанию — из класса `ConfigSettings` (`midi:32482-…`); в мире ГМ их меняет,
  поэтому ниже везде «если включено».

## 1. Короткий ответ

| Вопрос | Ответ |
|---|---|
| Пишет ли Midi ХП в обход `Actor5e#applyDamage`? | **Да**, основной путь: прямой `actor.update({"system.attributes.hp.temp", "...hp.value", ["...hp.tempmax"]}, options)`. |
| Срабатывают ли при этом `dnd5e.damageActor` / `healActor`? | **Да**, на всех клиентах: это обычный `Actor#update`, его `_preUpdate`/`_onUpdate` проходят через `preUpdateHP`/`onUpdateHP` dnd5e. |
| `dnd5e.preApplyDamage` / `dnd5e.applyDamage`? | Midi вызывает их **сам** через `Hooks.call` только на клиенте, который пишет. Ядровой `modifyTokenAttribute` на этом пути не вызывается. |
| Кто пишет? | Обычно **ГМ**, которого выбирает midi (не обязательно `activeGM`); при ручных кнопках карточки — нажавший владелец. |
| Пишет ли ХП DAE? | Сам — нет. Только через пользовательский `macro.actorUpdate` (обычный `update`) и через изменения эффектов, которые меняют **производные** поля при подготовке данных (без события ХП). |
| Как появляются эффекты и состояния? | Обычные `createEmbeddedDocuments("ActiveEffect")` / `toggleStatusEffect` / `update` / `delete`. Core-хуки `create/update/deleteActiveEffect` приходят всем клиентам. Но стаки, истечение и «зависимые состояния» превращают ожидаемое создание/удаление в **update** или в **второй** документ. |

## 2. Midi QOL: урон и лечение

### Основной путь (автоприменение урона)

1. Workflow (`processDamageRoll`, `midi:14697`) или API `MidiQOL.applyTokenDamage` / `applyTokenDamageMany`
   (`midi:14470`, `midi:14566`) считают урон через `actor.calculateDamage` (dnd5e, т. е. `dnd5e.preCalculateDamage` /
   `calculateDamage` на этом клиенте срабатывают; midi сам вешается на них, `midi:13270-13274`).
2. Затем `timedAwaitExecuteAsGM("createReverseDamageCard", …)` (`midi:14552`, `14624`, `14895`).
3. `unTimedExecuteAsGM` (`midi:22634-22650`) выбирает исполнителя:
   1) «предпочтительный ГМ» из настроек midi, если он активен и на той же сцене; 2) сам вызывающий, если он ГМ на этой
   сцене; 3) **первый** активный ГМ, который смотрит ту же сцену; 4) предпочтительный ГМ где угодно; 5) иначе
   `socketlib.executeAsGM` (выбор socketlib).
4. На ГМе `createReverseDamageCard` (`midi:23119-23136`) → `createGMReverseDamageCard` (`midi:23583`) →
   `prepareDamageListItems(..., createPromises = true)` (`midi:23347`). Там (`midi:23353-23440`):
   - формула списания та же, что в `applyDamage` dnd5e (`dnd5e.mjs:36717-36727`): сначала `temp`, потом `value`,
     `tempmax` при уроне максимуму;
   - пишет, только если `autoApplyDamage` содержит `"yes"` или `forceApply` (`midi:23423`);
   - `Hooks.call("dnd5e.preApplyDamage", actor, amount, updates, calcDamageOptions)` — можно отменить (`midi:23427`);
   - `actor.update(updates, mergedOptions)` (`midi:23432`), где `mergedOptions` = опции расчёта урона midi
     (`multiplier`, `invertHealing`, `midi: {...}` и т. п.) + `updateOptions`;
   - после записи `Hooks.call("dnd5e.applyDamage", updatedActor, amount, calcDamageOptions)` (`midi:23436`).
5. Сравнение с dnd5e: `applyDamage` вызывает `this.update(updates)` **без опций** и `Hooks.callAll("dnd5e.applyDamage")`
   (`dnd5e.mjs:36739-36760`); midi передаёт свои опции в `update` и использует `Hooks.call` (останавливается на первом
   `false`).

### Кнопки на карточке урона

`processUndoDamageCard` (`midi:24126-…`): кнопки «применить/отменить» (по цели и для всех) на **клиенте нажавшего**
делают тот же прямой `actor.update(...)` с `preApplyDamage`/`applyDamage` вокруг (`midi:24144-24166`, `24186-24204`,
`24228-24248`, `24266-24288`), только если `actor.isOwner`. Исключение — выбран множитель (не `calc`): тогда
`actor.applyDamage(...)` dnd5e (`midi:24348`) и отдельный `actor.update` для `tempmax` (`midi:24354`).
Стандартные кнопки dnd5e на сообщении midi (`applyChatCardDamage`, `applyChatCardTemp`) идут через
`actor.applyDamage` / `applyTempHP` для выделенных токенов (`midi:36871-36892`).

### Другие записи ХП midi

- Отмена workflow (undo): `actor.update(actorChanges, { noConcentrationCheck: true })` — восстанавливает снимок актёра
  целиком, включая ХП (`midi:7110-7112`); эффекты и предметы восстанавливаются отдельными create/update/delete
  (`midi:7055-7106`).
- Сокет-обработчик `updateActor` (`midi:22745-22753`) — произвольный `actor.update` от имени ГМа для макросов.
- Эффекты «по времени» (overTime) срабатывают у предпочтительного/активного ГМа на `updateCombat`
  (`midi:12855-12862`, `15974-…`) и наносят урон тем же workflow → `createReverseDamageCard`.
- Опция «Vitality» (`getVitalityItem`): урон сверх ХП уходит в `system.uses.spent` отдельного предмета
  (`midi:23392-23420`, `14249-14262`) — это `updateItem`, а не изменение ХП.

### Почему `damageActor`/`healActor` всё равно видны всем

- Любой `actor.update` с полями ХП: у автора `_preUpdate` модели → `preUpdateHP` кладёт снимок в `options.dnd5e.hp`
  (`dnd5e.mjs:26269-26277`); опции возвращаются всем клиентам, и `onUpdateHP` (`dnd5e.mjs:26287-26317`) зовёт
  `Hooks.callAll("dnd5e.damageActor" | "dnd5e.healActor", actor, changes, changed, userId)` на каждом клиенте.
- Опции midi не содержат `isRest`/`isAdvancement`, поэтому условие выхода не срабатывает. `midi` не слушает и не
  вызывает `damageActor`/`healActor` (в `midi-qol.js` нет ни одного упоминания).
- Для несвязанного токена `actorUuid` указывает на синтетического актёра, запись уходит в `ActorDelta`; хук
  срабатывает так же (см. тикет #2, §7).

**Ловушки:**
- `userId` в хуке — ГМ, выбранный midi (п. 3 выше), **не** игрок, который атаковал, и не обязательно
  `game.users.activeGM`. Отсюда же: `dnd5e.updateBloodied` и проверка концентрации dnd5e идут у этого ГМа.
- `dnd5e.preApplyDamage`/`dnd5e.applyDamage` видны только на клиенте, который пишет; сигнатура вызова midi совпадает
  с dnd5e, но в `options` лежат поля midi (`options.midi.amount`, `options.midi.updates` дописывает обработчик midi,
  `midi:14247-14270`). Хук `modifyTokenAttribute` на пути midi **не** вызывается.
- У автора правки `onUpdateHP` сначала `await this.parent.updateBloodied(options)` (`dnd5e.mjs:26289`), и только
  потом `damageActor`: на клиенте-авторе хук приходит **после** `updateActor` и после записи эффекта «Окровавлен»; на
  остальных — сразу внутри `_onUpdate`, до `updateActor` (`client/data/client-backend.mjs:336-337`).
- Midi оборачивает `Actor#_onUpdate` (`libWrapper` `WRAPPER`, `midi:10533`, функция `midi:10568-10584`): при правке
  `hp.value`/`hp.temp` оригинальный `_onUpdate` запускается в семафоре на актёра (`foundry.utils.Semaphore(1)`,
  `midi:10264-10269`; реализация `common/utils/semaphore.mjs`). Если семафор свободен — синхронно, как без midi. Если
  занят (у активного ГМа предыдущая правка ещё ждёт `processWoundedStatus` → `toggleStatusEffect`), то `_onUpdate`
  этой правки, а с ним `damageActor`/`healActor` и плавающий текст dnd5e, выполнится **позже** хука `updateActor`.
  Порядок «`damageActor` раньше `updateActor`» под midi не гарантирован.
- Midi в `preUpdateActor` ставит `options.dnd5e.concentrationCheck = false` (`midi:13961-13994`), чтобы dnd5e не делал свою
  проверку концентрации; midi делает её сам. На хук `damageActor` это не влияет.
- Без активного ГМа (на сцене или вообще) путь `createReverseDamageCard` не выполнится: урон не будет записан
  (поведение socketlib при отсутствии ГМа не проверено).

## 3. Midi QOL: состояния после изменения ХП

`actorOnUpdate` → `processWoundedStatus` (`midi:10585-10637`) выполняется **только у `game.users.activeGM`**
(`midi:10579`) после каждой правки `hp.value`/`hp.temp`:

- «Ранен»: если `addWounded > 0` (по умолчанию `0`, `midi:32490`) — `actor.toggleStatusEffect(<midiWoundedCondition>,
  {active: pct <= addWounded, overlay})`. Порог сравнивается с `hp.pct` (без `temp`).
- «Мёртв»/«без сознания»: если `addDead !== "none"` (по умолчанию `"none"`, `midi:32488`) — при `hp.value <= 0`
  статус `midiDeadCondition` для NPC, `midiUnconsciousCondition` для персонажа, актёра с владельцем-игроком или
  `system.traits.important` (`midi:10625-10636`); `setDeadStatus` (`midi:12001-12015`) снимает `unconscious`, ставит
  статус через `toggleStatusEffect` (оверлей при `addDead = "overlay"`) и при `markNonPlayerDefeated` /
  `markPlayerDefeated` (по умолчанию `false`, `midi:32583-32584`) — `combatant.update({defeated})`.
- Id статусов берутся из настроек (`getDeadStatus` и др., `midi:18971-18983`); по умолчанию `"none"`
  (`midi:32495-32497`), т. е. статус может быть любым id из `CONFIG.statusEffects` или эффектом Convenient Effects.
- Эффекты с особой длительностью DAE `zeroHP` истекают у автора правки, когда `hp.value` стал 0 (`midi:13937-13948`,
  `zeroHPExpiry` `midi:11986-11994`); там же при `removeConcentration` (по умолчанию `true`, `midi:32597`) —
  `actor.endConcentration()`.

**Ловушки:**
- Midi закрывает пробел dnd5e 5.3.3 «0 ХП не ставит dead» — но только если ГМ включил это в настройках, и id статуса
  произвольный. Признак «повержен» под midi может прийти как `dead`, `unconscious`, свой id или `combatant.defeated`.
- `combatant.update({defeated})` ищет бойцов в `game.combat` **этого** ГМа (бой, открытый в его трекере; тикет #2, §6).
- Авторы разные: ХП пишет ГМ по выбору midi, «Окровавлен» — он же (автор правки), «ранен/мёртв» — `activeGM`.

## 4. Midi QOL: эффекты и концентрация

- Эффекты предметов на цели midi применяет через DAE: `globalThis.DAE.doActivityEffects(...)` (`midi:27186`). Для
  чужих актёров DAE шлёт `applyActiveEffects` ГМу (`dae/module/dae.js:1376-1387`), для своих создаёт локально;
  итог — `targetActor.createEmbeddedDocuments("ActiveEffect", …)` (`dae/module/GMAction.js:461`). Эффекту с
  `origin` ставится `flags.dnd5e.dependentOn = origin` (`dae/module/GMAction.js:417`, `454`) — зависимость dnd5e от
  эффекта концентрации.
- Сокет-обработчики midi для ГМа: `createEffects` (`createEmbeddedDocuments`, `midi:22588-22594`), `updateEffects`,
  `toggleStatusEffect` (`midi:22604-22607`), `removeEffectUuids` → `expireEffects` (`midi:22569-22587`).
  Обработчик `toggleStatusEffect` разрешён любому игроку, `createReverseDamageCard`/`updateActor`/`createEffects` —
  доверенному, но сейчас тоже пропускаются с предупреждением (`SaferSocket.canCall`, `midi:23962-24039`). ГМ при
  этом ничего не перепроверяет (кроме опции `paranoidGM`, по умолчанию `false`, `midi:32586`).
- Концентрация: эффект создаёт сам dnd5e (`Actor5e#beginConcentrating`, `dnd5e.mjs:37011-37039`, вызов из активности
  `dnd5e.mjs:16889`); midi лишь дописывает `flags.dnd5e.itemUuid` (обёртка `createConcentrationEffectData`,
  `midi:12016-12022`). Снятие — `actor.endConcentration()` dnd5e: при провале проверки (`midi:20060-20080`), при 0 ХП
  (`midi:13944`), при наложении «недееспособного» состояния (`_preCreateActiveEffect`, `midi:12201-12221`).
  При удалении эффекта, созданного концентрацией, midi у предпочтительного ГМа удаляет сам эффект концентрации, если у
  него не осталось зависимых (`midi:14004-14017`).
- Истечение эффектов midi (`expireEffects`, `midi:20737-20770`): эффект актёра — `delete`, если настройка DAE
  `expiryAction` (или `CONFIG.ActiveEffect.expiryAction`) равна `"delete"`, иначе `update({"duration.expired": true})`;
  перенесённый с предмета — `update({disabled: true})`.
- Свои статусы midi в `CONFIG.statusEffects` (`midi:39567-39637`): `bonusaction` и `reaction` (если включён учёт
  действий), `flanking`, `flanked`. Это настоящие ActiveEffect со статическим `_id` на актёре
  (`setReactionUsed` `midi:19010-…`, фланкирование `midi:19641-19690`).

**Ловушка:** в `actor.statuses` под midi бывают служебные `reaction`, `bonusaction`, `flanking`, `flanked` (и
`concentrating`), которые меняются каждый ход; фильтр статусов должен это учитывать.

## 5. DAE: эффекты и состояния

### Что DAE делает с ХП

- В `dae/` нет записи `system.attributes.hp` (поиск по `module/`). Изменения эффектов на `hp.max`, `hp.tempmax`,
  `hp.bonuses.*` (`dae/module/Systems/DAEdnd5e.js:346-348`, `434`) применяются в `applyActiveEffects` при подготовке
  данных (`libWrapper` на `Actor#applyActiveEffects`, `prepareData`, `dae/module/Systems/DAEdnd5e.js:568-576`) —
  в базу не пишутся.
- Пользовательский ключ `macro.actorUpdate` (`dae/module/daeMacros.js:207-279`) пишет любое поле актёра обычным
  `actor.update` (сам или через сокет `_updateActor` у ГМа, `dae/module/GMAction.js:48-51`) при включении эффекта и
  откатывает при снятии.

**Ловушка:** наложение/снятие эффекта DAE, меняющего максимум ХП, даёт только `create/update/deleteActiveEffect`;
`updateActor` и `damageActor` не будет, а `hp.max`/`pct` изменятся после подготовки данных. Если же эффект через
`macro.actorUpdate` пишет `hp.value`/`hp.temp` — это обычная правка, `damageActor`/`healActor` сработают.

### Зависимые состояния (настройка `DependentConditions`, по умолчанию **включена**)

`dae/module/settings.js:4-12`. После create/update/delete эффекта со `statuses` (у автора правки,
`dae/module/dae.js:2014-2025`) и после create/update/delete предмета (`2003-2013`) DAE в очереди
(`actionQueue`, `foundry.utils.Semaphore`) вызывает `reconcileActorStatuses` (`dae/module/dae.js:2036-2130`):

- собирает ожидаемые статусы из всех активных эффектов, кроме `concentrating`, `bonusaction`, `reaction` и статусов
  нагрузки, и вычитает иммунитеты `system.traits.ci`;
- для каждого недостающего статуса создаёт **отдельный** эффект-состояние со статическим `_id` и флагом
  `flags.dae.autoCreated` (`toggleActorStatusEffect`, `dae/module/dae.js:2452-2510`);
- удаляет только автосозданные, когда их источник ушёл; ручные — только при иммунитете.

**Ловушка:** заклинание «Удержание личности» с `statuses: ["paralyzed"]` под DAE даёт на актёре **два** эффекта с
`paralyzed` — исходный и автосозданный. Набор `actor.statuses` от этого не меняется, но список эффектов задвоен; а
событий `createActiveEffect` — два, с паузой на сетевой круг между ними.

### Стаки (`flags.dae.stackable`)

`dae/module/lib/stackingPolicy.js`:
- `count` / `countDeleteDecrement`: повторное наложение **отменяет** создание (`preCreate` → `false`) и делает
  `existing.update({"flags.dae.stacks": n, name: "<имя> (n)"})` (`stackingPolicy.js:66-97`);
- `countDeleteDecrement` при удалении уменьшает стак тем же `update` и отменяет удаление (`dae/module/dae.js:938-972`);
- `none` / `noneName` / `noneNameOnly`: старый эффект с тем же источником/именем удаляется, потом создаётся новый
  (`stackingPolicy.js:11-59`); с `options.toggleEffect` — вместо этого переключается `disabled`.

**Ловушка:** у стакающегося эффекта имя содержит счётчик («Яд (3)»), а повторное наложение приходит как
`updateActiveEffect`, а не `createActiveEffect`. Число стаков — `flags.dae.stacks`.

### Истечение и подавление

- DAE задаёт ядру `CONFIG.ActiveEffect.expiryAction` из своей настройки `coreExpiryAction` (`update` по умолчанию,
  `delete`, `none` → `null`; `dae/dae.js:118-120`, `dae/module/settings.js:137-149`). Ядро v14 исполняет истечение только
  у `activeGM` (`client/helpers/active-effect-registry.mjs:145-149`): `update` ставит `duration.expired = true`,
  `delete` удаляет.
- Особые длительности DAE (`specialDurations.js`, `expireEffect` `:29-79`): перенесённые эффекты — `update` (выключить),
  остальные — `delete` или `update({"duration.expired": true})` по настройке `dae.expiryAction` / флагу эффекта; вне боя
  при режиме `update` всё равно `delete`. Обработчики боя DAE работают только у `activeGM` (`specialDurations.js:304`, `313-323`).
- Обёртка `ActiveEffect#isSuppressed` (`dae/module/Systems/DAEdnd5e.js:1432-…`): эффект подавлен ещё и если в
  **базе** `_source.duration.expired` = `true` (даже когда подготовка сняла `expired`), и при `flags.dae.disableIncapacitated`,
  если midi считает актёра недееспособным.
- Условные эффекты (`enableCondition`, `disableCondition`): `processConditionalEffects` у `activeGM`
  (`dae/module/dae.js:2512-…`) на `updateActor`/`updateItem`/`updateToken`(движение) и изменения эффектов создаёт,
  удаляет эффекты или переключает `disabled` (`dae/module/dae.js:2615`).

**Ловушки:**
- Истёкший эффект в режиме `update` остаётся в `actor.effects` с `duration.expired = true`; из `actor.statuses` он
  уходит (неактивен), но событие — `updateActiveEffect`, не `deleteActiveEffect`. С `coreExpiryAction = none` ядро не
  истекает эффекты вовсе.
- Смена подавления (истечение, недееспособность по midi) может не дать события эффекта (тикет #2, §4): набор
  `actor.statuses` надо пересчитывать при подготовке данных, а не только по хукам эффектов.

## 6. Какие хуки видят другие клиенты

| Событие | Хуки на всех клиентах | Только у пишущего клиента |
|---|---|---|
| Урон/лечение midi (авто или кнопка) | `updateActor`, `dnd5e.damageActor`/`healActor` | `dnd5e.preApplyDamage`, `dnd5e.applyDamage` (вызывает midi), `preUpdateActor` |
| Урон сверх ХП в Vitality | `updateItem` | — |
| Наложение эффекта (midi→DAE) | `createActiveEffect` (+ второй для зависимого состояния) | `preCreateActiveEffect` |
| Повторное наложение стака | `updateActiveEffect` | — |
| Истечение | `updateActiveEffect` (`duration.expired`) или `deleteActiveEffect` | — |
| «Ранен/мёртв» midi | `createActiveEffect`/`deleteActiveEffect` (через `toggleStatusEffect`), `updateCombatant` (`defeated`) | — |
| Концентрация | `createActiveEffect` / `deleteActiveEffect` | `dnd5e.beginConcentrating`, `dnd5e.preEndConcentration`/`endConcentration` |
| Эффект меняет `hp.max` | `createActiveEffect`/`updateActiveEffect`/`deleteActiveEffect` (без `updateActor`) | — |

## Не проверено

- Живьём ничего не запускалось: порядок `damageActor` и `updateActor` под семафором midi выведен из кода.
- Поведение `socketlib.executeAsGM`, когда нет ни одного ГМа, и какого ГМа он выбирает — исходник socketlib не читался.
- Convenient Effects (`ceInterface`) и Times Up меняют пути истечения и статусов; не смотрели.
- Настройки конкретного мира (`autoApplyDamage`, `addDead`, `addWounded`, `DependentConditions`) не проверялись.
