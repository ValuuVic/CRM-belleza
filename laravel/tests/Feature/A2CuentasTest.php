<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Criterios A2-08 a A2-29 de docs/specs/A2-cuentas.md (los de login, registro, recuperación de
 * contraseña y perfil están en AuthenticationTest, RegistrationTest, PasswordResetTest y ProfileTest).
 *
 * Cuentas de VerificacionSeeder: Alicia (1, administradora), Sergio (2) y Sandra (3, supervisores),
 * Valeria (4), Diego (5) y Carlos (6, vendedores), Iván (7, vendedor desactivado).
 */
class A2CuentasTest extends TestCase
{
    use RefreshDatabase;

    private const CLAVE = 'clave-de-prueba';

    private function alicia(): User
    {
        return User::find(1);
    }

    /**
     * Cuerpo completo del formulario de edición de $cuenta, con los cambios de $cambios.
     *
     * @param  array<string, mixed>  $cambios
     * @return array<string, mixed>
     */
    private function formulario(User $cuenta, array $cambios = []): array
    {
        return array_merge([
            'name' => $cuenta->name,
            'email' => $cuenta->email,
            'password' => '',
            'password_confirmation' => '',
            'rol' => $cuenta->rol,
            'supervisor_id' => $cuenta->supervisor_id,
            'activo' => $cuenta->activo ? '1' : '0',
        ], $cambios);
    }

    /**
     * @param  array<string, mixed>  $cambios
     * @return array<string, mixed>
     */
    private function nuevoVendedor(array $cambios = []): array
    {
        return array_merge([
            'name' => 'Vendedora Nueva',
            'email' => 'nueva@crm.test',
            'password' => self::CLAVE,
            'password_confirmation' => self::CLAVE,
            'rol' => 'vendedor',
            'supervisor_id' => 2,
            'activo' => '1',
        ], $cambios);
    }

    /**
     * Inicia sesión de verdad (no actingAs), para que la cuenta se lea de la sesión en cada petición.
     */
    private function iniciarSesion(User $usuario): void
    {
        $usuario->update(['password' => self::CLAVE]);
        $this->post('/login', ['email' => $usuario->email, 'password' => self::CLAVE]);
        $this->assertAuthenticatedAs($usuario);
    }

    /**
     * Simula una petición nueva: en producción cada petición vuelve a leer la cuenta desde la base.
     */
    private function siguientePeticion(): void
    {
        Auth::forgetGuards();
    }

    // --- Sesión vigente -------------------------------------------------------------------------

    public function test_a2_08_desactivar_con_sesion_abierta_cierra_la_sesion(): void
    {
        $sergio = User::find(2);
        $this->iniciarSesion($sergio);
        $this->get('/dashboard')->assertOk();

        DB::table('users')->where('id', 2)->update(['activo' => false]);
        $this->siguientePeticion();

        $this->get('/dashboard')
            ->assertRedirect('/login')
            ->assertSessionHasErrors(['email' => User::MENSAJE_DESACTIVADA]);
        $this->assertGuest();
    }

    public function test_a2_09_cambio_de_rol_con_sesion_abierta_cierra_la_sesion(): void
    {
        $this->iniciarSesion(User::find(2));

        DB::table('users')->where('id', 2)->update(['rol' => 'vendedor', 'supervisor_id' => 3]);
        $this->siguientePeticion();

        $this->get('/profile')
            ->assertRedirect('/login')
            ->assertSessionHasErrors(['email' => User::MENSAJE_VENDEDOR]);
        $this->assertGuest();
    }

    public function test_a2_10_el_middleware_lee_el_estado_actual_de_la_base(): void
    {
        $this->iniciarSesion(User::find(2));

        // El cambio se hace por fuera del modelo en sesión: solo la lectura de la base lo detecta.
        DB::table('users')->where('id', 2)->update(['activo' => false]);
        $this->siguientePeticion();
        $this->get('/dashboard')->assertRedirect('/login');

        // Y al revés: una cuenta reactivada vuelve a entrar.
        DB::table('users')->where('id', 2)->update(['activo' => true]);
        $this->iniciarSesion(User::find(2));
        $this->siguientePeticion();
        $this->get('/dashboard')->assertOk();
    }

    // --- Rol ------------------------------------------------------------------------------------

    public function test_a2_11_sin_sesion_se_envia_al_login(): void
    {
        foreach (['/dashboard', '/profile', '/cuentas', '/cuentas/crear', '/cuentas/1/editar'] as $ruta) {
            $this->get($ruta)->assertRedirect('/login');
        }
    }

