import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"
import { AxiosError } from "axios"

/**
 * `cn` CONOCE NUESTROS NOMBRES
 *
 * tailwind-merge quita la clase repetida cuando dos chocan: si llegan
 * `text-red-500` y `text-blue-500`, se queda la última. Para saber cuáles chocan
 * mira el NOMBRE, y solo conoce los de Tailwind.
 *
 * `text-cuerpo` es un tamaño de letra nuestro. Sin decírselo, lo tomaba por un
 * COLOR y borraba el color de verdad que venía antes: el botón "Ingresar" salía
 * con `bg-indigo` y **sin** `text-indigo-encima`, letras oscuras sobre índigo,
 * ilegible. Pasaba en todos los botones, pastillas y rótulos del diseño nuevo.
 *
 * Aquí se le enseñan los tamaños, sombras y radios propios. Si se añade uno en
 * `tailwind.config.js`, se añade aquí también: lo vigila `utils.test.ts`.
 */
export const TAMANOS_DE_LETRA = ["micro", "etiqueta", "cuerpo", "titulo", "seccion", "pantalla"]
export const SOMBRAS = ["1", "2", "3", "dentro", "pulsado"]
export const RADIOS = ["pastilla"]

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: TAMANOS_DE_LETRA }],
      shadow: [{ shadow: SOMBRAS }],
      rounded: [{ rounded: RADIOS }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getApiErrorMessage(error: unknown, defaultMessage = 'Ocurrió un error inesperado'): string {
  if (error instanceof AxiosError) {
    return error.response?.data?.error || error.response?.data?.message || defaultMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return defaultMessage;
}
