// Russian rendering of the source's technical spec sheet.
//
// The catalog stores every Che168 spec sheet verbatim in English
// (`technicalSpecs`, ~85 items in 7 groups). The vocabulary is small and
// closed — 166 distinct item names and ~500 recurring text values across all
// 33k cards — so the page translates at render time from these dictionaries
// instead of rewriting the database. Anything the dictionaries and patterns
// don't recognise (motor model codes, tire sizes, brand names) is shown as-is:
// those read the same in any language.

const GROUPS = {
  "Basic Specifications": "Общие данные",
  "Battery & Charging": "Батарея и зарядка",
  "Body": "Кузов",
  "Chassis & Steering": "Шасси и рулевое управление",
  "Electric Motor": "Электромотор",
  "Engine": "Двигатель",
  "Transmission": "Трансмиссия",
  "Wheels & Brakes": "Колёса и тормоза",
  "Other": "Прочее",
};

const NAMES = {
  // Basic Specifications
  "Model Name": "Название модели",
  "Manufacturer Suggested Retail Price (¥)": "Рекомендованная цена нового (¥)",
  "Manufacturer": "Производитель",
  "Class": "Класс",
  "Energy Type": "Тип энергии",
  "Launch Date": "Дата выхода на рынок",
  "Length*Width*Height (mm)": "Длина × ширина × высота (мм)",
  "Max Torque (N·m)": "Макс. крутящий момент (Н·м)",
  "Top speed (km/h)": "Максимальная скорость (км/ч)",
  "Official 0-100km/h acceleration (s)": "Разгон 0–100 км/ч, заявленный (с)",
  "Official 0-50km/h Acceleration (s)": "Разгон 0–50 км/ч, заявленный (с)",
  "Measured 0-100km/h acceleration (s)": "Разгон 0–100 км/ч, замер (с)",
  "Official 100-0km/h Braking Distance (m)": "Торможение 100–0 км/ч, заявленное (м)",
  "Measured 100-0km/h braking (m)": "Торможение 100–0 км/ч, замер (м)",
  "Maximum power (kW)": "Максимальная мощность (кВт)",
  "Maximum Gross Weight (kg)": "Полная масса (кг)",
  "Curb weight (kg)": "Снаряжённая масса (кг)",
  "Maximum Trailer Weight (kg)": "Макс. масса прицепа (кг)",
  "Electric Motor (Ps)": "Мощность электромотора (л.с.)",
  "Vehicle warranty": "Гарантия на автомобиль",
  "First owner warranty policy": "Гарантия для первого владельца",
  "Abbreviation": "Сокращённое название",
  "Emission Standard": "Экологический стандарт",
  "Engine": "Двигатель",
  "Measured range (km)": "Запас хода, замер (км)",
  "Measured fuel consumption (L/100km)": "Расход топлива, замер (л/100 км)",
  "Measured average electricity consumption (kWh/100km)": "Средний расход энергии, замер (кВт·ч/100 км)",
  "Measured fast charging time (hours)": "Время быстрой зарядки, замер (ч)",
  "Measured fast charging capacity range of battery (%)": "Диапазон быстрой зарядки, замер (%)",
  "Measured fuel consumption at minimum charge state (L/100km)": "Расход при разряженной батарее, замер (л/100 км)",
  "Electricity Equivalent Fuel Consumption (L/100km)": "Эквивалентный расход топлива (л/100 км)",
  "Comprehensive fuel and electricity consumption (L/100km)": "Совокупный расход топлива и энергии (л/100 км)",
  "WLTC Combined Fuel Consumption (L/100km)": "Смешанный расход WLTC (л/100 км)",
  "NEDC combined fuel consumption (L/100km)": "Смешанный расход NEDC (л/100 км)",
  "CLTC comprehensive fuel consumption (L/100km)": "Совокупный расход CLTC (л/100 км)",
  "WLTC Fuel Consumption at Minimum Charge State (L/100km)": "Расход WLTC при разряженной батарее (л/100 км)",
  "Fuel Consumption with Discharged Battery (L/100km)": "Расход при разряженной батарее (л/100 км)",
  "Fuel consumption at minimum charge state (L/100km) NEDC": "Расход NEDC при разряженной батарее (л/100 км)",
  "Fuel consumption at minimum charge state (L/100km) CLTC": "Расход CLTC при разряженной батарее (л/100 км)",
  // Battery & Charging
  "Battery Type": "Тип батареи",
  "Battery Energy (kWh)": "Ёмкость батареи (кВт·ч)",
  "Fast Charging": "Быстрая зарядка",
  "High Voltage Fast Charging": "Высоковольтная быстрая зарядка",
  "Battery cell brand": "Производитель ячеек",
  "Battery Cooling Method": "Охлаждение батареи",
  "Battery Special Technology": "Особые технологии батареи",
  "Battery Energy Density (Wh/kg)": "Плотность энергии (Вт·ч/кг)",
  "Battery Swap": "Замена батареи",
  "Battery pack warranty": "Гарантия на батарею",
  "Battery fast charging time (minutes)": "Время быстрой зарядки (мин)",
  "Power Consumption (kWh/100km)": "Расход энергии (кВт·ч/100 км)",
  "Fast Charging Time (hours)": "Время быстрой зарядки (ч)",
  "Slow Charging Time (hours)": "Время медленной зарядки (ч)",
  "Fast Charge Capacity Range (%)": "Диапазон быстрой зарядки (%)",
  "Slow Charge Capacity Range (%)": "Диапазон медленной зарядки (%)",
  "Fast Charging Port Location": "Разъём быстрой зарядки",
  "Slow Charging Port Location": "Разъём медленной зарядки",
  "Fast Charging Power (kW)": "Мощность быстрой зарядки (кВт)",
  "External AC Discharge Power (kW)": "Внешняя отдача энергии AC (кВт)",
  "External DC Discharge Power (kW)": "Внешняя отдача энергии DC (кВт)",
  "Minimum Allowed External Discharge (%)": "Мин. остаток при внешней отдаче (%)",
  "High-voltage platform (V)": "Высоковольтная платформа (В)",
  "Charging Station Price (CNY)": "Цена зарядной станции (¥)",
  "CLTC Pure Electric Range (km)": "Запас хода на электротяге CLTC (км)",
  "WLTC Pure Electric Range (km)": "Запас хода на электротяге WLTC (км)",
  "NEDC Pure Electric Range (km)": "Запас хода на электротяге NEDC (км)",
  "CLTC Combined Range (km)": "Общий запас хода CLTC (км)",
  "WLTC Combined Range (km)": "Общий запас хода WLTC (км)",
  "NEDC Combined Range (km)": "Общий запас хода NEDC (км)",
  // Body
  "Length (mm)": "Длина (мм)",
  "Width (mm)": "Ширина (мм)",
  "Height (mm)": "Высота (мм)",
  "Wheelbase (mm)": "Колёсная база (мм)",
  "Front track (mm)": "Передняя колея (мм)",
  "Rear track (mm)": "Задняя колея (мм)",
  "Body structure": "Конструкция кузова",
  "Body Structure": "Конструкция кузова",
  "Door Opening Method": "Тип открывания дверей",
  "Rear door opening style": "Тип открывания задней двери",
  "Number of doors": "Количество дверей",
  "Seating capacity": "Количество мест",
  "Drag Coefficient (Cd)": "Коэффициент аэродинамики (Cd)",
  "Trunk capacity (L)": "Объём багажника (л)",
  "Front Trunk Volume (L)": "Передний багажник (л)",
  "Fuel tank capacity (L)": "Объём топливного бака (л)",
  "Approach angle (°)": "Угол въезда (°)",
  "Departure angle (°)": "Угол съезда (°)",
  "Ramp breakover angle (°)": "Угол рампы (°)",
  "Minimum turning radius (m)": "Мин. радиус разворота (м)",
  "Minimum ground clearance (mm)": "Минимальный клиренс (мм)",
  "Unladen minimum ground clearance (mm)": "Клиренс без нагрузки (мм)",
  "Fully loaded minimum ground clearance (mm)": "Клиренс при полной загрузке (мм)",
  "Maximum climb gradient (%)": "Макс. подъём (%)",
  "Maximum Climbing Angle (°)": "Макс. угол подъёма (°)",
  "Maximum wading depth (mm)": "Глубина преодолеваемого брода (мм)",
  "Cargo box dimensions (mm)": "Размеры грузового отсека (мм)",
  "Maximum payload (kg)": "Грузоподъёмность (кг)",
  // Chassis & Steering
  "Drive Type": "Тип привода",
  "4WD Type": "Тип полного привода",
  "Front Suspension Type": "Передняя подвеска",
  "Rear Suspension Type": "Задняя подвеска",
  "Power Steering Type": "Усилитель руля",
  "Center Differential Structure": "Межосевой дифференциал",
  "Steer-by-wire technology": "Электронное рулевое управление (steer-by-wire)",
  // Electric Motor
  "Number of Drive Motors": "Количество моторов",
  "Motor Layout": "Расположение моторов",
  "Motor Type": "Тип мотора",
  "Total Motor Power (kW)": "Суммарная мощность (кВт)",
  "Total Motor Torque (N·m)": "Суммарный крутящий момент (Н·м)",
  "Total Electric Motor Horsepower (Ps)": "Суммарная мощность (л.с.)",
  "Front Motor Max Power (kW)": "Мощность переднего мотора (кВт)",
  "Front Motor Max Torque (N·m)": "Момент переднего мотора (Н·м)",
  "Rear Motor Max Power (kW)": "Мощность заднего мотора (кВт)",
  "Rear Motor Max Torque (N·m)": "Момент заднего мотора (Н·м)",
  "Front Motor Brand": "Производитель переднего мотора",
  "Rear Motor Brand": "Производитель заднего мотора",
  "Front Motor Model": "Модель переднего мотора",
  "Rear Motor Model": "Модель заднего мотора",
  "System Combined Power (kW)": "Совокупная мощность системы (кВт)",
  "System Combined Power (Ps)": "Совокупная мощность системы (л.с.)",
  "System Combined Torque (N·m)": "Совокупный момент системы (Н·м)",
  "Three-Electric System Warranty": "Гарантия на электросистему",
  "Battery/Motor/ECU Warranty Policy for First Owner": "Гарантия на батарею, мотор и электронику для первого владельца",
  // Engine
  "Engine model": "Модель двигателя",
  "Engine Layout": "Расположение двигателя",
  "Engine Special Technology": "Особые технологии двигателя",
  "Displacement (L)": "Рабочий объём (л)",
  "Displacement (mL)": "Рабочий объём (мл)",
  "Intake form": "Тип впуска",
  "Number of cylinders": "Количество цилиндров",
  "Cylinder arrangement": "Расположение цилиндров",
  "Valves per cylinder": "Клапанов на цилиндр",
  "Valvetrain": "Газораспределение",
  "Compression ratio": "Степень сжатия",
  "Bore (mm)": "Диаметр цилиндра (мм)",
  "Stroke (mm)": "Ход поршня (мм)",
  "Maximum horsepower (Ps)": "Макс. мощность (л.с.)",
  "Maximum Net Power (kW)": "Макс. полезная мощность (кВт)",
  "Max Power RPM": "Обороты макс. мощности",
  "Max Torque RPM": "Обороты макс. момента",
  "Cylinder Block Material": "Материал блока цилиндров",
  "Cylinder Head Material": "Материал головки блока",
  "Fuel Grade": "Марка топлива",
  "Fuel Supply System": "Система питания",
  // Transmission
  "Transmission Type": "Тип трансмиссии",
  "Number of Gears": "Количество передач",
  // Wheels & Brakes
  "Front Brake Type": "Передние тормоза",
  "Rear Brake Type": "Задние тормоза",
  "Parking Brake Type": "Стояночный тормоз",
  "Front Tire Specification": "Передние шины",
  "Rear Tire Specification": "Задние шины",
  "Spare Tire Specification": "Запасное колесо",
  "Spare Tire Placement": "Расположение запаски",
};

