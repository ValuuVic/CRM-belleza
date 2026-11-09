<?php

namespace App\Support;

/**
 * Normaliza y valida un NIT guatemalteco (R4). Traducción literal de normalizarNit
 * (api/src/utils/validaciones.js): el panel y la API aceptan y guardan exactamente lo mismo (DA4-3).
 *
 * - Elimina espacios y guiones, convierte a mayúsculas y quita los ceros iniciales.
 * - "CF" (consumidor final) es válido y se representa como null.
 * - Ya compacto, tiene entre 2 y 12 caracteres (clientes.nit VARCHAR(12)).
 * - El último carácter es el dígito verificador (0-9 o K), calculado con módulo 11:
 *   los dígitos del cuerpo se multiplican por pesos n+1 … 2 (de izquierda a derecha),
 *   verificador = (11 - (suma % 11)) % 11, y 10 se representa como "K".
 */
final class Nit
{
    public const LONGITUD_MAXIMA = 12;

    /**
     * Mismos caracteres que \s de JavaScript, más el guion.
     */
    public const SEPARADORES = '/[\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}-]/u';

    /**
     * @return array{valido: bool, nit: ?string}
     */
    public static function normalizar(mixed $valor): array
    {
        if (! is_string($valor)) {
            return ['valido' => false, 'nit' => null];
        }

        $limpio = self::compactar($valor);
        if ($limpio === null) {
            return ['valido' => false, 'nit' => null];
        }

        if ($limpio === 'CF') {
            return ['valido' => true, 'nit' => null];
        }

        $sinCeros = preg_replace('/^0+/', '', $limpio);
        // La expresión exige al menos 2 caracteres (un dígito de cuerpo + verificador).
        if (! preg_match('/^\d+[\dK]$/D', $sinCeros) || strlen($sinCeros) > self::LONGITUD_MAXIMA) {
            return ['valido' => false, 'nit' => null];
        }

        $cuerpo = substr($sinCeros, 0, -1);
        $verificador = substr($sinCeros, -1);

        $suma = 0;
        for ($i = 0, $n = strlen($cuerpo); $i < $n; $i++) {
            $suma += (int) $cuerpo[$i] * ($n + 1 - $i);
        }
        $resultado = (11 - ($suma % 11)) % 11;
        $esperado = $resultado === 10 ? 'K' : (string) $resultado;

        return $esperado === $verificador ? ['valido' => true, 'nit' => $sinCeros] : ['valido' => false, 'nit' => null];
    }

    /**
     * Sin separadores y en mayúsculas, sin quitar ceros; null si el texto no es UTF-8 válido.
     * La búsqueda de la lista usa además la quita de ceros iniciales (DA4-8).
     */
    public static function compactar(string $valor): ?string
    {
        $limpio = preg_replace(self::SEPARADORES, '', $valor);

        return $limpio === null ? null : mb_strtoupper($limpio, 'UTF-8');
    }
}
