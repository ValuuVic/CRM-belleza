<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Routing\Route as Ruta;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ViewErrorBag;
use Illuminate\Testing\TestResponse;
use ReflectionMethod;
use ReflectionNamedType;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * A7 — Validación y pruebas del panel (docs/plan.md A7; L7, CLAUDE.md §5).
 *
 * Revisa el panel completo, no una fase: recorre las rutas registradas para que una ruta nueva sin
 * FormRequest, con mensajes que no están en español o sin control de rol haga fallar la prueba.
 * Cuentas de VerificacionSeeder: Alicia (1, administradora), Sergio (2, supervisor), Valeria (4, vendedora).
 */
class A7ValidacionTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Rutas de escritura que no reciben datos del formulario (solo el id de la ruta o nada), con el motivo.
     */
    private const SIN_DATOS = [
        'logout' => 'cierra la sesión; no recibe datos',
        'verification.send' => 'reenvía el correo de verificación de Breeze; no recibe datos',
        'clientes.destroy' => 'solo el id de la ruta; las reglas (sin oportunidades, 1451) están en AsignacionClientes::eliminar',
    ];

    /** Palabras que delatan un mensaje en inglés o una clave de traducción sin traducir. */
    private const INGLES = '/\b(the|field|must|required|invalid|match(es)?|characters|confirmation|password|selected|already|been taken)\b/i';

    private const CLAVE_SIN_TRADUCIR = '/^[a-z_]+(\.[a-z_]+)+$/';

    private function usuario(int $id): User
    {
        return User::find($id);
    }

    /**
     * Petición como $quien o, con null, sin sesión. actingAs() deja al usuario autenticado durante el
     * resto de la prueba, así que para pedir sin sesión hay que olvidar los guards y la sesión.
     */
    private function como(?int $quien): static
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();

        return $quien ? $this->actingAs($this->usuario($quien)) : $this;
    }

    /**
     * Rutas del panel que escriben (POST, PUT, PATCH, DELETE) con su controlador y método.
     *
     * @return array<string, Ruta>
     */
    private function rutasDeEscritura(): array
    {
        $rutas = [];
        foreach (Route::getRoutes() as $ruta) {
            $escribe = array_intersect($ruta->methods(), ['POST', 'PUT', 'PATCH', 'DELETE']);
            $accion = $ruta->getActionName();
            if ($escribe && str_starts_with($accion, 'App\\Http\\Controllers\\')) {
                $rutas[$ruta->getName() ?? implode('|', $ruta->methods()).' '.$ruta->uri()] = $ruta;
            }
        }

        return $rutas;
    }

    /**
     * Todos los mensajes de error de la última respuesta, de todas las bolsas.
     *
     * @return array<int, string>
     */
    private function mensajes(TestResponse $respuesta): array
    {
        $errores = $respuesta->getSession()?->get('errors');

        if ($errores instanceof ViewErrorBag) {
            return collect($errores->getBags())->flatMap(fn ($bolsa) => $bolsa->all())->values()->all();
        }

        // Según cómo se guardó la sesión de prueba, la bolsa llega como arreglo: [bolsa => [messages => …]].
        return collect(is_array($errores) ? $errores : [])
            ->flatMap(fn ($bolsa) => collect($bolsa['messages'] ?? [])->flatten())->values()->all();
    }

    /**
     * Envíos inválidos de cada formulario del panel: [quién (null = sin sesión), método, ruta, datos].
     *
     * @return array<string, array{0: ?int, 1: string, 2: string, 3: array<string, mixed>}>
     */
    private function enviosInvalidos(): array
    {
        return [
            'login' => [null, 'post', '/login', ['email' => 'no-es-correo', 'password' => '']],
            'login con clave mala' => [null, 'post', '/login', ['email' => 'admin@crm.test', 'password' => 'clave-equivocada']],
            'profile.update' => [1, 'patch', '/profile', ['name' => '']],
            'password.update vacío' => [1, 'put', '/password', []],
            'password.update inválido' => [1, 'put', '/password', ['current_password' => 'mala', 'password' => 'corta', 'password_confirmation' => 'otra']],
            'password.confirm vacío' => [1, 'post', '/confirm-password', ['password' => '']],
            'password.confirm incorrecta' => [1, 'post', '/confirm-password', ['password' => 'clave-equivocada']],
            'cuentas.store' => [1, 'post', '/cuentas', ['name' => '', 'email' => 'x', 'password' => 'a', 'rol' => 'jefe', 'supervisor_id' => 'z']],
            'cuentas.update' => [1, 'put', '/cuentas/4', ['name' => '', 'email' => 'x', 'password' => 'a', 'rol' => 'vendedor', 'supervisor_id' => '']],
            'productos.store' => [1, 'post', '/productos', ['nombre' => '', 'precio' => '10.999', 'stock' => '-1']],
            'productos.update' => [1, 'put', '/productos/2', ['nombre' => '', 'precio' => '0', 'stock' => 'abc']],
            'clientes.store' => [1, 'post', '/clientes', ['nombre' => '', 'nit' => '45218170', 'telefono' => '15551234', 'correo' => 'mal']],
            'clientes.update' => [1, 'put', '/clientes/1', ['nombre' => '', 'nit' => '', 'telefono' => '', 'correo' => 'mal']],
            'clientes.asignacion.update' => [1, 'put', '/clientes/16/asignacion', []],
            'clientes.asignacion.destroy' => [1, 'delete', '/clientes/1/asignacion', []],
            'clientes.destroy (regla de negocio)' => [1, 'delete', '/clientes/1', []],
        ];
    }

    // --- A7-01: FormRequest en todos los formularios ----------------------------------------------

    public function test_a7_01_cada_ruta_que_recibe_datos_valida_con_un_form_request(): void
    {
        $sinFormRequest = [];

        foreach ($this->rutasDeEscritura() as $nombre => $ruta) {
            if (array_key_exists($nombre, self::SIN_DATOS)) {
                continue;
            }

            [$clase, $metodo] = explode('@', $ruta->getActionName());
            $usaFormRequest = collect((new ReflectionMethod($clase, $metodo))->getParameters())
                ->contains(fn ($p) => $p->getType() instanceof ReflectionNamedType
                    && is_subclass_of($p->getType()->getName(), FormRequest::class));

            if (! $usaFormRequest) {
                $sinFormRequest[] = "$nombre ($clase@$metodo)";
            }
        }

        $this->assertSame([], $sinFormRequest, 'Rutas que reciben datos sin FormRequest');
        $this->assertNotEmpty($this->rutasDeEscritura());
        // Las excepciones existen de verdad (si una ruta cambia de nombre, se revisa la lista).
        foreach (array_keys(self::SIN_DATOS) as $nombre) {
            $this->assertTrue(Route::has($nombre), "La excepción $nombre ya no existe");
        }
    }

    // --- A7-02: mensajes en español, tratando de usted --------------------------------------------

    public function test_a7_02_los_mensajes_de_error_estan_en_espanol(): void
    {
        $revisados = 0;

        foreach ($this->enviosInvalidos() as $caso => [$quien, $metodo, $ruta, $datos]) {
            $respuesta = $this->como($quien)->from('/dashboard')->{$metodo}($ruta, $datos);
            $mensajes = $this->mensajes($respuesta);

            $this->assertNotEmpty($mensajes, "$caso debe responder con mensajes");
            foreach ($mensajes as $mensaje) {
                $this->assertDoesNotMatchRegularExpression(self::CLAVE_SIN_TRADUCIR, $mensaje, "$caso: clave sin traducir");
                $this->assertDoesNotMatchRegularExpression(self::INGLES, $mensaje, "$caso: «{$mensaje}» parece estar en inglés");
                $this->assertMatchesRegularExpression('/[.»]$/u', $mensaje, "$caso: «{$mensaje}» debe ser una oración completa");
                $revisados++;
            }
        }

        // Ejemplos concretos de los formularios corregidos en A7.
        $this->flushSession();
        $this->actingAs($this->usuario(1))->from('/profile')->put('/password', [])
            ->assertSessionHasErrorsIn('updatePassword', [
                'current_password' => 'Escriba su contraseña actual.',
                'password' => 'Escriba la contraseña nueva.',
            ]);
        $this->flushSession();
        $this->actingAs($this->usuario(1))->from('/profile')
            ->put('/password', ['current_password' => 'mala', 'password' => 'corta', 'password_confirmation' => 'otra'])
            ->assertSessionHasErrorsIn('updatePassword', ['current_password' => 'La contraseña actual no es correcta.']);
        $this->flushSession();
        $this->actingAs($this->usuario(1))->from('/confirm-password')->post('/confirm-password', ['password' => 'clave-equivocada'])
            ->assertSessionHasErrors(['password' => 'La contraseña no es correcta.']);

        $this->assertGreaterThan(30, $revisados);
    }

    // --- A7-03: lo escrito se conserva, sin las contraseñas ---------------------------------------

    public function test_a7_03_los_formularios_conservan_lo_escrito_salvo_las_contrasenas(): void
    {
        $casos = [
            [null, 'post', '/login', ['email' => 'admin@crm.test', 'password' => 'clave-equivocada']],
            [1, 'post', '/cuentas', ['name' => 'Nueva', 'email' => 'mal', 'password' => 'secreta-123', 'password_confirmation' => 'otra', 'rol' => 'vendedor', 'supervisor_id' => '2']],
            [1, 'put', '/password', ['current_password' => 'mala', 'password' => 'secreta-123', 'password_confirmation' => 'otra']],
            [1, 'post', '/productos', ['nombre' => 'Rubor', 'precio' => '10.999', 'stock' => '5']],
            [1, 'post', '/clientes', ['nombre' => 'Tienda', 'nit' => '45218170', 'telefono' => '44441234', 'correo' => 'a@b.gt']],
        ];

        foreach ($casos as [$quien, $metodo, $ruta, $datos]) {
            $respuesta = $this->como($quien)->from('/dashboard')->{$metodo}($ruta, $datos);
            $anterior = $respuesta->getSession()->get('_old_input', []);

            foreach ($datos as $campo => $valor) {
                if (in_array($campo, ['password', 'password_confirmation', 'current_password'], true)) {
                    $this->assertArrayNotHasKey($campo, $anterior, "$ruta no debe devolver $campo al formulario");
                } else {
                    $this->assertSame($valor, $anterior[$campo] ?? null, "$ruta debe conservar $campo");
                }
            }
        }
    }

    // --- A7-04: permisos de administrador y supervisor en todas las páginas -----------------------

    public function test_a7_04_permisos_por_rol_en_todas_las_paginas_del_panel(): void
    {
        $ejemplos = ['user' => 4, 'producto' => 2, 'cliente' => 1, 'oportunidad' => 1];
        $revisadas = 0;

        foreach (Route::getRoutes() as $ruta) {
            $middleware = $ruta->gatherMiddleware();
            if (! in_array('GET', $ruta->methods(), true) || ! in_array('auth', $middleware, true)
                || ! collect($middleware)->contains(fn ($m) => str_starts_with($m, 'rol:'))) {
                continue;
            }

            $url = '/'.ltrim(preg_replace_callback('/\{(\w+)\??\}/', fn ($m) => $ejemplos[$m[1]], $ruta->uri()), '/');
            $soloAdministrador = in_array('rol:administrador', $middleware, true);

            $this->assertSame(302, $this->como(null)->get($url)->status(), "$url sin sesión");
            $this->assertSame(200, $this->como(1)->get($url)->status(), "$url como administradora");
            $this->assertSame($soloAdministrador ? 403 : 200, $this->como(2)->get($url)->status(), "$url como supervisor");
            // Un vendedor nunca tiene sesión en el panel (el login la rechaza, A2-04). Si la tuviera,
            // cuenta.vigente la cierra; en las rutas con {cliente} u {oportunidad} el alcance vacío ya da
            // 404 antes. En ningún caso ve la página.
            $vendedor = $this->como(4)->get($url);
            $alLogin = $vendedor->status() === 302
                && parse_url((string) $vendedor->headers->get('Location'), PHP_URL_PATH) === '/login';
            $this->assertTrue($alLogin || $vendedor->status() === 404, "$url como vendedora: {$vendedor->status()}");
            $revisadas++;
        }

        $this->assertGreaterThanOrEqual(13, $revisadas, 'Se revisaron todas las páginas del panel');
    }

    // --- A7-05: seguridad de vistas y consultas ---------------------------------------------------

    public function test_a7_05_vistas_escapadas_y_sql_crudo_sin_datos_del_usuario(): void
    {
        foreach (File::allFiles(resource_path('views')) as $vista) {
            $this->assertStringNotContainsString('{!!', $vista->getContents(), "{$vista->getRelativePathname()} no debe usar {!! !!}");
        }

        $crudas = 0;
        foreach (File::allFiles(app_path()) as $archivo) {
            $codigo = $archivo->getContents();
            $this->assertStringNotContainsString('DB::unprepared', $codigo, $archivo->getRelativePathname());

            preg_match_all('/(?:selectRaw|whereRaw|orderByRaw|havingRaw|groupByRaw|DB::raw|DB::select|DB::statement)\(([^;]*?)\)(?:->|;|\s*$)/m', $codigo, $llamadas);
            foreach ($llamadas[1] as $argumento) {
                // Solo texto fijo o constantes de la clase (self::…); nunca variables ni interpolación.
                $this->assertStringNotContainsString('$', $argumento, "{$archivo->getRelativePathname()}: SQL crudo con una variable: $argumento");
                $crudas++;
            }
        }
        $this->assertGreaterThan(0, $crudas, 'La revisión encontró las consultas crudas del panel');
    }

    // --- A7-06: pantallas de Breeze en español ----------------------------------------------------

    public function test_a7_06_las_pantallas_de_breeze_estan_en_espanol(): void
    {
        $ingles = ['Log in', 'Remember me', 'Password', 'Profile Information', 'Update Password', 'Current Password',
            'New Password', 'Confirm Password', '>Save<', 'Log Out', 'Dashboard', "You're logged in", 'This is a secure area'];

        $pantallas = [
            [null, '/login'],
            [1, '/dashboard'],
            [1, '/profile'],
            [1, '/confirm-password'],
            [2, '/clientes'],
        ];

        foreach ($pantallas as [$quien, $url]) {
            // Sin los comentarios HTML de Breeze (<!-- Password -->), que no se ven en pantalla.
            $html = preg_replace('/<!--.*?-->/s', '', $this->como($quien)->get($url)->assertOk()->getContent());
            foreach ($ingles as $texto) {
                $this->assertStringNotContainsString($texto, $html, "$url todavía muestra «{$texto}»");
            }
        }

        $this->como(null)->get('/login')->assertSee('Iniciar sesión')->assertSee('Contraseña')->assertSee('Recordarme');
        $this->como(1)->get('/profile')
            ->assertSee('Cambiar la contraseña')->assertSee('Contraseña actual')->assertSee('Guardar');
    }
}
