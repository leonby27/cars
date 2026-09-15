// Тексты страниц «О сервисе» и «О нас». Вынесены из App.jsx, потому что теми же
// текстами заполняется страница для поисковика: в разметке /how-it-works и /about было
// 43 и 41 слово — заголовок и одна фраза, — а всё остальное появлялось только после
// запуска приложения в браузере.
//
// Значки к этим записям приложение подставляет само: они живут в App.jsx рядом
// с вёрсткой, а сюда нельзя тащить код интерфейса — этот файл читает и сервер.

/** Конкретные возможности сервиса в начале страницы «О сервисе». */
export const SERVICE_PROOF = Object.freeze([
  { title: "Подбор под ваш бюджет", text: "Сравниваем рынок и версии" },
  { title: "Проверка до оплаты", text: "Проверяем продавца, цену и VIN" },
  { title: "Независимая диагностика", text: "Проверяем кузов и технику" },
  { title: "Проверка батареи", text: "Для электромобилей и гибридов" },
  { title: "Полная смета до Минска", text: "Показываем расходы по строкам" },
  { title: "Договор и этапная оплата", text: "Платёж — после согласования этапа" },
  { title: "Доставка под контролем", text: "Статусы и страховка в пути" },
  { title: "Таможня и документы", text: "Экспорт, таможня и ЭПТС" },
]);

/** Путь клиента от первого выбора до передачи автомобиля в Минске. */
export const PURCHASE_FLOW_STEPS = Object.freeze([
  {
    title: "Выбор автомобиля",
    text: "Каталог или подбор под вас",
  },
  {
    title: "Проверка и диагностика",
    text: "Проверка VIN и состояния",
  },
  {
    title: "Договор и выкуп",
    text: "Договор и выкуп автомобиля",
  },
  {
    title: "Логистика из Китая",
    text: "Экспорт и доставка в Беларусь",
  },
  {
    title: "Таможня и оформление",
    text: "Таможня и комплект документов",
  },
  {
    title: "Выдача в Минске",
    text: "Автомобиль, документы и ключи",
  },
]);

// Одна и та же компактная схема используется для любого отчёта: у пункта есть
// постоянный id, понятное клиенту название, статус, необязательное пояснение и
// ссылки на id фотографий из photoGroups. Компонент сам строит вкладки, фильтр
// и открывает только те снимки, которые относятся к выбранному пункту.
const inspectionPoints = (rows) => Object.freeze(rows.map(([
  id,
  label,
  status = "clear",
  detail = "",
  photoIds = [],
]) => Object.freeze({
  id,
  label,
  status,
  ...(detail ? { detail } : {}),
  ...(photoIds.length ? { photoIds: Object.freeze([...photoIds]) } : {}),
})));

/**
 * Демонстрационный отчёт, который клиент получает до выкупа автомобиля.
 *
 * Это данные универсального шаблона InspectionReport. Для следующей машины нужно
 * создать объект с теми же разделами и передать его компоненту — счётчики фото,
 * замечаний и состав видимых блоков рассчитываются автоматически.
 */
