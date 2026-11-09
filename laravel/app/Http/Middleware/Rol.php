<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Restringe una ruta a ciertos roles: `rol:administrador` o `rol:administrador,supervisor`.
 *
 * Una cuenta con otro rol recibe 403 (DA2-5): la ruta existe, pero no es para su rol.
 */
class Rol
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $usuario = $request->user();

        abort_unless(
            $usuario && in_array($usuario->rol, $roles, true),
            403,
            'Usted no tiene permiso para entrar a esta sección.'
        );

        return $next($request);
    }
}
