<?php

namespace Tests\Feature;

use App\Models\Actividad;
use App\Models\Oportunidad;
use App\Models\Producto;
use App\Models\User;
use Carbon\CarbonInterface;
use Database\Seeders\VerificacionSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Criterios A1-04 a A1-15 de docs/specs/A1-migraciones.md.
 *
 * Necesita MySQL 8.4: los CHECK y los códigos 1062, 1451 y 3819 no existen en SQLite.
 * Se omite salvo que se active a propósito, porque ejecuta migrate:fresh sobre la conexión
 * configurada y la deja cargada solo con VerificacionSeeder:
 *
 *   PRUEBAS_MYSQL=1 php artisan test --filter=A1EsquemaSemillaTest
 *
 * (phpunit.xml apunta a crm_belleza_test desde A2; la base de desarrollo no se toca.)
 *
 * Las pruebas que escriben lo hacen dentro de una transacción que se revierte.
 */
class A1EsquemaSemillaTest extends TestCase
{
    private const FECHA = '2026-08-01 15:00:00';

    private static bool $sembrada = false;

    protected function setUp(): void
    {
        parent::setUp();

        if (! env('PRUEBAS_MYSQL') || DB::getDriverName() !== 'mysql') {
            $this->markTestSkipped('Requiere MySQL y PRUEBAS_MYSQL=1 (ejecuta migrate:fresh).');
        }

        if (! self::$sembrada) {
            Artisan::call('migrate:fresh', ['--seeder' => VerificacionSeeder::class, '--force' => true]);
            self::$sembrada = true;
        }
    }

    /**
     * Ejecuta $operacion dentro de una transacción revertida y devuelve el errno de MySQL (0 si no falla).
     */
    private function errno(callable $operacion): int
    {
        DB::beginTransaction();

        try {
            $operacion();

            return 0;
        } catch (QueryException $e) {
            return (int) ($e->errorInfo[1] ?? -1);
        } finally {
            DB::rollBack();
        }
    }

    private function cliente(?string $nit, string $telefono): void
    {
        DB::table('clientes')->insert(['nombre' => 'Prueba', 'nit' => $nit, 'telefono' => $telefono]);
    }

    private function oportunidad(string $etapa, ?string $motivo, ?string $cierre): void
    {
        DB::table('oportunidades')->insert([
            'cliente_id' => 1, 'vendedor_id' => 4, 'titulo' => 'Prueba',
            'etapa' => $etapa, 'motivo_perdida' => $motivo, 'fecha_cierre' => $cierre,
        ]);
    }

    private function linea(int $cantidad, string $precio): void
    {
        DB::table('oportunidad_productos')->insert([
            'oportunidad_id' => 7, 'producto_id' => 1, 'cantidad' => $cantidad, 'precio_unitario' => $precio,
        ]);
    }

    public function test_a1_03_llaves_foraneas_y_cascadas(): void
    {
        $reglas = collect(DB::select(
            'SELECT k.TABLE_NAME AS t, k.COLUMN_NAME AS c, rc.DELETE_RULE AS d
             FROM information_schema.KEY_COLUMN_USAGE k
             JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
               ON rc.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND rc.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA
             WHERE k.TABLE_SCHEMA = DATABASE()'
        ))->mapWithKeys(fn ($f) => ["$f->t.$f->c" => $f->d])->sortKeys()->all();

        $this->assertSame([
            'actividades.cliente_id' => 'CASCADE',
            'actividades.vendedor_id' => 'RESTRICT',
            'clientes.vendedor_id' => 'RESTRICT',
            'historial_etapas.oportunidad_id' => 'CASCADE',
            'historial_etapas.usuario_id' => 'RESTRICT',
            'oportunidad_productos.oportunidad_id' => 'CASCADE',
            'oportunidad_productos.producto_id' => 'RESTRICT',
            'oportunidades.cliente_id' => 'RESTRICT',
            'oportunidades.vendedor_id' => 'RESTRICT',
            'users.supervisor_id' => 'RESTRICT',
        ], $reglas);
    }

