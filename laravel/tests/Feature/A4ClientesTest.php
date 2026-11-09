<?php

namespace Tests\Feature;

use App\Models\Cliente;
use App\Models\User;
use App\Services\AsignacionClientes;
use Database\Seeders\SectorSeeder;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Criterios A4-01 a A4-29 de docs/specs/A4-clientes.md (A4-09 está en tests/Unit/NitTest y TelefonoTest).
 *
 * VerificacionSeeder: Alicia (1, administradora); Sergio (2), supervisor de Valeria (4: clientes 1-3) y
 * Diego (5: 4-5); Sandra (3), supervisora de Carlos (6: 6-14, 9 de 10) e Iván (7, desactivado: 15).
 * Disponibles: 16-21. Cliente 1: op. 1 ganada, 4 negociación, 7 prospecto y actividad 1. Cliente 3: op. 3
 * ganada y 6 perdida. Cliente 7: sin oportunidades ni actividades.
 * SectorSeeder (cuando se carga): Lucía, supervisora de Andrea (5 clientes) y Kevin (4), y 3 disponibles.
 */
class A4ClientesTest extends TestCase
{
    use RefreshDatabase;

    private const CAMBIO = 'El cliente cambió mientras usted trabajaba. Recargue la página e inténtelo de nuevo.';

    private function usuario(int $id): User
    {
        return User::find($id);
    }

    private function alicia(): User
    {
        return $this->usuario(1);
    }

    private function sergio(): User
    {
        return $this->usuario(2);
    }

    private function sandra(): User
    {
        return $this->usuario(3);
    }

    /**
     * @param  array<string, mixed>  $cambios
     * @return array<string, mixed>
     */
    private function nuevo(array $cambios = []): array
    {
        return array_merge([
            'nombre' => 'Perfumería Las Flores',
            'nit' => 'CF',
            'telefono' => '4444-1234',
            'correo' => '',
            'vendedor_id' => '',
        ], $cambios);
    }

    /**
     * Cuerpo del formulario de datos de $cliente, con los cambios de $cambios.
     *
     * @param  array<string, mixed>  $cambios
     * @return array<string, mixed>
     */
    private function datos(int $id, array $cambios = []): array
    {
        $c = Cliente::find($id);

        return array_merge(['nombre' => $c->nombre, 'nit' => $c->nit ?? 'CF', 'telefono' => $c->telefono, 'correo' => $c->correo ?? ''], $cambios);
    }

    /**
     * Asigna o reasigna como lo hace el formulario: vendedor_actual es el dueño que muestra la página
     * ($visto; null = se vio disponible; false = el dueño actual, como si se acabara de abrir).
     */
    private function asignar(User $quien, int $cliente, int $vendedor, int|null|false $visto = false): TestResponse
    {
        $visto = $visto === false ? Cliente::find($cliente)?->vendedor_id : $visto;

        return $this->actingAs($quien)->put("/clientes/$cliente/asignacion", ['vendedor_id' => $vendedor, 'vendedor_actual' => $visto ?? '']);
    }

    private function liberar(User $quien, int $cliente, int|null|false $visto = false): TestResponse
    {
        $visto = $visto === false ? Cliente::find($cliente)?->vendedor_id : $visto;

        return $this->actingAs($quien)->delete("/clientes/$cliente/asignacion", ['vendedor_actual' => $visto ?? '']);
    }

    /**
     * Ids de los clientes que muestra la lista.
     *
     * @return array<int, int>
     */
    private function idsDeLaLista(User $quien, string $consulta = ''): array
    {
        return $this->actingAs($quien)->get('/clientes'.$consulta)->assertOk()
            ->viewData('clientes')->pluck('id')->sort()->values()->all();
    }

    private function cartera(int $vendedor): int
    {
        return Cliente::where('vendedor_id', $vendedor)->count();
    }

    private function idPorNombre(string $nombre): int
    {
        return Cliente::where('nombre', $nombre)->value('id');
    }

