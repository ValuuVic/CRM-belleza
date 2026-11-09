<?php

namespace Database\Seeders;

use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Datos propios de la distribuidora de maquillaje (especificación §13.2).
 *
 * Se carga después de VerificacionSeeder con `php artisan migrate:fresh --seed`.
 * - Equipo propio (supervisora Lucía Mendoza con Andrea y Kevin) para no tocar las cifras de los
 *   equipos de Sergio y Sandra.
 * - Ids automáticos: no reutiliza ningún id de la semilla oficial.
 * - Correos, NIT (módulo 11 válidos) y teléfonos que no existen en la semilla oficial; máximo
 *   10 clientes por vendedor.
 * - Stock ya descontado de las ventas ganadas. «Rubor en polvo dúo» tiene 3 unidades y la
 *   oportunidad en negociación de la Academia pide 5: sirve para demostrar el 409 de la regla de stock.
 * - Fechas en UTC.
 */
class SectorSeeder extends Seeder
{
    private const ALTA = '2026-09-01 15:00:00';

    /**
     * Última fecha del historial de las oportunidades que siguen abiertas.
     */
    private const ULTIMO_REGISTRO_ABIERTA = '2026-11-06 16:00:00';

    private const ETAPAS_ABIERTAS = ['prospecto', 'calificado', 'propuesta', 'negociacion'];

    /** @var array<string, int> correo → id */
    private array $cuentas = [];

    /** @var array<string, array{id: int, precio: string}> nombre → producto */
    private array $productos = [];

    /** @var array<string, int> nombre → id */
    private array $clientes = [];

    public function run(): void
    {
        DB::transaction(function () {
            $this->cuentas();
            $this->productos();
            $this->clientes();
            $this->oportunidades();
            $this->actividades();
        });
    }

    private function cuentas(): void
    {
        $this->cuentas['lucia@crm.test'] = $this->crearCuenta('Lucía Mendoza', 'lucia@crm.test', 'supervisor', null);
        $supervisora = $this->cuentas['lucia@crm.test'];

        $this->cuentas['andrea@crm.test'] = $this->crearCuenta('Andrea Chávez', 'andrea@crm.test', 'vendedor', $supervisora);
        $this->cuentas['kevin@crm.test'] = $this->crearCuenta('Kevin Pac', 'kevin@crm.test', 'vendedor', $supervisora);
    }

    private function crearCuenta(string $nombre, string $correo, string $rol, ?int $supervisor): int
    {
        return DB::table('users')->insertGetId([
            'name' => $nombre,
            'email' => $correo,
            'password' => Hash::make('Ventas2026'),
            'rol' => $rol,
            'supervisor_id' => $supervisor,
            'activo' => true,
            'created_at' => self::ALTA,
            'updated_at' => self::ALTA,
        ]);
    }

    private function productos(): void
    {
        $productos = [
            // [nombre, precio, stock (NULL = sin control de inventario), activo]
            ['Base líquida HD 30 ml', '185.00', 28, true],
            ['Labial mate larga duración', '65.00', 96, true],
            ['Paleta de sombras 12 tonos', '240.00', 25, true],
            ['Máscara de pestañas a prueba de agua', '95.00', 60, true],
            ['Set de brochas profesionales 10 piezas', '320.00', 15, true],
            ['Polvo compacto translúcido', '110.00', 20, true],
            ['Desmaquillante bifásico 150 ml', '78.00', 80, true],
            ['Rubor en polvo dúo', '89.00', 3, true],
            ['Taller de maquillaje para personal', '1500.00', null, true],
            ['Delineador líquido (descontinuado)', '55.00', 0, false],
        ];

        foreach ($productos as [$nombre, $precio, $stock, $activo]) {
            $id = DB::table('productos')->insertGetId([
                'nombre' => $nombre,
                'precio' => $precio,
                'stock' => $stock,
                'activo' => $activo,
                'created_at' => self::ALTA,
                'updated_at' => self::ALTA,
            ]);
            $this->productos[$nombre] = ['id' => $id, 'precio' => $precio];
        }
    }