    public function test_a1_04_borrado_en_cascada(): void
    {
        DB::beginTransaction();
        DB::table('oportunidades')->where('id', 1)->delete();
        $this->assertSame(0, DB::table('oportunidad_productos')->where('oportunidad_id', 1)->count());
        $this->assertSame(0, DB::table('historial_etapas')->where('oportunidad_id', 1)->count());
        DB::rollBack();

        DB::beginTransaction();
        DB::table('actividades')->insert(['cliente_id' => 16, 'vendedor_id' => 4, 'tipo' => 'tarea', 'descripcion' => 'Prueba']);
        DB::table('clientes')->where('id', 16)->delete();
        $this->assertSame(0, DB::table('actividades')->where('cliente_id', 16)->count());
        DB::rollBack();

        $this->assertSame(1451, $this->errno(fn () => DB::table('clientes')->where('id', 1)->delete()));
    }

    public function test_a1_05_indices_unicos(): void
    {
        $this->assertSame(1062, $this->errno(fn () => DB::table('productos')->insert(['nombre' => 'Plan básico', 'precio' => 1])));
        $this->assertSame(1062, $this->errno(fn () => $this->cliente('4521817K', '22223333')));
        $this->assertSame(1062, $this->errno(fn () => $this->cliente(null, '55551234')));
        $this->assertSame(1062, $this->errno(fn () => DB::table('oportunidad_productos')->insert([
            'oportunidad_id' => 1, 'producto_id' => 2, 'cantidad' => 1, 'precio_unitario' => 1,
        ])));
        $this->assertSame(0, $this->errno(function () {
            $this->cliente(null, '22223333');
            $this->cliente(null, '22223334');
        }));
    }

    public function test_a1_06_y_a1_07_restricciones_check(): void
    {
        $rechazos = [
            'precio 0' => fn () => DB::table('productos')->insert(['nombre' => 'Prueba', 'precio' => 0]),
            'cantidad 0' => fn () => $this->linea(0, '1.00'),
            'cantidad 1000' => fn () => $this->linea(1000, '1.00'),
            'precio_unitario 0' => fn () => $this->linea(1, '0.00'),
            'telefono 12345678' => fn () => $this->cliente(null, '12345678'),
            'telefono 5555123' => fn () => $this->cliente(null, '5555123'),
            'etapa cancelado' => fn () => $this->oportunidad('cancelado', null, null),
            'rol inexistente' => fn () => DB::table('users')->insert(['name' => 'X', 'email' => 'x@crm.test', 'password' => 'x', 'rol' => 'gerente']),
            'tipo inexistente' => fn () => DB::table('actividades')->insert(['cliente_id' => 1, 'vendedor_id' => 4, 'tipo' => 'correo', 'descripcion' => 'x']),
            'etapa_nueva inexistente' => fn () => DB::table('historial_etapas')->insert(['oportunidad_id' => 7, 'usuario_id' => 4, 'etapa_nueva' => 'x', 'created_at' => self::FECHA]),
            'perdida sin motivo' => fn () => $this->oportunidad('perdida', null, self::FECHA),
            'abierta con motivo' => fn () => $this->oportunidad('propuesta', 'Motivo', null),
            'abierta con fecha_cierre' => fn () => $this->oportunidad('propuesta', null, self::FECHA),
            'ganada sin fecha_cierre' => fn () => $this->oportunidad('ganada', null, null),
            'stock -1' => fn () => DB::table('productos')->where('id', 1)->update(['stock' => -1]),
        ];

        foreach ($rechazos as $caso => $operacion) {
            $this->assertSame(3819, $this->errno($operacion), $caso);
        }

        $this->assertSame(0, $this->errno(function () {
            DB::table('productos')->where('id', 1)->update(['stock' => 0]);
            DB::table('productos')->where('id', 2)->update(['stock' => null]);
        }));
        $this->assertSame(0, $this->errno(fn () => $this->oportunidad('perdida', 'Motivo', self::FECHA)));
    }

    public function test_a1_08_cuentas(): void
    {
        $cuentas = DB::table('users')->orderBy('id')->get()
            ->map(fn ($u) => [$u->id, $u->email, $u->rol, $u->supervisor_id, (bool) $u->activo])->all();

        $this->assertSame([
            [1, 'admin@crm.test', 'administrador', null, true],
            [2, 'sergio@crm.test', 'supervisor', null, true],
            [3, 'sandra@crm.test', 'supervisor', null, true],
            [4, 'valeria@crm.test', 'vendedor', 2, true],
            [5, 'diego@crm.test', 'vendedor', 2, true],
            [6, 'carlos@crm.test', 'vendedor', 3, true],
            [7, 'ivan@crm.test', 'vendedor', 3, false],
        ], $cuentas);

        foreach (DB::table('users')->pluck('password') as $hash) {
            $this->assertStringStartsWith('$2y$', $hash);
            $this->assertTrue(password_verify('Ventas2026', $hash));
        }
    }

