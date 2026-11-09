<?php

namespace App\Http\Controllers;

use App\Http\Requests\ClienteIndexRequest;
use App\Http\Requests\ClienteStoreRequest;
use App\Http\Requests\ClienteUpdateRequest;
use App\Models\Cliente;
use App\Models\User;
use App\Services\AsignacionClientes;
use App\Support\Nit;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * Clientes del panel (A4-01 a A4-25). {cliente} ya llega resuelto dentro del alcance de la cuenta
 * (AppServiceProvider, DA4-1): fuera de él, 404. Las escrituras pasan por AsignacionClientes.
 */
class ClienteController extends Controller
{
    public function __construct(private AsignacionClientes $clientes) {}

    public function index(ClienteIndexRequest $request): View
    {
        $usuario = $request->user();
        $consulta = Cliente::visiblePara($usuario)
            ->with(['vendedor' => fn ($q) => $q->withCount('clientes')])
            ->orderBy('nombre')->orderBy('id');

        if (filled($texto = $request->validated('q'))) {
            $this->buscar($consulta, $texto);
        }

        $vendedor = $request->validated('vendedor');
        if ($vendedor === 'sin_asignar') {
            $consulta->whereNull('vendedor_id');
        } elseif ($vendedor !== null) {
            // Un vendedor fuera del alcance no tiene clientes visibles: la lista sale vacía (DA4-8).
            $consulta->where('vendedor_id', (int) $vendedor);
        }

        return view('clientes.index', [
            'clientes' => $consulta->paginate(25)->withQueryString(),
            'vendedores' => $this->vendedoresVisibles($usuario),
            'q' => $request->validated('q'),
            'vendedor' => $vendedor,
            'maximo' => AsignacionClientes::MAXIMO_CARTERA,
        ]);
    }

    public function create(Request $request): View
    {
        return view('clientes.create', [
            'vendedores' => $this->vendedoresAsignables($request->user()),
            'maximo' => AsignacionClientes::MAXIMO_CARTERA,
        ]);
    }

    public function store(ClienteStoreRequest $request): RedirectResponse
    {
        $this->clientes->crear($request->datos(), $request->vendedorId(), $request->user());

        return redirect()->route('clientes.index')->with('status', 'El cliente se creó correctamente.');
    }

    public function edit(Request $request, Cliente $cliente): View
    {
        return view('clientes.edit', [
            'cliente' => $cliente->load(['vendedor' => fn ($q) => $q->withCount('clientes')]),
            'vendedores' => $this->vendedoresAsignables($request->user()),
            'abiertas' => $cliente->oportunidades()->whereIn('etapa', Cliente::ETAPAS_ABIERTAS)->count(),
            'maximo' => AsignacionClientes::MAXIMO_CARTERA,
        ]);
    }

    public function update(ClienteUpdateRequest $request, Cliente $cliente): RedirectResponse
    {
        $this->clientes->actualizar($cliente, $request->datos(), $request->user());

        return redirect()->route('clientes.edit', $cliente)->with('status', 'Los datos del cliente se guardaron correctamente.');
    }

    public function destroy(Request $request, Cliente $cliente): RedirectResponse
    {
        $this->clientes->eliminar($cliente, $request->user());

        return redirect()->route('clientes.index')->with('status', 'El cliente se eliminó correctamente.');
    }

    /**
     * Nombre que contiene el texto (la colación ignora mayúsculas y acentos) o NIT que contiene el texto
     * compactado como en Nit (DA4-8). Los comodines de LIKE se escapan.
     */
    private function buscar(Builder $consulta, string $texto): void
    {
        $nit = ltrim(Nit::compactar($texto) ?? '', '0');

        $consulta->where(function (Builder $q) use ($texto, $nit) {
            $q->where('nombre', 'like', '%'.$this->escaparLike($texto).'%');

            if ($nit !== '') {
                $q->orWhere('nit', 'like', '%'.$this->escaparLike($nit).'%');
            }
        });
    }

    private function escaparLike(string $texto): string
    {
        return addcslashes($texto, '\\%_');
    }

    /**
     * Vendedores del filtro: todos (administrador) o los del equipo (supervisor), activos o no.
     *
     * @return Collection<int, User>
     */
    private function vendedoresVisibles(User $usuario): Collection
    {
        return User::where('rol', 'vendedor')
            ->when($usuario->rol !== 'administrador', fn ($q) => $q->where('supervisor_id', $usuario->id))
            ->orderBy('name')->get(['id', 'name', 'activo']);
    }

    /**
     * Vendedores a los que la cuenta puede asignar: activos y, para el supervisor, de su equipo (DA4-5).
     * La regla se vuelve a comprobar con la fila bloqueada al guardar.
     *
     * @return Collection<int, User>
     */
    private function vendedoresAsignables(User $usuario): Collection
    {
        return User::where('rol', 'vendedor')->where('activo', true)
            ->when($usuario->rol !== 'administrador', fn ($q) => $q->where('supervisor_id', $usuario->id))
            ->withCount('clientes')->orderBy('name')->get(['id', 'name']);
    }
}