    private function clientes(): void
    {
        $andrea = $this->cuentas['andrea@crm.test'];
        $kevin = $this->cuentas['kevin@crm.test'];

        $clientes = [
            // [vendedor_id (NULL = disponible), nombre, nit (NULL = CF), telefono, correo]
            [$andrea, 'Salón Belleza Divina', '30114578', '77800101', 'compras@bellezadivina.test'],
            [$andrea, 'Estética Glamour Totonicapán', '55129838', '77800202', null],
            [$andrea, 'Sofía Ixcot (maquilladora)', null, '47110003', null],
            [$andrea, 'Cosméticos La Rosa', '72405619', '77800404', 'pedidos@larosa.test'],
            [$andrea, 'Spa Las Orquídeas', '66283140', '77800505', null],
            [$kevin, 'Distribuidora Belleza San Marcos', '81930275', '77600606', 'gerencia@bellezasm.test'],
            [$kevin, 'Salón Uñas y Estilo', null, '47110007', null],
            [$kevin, 'Peluquería Estilo Mam', '29057469', '77600808', null],
            [$kevin, 'Academia de Belleza Quetzaltenango', '44173822', '77800909', 'direccion@academiaxela.test'],
            [null, 'Boutique Encanto', '90312759', '77801010', null],
            [null, 'Karla Sic (maquilladora)', null, '47110011', null],
            [null, 'Barbería y Salón Los Altos', null, '47110012', null],
        ];

        foreach ($clientes as [$vendedor, $nombre, $nit, $telefono, $correo]) {
            $this->clientes[$nombre] = DB::table('clientes')->insertGetId([
                'vendedor_id' => $vendedor,
                'nombre' => $nombre,
                'nit' => $nit,
                'telefono' => $telefono,
                'correo' => $correo,
                'created_at' => self::ALTA,
                'updated_at' => self::ALTA,
            ]);
        }
    }

    private function oportunidades(): void
    {
        $andrea = $this->cuentas['andrea@crm.test'];
        $kevin = $this->cuentas['kevin@crm.test'];

        $oportunidades = [
            // [titulo, cliente, vendedor_id, etapa, fecha_cierre, motivo_perdida, líneas [producto, cantidad]]
            ['Surtido navideño', 'Salón Belleza Divina', $andrea, 'ganada', '2026-10-20 18:00:00', null,
                [['Labial mate larga duración', 24], ['Base líquida HD 30 ml', 12]]],
            ['Pedido de brochas', 'Estética Glamour Totonicapán', $andrea, 'perdida', '2026-10-28 17:00:00',
                'Eligió un proveedor con precio menor', [['Set de brochas profesionales 10 piezas', 5]]],
            ['Reposición mensual', 'Cosméticos La Rosa', $andrea, 'negociacion', null, null,
                [['Máscara de pestañas a prueba de agua', 20], ['Desmaquillante bifásico 150 ml', 15]]],
            ['Capacitación del personal del spa', 'Spa Las Orquídeas', $andrea, 'propuesta', null, null,
                [['Taller de maquillaje para personal', 1]]],
            ['Kit para eventos', 'Sofía Ixcot (maquilladora)', $andrea, 'prospecto', null, null,
                [['Paleta de sombras 12 tonos', 2]]],
            ['Pedido inaugural', 'Distribuidora Belleza San Marcos', $kevin, 'ganada', '2026-11-05 16:30:00', null,
                [['Polvo compacto translúcido', 30], ['Rubor en polvo dúo', 10]]],
            ['Temporada de bodas', 'Peluquería Estilo Mam', $kevin, 'calificado', null, null,
                [['Paleta de sombras 12 tonos', 6], ['Labial mate larga duración', 30]]],
            ['Material para alumnas', 'Academia de Belleza Quetzaltenango', $kevin, 'negociacion', null, null,
                [['Set de brochas profesionales 10 piezas', 10], ['Rubor en polvo dúo', 5]]],
            ['Productos de cuidado', 'Salón Uñas y Estilo', $kevin, 'prospecto', null, null, []],
        ];

        foreach ($oportunidades as [$titulo, $cliente, $vendedor, $etapa, $cierre, $motivo, $lineas]) {
            $recorrido = $this->recorrido($etapa);
            $fechas = $this->fechasHistorial(count($recorrido), $cierre ?? self::ULTIMO_REGISTRO_ABIERTA);
            $creada = $fechas[0];

            $id = DB::table('oportunidades')->insertGetId([
                'cliente_id' => $this->clientes[$cliente],
                'vendedor_id' => $vendedor,
                'titulo' => $titulo,
                'etapa' => $etapa,
                'motivo_perdida' => $motivo,
                'fecha_cierre' => $cierre,
                'created_at' => $creada,
                'updated_at' => end($fechas),
            ]);

            // El precio unitario es una copia del catálogo al agregar la línea.
            foreach ($lineas as [$producto, $cantidad]) {
                DB::table('oportunidad_productos')->insert([
                    'oportunidad_id' => $id,
                    'producto_id' => $this->productos[$producto]['id'],
                    'cantidad' => $cantidad,
                    'precio_unitario' => $this->productos[$producto]['precio'],
                    'created_at' => $creada,
                    'updated_at' => $creada,
                ]);
            }

            foreach ($recorrido as $i => $etapaNueva) {
                DB::table('historial_etapas')->insert([
                    'oportunidad_id' => $id,
                    'usuario_id' => $vendedor,
                    'etapa_anterior' => $i === 0 ? null : $recorrido[$i - 1],
                    'etapa_nueva' => $etapaNueva,
                    'created_at' => $fechas[$i],
                ]);
            }
        }
    }

