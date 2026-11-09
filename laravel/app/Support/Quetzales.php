<?php

namespace App\Support;

/**
 * Formato de montos en quetzales a partir del texto DECIMAL que devuelve MySQL ("9250.00" → "Q9,250.00").
 * Trabaja sobre el texto, sin pasar por float, para no alterar ningún centavo (A5 §3).
 */
final class Quetzales
{
    public static function formatear(string|int|null $monto): string
    {
        $texto = trim((string) ($monto ?? '0'));

        if (! preg_match('/^(-?)(\d+)(?:\.(\d*))?$/D', $texto, $partes)) {
            return '';
        }

        [, $signo, $enteros, $decimales] = array_pad($partes, 4, '');
        $enteros = ltrim($enteros, '0') ?: '0';
        $decimales = substr(str_pad($decimales, 2, '0'), 0, 2);
        $miles = strrev(implode(',', str_split(strrev($enteros), 3)));

        return $signo.'Q'.$miles.'.'.$decimales;
    }
}
