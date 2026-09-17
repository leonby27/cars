// Переход по ссылке с якорем на страницу, которую рисует приложение: к моменту, когда
// нужный блок появляется, страница ещё не устаканилась — выше него догружаются картинки,
// отчёт об осмотре и отзывы. Один прыжок к якорю попадал в пустоту: содержимое сверху
// подрастало и уводило блок вниз, человек оказывался выше нужного места.
//
// Поэтому якорь не «прыжок», а удержание: возвращаемся к нему несколько раз, пока
// страница достраивается, и сразу отпускаем, как только человек тронул прокрутку сам —
// иначе страница дёргала бы его обратно.
const RETRY_DELAYS = [60, 200, 500, 1000, 1700];
const RELEASE_EVENTS = ["wheel", "touchmove", "keydown", "mousedown"];

export function holdAnchor(target, view = typeof window === "undefined" ? null : window) {
  if (!target || !view) return () => {};
  let released = false;
  const align = () => {
    if (!released) target.scrollIntoView();
  };
  const release = () => { released = true; };
  align();
  const timers = RETRY_DELAYS.map((delay) => view.setTimeout(align, delay));
  for (const event of RELEASE_EVENTS) view.addEventListener(event, release, { passive:true });
  view.addEventListener("load", align);
  return () => {
    released = true;
    for (const timer of timers) view.clearTimeout(timer);
    for (const event of RELEASE_EVENTS) view.removeEventListener(event, release);
    view.removeEventListener("load", align);
  };
}