    /**
     * Ventas, total y pronóstico de un vendedor en un mes (misma consulta que A1-14).
     */
    private function cifras(int $vendedor, string $mes): string
    {
        $inicio = "$mes-01 06:00:00";
        $fin = date('Y-m-01 06:00:00', strtotime("$mes-01 +1 month"));
        $probabilidad = "CASE o.etapa WHEN 'prospecto' THEN 10 WHEN 'calificado' THEN 25 WHEN 'propuesta' THEN 50 WHEN 'negociacion' THEN 75 END";

        $r = DB::selectOne(
            "SELECT
               (SELECT COUNT(*) FROM oportunidades o
                 WHERE o.etapa = 'ganada' AND o.fecha_cierre >= ? AND o.fecha_cierre < ? AND o.vendedor_id = ?) AS ventas,
               (SELECT COALESCE(SUM(l.cantidad * l.precio_unitario), 0) FROM oportunidades o
                 JOIN oportunidad_productos l ON l.oportunidad_id = o.id
                 WHERE o.etapa = 'ganada' AND o.fecha_cierre >= ? AND o.fecha_cierre < ? AND o.vendedor_id = ?) AS total,
               (SELECT ROUND(COALESCE(SUM(l.cantidad * l.precio_unitario * $probabilidad / 100), 0), 2)
                 FROM oportunidades o JOIN oportunidad_productos l ON l.oportunidad_id = o.id
                 WHERE o.etapa IN ('prospecto', 'calificado', 'propuesta', 'negociacion') AND o.vendedor_id = ?) AS pronostico",
            [$inicio, $fin, $vendedor, $inicio, $fin, $vendedor, $vendedor]
        );

        return "$r->ventas|$r->total|$r->pronostico";
    }

    // --- Visibilidad ----------------------------------------------------------------------------

    public function test_a4_01_el_administrador_ve_todos(): void
    {
        $this->assertSame(range(1, 21), $this->idsDeLaLista($this->alicia()));

        $this->actingAs($this->alicia())->get('/clientes')
            ->assertSeeInOrder(['Comercial El Quetzal', '4521817K', '55551234', 'compras@elquetzal.test', 'Valeria López'])
            ->assertSeeInOrder(['María Coyoy', 'CF', '41234567']);

        $this->seed(SectorSeeder::class);
        $this->assertSame(33, $this->actingAs($this->alicia())->get('/clientes')->viewData('clientes')->total());
    }

    public function test_a4_02_el_supervisor_ve_su_equipo_y_los_disponibles(): void
    {
        $this->assertSame([...range(1, 5), ...range(16, 21)], $this->idsDeLaLista($this->sergio()));
        $this->assertSame(range(6, 21), $this->idsDeLaLista($this->sandra()));

        $this->seed(SectorSeeder::class);
        $sector = Cliente::whereIn('nombre', ['Boutique Encanto', 'Karla Sic (maquilladora)', 'Barbería y Salón Los Altos'])
            ->pluck('id')->all();
        $this->assertSame(collect([...range(1, 5), ...range(16, 21), ...$sector])->sort()->values()->all(), $this->idsDeLaLista($this->sergio()));

        // P3: el supervisor ve NIT y teléfono de los disponibles.
        $this->actingAs($this->sergio())->get('/clientes')->assertSeeInOrder(['Clínica San Rafael', '8889990K', '77672003']);
    }

    public function test_a4_03_cliente_de_otro_equipo_responde_404(): void
    {
        $antes = Cliente::find(6)->toArray();

        $this->actingAs($this->sergio())->get('/clientes/6/editar')->assertNotFound();
        $this->actingAs($this->sergio())->put('/clientes/6', $this->datos(6, ['nombre' => 'Cambiado']))->assertNotFound();
        $this->asignar($this->sergio(), 6, 4)->assertNotFound();
        $this->liberar($this->sergio(), 6)->assertNotFound();
        $this->assertSame($antes, Cliente::find(6)->toArray());

        $this->seed(SectorSeeder::class);
        $divina = $this->idPorNombre('Salón Belleza Divina');
        $lucia = User::where('email', 'lucia@crm.test')->first();

        $this->actingAs($this->sergio())->get("/clientes/$divina/editar")->assertNotFound();
        $this->actingAs($lucia)->get('/clientes/1/editar')->assertNotFound();
        $this->actingAs($lucia)->get("/clientes/$divina/editar")->assertOk();
    }

    public function test_a4_04_sin_sesion_y_cliente_inexistente(): void
    {
        foreach (['/clientes', '/clientes/crear', '/clientes/1/editar'] as $ruta) {
            $this->get($ruta)->assertRedirect('/login');
        }

        $this->actingAs($this->alicia())->get('/clientes/999/editar')->assertNotFound();
    }

