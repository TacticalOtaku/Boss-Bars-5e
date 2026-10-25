# Факты dnd5e 5.3.3: ХП, ресурсы, состояния и хуки боя

Ответ на тикет #2 карты #1. Только факты из исходников, без проектных решений. Ловушки помечены **Ловушка**.

## Источники и версии

- dnd5e 5.3.3: `D:\Foundry\reference\dnd5e-5.3.3\dnd5e.mjs` (сборка релиза, `system.json` → `"version": "5.3.3"`,
  совместимость `minimum 13.347`, `verified 14`). Ссылки вида `dnd5e.mjs:N` — строки этого файла.
- Foundry: `D:\Foundry\Foundry Virtual Tabletop\resources\app`. Ссылки вида `client/...`, `common/...` — от этой папки.
- dnd5e 6.0.6: на этой машине его **нет** (см. «Расхождение с CLAUDE.md»). Отличия прочитаны из исходников тега
  `release-6.0.6` репозитория github.com/foundryvtt/dnd5e (`module/...`), сравнение с тегом `release-5.3.3`.

### Расхождение с CLAUDE.md

- `resources/app/package.json` → `"release": { "generation": 14, "build": 367 }`, `"version": "14.367.0"`. Установлен
  Foundry **14.367**, а не 14.368.
- `%LOCALAPPDATA%/FoundryVTT/Data/systems/dnd5e/system.json` → `"version": "5.3.3"`; его `dnd5e.mjs` побайтно
  совпадает с `D:\Foundry\reference\dnd5e-5.3.3\dnd5e.mjs` (`cmp` без различий). Установлен dnd5e **5.3.3**, а не 6.0.6.
- Следствие: живая проверка в мире `test` сейчас — это проверка 14.367 + 5.3.3, а не 6.0.6.

## 1. Хиты (ХП)

### Где лежат

Схема `AttributesFields.hitPoints` (`dnd5e.mjs:25793-25804`), путь `system.attributes.hp`:

| Поле | Хранится | Смысл |
|---|---|---|
| `value` | да, `nullable`, `min 0` | текущие ХП |
| `max` | да, `nullable` | максимум (у персонажа — «override», при `null` считается из классов) |
| `temp` | да, `min 0` | временные ХП |
| `tempmax` | да, может быть < 0 | временное изменение максимума |
| `dt` | да | порог урона (транспорт/объекты) |

- NPC: `hp` = `hitPoints` + `formula` (`dnd5e.mjs:73010-73013`). Персонаж: `hp` = `hitPoints` + `max` (override) +
  `bonuses.level`, `bonuses.overall` (`dnd5e.mjs:71951-71961`).
- Производные поля (только в памяти, не в `_source`, не приходят в `changed`) — `prepareHitPoints`
  (`dnd5e.mjs:26109-26120`):
  - `max` = `(max ?? 0)` + ХП из адвансментов + бонус; при состоянии `halfHealth` (истощение 4) — пополам; `floor`.
  - `effectiveMax = max(max + tempmax, 0)`.
  - `value = min(value, effectiveMax)` (обрезается при подготовке, в базе может быть больше).
  - `damage = effectiveMax - value`.
  - `pct = clamp(value / effectiveMax * 100, 0, 100)`; при `effectiveMax = 0` → `0`.
- **Ловушка:** `pct` не учитывает `temp`. Полоса токена dnd5e (`_drawHPBar`, `dnd5e.mjs:70747-…`) рисует от
  `displayMax = max + (tempmax > 0 ? tempmax : 0)`, а `TokenDocument5e.getBarAttribute` (`dnd5e.mjs:79488-79504`)
  отдаёт `value + temp` и `max = effectiveMax`. Это три разные «доли ХП».
- У актёров типа `group`/`encounter` ХП нет: `applyDamage` выходит сразу (`dnd5e.mjs:36708`).

### Как меняются

- `Actor5e#applyDamage(damages, options)` (`dnd5e.mjs:36703-36763`): считает через `calculateDamage`, сначала
  списывает `temp`, затем `value`, может менять `tempmax`; пишет один `actor.update(updates)`.
  - `dnd5e.preCalculateDamage` / `dnd5e.calculateDamage` (`dnd5e.mjs:36789`, `36887`), `dnd5e.preApplyDamage`
    (`dnd5e.mjs:36739`, можно отменить), core-хук `modifyTokenAttribute` (`dnd5e.mjs:36743`), затем
    `dnd5e.applyDamage` (`dnd5e.mjs:36760`).
  - **Ловушка:** эти хуки идут только у клиента, который вызвал `applyDamage`. Правка ХП с листа, через полосу токена
    (`modifyTokenAttribute` → `applyDamage`, `dnd5e.mjs:36681-36686`) или прямой `update` их не всегда проходит.
