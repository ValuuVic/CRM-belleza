<?php

use App\Http\Controllers\AsignacionClienteController;
use App\Http\Controllers\ClienteController;
use App\Http\Controllers\CuentaController;
use App\Http\Controllers\ProductoController;
use App\Http\Controllers\ProfileController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// cuenta.vigente se aplica a todo el grupo web (bootstrap/app.php).
Route::get('/dashboard', function () {
    return view('dashboard');
})->middleware(['auth', 'verified', 'rol:administrador,supervisor'])->name('dashboard');

// Las cuentas no se borran: el perfil no tiene DELETE (A2-02).
Route::middleware(['auth', 'rol:administrador,supervisor'])->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
});

// Gestión de cuentas: solo el administrador; sin borrado (A2-12, A2-22).
Route::middleware(['auth', 'rol:administrador'])
    ->prefix('cuentas')->name('cuentas.')->controller(CuentaController::class)
    ->group(function () {
        Route::get('/', 'index')->name('index');
        Route::get('/crear', 'create')->name('create');
        Route::post('/', 'store')->name('store');
        Route::get('/{user}/editar', 'edit')->whereNumber('user')->name('edit');
        Route::put('/{user}', 'update')->whereNumber('user')->name('update');
    });

// Catálogo: el supervisor solo ve la lista (P1); alta y edición, solo el administrador. Sin borrado (A3-19).
Route::middleware(['auth', 'rol:administrador,supervisor'])
    ->get('/productos', [ProductoController::class, 'index'])->name('productos.index');

Route::middleware(['auth', 'rol:administrador'])
    ->prefix('productos')->name('productos.')->controller(ProductoController::class)
    ->group(function () {
        Route::get('/crear', 'create')->name('create');
        Route::post('/', 'store')->name('store');
        Route::get('/{producto}/editar', 'edit')->whereNumber('producto')->name('edit');
        Route::put('/{producto}', 'update')->whereNumber('producto')->name('update');
    });

// Clientes: administrador y supervisor, cada uno en su alcance ({cliente} fuera de él → 404, DA4-1).
// Asignar y reasignar (PUT) y liberar (DELETE) son acciones aparte de los datos (DA4-2).
Route::middleware(['auth', 'rol:administrador,supervisor'])
    ->prefix('clientes')->name('clientes.')
    ->group(function () {
        Route::controller(ClienteController::class)->group(function () {
            Route::get('/', 'index')->name('index');
            Route::get('/crear', 'create')->name('create');
            Route::post('/', 'store')->name('store');
            Route::get('/{cliente}/editar', 'edit')->whereNumber('cliente')->name('edit');
            Route::put('/{cliente}', 'update')->whereNumber('cliente')->name('update');
        });

        Route::controller(AsignacionClienteController::class)->group(function () {
            Route::put('/{cliente}/asignacion', 'update')->whereNumber('cliente')->name('asignacion.update');
            Route::delete('/{cliente}/asignacion', 'destroy')->whereNumber('cliente')->name('asignacion.destroy');
        });
    });

// Eliminar un cliente: solo el administrador, y solo sin oportunidades (L4-04).
Route::middleware(['auth', 'rol:administrador'])
    ->delete('/clientes/{cliente}', [ClienteController::class, 'destroy'])->whereNumber('cliente')->name('clientes.destroy');

require __DIR__.'/auth.php';