    public function test_a2_12_solo_el_administrador_gestiona_cuentas(): void
    {
        $sergio = User::find(2);

        $this->actingAs($sergio)->get('/dashboard')->assertOk()->assertDontSee(route('cuentas.index'), false);

        $this->actingAs($sergio)->get('/cuentas')->assertForbidden();
        $this->actingAs($sergio)->get('/cuentas/crear')->assertForbidden();
        $this->actingAs($sergio)->get('/cuentas/4/editar')->assertForbidden();
        $this->actingAs($sergio)->post('/cuentas', $this->nuevoVendedor())->assertForbidden();
        $this->actingAs($sergio)->put('/cuentas/4', $this->formulario(User::find(4), ['name' => 'X']))->assertForbidden();

        $this->assertDatabaseMissing('users', ['email' => 'nueva@crm.test']);
        $this->assertSame('Valeria López', User::find(4)->name);

        $this->actingAs($this->alicia())->get('/dashboard')->assertSee(route('cuentas.index'), false);
        $this->actingAs($this->alicia())->get('/cuentas')->assertOk();
    }

    // --- Gestión de cuentas ---------------------------------------------------------------------

    public function test_a2_13_lista_de_cuentas_sin_hashes(): void
    {
        $respuesta = $this->actingAs($this->alicia())->get('/cuentas')->assertOk();

        foreach (User::all() as $cuenta) {
            $respuesta->assertSee($cuenta->name)->assertSee($cuenta->email);
            $respuesta->assertDontSee($cuenta->password);
        }

        $respuesta->assertSee('Desactivada')->assertSee('Sergio Ruiz')->assertDontSee('$2y$');
    }

    public function test_a2_14_crear_un_vendedor(): void
    {
        $this->actingAs($this->alicia())->post('/cuentas', $this->nuevoVendedor())
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('cuentas.index'));

