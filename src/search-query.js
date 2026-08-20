// Числовая грамматика строки поиска: цена, пробег и годы, написанные словами —
// «от 25000 до 40000», «пробег до 50 тыс км», «2021-2023», «дешевле 30к», «$30000».
// Числа с такими признаками вынимаются из запроса, остаток (rest) уходит на разбор
// марки и модели. Модуль без React и сети, чтобы грамматика целиком проверялась тестами.
import { PRICING } from "./pricing.js";

const CNY_USD = PRICING.cnyBynPer10 / 10 / PRICING.usdByn;

// Суммы приводятся к долларам «под ключ» — в них хранится и фильтруется цена
// каталога. Валюта без явного знака — та, что выбрана переключателем на сайте,
// её передают параметром currency.
const toUsd = (amount, currency) =>
  currency === "BYN" ? amount / PRICING.usdByn : currency === "CNY" ? amount * CNY_USD : currency === "EUR" ? amount * (PRICING.eurByn / PRICING.usdByn) : amount;

// Годом считается только правдоподобный: «2050» и «1234» — суммы, а не годы.
const isYearLike = (digits) => /^(19|20)\d{2}$/.test(digits) && Number(digits) >= 1990 && Number(digits) <= 2030;

const multiplierOf = (word) => (word === "к" || word === "k" || word.startsWith("тыс") || word.startsWith("тыщ") ? 1000 : word === "млн" || word.startsWith("миллион") ? 1000000 : 0);
const currencyOf = (word) =>
  word === "$" || word === "usd" || word === "дол" || word === "уе" || word.startsWith("долл") || word.startsWith("бакс")
    ? "USD"
    : word.startsWith("руб") || word === "р" || word === "byn" || word === "br" || word === "rub" || word === "бр" || word === "бел" || word.startsWith("белорус")
      ? "BYN"
      : word.startsWith("юан") || word === "cny" || word === "rmb"
        ? "CNY"
        : word === "евро" || word === "eur"
          ? "EUR"
          : "";
const isKmWord = (word) => word === "км" || word === "km" || word.startsWith("километр");
const isYearWord = (word) => word === "г" || word === "гг" || word.startsWith("год");
// Слова-границы. «С» и «по» — слабые: они часты в обычной речи, поэтому
// применяются только к похожим на сумму или год числам (см. ниже).
const boundOf = (word) =>
  word === "от" || word === "с" || word === "после" || word === "дороже" || word === "более" || word === "выше" || word === "минимум" || word === "мин"
    ? "min"
    : word === "до" || word === "по" || word === "дешевле" || word === "менее" || word === "ниже" || word === "максимум" || word === "макс" || word.startsWith("предел")
      ? "max"
      : "";
const isWeakBoundWord = (word) => word === "с" || word === "по";
// «Не дороже», «не более», «не выше» и им подобные разворачиваются в противоположную границу.
const isInvertibleBoundWord = (word) => word === "дороже" || word === "дешевле" || word === "более" || word === "менее" || word === "выше" || word === "ниже";
// «Новее 2022» и «старше 2020» — границы именно по году выпуска.
const yearBoundOf = (word) => (word === "новее" || word === "свежее" || word === "моложе" ? "min" : word === "старше" || word === "старее" ? "max" : "");
// «Около 30000» — не граница, а окрестность: диапазон ±15% от названного.
const isNearWord = (word) => word === "около" || word === "примерно" || word === "порядка" || word === "приблизительно";
// «Пробег», «цена» и «год» перед числами говорят, к чему относится диапазон.
const domainHintOf = (word) => (word.startsWith("пробег") ? "mileage" : word.startsWith("цен") || word.startsWith("стои") || word === "бюджет" ? "price" : word.startsWith("год") ? "year" : "");
// Слова, которые ничего не уточняют и только мешают искать марку:
// «машина до 30000», «в рублях», «за 30к».
const isNoiseWord = (word) => word === "бу" || word === "в" || word === "за" || word.startsWith("автомобил") || word.startsWith("машин") || word.startsWith("тачк");

