<?php

use App\Http\Controllers\CuentaController;
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

require __DIR__.'/auth.php';