        $nueva = User::where('email', 'nueva@crm.test')->firstOrFail();
        $this->assertSame('vendedor', $nueva->rol);
        $this->assertSame(2, $nueva->supervisor_id);
        $this->assertTrue($nueva->activo);
        $this->assertStringStartsWith('$2y$', $nueva->password);
        $this->assertTrue(Hash::check(self::CLAVE, $nueva->password));
    }

    public function test_a2_15_supervisor_y_administrador_sin_supervisor(): void
    {
        foreach (['supervisor', 'administrador'] as $i => $rol) {
            $this->actingAs($this->alicia())
                ->post('/cuentas', $this->nuevoVendedor(['rol' => $rol, 'email' => "nueva$i@crm.test", 'supervisor_id' => 2]))
                ->assertSessionHasNoErrors();

            $this->assertDatabaseHas('users', ['email' => "nueva$i@crm.test", 'rol' => $rol, 'supervisor_id' => null]);
        }
    }

    public function test_a2_16_vendedor_sin_supervisor_valido(): void
    {
        $inactiva = User::factory()->supervisor()->inactivo()->create();

        foreach (['', $inactiva->id, 4, 999] as $supervisor) {
            $this->actingAs($this->alicia())->from('/cuentas/crear')
                ->post('/cuentas', $this->nuevoVendedor(['supervisor_id' => $supervisor]))
                ->assertRedirect('/cuentas/crear')
                ->assertSessionHasErrors(['supervisor_id' => 'Elija un supervisor activo para el vendedor.'])
                ->assertSessionHasInput('name', 'Vendedora Nueva')
                ->assertSessionHasInput('email', 'nueva@crm.test');
        }

        $this->assertDatabaseMissing('users', ['email' => 'nueva@crm.test']);

        $diego = User::find(5);
        $this->actingAs($this->alicia())->from('/cuentas/5/editar')
            ->put('/cuentas/5', $this->formulario($diego, ['supervisor_id' => $inactiva->id]))
            ->assertSessionHasErrors('supervisor_id');
        $this->assertSame(2, $diego->fresh()->supervisor_id);
    }

    public function test_a2_17_correo_repetido(): void
    {
        foreach (['valeria@crm.test', 'VALERIA@crm.test', ' Valeria@CRM.test '] as $correo) {
            $this->actingAs($this->alicia())->from('/cuentas/crear')
                ->post('/cuentas', $this->nuevoVendedor(['email' => $correo]))
                ->assertSessionHasErrors(['email' => 'Ya existe una cuenta con ese correo.']);
        }
        $this->assertSame(1, User::where('email', 'valeria@crm.test')->count());

        $diego = User::find(5);
        $this->actingAs($this->alicia())->put('/cuentas/5', $this->formulario($diego, ['email' => 'valeria@crm.test']))
            ->assertSessionHasErrors(['email' => 'Ya existe una cuenta con ese correo.']);
        $this->assertSame('diego@crm.test', $diego->fresh()->email);

        $valeria = User::find(4);
        $this->actingAs($this->alicia())->put('/cuentas/4', $this->formulario($valeria, ['name' => 'Valeria L.']))
            ->assertSessionHasNoErrors();
        $this->assertSame('Valeria L.', $valeria->fresh()->name);
    }

    public function test_a2_18_validacion_general_en_espanol(): void
    {
        $this->actingAs($this->alicia())->from('/cuentas/crear')
            ->post('/cuentas', [
                'name' => '',
                'email' => 'no-es-correo',
                'password' => 'corta',
                'password_confirmation' => 'corta',
                'rol' => 'gerente',
                'activo' => '1',
            ])
            ->assertRedirect('/cuentas/crear')
            ->assertSessionHasErrors([
                'name' => 'Escriba el nombre de la cuenta.',
                'email' => 'Escriba un correo válido.',
                'password' => 'La contraseña debe tener al menos 8 caracteres.',
                'rol' => 'Elija un rol válido.',
            ])
            ->assertSessionHasInput('email', 'no-es-correo')
            ->assertSessionMissing('_old_input.password')
            ->assertSessionMissing('_old_input.password_confirmation');

        $this->actingAs($this->alicia())->post('/cuentas', $this->nuevoVendedor(['password_confirmation' => 'otra-clave']))
            ->assertSessionHasErrors(['password' => 'La confirmación no coincide con la contraseña.']);
    }

    public function test_a2_19_editar_sin_cambiar_la_contrasena(): void
    {
        $diego = User::find(5);
        $hash = $diego->password;

        $this->actingAs($this->alicia())->put('/cuentas/5', $this->formulario($diego, ['name' => 'Diego C.']))
            ->assertSessionHasNoErrors();

        $this->assertSame('Diego C.', $diego->fresh()->name);
        $this->assertSame($hash, $diego->fresh()->password);

        // Con contraseña nueva, el administrador la cambia (P3).
        $this->actingAs($this->alicia())
            ->put('/cuentas/5', $this->formulario($diego->fresh(), ['password' => 'clave-nueva-1', 'password_confirmation' => 'clave-nueva-1']))
            ->assertSessionHasNoErrors();
        $this->assertTrue(Hash::check('clave-nueva-1', $diego->fresh()->password));
    }

    public function test_a2_20_desactivar_y_reactivar(): void
    {
        $valeria = User::find(4);

        $this->actingAs($this->alicia())->put('/cuentas/4', $this->formulario($valeria, ['activo' => '0']))
            ->assertSessionHasNoErrors();
        $this->assertFalse($valeria->fresh()->activo);

        $this->actingAs($this->alicia())->put('/cuentas/4', $this->formulario($valeria->fresh(), ['activo' => '1']))
            ->assertSessionHasNoErrors();
        $this->assertTrue($valeria->fresh()->activo);

        // Sus clientes no cambian (D4).
        $this->assertSame(3, $valeria->clientes()->count());
    }

    public function test_a2_21_el_administrador_no_se_desactiva_ni_se_quita_el_rol(): void
    {
        $alicia = $this->alicia();

        $this->actingAs($alicia)->put('/cuentas/1', $this->formulario($alicia, ['activo' => '0']))
            ->assertSessionHasErrors(['activo' => 'Usted no puede desactivar su propia cuenta.']);

        $this->actingAs($alicia)->put('/cuentas/1', $this->formulario($alicia, ['rol' => 'supervisor']))
            ->assertSessionHasErrors(['rol' => 'Usted no puede quitarse su propio rol de administrador.']);

        $alicia->refresh();
        $this->assertSame('administrador', $alicia->rol);
        $this->assertTrue($alicia->activo);
    }

    public function test_a2_22_las_cuentas_no_se_borran(): void
    {
        $this->actingAs($this->alicia())->delete('/cuentas/4')->assertMethodNotAllowed();
        $this->assertNotNull(User::find(4));
    }

    public function test_a2_24_cuenta_inexistente(): void
    {
        $this->actingAs($this->alicia())->get('/cuentas/999/editar')->assertNotFound();
        $this->actingAs($this->alicia())->get('/cuentas/abc/editar')->assertNotFound();
        $this->actingAs($this->alicia())->put('/cuentas/999', $this->nuevoVendedor())->assertNotFound();
    }

    // --- Reglas sobre otras filas ---------------------------------------------------------------

    public function test_a2_26_supervisor_con_vendedores_activos(): void
    {
        $sergio = User::find(2);

        $this->actingAs($this->alicia())->put('/cuentas/2', $this->formulario($sergio, ['activo' => '0']))
            ->assertSessionHasErrors(['activo' => 'Reasigne primero a los vendedores activos de este supervisor.']);
        $this->assertTrue($sergio->fresh()->activo);

        $supervisora = User::factory()->supervisor()->create();
        User::factory()->vendedor($supervisora)->inactivo()->create();

        $this->actingAs($this->alicia())->put("/cuentas/{$supervisora->id}", $this->formulario($supervisora, ['activo' => '0']))
            ->assertSessionHasNoErrors();
        $this->assertFalse($supervisora->fresh()->activo);
    }

    public function test_a2_27_cambio_de_rol_con_dependientes(): void
    {
        $this->actingAs($this->alicia())->put('/cuentas/3', $this->formulario(User::find(3), ['rol' => 'administrador']))
            ->assertSessionHasErrors(['rol' => 'Reasigne primero a los vendedores de este supervisor.']);
        $this->assertSame('supervisor', User::find(3)->rol);

        $this->actingAs($this->alicia())->put('/cuentas/4', $this->formulario(User::find(4), ['rol' => 'supervisor']))
            ->assertSessionHasErrors(['rol' => 'Reasigne o libere primero los clientes de este vendedor.']);
        $this->assertSame('vendedor', User::find(4)->rol);

        $sinClientes = User::factory()->vendedor(User::find(2))->create();
        $this->actingAs($this->alicia())->put("/cuentas/{$sinClientes->id}", $this->formulario($sinClientes, ['rol' => 'supervisor']))
            ->assertSessionHasNoErrors();
        $sinClientes->refresh();
        $this->assertSame('supervisor', $sinClientes->rol);
        $this->assertNull($sinClientes->supervisor_id);
    }

    public function test_a2_28_siempre_queda_un_administrador_activo(): void
    {
        $alicia = $this->alicia();
        $berta = User::factory()->administrador()->create(['name' => 'Berta Admin']);

        // Con dos administradoras activas, una puede desactivar a la otra.
        $this->actingAs($berta)->put('/cuentas/1', $this->formulario($alicia, ['activo' => '0']))
            ->assertSessionHasNoErrors();
        $this->assertFalse($alicia->fresh()->activo);

        // Carrera simulada: Berta ya pasó el middleware cuando otra transacción la desactivó. Ya bloqueados
        // los administradores, el cambio dejaría 0 activos y se rechaza.
        DB::table('users')->where('id', 1)->update(['activo' => true]);
        DB::table('users')->where('id', $berta->id)->update(['activo' => false]);

        $this->actingAs($berta)->put('/cuentas/1', $this->formulario($alicia->fresh(), ['activo' => '0']))
            ->assertSessionHasErrors(['activo' => 'Debe quedar al menos un administrador activo.']);
        $this->assertTrue($alicia->fresh()->activo);

        $this->actingAs($berta)->put('/cuentas/1', $this->formulario($alicia->fresh(), ['rol' => 'supervisor']))
            ->assertSessionHasErrors(['rol' => 'Debe quedar al menos un administrador activo.']);
        $this->assertSame('administrador', $alicia->fresh()->rol);
    }

    public function test_a2_28_los_administradores_se_bloquean_antes_de_decidir(): void
    {
        $berta = User::factory()->administrador()->create();
        $consultas = [];
        DB::listen(function ($consulta) use (&$consultas) {
            $consultas[] = strtolower($consulta->sql);
        });

        $this->actingAs($berta)->put('/cuentas/1', $this->formulario($this->alicia(), ['activo' => '0']));

        $bloqueoAdministradores = collect($consultas)->search(fn ($sql) => str_contains($sql, 'from `users`')
            && str_contains($sql, '`rol` = ?') && str_contains($sql, 'for update'));
        $actualizacion = collect($consultas)->search(fn ($sql) => str_starts_with($sql, 'update `users`'));

        $this->assertNotFalse($bloqueoAdministradores, 'Se bloquean los administradores activos');
        $this->assertNotFalse($actualizacion);
        $this->assertLessThan($actualizacion, $bloqueoAdministradores);
    }

    // --- Base de pruebas ------------------------------------------------------------------------

    public function test_a2_29_las_pruebas_corren_en_mysql_de_pruebas(): void
    {
        $this->assertSame('mysql', DB::getDriverName());
        $this->assertSame('crm_belleza_test', DB::connection()->getDatabaseName());
        $this->assertSame(7, User::whereIn('email', ['admin@crm.test', 'sergio@crm.test', 'sandra@crm.test',
            'valeria@crm.test', 'diego@crm.test', 'carlos@crm.test', 'ivan@crm.test'])->count());
    }
}