    // --- Lista, búsqueda y filtros --------------------------------------------------------------

    public function test_a4_05_busqueda_por_nombre_o_nit(): void
    {
        $this->assertSame([1], $this->idsDeLaLista($this->alicia(), '?q=quetzal'));
        $this->assertSame([1], $this->idsDeLaLista($this->alicia(), '?q='.urlencode('4521817-k')));
        $this->assertSame([1], $this->idsDeLaLista($this->alicia(), '?q='.urlencode('452 1817K')));
        $this->assertSame([2], $this->idsDeLaLista($this->alicia(), '?q=ferreteria'), 'sin distinguir acentos');

        // Los comodines de LIKE se buscan como texto.
        $this->assertSame([], $this->idsDeLaLista($this->alicia(), '?q='.urlencode('%')));
        $this->assertSame([], $this->idsDeLaLista($this->alicia(), '?q=_'));

        $this->actingAs($this->alicia())->get('/clientes?q='.str_repeat('a', 101))
            ->assertRedirect('/clientes')
            ->assertSessionHasErrors(['q' => 'La búsqueda no debe superar los 100 caracteres.']);
    }

    public function test_a4_06_filtros_por_vendedor_y_sin_asignar(): void
    {
        $this->assertSame(range(6, 14), $this->idsDeLaLista($this->alicia(), '?vendedor=6'));
        $this->assertSame(range(16, 21), $this->idsDeLaLista($this->alicia(), '?vendedor=sin_asignar'));
        $this->assertSame([14], $this->idsDeLaLista($this->alicia(), '?vendedor=6&q=tax'));

        // Sergio solo tiene a Valeria y Diego en el filtro; Carlos escrito a mano da una lista vacía.
        $vendedores = $this->actingAs($this->sergio())->get('/clientes')->viewData('vendedores')->pluck('id')->all();
        $this->assertSame([5, 4], $vendedores);
        $this->assertSame([], $this->idsDeLaLista($this->sergio(), '?vendedor=6'));

        // Los filtros se conservan en los enlaces de página.
        $pagina = $this->actingAs($this->alicia())->get('/clientes?q=a&vendedor=6')->viewData('clientes')->url(2);
        $this->assertStringContainsString('q=a', $pagina);
        $this->assertStringContainsString('vendedor=6', $pagina);
    }

    public function test_a4_07_cartera_y_vendedor_inactivo(): void
    {
        $this->actingAs($this->alicia())->get('/clientes')
            ->assertSee('Carlos Ajú · 9 de 10')
            ->assertSee('Valeria López · 3 de 10')
            ->assertSeeInOrder(['Hotel Los Pinos', 'Iván Toj · 1 de 10', '(vendedor inactivo)']);
    }

    // --- Alta y edición -------------------------------------------------------------------------

    public function test_a4_08_mismas_reglas_que_la_api(): void
    {
        $this->actingAs($this->alicia())->post('/clientes', $this->nuevo(['nit' => '0-450', 'telefono' => '+502 4444-1234']))
            ->assertSessionHasNoErrors()->assertRedirect('/clientes');

        $cliente = Cliente::where('nombre', 'Perfumería Las Flores')->firstOrFail();
        $this->assertSame('450', $cliente->nit);
        $this->assertSame('44441234', $cliente->telefono);
        $this->assertNull($cliente->vendedor_id);

        $this->actingAs($this->alicia())->post('/clientes', $this->nuevo(['nombre' => 'Otro CF', 'nit' => 'cf', 'telefono' => '44441235']))
            ->assertSessionHasNoErrors();
        $this->assertNull(Cliente::where('nombre', 'Otro CF')->value('nit'));
        $this->assertGreaterThan(1, Cliente::whereNull('nit')->count());
    }

