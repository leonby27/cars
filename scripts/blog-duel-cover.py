#!/usr/bin/env python3
"""Обложка сравнения для соцсетей: два кадра машин и «vs» между ними.

В журнале такая обложка собирается вёрсткой — два снимка рядом и значок посередине.
Соцсети вёрстку не умеют: им нужен готовый файл. Этот скрипт делает ровно то же
самое картинкой.

Запуск: blog-duel-cover.py левый.jpg правый.jpg выход.jpg

Кадр 1200×675 (16:9) — те же пропорции, что у заглавной картинки материала, и они
проходят по требованиям Instagram. Каждый снимок обрезается по центру под половину
кадра: масштабировать с искажением нельзя, а поля по краям выглядят как брак.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1200, 675
GAP = 8  # полоска между кадрами, чтобы они не слипались
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def half(path, size):
    """Снимок, обрезанный по центру под нужный размер без искажения пропорций."""
    image = Image.open(path).convert("RGB")
    target = size[0] / size[1]
    source = image.width / image.height
    if source > target:                       # кадр шире места — режем по бокам
        crop_width = int(image.height * target)
        left = (image.width - crop_width) // 2
        image = image.crop((left, 0, left + crop_width, image.height))
    else:                                     # кадр выше места — режем сверху и снизу
        crop_height = int(image.width / target)
        top = (image.height - crop_height) // 2
        image = image.crop((0, top, image.width, top + crop_height))
    return image.resize(size, Image.LANCZOS)


def main(left_path, right_path, out_path):
    side = ((WIDTH - GAP) // 2, HEIGHT)
    canvas = Image.new("RGB", (WIDTH, HEIGHT), (17, 17, 17))
    canvas.paste(half(left_path, side), (0, 0))
    canvas.paste(half(right_path, side), (side[0] + GAP, 0))

    draw = ImageDraw.Draw(canvas)
    # Значок «vs» в кружке по центру: так он читается на любом фоне, светлом и тёмном.
    radius = 62
    center = (WIDTH // 2, HEIGHT // 2)
    draw.ellipse(
        [center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius],
        fill=(17, 17, 17), outline=(255, 255, 255), width=4,
    )
    font = ImageFont.truetype(FONT_PATH, 52)
    box = draw.textbbox((0, 0), "vs", font=font)
    draw.text(
        (center[0] - (box[2] - box[0]) / 2, center[1] - (box[3] - box[1]) / 2 - box[1]),
        "vs", font=font, fill=(255, 255, 255),
    )

    canvas.save(out_path, "JPEG", quality=86, optimize=True, progressive=True)
    print(out_path)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("нужно три пути: левый кадр, правый кадр, куда сохранить")
    main(*sys.argv[1:])
