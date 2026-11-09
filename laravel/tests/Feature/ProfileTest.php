<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Perfil de Breeze adaptado a A2: sin «Eliminar cuenta» (A2-02) y solo el nombre editable (A2-23, P4).
 */
class ProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_page_is_displayed(): void
    {
        $user = User::factory()->administrador()->create();

        $response = $this
            ->actingAs($user)
            ->get('/profile');

        $response->assertOk();
    }

    /**
     * A2-02: el perfil no muestra el formulario de borrado y sí el cambio de contraseña.
     */
    public function test_profile_page_has_no_delete_account_form(): void
    {
        $alicia = User::find(1);

        $this->actingAs($alicia)->get('/profile')
            ->assertOk()
            ->assertSee($alicia->email)
            ->assertSee(route('password.update'), false)
            ->assertDontSee('Delete Account')
            ->assertDontSee('userDeletion');
    }

    public function test_profile_name_can_be_updated(): void
    {
        $user = User::factory()->administrador()->create();

        $response = $this
            ->actingAs($user)
            ->patch('/profile', [
                'name' => 'Nombre Nuevo',
            ]);

        $response
            ->assertSessionHasNoErrors()
            ->assertRedirect('/profile');

        $this->assertSame('Nombre Nuevo', $user->refresh()->name);
    }

    /**
     * A2-23: el correo, el rol, el estado y el supervisor del cuerpo se ignoran.
     * Antes la prueba de Breeze comprobaba que el correo sí cambiaba.
     */
    public function test_protected_fields_are_ignored(): void
    {
        $sergio = User::find(2);

        $response = $this
            ->actingAs($sergio)
            ->patch('/profile', [
                'name' => 'Sergio R.',
                'email' => 'otro@crm.test',
                'rol' => 'administrador',
                'activo' => false,
                'supervisor_id' => 3,
            ]);

        $response
            ->assertSessionHasNoErrors()
            ->assertRedirect('/profile');

        $sergio->refresh();
        $this->assertSame('Sergio R.', $sergio->name);
        $this->assertSame('sergio@crm.test', $sergio->email);
        $this->assertSame('supervisor', $sergio->rol);
        $this->assertTrue($sergio->activo);
        $this->assertNull($sergio->supervisor_id);
    }

    public function test_profile_name_is_required(): void
    {
        $user = User::factory()->administrador()->create();

        $this->actingAs($user)->from('/profile')->patch('/profile', ['name' => ''])
            ->assertSessionHasErrors(['name' => 'Escriba su nombre.'])
            ->assertRedirect('/profile');
    }

    /**
     * A2-02: las cuentas no se borran. Antes la prueba de Breeze comprobaba que se borraba.
     */
    public function test_user_can_not_delete_their_account(): void
    {
        $user = User::factory()->administrador()->create();

        $response = $this
            ->actingAs($user)
            ->delete('/profile', [
                'password' => 'password',
            ]);

        $response->assertMethodNotAllowed();
        $this->assertAuthenticated();
        $this->assertNotNull($user->fresh());
    }
}
