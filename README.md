# HSW Studio

Конструктор стены **Honeycomb Storage Wall (HSW)** в браузере · Browser-based designer for the **Honeycomb Storage Wall**.

[Русский](#русский) · [English](#english)

---

## Русский

Проектируете стену целиком, а не одну панель: форма, размер, рамка, вырезы под розетки, аксессуары. Приложение само режет стену на панели под ваш принтер и выдаёт готовые к печати STL или 3MF.

### Возможности

- **Вся стена сразу.** 2D-редактор с зумом и панорамой и 3D-превью с тенями и разнесённым видом. Аксессуары можно ставить и перетаскивать в обоих.
- **Формы:** прямоугольник со скруглёнными углами, шестиугольник, эллипс и классический «край по сотам».
- **Рамка:** отдельными частями или заодно с крайними панелями. Стили «Классика», «Ступенька», «С канавкой», «Багет», «Валик», «Выкружка». Есть канал под LED-ленту: спереди или ореолом сзади. новые стили добавляются в реестр `src/geometry/frames/`. Есть выступ над сотами, губа, которая прижимает края панелей к стене, и соединения внахлёст между частями рамки (каждый нахлёст стягивается одним саморезом). Рамка автоматически режется на части под стол принтера; разрезы на прямых участках ставятся симметрично.
- **Ячейки у края:** только целые или обрезанные по контуру. Минимальная стенка у края, сдвиг и смена шахматного порядка сетки.
- **Автонарезка на панели** под выбранный принтер (пресеты Bambu, Prusa, Creality, Voron или свой размер). Швы идут по середине стенок между ячейками. Панели подписаны (A1, B2, …) и при экспорте разворачиваются так, чтобы влезть на стол.
- **Крепление соединителями:** соединители защёлкиваются в ячейки поверх швов, каждый крепится одним саморезом. Четверные ставятся там, где сходятся панели, парные вдоль швов с заданным шагом, одиночные там, где панели нужно больше крепежа. Используются соединители и вставки PStover (CC BY-NC 4.0). Есть и старый режим с ячейками под саморез. Инструмент «сплошная ячейка» никуда не делся.
- **Вырезы** под розетки и выключатели: бортик вокруг, фаска, перетаскивание мышью.
- **Библиотека аксессуаров:** крючок, штырь, держатель плоскогубцев, полка, коробка, рейка для отвёрток, кольцо, табличка, заглушка. У каждого свои параметры. Вставки (inserts) генерируются автоматически, а редактор проверяет, что они попадают в свободные ячейки.
- **Свои модели:** загрузите STL, чтобы увидеть его на стене при планировании.
- **Тестовый набор:** маленькая панель, части рамки с соединениями, вставка и крючок с вашими настройками, чтобы проверить посадку перед печатью всей стены.
- **Допуски:** поправки для отверстий ячеек и для вставок, чтобы подстроить посадку под свой принтер по результату тестовой печати.
- **Маркировка и сборка:** номер детали гравируется на донышке ячейки под саморез (панели) и зеркально на обратной стороне (рамка). Пошаговая инструкция по сборке в HTML: порядок панелей, затем нижние и верхние части рамки, затем аксессуары. Каждый шаг со схемой.
- **Экспорт:** ZIP со STL или один 3MF, схема сборки в SVG, оценка расхода пластика.
- **Проект:** сохранение в файл, ссылка на проект, автосохранение в браузере, отмена и повтор.
- Интерфейс на русском и английском, светлая и тёмная тема, адаптивная вёрстка.

### Горячие клавиши

| Клавиша | Действие |
| --- | --- |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Отменить / повторить |
| `Delete` | Удалить выбранное |
| Стрелки | Сдвинуть аксессуар на ячейку |
| `F` | Показать всё |
| `1` / `2` | 2D / 3D |
| `Esc` | Отменить установку или выделение |
| `Shift` + клик | Поставить несколько аксессуаров подряд |
| `Alt` + перетаскивание, колесо, средняя кнопка | Навигация |

---

## English

Design the whole wall instead of one panel at a time. Set the shape, size, frame, cutouts for sockets and accessories. The app splits the wall into panels that fit your printer and exports print-ready STL or 3MF files.

### Features

- **Whole-wall editor.** 2D editor with zoom and pan, plus a 3D preview with shadows and an exploded view. Accessories can be placed and dragged in both.
- **Shapes:** rounded rectangle, hexagon, ellipse and the classic honeycomb edge.
- **Frames:** printed as separate parts or as part of the edge panels. Styles: Classic, Stepped, Grooved, Bevel, Bead and Cove. An optional LED strip channel goes in the front or at the back for a halo. new styles are added in the registry in `src/geometry/frames/`. The frame can stand out over the cells, has a lip that holds the panel edges against the wall, and has half-lap joints between its parts, each joint held by one screw. The frame is split automatically to fit the bed, with symmetric cuts on straight edges.
- **Edge cells:** whole cells only, or cells cut along the outline. Set the minimum edge wall, shift the grid or flip the column stagger.
- **Automatic panel splitting** for your printer (Bambu, Prusa, Creality and Voron presets, or a custom bed). Seams run along the middle of the walls between cells. Panels are labelled (A1, B2, …) and rotated on export so they fit the bed.
- **Connector mounting:** snap-in connectors bridge the seams between panels, and each one takes a single screw. 4-cell connectors go where panels meet, 2-cell ones along the seams at a set spacing, and single ones wherever a panel needs more screws. The connectors and inserts are PStover's (CC BY-NC 4.0). The older screw-cell mode is still available, and any cell can be made solid.
- **Cutouts** for sockets and switches, with a rim and a chamfer, moved by dragging.
- **Accessory library:** hook, peg, plier holder, shelf, bin, screwdriver rack, ring holder, label plate and cap, each with its own parameters. The inserts are generated automatically, and the editor checks that they land on free cells.
- **Your own STLs:** upload a model to see it on the wall while you plan.
- **Test kit:** a small panel, jointed frame parts, an insert and a hook with your settings, to check the fit before printing the whole wall.
- **Tolerances:** separate adjustments for the cell holes and for the inserts, to tune the fit to your printer after the test print.
- **Labels and assembly:** part labels are engraved on a screw-cell floor (panels) and mirrored on the back (frame). A step-by-step HTML assembly guide covers panel order, then the lower and upper frame parts, then accessories, with a diagram for each step.
- **Export:** a ZIP of STLs or one 3MF, an SVG assembly sheet and a filament estimate.
- **Projects:** save to a file, share as a link, autosave in the browser, undo and redo.
- English and Russian UI, light and dark themes, responsive layout.

### Development

```bash
npm install
npm run dev      # dev server
npm test         # geometry tests (layout, watertight solids)
npm run build    # production build in dist/
```

The app is a static site, built with TypeScript, React, Three.js (react-three-fiber) and [manifold-3d](https://github.com/elalish/manifold) (WASM CSG). All geometry runs in a Web Worker.

### Publishing on GitHub Pages

The ready-to-serve build is committed in `docs/`. After changing the code, rebuild it:

```bash
npm run build:pages   # writes docs/ (plus docs/.nojekyll)
```

In the repository, set *Settings → Pages → Build and deployment → Source: Deploy from a branch*, then pick *Branch: `main`* and *folder: `/docs`*.

### Geometry

| Parameter | Value |
| --- | --- |
| Hole (flat to flat) | 20 mm |
| Wall on each side of a hole | 1.8 mm (pitch 23.6 mm) |
| Panel depth | 8 mm |
| Front recess | 22 mm, from 6 mm deep |
| Back chamfer | 0.4 mm |

These values match the original HSW and the community OpenSCAD generators that reproduce it. The generated inserts (19.7 mm body, 22.5 mm lip, snap ridges) are compatible-by-design, but print a small test piece first. Tolerances vary between printers.

### Credits

- Honeycomb Storage Wall is the original design by **RostaP** ([Printables](https://www.printables.com/model/152592-honeycomb-storage-wall)).
- Reference dimensions were taken from the community OpenSCAD work by Xander, EdwinEesting and geru ([geru/3d-scad-hsw-customizable](https://github.com/geru/3d-scad-hsw-customizable), CC BY 4.0) and from the insert parameters in [CameronBrooks11/honeycomb-wall-scad](https://github.com/CameronBrooks11/honeycomb-wall-scad). No code was copied from either project.
- Inserts and panel connectors are **PStover's** HSW models (CC BY-NC 4.0), used as meshes in `src/assets/pstover/`. That folder's README lists the parts and the changes made. Because of that licence, connectors and accessories exported with these inserts may not be used commercially.

### License

The source code is released under the [MIT License](LICENSE). The PStover models in `src/assets/pstover/` keep their own licence, CC BY-NC 4.0.
