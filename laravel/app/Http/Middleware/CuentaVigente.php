<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cierra la sesión de una cuenta que se desactivó o dejó de ser administrador o supervisor
 * (A2-08 a A2-10, §3.4).
 *
 * Va en el grupo web, así que revisa todas las peticiones con sesión. La cuenta se lee de la base
 * en cada petición (la sesión solo guarda su id), de modo que un cambio hecho por el administrador
 * se aplica en la siguiente petición.
 */
class CuentaVigente
{
    public function handle(Request $request, Closure $next): Response
    {
        $usuario = $request->user();

        if ($usuario && ($motivo = $usuario->motivoSinPanel())) {
            Auth::guard('web')->logout();

            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return redirect()->route('login')->withErrors(['email' => $motivo]);
        }

        return $next($request);
    }
}
