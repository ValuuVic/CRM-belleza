<?php

namespace Database\Seeders;

use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Semilla oficial de verificación (enunciado §11; docs/specs/A1-migraciones.md §6).
 *
 * Los datos y las cifras de control son los mismos para todas las parejas: no se modifican.
 * Todas las fechas están en UTC.
 */
class VerificacionSeeder extends Seeder
{
    /**
     * Fecha de alta de cuentas, productos, clientes y actividades (DA1-5).
     */
    private const ALTA = '2026-08-01 15:00:00';

    /**
     * Última fecha del historial de una oportunidad que sigue abierta.
     */
    private const ULTIMO_REGISTRO_ABIERTA = '2026-10-02 16:00:00';

    private const ETAPAS_ABIERTAS = ['prospecto', 'calificado', 'propuesta', 'negociacion'];

    /**
     * Seed the application's database.
     */
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
        $cuentas = [
            // [id, name, email, rol, supervisor_id, activo]
            [1, 'Alicia Morales', 'admin@crm.test', 'administrador', null, true],
            [2, 'Sergio Ruiz', 'sergio@crm.test', 'supervisor', null, true],
            [3, 'Sandra Pérez', 'sandra@crm.test', 'supervisor', null, true],
            [4, 'Valeria López', 'valeria@crm.test', 'vendedor', 2, true],
            [5, 'Diego Castillo', 'diego@crm.test', 'vendedor', 2, true],
            [6, 'Carlos Ajú', 'carlos@crm.test', 'vendedor', 3, true],
            [7, 'Iván Toj', 'ivan@crm.test', 'vendedor', 3, false],
        ];

