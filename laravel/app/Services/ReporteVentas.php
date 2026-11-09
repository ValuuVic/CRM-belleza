<?php

namespace App\Services;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Única implementación en el panel de las cifras de docs/specs/A5-equipos-reportes.md §5: ventas (C1),
 * total vendido (C2), pronóstico (C3) y cartera (C4). La usan Equipo, Oportunidades y Reportes; la API (A6)
 * implementa la misma definición en SQL.
 *
 * - Mes de Guatemala como rango UTC [AAAA-MM-01 06:00, mes siguiente 06:00), calculado aquí y pasado
 *   como binding (§5.1).
 * - Todo se calcula en MySQL con DECIMAL y se redondea a 2 decimales una sola vez, después de sumar cada
 *   alcance o cada fila de un desglose (§5.3). Los montos vuelven como texto ("9250.00"): nunca pasan por
 *   float en PHP; App\Support\Quetzales los formatea.
 * - Las únicas expresiones crudas son las constantes de esta clase (SQL fijo, sin datos del usuario).
 */
class ReporteVentas
{
    public const MAXIMO_CARTERA = AsignacionClientes::MAXIMO_CARTERA;

    public const ETAPAS_ABIERTAS = ['prospecto', 'calificado', 'propuesta', 'negociacion'];

    /**
     * Probabilidad por etapa abierta (§5.2); la misma que PROBABILIDAD de api/src/servicios/embudo.js.
     */
    private const PROBABILIDAD = "CASE o.etapa WHEN 'prospecto' THEN 10 WHEN 'calificado' THEN 25 WHEN 'propuesta' THEN 50 WHEN 'negociacion' THEN 75 END";

    private const TOTAL = 'ROUND(COALESCE(SUM(l.cantidad * l.precio_unitario), 0), 2)';

    private const PRONOSTICO = 'ROUND(COALESCE(SUM(l.cantidad * l.precio_unitario * '.self::PROBABILIDAD.' / 100), 0), 2)';

    /**
     * Mes actual en hora de Guatemala, «AAAA-MM».
     */
    public function mesActual(): string
    {
        return CarbonImmutable::now('America/Guatemala')->format('Y-m');
    }

    /**
     * Rango UTC del mes de Guatemala (§5.1): [inicio, fin).
     *
     * @return array{0: string, 1: string}
     */
    public function rango(string $mes): array
    {
        $inicio = CarbonImmutable::createFromFormat('Y-m-d H:i:s', "$mes-01 06:00:00", 'UTC');

        return [$inicio->format('Y-m-d H:i:s'), $inicio->addMonthNoOverflow()->format('Y-m-d H:i:s')];
    }

    /**
     * Alcance de quien consulta (DA5-2, P5): el administrador ve la empresa y el supervisor, su equipo.
     * Con un vendedor, se reduce a él; si no está en el equipo del supervisor (o no existe), el alcance es
     * «ninguno» y las cifras salen vacías, sin confirmar si ese vendedor existe.
     */
    public function alcancePara(User $usuario, ?int $vendedorId = null): Alcance
    {
        $esAdministrador = $usuario->rol === 'administrador';

        if ($vendedorId === null) {
            return $esAdministrador ? Alcance::empresa() : Alcance::equipo($usuario->id);
        }

        $visible = User::whereKey($vendedorId)->where('rol', 'vendedor')
            ->when(! $esAdministrador, fn ($q) => $q->where('supervisor_id', $usuario->id))
            ->exists();

        return $visible ? Alcance::vendedor($vendedorId) : Alcance::ninguno();
    }

    /**
     * Ventas (C1), total (C2) y pronóstico (C3) de un alcance en un mes.
     *
     * @return array{ventas: int, total: string, pronostico: string}
     */
    public function resumen(Alcance $alcance, string $mes): array
    {
        return [
            'ventas' => $this->ventasDelMes($alcance, $mes)->count(),
            'total' => (string) $this->conLineas($this->ventasDelMes($alcance, $mes))
                ->selectRaw(self::TOTAL.' AS total')->value('total'),
            'pronostico' => (string) $this->conLineas($this->abiertas($alcance))
                ->selectRaw(self::PRONOSTICO.' AS pronostico')->value('pronostico'),
        ];
    }

    /**
     * Clientes actuales de un vendedor (C4); no depende del mes.
     */
    public function cartera(int $vendedorId): int
    {
        return DB::table('clientes')->where('vendedor_id', $vendedorId)->count();
    }

