<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Alcance;
use App\Services\ReporteVentas;
use App\Support\Quetzales;
use Database\Seeders\SectorSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Criterios A5-01 a A5-18 de docs/specs/A5-equipos-reportes.md, con las cifras de control de §13.3
 * (A5 §5.4). VerificacionSeeder: Alicia (1); Sergio (2) con Valeria (4) y Diego (5); Sandra (3) con
 * Carlos (6) e Iván (7, desactivado). Ganadas: 1, 2 («Equipo para sucursal», 2026-11-01 03:30 UTC) y 3
 * («Soporte del hogar», 2026-11-01 06:30 UTC) de Valeria; 8 de Diego; 10 de Carlos. Abiertas: 4, 5 y 7
 * de Valeria; 9 de Diego; 11 de Carlos. Perdida: 6.
 */
class A5EquiposReportesTest extends TestCase
{
    use RefreshDatabase;

    private function reporte(): ReporteVentas
    {
        return app(ReporteVentas::class);
    }

    private function usuario(int $id): User
    {
        return User::find($id);
    }

    /**
     * ventas|total|pronóstico de un alcance y un mes, como los da el servicio.
     */
    private function cifras(Alcance $alcance, string $mes): string
    {
        $r = $this->reporte()->resumen($alcance, $mes);

        return "{$r['ventas']}|{$r['total']}|{$r['pronostico']}";
    }

    /**
     * Desglose por vendedor como «nombre|cartera|ventas|total|pronóstico».
     *
     * @return array<int, string>
     */
    private function filasVendedor(TestResponse $respuesta): array
    {
        return $respuesta->viewData('porVendedor')
            ->map(fn ($f) => "$f->name|$f->cartera|$f->ventas|$f->total|$f->pronostico")->all();
    }

    /**
     * Texto visible del contenido principal (sin la navegación), con los espacios normalizados.
     */
    private function textoPrincipal(TestResponse $respuesta): string
    {
        $html = $respuesta->getContent();

        // Cada etiqueta cuenta como un espacio, para que <dt>…</dt><dd>…</dd> no queden pegados.
        return trim(preg_replace('/\s+/', ' ', preg_replace('/<[^>]+>/', ' ', substr($html, (int) strpos($html, '<main')))));
    }

    /**
     * Venta u oportunidad creada en la prueba para un vendedor nuevo del equipo de Sergio.
     */
    private function oportunidad(int $vendedor, string $etapa, ?string $cierre, string $precio, int $cantidad = 1): int
    {
        $cliente = DB::table('clientes')->insertGetId(['nombre' => 'Cliente de prueba '.uniqid(), 'vendedor_id' => $vendedor,
            'telefono' => (string) random_int(30000000, 39999999)]);
        $id = DB::table('oportunidades')->insertGetId(['cliente_id' => $cliente, 'vendedor_id' => $vendedor, 'titulo' => 'Prueba',
            'etapa' => $etapa, 'fecha_cierre' => $cierre]);
        DB::table('oportunidad_productos')->insert(['oportunidad_id' => $id, 'producto_id' => 1, 'cantidad' => $cantidad, 'precio_unitario' => $precio]);

        return $id;
    }

    private function vendedorNuevo(): User
    {
        return User::factory()->vendedor($this->usuario(2))->create(['name' => 'Vendedora Nueva']);
    }

    // --- Definición de las cifras (§5) ----------------------------------------------------------

    public function test_a5_01_cifras_de_control_por_vendedor(): void
    {
        $this->assertSame('2|9250.00|2512.88', $this->cifras(Alcance::vendedor(4), '2026-10'), 'Valeria octubre');
        $this->assertSame('1|3600.00|2512.88', $this->cifras(Alcance::vendedor(4), '2026-11'), 'Valeria noviembre');
        $this->assertSame('1|6000.00|112.50', $this->cifras(Alcance::vendedor(5), '2026-10'), 'Diego octubre');
        $this->assertSame('1|7200.00|4125.75', $this->cifras(Alcance::vendedor(6), '2026-10'), 'Carlos octubre');
        $this->assertSame('0|0.00|0.00', $this->cifras(Alcance::vendedor(7), '2026-10'), 'Iván octubre');

        $carteras = array_map(fn ($id) => $this->reporte()->cartera($id), [4, 5, 6, 7]);
        $this->assertSame([3, 2, 9, 1], $carteras, 'Cartera: Valeria 3, Diego 2, Carlos 9, Iván 1 (de 10)');
        $this->assertSame(10, ReporteVentas::MAXIMO_CARTERA);
    }