    /**
     * Etapas recorridas hasta la actual: las ganadas pasan por las cuatro abiertas y la perdida
     * se perdió desde propuesta (transiciones de la decisión D1).
     *
     * @return list<string>
     */
    private function recorrido(string $etapa): array
    {
        return match ($etapa) {
            'ganada' => [...self::ETAPAS_ABIERTAS, 'ganada'],
            'perdida' => ['prospecto', 'calificado', 'propuesta', 'perdida'],
            default => array_slice(self::ETAPAS_ABIERTAS, 0, array_search($etapa, self::ETAPAS_ABIERTAS, true) + 1),
        };
    }

    /**
     * Tres días entre registros, terminando en $ultima.
     *
     * @return list<string>
     */
    private function fechasHistorial(int $registros, string $ultima): array
    {
        $fin = CarbonImmutable::parse($ultima, 'UTC');

        $fechas = [];
        for ($i = $registros - 1; $i >= 0; $i--) {
            $fechas[] = $fin->subDays(3 * $i)->format('Y-m-d H:i:s');
        }

        return $fechas;
    }

    private function actividades(): void
    {
        $andrea = $this->cuentas['andrea@crm.test'];
        $kevin = $this->cuentas['kevin@crm.test'];

        $actividades = [
            // [cliente, vendedor_id, tipo, descripcion, vence_en (UTC), completada]
            ['Salón Belleza Divina', $andrea, 'llamada', 'Confirmar entrega del surtido navideño', '2026-10-22 16:00:00', true],
            ['Cosméticos La Rosa', $andrea, 'reunion', 'Negociar descuento por volumen en máscaras', '2030-01-20 16:00:00', false],
            ['Spa Las Orquídeas', $andrea, 'tarea', 'Enviar temario del taller de maquillaje', '2026-10-30 18:00:00', false],
            ['Academia de Belleza Quetzaltenango', $kevin, 'llamada', 'Avisar que solo hay 3 rubores en existencia', '2030-02-05 15:00:00', false],
            ['Peluquería Estilo Mam', $kevin, 'reunion', 'Mostrar paletas para la temporada de bodas', null, false],
        ];

        foreach ($actividades as [$cliente, $vendedor, $tipo, $descripcion, $vence, $completada]) {
            DB::table('actividades')->insert([
                'cliente_id' => $this->clientes[$cliente],
                'vendedor_id' => $vendedor,
                'tipo' => $tipo,
                'descripcion' => $descripcion,
                'vence_en' => $vence,
                'completada' => $completada,
                'created_at' => self::ALTA,
                'updated_at' => self::ALTA,
            ]);
        }
    }
}