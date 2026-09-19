// Заметки прямо на странице — только для локальной разработки.
//
// Зачем. Правки по внешнему виду обсуждаются скриншотами: Сергей рисует стрелку и
// пишет, что не так. Это работает, но каждый раз требует скриншота. Здесь то же самое
// делается на самой странице: включил режим, ткнул в элемент, написал заметку — она
// уехала в файл, который я читаю.
//
// Чего здесь нет и не будет. Ничего из этого не попадает на сайт: файл подключается
// только в режиме разработки (`import.meta.env.DEV`), а серверная половина отвечает
// только когда сервер запущен не в проде (см. server/dev-notes.mjs). На боевой сборке
// этого кода нет вовсе — vite выбрасывает ветку целиком.
//
// Как устроено. Кнопка в углу включает режим. В режиме любое нажатие перехватывается:
// подсвечивается элемент под курсором, по клику открывается поле для текста. Вместе с
// текстом сохраняем то, что помогает мне найти место в коде: путь страницы,选择ор
// элемента, его классы и видимый текст, размер окна и светлая тема или тёмная.

const STORAGE_KEY = "abcars-dev-notes-on";

/** Короткий и читаемый путь до элемента: тег, класс, порядковый номер среди своих. */
function describe(element) {
  const parts = [];
  let node = element;
  for (let depth = 0; node && node.nodeType === 1 && depth < 4; depth += 1) {
    const tag = node.tagName.toLowerCase();
    const className = typeof node.className === "string" ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    parts.unshift(className.length ? `${tag}.${className.join(".")}` : tag);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

function styles() {
  const style = document.createElement("style");
  style.textContent = `
    .dev-notes-toggle {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
      padding: 10px 14px; border: 0; border-radius: 999px;
      background: #d64533; color: #fff; font: 600 14px/1 system-ui, sans-serif;
      box-shadow: 0 6px 20px rgb(0 0 0 / 35%); cursor: pointer;
    }
    .dev-notes-toggle[data-on="true"] { background: #1b8551; }
    .dev-notes-hover { outline: 2px solid #d64533 !important; outline-offset: 1px; }
    .dev-notes-form {
      position: fixed; z-index: 2147483001; width: 320px; padding: 12px;
      border-radius: 12px; background: #1d2026; color: #f3f4f6;
      box-shadow: 0 10px 40px rgb(0 0 0 / 45%); font: 14px/1.4 system-ui, sans-serif;
    }
    .dev-notes-form textarea {
      width: 100%; min-height: 76px; margin: 0 0 8px; padding: 8px;
      border: 0; border-radius: 8px; background: #2b3038; color: inherit;
      font: inherit; resize: vertical;
    }
    .dev-notes-form div { display: flex; gap: 8px; justify-content: flex-end; }
    .dev-notes-form button {
      padding: 7px 12px; border: 0; border-radius: 8px;
      font: 600 13px/1 system-ui, sans-serif; cursor: pointer;
    }
    .dev-notes-form button.save { background: #1b8551; color: #fff; }
    .dev-notes-form button.cancel { background: #3a4049; color: #f3f4f6; }
    .dev-notes-what { margin: 0 0 8px; color: #aeb4bd; font-size: 12px; word-break: break-all; }
  `;
  document.head.appendChild(style);
}

export function startDevNotes() {
  if (window.__devNotes) return;
  window.__devNotes = true;
  styles();

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "dev-notes-toggle";
  document.body.appendChild(toggle);

  let on = sessionStorage.getItem(STORAGE_KEY) === "1";
  let hovered = null;
  let form = null;

  const paint = () => {
    toggle.dataset.on = String(on);
    toggle.textContent = on ? "Заметки включены" : "Заметки";
    if (!on) clearHover();
  };
  const clearHover = () => {
    hovered?.classList.remove("dev-notes-hover");
    hovered = null;
  };
  const closeForm = () => {
    form?.remove();
    form = null;
  };

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    on = !on;
    sessionStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    closeForm();
    paint();
  });

  document.addEventListener("mousemove", (event) => {
    if (!on || form) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest(".dev-notes-toggle, .dev-notes-form")) return;
    if (target === hovered) return;
    clearHover();
    hovered = target;
    hovered.classList.add("dev-notes-hover");
  });

  document.addEventListener("click", (event) => {
    if (!on) return;
    const target = event.target;
    if (target instanceof Element && target.closest(".dev-notes-toggle, .dev-notes-form")) return;
    // Нажатие в режиме заметок ничего на странице не делает: иначе клик по строке
    // таблицы её раскрывал бы, а по ссылке — уводил со страницы.
    event.preventDefault();
    event.stopPropagation();
    closeForm();
    const element = target instanceof Element ? target : document.body;
    const box = element.getBoundingClientRect();
    form = document.createElement("div");
    form.className = "dev-notes-form";
    form.style.left = `${Math.min(window.innerWidth - 340, Math.max(12, event.clientX - 160))}px`;
    form.style.top = `${Math.min(window.innerHeight - 190, event.clientY + 12)}px`;
    form.innerHTML = `
      <p class="dev-notes-what"></p>
      <textarea placeholder="Что не так с этим местом?"></textarea>
      <div><button type="button" class="cancel">Отмена</button><button type="button" class="save">Сохранить</button></div>
    `;
    form.querySelector(".dev-notes-what").textContent = describe(element);
    document.body.appendChild(form);
    const field = form.querySelector("textarea");
    field.focus();
    form.querySelector(".cancel").addEventListener("click", closeForm);
    form.querySelector(".save").addEventListener("click", async () => {
      const text = field.value.trim();
      if (!text) return closeForm();
      const note = {
        text,
        path: window.location.pathname + window.location.search,
        element: describe(element),
        elementText: (element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 120),
        box: { x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) },
        viewport: `${window.innerWidth}×${window.innerHeight}`,
        theme: document.documentElement.dataset.theme || "auto",
        at: new Date().toISOString(),
      };
      closeForm();
      clearHover();
      try {
        await fetch("/api/dev/notes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(note),
        });
      } catch {
        // Сервер не запущен — заметка не потеряется: показываем её в консоли,
        // оттуда её можно скопировать руками.
        console.warn("[заметки] не сохранилось, вот текст:", note);
      }
    });
    // Enter сохраняет, Esc закрывает: писать заметки быстрее, чем целиться мышью.
    field.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Escape") closeForm();
      if (keyEvent.key === "Enter" && (keyEvent.metaKey || keyEvent.ctrlKey)) form.querySelector(".save").click();
    });
  }, true);

  paint();
}
