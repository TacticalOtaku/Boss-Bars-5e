# План этапа 0 — каркас

Дата: 2026-10-25 · Статус: **одобрен пользователем 2026-10-25** («Сделай push main, остальное всё ок»)
Спека: [§16, строка 0](../spec.md#16-этапы), [Порядок этапов](https://github.com/TacticalOtaku/Boss-Bars-5e/issues/18).
Опора: сборка loreframe (TS + Vite + Vitest + SCSS, `tools/` для deploy и release).

## Результат

Модуль `boss-bars-5e` 0.1.0 собирается, проходит `npm run check`, ставится через `npm run deploy` и грузится без
ошибок у ГМа и игрока в мире `test`. Поверх `#interface` лежит пустой оверлей, который не перехватывает клики.
`npm run stand` открывает стенд, где тот же оверлей стоит в макете экрана Foundry. `npm run release` пишет
`dist/boss-bars-5e-v0.1.0.zip`.

## Файлы

```
.gitattributes            * text=auto eol=lf; woff2, png, webp, gif, jpg, ogg, zip — binary
.gitignore                + node_modules/, dist/, *.zip, .claude/ (CLAUDE.md уже там)
.prettierrc.json .prettierignore .stylelintrc.json eslint.config.js     из loreframe, префиксы bb5e
package.json              скрипты и devDependencies как у loreframe, version 0.1.0
tsconfig.json             strict, как у loreframe; include src, stand, tests, конфиги
src/core/tsconfig.json    lib ES2023 без DOM, без типов Foundry — граница чистого ядра
vite.config.ts            lib-сборка в dist/module: scripts/boss-bars-5e.js, styles/boss-bars-5e.css + статика
vitest.config.ts          environment node; DOM-тесты — `// @vitest-environment happy-dom`
module.json               id, title, compatibility 14 / 14.367 / 14, relationships.systems dnd5e 5.3.3,
                          esmodules, styles, languages en/ru, socket: true, url/manifest/download
lang/en.json lang/ru.json ключи BB5E.*: пока только название модуля
LICENSE README.md CHANGELOG.md
src/main.ts               init: api-заглушки нет; ready: mountOverlay(#interface)
src/constants.ts          MODULE_ID, LOG_PREFIX "Boss Bars 5e |"
src/logger.ts             как utils/logger.ts в loreframe, без настройки debug
src/foundry/globals.d.ts  только то, что трогаем: Hooks, game.modules
src/core/screens.ts       экраны предпросмотра 1366×768 … 3440×1440 (§10); нужны стенду сейчас и раскладке на этапе 3
src/ui/overlay.ts         mountOverlay(host): создаёт <div id="boss-bars-5e" class="bb5e-overlay">, повторный вызов
                          возвращает тот же элемент
styles/boss-bars-5e.scss  корень оверлея: absolute, inset 0, pointer-events none, z-index var(--z-index-app);
                          токены --bb5e-* на корне, не на :root
stand/index.html stand/stand.ts   макет #interface выбранного экрана: зоны контролов, навигации, сайдбара, хотбара;
                          оверлей монтируется тем же mountOverlay, его границы видны
tools/deploy.mjs package.mjs release-manifest.mjs zip.mjs   из loreframe, MODULE_ID boss-bars-5e
tests/manifest.test.ts    манифест (id, compatibility, файлы), паритет ключей и плейсхолдеров en/ru, нет пустых строк
tests/release.test.ts     из loreframe: zip, URL релиза, validateManifest
tests/overlay.test.ts     happy-dom: монтируется в host один раз, повторный вызов не дублирует
```

`src/integrations/dnd5e` и `src/apps` не создаются: в них пока нечего класть (этап 1).

## Скрипты

| Скрипт | Что делает |
|---|---|
| `typecheck` | `tsc --noEmit && tsc --noEmit -p src/core` |
| `lint` | `eslint . && stylelint "styles/**/*.scss" && prettier --check .` |
| `test` | `vitest run` |
| `build` | `vite build` |
| `check` | typecheck → lint → test → build |
| `deploy` | `node tools/deploy.mjs` |
| `package` / `release` | как в loreframe: `release` = check + package, архив не перезаписывается |
| `stand` | `vite stand` (dev-сервер стенда, в сборку не входит) |

ESLint дополнительно запрещает в `src/core/**` импорты из `src/foundry`, `src/ui` и любых DOM-модулей
(`no-restricted-imports`); вторая линия — `src/core/tsconfig.json` без DOM и без `globals.d.ts`.

## Порядок работы

1. `.gitattributes` и `.gitignore` — первыми, до любых других файлов.
2. Конфиги, `package.json`, `npm install`.
3. `module.json`, `lang/`, `LICENSE`, `README.md`, `CHANGELOG.md`.
4. Тесты манифеста, релиза, оверлея — красные; затем `constants`, `logger`, `overlay`, `main`, SCSS — зелёные.
5. `tools/` из loreframe.
6. Стенд.
7. `npm run check > log && npm run deploy`, затем `npm run release`.
8. Модульный `CLAUDE.md` (описание, команды, инварианты; он вне git).
9. Живая проверка.

## Живая проверка (мир `test`, 14.367 / 5.3.3)

Перед шагом 1 — спросить пользователя: мир запускается только с его согласия.

1. Foundry в Setup → запустить `test` (новый модуль виден только после возврата в Setup).
2. Включить `boss-bars-5e` в `core.moduleConfiguration`, перезагрузить клиентов.
3. ГМ `Claude` и игрок `Claude 2` (as=both):
   - в консоли нет ошибок и предупреждений от модуля; общий фон ошибок записать до включения модуля и сравнить;
   - `#interface > #boss-bars-5e` есть ровно один, его прямоугольник совпадает с `#interface`;
   - `getComputedStyle(...).pointerEvents === "none"`, `elementFromPoint` в центре экрана — не оверлей;
   - `game.modules.get("boss-bars-5e").active === true`, стиль `styles/boss-bars-5e.css` загружен.
4. Изменённые клиентские настройки вернуть.

## Решения (2026-10-25, все рекомендации приняты)

1. В `src/` только `core/`, `foundry/`, `ui/`; `integrations/dnd5e` и `apps/` — с этапа 1.
2. Граница ядра — `src/core/tsconfig.json` без DOM и типов Foundry + ESLint `no-restricted-imports`.
3. Vitest в Node по умолчанию, happy-dom по комментарию в файле.
4. `prettier --check .` входит в `npm run check`.
5. В `module.json` сразу `socket: true`, `styles`, `languages`, `relationships.systems` dnd5e 5.3.3.
6. Префиксы: `#boss-bars-5e`, классы `bb5e-…`, токены `--bb5e-…`, ключи `BB5E.…`.
7. Оверлей в `#interface`, `z-index: var(--z-index-app)`; слой уточняется на этапе 3.
8. Стенд — `npm run stand`, макет `#interface`, выбор экрана.
9. MIT, README-заглушка, `CHANGELOG.md`.
10. Мир `test` запускается и модуль включается только после «да» пользователя; модуль остаётся включённым.
    Один коммит в конце этапа после согласия, без push. `main` запушен по просьбе пользователя 2026-10-25.