const VALUES = {
  // повсеместные короткие ответы
  "Supported": "Есть",
  "Not Supported": "Нет",
  "Standard": "Есть",
  "Optional": "Опция",
  "Yes": "Да",
  "No": "Нет",
  "None": "Нет",
  // энергия и приводы
  "Pure Electric": "Электро",
  "Plug-in Hybrid": "Подключаемый гибрид",
  "Range Extender": "Увеличитель запаса хода (EREV)",
  "Electric 4WD": "Электрический полный привод",
  "Dual Motor, All-Wheel Drives": "Два мотора, полный привод",
  "Front-Wheel Drive (FWD)": "Передний привод",
  "Rear-Wheel Drive (RWD)": "Задний привод",
  "All-Wheel Drive (AWD)": "Полный привод",
  "Front Engine, Front-Wheel Drive": "Передний двигатель, передний привод",
  "Front Engine, Rear-Wheel Drive": "Передний двигатель, задний привод",
  "Front Engine, All-Wheel Drive": "Передний двигатель, полный привод",
  "Rear Engine, Rear-Wheel Drive": "Задний мотор, задний привод",
  "Single Motor": "Один мотор",
  "Dual Motor": "Два мотора",
  "Dual Motors": "Два мотора",
  "Three Motors": "Три мотора",
  "Front-mounted": "Спереди",
  "Rear-mounted": "Сзади",
  "Front+Rear-mounted": "Спереди и сзади",
  // моторы
  "Permanent Magnet/Synchronous": "Синхронный на постоянных магнитах",
  "AC/Asynchronous": "Асинхронный",
  "Excitation/Synchronous": "Синхронный с электровозбуждением",
  "Front Induction/Asynchronous Rear Permanent Magnet/Synchronous": "Спереди асинхронный, сзади синхронный на постоянных магнитах",
  "Front AC/Asynchronous + Rear Permanent Magnet/Synchronous": "Спереди асинхронный, сзади синхронный на постоянных магнитах",
  "Front: Permanent magnet/Synchronous; Rear: AC/Asynchronous": "Спереди синхронный на постоянных магнитах, сзади асинхронный",
  // батареи
  "LFP Battery": "Литий-железо-фосфатная (LFP)",
  "Ternary Lithium Battery": "Тройная литиевая (NMC)",
  "Ternary Lithium + Lithium Iron Phosphate Battery": "NMC + LFP",
  "Blade Battery": "Blade (BYD)",
  "Qilin Battery": "Qilin (CATL)",
  "Aegis Battery": "Aegis",
  "Liquid cooling": "Жидкостное",
  "Air cooling": "Воздушное",
  "Direct Cooling": "Прямое (хладагентом)",
  "Rear left side": "Сзади слева",
  "Rear right side": "Сзади справа",
  "Front left side": "Спереди слева",
  "Front right side": "Спереди справа",
  "Front center": "Спереди по центру",
  "Tesla China": "Tesla (Китай)",
  "Using flame-retardant materials and thermal runaway protection technology": "Огнестойкие материалы и защита от теплового разгона",
  // кузов
  "Unibody": "Несущий кузов",
  "SUV": "SUV",
  "SUV Crossover": "Кроссовер (SUV)",
  "Sedan": "Седан",
  "Hatchback": "Хэтчбек",
  "Liftback": "Лифтбек",
  "MPV": "Минивэн",
  "Large MPV": "Большой минивэн",
  "Station Wagon": "Универсал",
  "Compact car": "Компактный",
  "Compact Car": "Компактный",
  "Mid-size car": "Среднеразмерный",
  "Mid-size / Full-size car": "Средне-полноразмерный",
  "Full-size car": "Полноразмерный",
  "Compact SUV": "Компактный SUV",
  "Mid-size SUV": "Среднеразмерный SUV",
  "Midsize-large SUV": "Средне-крупный SUV",
  "Full-size SUV": "Полноразмерный SUV",
  "Small SUV": "Малый SUV",
  "Small car": "Малый класс",
  "Minicar": "Микрокар",
  "Conventional Door": "Обычные двери",
  "Conventional Door+Sliding Door": "Обычные + сдвижные двери",
  "Sliding Door": "Сдвижные двери",
  "Scissor Door": "Двери-ножницы",
  "Gull-wing Door": "Двери «крыло чайки»",
  // подвеска и шасси
  "MacPherson strut independent suspension": "Независимая, McPherson",
  "MacPherson Independent Suspension": "Независимая, McPherson",
  "Double-ball-joint MacPherson independent suspension": "McPherson с двумя шаровыми опорами",
  "Multi-link independent suspension": "Многорычажная независимая",
  "Multi-Link Independent Suspension": "Многорычажная независимая",
  "Five-link independent suspension": "Пятирычажная независимая",
  "Four-link independent suspension": "Четырёхрычажная независимая",
  "Double wishbone independent suspension": "Двухрычажная независимая",
  "Double fork arm independent suspension": "Двухрычажная независимая",
  "Torsion beam non-independent suspension": "Полузависимая, торсионная балка",
  "Leaf spring non-independent suspension": "Зависимая, рессорная",
  "Electric power steering": "Электроусилитель",
  "Hydraulic power steering": "Гидроусилитель",
  "Electro-hydraulic power steering": "Электрогидроусилитель",
  // трансмиссия
  "Electric vehicle single-speed transmission": "Односкоростная (электромобиль)",
  "Fixed Gear Ratio Transmission": "С фиксированным передаточным числом",
  "Continuously Variable Transmission": "Вариатор (CVT)",
  "E-CVT Continuously Variable Transmission": "Вариатор E-CVT",
  "Electronic CVT (E-CVT)": "Электронный вариатор (E-CVT)",
  "Dedicated Hybrid Transmission (DHT)": "Гибридная трансмиссия (DHT)",
  // тормоза и колёса
  "Ventilated disc": "Вентилируемый диск",
  "Disc": "Дисковые",
  "Drum": "Барабанные",
  "Electronic parking brake": "Электронный",
  "Handbrake": "Ручной",
  "Foot brake": "Ножной",
  "Tire repair kit": "Ремкомплект",
  "Full-size": "Полноразмерное",
  "Non-full-size": "Докатка",
  "Aluminum Alloy": "Алюминиевый сплав",
  "Cast Iron": "Чугун",
  // двигатель
  "Turbocharged": "Турбонаддув",
  "Naturally Aspirated": "Атмосферный",
  "Direct Injection": "Непосредственный впрыск",
  "Multi-point Injection": "Распределённый впрыск",
  "Mixed Injection": "Комбинированный впрыск",
  "Transverse": "Поперечное",
  "Longitudinal": "Продольное",
  "L": "Рядное",
  "V": "V-образное",
  "H": "Оппозитное",
  "W": "W-образное",
  "China VI": "Китай VI",
  "China VIb": "Китай VIb",
  "China V": "Китай V",
  // гарантии без цифрового шаблона
  "Lifetime Warranty/Non-commercial Use (Exclusion clauses subject to official terms)": "Пожизненная, для некоммерческого использования (см. условия производителя)",
  "Lifetime warranty/Non-commercial use (Exclusion clauses subject to official terms)": "Пожизненная, для некоммерческого использования (см. условия производителя)",
  "Lifetime warranty/Non-commercial use (exclusions apply as per official terms)": "Пожизненная, для некоммерческого использования (см. условия производителя)",
  "Lifetime warranty (non-commercial use, exclusions apply as per official terms)": "Пожизненная, для некоммерческого использования (см. условия производителя)",
  "Lifetime Warranty/Non-Operational (Exclusion clauses subject to official terms)": "Пожизненная, для некоммерческого использования (см. условия производителя)",
  "Unlimited years/mileage for first owner (exclusion clauses subject to official terms)": "Без ограничения срока и пробега для первого владельца (см. условия производителя)",
  "10 years unlimited mileage for first owner (exclusion clauses subject to official terms)": "10 лет без ограничения пробега для первого владельца (см. условия производителя)",
  "10 years unlimited mileage (exclusions apply as per official terms)": "10 лет без ограничения пробега (см. условия производителя)",
};