        foreach ($cuentas as [$id, $nombre, $correo, $rol, $supervisor, $activo]) {
            DB::table('users')->insert([
                'id' => $id,
                'name' => $nombre,
                'email' => $correo,
                'password' => Hash::make('Ventas2026'),
                'rol' => $rol,
                'supervisor_id' => $supervisor,
                'activo' => $activo,
                'created_at' => self::ALTA,
                'updated_at' => self::ALTA,
            ]);
        }
    }

    private function productos(): void
    {
        $productos = [
            // [id, nombre, precio, activo]; stock NULL: sin control de inventario (RP-06).
            [1, 'Plan básico', '1200.00', true],
            [2, 'Plan avanzado', '2750.50', true],
            [3, 'Instalación', '450.00', true],
            [4, 'Soporte anual', '3600.00', true],
            [5, 'Licencia anterior', '999.99', false],
        ];

        foreach ($productos as [$id, $nombre, $precio, $activo]) {
            DB::table('productos')->insert([
                'id' => $id,
                'nombre' => $nombre,
                'precio' => $precio,
                'activo' => $activo,
                'stock' => null,
                'created_at' => self::ALTA,
                'updated_at' => self::ALTA,
            ]);
        }
    }

    private function clientes(): void
    {
        $clientes = [
            // [id, vendedor_id, nombre, nit (NULL = CF), telefono, correo]
            [1, 4, 'Comercial El Quetzal', '4521817K', '55551234', 'compras@elquetzal.test'],
            [2, 4, 'Ferretería Xela', '98765434', '77612345', null],
            [3, 4, 'María Coyoy', null, '41234567', null],
            [4, 5, 'Farmacia Los Altos', '34567895', '77634567', 'gerencia@losaltos.test'],
            [5, 5, 'Luis Tzul', null, '52345678', null],
            [6, 6, 'Abarrotes San Juan', '12345679', '77651001', null],
            [7, 6, 'Panadería La Esperanza', null, '30001002', null],
            [8, 6, 'Taller El Volcán', '22233342', '77651003', null],
            [9, 6, 'Ana Xicará', null, '30001004', null],
            [10, 6, 'Librería Cantel', '55566677', '77651005', null],
            [11, 6, 'Pedro Batz', null, '30001006', null],
            [12, 6, 'Tienda La Bendición', null, '30001007', null],
            [13, 6, 'Distribuidora Occidente', '77788893', '77651008', null],
            [14, 6, 'Rosa Tax', null, '30001009', null],
            [15, 7, 'Hotel Los Pinos', '66655544', '77661001', null],
            [16, null, 'Agencia Cuatro Caminos', null, '30002001', null],
            [17, null, 'Café Zunil', null, '30002002', null],
            [18, null, 'Clínica San Rafael', '8889990K', '77672003', null],
            [19, null, 'Constructora Altiplano', '44433328', '77672004', null],
            [20, null, 'Escuela Futuro', null, '30002005', null],
            [21, null, 'Gimnasio Fuerza', null, '30002006', null],
        ];

        foreach ($clientes as [$id, $vendedor, $nombre, $nit, $telefono, $correo]) {
            DB::table('clientes')->insert([
                'id' => $id,
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
        $oportunidades = [
            // [id, titulo, cliente_id, vendedor_id, etapa, fecha_cierre, motivo_perdida, líneas]
            // Cada línea: [id, producto_id, cantidad, precio_unitario guardado].
            [1, 'Renovación de planes', 1, 4, 'ganada', '2026-10-05 16:00:00', null, [[1, 2, 2, '2600.00'], [2, 3, 1, '450.00']]],
            [2, 'Equipo para sucursal', 2, 4, 'ganada', '2026-11-01 03:30:00', null, [[3, 1, 3, '1200.00']]],
            [3, 'Soporte del hogar', 3, 4, 'ganada', '2026-11-01 06:30:00', null, [[4, 4, 1, '3600.00']]],
            [4, 'Ampliación a bodega', 1, 4, 'negociacion', null, null, [[5, 2, 1, '2750.50']]],
            [5, 'Capacitación de personal', 2, 4, 'propuesta', null, null, [[6, 3, 2, '450.00']]],
            [6, 'Plan familiar', 3, 4, 'perdida', '2026-10-20 18:00:00', 'Eligió a la competencia', [[7, 1, 1, '1200.00'], [8, 5, 1, '999.99']]],
            [7, 'Seguimiento anual', 1, 4, 'prospecto', null, null, []],
            [8, 'Licencias de caja', 4, 5, 'ganada', '2026-10-10 15:00:00', null, [[9, 1, 2, '1200.00'], [10, 4, 1, '3600.00']]],
            [9, 'Mantenimiento', 5, 5, 'calificado', null, null, [[11, 3, 1, '450.00']]],
            [10, 'Plan anual', 6, 6, 'ganada', '2026-10-15 20:00:00', null, [[12, 4, 2, '3600.00']]],
            [11, 'Cotización de equipo', 8, 6, 'negociacion', null, null, [[13, 2, 2, '2750.50']]],
        ];

        foreach ($oportunidades as [$id, $titulo, $cliente, $vendedor, $etapa, $cierre, $motivo, $lineas]) {
            $fechas = $this->fechasHistorial($etapa, $cierre ?? self::ULTIMO_REGISTRO_ABIERTA);
            $recorrido = $this->recorrido($etapa);
            $creada = $fechas[0];

            DB::table('oportunidades')->insert([
                'id' => $id,
                'cliente_id' => $cliente,
                'vendedor_id' => $vendedor,
                'titulo' => $titulo,
                'etapa' => $etapa,
                'motivo_perdida' => $motivo,
                'fecha_cierre' => $cierre,
                'created_at' => $creada,
                'updated_at' => end($fechas),
            ]);

            foreach ($lineas as [$lineaId, $producto, $cantidad, $precio]) {
                DB::table('oportunidad_productos')->insert([
                    'id' => $lineaId,
                    'oportunidad_id' => $id,
                    'producto_id' => $producto,
                    'cantidad' => $cantidad,
                    'precio_unitario' => $precio,
                    'created_at' => $creada,
                    'updated_at' => $creada,
                ]);
            }

            // Un registro por etapa recorrida: el de creación (NULL → prospecto) y uno por cada avance.
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
     * Etapas que recorrió una oportunidad hasta la actual. Las ganadas pasan por las cuatro
     * abiertas; la perdida de la semilla («Plan familiar») se perdió desde propuesta.
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
     * Fechas del historial: tres días entre registros, terminando en $ultima.
     *
     * @return list<string>
     */
    private function fechasHistorial(string $etapa, string $ultima): array
    {
        $registros = count($this->recorrido($etapa));
        $fin = CarbonImmutable::parse($ultima, 'UTC');

        $fechas = [];
        for ($i = $registros - 1; $i >= 0; $i--) {
            $fechas[] = $fin->subDays(3 * $i)->format('Y-m-d H:i:s');
        }

        return $fechas;
    }

    private function actividades(): void
    {
        $actividades = [
            // [id, cliente_id, vendedor_id, tipo, descripcion, vence_en, completada]
            [1, 1, 4, 'llamada', 'Confirmar fecha de instalación', '2026-10-08 15:00:00', true],
            [2, 2, 4, 'tarea', 'Enviar propuesta de capacitación', '2030-01-15 15:00:00', false],
            [3, 3, 4, 'reunion', 'Presentar opciones de soporte', '2026-09-01 15:00:00', false],
            [4, 4, 5, 'llamada', 'Renovación de licencias', '2030-02-01 15:00:00', false],
        ];

        foreach ($actividades as [$id, $cliente, $vendedor, $tipo, $descripcion, $vence, $completada]) {
            DB::table('actividades')->insert([
                'id' => $id,
                'cliente_id' => $cliente,
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