    public function test_a4_10_nit_o_telefono_invalido(): void
    {
        $casos = [
            ['nit', '', 'Ingrese el NIT o CF para consumidor final.'],
            ['nit', '45218170', 'El NIT no es válido; revise el número y el dígito verificador, o use CF.'],
            ['nit', '1234567890120', 'El NIT no es válido; revise el número y el dígito verificador, o use CF.'],
            ['telefono', '', 'Ingrese el teléfono del cliente.'],
            ['telefono', '15551234', 'El teléfono debe tener 8 dígitos y comenzar con un dígito del 2 al 9.'],
            ['telefono', '5555123', 'El teléfono debe tener 8 dígitos y comenzar con un dígito del 2 al 9.'],
        ];

        foreach ($casos as [$campo, $valor, $mensaje]) {
            $this->actingAs($this->alicia())->post('/clientes', $this->nuevo([$campo => $valor]))
                ->assertSessionHasErrors([$campo => $mensaje]);
        }

        $this->assertSame(21, Cliente::count());
    }

    public function test_a4_11_nit_o_telefono_repetido(): void
    {
        $this->actingAs($this->alicia())->post('/clientes', $this->nuevo(['nit' => '4521817-k']))
            ->assertSessionHasErrors(['nit' => 'Ya existe un cliente con ese NIT.']);
        $this->actingAs($this->alicia())->post('/clientes', $this->nuevo(['telefono' => '+502 5555-1234']))
            ->assertSessionHasErrors(['telefono' => 'Ya existe un cliente con ese teléfono.']);
        $this->assertSame(21, Cliente::count());

        $this->actingAs($this->alicia())->put('/clientes/2', $this->datos(2, ['nit' => '4521817-k', 'telefono' => '+502 5555-1234']))
            ->assertSessionHasErrors(['nit' => 'Ya existe un cliente con ese NIT.', 'telefono' => 'Ya existe un cliente con ese teléfono.']);
        $this->assertSame('98765434', Cliente::find(2)->nit);

        $this->actingAs($this->alicia())->put('/clientes/1', $this->datos(1, ['nombre' => 'Comercial El Quetzal S.A.']))
            ->assertSessionHasNoErrors();
        $this->assertSame('Comercial El Quetzal S.A.', Cliente::find(1)->nombre);
    }

    public function test_a4_12_el_indice_unico_decide_el_nit_repetido(): void
    {
        // Carrera simulada: otro cliente con el mismo NIT se guarda entre la validación y el INSERT.
        Cliente::creating(function (Cliente $cliente) {
            DB::table('clientes')->insert(['nombre' => 'Desde la API', 'nit' => $cliente->nit, 'telefono' => '44449999']);
        });

        $this->actingAs($this->alicia())->from('/clientes/crear')->post('/clientes', $this->nuevo(['nit' => '450']))
            ->assertRedirect('/clientes/crear')
            ->assertSessionHasErrors(['nit' => 'Ya existe un cliente con ese NIT.'])
            ->assertSessionHasInput('nombre', 'Perfumería Las Flores');

        $this->assertSame(21, Cliente::count());
    }

    public function test_a4_12_el_indice_unico_decide_el_telefono_repetido(): void
    {
        Cliente::updating(function (Cliente $cliente) {
            DB::table('clientes')->insert(['nombre' => 'Desde la API', 'nit' => null, 'telefono' => $cliente->telefono]);
        });

        $this->actingAs($this->alicia())->from('/clientes/2/editar')->put('/clientes/2', $this->datos(2, ['telefono' => '44449999']))
            ->assertRedirect('/clientes/2/editar')
            ->assertSessionHasErrors(['telefono' => 'Ya existe un cliente con ese teléfono.']);

        $this->assertSame('77612345', Cliente::find(2)->telefono);
    }

    public function test_a4_13_nombre_y_correo(): void
    {
        foreach (['' => 'Ingrese el nombre del cliente.', '   ' => 'Ingrese el nombre del cliente.',
            str_repeat('a', 151) => 'El nombre no debe superar los 150 caracteres.'] as $nombre => $mensaje) {
            $this->actingAs($this->alicia())->post('/clientes', $this->nuevo(['nombre' => $nombre]))
                ->assertSessionHasErrors(['nombre' => $mensaje]);
        }

        foreach (['no-es-correo', str_repeat('a', 141).'@correo.gt'] as $correo) {
            $this->actingAs($this->alicia())->post('/clientes', $this->nuevo(['correo' => $correo]))
                ->assertSessionHasErrors(['correo' => 'Ingrese un correo electrónico válido o deje el campo vacío.']);
        }
        $this->assertSame(21, Cliente::count());

        $this->actingAs($this->alicia())->post('/clientes', $this->nuevo(['nombre' => str_repeat('ñ', 150)]))
            ->assertSessionHasNoErrors();
        $this->assertNull(Cliente::where('nombre', str_repeat('ñ', 150))->value('correo'));
    }