    public function test_a5_02_equipos_y_empresa(): void
    {
        $this->assertSame('3|15250.00|2625.38', $this->cifras(Alcance::equipo(2), '2026-10'), 'Equipo de Sergio');
        $this->assertSame('1|7200.00|4125.75', $this->cifras(Alcance::equipo(3), '2026-10'), 'Equipo de Sandra');
        $this->assertSame('4|22450.00|6751.13', $this->cifras(Alcance::empresa(), '2026-10'), 'Empresa');
    }

    public function test_a5_03_mes_de_guatemala_en_el_limite(): void
    {
        $this->assertSame(['2026-10-01 06:00:00', '2026-11-01 06:00:00'], $this->reporte()->rango('2026-10'));
        $this->assertSame(['2026-12-01 06:00:00', '2027-01-01 06:00:00'], $this->reporte()->rango('2026-12'));

        $cierres = DB::table('oportunidades')->whereIn('titulo', ['Equipo para sucursal', 'Soporte del hogar'])->pluck('fecha_cierre', 'titulo');
        $this->assertSame('2026-11-01 03:30:00', $cierres['Equipo para sucursal']);
        $this->assertSame('2026-11-01 06:30:00', $cierres['Soporte del hogar']);

        // «Equipo para sucursal» (Q3,600.00) cuenta en OCTUBRE: 5650.00 (op. 1) + 3600.00 = 9250.00.
        // «Soporte del hogar» (Q3,600.00) cuenta en NOVIEMBRE: es la única venta de Valeria ese mes.
        $this->assertSame('2|9250.00|2512.88', $this->cifras(Alcance::vendedor(4), '2026-10'));
        $this->assertSame('1|3600.00|2512.88', $this->cifras(Alcance::vendedor(4), '2026-11'));

        // Si «Equipo para sucursal» se cuenta en noviembre (como haría un mes UTC), las cifras cambian.
        DB::table('oportunidades')->where('titulo', 'Equipo para sucursal')->update(['fecha_cierre' => '2026-11-01 06:00:00']);
        $this->assertSame('1|5650.00|2512.88', $this->cifras(Alcance::vendedor(4), '2026-10'), 'A las 06:00:00 UTC exactas ya es noviembre');
        $this->assertSame('2|7200.00|2512.88', $this->cifras(Alcance::vendedor(4), '2026-11'));

        // Una venta nueva a las 05:59:59 UTC del 1 de noviembre todavía es de octubre.
        $nueva = $this->vendedorNuevo();
        $this->oportunidad($nueva->id, 'ganada', '2026-11-01 05:59:59', '100.00');
        $this->assertSame('1|100.00|0.00', $this->cifras(Alcance::vendedor($nueva->id), '2026-10'));
        $this->assertSame('0|0.00|0.00', $this->cifras(Alcance::vendedor($nueva->id), '2026-11'));
    }

    public function test_a5_04_redondeo_despues_de_sumar(): void
    {
        $nueva = $this->vendedorNuevo();
        // Dos oportunidades en prospecto (10 %) con una línea de 1.25: cada una aporta 0.125.
        $this->oportunidad($nueva->id, 'prospecto', null, '1.25');
        $this->oportunidad($nueva->id, 'prospecto', null, '1.25');

        $this->assertSame('0.13', DB::selectOne('SELECT ROUND(0.125, 2) AS r')->r, 'Redondear cada una daría 0.13 + 0.13 = 0.26');
        $this->assertSame('0|0.00|0.25', $this->cifras(Alcance::vendedor($nueva->id), '2026-10'), 'Se redondea una vez: 0.125 + 0.125 = 0.25');
    }

    public function test_a5_05_precio_guardado(): void
    {
        DB::table('productos')->where('nombre', 'Plan avanzado')->update(['precio' => '3000.00']);

        $this->assertSame('2|9250.00|2512.88', $this->cifras(Alcance::vendedor(4), '2026-10'));
        $this->assertSame('4|22450.00|6751.13', $this->cifras(Alcance::empresa(), '2026-10'));
    }

    // --- Equipo ---------------------------------------------------------------------------------

