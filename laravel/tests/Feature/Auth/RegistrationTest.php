<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * A2-01 — Sin registro público (L2-01). Antes comprobaba que Breeze registraba cuentas; ahora
 * comprueba que el registro ya no existe: solo el administrador crea cuentas.
 */
class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_screen_does_not_exist(): void
    {
        $this->get('/register')->assertNotFound();
        $this->assertFalse(Route::has('register'));
        $this->assertFalse(view()->exists('auth.register'));
        $this->assertFalse(class_exists('App\Http\Controllers\Auth\RegisteredUserController'));
    }

    public function test_new_users_can_not_register(): void
    {
        $cuentas = User::count();

        $response = $this->post('/register', [
            'name' => 'Cuenta Nueva',
            'email' => 'nueva@crm.test',
            'password' => 'clave-de-prueba',
            'password_confirmation' => 'clave-de-prueba',
        ]);

        $response->assertNotFound();
        $this->assertGuest();
        $this->assertSame($cuentas, User::count());
        $this->assertDatabaseMissing('users', ['email' => 'nueva@crm.test']);
    }

    public function test_welcome_and_login_have_no_registration_link(): void
    {
        $this->get('/')->assertOk()->assertDontSee('/register');
        $this->get('/login')->assertOk()->assertDontSee('/register');
    }
}
