import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

/**
 * Paleta de CRM Belleza. El rosa más claro es el color dominante: fondo de todas las páginas.
 * - claro  #FFF5F5: fondo de las páginas y de las cabeceras de tabla.
 * - suave  #F7D6D0: separadores, bordes suaves y fondo al pasar el puntero.
 * - medio  #E2B4BD: botones principales, bordes de los campos, foco y menú activo.
 * - texto  #4A4A4A: todo el texto (8.6:1 sobre claro; 4.9:1 sobre medio).
 * El blanco sobre #E2B4BD no llega a 3:1, así que los botones rosas llevan texto #4A4A4A.
 */
const crm = {
    claro: '#FFF5F5',
    suave: '#F7D6D0',
    medio: '#E2B4BD',
    texto: '#4A4A4A',
};

/** Escala gris de Breeze y del panel llevada a la paleta: fondos claros, bordes rosas y texto #4A4A4A. */
const gris = {
    50: crm.claro,
    100: crm.claro,
    200: crm.suave,
    300: crm.medio,
    400: crm.texto,
    500: crm.texto,
    600: crm.texto,
    700: crm.texto,
    800: crm.texto,
    900: crm.texto,
    950: crm.texto,
};

/** Acento de Breeze (foco, casillas, menú activo) llevado al rosa medio; los tonos oscuros, al texto. */
const acento = {
    50: crm.claro,
    100: crm.suave,
    200: crm.medio,
    300: crm.medio,
    400: crm.medio,
    500: crm.medio,
    600: crm.texto,
    700: crm.texto,
    800: crm.texto,
    900: crm.texto,
    950: crm.texto,
};

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
    ],

    theme: {
        extend: {
            fontFamily: {
                sans: ['Figtree', ...defaultTheme.fontFamily.sans],
            },
            colors: {
                crm,
                gray: gris,
                indigo: acento,
            },
        },
    },

    plugins: [forms],
};
