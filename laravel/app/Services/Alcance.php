<?php

namespace App\Services;

/**
 * Alcance de una cifra (docs/specs/A5-equipos-reportes.md, DA5-2): un vendedor, el equipo de un
 * supervisor, toda la empresa o ninguno (un vendedor fuera del alcance de quien consulta, P5).
 */
final readonly class Alcance
{
    private function __construct(public string $tipo, public ?int $id = null) {}

    public static function vendedor(int $id): self
    {
        return new self('vendedor', $id);
    }

    public static function equipo(int $supervisorId): self
    {
        return new self('equipo', $supervisorId);
    }

    public static function empresa(): self
    {
        return new self('empresa');
    }

    public static function ninguno(): self
    {
        return new self('ninguno');
    }
}
