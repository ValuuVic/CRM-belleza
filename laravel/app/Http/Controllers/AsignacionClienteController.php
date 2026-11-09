<?php

namespace App\Http\Controllers;

use App\Http\Requests\AsignacionClienteRequest;
use App\Models\Cliente;
use App\Services\AsignacionClientes;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * Asignar o reasignar (PUT) y liberar (DELETE) un cliente (A4-17 a A4-22, DA4-2). Las reglas de cartera,
 * equipo, D2 y D3 y el orden de bloqueos están en AsignacionClientes.
 */
class AsignacionClienteController extends Controller
{
    public function __construct(private AsignacionClientes $clientes) {}

    public function update(AsignacionClienteRequest $request, Cliente $cliente): RedirectResponse
    {
        $reasignacion = $cliente->vendedor_id !== null;
        $this->clientes->asignar($cliente, (int) $request->validated('vendedor_id'), $request->user());

        return redirect()->route('clientes.edit', $cliente)
            ->with('status', $reasignacion ? 'El cliente se reasignó correctamente.' : 'El cliente se asignó correctamente.');
    }

    public function destroy(Request $request, Cliente $cliente): RedirectResponse
    {
        $this->clientes->liberar($cliente, $request->user());

        return redirect()->route('clientes.edit', $cliente)->with('status', 'El cliente quedó disponible.');
    }
}