    public function test_a1_09_productos(): void
    {
        $productos = DB::table('productos')->orderBy('id')->get()
            ->map(fn ($p) => [$p->nombre, $p->precio, (bool) $p->activo, $p->stock])->all();

        $this->assertSame([
            ['Plan básico', '1200.00', true, null],
            ['Plan avanzado', '2750.50', true, null],
            ['Instalación', '450.00', true, null],
            ['Soporte anual', '3600.00', true, null],
            ['Licencia anterior', '999.99', false, null],
        ], $productos);
    }

    public function test_a1_10_clientes(): void
    {
        $this->assertSame(21, DB::table('clientes')->count());

        $porVendedor = DB::table('clientes')
            ->selectRaw('COALESCE(vendedor_id, 0) AS v, COUNT(*) AS n')
            ->groupBy('v')->orderBy('v')->pluck('n', 'v')->all();

        $this->assertEquals([0 => 6, 4 => 3, 5 => 2, 6 => 9, 7 => 1], $porVendedor);
        $this->assertSame(11, DB::table('clientes')->whereNull('nit')->count());
    }

    public function test_a1_11_oportunidades_y_lineas(): void
    {
        $this->assertSame(11, DB::table('oportunidades')->count());
        $this->assertSame(13, DB::table('oportunidad_productos')->count());
        $this->assertSame('2600.00', DB::table('oportunidad_productos')
            ->where(['oportunidad_id' => 1, 'producto_id' => 2])->value('precio_unitario'));
        $this->assertSame('Eligió a la competencia', DB::table('oportunidades')->where('id', 6)->value('motivo_perdida'));
    }

    public function test_a1_12_historial(): void
    {
        $this->assertSame(43, DB::table('historial_etapas')->count());

        foreach (DB::table('oportunidades')->get() as $o) {
            $h = DB::table('historial_etapas')->where('oportunidad_id', $o->id)->orderBy('created_at')->get();

            $this->assertNull($h->first()->etapa_anterior, "oportunidad $o->id");
            $this->assertSame('prospecto', $h->first()->etapa_nueva, "oportunidad $o->id");
            $this->assertSame($o->etapa, $h->last()->etapa_nueva, "oportunidad $o->id");
            $this->assertTrue($h->every(fn ($r) => $r->usuario_id === $o->vendedor_id), "oportunidad $o->id");

            if ($o->fecha_cierre !== null) {
                $this->assertSame($o->fecha_cierre, $h->last()->created_at, "oportunidad $o->id");
            }
        }

        $this->assertSame('2026-09-23 16:00:00', DB::table('historial_etapas')->where('oportunidad_id', 1)->min('created_at'));
    }

    public function test_a1_13_actividades(): void
    {
        $this->assertSame(4, DB::table('actividades')->count());
        $this->assertSame([1], DB::table('actividades')->where('completada', true)->pluck('id')->all());
    }

    /**
     * Ventas, total y pronóstico de un vendedor, un equipo (id del supervisor) o la empresa (0).
     * El mes se toma en hora de Guatemala por rango UTC [AAAA-MM-01 06:00, mes siguiente-01 06:00).
     */
    private function cifras(int $quien, string $mes): string
    {
        $inicio = "$mes-01 06:00:00";
        $fin = date('Y-m-01 06:00:00', strtotime("$mes-01 +1 month"));
        $alcance = '(u.id = ? OR u.supervisor_id = ? OR ? = 0)';
        $probabilidad = "CASE o.etapa WHEN 'prospecto' THEN 10 WHEN 'calificado' THEN 25 WHEN 'propuesta' THEN 50 WHEN 'negociacion' THEN 75 END";

        $r = DB::selectOne(
            "SELECT
               (SELECT COUNT(*) FROM oportunidades o JOIN users u ON u.id = o.vendedor_id
                 WHERE o.etapa = 'ganada' AND o.fecha_cierre >= ? AND o.fecha_cierre < ? AND $alcance) AS ventas,
               (SELECT COALESCE(SUM(l.cantidad * l.precio_unitario), 0) FROM oportunidades o JOIN users u ON u.id = o.vendedor_id
                 JOIN oportunidad_productos l ON l.oportunidad_id = o.id
                 WHERE o.etapa = 'ganada' AND o.fecha_cierre >= ? AND o.fecha_cierre < ? AND $alcance) AS total,
               (SELECT ROUND(COALESCE(SUM(l.cantidad * l.precio_unitario * $probabilidad / 100), 0), 2)
                 FROM oportunidades o JOIN users u ON u.id = o.vendedor_id
                 JOIN oportunidad_productos l ON l.oportunidad_id = o.id
                 WHERE o.etapa IN ('prospecto', 'calificado', 'propuesta', 'negociacion') AND $alcance) AS pronostico",
            [$inicio, $fin, $quien, $quien, $quien, $inicio, $fin, $quien, $quien, $quien, $quien, $quien, $quien]
        );

        return "$r->ventas|$r->total|$r->pronostico";
    }