export const SERVICE_REPORT_EXAMPLE = Object.freeze({
  id: "audi-q2l-2021-demo",
  presentation: Object.freeze({
    title: "Пример отчёта о состоянии авто",
  }),
  vehicle: Object.freeze({
    name: "Audi Q2L",
    image: Object.freeze({
      src: "/services/report-example/audi-q2l-cover.png",
      alt: "Audi Q2L серого цвета, вид спереди слева",
      width: 960,
      height: 506,
    }),
    meta: Object.freeze([
      { id: "vin", label: "VIN", value: "LFV2••••••499094" },
      { id: "year", label: "Год", value: "2021" },
    ]),
  }),
  verdict: Object.freeze({
    tone: "confirmed",
    title: "Критичных повреждений не выявлено",
    summary: "Силовые элементы кузова без следов серьёзного ремонта. Признаков затопления и пожара нет. Есть два локальных замечания и зоны, которые требуют повторного осмотра на подъёмнике.",
  }),
  labels: Object.freeze({
    risksTitle: "Ключевые риски",
    inspectionTitle: "Что именно проверили",
    evidenceTitle: "Фотофиксация по пунктам отчёта",
    factsTitle: "Данные автомобиля",
    findingsTitle: "Что обнаружили",
  }),
  risks: Object.freeze([
    {
      id: "accident",
      tone: "attention",
      title: "Кузов и силовой каркас",
      status: "Следов серьёзного ДТП нет",
    },
    {
      id: "flood",
      tone: "confirmed",
      title: "Следы затопления",
      status: "Не обнаружены",
    },
    {
      id: "fire",
      tone: "confirmed",
      title: "Следы пожара",
      status: "Не обнаружены",
    },
  ]),
  inspectionSections: Object.freeze([
    {
      id: "accident",
      title: "Кузов и следы ДТП",
      points: inspectionPoints([
        ["left-lower-member", "Левая нижняя продольная балка"],
        ["right-headlight-frame", "Рамка правой передней фары"],
        ["left-headlight-frame", "Рамка левой передней фары"],
        ["left-upper-member", "Левая верхняя продольная балка"],
        ["left-rear-fender", "Левое заднее крыло", "attention", "Обнаружены восстановление лакокрасочного покрытия и кузовной ремонт металла на участке до 20 см.", ["left-rear-fender-repair"]],
        ["dashboard-frame", "Каркас панели приборов"],
        ["left-rear-inner-fender", "Внутренняя часть левого заднего крыла"],
        ["right-rear-inner-fender", "Внутренняя часть правого заднего крыла"],
        ["rear-panel", "Задняя панель кузова"],
        ["left-taillight-frame", "Рамка левого заднего фонаря"],
        ["left-fender-channel", "Водоотводящий канал левого заднего крыла"],
        ["left-rear-shock-tower", "Левая задняя опора амортизатора"],
        ["left-rear-wheel-arch", "Левая задняя колёсная арка"],
        ["right-rear-wheel-arch", "Правая задняя колёсная арка"],
        ["right-rear-shock-tower", "Правая задняя опора амортизатора"],
        ["airbags", "Подушки безопасности"],
        ["right-taillight-frame", "Рамка правого заднего фонаря"],
        ["left-rear-longitudinal", "Левая задняя продольная балка"],
        ["right-rear-longitudinal", "Правая задняя продольная балка"],
        ["right-fender-channel", "Водоотводящий канал правого заднего крыла"],
        ["right-rear-fender", "Правое заднее крыло"],
        ["right-upper-member", "Правая верхняя продольная балка"],
        ["spare-wheel-well", "Ниша запасного колеса и пол багажника"],
        ["firewall", "Перегородка моторного отсека"],
        ["right-b-pillar-inner", "Внутренняя часть правой стойки B"],
        ["left-b-pillar-inner", "Внутренняя часть левой стойки B"],
        ["floor-cross-member", "Поперечная балка пола", "limited", "Зона частично закрыта защитой. Полная оценка возможна после доступа к днищу на подъёмнике.", ["center-underbody"]],
        ["floor-longitudinal-member", "Продольная балка пола", "limited", "Зона частично закрыта защитой. Полная оценка возможна после доступа к днищу на подъёмнике.", ["center-underbody"]],
        ["right-lower-member", "Правая нижняя продольная балка"],
        ["roof-panel", "Панель крыши", "attention", "Обнаружены восстановление лакокрасочного покрытия и кузовной ремонт металла на участке не менее 15 см.", ["roof-repair-1", "roof-repair-2", "roof-repair-3"]],
        ["rear-parcel-shelf", "Металлическая панель за задним сиденьем"],
        ["left-front-door-seal", "Уплотнитель проёма левой передней двери"],
        ["left-rear-door-seal", "Уплотнитель проёма левой задней двери"],
        ["left-front-longitudinal", "Левая передняя продольная балка"],
        ["right-front-door-seal", "Уплотнитель проёма правой передней двери"],
        ["right-front-longitudinal", "Правая передняя продольная балка"],
        ["right-rear-door-seal", "Уплотнитель проёма правой задней двери"],
        ["left-front-crash-box", "Левый передний энергопоглощающий элемент", "not-applicable", "Отдельный элемент не предусмотрен конструкцией этой версии."],
        ["right-front-crash-box", "Правый передний энергопоглощающий элемент", "not-applicable", "Отдельный элемент не предусмотрен конструкцией этой версии."],
        ["radiator-frame", "Рамка радиатора"],
        ["left-front-shock-tower", "Левая передняя опора амортизатора"],
        ["right-front-shock-tower", "Правая передняя опора амортизатора"],
        ["left-front-fender-frame", "Каркас левого переднего крыла"],
        ["right-front-fender-frame", "Каркас правого переднего крыла"],
        ["dashboard", "Панель приборов"],
        ["left-front-seatbelt", "Левый передний ремень безопасности"],
        ["right-a-pillar-outer", "Наружная часть правой стойки A"],
        ["left-front-member-plate", "Соединительная пластина левой передней продольной балки"],
        ["right-a-pillar-inner", "Внутренняя часть правой стойки A"],
        ["right-front-member-plate", "Соединительная пластина правой передней продольной балки"],
        ["left-rear-member-plate", "Соединительная пластина левой задней продольной балки"],
        ["right-rear-member-plate", "Соединительная пластина правой задней продольной балки"],
        ["right-front-seatbelt", "Правый передний ремень безопасности"],
        ["right-b-pillar-outer", "Наружная часть правой стойки B", "not-applicable", "Отдельная зона не предусмотрена конструкцией этой версии."],
        ["right-c-pillar-outer", "Наружная часть правой стойки C", "not-applicable", "Отдельная зона не предусмотрена конструкцией этой версии."],
        ["right-c-pillar-inner", "Внутренняя часть правой стойки C"],
        ["front-crash-beam", "Передняя усилительная балка"],
        ["right-rear-seatbelt", "Правый задний ремень безопасности"],
        ["body-floor", "Пол кузова", "limited", "Часть днища закрыта защитными панелями.", ["center-underbody"]],
        ["right-d-pillar-outer", "Наружная часть правой стойки D", "not-applicable", "Отдельная зона не предусмотрена конструкцией этой версии."],
        ["right-d-pillar-inner", "Внутренняя часть правой стойки D"],
        ["rear-crash-beam", "Задняя усилительная балка"],
        ["left-d-pillar-outer", "Наружная часть левой стойки D", "not-applicable", "Отдельная зона не предусмотрена конструкцией этой версии."],
        ["left-d-pillar-inner", "Внутренняя часть левой стойки D"],
        ["left-c-pillar-outer", "Наружная часть левой стойки C", "not-applicable", "Отдельная зона не предусмотрена конструкцией этой версии."],
        ["left-c-pillar-inner", "Внутренняя часть левой стойки C"],
        ["left-b-pillar-outer", "Наружная часть левой стойки B", "not-applicable", "Отдельная зона не предусмотрена конструкцией этой версии."],
        ["left-rear-seatbelt", "Левый задний ремень безопасности"],
        ["left-a-pillar-outer", "Наружная часть левой стойки A"],
        ["left-a-pillar-inner", "Внутренняя часть левой стойки A"],
      ]),
    },
    {
      id: "flood",
      title: "Признаки затопления",
      points: inspectionPoints([
        ["left-sill-cavity", "Внутренняя полость левого порога"],
        ["right-sill-cavity", "Внутренняя полость правого порога"],
        ["left-sill-wiring", "Проводка в левом пороге"],
        ["right-sill-wiring", "Проводка в правом пороге"],
        ["rear-seat-frame", "Каркас и наполнитель заднего сиденья"],
        ["obd-connector", "Диагностический разъём OBD"],
        ["driver-seat-frame", "Направляющие и каркас водительского сиденья"],
        ["passenger-seat-frame", "Направляющие и каркас пассажирского сиденья"],
        ["left-foot-vent", "Левый воздуховод в ногах"],
        ["right-foot-vent", "Правый воздуховод в ногах"],
        ["trunk-wiring", "Проводка и блоки под полом багажника"],
        ["right-rear-buckle", "Замок правого заднего ремня"],
        ["left-rear-buckle", "Замок левого заднего ремня"],
        ["engine-connectors", "Электрические разъёмы моторного отсека"],
        ["flood-dashboard-frame", "Каркас панели приборов"],
        ["flood-spare-wheel-well", "Ниша запасного колеса и пол багажника"],
        ["left-front-floor-insulation", "Шумоизоляция и герметик пола спереди слева"],
        ["left-floor-cross-member", "Внутренняя часть левой поперечины пола"],
        ["left-rear-floor-insulation", "Шумоизоляция и герметик пола сзади слева"],
        ["right-front-floor-insulation", "Шумоизоляция и герметик пола спереди справа"],
        ["right-floor-cross-member", "Внутренняя часть правой поперечины пола"],
        ["dashboard-vents", "Воздуховоды панели приборов"],
        ["right-rear-floor-insulation", "Шумоизоляция и герметик пола сзади справа"],
        ["engine-fuse-box", "Блок предохранителей в моторном отсеке"],
        ["right-front-carpet", "Ковровое покрытие и обшивка спереди справа"],
        ["headliner", "Обшивка потолка"],
        ["twelve-volt-socket", "Разъём 12 В"],
        ["steering-column", "Рулевая колонка"],
        ["right-rear-carpet", "Ковровое покрытие и обшивка сзади справа"],
        ["left-rear-carpet", "Ковровое покрытие и обшивка сзади слева"],
        ["left-front-carpet", "Ковровое покрытие и обшивка спереди слева"],
      ]),
    },
    {
      id: "fire",
      title: "Признаки пожара",
      points: inspectionPoints([
        ["fire-trunk-wiring", "Проводка и блоки под полом багажника"],
        ["fire-left-rear-arch", "Левая задняя колёсная арка"],
        ["fire-right-rear-arch", "Правая задняя колёсная арка"],
        ["body-panels", "Наружные панели кузова"],
        ["engine-sound-insulation", "Шумоизоляция моторного отсека"],
        ["engine-hoses", "Шланги и магистрали моторного отсека"],
        ["engine-plastics", "Пластиковые элементы моторного отсека"],
        ["cabin-trim", "Обшивка салона"],
        ["cabin-wiring", "Проводка и разъёмы салона"],
        ["fire-trunk", "Багажное отделение"],
        ["starter-battery", "Аккумулятор 12 В и навесное оборудование"],
        ["dashboard-equipment", "Панель приборов и навесные элементы"],
        ["right-shock-sealant", "Герметик правой передней опоры амортизатора"],
        ["left-shock-sealant", "Герметик левой передней опоры амортизатора"],
        ["fuel-tank-lines", "Топливный бак и магистрали", "limited", "Полный доступ к баку и магистралям возможен только на подъёмнике.", ["rear-underbody"]],
        ["engine-labels-wiring", "Проводка и маркировки моторного отсека"],
        ["fire-driver-seat", "Водительское сиденье"],
        ["fire-engine-fuse-box", "Блок предохранителей моторного отсека"],
        ["firewall-heat-shield", "Теплозащита перегородки моторного отсека"],
        ["fire-rear-seat", "Заднее сиденье"],
        ["fire-passenger-seat", "Пассажирское сиденье"],
        ["fire-body-floor", "Пол кузова", "limited", "Часть днища закрыта защитными панелями.", ["center-underbody"]],
        ["trunk-trim", "Обшивка багажного отделения"],
      ]),
    },
  ]),
  facts: Object.freeze([
    { id: "mileage", label: "Пробег", value: "49 470 км" },
    { id: "engine", label: "Двигатель", value: "1,4 л · турбо" },
    { id: "fuel", label: "Топливо", value: "Бензин" },
    { id: "production-date", label: "Дата выпуска", value: "Декабрь 2021" },
  ]),
  photoGroups: Object.freeze([
    {
      id: "body-repairs",
      title: "Выявленные кузовные ремонты",
      result: "На левом заднем крыле обнаружен кузовной ремонт участка до 20 см; на панели крыши — участка не менее 15 см. Обе зоны окрашивались.",
      tone: "attention",
      photos: Object.freeze([
        { id: "left-rear-fender-repair", src: "/services/report-example/14-left-rear-fender-repair.webp", alt: "Замер восстановленного участка левого заднего крыла Audi Q2L", caption: "Левое заднее крыло — замер восстановленного участка", width: 1536, height: 2048 },
        { id: "roof-repair-1", src: "/services/report-example/15-roof-repair-1.webp", alt: "Замер восстановленного участка панели крыши Audi Q2L", caption: "Панель крыши — первый замер", width: 1536, height: 2048 },
        { id: "roof-repair-2", src: "/services/report-example/16-roof-repair-2.jpg", alt: "Повторный замер восстановленного участка панели крыши Audi Q2L", caption: "Панель крыши — второй замер", width: 640, height: 480 },
        { id: "roof-repair-3", src: "/services/report-example/17-roof-repair-3.jpg", alt: "Дополнительная фиксация восстановленного участка панели крыши Audi Q2L", caption: "Панель крыши — дополнительная фиксация", width: 640, height: 480 },
      ]),
    },
    {
      id: "exterior",
      title: "Кузов и внешняя геометрия",
      result: "Общий вид автомобиля, кузовные панели и зазоры зафиксированы со всех основных ракурсов.",
      points: Object.freeze(["панели кузова", "зазоры", "светотехника", "пороги"]),
      tone: "attention",
      photos: Object.freeze([
        { id: "front-left", src: "/services/report-example/01-exterior-front-left.jpg", alt: "Audi Q2L, вид спереди слева на площадке осмотра", caption: "Передняя часть и левый борт", width: 960, height: 720 },
        { id: "front-right", src: "/services/report-example/05-exterior-front-right.jpg", alt: "Audi Q2L, вид спереди справа на площадке осмотра", caption: "Правая фара, крыло и зазоры", width: 960, height: 720 },
        { id: "rear-right", src: "/services/report-example/02-exterior-rear-right.jpg", alt: "Audi Q2L, вид сзади справа на площадке осмотра", caption: "Задняя часть и правый борт", width: 960, height: 720 },
        { id: "rear-left", src: "/services/report-example/06-exterior-rear-left.jpg", alt: "Audi Q2L, вид сзади слева на площадке осмотра", caption: "Левое заднее крыло и задняя часть", width: 960, height: 720 },
        { id: "roof", src: "/services/report-example/09-roof.jpg", alt: "Панорамная крыша Audi Q2L снаружи", caption: "Панель крыши", width: 960, height: 720 },
      ]),
    },
    {
      id: "mileage-controls",
      title: "Пробег и органы управления",
      result: "Показания одометра и состояние приборной панели зафиксированы на дату проверки.",
      points: Object.freeze(["одометр", "контрольные лампы", "приборная панель"]),
      tone: "confirmed",
      photos: Object.freeze([
        { id: "odometer", src: "/services/report-example/04-mileage.jpg", alt: "Панель приборов Audi Q2L с пробегом 49 470 километров", caption: "Одометр: 49 470 км", width: 960, height: 720 },
        { id: "dashboard", src: "/services/report-example/03-cabin-dashboard.jpg", alt: "Передняя часть салона и приборная панель Audi Q2L", caption: "Панель приборов и органы управления", width: 960, height: 720 },
      ]),
    },
    {
      id: "interior-flood",
      title: "Салон и признаки затопления",
      result: "На доступных поверхностях нет характерных следов влаги, плесени или коррозии.",
      points: Object.freeze(["сиденья", "ковровое покрытие", "потолок", "багажник"]),
      tone: "confirmed",
      photos: Object.freeze([
        { id: "driver-seat", src: "/services/report-example/07-driver-seat.jpg", alt: "Водительское место и ковровое покрытие Audi Q2L", caption: "Водительское место и пол", width: 960, height: 720 },
        { id: "rear-seat", src: "/services/report-example/08-rear-seat.jpg", alt: "Задний ряд сидений Audi Q2L", caption: "Задний ряд и дверной проём", width: 960, height: 720 },
        { id: "trunk", src: "/services/report-example/10-trunk.jpg", alt: "Открытый багажник Audi Q2L", caption: "Багажное отделение", width: 960, height: 720 },
      ]),
    },
    {
      id: "engine-fire",
      title: "Моторный отсек и следы перегрева",
      result: "На доступных узлах нет следов копоти, оплавления или грубого вмешательства.",
      points: Object.freeze(["проводка", "пластиковые элементы", "перегородка моторного отсека"]),
      tone: "confirmed",
      photos: Object.freeze([
        { id: "engine-bay", src: "/services/report-example/12-engine-bay.jpg", alt: "Открытый моторный отсек Audi Q2L", caption: "Общий вид моторного отсека", width: 960, height: 720 },
      ]),
    },
    {
      id: "underbody",
      title: "Днище и зоны с ограниченным доступом",
      result: "Осмотр частичный: защита закрывает часть силовых элементов и скрытых полостей.",
      points: Object.freeze(["днище", "поперечины", "топливный бак", "выпускная система"]),
      tone: "attention",
      photos: Object.freeze([
        { id: "rear-underbody", src: "/services/report-example/11-underbody-rear.jpg", alt: "Задняя часть днища и выпускная система Audi Q2L", caption: "Задняя часть днища", width: 960, height: 720 },
        { id: "center-underbody", src: "/services/report-example/13-underbody-center.jpg", alt: "Центральная часть днища Audi Q2L с защитными панелями", caption: "Центральная защита днища", width: 960, height: 720 },
      ]),
    },
  ]),
  findings: Object.freeze([
    { id: "roof-panel", tone: "attention", title: "Панель крыши", text: "Восстановление лакокрасочного покрытия и кузовной ремонт металла на участке не менее 15 см.", photoIds: Object.freeze(["roof-repair-1", "roof-repair-2", "roof-repair-3"]) },
    { id: "left-rear-fender", tone: "attention", title: "Левое заднее крыло", text: "Восстановление лакокрасочного покрытия и кузовной ремонт металла на участке до 20 см.", photoIds: Object.freeze(["left-rear-fender-repair"]) },
    { id: "vin-markings", tone: "confirmed", text: "VIN и заводские маркировки читаются, следов вмешательства не обнаружено." },
  ]),
  limitations: Object.freeze({
    title: "Что не удалось проверить полностью",
    items: Object.freeze([
      "Продольные и поперечные элементы днища частично закрыты защитой.",
      "Топливный бак и отдельные скрытые полости нельзя полностью осмотреть без подъёмника и демонтажа защиты.",
    ]),
  }),
});

