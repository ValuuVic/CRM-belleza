<?php

namespace Tests\Feature\Auth;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * A2-25 — Sin recuperación de contraseña por correo (P3). Antes comprobaba el flujo de Breeze; ahora
 * comprueba que no existe: una contraseña olvidada la cambia el administrador desde «Cuentas».
 */
class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_reset_password_link_screen_does_not_exist(): void
    {
        $this->get('/forgot-password')->assertNotFound();
        $this->post('/forgot-password', ['email' => 'valeria@crm.test'])->assertNotFound();
        $this->assertFalse(Route::has('password.request'));
        $this->assertFalse(Route::has('password.email'));
    }

    public function test_reset_password_screen_does_not_exist(): void
    {
        $this->get('/reset-password/un-token')->assertNotFound();
        $this->post('/reset-password', [
            'token' => 'un-token',
            'email' => 'valeria@crm.test',
            'password' => 'clave-de-prueba',
            'password_confirmation' => 'clave-de-prueba',
        ])->assertNotFound();
        $this->assertFalse(Route::has('password.reset'));
        $this->assertFalse(Route::has('password.store'));
    }

    public function test_controllers_and_views_were_removed(): void
    {
        $this->assertFalse(class_exists('App\Http\Controllers\Auth\PasswordResetLinkController'));
        $this->assertFalse(class_exists('App\Http\Controllers\Auth\NewPasswordController'));
        $this->assertFalse(view()->exists('auth.forgot-password'));
        $this->assertFalse(view()->exists('auth.reset-password'));
    }

    public function test_login_has_no_forgot_password_link(): void
    {
        $this->get('/login')->assertOk()->assertDontSee('forgot-password')->assertDontSee('Forgot your password?');
    }
}