- `applyTempHP(amount)` (`dnd5e.mjs:36981-36988`): ставит `temp`, только если новое значение больше.
- Отдых пишет ХП с `options.isRest` (`dnd5e.mjs:38173-38198`, `_rest`).

### Хуки изменения ХП

1. `preUpdateHP` (`dnd5e.mjs:26269-26277`, вызывается из `_preUpdate` персонажа `72165-72169`, NPC `73422-73425`,
   транспорта `27303-27307`): кладёт снимок старых ХП в `options.dnd5e.hp`; если актёр был на 0 и `value` > 0 —
   обнуляет спасброски от смерти.
2. `onUpdateHP` (`dnd5e.mjs:26287-26317`, из `_onUpdate` тех же моделей) — на **каждом** клиенте:
   - у автора правки — `updateBloodied` (см. §4);
   - если есть `options.dnd5e.hp` и нет `options.isRest` / `options.isAdvancement`: считает
     `changes = { hp, temp, total }`; при `total === 0` или нецелом — выходит;
   - `_displayTokenEffect` (плавающий текст и вспышка кольца, `dnd5e.mjs:39436-39477`);
   - у автора — проверка концентрации;
   - `Hooks.callAll("dnd5e.damageActor" | "dnd5e.healActor", actor, changes, changed, userId)` (`dnd5e.mjs:26316`):
     `heal` при `total > 0`, иначе `damage`.
- Почему хук виден всем: опции операции (`options.dnd5e.hp` из `_preUpdate`) возвращаются сервером в ответе и
  передаются в `_onUpdate` и `update<Type>` на каждом клиенте (`client/data/client-backend.mjs:290-330`, `_preUpdate`
  вызывается у автора в `#preUpdateDocumentArray`, `:214-245`).
- **Ловушки:**
  - `damageActor`/`healActor` не сработают при отдыхе (`isRest`), адвансменте (`isAdvancement`) и при смене только
    `max`/`tempmax` (изменение `value + temp` = 0). Для максимума нужен core `updateActor`.
  - В `changed` (и в `updateActor`) только хранимые поля диффа; `pct`, `effectiveMax`, `damage` читать с
    `actor.system.attributes.hp` после обновления.
  - `changes.hp` — разница уже обрезанных `value` (`curr.value - hp.value`), не «сырой урон».

## 2. Легендарные действия и сопротивления (NPC)

- Схема (`dnd5e.mjs:73054-73079`): `system.resources.legact.{max, spent}`, `system.resources.legres.{max, spent}`,
  `system.resources.lair.{value, initiative, inside}`. Хранятся `max` и `spent`.
- Подготовка:
  - `prepareBaseData` (`dnd5e.mjs:73318-73327`): если `lair.value && lair.inside`, к ненулевому `max` обоих
    прибавляется 1.
  - `prepareDerivedData` (`dnd5e.mjs:73393-73396`): `value = clamp(max - spent, 0, max)` — **производное**.
- Запись: через `spent`. Если в `update` передать `system.resources.legact.value`/`legres.value`, `NPCData._preUpdate`
  пересчитает в `spent = max - value` (`dnd5e.mjs:73427-73431`); `max` при этом — уже с бонусом логова.
- Сброс: `NPCData#recoverCombatUses` (`dnd5e.mjs:73494-73499`) ставит `legact.spent = 0` в периоды `encounter`
  (начало боя) и `turnEnd` (конец хода этого существа). `legres` в бою не восстанавливается.
- `resistSave(message)` (`dnd5e.mjs:73507-73512`) тратит одно сопротивление: `legres.spent + 1`.
- Полосы токена: `resources.legact`, `resources.legres` редактируемые (`dnd5e.mjs:79500-79502`); подписи
  `dnd5e.mjs:1310-1313`.
- Признак «важного» NPC: `system.traits.important` (`dnd5e.mjs:73083`).

## 3. Заряды предметов и прочие ресурсы

