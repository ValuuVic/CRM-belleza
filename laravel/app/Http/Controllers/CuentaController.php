<?php

namespace App\Http\Controllers;

use App\Http\Requests\CuentaStoreRequest;
use App\Http\Requests\CuentaUpdateRequest;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

/**
 * Gestión de cuentas del administrador (A2-13 a A2-28). Las cuentas no se borran: se desactivan.
 *
 * Las reglas que dependen de otras filas se comprueban dentro de una transacción, con las filas
 * bloqueadas en este orden: administradores activos (P5) → cuenta editada → supervisor elegido.
 * La API bloquea la fila del vendedor antes de tomar clientes (D17), así que P2 no compite con ella.
 */
class CuentaController extends Controller
{
    public function index(): View
    {
        return view('cuentas.index', [
            'cuentas' => User::with('supervisor')->orderBy('id')->get(),
        ]);
    }

    public function create(): View
    {
        return view('cuentas.create', [
            'supervisores' => $this->supervisoresActivos(),
        ]);
    }

    public function store(CuentaStoreRequest $request): RedirectResponse
    {
        $datos = $this->datos($request->validated());

        DB::transaction(function () use ($datos) {
            if ($datos['rol'] === 'vendedor') {
                $this->bloquearSupervisor($datos['supervisor_id']);
            }

            User::create($datos);
        });

        return redirect()->route('cuentas.index')->with('status', 'La cuenta se creó correctamente.');
    }

    public function edit(User $user): View
    {
        return view('cuentas.edit', [
            'cuenta' => $user,
            'supervisores' => $this->supervisoresActivos(),
        ]);
    }

    public function update(CuentaUpdateRequest $request, User $user): RedirectResponse
    {
        $datos = $this->datos($request->validated());

        DB::transaction(function () use ($user, $datos) {
            // P5: si la cuenta es un administrador activo, se bloquean todos los administradores activos
            // antes de decidir, para que dos cambios simultáneos no dejen 0.
            if ($user->rol === 'administrador' && $user->activo) {
                $administradores = User::where('rol', 'administrador')->where('activo', true)
                    ->orderBy('id')->lockForUpdate()->pluck('id');
            }

            $cuenta = User::whereKey($user->id)->lockForUpdate()->firstOrFail();

            if ($cuenta->rol === 'administrador' && $cuenta->activo
                && ($datos['rol'] !== 'administrador' || ! $datos['activo'])
                && ($administradores ?? collect())->reject(fn ($id) => $id === $cuenta->id)->isEmpty()) {
                $this->rechazar($datos['activo'] ? 'rol' : 'activo', 'Debe quedar al menos un administrador activo.');
            }

            // P1: un supervisor con vendedores activos no se desactiva.
            if ($cuenta->rol === 'supervisor' && $cuenta->activo && ! $datos['activo']
                && $cuenta->vendedores()->where('activo', true)->exists()) {
                $this->rechazar('activo', 'Reasigne primero a los vendedores activos de este supervisor.');
            }

            // P2: no cambia de rol un supervisor con vendedores ni un vendedor con clientes.
            if ($datos['rol'] !== $cuenta->rol) {
                if ($cuenta->rol === 'supervisor' && $cuenta->vendedores()->exists()) {
                    $this->rechazar('rol', 'Reasigne primero a los vendedores de este supervisor.');
                }

                if ($cuenta->rol === 'vendedor' && $cuenta->clientes()->exists()) {
                    $this->rechazar('rol', 'Reasigne o libere primero los clientes de este vendedor.');
                }
            }

            if ($datos['rol'] === 'vendedor') {
                $this->bloquearSupervisor($datos['supervisor_id']);
            }

            $cuenta->update($datos);
        });

        return redirect()->route('cuentas.index')->with('status', 'La cuenta se guardó correctamente.');
    }

    /**
     * Datos validados listos para guardar: supervisor NULL fuera del rol vendedor (DA2-3) y
     * contraseña vacía = se conserva la actual (DA2-4). El cast hashed del modelo genera el hash.
     *
     * @param  array<string, mixed>  $validados
     * @return array<string, mixed>
     */
    private function datos(array $validados): array
    {
        if ($validados['rol'] !== 'vendedor') {
            $validados['supervisor_id'] = null;
        }

        if (blank($validados['password'] ?? null)) {
            unset($validados['password']);
        }

        return $validados;
    }

    /**
     * Bloquea al supervisor elegido y comprueba, ya bloqueado, que siga siendo un supervisor activo.
     */
    private function bloquearSupervisor(int $id): void
    {
        $supervisor = User::whereKey($id)->lockForUpdate()->first();

        if (! $supervisor || $supervisor->rol !== 'supervisor' || ! $supervisor->activo) {
            $this->rechazar('supervisor_id', CuentaStoreRequest::MENSAJE_SUPERVISOR);
        }
    }

    /**
     * Vuelve al formulario con el mensaje junto al campo; la transacción se revierte.
     */
    private function rechazar(string $campo, string $mensaje): never
    {
        throw ValidationException::withMessages([$campo => $mensaje]);
    }

    private function supervisoresActivos()
    {
        return User::where('rol', 'supervisor')->where('activo', true)->orderBy('name')->get(['id', 'name']);
    }
}