/** Что клиент получает до оплаты автомобиля. */
export const BEFORE_PAYMENT = Object.freeze([
  "Подтверждение наличия и цены",
  "VIN и результаты проверки",
  "Итоговую смету с диапазонами",
  "Понятный план доставки",
]);

/** Разделы страницы «О сервисе» — заголовок и вводный абзац каждого. */
export const SERVICE_SECTIONS = Object.freeze([
  {
    title: "Вы принимаете решение на основе полной картины",
    text: "Если автомобиль не проходит проверку или итоговые условия меняются, мы не подталкиваем к сделке — помогаем найти другой вариант.",
  },
]);

// Отдельной страницы «О нас» больше нет — её заголовок дублировал «О сервисе», и обе
// отвечали на один запрос. Карточки переехали вниз страницы «О сервисе»; блок
// «Из объявления — в понятную карточку» удалён: он повторял пять этапов покупки.

/** Проверка и сопровождение — внизу страницы «О сервисе». */
export const ABOUT_PRINCIPLES = Object.freeze([
  { title: "Независимая проверка", text: "Проверяем кузов, технику и батарею до оплаты — показываем результаты и помогаем оценить риски" },
  { title: "Отслеживание авто", text: "Сообщаем статус на ключевых этапах пути до Минска" },
]);