const prepare = (query) =>
  String(query ?? "")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    // Десятичная запятая — часть числа («1,5 млн»), остальные запятые перечисляют модели.
    .replace(/(\d),(\d)/g, "$1.$2")
    // «Б/у» — просто слово-паразит, а не перечисление «б или у».
    .replace(/(^|[^0-9a-zа-я])б\/у([^0-9a-zа-я]|$)/g, "$1 $2")
    .replace(/[,/]/g, " или ")
    .replace(/~/g, " примерно ")
    .replace(/€/g, " евро ")
    .replace(/¥/g, " юаней ")
    .replace(/[–—−]/g, "-")
    // Порядковые окончания года: «2022-го», «2021-м».
    .replace(/(\d)-(го|й|м|х|е)(?![0-9a-zа-я])/g, "$1")
    // Диапазон через дефис отделяется от чисел; дефис внутри слов не трогаем.
    .replace(/(\d)\s*-\s*(?=[\d$])/g, "$1 - ")
    .replace(/[^0-9a-zа-я$.\- ]+/g, " ")
    // Точка живёт только внутри числа; в остальных местах это разделитель.
    .replace(/(?<!\d)\./g, " ")
    .replace(/\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseToken = (raw) => {
  if (raw === "-") return { type: "dash", raw };
  const match = raw.match(/^(\$?)(\d+(?:\.\d+)?)([a-zа-я$]*)$/);
  if (!match) return { type: "word", raw };
  const [, dollar, digits, tail] = match;
  const token = { type: "num", raw, digits, mult: 0, currency: dollar || tail.includes("$") ? "USD" : "", km: false, yearWord: false };
  const suffix = tail.replace(/\$/g, "");
  if (suffix) {
    if (multiplierOf(suffix)) token.mult = multiplierOf(suffix);
    else if (currencyOf(suffix)) token.currency = currencyOf(suffix);
    else if (isKmWord(suffix)) token.km = true;
    else if (isYearWord(suffix)) token.yearWord = true;
    // Цифры с непонятным хвостом («5i») — часть названия модели, не сумма.
    else return { type: "word", raw };
  }
  return token;
};

// «50 000» и «1 000 000» — одно число, набранное с разрядными пробелами.
// Год с соседним числом («2022 001») и номера моделей с нулём впереди
// («001 007» — две модели, а не 1007) не склеиваются.
const mergeDigitGroups = (tokens) => {
  const merged = [];
  for (const token of tokens) {
    const prev = merged[merged.length - 1];
    if (
      token.type === "num" &&
      prev?.type === "num" &&
      /^\d{3}$/.test(token.digits) &&
      !prev.mult && !prev.currency && !prev.km && !prev.yearWord &&
      !prev.digits.startsWith("0") &&
      !prev.digits.includes(".") &&
      !isYearLike(prev.digits)
    ) {
      prev.digits += token.digits;
      prev.raw = `${prev.raw} ${token.raw}`;
      prev.mult = token.mult;
      prev.currency = prev.currency || token.currency;
      prev.km = token.km;
      prev.yearWord = token.yearWord;
    } else merged.push(token);
  }
  return merged;
};

export function parseQueryRanges(query, { currency = "USD" } = {}) {
  const tokens = mergeDigitGroups(prepare(query).split(" ").filter(Boolean).map(parseToken));
  const constructs = [];
  const rest = [];
  let pendingBound = "";
  let pendingWeak = false;
  let pendingNegate = false;
  let pendingCurrency = "";
  let domainHint = "";

  // Единицы следом за числом: «30 тыс», «50 000 км», «30000 $», «2022 года».
  // Повторные слова той же категории («бел руб», «белорусских рублей») тоже
  // съедаются, иначе хвост попадал бы в текст и мешал искать марку.
  const absorbUnits = (target, index) => {
    while (index + 1 < tokens.length && tokens[index + 1].type === "word") {
      const word = tokens[index + 1].raw;
      if (multiplierOf(word)) { if (!target.mult) target.mult = multiplierOf(word); }
      else if (currencyOf(word)) { if (!target.currency) target.currency = currencyOf(word); }
      else if (isKmWord(word)) target.km = true;
      // «20к пробега»: слово «пробег» после числа — та же метка, что и «км».
      // Но после года («2023 пробег до 50 тыс») это начало новой фразы.
      else if (word.startsWith("пробег")) {
        if (isYearLike(target.digits) && !target.mult && !target.currency && !target.km) break;
        target.km = true;
      }
      else if (isYearWord(word)) target.yearWord = true;
      else break;
      index += 1;
    }
    return index;
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "dash") continue;
    if (token.type === "word") {
      const word = token.raw;
      if (word === "не") { pendingNegate = true; continue; }
      if (isNearWord(word)) {
        pendingBound = "near";
        pendingWeak = false;
        pendingNegate = false;
        continue;
      }
      const yearBound = yearBoundOf(word);
      if (yearBound) {
        pendingBound = pendingNegate ? (yearBound === "min" ? "max" : "min") : yearBound;
        pendingWeak = false;
        pendingNegate = false;
        domainHint = "year";
        continue;
      }
      const bound = boundOf(word);
      if (bound) {
        // «Не дороже 40 тыс» и «не более» — то же, что «до 40 тыс».
        pendingBound = pendingNegate && isInvertibleBoundWord(word) ? (bound === "min" ? "max" : "min") : bound;
        pendingWeak = isWeakBoundWord(word);
        pendingNegate = false;
        continue;
      }
      pendingNegate = false;
      const hint = domainHintOf(word);
      if (hint) {
        // «С пробегом 50000», «по цене 30000»: здесь «с»/«по» — предлог
        // существительного, а не нижняя граница.
        if (pendingWeak) {
          pendingBound = "";
          pendingWeak = false;
        }
        domainHint = hint;
        continue;
      }
      // Валюта, названная до числа («$30000», «в рублях до 25000»), относится
      // к ближайшей следующей сумме.
      const wordCurrency = currencyOf(word);
      if (wordCurrency) { pendingCurrency = wordCurrency; continue; }
      if (isNoiseWord(word)) continue;
      rest.push(word);
      continue;
    }

    // Шесть и более цифр без признаков суммы — номер объявления, он остаётся
    // запросу. Признаком считается и единица следом («150000 км»), и дефис
    // диапазона («100000-150000»).
    const next = tokens[index + 1];
    const nextIsUnit = next?.type === "word" && Boolean(multiplierOf(next.raw) || currencyOf(next.raw) || isKmWord(next.raw) || isYearWord(next.raw));
    const anyMark = pendingBound || domainHint || token.mult || token.currency || pendingCurrency || token.km;
    if (!anyMark && !nextIsUnit && next?.type !== "dash" && token.digits.split(".")[0].length >= 6) { rest.push(token.raw); continue; }
    // Ноль впереди — номер модели («001»), суммы так не пишут («0.5 млн» — пишут).
    if (token.digits.startsWith("0") && !token.digits.includes(".") && !token.mult && !token.currency && !token.km) {
      rest.push(token.raw);
      pendingBound = "";
      pendingWeak = false;
      pendingCurrency = "";
      continue;
    }
    // Небольшое число — скорее часть названия («530», «7»). Границей его делает
    // только сильный признак («от», «пробег», валюта, множитель), единица следом
    // («20 к пробега») или дефис диапазона («20-40 тыс»); слабых «с»/«по» недостаточно.
    const strongMark = (pendingBound && !pendingWeak) || domainHint || token.mult || token.currency || pendingCurrency || token.km;
    const small = !token.yearWord && !isYearLike(token.digits) && Number(token.digits) < 1000;
    if (small && !strongMark && !nextIsUnit && tokens[index + 1]?.type !== "dash") {
      rest.push(token.raw);
      pendingBound = "";
      pendingWeak = false;
      pendingCurrency = "";
      continue;
    }

    // Валюта «на подходе» («в рублях …») не приклеивается к голому году:
    // «в рублях 2022» — это всё ещё год, а не сумма.
    const construct = { bound: pendingBound, digits: token.digits, mult: token.mult, currency: token.currency || (isYearLike(token.digits) && !token.mult ? "" : pendingCurrency), km: token.km, yearWord: token.yearWord, hint: domainHint };
    pendingBound = "";
    pendingWeak = false;
    pendingCurrency = "";
    pendingNegate = false;
    index = absorbUnits(construct, index);

    // «25000-40000» и «2021-2023»: пара границ одного диапазона.
    if (tokens[index + 1]?.type === "dash" && tokens[index + 2]?.type === "num") {
      const second = tokens[index + 2];
      const partner = { bound: "max", digits: second.digits, mult: second.mult, currency: second.currency, km: second.km, yearWord: second.yearWord, hint: domainHint };
      index = absorbUnits(partner, index + 2);
      construct.bound = construct.bound && construct.bound !== "near" ? construct.bound : "min";
      constructs.push(construct, partner);
      domainHint = "";
      continue;
    }
    constructs.push(construct);
    // Подсказка «пробег»/«цена» живёт до конца диапазона: после «от» она ждёт вторую границу.
    if (construct.bound !== "min") domainHint = "";
  }

  // «От 20 до 40 тысяч», «в рублях от 20 до 40 тыс»: множитель, валюта и «км»,
  // названные у одной границы, относятся к обеим. Год они не переозначивают:
  // «от 2020 до 45000» — это «год от» плюс «цена до».
  const willBeYear = (item) => item.yearWord || item.hint === "year" || (!item.mult && !item.currency && !item.km && !item.hint && isYearLike(item.digits));
  for (let i = 0; i + 1 < constructs.length; i += 1) {
    const a = constructs[i];
    const b = constructs[i + 1];
    if (a.bound !== "min" || b.bound !== "max") continue;
    if (!willBeYear(a) && !willBeYear(b)) {
      if (!a.mult) a.mult = b.mult;
      if (!b.mult) b.mult = a.mult;
      if (!a.currency) a.currency = b.currency;
      if (!b.currency) b.currency = a.currency;
      a.km = a.km || b.km;
      b.km = a.km;
    }
    if (a.hint && !b.hint) b.hint = a.hint;
    if (b.hint && !a.hint) a.hint = b.hint;
  }

  const classify = (item) =>
    item.km
      ? "mileage"
      : item.currency
        ? "price"
        : item.hint
          ? item.hint
          : item.yearWord || (!item.mult && isYearLike(item.digits))
            ? "year"
            : "price";

  const result = { rest: rest.join(" "), yearFrom: "", yearTo: "", priceMinUsd: null, priceMaxUsd: null, mileageMin: null, mileageMax: null, hasRanges: false };
  const bareYears = [];
  for (const construct of constructs) {
    const domain = classify(construct);
    if (domain === "year") {
      if (!isYearLike(construct.digits)) continue;
      if (construct.bound === "min") result.yearFrom = construct.digits;
      else if (construct.bound === "max") result.yearTo = construct.digits;
      else bareYears.push(construct.digits);
      continue;
    }
    let value = Number(construct.digits) * (construct.mult || 1);
    if (!value) continue;
    if (domain === "mileage") {
      // Пробег без «от»/«до» читается как потолок: «50 000 км» — до пятидесяти тысяч.
      if (construct.bound === "near") {
        result.mileageMin = Math.round(value * 0.85);
        result.mileageMax = Math.round(value * 1.15);
      } else if (construct.bound === "min") result.mileageMin = Math.round(value);
      else result.mileageMax = Math.round(value);
      continue;
    }
    // «До 30» — это 30 тысяч: сумм меньше тысячи в каталоге не бывает.
    if (value < 1000 && !construct.mult) value *= 1000;
    const usd = Math.round(toUsd(value, construct.currency || currency));
    // «Около 30000» — окрестность в ±15%; сумма без «от»/«до» — бюджет, то есть потолок.
    if (construct.bound === "near") {
      result.priceMinUsd = Math.round(usd * 0.85);
      result.priceMaxUsd = Math.round(usd * 1.15);
    } else if (construct.bound === "min") result.priceMinUsd = usd;
    else result.priceMaxUsd = usd;
  }
  // Годы, перечисленные без «от»/«до» («2021 2023»), очерчивают диапазон;
  // одиночный год ищется точно, как и раньше.
  if (bareYears.length) {
    bareYears.sort();
    if (!result.yearFrom) result.yearFrom = bareYears[0];
    if (!result.yearTo) result.yearTo = bareYears[bareYears.length - 1];
  }
  if (result.yearFrom && result.yearTo && Number(result.yearFrom) > Number(result.yearTo)) [result.yearFrom, result.yearTo] = [result.yearTo, result.yearFrom];
  if (result.priceMinUsd != null && result.priceMaxUsd != null && result.priceMinUsd > result.priceMaxUsd) [result.priceMinUsd, result.priceMaxUsd] = [result.priceMaxUsd, result.priceMinUsd];
  if (result.mileageMin != null && result.mileageMax != null && result.mileageMin > result.mileageMax) [result.mileageMin, result.mileageMax] = [result.mileageMax, result.mileageMin];
  result.hasRanges = Boolean(result.yearFrom || result.yearTo || result.priceMinUsd != null || result.priceMaxUsd != null || result.mileageMin != null || result.mileageMax != null);
  return result;
}

const formatKm = (value) => String(value).replace(/\B(?=(\d{3})+$)/g, " ");

// Подпись фильтра пробега. Для «до …» она совпадает со ступеньками каталога,
// поэтому свободное значение из поиска ложится в тот же выпадающий список.
export const mileageLabel = (min, max) =>
  min && max ? `от ${formatKm(min)} до ${formatKm(max)} км` : min ? `от ${formatKm(min)} км` : max ? `до ${formatKm(max)} км` : "";

// Обратный разбор подписи в границы; понимает и старые ступеньки, и свободные
// значения. Не подпись пробега — null: вызывающий код сам решает, что делать.
export const mileageBounds = (label) => {
  const text = String(label ?? "").replace(/ /g, " ").trim();
  const asNumber = (part) => Number(part.replace(/ /g, ""));
  let match = text.match(/^от (\d[\d ]*?) до (\d[\d ]*?) км$/);
  if (match) return { min: asNumber(match[1]), max: asNumber(match[2]) };
  match = text.match(/^от (\d[\d ]*?) км$/);
  if (match) return { min: asNumber(match[1]), max: null };
  match = text.match(/^до (\d[\d ]*?) км$/);
  if (match) return { min: null, max: asNumber(match[1]) };
  return null;
};