    public function test_a4_14_el_supervisor_crea_y_edita_en_su_alcance(): void
    {
        $this->actingAs($this->sergio())->post('/clientes', $this->nuevo())->assertSessionHasNoErrors();
        $this->assertNull(Cliente::where('nombre', 'Perfumería Las Flores')->value('vendedor_id'));

        $this->actingAs($this->sergio())->post('/clientes', $this->nuevo(['nombre' => 'De Valeria', 'telefono' => '44441235', 'vendedor_id' => 4]))
            ->assertSessionHasNoErrors();
        $this->assertSame(4, Cliente::where('nombre', 'De Valeria')->value('vendedor_id'));

        $this->actingAs($this->sergio())->post('/clientes', $this->nuevo(['nombre' => 'De Carlos', 'telefono' => '44441236', 'vendedor_id' => 6]))
            ->assertSessionHasErrors(['vendedor_id' => 'Elija un vendedor activo de su equipo.']);
        $this->assertNull(Cliente::where('nombre', 'De Carlos')->first());

        $this->actingAs($this->sergio())->put('/clientes/1', $this->datos(1, ['correo' => 'nuevo@elquetzal.test']))->assertSessionHasNoErrors();
        $this->actingAs($this->sergio())->put('/clientes/16', $this->datos(16, ['nombre' => 'Agencia Cuatro Caminos S.A.']))->assertSessionHasNoErrors();
        $this->assertSame('nuevo@elquetzal.test', Cliente::find(1)->correo);
        $this->assertSame('Agencia Cuatro Caminos S.A.', Cliente::find(16)->nombre);
    }

    public function test_a4_15_mensajes_datos_conservados_y_campos_ignorados(): void
    {
        $invalido = $this->nuevo(['nombre' => 'Perfumería Las Flores', 'nit' => '45218170', 'telefono' => '15551234', 'correo' => 'mal']);

        // Se comprueba la pantalla antes que la sesión: assertSessionHasErrors consume los errores.
        $this->actingAs($this->alicia())->from('/clientes/crear')->post('/clientes', $invalido);
        $this->actingAs($this->alicia())->get('/clientes/crear')
            ->assertSeeInOrder(['value="Perfumería Las Flores"', 'value="45218170"', 'El NIT no es válido',
                'value="15551234"', 'El teléfono debe tener 8 dígitos', 'value="mal"', 'Ingrese un correo electrónico válido'], false);

        $this->actingAs($this->alicia())->put('/clientes/1', $this->datos(1, [
            'vendedor_id' => 5, 'id' => 99, 'created_at' => '2000-01-01 00:00:00',
        ]))->assertSessionHasNoErrors();

        $this->assertSame(4, Cliente::find(1)->vendedor_id);
        $this->assertNull(Cliente::find(99));
        $this->assertNotSame('2000-01-01', Cliente::find(1)->created_at->toDateString());
    }

    public function test_a4_16_texto_escapado(): void
    {
        $id = DB::table('clientes')->insertGetId(['nombre' => '<script>alert(1)</script>', 'nit' => null,
            'telefono' => '44441234', 'correo' => '<b>x</b>@y.test']);

        foreach (['/clientes', "/clientes/$id/editar"] as $ruta) {
            $this->actingAs($this->alicia())->get($ruta)->assertOk()
                ->assertSee('&lt;script&gt;alert(1)&lt;/script&gt;', false)
                ->assertDontSee('<script>alert(1)</script>', false)
                ->assertDontSee('<b>x</b>', false);
        }
    }

    // --- Asignar, reasignar y liberar -----------------------------------------------------------

    public function test_a4_17_asignar_un_cliente_disponible(): void
    {
        $this->asignar($this->alicia(), 16, 4)->assertSessionHasNoErrors()->assertRedirect('/clientes/16/editar');

        $this->assertSame(4, Cliente::find(16)->vendedor_id);
        $this->assertSame(4, $this->cartera(4));
        // Misma condición que GET /api/clientes de Valeria: clientes.vendedor_id = 4.
        $this->assertContains(16, Cliente::where('vendedor_id', 4)->pluck('id')->all());
    }