- Предмет: `system.uses = { spent, max, recovery[] }` (`UsesField`, `dnd5e.mjs:11510-11524`). `max` — формула
  (детерминированная), `value = max ? clamp(max - spent, 0, max) : 0` — производное (`dnd5e.mjs:11537-11539`).
  Писать в `system.uses.spent`.
- «Есть ли заряды»: `item.hasLimitedUses` → `system.hasLimitedUses` = `!!_source.uses.max || !!uses.max`
  (`dnd5e.mjs:18180-18182`, `23105-23107`).
- У активностей свои `uses` (`system.activities.<id>.uses.spent`), та же схема.
- Полоса токена может указывать на предмет относительным UUID (атрибут, начинающийся с `.`):
  `TokenDocument5e.getBarAttribute` (`dnd5e.mjs:79490-79494`), запись — `modifyTokenAttribute`
  (`dnd5e.mjs:36687-36692`).
- Изменение `uses.spent` у встроенного предмета: core-хук `updateItem` (родитель — актёр, для несвязанного токена —
  синтетический актёр); dnd5e сам ставит `refreshBars` токенам (`dnd5e.mjs:39371-39380`).
- Восстановление в бою: `Combatant5e#recoverCombatUses` проходит предметы и вызывает `item.system.recoverUses`
  (`dnd5e.mjs:79309-79370`).
- Персонаж: `system.resources.{primary, secondary, tertiary}` (`dnd5e.mjs:72014-72018`).
- Список «отслеживаемых» атрибутов для полос: `CONFIG.DND5E.trackableAttributes` (заполняется в `setup`,
  `dnd5e.mjs:82764-82769`).

## 4. Состояния и Active Effects

### Конфигурация

- `CONFIG.DND5E.conditionTypes` (`dnd5e.mjs:47157-…`) и `CONFIG.DND5E.statusEffects` (`dnd5e.mjs:47336-…`)
  в `_configureStatusEffects` (`dnd5e.mjs:82735-82754`) сливаются в `CONFIG.statusEffects` — массив; каждому даётся
  статический `_id = staticID("dnd5e" + id)` (`staticID`: дополнить нулями/обрезать до 16 символов,
  `dnd5e.mjs:455-458`). Поле `special` прописывает `CONFIG.specialStatusEffects[special] = id`.
- В v14 `CONFIG.statusEffects` — Proxy над массивом с доступом и по индексу, и по id
  (`client/config.mjs:1688-…`); присваивание массива или объекта перезаливает его (`client/client.mjs:30-39`).
- Особые id: `DEFEATED: "dead"` (ядро, `client/config.mjs:1917-1924`; dnd5e тоже ставит `dead` как `DEFEATED`,
  `dnd5e.mjs:47367-47373`), `CONCENTRATING`, `BURROW`, `FLY`, `HOVER`. `pseudo: true` у части состояний (например
  `bleeding`, `transformed`).

### Где состояния актёра

- `actor.statuses` (Set id) пересобирается при каждой подготовке данных из всех **активных** эффектов, включая
  перенесённые с предметов (`client/documents/actor.mjs:240-256`, очистка `:464`).
- `actor.appliedEffects` — активные (`:149-157`), `actor.temporaryEffects` — активные с длительностью (`:163-171`),
  `actor.allApplicableEffects()` — эффекты актёра + `transfer`-эффекты предметов (`:305-314`).
- Эффект: `statuses` (SetField), `showIcon` (`common/documents/active-effect.mjs:72-78`), `disabled`,
  `duration.expired`. `active = !disabled && !isSuppressed` (`client/documents/active-effect.mjs:209-211`),
  core `isSuppressed = system.isSuppressed ?? duration.expired` (`:191-193`), `isTemporary` (`:225-227`).
- dnd5e (`ActiveEffect5e`, `dnd5e.mjs:24502`):
  - `isSuppressed` (`24606-24614`): ещё и эффекты неэкипированных/ненастроенных предметов
    (`item.areEffectsSuppressed`) и зависимые от неактивного источника.
  - `isConcealed` (`24592-24601`): для пользователя без прав OBSERVER «Окровавлен» скрыт, если настройка
    `bloodied = "player"` и токен не дружественный.
  - `isTemporary` (`24619-24621`): `!isConcealed && (core isTemporary || flags.dnd5e.isTemporary)`.
  - **Ловушка:** у игрока `isTemporary` и, значит, `actor.temporaryEffects` зависят от видимости — у ГМа и игрока
    разный список.