const MONTHS = {
  January: "январь", February: "февраль", March: "март", April: "апрель",
  May: "май", June: "июнь", July: "июль", August: "август",
  September: "сентябрь", October: "октябрь", November: "ноябрь", December: "декабрь",
};

const WORD_NUMBERS = { Two: 2, Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8, Ten: 10 };

const yearsWord = (years) => {
  if (years % 10 === 1 && years % 100 !== 11) return "год";
  if ([2, 3, 4].includes(years % 10) && ![12, 13, 14].includes(years % 100)) return "года";
  return "лет";
};

// Числовой шаблон гарантии: "8 years or 160,000 km", "Six years or 150,000 kilometers".
const WARRANTY = /^(\d+|Two|Three|Four|Five|Six|Seven|Eight|Ten)[- ]years? or ([\d,]+)\s*(?:km|kilometers)$/i;
// Ступенчатые коробки: "6-speed wet dual-clutch", "8-speed automatic with manual shift mode", "3-gear DHT".
const GEARBOX_TAILS = {
  "wet dual-clutch": "робот с мокрыми сцеплениями",
  "dry dual-clutch": "робот с сухими сцеплениями",
  "dual-clutch": "робот (DCT)",
  "automatic with manual shift mode": "АКПП с ручным режимом",
  "automatic": "АКПП",
  "manual": "МКПП",
  "DHT": "DHT",
};

