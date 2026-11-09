<?php

namespace App\Providers;

use App\Models\Cliente;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // {cliente} solo se resuelve dentro del alcance de la cuenta (DA4-1): un cliente de otro equipo
        // responde 404 en todas las rutas, aunque se escriba la dirección a mano (A4-03, L5-01).
        Route::bind('cliente', fn (string $id) => Cliente::visiblePara(request()->user())->whereKey($id)->firstOrFail());
    }
}
