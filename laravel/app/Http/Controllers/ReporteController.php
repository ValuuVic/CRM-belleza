<?php

namespace App\Http\Controllers;

use App\Http\Requests\FiltroMesRequest;
use App\Models\User;
use App\Services\Alcance;
use App\Services\ReporteVentas;
use Carbon\CarbonImmutable;
use Illuminate\View\View;

/**
 * Reporte mensual (L6-02; A5-13 a A5-15, A5-18): totales del alcance, desglose por vendedor y por
 * producto, y para el administrador el subtotal de cada equipo y el total de la empresa. Un ?vendedor=
 * fuera del alcance da un reporte vacío (P5). Todas las cifras salen de ReporteVentas.
 */
class ReporteController extends Controller
{
    public function index(FiltroMesRequest $request, ReporteVentas $reporte): View
    {
        $usuario = $request->user();
        $esAdministrador = $usuario->rol === 'administrador';
        $mes = $request->mes($reporte);
        $alcance = $reporte->alcancePara($usuario, $request->vendedorId());

        $equipos = $esAdministrador && $request->vendedorId() === null
            ? User::where('rol', 'supervisor')->orderBy('name')->get(['id', 'name'])
                ->map(fn (User $supervisor) => (object) [
                    'supervisor' => $supervisor,
                    'cifras' => $reporte->resumen(Alcance::equipo($supervisor->id), $mes),
                ])
            : collect();

        return view('reportes.index', [
            'mes' => $mes,
            'nombreMes' => CarbonImmutable::createFromFormat('!Y-m', $mes)->locale('es')->translatedFormat('F \d\e Y'),
            'titulo' => match ($alcance->tipo) {
                'empresa' => 'Empresa',
                'equipo' => 'Mi equipo',
                default => 'Vendedor',
            },
            'resumen' => $reporte->resumen($alcance, $mes),
            'porVendedor' => $reporte->porVendedor($alcance, $mes),
            'porProducto' => $reporte->porProducto($alcance, $mes),
            'equipos' => $equipos,
            'vendedores' => User::where('rol', 'vendedor')
                ->when(! $esAdministrador, fn ($q) => $q->where('supervisor_id', $usuario->id))
                ->orderBy('name')->get(['id', 'name', 'activo']),
            'vendedor' => $request->vendedorId(),
            'maximo' => ReporteVentas::MAXIMO_CARTERA,
        ]);
    }
}
