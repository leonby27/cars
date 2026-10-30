// Скриптовые dispatchEvent и scrollTo не подтверждают действие человека.
// Колесо, клавиша и касание подтверждают прокрутку раньше события scroll;
// click нужен в том числе для активации через вспомогательные технологии.
export const HUMAN_SIGNALS = ["pointermove", "pointerdown", "touchstart", "keydown", "wheel", "scroll", "click"];
export const isHumanInteraction = (event, visibility = "visible") => event?.isTrusted === true
  && visibility !== "hidden" && event.type !== "scroll" && HUMAN_SIGNALS.includes(event.type);
