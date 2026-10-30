// ISO 3166-1 codes; XK is retained for Kosovo. Names come from the browser's
// Russian region directory. Flag assets: flag-icons 7.5.0 (MIT).
export const VISIT_COUNTRY_CODES = new Set(
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK".split(" "),
);

// Europe (including its small states and territories), former USSR, USA/Canada.
export const VISIT_FLAG_COUNTRIES = new Set(
  "AD AL AM AT AX AZ BA BE BG BY CA CH CY CZ DE DK EE ES FI FO FR GB GE GG GI GR HR HU IE IM IS IT JE KG KZ LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM TJ TM TR UA US UZ VA XK".split(" "),
);

const regionNames = new Intl.DisplayNames(["ru"], { type:"region" });
const countryNames = { BY:"Беларусь", RU:"Россия", US:"США", GB:"Великобритания", MD:"Молдова" };

export function normalizeVisitCountry(value) {
  const code = String(value || "").trim().toUpperCase();
  if (code === "OTHER") return "other";
  return VISIT_COUNTRY_CODES.has(code) ? code : "";
}

export function visitCountryPresentation(value) {
  const code = normalizeVisitCountry(value);
  const label = !code ? "Страна не записана" : code === "other" ? "Другая страна"
    : countryNames[code] || regionNames.of(code) || code;
  const flag = VISIT_FLAG_COUNTRIES.has(code) ? `/flags/analytics/${code.toLowerCase()}.svg` : "";
  return { code, label, flag };
}
