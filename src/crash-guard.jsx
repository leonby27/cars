import React from "react";

// Последний рубеж: ошибка при отрисовке любой части приложения без этого
// снимала со страницы всё дерево, и посетитель видел пустой тёмный экран.
// Почти всегда такой сбой — переход внутри сайта, а по прямой загрузке страница
// открывается (сервер встраивает данные), поэтому первым делом страница сама
// перезагружается. Если сбой повторился в течение минуты — показываем сообщение
// с кнопкой, а не перезагружаем по кругу.
const reloadKey = "abcars-crash-reload";
const reloadWindowMs = 60_000;

function reloadedRecently() {
  try {
    return Date.now() - Number(window.sessionStorage.getItem(reloadKey) || 0) < reloadWindowMs;
  } catch {
    return true;
  }
}

function markReload() {
  try {
    window.sessionStorage.setItem(reloadKey, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

export class CrashGuard extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed:false, reloading:false };
  }

  static getDerivedStateFromError() {
    return { failed:true };
  }

  componentDidCatch(error) {
    console.error("[abcars] сбой отрисовки", error);
    if (!reloadedRecently() && markReload()) {
      this.setState({ reloading:true });
      window.location.reload();
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="maintenance-page" aria-live="polite">
        <div className="maintenance-card">
          <h1>{this.state.reloading ? "Обновляем страницу…" : "Страница не загрузилась"}</h1>
          {!this.state.reloading && <p>Что-то пошло не так. Обновите страницу — обычно этого достаточно.</p>}
          {!this.state.reloading && (
            <button className="primary" onClick={() => window.location.reload()}>
              Обновить страницу
            </button>
          )}
        </div>
      </main>
    );
  }
}