- Переключение: `actor.toggleStatusEffect(id, {active, overlay})` (`client/documents/actor.mjs:547-…`; dnd5e добавляет
  взаимоисключающие группы, например укрытия, `dnd5e.mjs:39476-39488`). Создаёт/удаляет ActiveEffect со статическим
  `_id`.

### Особые эффекты dnd5e

- Статические id: `ActiveEffect5e.ID.BLOODIED`, `ENCUMBERED`, `EXHAUSTION` (`dnd5e.mjs:24516-24520`).
- «Окровавлен»: `updateBloodied` (`dnd5e.mjs:39520-39536`) у автора правки ХП; создаёт эффект со `statuses:
  ["bloodied"]`, `flags.dnd5e.isTemporary`, если `value <= effectiveMax * 0.5` (`CONFIG.DND5E.bloodied.threshold = .5`,
  `dnd5e.mjs:47426-47430`); удаляет выше порога. Отключается мировой настройкой `dnd5e.bloodied = "none"`
  (`dnd5e.mjs:50131-50143`, варианты `all` / `player` / `none`, по умолчанию `player`).
- Истощение: уровень хранится во флаге `flags.dnd5e.exhaustionLevel` эффекта `EXHAUSTION`; `system.attributes.
  exhaustion` производное (`dnd5e.mjs:26092-26096`), синхронизация `_onUpdateExhaustion` (`dnd5e.mjs:39498-39512`).
  На максимальном уровне эффект добавляет статус `dead` (`dnd5e.mjs:24911-24921`).

### Хуки

- Core: `createActiveEffect`, `updateActiveEffect`, `deleteActiveEffect` (родитель — актёр, предмет или синтетический
  актёр). **Ловушка:** смена подавления (снял предмет, истекла длительность) не создаёт события эффекта — меняется
  предмет (`updateItem`) или `duration.expired`; набор `actor.statuses` при этом меняется.
- Особые статусы, сменившиеся при подготовке, ядро передаёт токенам через `token._onApplyStatusEffect`
  (`client/documents/actor.mjs:428-446`).

## 5. Признак смерти и поражения

- dnd5e 5.3.3 **не** ставит «мёртв» автоматически при 0 ХП. Единственная авто-выдача статуса `dead` — истощение
  максимального уровня (выше).
- Спасброски от смерти: `system.attributes.death.{success, failure}` (персонаж и NPC, `dnd5e.mjs:73014-73024`).
  `rollDeathSave` (`dnd5e.mjs:37548-37680`): крит → `hp.value = 1` и сброс; 3 успеха → сброс; провал +1 (+2 на 1);
  при 3 провалах только сообщение `DeathSaveFailure`, статус не ставится. Хуки `dnd5e.rollDeathSave`,
  `dnd5e.rollDeathSaveV2` (можно отменить), `dnd5e.postRollDeathSave`.
- Поражение в бою (ядро):
  - `combatant.defeated` (BooleanField, `common/documents/combatant.mjs:57`).
  - `combatant.isDefeated = defeated || actor.statuses.has(CONFIG.specialStatusEffects.DEFEATED)`
    (`client/documents/combatant.mjs:125-127`).
  - Кнопка в трекере: `update({defeated})` + `toggleStatusEffect("dead", {overlay: true})`
    (`client/applications/sidebar/tabs/combat-tracker.mjs:666-672`).
  - dnd5e пропускает поражённых в восстановлении ресурсов (`Combat5e#_recoverUses`, `dnd5e.mjs:79219-79225`);
    ядро — в `nextTurn` при `skipDefeated`.
- **Ловушка:** «0 ХП», «статус dead», «combatant.defeated» — три разных признака, ни один не следует из другого
  автоматически в 5.3.3.

## 6. Хуки боя (Foundry 14.367 + dnd5e 5.3.3)

| Событие | Хук | Где срабатывает | Источник |
|---|---|---|---|
| Создание боя | `createCombat` | все клиенты | core |
| Начало боя | `combatStart(combat, updateData)` | **только** клиент, нажавший «начать», до `update` | `client/documents/combat.mjs:207-214` |
| Раунд вперёд/назад | `combatRound(combat, updateData, options)` | только инициатор, до `update` | `:237`, `:257` |
| Ход вперёд/назад | `combatTurn(combat, updateData, options)` | только инициатор, до `update` | `:293`, `:313` |
| Любая смена хода/раунда/порядка в начатом бою | `combatTurnChange(combat, prior, current)` | все клиенты | `:878-889` |
| Любое изменение | `updateCombat` | все клиенты | core |
| Конец боя | `deleteCombat` | все клиенты; `endCombat()` — это диалог и `delete()` | `:324-333`, `:671-681` |