    public function test_a5_06_pagina_del_equipo_del_supervisor(): void
    {
        $sandra = $this->actingAs($this->usuario(3))->get('/equipo?mes=2026-10')->assertOk();
        $texto = $this->textoPrincipal($sandra);
        $this->assertStringContainsString('Carlos Ajú 9 de 10 1 Q7,200.00 Q4,125.75', $texto);
        $this->assertStringContainsString('Iván Toj (inactivo) 1 de 10 0 Q0.00 Q0.00', $texto);
        $this->assertStringContainsString('Total del equipo 1 Q7,200.00 Q4,125.75', $texto);
        $sandra->assertDontSee('Valeria López')->assertDontSee('Diego Castillo')->assertDontSee('Total de la empresa');

        $texto = $this->textoPrincipal($this->actingAs($this->usuario(2))->get('/equipo?mes=2026-10'));
        $this->assertStringContainsString('Valeria López 3 de 10 2 Q9,250.00 Q2,512.88', $texto);
        $this->assertStringContainsString('Diego Castillo 2 de 10 1 Q6,000.00 Q112.50', $texto);
        $this->assertStringContainsString('Total del equipo 3 Q15,250.00 Q2,625.38', $texto);
        $this->assertStringNotContainsString('Carlos', $texto);
    }

    public function test_a5_07_el_administrador_ve_todos_los_equipos(): void
    {
        $this->seed(SectorSeeder::class);
        $texto = $this->textoPrincipal($this->actingAs($this->usuario(1))->get('/equipo?mes=2026-10')->assertOk());

        $this->assertStringContainsString('Equipo de Sergio Ruiz', $texto);
        $this->assertStringContainsString('Equipo de Sandra Pérez', $texto);
        $this->assertStringContainsString('Equipo de Lucía Mendoza', $texto);
        $this->assertStringContainsString('Total del equipo 3 Q15,250.00 Q2,625.38', $texto);
        $this->assertStringContainsString('Total del equipo 1 Q7,200.00 Q4,125.75', $texto);
        // Con SectorSeeder la empresa incluye al equipo de Lucía; su total sale del alcance «empresa».
        $empresa = $this->reporte()->resumen(Alcance::empresa(), '2026-10');
        $this->assertStringContainsString("Total de la empresa: {$empresa['ventas']} ventas · ".Quetzales::formatear($empresa['total']), $texto);
    }

    public function test_a5_08_mes_por_omision_e_invalido(): void
    {
        $actual = $this->reporte()->mesActual();
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}$/', $actual);

        foreach (['/equipo', '/reportes'] as $ruta) {
            $this->assertSame($actual, $this->actingAs($this->usuario(1))->get($ruta)->assertOk()->viewData('mes'));

            foreach (['2026-13', '26-10', 'octubre', '2026-1', '0999-01'] as $malo) {
                $this->actingAs($this->usuario(1))->get("$ruta?mes=$malo")
                    ->assertRedirect($ruta)
                    ->assertSessionHasErrors(['mes' => 'Elija un mes válido.']);
            }
        }

