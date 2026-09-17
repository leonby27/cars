// Иллюстрации отдаём в AVIF и WebP, исходный файл оставляем последним запасом: браузер
// берёт первый формат, который понимает, и вместо мегабайтов страница тянет десятки
// килобайт при той же картинке. Обёртка `<picture>` исключена из раскладки через
// `display: contents`, поэтому все правила размеров продолжают относиться к самой
// картинке. У каждой такой картинки рядом должны лежать оба лёгких файла — иначе
// браузер выберет несуществующий источник и покажет пустое место.
import { appHref } from "./app-href.js";

export function Illustration({ src, alt, ...props }) {
  const base = src.replace(/\.(png|jpe?g|webp)$/, "");
  return (
    <picture className="illustration">
      <source type="image/avif" srcSet={appHref(`${base}.avif`)} />
      <source type="image/webp" srcSet={appHref(`${base}.webp`)} />
      <img src={appHref(src)} alt={alt} {...props} />
    </picture>
  );
}
