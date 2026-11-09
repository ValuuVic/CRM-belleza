<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProductoStoreRequest;
use App\Http\Requests\ProductoUpdateRequest;
use App\Models\Producto;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

/**
 * Catálogo de productos (A3-01 a A3-26). Los productos no se borran: se desactivan.
 *
 * El panel nunca escribe en oportunidad_productos: cambiar el precio no altera las líneas (A3-20).
 * El supervisor solo ve la lista (P1); las rutas de alta y edición son del administrador.
 */
class ProductoController extends Controller
{
    public function index(): View
    {
        return view('productos.index', [
            'productos' => Producto::orderBy('nombre')->orderBy('id')->get(),
        ]);
    }

    public function create(): View
    {
        return view('productos.create');
    }

    public function store(ProductoStoreRequest $request): RedirectResponse
    {
        $datos = $request->validated();

        $this->guardar(fn () => Producto::create($datos));

        return redirect()->route('productos.index')->with('status', 'El producto se creó correctamente.');
    }

    public function edit(Producto $producto): View
    {
        return view('productos.edit', ['producto' => $producto]);
    }

    /**
     * P2: control de concurrencia optimista. El formulario envía el stock que mostró; con el producto
     * bloqueado (la API bloquea la misma fila con FOR UPDATE al descontar), si el stock ya no es ese
     * se rechaza todo el formulario y no se guarda nada (A3-22, A3-25, A3-26).
     */
    public function update(ProductoUpdateRequest $request, Producto $producto): RedirectResponse
    {
        $datos = $request->validated();
        $stockOriginal = $datos['stock_original'] === null ? null : (int) $datos['stock_original'];
        unset($datos['stock_original']);

        $this->guardar(function () use ($producto, $datos, $stockOriginal) {
            DB::transaction(function () use ($producto, $datos, $stockOriginal) {
                $actual = Producto::whereKey($producto->id)->lockForUpdate()->firstOrFail();

                if ($actual->stock !== $stockOriginal) {
                    $ahora = $actual->stock === null ? 'ahora no se controla inventario' : "ahora hay {$actual->stock}";

                    throw ValidationException::withMessages([
                        'stock' => "El stock cambió mientras usted editaba ({$ahora}). Revise y guarde de nuevo.",
                    ]);
                }

                $actual->update($datos);
            });
        });

        return redirect()->route('productos.index')->with('status', 'El producto se guardó correctamente.');
    }

    /**
     * El índice único es el árbitro final del nombre: si otro producto con el mismo nombre se guardó
     * después de la validación, MySQL responde 1062 y se vuelve al formulario con el error (A3-09).
     */
    private function guardar(Closure $operacion): void
    {
        try {
            $operacion();
        } catch (QueryException $e) {
            if (($e->errorInfo[1] ?? null) !== 1062) {
                throw $e;
            }

            throw ValidationException::withMessages(['nombre' => ProductoStoreRequest::MENSAJE_NOMBRE_REPETIDO]);
        }
    }
}
