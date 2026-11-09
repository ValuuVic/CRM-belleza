<?php

namespace App\Http\Controllers;

use App\Http\Requests\FiltroMesRequest;
use App\Models\User;
use App\Services\Alcance;
use App\Services\ReporteVentas;
use Carbon\CarbonImmutable;
use Illuminate\View\View;

/**
 * Página del equipo (L5-03; A5-06, A5-07, A5-18): cada vendedor, activo o no, con su cartera y sus
 * ventas, total y pronóstico del mes. El supervisor ve su equipo; el administrador, todos los equipos con
 * su subtotal y el total de la empresa (P3). Las cifras salen de ReporteVentas.
 */
class EquipoController extends Controller
{
    public function index(FiltroMesRequest $request, ReporteVentas $reporte): View
    {
        $usuario = $request->user();
        $mes = $request->mes($reporte);

        $supervisores = $usuario->rol === 'administrador'
            ? User::where('rol', 'supervisor')->orderBy('name')->get(['id', 'name', 'activo'])
            : collect([$usuario]);

        $equipos = $supervisores->map(fn (User $supervisor) => (object) [
            'supervisor' => $supervisor,
            'vendedores' => $reporte->porVendedor(Alcance::equipo($supervisor->id), $mes),
            'subtotal' => $reporte->resumen(Alcance::equipo($supervisor->id), $mes),
        ]);

        return view('equipo.index', [
            'mes' => $mes,
            'nombreMes' => CarbonImmutable::createFromFormat('!Y-m', $mes)->locale('es')->translatedFormat('F \d\e Y'),
            'equipos' => $equipos,
            'empresa' => $usuario->rol === 'administrador' ? $reporte->resumen(Alcance::empresa(), $mes) : null,
            'maximo' => ReporteVentas::MAXIMO_CARTERA,
        ]);
    }
}
