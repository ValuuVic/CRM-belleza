<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Login del panel (A2-03 a A2-07). Las cuentas son las de VerificacionSeeder con una contraseña
 * fijada en la prueba.
 */
class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    private const CLAVE = 'clave-de-prueba';

    private const MENSAJE_CREDENCIALES = 'Las credenciales no coinciden con nuestros registros.';

    private function conClave(int $id): User
    {
        $usuario = User::find($id);
        $usuario->update(['password' => self::CLAVE]);

        return $usuario;
    }

    public function test_login_screen_can_be_rendered(): void
    {
        $response = $this->get('/login');

        $response->assertStatus(200);
    }

    public function test_users_can_authenticate_using_the_login_screen(): void
    {
        $user = User::factory()->administrador()->create();

        $response = $this->post('/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticated();
        $response->assertRedirect(route('dashboard', absolute: false));
    }

    /**
     * A2-03: Alicia (administradora) y Sergio (supervisor) entran al panel.
     */
    public function test_administrator_and_supervisor_can_log_in(): void
    {
        foreach ([1, 2] as $id) {
            $usuario = $this->conClave($id);

            $this->post('/login', ['email' => $usuario->email, 'password' => self::CLAVE])
                ->assertRedirect(route('dashboard', absolute: false));
            $this->assertAuthenticatedAs($usuario);
            $this->get('/dashboard')->assertOk();

            $this->post('/logout');
            $this->assertGuest();
        }
    }

    public function test_users_can_not_authenticate_with_invalid_password(): void
    {
        $user = User::factory()->administrador()->create();

        $this->post('/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);

        $this->assertGuest();
    }

    /**
     * A2-04: Valeria, con la contraseña correcta, recibe el aviso de la SPA y no queda autenticada.
     */
    public function test_seller_is_sent_to_the_spa(): void
    {
        $valeria = $this->conClave(4);

        $response = $this->from('/login')->post('/login', ['email' => $valeria->email, 'password' => self::CLAVE]);

        $response->assertRedirect('/login')
            ->assertSessionHasErrors(['email' => User::MENSAJE_VENDEDOR]);
        $this->assertGuest();
    }

    /**
     * A2-05: Iván (vendedor desactivado) y un supervisor desactivado ven el aviso de cuenta desactivada.
     */
    public function test_inactive_accounts_can_not_log_in(): void
    {
        $ivan = $this->conClave(7);
        $supervisora = User::factory()->supervisor()->inactivo()->create(['password' => self::CLAVE]);

        foreach ([$ivan, $supervisora] as $usuario) {
            $this->from('/login')->post('/login', ['email' => $usuario->email, 'password' => self::CLAVE])
                ->assertRedirect('/login')
                ->assertSessionHasErrors(['email' => User::MENSAJE_DESACTIVADA]);
            $this->assertGuest();
        }
    }

    /**
     * A2-06: con contraseña incorrecta, el mensaje es el mismo exista o no la cuenta, y sin importar
     * su rol o su estado.
     */
    public function test_wrong_credentials_always_give_the_same_message(): void
    {
        foreach (['admin@crm.test', 'valeria@crm.test', 'ivan@crm.test', 'nadie@crm.test'] as $correo) {
            $this->from('/login')->post('/login', ['email' => $correo, 'password' => 'incorrecta'])
                ->assertRedirect('/login')
                ->assertSessionHasErrors(['email' => self::MENSAJE_CREDENCIALES]);
            $this->assertGuest();
        }
    }

    /**
     * A2-06: se mantiene el límite de 5 intentos de Breeze.
     */
    public function test_login_is_rate_limited(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->post('/login', ['email' => 'admin@crm.test', 'password' => 'incorrecta']);
        }

        $this->post('/login', ['email' => 'admin@crm.test', 'password' => 'incorrecta'])
            ->assertSessionHasErrors('email');
        $this->assertStringStartsWith('Demasiados intentos.', session('errors')->first('email'));
    }

    /**
     * A2-07: al rechazar el login se conserva el correo y no la contraseña.
     */
    public function test_rejected_login_keeps_the_email_but_not_the_password(): void
    {
        $this->conClave(4);

        foreach ([self::CLAVE, 'incorrecta'] as $clave) {
            $this->from('/login')->post('/login', ['email' => 'valeria@crm.test', 'password' => $clave])
                ->assertSessionHasInput('email', 'valeria@crm.test')
                ->assertSessionMissing('_old_input.password');
        }
    }

    public function test_users_can_logout(): void
    {
        $user = User::factory()->administrador()->create();

        $response = $this->actingAs($user)->post('/logout');

        $this->assertGuest();
        $response->assertRedirect('/');
    }
}