    public function test_a4_18_cartera_llena(): void
    {
        $this->asignar($this->alicia(), 16, 6)->assertSessionHasNoErrors();
        $this->assertSame(10, $this->cartera(6));

        $llena = 'La cartera de Carlos Ajú está llena (10 de 10). Libere o reasigne uno de sus clientes primero.';
        $this->asignar($this->alicia(), 17, 6)->assertSessionHasErrors(['vendedor_id' => $llena]);
        $this->asignar($this->alicia(), 1, 6)->assertSessionHasErrors(['vendedor_id' => $llena]);

        $this->assertSame(10, $this->cartera(6));
        $this->assertNull(Cliente::find(17)->vendedor_id);
        $this->assertSame(4, Cliente::find(1)->vendedor_id);
    }

    public function test_a4_19_solo_vendedores_activos_y_el_supervisor_en_su_equipo(): void
    {
        $deSuEquipo = 'Elija un vendedor activo de su equipo.';
        $this->asignar($this->sandra(), 16, 7)->assertSessionHasErrors(['vendedor_id' => $deSuEquipo]);
        $this->asignar($this->sergio(), 16, 6)->assertSessionHasErrors(['vendedor_id' => $deSuEquipo]);
        $this->asignar($this->sergio(), 1, 6)->assertSessionHasErrors(['vendedor_id' => $deSuEquipo]);

        foreach ([7, 2, 999] as $destino) {
            $this->asignar($this->alicia(), 16, $destino)->assertSessionHasErrors(['vendedor_id' => 'Elija un vendedor activo.']);
        }

        $this->assertNull(Cliente::find(16)->vendedor_id);
        $this->assertSame(4, Cliente::find(1)->vendedor_id);

        // Dentro de su equipo sí.
        $this->asignar($this->sandra(), 16, 6)->assertSessionHasNoErrors();
        $this->assertSame(6, Cliente::find(16)->vendedor_id);
    }

    public function test_a4_20_reasignar_mueve_solo_las_oportunidades_abiertas(): void
    {
        $this->asignar($this->alicia(), 1, 5)->assertSessionHasNoErrors();

        $this->assertSame(5, Cliente::find(1)->vendedor_id);
        $this->assertSame(2, $this->cartera(4));
        $this->assertSame(3, $this->cartera(5));

        $duenos = DB::table('oportunidades')->whereIn('id', [1, 4, 7])->orderBy('id')->pluck('vendedor_id', 'id')->all();
        $this->assertSame([1 => 4, 4 => 5, 7 => 5], $duenos);
        $this->assertSame(4, DB::table('actividades')->where('id', 1)->value('vendedor_id'));
        // Misma condición que GET /api/actividades de Diego: el cliente de la actividad es suyo.
        $this->assertSame(5, Cliente::find(DB::table('actividades')->where('id', 1)->value('cliente_id'))->vendedor_id);

        $this->assertSame('2|9250.00|450.00', $this->cifras(4, '2026-10'), 'Valeria octubre');
        $this->assertSame('1|6000.00|2175.38', $this->cifras(5, '2026-10'), 'Diego octubre');

        $this->asignar($this->alicia(), 1, 5)->assertSessionHasErrors(['vendedor_id' => 'El cliente ya está asignado a ese vendedor.']);
    }

    public function test_a4_21_liberar(): void
    {
        $this->liberar($this->alicia(), 1)->assertSessionHasErrors(['vendedor_id' => AsignacionClientes::MENSAJE_ABIERTAS]);
        $this->assertSame(4, Cliente::find(1)->vendedor_id);
        $this->assertSame(3, $this->cartera(4));

        $this->liberar($this->alicia(), 3)->assertSessionHasNoErrors()->assertRedirect('/clientes/3/editar');
        $this->assertNull(Cliente::find(3)->vendedor_id);
        $this->assertSame(2, $this->cartera(4));
        $this->assertSame([3 => 4, 6 => 4], DB::table('oportunidades')->whereIn('id', [3, 6])->orderBy('id')->pluck('vendedor_id', 'id')->all());
        $this->assertStringStartsWith('2|9250.00|', $this->cifras(4, '2026-10'));
    }

