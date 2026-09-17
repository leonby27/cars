#!/usr/bin/env python3
"""Кадр для соцсетей: квадрат 1080×1080 или вертикальный 1080×1350 (4:5).

Почему не форма источника. Instagram подгоняет все снимки галереи под пропорции
первого: кадр другой формы он либо обрежет по своему усмотрению, либо не возьмёт
вовсе. Одна и та же форма для всех кадров снимает обе беды сразу и вдобавок даёт
постоянное место под оформление — логотип и подпись всегда в одних координатах.

Форм две:

  square   — 1080×1080, было единственной формой до 18.09.2026.
  vertical — 1080×1350 (4:5). Это самый узкий кадр, который сейчас принимает
       публикация в ленту (см. scripts/lib/social.mjs) — сама лента у Instagram с
       2025 года умеет и более узкий 3:4 (1080×1440), но то про то, как готовый
       пост выглядит на экране, а не про то, что примет наша публикация. Проверить
       заново стоит, если это понадобится.

Снимки источника — 4:3, и в свою форму они попадают двумя способами:

  crop (по умолчанию) — кадр обрезается по бокам. Плотнее и без полос; выбрано
       17.09.2026. Плата за это — у длинных машин срезаются края, и снимок тянется
       сильнее: у источника кадр высотой 768 точек, а квадрату нужно 1080.
  fit  — кадр вписывается целиком, сверху и снизу (у square) или по бокам
       (у vertical, кадр источника шире цели) остаются полосы фона. Машина не
       теряет ни носа, ни кормы, а полосы — готовое место под текст.

Запуск: photo-to-social.py кадр выход [crop|fit] [square|vertical]
"""
import sys
from PIL import Image

FRAME_SIZES = {"square": (1080, 1080), "vertical": (1080, 1350)}
# Цвет полос — тёмный тон сайта (--ink). На нём одинаково хорошо читаются и
# белый логотип, и фирменный красный.
BACKGROUND = (23, 25, 28)


def fit(image, size):
    """Кадр целиком, полосы фона по недостающей стороне."""
    width, height = size
    scale = min(width / image.width, height / image.height)
    scaled = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    canvas = Image.new("RGB", size, BACKGROUND)
    canvas.paste(image.resize(scaled, Image.LANCZOS), ((width - scaled[0]) // 2, (height - scaled[1]) // 2))
    return canvas


def crop(image, size):
    """Своя форма из середины кадра, без полос и без искажения пропорций."""
    width, height = size
    target_ratio = width / height
    source_ratio = image.width / image.height
    if source_ratio > target_ratio:
        crop_height = image.height
        crop_width = round(crop_height * target_ratio)
    else:
        crop_width = image.width
        crop_height = round(crop_width / target_ratio)
    left = (image.width - crop_width) // 2
    top = (image.height - crop_height) // 2
    return image.crop((left, top, left + crop_width, top + crop_height)).resize(size, Image.LANCZOS)


def main(src, out, mode="crop", shape="square"):
    size = FRAME_SIZES[shape]
    image = Image.open(src).convert("RGB")
    frame = crop(image, size) if mode == "crop" else fit(image, size)
    frame.save(out, "JPEG", quality=88, optimize=True, progressive=True)
    print(out)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    mode = sys.argv[3] if len(sys.argv) > 3 else "crop"
    if mode not in ("fit", "crop"):
        raise SystemExit(f"неизвестный режим {mode}: бывает fit или crop")
    shape = sys.argv[4] if len(sys.argv) > 4 else "square"
    if shape not in FRAME_SIZES:
        raise SystemExit(f"неизвестная форма {shape}: бывает {', '.join(FRAME_SIZES)}")
    main(sys.argv[1], sys.argv[2], mode, shape)
