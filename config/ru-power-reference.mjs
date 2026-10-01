// Values are estimates for Russian quotations, never certificates for a particular VIN.
// Each match is constrained by the powertrain/variant, not just the model name.
export const RU_POWER_REFERENCE_VERSION='2026-10-01-v1';
export const RU_POWER_SOURCES={
 bydHybrid:{url:'https://www.byd.com/material/domestic-official/user-manual/dynasty/宋Pro%20DM-i智驾版1112.pdf',basis:'manufacturer-nominal',note:'Song Pro DM-i manual, p.365: TZ210XYB nominal 55 kW, peak 120 kW. Analogue estimate, not certified 30-minute power.'},
 bydEv:{url:"https://www.bydauto.co.nz/storage/uploads/c6cdc150-d114-4d0b-8be0-d0374df5edfb/ATTO-3-Owner%27s-Manual-RHD-Chinese_NZ_08_2022.pdf",basis:'manufacturer-nominal',note:'ATTO 3 manual, p.254: TZ200XSQ nominal 65 kW. Analogue estimate.'},
 tesla:{url:'https://www.tesla.com/de_at/support/maximum-30-minute-power-values',basis:'manufacturer-30-minute',note:'Manufacturer European variant reference; Russian imported VIN remains unconfirmed.'},
 broker:{url:'https://whitebrokerdv.ru/articles/elektromobili-pod-lgotnyj-utilizacionnyj-sbor-2026',basis:'broker-reference',note:'Published importer variant data, not independently verified certificates.'},
};
const tesla=(model,years,variant,drive,kw)=>({id:`tesla-${model.replace(' ','-')}-${years[0]}-${variant}-${drive}`,brand:'Tesla',models:[model],kind:'electric',years,variant,drive,kw,source:'tesla'});
const ev=(id,brand,models,years,peak,battery,kw)=>({id,brand,models,kind:'electric',years,drive:'front',peak,battery,kw,source:'broker'});
export const RU_POWER_REFERENCE=[
 {id:'byd-tz210xyb-120',brand:'BYD',kind:'parallel',years:[2021,2026],motorCode:'TZ210XYB',motorCount:1,drive:'front',peak:120,kw:55,source:'bydHybrid'},
 {id:'byd-tz200xsq-150',brand:'BYD',kind:'electric',years:[2022,2026],motorCode:'TZ200XSQ',motorCount:1,drive:'front',peak:150,kw:65,source:'bydEv'},
 tesla('Model 3',[2017,2023],'standard','rear',88),
 tesla('Model 3',[2017,2023],'long-range','all',153),
 tesla('Model 3',[2018,2023],'performance','all',155),
 tesla('Model 3',[2024,2026],'standard','rear',88),
 tesla('Model 3',[2024,2026],'long-range','rear',90),
 tesla('Model 3',[2024,2026],'long-range','all',153),
 tesla('Model 3',[2024,2026],'performance','all',190),
 tesla('Model Y',[2020,2024],'standard','rear',114),
 tesla('Model Y',[2020,2024],'long-range','rear',120),
 tesla('Model Y',[2020,2024],'long-range','all',179),
 tesla('Model Y',[2020,2024],'performance','all',155),
 tesla('Model Y',[2025,2026],'standard','rear',[110,114]),
 tesla('Model Y',[2025,2026],'long-range','rear',114),
 tesla('Model Y',[2025,2026],'long-range','all',165),
 tesla('Model Y',[2025,2026],'performance','all',190),
 ev('qin-plus-ev-47','BYD',['Qin Plus','Qin Plus EV'],[2021,2026],100,47.5,35.3),
 ev('qin-plus-ev-57','BYD',['Qin Plus','Qin Plus EV'],[2023,2025],100,57.6,35.3),
 ev('dolphin-44','BYD',['Dolphin'],[2021,2025],70,44.9,34.57),
 ev('dolphin-45','BYD',['Dolphin'],[2025,2026],70,45.12,35.3),
 ev('seagull-30','BYD',['Seagull'],[2023,2024],55,30.08,25.01),
 ev('seagull-39','BYD',['Seagull'],[2023,2026],55,38.88,25.01),
 {...ev('ioniq5-58','Hyundai',['IONIQ 5'],[2021,2024],125,58,56),drive:'rear'},
 {...ev('ioniq5-77','Hyundai',['IONIQ 5'],[2021,2024],168,77.4,55.9),drive:'rear'},
 ev('e2-43','BYD',['E2'],[2024,2026],70,43.2,34.57),
 ev('niro-64','Kia',['Niro','Niro EV'],[2019,2022],150,64,28.68),
 ev('niro-65','Kia',['Niro','Niro EV'],[2022,2026],150,64.8,36.77),
 ev('kona-64','Hyundai',['Kona','Kona Electric'],[2020,2023],150,64,27.95),
];
