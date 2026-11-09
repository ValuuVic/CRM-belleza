<?php

namespace App\Support;

/**
 * Normaliza y valida un teléfono guatemalteco (R4). Traducción literal de normalizarTelefono
 * (api/src/utils/validaciones.js; DA4-3).
 *
 * - Elimina separadores: espacios, guiones, puntos y paréntesis.
 * - Elimina el prefijo de Guatemala: "+502", o "502" cuando quedan 11 dígitos.
 * - Debe quedar un número de 8 dígitos que empiece por 2-9.
 */
final class Telefono
{
    /**
     * Mismos caracteres que \s de JavaScript, más guion, punto y paréntesis.
     */
    private const SEPARADORES = '/[\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}\-.()]/u';

    /**
     * @return array{valido: bool, telefono: ?string}
     */
    public static function normalizar(mixed $valor): array
    {
        if (! is_string($valor)) {
            return ['valido' => false, 'telefono' => null];
        }

        $limpio = preg_replace(self::SEPARADORES, '', $valor);
        if ($limpio === null) {
            return ['valido' => false, 'telefono' => null];
        }

        if (str_starts_with($limpio, '+502')) {
            $limpio = substr($limpio, 4);
        } elseif (preg_match('/^502\d{8}$/D', $limpio)) {
            $limpio = substr($limpio, 3);
        }

        return preg_match('/^[2-9]\d{7}$/D', $limpio)
            ? ['valido' => true, 'telefono' => $limpio]
            : ['valido' => false, 'telefono' => null];
    }
}