    public function test_a4_22_cliente_de_un_vendedor_desactivado(): void
    {
        $oportunidad = DB::table('oportunidades')->insertGetId(['cliente_id' => 15, 'vendedor_id' => 7,
            'titulo' => 'Pendiente de Iván', 'etapa' => 'propuesta', 'created_at' => now(), 'updated_at' => now()]);

        $this->actingAs($this->sandra())->get('/clientes')->assertSeeInOrder(['Hotel Los Pinos', '(vendedor inactivo)']);

        $this->asignar($this->sandra(), 15, 6)->assertSessionHasNoErrors();
        $this->assertSame(6, Cliente::find(15)->vendedor_id);
        $this->assertSame(10, $this->cartera(6));
        $this->assertSame(6, DB::table('oportunidades')->where('id', $oportunidad)->value('vendedor_id'));
    }

    // --- Eliminar -------------------------------------------------------------------------------

    public function test_a4_23_solo_el_administrador_elimina_y_sin_oportunidades(): void
    {
        $this->actingAs($this->sergio())->delete('/clientes/1')->assertForbidden();
        $this->actingAs($this->sandra())->delete('/clientes/7')->assertForbidden();
        $this->actingAs($this->sergio())->get('/clientes')->assertDontSee('Eliminar');
        $this->assertNotNull(Cliente::find(7));

        $this->actingAs($this->alicia())->delete('/clientes/7')->assertSessionHasNoErrors()->assertRedirect('/clientes');
        $this->assertNull(Cliente::find(7));
        $this->assertSame(8, $this->cartera(6));

        $this->actingAs($this->alicia())->delete('/clientes/1')
            ->assertSessionHasErrors(['cliente' => AsignacionClientes::MENSAJE_CON_OPORTUNIDADES]);
        $this->assertNotNull(Cliente::find(1));
    }

    public function test_a4_24_las_actividades_se_borran_en_cascada(): void
    {
        $id = DB::table('clientes')->insertGetId(['nombre' => 'Con actividades', 'vendedor_id' => 4, 'telefono' => '44441234']);
        foreach (['llamada', 'tarea'] as $tipo) {
            DB::table('actividades')->insert(['cliente_id' => $id, 'vendedor_id' => 4, 'tipo' => $tipo, 'descripcion' => 'Prueba']);
        }

        $this->actingAs($this->alicia())->delete("/clientes/$id")->assertSessionHasNoErrors();

        $this->assertNull(Cliente::find($id));
        $this->assertSame(0, DB::table('actividades')->where('cliente_id', $id)->count());
    }

    public function test_a4_25_el_1451_no_da_500(): void
    {
        // Carrera simulada: la API le crea una oportunidad entre la comprobación y el DELETE.
        Cliente::deleting(function (Cliente $cliente) {
            DB::table('oportunidades')->insert(['cliente_id' => $cliente->id, 'vendedor_id' => 6,
                'titulo' => 'Desde la API', 'etapa' => 'prospecto']);
        });

        $this->actingAs($this->alicia())->from('/clientes')->delete('/clientes/7')
            ->assertRedirect('/clientes')
            ->assertSessionHasErrors(['cliente' => AsignacionClientes::MENSAJE_CON_OPORTUNIDADES]);

        $this->assertNotNull(Cliente::find(7));
    }

    // --- Concurrencia ---------------------------------------------------------------------------