    /**
     * Desglose por vendedor (§5.3): parte de los vendedores del alcance, activos o no, con LEFT JOIN a
     * sus ventas del mes y a sus abiertas, para que un vendedor sin ventas aparezca con 0 (A5-18).
     * Cada fila se redondea por separado.
     *
     * @return Collection<int, object{id: int, name: string, activo: int, supervisor_id: ?int, cartera: int, ventas: int, total: string, pronostico: string}>
     */
    public function porVendedor(Alcance $alcance, string $mes): Collection
    {
        $ventas = $this->ventasDelMes(Alcance::empresa(), $mes)
            ->groupBy('o.vendedor_id')->select('o.vendedor_id')->selectRaw('COUNT(*) AS ventas');
        $totales = $this->conLineas($this->ventasDelMes(Alcance::empresa(), $mes))
            ->groupBy('o.vendedor_id')->select('o.vendedor_id')->selectRaw(self::TOTAL.' AS total');
        $pronosticos = $this->conLineas($this->abiertas(Alcance::empresa()))
            ->groupBy('o.vendedor_id')->select('o.vendedor_id')->selectRaw(self::PRONOSTICO.' AS pronostico');
        $carteras = DB::table('clientes')->whereNotNull('vendedor_id')
            ->groupBy('vendedor_id')->select('vendedor_id')->selectRaw('COUNT(*) AS cartera');

        return $this->vendedoresDel($alcance)
            ->leftJoinSub($ventas, 'v', 'v.vendedor_id', '=', 'u.id')
            ->leftJoinSub($totales, 't', 't.vendedor_id', '=', 'u.id')
            ->leftJoinSub($pronosticos, 'f', 'f.vendedor_id', '=', 'u.id')
            ->leftJoinSub($carteras, 'c', 'c.vendedor_id', '=', 'u.id')
            ->select('u.id', 'u.name', 'u.activo', 'u.supervisor_id')
            ->selectRaw('COALESCE(c.cartera, 0) AS cartera, COALESCE(v.ventas, 0) AS ventas')
            ->selectRaw('COALESCE(t.total, 0.00) AS total, COALESCE(f.pronostico, 0.00) AS pronostico')
            ->orderBy('u.name')->orderBy('u.id')
            ->get()
            ->map(function (object $fila) {
                $fila->cartera = (int) $fila->cartera;
                $fila->ventas = (int) $fila->ventas;
                $fila->total = (string) $fila->total;
                $fila->pronostico = (string) $fila->pronostico;

                return $fila;
            });
    }

    /**
     * Desglose por producto (DA5-5, §5.3): unidades y total de las ventas del mes, y pronóstico de las
     * abiertas, del alcance. Incluye los productos inactivos que tengan cifras. La suma por producto puede
     * diferir un centavo del pronóstico del alcance por el redondeo de cada fila, y no se ajusta.
     *
     * @return Collection<int, object{id: int, nombre: string, activo: int, unidades: int, total: string, pronostico: string}>
     */
    public function porProducto(Alcance $alcance, string $mes): Collection
    {
        $vendidos = $this->conLineas($this->ventasDelMes($alcance, $mes))
            ->groupBy('l.producto_id')->select('l.producto_id')
            ->selectRaw('SUM(l.cantidad) AS unidades')->selectRaw(self::TOTAL.' AS total');
        $previstos = $this->conLineas($this->abiertas($alcance))
            ->groupBy('l.producto_id')->select('l.producto_id')->selectRaw(self::PRONOSTICO.' AS pronostico');

        return DB::table('productos as p')
            ->leftJoinSub($vendidos, 'v', 'v.producto_id', '=', 'p.id')
            ->leftJoinSub($previstos, 'f', 'f.producto_id', '=', 'p.id')
            ->where(fn (Builder $q) => $q->whereNotNull('v.producto_id')->orWhereNotNull('f.producto_id'))
            ->select('p.id', 'p.nombre', 'p.activo')
            ->selectRaw('COALESCE(v.unidades, 0) AS unidades, COALESCE(v.total, 0.00) AS total, COALESCE(f.pronostico, 0.00) AS pronostico')
            ->orderBy('p.id')
            ->get()
            ->map(function (object $fila) {
                $fila->unidades = (int) $fila->unidades;
                $fila->total = (string) $fila->total;
                $fila->pronostico = (string) $fila->pronostico;

                return $fila;
            });
    }

    /**
     * Vendedores (rol vendedor, activos o no) del alcance.
     */
    private function vendedoresDel(Alcance $alcance): Builder
    {
        $consulta = DB::table('users as u')->where('u.rol', 'vendedor');

        return match ($alcance->tipo) {
            'vendedor' => $consulta->where('u.id', $alcance->id),
            'equipo' => $consulta->where('u.supervisor_id', $alcance->id),
            'empresa' => $consulta,
            'ninguno' => $consulta->whereRaw('1 = 0'),
        };
    }

    /**
     * C1: oportunidades ganadas con cierre en el rango UTC del mes, del alcance.
     */
    private function ventasDelMes(Alcance $alcance, string $mes): Builder
    {
        [$inicio, $fin] = $this->rango($mes);

        return $this->filtrar(DB::table('oportunidades as o')
            ->where('o.etapa', 'ganada')
            ->where('o.fecha_cierre', '>=', $inicio)
            ->where('o.fecha_cierre', '<', $fin), $alcance);
    }

    /**
     * Base de C3: oportunidades abiertas del alcance, sin filtro de mes.
     */
    private function abiertas(Alcance $alcance): Builder
    {
        return $this->filtrar(DB::table('oportunidades as o')->whereIn('o.etapa', self::ETAPAS_ABIERTAS), $alcance);
    }

    private function conLineas(Builder $oportunidades): Builder
    {
        return $oportunidades->join('oportunidad_productos as l', 'l.oportunidad_id', '=', 'o.id');
    }

    /**
     * {alcance} de §5.3 sobre oportunidades (DA5-2): la venta es de quien la cerró (DA5-1).
     */
    private function filtrar(Builder $oportunidades, Alcance $alcance): Builder
    {
        return match ($alcance->tipo) {
            'vendedor' => $oportunidades->where('o.vendedor_id', $alcance->id),
            'equipo' => $oportunidades->whereIn('o.vendedor_id', DB::table('users')->select('id')->where('supervisor_id', $alcance->id)),
            'empresa' => $oportunidades,
            'ninguno' => $oportunidades->whereRaw('1 = 0'),
        };
    }
}