- `combat.started` = `round > 0` (`client/documents/combat.mjs:101-103`).
- `_onStartTurn`, `_onEndTurn`, `_onStartRound`, `_onEndRound`, `_onEnter`, `_onExit` выполняются **только у
  активного ГМа** (`game.user.isActiveGM`); если ГМа нет — не выполняются (`client/documents/combat.mjs:620-626`,
  `:671-681`, `:878-886`, комментарии к `#onEndTurn` и т. д.).
- `combatTurnChange` вызывается из `_manageTurnEvents`, только когда бой начат и состояние изменилось
  (`:647`, `:878-889`); при переходе из раунда 0 в 1 он срабатывает.
- dnd5e `Combat5e` (`dnd5e.mjs:79058-79226`):
  - `startCombat` → `_recoverUses({encounter: true})` (`79075-79079`) — сброс `legact`;
  - `_onStartTurn` → `turn`, `turnStart`; `_onEndTurn` → `turnEnd`; `_onStartRound` → `round` (`79166-79186`) —
    значит, только у активного ГМа;
  - `endCombat` в 5.3.3: после `super.endCombat()` восстанавливает ходовые ресурсы, если бой больше не текущий
    (`79084-79088`).
  - Хуки восстановления: `dnd5e.preCombatRecovery`, `dnd5e.combatRecovery` (`dnd5e.mjs:79348`),
    `dnd5e.postCombatRecovery`, `dnd5e.preCreateCombatMessage`.
- Какой бой «текущий»:
  - `game.combat` — бой, **открытый в трекере** этого клиента (`ui.combat.viewed`), иначе активный
    (`client/game.mjs:1692-1696`).
  - `game.combats.active` — активный бой текущей сцены (`client/documents/collections/combat-encounters.mjs:54-56`).
  - **Ловушка:** `game.combat` у разных клиентов может различаться.
- `combatant.actor` для несвязанного токена — синтетический актёр (`client/documents/combatant.mjs:92-96`).

## 7. Флаги актёра и токены

- Флаги: `doc.getFlag(scope, key)` / `setFlag` бросают ошибку, если `scope` не активный модуль/система/`core`/`world`
  (`common/abstract/document.mjs:947-952`, `:974-…`).
- **Связанный токен** (`actorLink: true`): `token.actor === game.actors.get(token.actorId)`
  (`client/documents/token.mjs:250-254`). Флаги актёра общие для всех его связанных токенов.
- **Несвязанный токен**: `token.actor` — синтетический актёр = база + `ActorDelta` токена
  (`common/documents/actor-delta.mjs:96-…`, `applyDelta`: `mergeObject(baseActorData, deltaData)`; встроенные
  коллекции сливаются по `_id`). В дельте есть свои `flags` (`common/documents/actor-delta.mjs:55`).
  - Флаги базового актёра видны в `token.actor.flags`, пока дельта их не переопределила.
  - Правка базового актёра: `Actor#_onUpdate` → `_updateDependentTokens` → `token._onUpdateBaseActor` →
    `delta.updateSyntheticActor()` (`client/documents/actor.mjs:683`, `:772-776`; `client/documents/token.mjs:3782-3792`).
    Хук `updateActor` при этом срабатывает **один раз — для базового** актёра; для синтетических отдельного хука нет.
  - Запись через `token.actor.update(...)`/`setFlag` уходит в `ActorDelta` этого токена
    (`client/data/client-backend.mjs:759-777`), базовый актёр не меняется. Хуки: `updateActorDelta` и
    `updateActor(syntheticActor, …)` (`client/documents/actor-delta.mjs:219-225`). `_preUpdate` выполняется на
    синтетическом актёре, поэтому `dnd5e.damageActor`/`healActor` работают и для несвязанных токенов.
  - **Ловушка (v14):** до завершения `Game#initializeDocuments` `token.actor` у «ленивой» дельты возвращает `null`
    (`client/documents/token.mjs:250-253`, `:284-286`; флаг снимается в `client/game.mjs:929`).
