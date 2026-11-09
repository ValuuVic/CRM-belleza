<?php

use App\Http\Middleware\CuentaVigente;
use App\Http\Middleware\Rol;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'cuenta.vigente' => CuentaVigente::class,
            'rol' => Rol::class,
        ]);

        // En todas las peticiones del panel: una cuenta desactivada o que ya no es de panel pierde
        // la sesión en su siguiente petición (A2-08 a A2-10).
        $middleware->web(append: [CuentaVigente::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
