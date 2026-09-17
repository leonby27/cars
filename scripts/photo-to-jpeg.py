#!/usr/bin/env python3
"""Кадр из нашего хранилища — в обычный JPEG.

На диске снимки лежат в лёгком современном формате (webp), а соцсети его не берут:
телеграм отказывается, Meta отказывается. Перегоняем в обычный JPEG.

Запуск: photo-to-jpeg.py кадр.jpg.webp выход.jpg [ширина]
"""
import sys
from PIL import Image


def main(src, out, width=0):
    image = Image.open(src).convert("RGB")
    if width and image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    image.save(out, "JPEG", quality=88, optimize=True, progressive=True)
    print(out)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("нужно: исходный файл, куда сохранить, при желании ширина")
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0)