- **Prototype token**: `actor.prototypeToken` — `PrototypeToken` с подмножеством полей токена, в т. ч. собственными
  `flags` (`common/data/data.mjs:613-627`). Это **не** флаги актёра. При создании токена
  `actor.getTokenDocument()` копирует `prototypeToken.toObject()` (`client/documents/actor.mjs:337-339`); дальше флаги
  токена независимы от прототипа.
- Итого: флаг на актёре (`actor.flags.<module>`) виден связанному токену напрямую, несвязанному — через
  синтетического актёра (если дельта не переопределила); флаги `TokenDocument` и `prototypeToken.flags` — отдельные
  хранилища.

## 8. Отличия dnd5e 6.0.6 (тег `release-6.0.6`, для будущей миграции)

- `system.json`: `compatibility.minimum` = `14.367` (в 5.3.3 — `13.347`).
- **Авто-«повержен»**: новый `Actor5e#updateDowned` (`module/documents/actor/actor.mjs:3649-3680`), вызывается из
  `onUpdateHP` (`module/data/actor/templates/attributes.mjs:682-687`) и нового `onUpdateDeathSaves` (`:730-736`, вызов
  в `npc.mjs:504`, `character.mjs:295`). Мировая настройка `autoApplyDowned` (`module/settings.mjs:579-592`): `none`
  (по умолчанию) / `deadOnly` / `npcs` / `all`. Только в бою: при 0 ХП обычный NPC получает `dead`, важный NPC и (при
  `all`) персонаж — `unconscious`, при 3 проваленных спасбросках — `dead`. Эффекты с `flags.dnd5e.autoDowned`
  снимаются при ХП > 0; `dead` ставится оверлеем.
- **Состояния стали подтипом ActiveEffect**: `type: "condition"`, `system.type = <id статуса>`
  (`module/documents/active-effect.mjs:281-284`); старые эффекты со статическим `_id` мигрируют при загрузке
  (`:301-306`; `module/documents/token.mjs` — то же для дельт). Состояния не подавляются (`isSuppressed`, `:190-200`).
  Новое подавление: магические эффекты при статусе `antimagic`.
- `CONFIG.statusEffects` система присваивает **объектом** по id (`dnd5e.mjs:447-468`), ядро v14 превращает его в
  массив (`client/client.mjs:35-37`).
- **Окровавлен**: порог теперь в процентах — `CONFIG.DND5E.bloodied.threshold = 50` (было `.5`,
  `module/config.mjs:3916-3920`); у персонажа и NPC новое производное поле `system.attributes.hp.bloodied`
  (`persisted: false`, `npc.mjs:64`, `character.mjs:60`); условие `hp.pct === 100 || hp.pct > hp.bloodied` → снять
  (`actor.mjs:3624-3640`); только для `system.isCreature`; настройка читается через `dnd5e.settings.bloodied`.
- **Истощение**: уровень — `effect.system.level`, а не `flags.dnd5e.exhaustionLevel`
  (`attributes.mjs:450-452`, миграция в `active-effect.mjs` `migrateData`).
- В `onUpdateHP` добавлено `applyFallProne` (падение) у автора правки. Сигнатура и условия `dnd5e.damageActor` /
  `dnd5e.healActor` не изменились (`attributes.mjs:718`). Хуки `preApplyDamage`/`applyDamage`/`calculateDamage` на месте
  (`actor.mjs:819`, `841`, `870`, `967`).
- Бой: `Combat5e#_onExit` (`module/documents/combat.mjs:155-…`) удаляет у выбывшего бойца истёкшие и «боевые»
  эффекты; групповой бросок инициативы (`initiativeGroupRoll`); убран обход `this.turn = null` в `_onDelete`.
- `death.bonuses.save` у NPC заменён на непостоянную схему (`npc.mjs`, `bonuses: new SchemaField({}, { persisted:
  false })`).
- Легендарные ресурсы и `uses` по схеме не изменились (`spent`/`max`, `value` производное); в `uses-field.mjs`
  изменения касаются восстановления (не пишет `spent`, если значение уже такое) и масштабных значений.

## Не проверено

- Поведение `combatStart`/`combatTurn` при вызове из макроса игрока не проверялось вживую.
- Midi QOL и DAE не смотрели: в тикет не входили; они могут писать ХП в обход `applyDamage`.
