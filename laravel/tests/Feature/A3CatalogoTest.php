<?php

namespace Tests\Feature;

use App\Models\Producto;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Criterios A3-01 a A3-26 de docs/specs/A3-catalogo.md.
 *
 * Productos de VerificacionSeeder: 1 Plan básico (1200.00), 2 Plan avanzado (2750.50), 3 Instalación
 * (450.00), 4 Soporte anual (3600.00) y 5 Licencia anterior (999.99, inactivo); todos con stock NULL.
 * Cuentas: Alicia (1, administradora), Sergio (2, supervisor), Valeria (4, vendedora).
 */
class A3CatalogoTest extends TestCase
{
    use RefreshDatabase;

    private const MENSAJE_REPETIDO = 'Ya existe un producto con ese nombre.';

    private function alicia(): User
    {
        return User::find(1);
    }

    private function sergio(): User
    {
        return User::find(2);
    }

    /**
     * Cuerpo del formulario de alta, con los cambios de $cambios.
     *
     * @param  array<string, mixed>  $cambios
     * @return array<string, mixed>
     */
    private function nuevo(array $cambios = []): array
    {
        return array_merge([
            'nombre' => 'Base líquida mate',
            'precio' => '185.00',
            'stock' => '',
            'activo' => '1',
        ], $cambios);
    }

    /**
     * Cuerpo completo del formulario de edición de $producto tal como lo muestra la pantalla
     * (stock_original = stock actual), con los cambios de $cambios.
     *
     * @param  array<string, mixed>  $cambios
     * @return array<string, mixed>
     */
    private function formulario(Producto $producto, array $cambios = []): array
    {
        return array_merge([
            'nombre' => $producto->nombre,
            'precio' => $producto->precio,
            'stock' => $producto->stock ?? '',
            'stock_original' => $producto->stock ?? '',
            'activo' => $producto->activo ? '1' : '0',
        ], $cambios);
    }

    private function fijarStock(int $id, ?int $stock): void
    {
        DB::table('productos')->where('id', $id)->update(['stock' => $stock]);
    }