export function translateSpecGroup(name) {
  return GROUPS[name] || name;
}

export function translateSpecName(name) {
  return NAMES[name] || name;
}

export function translateSpecValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return text;
  if (VALUES[text]) return VALUES[text];

  const warranty = text.match(WARRANTY);
  if (warranty) {
    const years = Number(warranty[1]) || WORD_NUMBERS[warranty[1][0].toUpperCase() + warranty[1].slice(1).toLowerCase()];
    if (years) return `${years} ${yearsWord(years)} или ${warranty[2].replace(/,/g, " ")} км`;
  }

  const gearbox = text.match(/^(\d+)-(?:speed|gear) (.+)$/i);
  if (gearbox && GEARBOX_TAILS[gearbox[2]]) return `${gearbox[1]}-ступ. ${GEARBOX_TAILS[gearbox[2]]}`;

  const octane = text.match(/^(\d+)\s*Octane$/i);
  if (octane) return `АИ-${octane[1]}`;

  const month = text.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/);
  if (month) return `${MONTHS[month[1]][0].toUpperCase()}${MONTHS[month[1]].slice(1)} ${month[2]}`;

  const price = text.match(/^(?:￥|¥)?\s*([\d][\d,]*)(?:\s*(?:CNY|yuan|RMB))?$/i);
  if (price && /CNY|yuan|RMB|￥|¥/.test(text)) return `${price[1].replace(/,/g, " ")} ¥`;

  // Описания ДВС и рендж-экстендеров: "1.5T 139HP L4", "Range Extender 160 Horsepower".
  if (/\d\s*(?:HP|Horsepower)\b/i.test(text)) {
    return text
      .replace(/^Range Extender|^Extended Range/i, "Увеличитель хода")
      .replace(/(\d+)\s*(?:HP|Horsepower)/gi, "$1 л.с.")
      .replace(/\bL(\d)\b/, "R$1");
  }
  return text;
}

export function translateTechnicalSpecs(technicalSpecs) {
  const groups = technicalSpecs?.groups || [];
  return groups
    .map((group) => ({
      name: translateSpecGroup(group.name),
      items: (group.items || []).map((item) => ({
        name: translateSpecName(item.name),
        value: translateSpecValue(item.value),
      })),
    }))
    .filter((group) => group.items.length);
}
