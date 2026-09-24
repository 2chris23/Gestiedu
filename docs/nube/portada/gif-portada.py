"""Junta los cuadros de gif-portada.mjs en un GIF pequeño (ancho 480 px, 4 por segundo).

Uso: python3 docs/nube/portada/gif-portada.py <carpeta> <salida.gif>
Necesita Pillow (pip install pillow).
"""
import glob
import sys
from PIL import Image

carpeta, salida = sys.argv[1], sys.argv[2]
cuadros = []
for ruta in sorted(glob.glob(f"{carpeta}/cuadros/*.png")):
    im = Image.open(ruta).convert("RGB")
    alto = round(im.height * 480 / im.width)
    cuadros.append(im.resize((480, alto), Image.LANCZOS).quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
cuadros[0].save(salida, save_all=True, append_images=cuadros[1:], duration=250, loop=0, optimize=True)
print(len(cuadros), "cuadros →", salida)