    /**
     * Ventas, total y pronóstico de Valeria en un mes (rango UTC del mes en hora de Guatemala),
     * calculados con el precio guardado en cada línea (misma consulta que A1-14).
     */
    private function cifrasValeria(string $mes): string
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
            [$inicio, $fin, 4, $inicio, $fin, 4, 4]
        );

        return "$r->ventas|$r->total|$r->pronostico";
    }

    // --- Acceso ---------------------------------------------------------------------------------

    public function test_a3_01_el_administrador_entra_y_sin_sesion_se_va_al_login(): void
    {
        foreach (['/productos', '/productos/crear', '/productos/2/editar'] as $ruta) {
            $this->get($ruta)->assertRedirect('/login');
        }

        $this->actingAs($this->alicia())->get('/dashboard')->assertSee(route('productos.index'));
        $this->actingAs($this->alicia())->get('/productos')->assertOk()
            ->assertSee('Nuevo producto')->assertSee(route('productos.edit', 2));
    }

    public function test_a3_24_el_supervisor_ve_la_lista_en_solo_lectura(): void
    {
        $this->actingAs($this->sergio())->get('/dashboard')->assertSee(route('productos.index'));
        $this->actingAs($this->sergio())->get('/productos')->assertOk()
            ->assertSee('Plan avanzado')->assertSee('Licencia anterior')
            ->assertDontSee('Nuevo producto')->assertDontSee(route('productos.edit', 2));

        $this->actingAs($this->sergio())->get('/productos/crear')->assertForbidden();
        $this->actingAs($this->sergio())->get('/productos/2/editar')->assertForbidden();
        $this->actingAs($this->sergio())->post('/productos', $this->nuevo())->assertForbidden();
        $this->actingAs($this->sergio())->put('/productos/2', $this->formulario(Producto::find(2), ['precio' => '1.00']))
            ->assertForbidden();

        $this->assertSame(5, Producto::count());
        $this->assertSame('2750.50', Producto::find(2)->precio);
    }

    // --- Lista ----------------------------------------------------------------------------------

    public function test_a3_02_lista_completa(): void
    {
        $this->actingAs($this->alicia())->get('/productos')->assertOk()
            ->assertSeeInOrder(['Instalación', 'Q450.00', 'Sin control', 'Activo'])
            ->assertSeeInOrder(['Licencia anterior', 'Q999.99', 'Sin control', 'Inactivo'])
            ->assertSeeInOrder(['Plan avanzado', 'Q2,750.50', 'Sin control', 'Activo'])
            ->assertSee('Plan básico')->assertSee('Q1,200.00')
            ->assertSee('Soporte anual')->assertSee('Q3,600.00');
    }

    public function test_a3_03_sin_control_frente_a_cero_existencias(): void
    {
        $this->fijarStock(1, 0);

        $this->actingAs($this->alicia())->get('/productos')
            ->assertSeeInOrder(['Plan básico', '0 existencias'])
            ->assertSeeInOrder(['Plan avanzado', 'Sin control']);

        $this->assertSame('0', $this->valorDelCampoStock('/productos/1/editar'));
        $this->actingAs($this->alicia())->get('/productos/1/editar')->assertSee('Actualmente: 0 en existencia');

        $this->assertSame('', $this->valorDelCampoStock('/productos/2/editar'));
        $this->actingAs($this->alicia())->get('/productos/2/editar')->assertSee('Actualmente: sin control de inventario');
    }

    /**
     * Valor del campo visible «stock» del formulario ('' si está vacío).
     */
    private function valorDelCampoStock(string $ruta): string
    {
        $html = $this->actingAs($this->alicia())->get($ruta)->getContent();
        $this->assertSame(1, preg_match('/<input[^>]*\bname="stock"[^>]*>/', $html, $campo));

        return preg_match('/\bvalue="([^"]*)"/', $campo[0], $valor) ? $valor[1] : '';
    }

    // --- Crear y editar -------------------------------------------------------------------------

    public function test_a3_04_crear_sin_control_de_inventario(): void
    {
        $this->actingAs($this->alicia())->post('/productos', $this->nuevo())
            ->assertSessionHasNoErrors()->assertRedirect('/productos');

        $producto = Producto::where('nombre', 'Base líquida mate')->firstOrFail();
        $this->assertTrue($producto->activo);
        $this->assertSame('185.00', $producto->precio);
        $this->assertNull($producto->stock);
    }

    public function test_a3_05_crear_con_inventario(): void
    {
        $this->actingAs($this->alicia())->post('/productos', $this->nuevo(['nombre' => 'Rubor compacto', 'stock' => '0']))
            ->assertSessionHasNoErrors();
        $this->actingAs($this->alicia())->post('/productos', $this->nuevo(['nombre' => 'Delineador negro', 'stock' => '25']))
            ->assertSessionHasNoErrors();

        $this->assertSame(0, Producto::where('nombre', 'Rubor compacto')->value('stock'));
        $this->assertSame(25, Producto::where('nombre', 'Delineador negro')->value('stock'));
    }

    public function test_a3_06_editar_el_stock(): void
    {
        $this->actingAs($this->alicia())->put('/productos/3', $this->formulario(Producto::find(3), ['stock' => '10']))
            ->assertSessionHasNoErrors();
        $this->assertSame(10, Producto::find(3)->stock);

        $this->actingAs($this->alicia())->put('/productos/3', $this->formulario(Producto::find(3), ['stock' => '']))
            ->assertSessionHasNoErrors();
        $this->assertNull(Producto::find(3)->stock);
    }

    public function test_a3_07_nombre_obligatorio_y_largo_maximo(): void
    {
        foreach (['' => 'Escriba el nombre del producto.', '   ' => 'Escriba el nombre del producto.',
            str_repeat('a', 121) => 'El nombre no debe superar los 120 caracteres.'] as $nombre => $mensaje) {
            $this->actingAs($this->alicia())->post('/productos', $this->nuevo(['nombre' => $nombre]))
                ->assertSessionHasErrors(['nombre' => $mensaje]);
        }
        $this->assertSame(5, Producto::count());

        $this->actingAs($this->alicia())->post('/productos', $this->nuevo(['nombre' => str_repeat('a', 120)]))
            ->assertSessionHasNoErrors();
        $this->assertSame(6, Producto::count());
    }

    public function test_a3_08_nombre_repetido(): void
    {
        foreach (['Plan avanzado', 'PLAN AVANZADO', 'plan avanzado ', 'Plan basico'] as $nombre) {
            $this->actingAs($this->alicia())->post('/productos', $this->nuevo(['nombre' => $nombre]))
                ->assertSessionHasErrors(['nombre' => self::MENSAJE_REPETIDO]);
        }
        $this->assertSame(5, Producto::count());

        $this->actingAs($this->alicia())->put('/productos/3', $this->formulario(Producto::find(3), ['nombre' => 'plan avanzado']))
            ->assertSessionHasErrors(['nombre' => self::MENSAJE_REPETIDO]);
        $this->assertSame('Instalación', Producto::find(3)->nombre);

        // Conservar el propio nombre sí se acepta.
        $this->actingAs($this->alicia())->put('/productos/2', $this->formulario(Producto::find(2), ['precio' => '2800.00']))
            ->assertSessionHasNoErrors();
        $this->assertSame('2800.00', Producto::find(2)->precio);
    }

    public function test_a3_09_el_indice_unico_decide_el_duplicado(): void
    {
        // Carrera simulada: otro administrador guarda el mismo nombre entre la validación y el INSERT.
        Producto::creating(function (Producto $producto) {
            DB::table('productos')->insert(['nombre' => $producto->nombre, 'precio' => 10, 'activo' => true]);
        });

        $this->actingAs($this->alicia())->from('/productos/crear')->post('/productos', $this->nuevo())
            ->assertRedirect('/productos/crear')
            ->assertSessionHasErrors(['nombre' => self::MENSAJE_REPETIDO])
            ->assertSessionHasInput('nombre', 'Base líquida mate')
            ->assertSessionHasInput('precio', '185.00');

        $this->assertSame(1, Producto::where('nombre', 'Base líquida mate')->count());
    }

    public function test_a3_09_el_indice_unico_decide_el_duplicado_al_editar(): void
    {
        Producto::updating(function (Producto $producto) {
            DB::table('productos')->insert(['nombre' => $producto->nombre, 'precio' => 10, 'activo' => true]);
        });

        $this->actingAs($this->alicia())->from('/productos/3/editar')
            ->put('/productos/3', $this->formulario(Producto::find(3), ['nombre' => 'Rubor compacto']))
            ->assertRedirect('/productos/3/editar')
            ->assertSessionHasErrors(['nombre' => self::MENSAJE_REPETIDO]);

        // La fila «del otro administrador» se insertó en la misma conexión y se revierte con la
        // transacción del guardado; lo que importa es que el 1062 vuelve al formulario y no da 500.
        $this->assertSame('Instalación', Producto::find(3)->nombre);
    }

    public function test_a3_10_precio_invalido(): void
    {
        $casos = [
            '' => 'Escriba el precio del producto.',
            '0' => 'El precio debe ser mayor que cero.',
            '-5' => 'El precio debe ser mayor que cero.',
            '10.999' => 'El precio admite como máximo dos decimales.',
            'abc' => 'Escriba el precio como un número, por ejemplo 2750.50.',
            '100000000.00' => 'El precio no puede superar Q99,999,999.99.',
        ];

        foreach ($casos as $precio => $mensaje) {
            $this->actingAs($this->alicia())->post('/productos', $this->nuevo(['precio' => $precio]))
                ->assertSessionHasErrors(['precio' => $mensaje]);
        }

        $this->assertSame(5, Producto::count());
    }

    public function test_a3_11_precio_valido_en_los_limites(): void
    {
        foreach (['0.01' => '0.01', '99999999.99' => '99999999.99', '2750.5' => '2750.50'] as $precio => $guardado) {
            $this->actingAs($this->alicia())->post('/productos', $this->nuevo(['nombre' => "Producto $precio", 'precio' => $precio]))
                ->assertSessionHasNoErrors();
            $this->assertSame($guardado, Producto::where('nombre', "Producto $precio")->value('precio'));
        }
    }

    public function test_a3_12_stock_invalido(): void
    {
        $mensaje = 'Las existencias deben ser un número entero mayor o igual a cero. Déjelo vacío si no controla inventario.';
        $casos = ['-1' => $mensaje, '2.5' => $mensaje, 'abc' => $mensaje,
            '2147483648' => 'Las existencias no pueden superar 2,147,483,647.'];

        foreach ($casos as $stock => $esperado) {
            $this->actingAs($this->alicia())->put('/productos/2', $this->formulario(Producto::find(2), ['stock' => $stock]))
                ->assertSessionHasErrors(['stock' => $esperado]);
        }

        $this->assertNull(Producto::find(2)->stock);
        $this->assertSame(0, DB::table('productos')->where('stock', '<', 0)->count());
    }

    public function test_a3_13_mensajes_en_espanol_y_datos_conservados(): void
    {
        $invalido = ['nombre' => 'Plan avanzado', 'precio' => '10.999', 'stock' => '-1', 'activo' => '0'];

        // El formulario vuelve a mostrar lo escrito y cada mensaje junto a su campo, con la casilla de
        // activo desmarcada. (Se comprueba antes que la sesión: assertSessionHasErrors consume los errores.)
        $this->actingAs($this->alicia())->from('/productos/crear')->post('/productos', $invalido);
        $this->actingAs($this->alicia())->get('/productos/crear')
            ->assertSeeInOrder(['value="Plan avanzado"', 'Ya existe un producto con ese nombre.',
                'value="10.999"', 'El precio admite como máximo dos decimales.',
                'value="-1"', 'Déjelo vacío si no controla inventario.'], false)
            ->assertDontSee('value="1" checked', false);

        $this->actingAs($this->alicia())->from('/productos/crear')->post('/productos', $invalido)
            ->assertRedirect('/productos/crear')
            ->assertSessionHasErrors([
                'nombre' => self::MENSAJE_REPETIDO,
                'precio' => 'El precio admite como máximo dos decimales.',
                'stock' => 'Las existencias deben ser un número entero mayor o igual a cero. Déjelo vacío si no controla inventario.',
            ])
            ->assertSessionHasInput($invalido);

        $this->assertSame(5, Producto::count());
    }

    public function test_a3_14_campos_fuera_del_formulario_se_ignoran(): void
    {
        $lineas = DB::table('oportunidad_productos')->orderBy('id')->get();

        $this->actingAs($this->alicia())->put('/productos/2', $this->formulario(Producto::find(2), [
            'precio' => '2800.00', 'id' => 99, 'created_at' => '2000-01-01 00:00:00', 'precio_unitario' => '1.00',
        ]))->assertSessionHasNoErrors();

        $this->assertNull(Producto::find(99));
        $this->assertSame('2800.00', Producto::find(2)->precio);
        $this->assertNotSame('2000-01-01', Producto::find(2)->created_at->toDateString());
        $this->assertEquals($lineas, DB::table('oportunidad_productos')->orderBy('id')->get());

        $this->actingAs($this->alicia())->post('/productos', $this->nuevo(['id' => 50]))->assertSessionHasNoErrors();
        $this->assertNull(Producto::find(50));
    }

    public function test_a3_15_producto_inexistente(): void
    {
        $this->actingAs($this->alicia())->get('/productos/999/editar')->assertNotFound();
        $this->actingAs($this->alicia())->put('/productos/999', $this->nuevo(['stock_original' => '']))->assertNotFound();
    }

    public function test_a3_16_texto_escapado(): void
    {
        DB::table('productos')->insert(['nombre' => '<b>Rubor</b>', 'precio' => 50, 'activo' => true]);

        $this->actingAs($this->alicia())->get('/productos')
            ->assertSee('&lt;b&gt;Rubor&lt;/b&gt;', false)
            ->assertDontSee('<b>Rubor</b>', false);
    }

    // --- Desactivar y borrar --------------------------------------------------------------------

    public function test_a3_17_desactivar(): void
    {
        $lineas = DB::table('oportunidad_productos')->where('producto_id', 3)->orderBy('id')->get();
        $this->assertSame([2, 6, 11], $lineas->pluck('id')->all());

        $this->actingAs($this->alicia())->put('/productos/3', $this->formulario(Producto::find(3), ['activo' => '0']))
            ->assertSessionHasNoErrors();

        $this->assertFalse(Producto::find(3)->activo);
        // Misma condición que GET /api/productos (api/src/rutas/productos.js): activo = 1.
        $this->assertNotContains('Instalación', DB::table('productos')->where('activo', 1)->pluck('nombre')->all());
        $this->assertEquals($lineas, DB::table('oportunidad_productos')->where('producto_id', 3)->orderBy('id')->get());
    }

    public function test_a3_18_reactivar(): void
    {
        $this->actingAs($this->alicia())->put('/productos/5', $this->formulario(Producto::find(5), ['activo' => '1']))
            ->assertSessionHasNoErrors();

        $api = DB::table('productos')->where('activo', 1)->where('nombre', 'Licencia anterior')->first(['precio', 'stock']);
        $this->assertNotNull($api);
        $this->assertSame('999.99', (string) $api->precio);
        $this->assertNull($api->stock);
    }

    public function test_a3_19_sin_borrado(): void
    {
        $this->actingAs($this->alicia())->delete('/productos/2')->assertStatus(405);
        $this->assertNotNull(Producto::find(2));

        $this->actingAs($this->alicia())->get('/productos')
            ->assertDontSee('Eliminar')->assertDontSee('Borrar');
    }

    // --- Precio histórico -----------------------------------------------------------------------

    public function test_a3_20_cambiar_el_precio_no_altera_las_lineas(): void
    {
        $lineas = DB::table('oportunidad_productos')->orderBy('id')->get();

        $this->actingAs($this->alicia())->put('/productos/2', $this->formulario(Producto::find(2), ['precio' => '3000.00']))
            ->assertSessionHasNoErrors();

        $this->assertSame('3000.00', Producto::find(2)->precio);
        $this->assertEquals($lineas, DB::table('oportunidad_productos')->orderBy('id')->get());
        $precio = fn (int $id) => (string) DB::table('oportunidad_productos')->where('id', $id)->value('precio_unitario');
        $this->assertSame('2600.00', $precio(1), 'Línea 1 de «Renovación de planes»');
        $this->assertSame('2750.50', $precio(5));
        $this->assertSame('2750.50', $precio(13));
    }

    public function test_a3_21_las_cifras_de_control_se_conservan(): void
    {
        $this->assertSame('2|9250.00|2512.88', $this->cifrasValeria('2026-10'));

        $this->actingAs($this->alicia())->put('/productos/2', $this->formulario(Producto::find(2), ['precio' => '3000.00']))
            ->assertSessionHasNoErrors();

        $this->assertSame('2|9250.00|2512.88', $this->cifrasValeria('2026-10'), 'Valeria octubre');
        $this->assertSame('1|3600.00|2512.88', $this->cifrasValeria('2026-11'), 'Valeria noviembre');
        $this->assertSame(3, DB::table('clientes')->where('vendedor_id', 4)->count(), 'Cartera 3/10');
    }

    // --- Concurrencia de stock ------------------------------------------------------------------

    public function test_a3_22_el_panel_no_pisa_un_descuento_de_la_api(): void
    {
        $this->fijarStock(2, 10);

        // Alicia abre el formulario: muestra 10 y lo guarda como stock_original.
        $this->actingAs($this->alicia())->get('/productos/2/editar')
            ->assertSee('name="stock_original" value="10"', false);
        $formulario = $this->formulario(Producto::find(2), ['precio' => '2900.00', 'activo' => '0']);

        // Mientras tanto, la API gana una venta de 3 unidades.
        DB::table('productos')->where('id', 2)->update(['stock' => DB::raw('stock - 3')]);

        $this->actingAs($this->alicia())->from('/productos/2/editar')->put('/productos/2', $formulario)
            ->assertRedirect('/productos/2/editar')
            ->assertSessionHasErrors(['stock' => 'El stock cambió mientras usted editaba (ahora hay 7). Revise y guarde de nuevo.'])
            ->assertSessionHasInput(['stock' => '10', 'precio' => '2900.00']);

        $producto = Producto::find(2);
        $this->assertSame(7, $producto->stock);
        $this->assertSame('2750.50', $producto->precio);
        $this->assertTrue($producto->activo);

        // Al recargar, el formulario compara contra el stock actual y el siguiente guardado se acepta.
        $this->actingAs($this->alicia())->get('/productos/2/editar')
            ->assertSee('name="stock_original" value="7"', false)
            ->assertSee('Actualmente: 7 en existencia');
        $this->actingAs($this->alicia())->put('/productos/2', array_merge($formulario, ['stock' => '7', 'stock_original' => '7']))
            ->assertSessionHasNoErrors();
        $this->assertSame('2900.00', Producto::find(2)->precio);
    }

    public function test_a3_25_guardado_sin_conflicto_y_casos_null(): void
    {
        // Sin cambio: 10 y 10.
        $this->fijarStock(2, 10);
        $this->actingAs($this->alicia())->put('/productos/2', $this->formulario(Producto::find(2), ['stock' => '12']))
            ->assertSessionHasNoErrors();
        $this->assertSame(12, Producto::find(2)->stock);

        // Sin cambio: NULL y NULL.
        $this->actingAs($this->alicia())->put('/productos/3', $this->formulario(Producto::find(3), ['precio' => '500.00']))
            ->assertSessionHasNoErrors();
        $this->assertSame('500.00', Producto::find(3)->precio);

        // Mostró NULL y ahora hay 7.
        $formulario = $this->formulario(Producto::find(3));
        $this->fijarStock(3, 7);
        $this->actingAs($this->alicia())->put('/productos/3', $formulario)
            ->assertSessionHasErrors(['stock' => 'El stock cambió mientras usted editaba (ahora hay 7). Revise y guarde de nuevo.']);
        $this->assertSame(7, Producto::find(3)->stock);

        // Mostró 7 y ahora no se controla inventario.
        $formulario = $this->formulario(Producto::find(3));
        $this->fijarStock(3, null);
        $this->actingAs($this->alicia())->put('/productos/3', $formulario)
            ->assertSessionHasErrors(['stock' => 'El stock cambió mientras usted editaba (ahora no se controla inventario). Revise y guarde de nuevo.']);
        $this->assertNull(Producto::find(3)->stock);

        // Sin stock_original: se rechaza.
        $sinOriginal = $this->formulario(Producto::find(2));
        unset($sinOriginal['stock_original']);
        $this->actingAs($this->alicia())->put('/productos/2', array_merge($sinOriginal, ['precio' => '1.00']))
            ->assertSessionHasErrors('stock_original');
        $this->assertSame('2750.50', Producto::find(2)->precio);
    }

    public function test_a3_26_el_producto_se_bloquea_antes_de_comparar_y_guardar(): void
    {
        $consultas = [];
        DB::listen(function ($consulta) use (&$consultas) {
            $consultas[] = strtolower($consulta->sql);
        });

        $this->actingAs($this->alicia())->put('/productos/2', $this->formulario(Producto::find(2), ['precio' => '2800.00']))
            ->assertSessionHasNoErrors();

        $bloqueo = collect($consultas)->search(fn ($sql) => str_contains($sql, 'from `productos`') && str_contains($sql, 'for update'));
        $actualizacion = collect($consultas)->search(fn ($sql) => str_starts_with($sql, 'update `productos`'));

        $this->assertNotFalse($bloqueo, 'El producto se bloquea con FOR UPDATE');
        $this->assertNotFalse($actualizacion);
        $this->assertLessThan($actualizacion, $bloqueo);
    }

    // --- Pruebas --------------------------------------------------------------------------------

    public function test_a3_23_semilla_intacta_en_la_base_de_pruebas(): void
    {
        $this->assertSame('crm_belleza_test', DB::connection()->getDatabaseName());
        $this->assertSame(
            ['Plan básico|1200.00|1', 'Plan avanzado|2750.50|1', 'Instalación|450.00|1', 'Soporte anual|3600.00|1', 'Licencia anterior|999.99|0'],
            DB::table('productos')->orderBy('id')->whereNull('stock')->get()
                ->map(fn ($p) => "$p->nombre|$p->precio|$p->activo")->all()
        );
    }
}