        // Al seguir la redirección se ve el mes actual con el mensaje (sin 500).
        $this->actingAs($this->usuario(1))->from('/reportes')->followingRedirects()->get('/reportes?mes=2026-13')
            ->assertOk()->assertSee('Elija un mes válido.');
    }

    // --- Oportunidades de solo lectura ----------------------------------------------------------

    public function test_a5_09_lista_con_filtros(): void
    {
        $ids = fn (User $u, string $q = '') => $this->actingAs($u)->get('/oportunidades'.$q)->assertOk()
            ->viewData('oportunidades')->pluck('id')->all();

        $this->assertSame(range(1, 11), $ids($this->usuario(1)));
        $this->assertSame([4, 11], $ids($this->usuario(1), '?etapa=negociacion'));
        $this->assertSame(range(1, 7), $ids($this->usuario(1), '?vendedor=4'));
        $this->assertSame([1, 2, 3], $ids($this->usuario(1), '?etapa=ganada&vendedor=4'));

        $texto = $this->textoPrincipal($this->actingAs($this->usuario(1))->get('/oportunidades'));
        $this->assertStringContainsString('Equipo para sucursal Ferretería Xela Valeria López Ganada Q3,600.00 31/10/2026 21:30', $texto);
        $this->assertStringContainsString('Soporte del hogar María Coyoy Valeria López Ganada Q3,600.00 01/11/2026 00:30', $texto);
        $this->assertStringContainsString('Ampliación a bodega Comercial El Quetzal Valeria López Negociación Q2,750.50 —', $texto);
    }

    public function test_a5_10_alcance_del_supervisor(): void
    {
        $ids = fn (User $u, string $q = '') => $this->actingAs($u)->get('/oportunidades'.$q)->assertOk()
            ->viewData('oportunidades')->pluck('id')->all();

        $this->assertSame(range(1, 9), $ids($this->usuario(2)));
        $this->actingAs($this->usuario(2))->get('/oportunidades/10')->assertNotFound();
        $this->assertSame([], $ids($this->usuario(2), '?vendedor=6'));

        $this->seed(SectorSeeder::class);
        $lucia = User::where('email', 'lucia@crm.test')->first();
        $this->assertSame([], array_intersect(range(1, 11), $ids($lucia)));
        $this->actingAs($lucia)->get('/oportunidades/1')->assertNotFound();
    }

    public function test_a5_11_detalle_de_solo_lectura(): void
    {
        $respuesta = $this->actingAs($this->usuario(1))->get('/oportunidades/1')->assertOk();
        $texto = $this->textoPrincipal($respuesta);

        $this->assertStringContainsString('Plan avanzado 2 Q2,600.00 Q5,200.00', $texto);
        $this->assertStringContainsString('Instalación 1 Q450.00 Q450.00', $texto);
        $this->assertStringContainsString('Total Q5,650.00', $texto);
        $this->assertCount(5, $respuesta->viewData('historial'));
        $this->assertSame(5, substr_count($texto, 'Valeria López') - 1, '5 cambios de etapa de Valeria (más el vendedor)');
        $this->assertStringContainsString('02/10/2026 10:00 Propuesta Negociación Valeria López', $texto);

        $principal = substr($respuesta->getContent(), (int) strpos($respuesta->getContent(), '<main'));
        $this->assertStringNotContainsString('<form', $principal);
        $this->assertStringNotContainsString('<button', $principal);

        foreach (['put', 'patch', 'delete'] as $metodo) {
            $this->actingAs($this->usuario(1))->{$metodo}('/oportunidades/1')->assertStatus(405);
        }
        $this->actingAs($this->usuario(1))->post('/oportunidades')->assertStatus(405);
    }

    public function test_a5_12_etapa_invalida(): void
    {
        $this->actingAs($this->usuario(1))->get('/oportunidades?etapa=cancelado')
            ->assertRedirect('/oportunidades')
            ->assertSessionHasErrors(['etapa' => 'Elija una etapa válida.']);
    }

    // --- Reporte del mes ------------------------------------------------------------------------

    public function test_a5_13_reporte_de_la_empresa(): void
    {
        $respuesta = $this->actingAs($this->usuario(1))->get('/reportes?mes=2026-10')->assertOk();

        $this->assertSame(['ventas' => 4, 'total' => '22450.00', 'pronostico' => '6751.13'], $respuesta->viewData('resumen'));
        $this->assertSame([
            'Carlos Ajú|9|1|7200.00|4125.75',
            'Diego Castillo|2|1|6000.00|112.50',
            'Iván Toj|1|0|0.00|0.00',
            'Valeria López|3|2|9250.00|2512.88',
        ], $this->filasVendedor($respuesta));
        $this->assertSame([
            'Plan básico|5|6000.00|0.00',
            'Plan avanzado|2|5200.00|6188.63',
            'Instalación|1|450.00|562.50',
            'Soporte anual|3|10800.00|0.00',
        ], $respuesta->viewData('porProducto')->map(fn ($f) => "$f->nombre|$f->unidades|$f->total|$f->pronostico")->all());

        $texto = $this->textoPrincipal($respuesta);
        $this->assertStringContainsString('Ventas del mes 4 Total vendido Q22,450.00 Pronóstico (oportunidades abiertas) Q6,751.13', $texto);
        $this->assertStringContainsString('Equipo de Sandra Pérez 1 Q7,200.00 Q4,125.75', $texto);
        $this->assertStringContainsString('Equipo de Sergio Ruiz 3 Q15,250.00 Q2,625.38', $texto);
        $this->assertStringContainsString('Empresa 4 Q22,450.00 Q6,751.13', $texto);
        $this->assertStringContainsString('Iván Toj (inactivo) 1 de 10 0 Q0.00 Q0.00', $texto);
        $this->assertStringContainsString('Plan avanzado 2 Q5,200.00 Q6,188.63', $texto);
        $this->assertStringContainsString('Soporte anual 3 Q10,800.00 Q0.00', $texto);
    }

    public function test_a5_14_reporte_del_supervisor(): void
    {
        $respuesta = $this->actingAs($this->usuario(2))->get('/reportes?mes=2026-10')->assertOk();
        $this->assertSame(['ventas' => 3, 'total' => '15250.00', 'pronostico' => '2625.38'], $respuesta->viewData('resumen'));
        $this->assertSame(['Diego Castillo|2|1|6000.00|112.50', 'Valeria López|3|2|9250.00|2512.88'], $this->filasVendedor($respuesta));
        // Por producto, solo las líneas de su equipo: el Soporte anual vendido es el de Diego (1 de 3).
        $this->assertContains('Soporte anual|1|3600.00|0.00',
            $respuesta->viewData('porProducto')->map(fn ($f) => "$f->nombre|$f->unidades|$f->total|$f->pronostico")->all());
        $this->assertTrue($respuesta->viewData('equipos')->isEmpty(), 'El supervisor no ve otros equipos');

        $valeria = $this->actingAs($this->usuario(2))->get('/reportes?mes=2026-10&vendedor=4');
        $this->assertSame(['ventas' => 2, 'total' => '9250.00', 'pronostico' => '2512.88'], $valeria->viewData('resumen'));

        // P5: un vendedor fuera de su equipo da un reporte vacío, no 404 ni datos de Carlos.
        $ajeno = $this->actingAs($this->usuario(2))->get('/reportes?mes=2026-10&vendedor=6')->assertOk();
        $this->assertSame(['ventas' => 0, 'total' => '0.00', 'pronostico' => '0.00'], $ajeno->viewData('resumen'));
        $this->assertSame([], $this->filasVendedor($ajeno));
        $ajeno->assertDontSee('Carlos');
    }

    public function test_a5_15_venta_compartida(): void
    {
        // Lo que hace la API al ganar la op. 4 (Plan avanzado × 1 a 2750.50) el 20 de octubre.
        DB::table('oportunidades')->where('id', 4)->update(['etapa' => 'ganada', 'fecha_cierre' => '2026-10-20 18:00:00']);

        $respuesta = $this->actingAs($this->usuario(1))->get('/reportes?mes=2026-10')->assertOk();
        $this->assertSame(['ventas' => 5, 'total' => '25200.50', 'pronostico' => '4688.25'], $respuesta->viewData('resumen'));
        $this->assertContains('Valeria López|3|3|12000.50|450.00', $this->filasVendedor($respuesta));
    }

    public function test_a5_16_paridad_con_el_sql_de_referencia(): void
    {
        // SQL de referencia de A5 §5.3, tal cual (C1, C2, C3), con {alcance} por tipo.
        $probabilidad = "CASE o.etapa WHEN 'prospecto' THEN 10 WHEN 'calificado' THEN 25 WHEN 'propuesta' THEN 50 WHEN 'negociacion' THEN 75 END";
        $referencia = function (string $alcance, array $datos, string $mes) use ($probabilidad) {
            [$inicio, $fin] = $this->reporte()->rango($mes);
            $c1 = DB::selectOne("SELECT COUNT(*) AS n FROM oportunidades o WHERE o.etapa = 'ganada' AND o.fecha_cierre >= ? AND o.fecha_cierre < ? AND $alcance", [$inicio, $fin, ...$datos])->n;
            $c2 = DB::selectOne("SELECT ROUND(COALESCE(SUM(l.cantidad * l.precio_unitario), 0), 2) AS n FROM oportunidades o JOIN oportunidad_productos l ON l.oportunidad_id = o.id WHERE o.etapa = 'ganada' AND o.fecha_cierre >= ? AND o.fecha_cierre < ? AND $alcance", [$inicio, $fin, ...$datos])->n;
            $c3 = DB::selectOne("SELECT ROUND(COALESCE(SUM(l.cantidad * l.precio_unitario * $probabilidad / 100), 0), 2) AS n FROM oportunidades o JOIN oportunidad_productos l ON l.oportunidad_id = o.id WHERE o.etapa IN ('prospecto', 'calificado', 'propuesta', 'negociacion') AND $alcance", $datos)->n;

            return "$c1|$c2|$c3";
        };

        $casos = [
            [Alcance::vendedor(4), 'o.vendedor_id = ?', [4]],
            [Alcance::vendedor(5), 'o.vendedor_id = ?', [5]],
            [Alcance::vendedor(6), 'o.vendedor_id = ?', [6]],
            [Alcance::vendedor(7), 'o.vendedor_id = ?', [7]],
            [Alcance::equipo(2), 'o.vendedor_id IN (SELECT id FROM users WHERE supervisor_id = ?)', [2]],
            [Alcance::equipo(3), 'o.vendedor_id IN (SELECT id FROM users WHERE supervisor_id = ?)', [3]],
            [Alcance::empresa(), '1 = 1', []],
        ];

        foreach (['2026-09', '2026-10', '2026-11'] as $mes) {
            foreach ($casos as [$alcance, $sql, $datos]) {
                $this->assertSame($referencia($sql, $datos, $mes), $this->cifras($alcance, $mes), "$alcance->tipo $alcance->id $mes");
            }
        }
    }

    public function test_a5_17_texto_escapado_y_montos_sin_float(): void
    {
        $producto = DB::table('productos')->insertGetId(['nombre' => '<b>x</b>', 'precio' => 10, 'activo' => true]);
        $cliente = DB::table('clientes')->insertGetId(['nombre' => '<i>c</i>', 'vendedor_id' => 4, 'telefono' => '44441234']);
        $id = DB::table('oportunidades')->insertGetId(['cliente_id' => $cliente, 'vendedor_id' => 4, 'titulo' => '<script>t</script>',
            'etapa' => 'ganada', 'fecha_cierre' => '2026-10-10 15:00:00']);
        DB::table('oportunidad_productos')->insert(['oportunidad_id' => $id, 'producto_id' => $producto, 'cantidad' => 1, 'precio_unitario' => 10]);

        foreach (['/oportunidades', "/oportunidades/$id", '/reportes?mes=2026-10'] as $ruta) {
            $respuesta = $this->actingAs($this->usuario(1))->get($ruta)->assertOk();
            foreach (['<b>x</b>', '<i>c</i>', '<script>t</script>'] as $crudo) {
                $respuesta->assertDontSee($crudo, false);
            }
        }
        $this->actingAs($this->usuario(1))->get('/reportes?mes=2026-10')->assertSee('&lt;b&gt;x&lt;/b&gt;', false);

        // Formato a partir del texto DECIMAL, sin pasar por float.
        $this->assertSame('Q22,450.00', Quetzales::formatear('22450.00'));
        $this->assertSame('Q0.00', Quetzales::formatear('0.00'));
        $this->assertSame('Q99,999,999.99', Quetzales::formatear('99999999.99'));
        $this->assertSame('Q2,512.88', Quetzales::formatear('2512.88'));
    }

    public function test_a5_18_vendedores_sin_ventas_en_el_mes(): void
    {
        $noviembre = $this->actingAs($this->usuario(1))->get('/reportes?mes=2026-11')->assertOk();
        $this->assertSame([
            'Carlos Ajú|9|0|0.00|4125.75',
            'Diego Castillo|2|0|0.00|112.50',
            'Iván Toj|1|0|0.00|0.00',
            'Valeria López|3|1|3600.00|2512.88',
        ], $this->filasVendedor($noviembre));
        $texto = $this->textoPrincipal($noviembre);
        $this->assertStringContainsString('Diego Castillo 2 de 10 0 Q0.00 Q112.50', $texto);
        $this->assertStringContainsString('Carlos Ajú 9 de 10 0 Q0.00 Q4,125.75', $texto);

        $octubre = $this->actingAs($this->usuario(1))->get('/reportes?mes=2026-10');
        $this->assertContains('Iván Toj|1|0|0.00|0.00', $this->filasVendedor($octubre));

        $equipo = $this->textoPrincipal($this->actingAs($this->usuario(3))->get('/equipo?mes=2026-11'));
        $this->assertStringContainsString('Carlos Ajú 9 de 10 0 Q0.00 Q4,125.75', $equipo);
        $this->assertStringContainsString('Iván Toj (inactivo) 1 de 10 0 Q0.00 Q0.00', $equipo);
    }

    public function test_acceso_sin_sesion(): void
    {
        foreach (['/equipo', '/oportunidades', '/oportunidades/1', '/reportes'] as $ruta) {
            $this->get($ruta)->assertRedirect('/login');
        }
    }
}