    public function test_a1_14_cifras_de_control(): void
    {
        $this->assertSame('2|9250.00|2512.88', $this->cifras(4, '2026-10'), 'Valeria octubre');
        $this->assertSame('1|3600.00|2512.88', $this->cifras(4, '2026-11'), 'Valeria noviembre');
        $this->assertSame('1|6000.00|112.50', $this->cifras(5, '2026-10'), 'Diego octubre');
        $this->assertSame('1|7200.00|4125.75', $this->cifras(6, '2026-10'), 'Carlos octubre');
        $this->assertSame('3|15250.00|2625.38', $this->cifras(2, '2026-10'), 'Equipo de Sergio');
        $this->assertSame('1|7200.00|4125.75', $this->cifras(3, '2026-10'), 'Equipo de Sandra');
        $this->assertSame('4|22450.00|6751.13', $this->cifras(0, '2026-10'), 'Empresa');

        $cartera = DB::table('clientes')->whereIn('vendedor_id', [4, 5, 6])
            ->groupBy('vendedor_id')->orderBy('vendedor_id')->selectRaw('COUNT(*) AS n')->pluck('n')->all();
        $this->assertEquals([3, 2, 9], $cartera);

        $porProducto = collect(DB::select(
            "SELECT p.nombre, SUM(l.cantidad) AS unidades, SUM(l.cantidad * l.precio_unitario) AS total
             FROM oportunidades o
             JOIN oportunidad_productos l ON l.oportunidad_id = o.id
             JOIN productos p ON p.id = l.producto_id
             WHERE o.etapa = 'ganada' AND o.fecha_cierre >= '2026-10-01 06:00:00' AND o.fecha_cierre < '2026-11-01 06:00:00'
             GROUP BY p.id, p.nombre ORDER BY p.id"
        ))->map(fn ($f) => "$f->nombre|$f->unidades|$f->total")->all();

        $this->assertSame([
            'Plan básico|5|6000.00',
            'Plan avanzado|2|5200.00',
            'Instalación|1|450.00',
            'Soporte anual|3|10800.00',
        ], $porProducto);
    }

    public function test_a1_15_semilla_repetible(): void
    {
        Artisan::call('migrate:fresh', ['--seeder' => VerificacionSeeder::class, '--force' => true]);

        $this->assertSame(43, DB::table('historial_etapas')->count());
        $this->assertSame('2|9250.00|2512.88', $this->cifras(4, '2026-10'));
        $this->assertSame('Valeria López', DB::table('users')->where('id', 4)->value('name'));
    }

    public function test_modelos_relaciones_y_casts(): void
    {
        $o = Oportunidad::with('lineas', 'productos', 'historial.usuario', 'vendedor.supervisor')->find(1);

        $this->assertSame('Sergio Ruiz', $o->vendedor->supervisor->name);
        $this->assertCount(2, $o->lineas);
        $this->assertSame('2600.00', $o->lineas->firstWhere('producto_id', 2)->precio_unitario);
        $this->assertInstanceOf(CarbonInterface::class, $o->fecha_cierre);
        $this->assertSame('2026-10-05T16:00:00Z', $o->fecha_cierre->toIso8601ZuluString());
        $this->assertSame('Valeria López', $o->historial->first()->usuario->name);
        $this->assertSame('2750.50', Producto::find(2)->precio);
        $this->assertFalse(User::find(7)->activo);
        $this->assertTrue(Actividad::find(1)->completada);
        $this->assertSame(9, User::find(6)->clientes()->count());
    }
}
