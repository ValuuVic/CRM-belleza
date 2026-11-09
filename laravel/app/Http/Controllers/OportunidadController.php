<?php

namespace App\Http\Controllers;

use App\Http\Requests\OportunidadIndexRequest;
use App\Models\Oportunidad;
use App\Models\User;
use App\Services\ReporteVentas;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\View\View;

/**
 * Oportunidades en solo lectura (L6-01; A5-09 a A5-12). El administrador ve todas; el supervisor, las de
 * su equipo ({oportunidad} fuera del alcance → 404, AppServiceProvider). El total se calcula en la base
 * con la expresión de ReporteVentas; las fechas se muestran en America/Guatemala. No hay escrituras.
 */
class OportunidadController extends Controller
{
    public function index(OportunidadIndexRequest $request, ReporteVentas $reporte): View
    {
        $usuario = $request->user();
        $consulta = Oportunidad::visiblePara($usuario)
            ->with(['cliente:id,nombre', 'vendedor:id,name,activo'])
            ->select('oportunidades.*')
            ->when($request->validated('etapa'), fn ($q, $etapa) => $q->where('oportunidades.etapa', $etapa))
            // Un vendedor fuera del alcance no tiene oportunidades visibles: lista vacía (P5).
            ->when($request->validated('vendedor'), fn ($q, $id) => $q->where('oportunidades.vendedor_id', (int) $id))
            ->orderBy('oportunidades.id');

        return view('oportunidades.index', [
            'oportunidades' => $reporte->conTotal($consulta)->paginate(25)->withQueryString(),
            'vendedores' => User::where('rol', 'vendedor')
                ->when($usuario->rol !== 'administrador', fn ($q) => $q->where('supervisor_id', $usuario->id))
                ->orderBy('name')->get(['id', 'name', 'activo']),
            'etapa' => $request->validated('etapa'),
            'vendedor' => $request->validated('vendedor'),
        ]);
    }

    public function show(Request $request, Oportunidad $oportunidad, ReporteVentas $reporte): View
    {
        return view('oportunidades.show', [
            'oportunidad' => $reporte->conTotal(Oportunidad::whereKey($oportunidad->id)->select('oportunidades.*'))
                ->with(['cliente:id,nombre', 'vendedor:id,name,activo'])->firstOrFail(),
            'lineas' => DB::table('oportunidad_productos as l')
                ->join('productos as p', 'p.id', '=', 'l.producto_id')
                ->where('l.oportunidad_id', $oportunidad->id)
                ->select('l.id', 'p.nombre', 'l.cantidad', 'l.precio_unitario')
                ->selectRaw('l.cantidad * l.precio_unitario AS subtotal')
                ->orderBy('l.id')->get(),
            'historial' => $oportunidad->historial()->with('usuario:id,name')->orderBy('created_at')->orderBy('id')->get(),
        ]);
    }
}