    public function test_a4_26_orden_de_bloqueos(): void
    {
        $consultas = [];
        DB::listen(function ($consulta) use (&$consultas) {
            $consultas[] = ['sql' => strtolower($consulta->sql), 'datos' => $consulta->bindings];
        });
        // DB::listen no registra los SAVEPOINT: el inicio de la transacción se marca con su evento.
        Event::listen(TransactionBeginning::class, function () use (&$consultas) {
            $consultas[] = ['sql' => '-- inicio de transacción', 'datos' => []];
        });

        $this->asignar($this->alicia(), 1, 5)->assertSessionHasNoErrors();

        $sql = array_column($consultas, 'sql');
        $posicion = fn (callable $f) => collect($sql)->search($f);

        $usuarios = $posicion(fn ($s) => str_contains($s, 'from `users` where `id` in') && str_contains($s, 'for update'));
        $cliente = $posicion(fn ($s) => str_contains($s, 'from `clientes`') && str_contains($s, 'for update'));
        $cartera = $posicion(fn ($s) => str_contains($s, 'count(*)') && str_contains($s, 'from `clientes`'));
        $oportunidades = $posicion(fn ($s) => str_contains($s, 'from `oportunidades`') && str_contains($s, 'for update'));
        $actualizacion = $posicion(fn ($s) => str_starts_with($s, 'update `oportunidades`'));
        $inicio = $posicion(fn ($s) => $s === '-- inicio de transacción');

        foreach (compact('inicio', 'usuarios', 'cliente', 'cartera', 'oportunidades', 'actualizacion') as $nombre => $indice) {
            $this->assertNotFalse($indice, "Falta la consulta: $nombre");
        }

        $this->assertStringContainsString('order by `id` asc', $sql[$usuarios]);
        $this->assertSame([4, 5], $consultas[$usuarios]['datos'], 'Vendedores por id ascendente');
        $this->assertLessThan($cliente, $usuarios);
        $this->assertLessThan($cartera, $usuarios);
        $this->assertLessThan($oportunidades, $cliente);
        $this->assertLessThan($actualizacion, $oportunidades);

        // El bloqueo de los vendedores es la primera lectura de la transacción.
        $this->assertSame($inicio + 1, $usuarios);
    }

    public function test_a4_27_el_cliente_cambio_mientras_se_trabajaba(): void
    {
        // Alicia abre el formulario del cliente 16 (disponible): vendedor_actual vacío.
        $this->actingAs($this->alicia())->get('/clientes/16/editar')->assertSee('name="vendedor_actual" value=""', false);

        // Mientras tanto, Valeria lo toma desde la API.
        DB::table('clientes')->where('id', 16)->update(['vendedor_id' => 4]);

        $this->asignar($this->alicia(), 16, 5, visto: null)->assertSessionHasErrors(['cliente' => self::CAMBIO]);
        $this->assertSame(4, Cliente::find(16)->vendedor_id);

        // Liberar el cliente 3 visto como de Valeria, cuando ya es de Diego.
        DB::table('clientes')->where('id', 3)->update(['vendedor_id' => 5]);
        $this->liberar($this->alicia(), 3, visto: 4)->assertSessionHasErrors(['cliente' => self::CAMBIO]);
        $this->assertSame(5, Cliente::find(3)->vendedor_id);

        // Al recargar, el formulario muestra al dueño nuevo y la operación se acepta.
        $this->actingAs($this->alicia())->get('/clientes/16/editar')->assertSee('name="vendedor_actual" value="4"', false);
        $this->asignar($this->alicia(), 16, 5, visto: 4)->assertSessionHasNoErrors();
        $this->assertSame(5, Cliente::find(16)->vendedor_id);
    }

    public function test_a4_28_la_cartera_se_cuenta_con_el_vendedor_bloqueado(): void
    {
        // PHPUnit no lanza peticiones simultáneas (ver la prueba de punta a punta en verificacion.md).
        // Aquí: Carlos llega a 10 con un alta desde el panel y la siguiente asignación se rechaza.
        $this->actingAs($this->alicia())->post('/clientes', $this->nuevo(['vendedor_id' => 6]))->assertSessionHasNoErrors();
        $this->assertSame(10, $this->cartera(6));

        $this->asignar($this->alicia(), 16, 6)->assertSessionHasErrors('vendedor_id');
        $this->actingAs($this->alicia())->post('/clientes', $this->nuevo(['nombre' => 'Once', 'telefono' => '44441299', 'vendedor_id' => 6]))
            ->assertSessionHasErrors('vendedor_id');
        $this->assertSame(10, $this->cartera(6));
    }

    public function test_a4_29_semilla_intacta_en_la_base_de_pruebas(): void
    {
        $this->assertSame('crm_belleza_test', DB::connection()->getDatabaseName());
        $this->assertSame(21, Cliente::count());
        $this->assertSame([4 => 3, 5 => 2, 6 => 9, 7 => 1],
            Cliente::whereNotNull('vendedor_id')->groupBy('vendedor_id')->orderBy('vendedor_id')
                ->selectRaw('vendedor_id, COUNT(*) AS n')->pluck('n', 'vendedor_id')->all());
    }
}
