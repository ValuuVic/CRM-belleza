<?php

namespace App\Services;

use App\Models\Cliente;
use App\Models\User;
use Closure;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Escrituras de clientes del panel (docs/specs/A4-clientes.md): alta, edición, asignación, reasignación,
 * liberación y eliminación. Una transacción por operación.
 *
 * Orden de bloqueos (D17, DA4-6), el mismo que la API (api/src/servicios/vendedores.js):
 *   users (vendedor anterior y nuevo, id ascendente) → clientes → oportunidades abiertas.
 * El bloqueo de users es la PRIMERA lectura de la transacción: en REPEATABLE READ la instantánea se fija
 * en la primera lectura sin bloqueo, así que el conteo de la cartera, hecho después, ve los datos actuales.
 *
 * El dueño anterior es el que se vio antes de la transacción: al asignar y liberar, el que mostró el
 * formulario (campo oculto vendedor_actual); al editar y eliminar, el leído al resolver la ruta. Si con
 * el cliente ya bloqueado resulta distinto, lo visto ya no vale y se rechaza (DA4-7).
 */
class AsignacionClientes
{
    public const MAXIMO_CARTERA = 10;

    public const MENSAJE_CAMBIO = 'El cliente cambió mientras usted trabajaba. Recargue la página e inténtelo de nuevo.';

    public const MENSAJE_CON_OPORTUNIDADES = 'No se puede eliminar: el cliente tiene oportunidades registradas.';

    public const MENSAJE_ABIERTAS = 'El cliente tiene oportunidades abiertas. Reasígnelo o cierre sus oportunidades antes de liberarlo.';

    /**
     * Alta; con vendedor, se bloquea su fila y se cuenta su cartera como en una asignación (P4).
     *
     * @param  array{nombre: string, nit: ?string, telefono: string, correo: ?string}  $datos
     */
    public function crear(array $datos, ?int $vendedorId, User $actor): Cliente
    {
        return $this->ejecutar(function () use ($datos, $vendedorId, $actor) {
            if ($vendedorId !== null) {
                $usuarios = $this->bloquearUsuarios([$vendedorId]);
                $this->exigirDestino($usuarios->get($vendedorId), $actor);
                $this->exigirEspacio($usuarios->get($vendedorId));
            }

            return Cliente::create([...$datos, 'vendedor_id' => $vendedorId]);
        });
    }

    /**
     * Datos del cliente (nombre, NIT, teléfono, correo); el vendedor no cambia aquí (DA4-2).
     *
     * @param  array{nombre: string, nit: ?string, telefono: string, correo: ?string}  $datos
     */
    public function actualizar(Cliente $visto, array $datos, User $actor): void
    {
        $this->ejecutar(function () use ($visto, $datos, $actor) {
            [$cliente] = $this->bloquear($visto, $visto->vendedor_id, $actor);
            $cliente->update($datos);
        });
    }

    /**
     * Asigna un cliente disponible o lo reasigna (D2): las oportunidades abiertas pasan al nuevo vendedor;
     * las cerradas conservan a quien hizo la venta y las actividades siguen al cliente sin tocarlas.
     * $duenoVisto: el vendedor que mostró el formulario (null = disponible).
     */
    public function asignar(Cliente $visto, ?int $duenoVisto, int $nuevoId, User $actor): void
    {
        $this->ejecutar(function () use ($visto, $duenoVisto, $nuevoId, $actor) {
            [$cliente, $usuarios] = $this->bloquear($visto, $duenoVisto, $actor, [$nuevoId]);

            if ($cliente->vendedor_id === $nuevoId) {
                $this->rechazar('vendedor_id', 'El cliente ya está asignado a ese vendedor.');
            }

            $nuevo = $usuarios->get($nuevoId);
            $this->exigirDestino($nuevo, $actor);
            $this->exigirEspacio($nuevo);

            if ($cliente->vendedor_id !== null) {
                $abiertas = $cliente->oportunidades()->whereIn('etapa', Cliente::ETAPAS_ABIERTAS)
                    ->orderBy('id')->lockForUpdate()->pluck('id');

                if ($abiertas->isNotEmpty()) {
                    DB::table('oportunidades')->whereIn('id', $abiertas)
                        ->update(['vendedor_id' => $nuevoId, 'updated_at' => now()]);
                }
            }

            $cliente->update(['vendedor_id' => $nuevoId]);
        });
    }

    /**
     * Libera un cliente (D3): con oportunidades abiertas se rechaza.
     */
    public function liberar(Cliente $visto, ?int $duenoVisto, User $actor): void
    {
        $this->ejecutar(function () use ($visto, $duenoVisto, $actor) {
            [$cliente] = $this->bloquear($visto, $duenoVisto, $actor);

            if ($cliente->vendedor_id === null) {
                $this->rechazar('vendedor_id', 'El cliente ya está disponible.');
            }

            $abiertas = $cliente->oportunidades()->whereIn('etapa', Cliente::ETAPAS_ABIERTAS)->lockForUpdate()->exists();
            if ($abiertas) {
                $this->rechazar('vendedor_id', self::MENSAJE_ABIERTAS);
            }

            $cliente->update(['vendedor_id' => null]);
        });
    }

    /**
     * Elimina un cliente sin oportunidades (L4-04); sus actividades se borran en cascada. Si la API le
     * crea una oportunidad a la vez, MySQL responde 1451 y se traduce al mismo mensaje (DA4-9).
     */
    public function eliminar(Cliente $visto, User $actor): void
    {
        $this->ejecutar(function () use ($visto, $actor) {
            [$cliente] = $this->bloquear($visto, $visto->vendedor_id, $actor);

            if ($cliente->oportunidades()->exists()) {
                $this->rechazar('cliente', self::MENSAJE_CON_OPORTUNIDADES);
            }

            $cliente->delete();
        });
    }

    /**
     * Bloquea el vendedor visto y los de $otros (id ascendente) y después el cliente. Comprueba que el
     * dueño siga siendo $duenoVisto (DA4-7) y, para el supervisor, que el cliente siga en su alcance (404).
     *
     * @param  array<int, int>  $otros
     * @return array{0: Cliente, 1: Collection<int, User>}
     */
    private function bloquear(Cliente $visto, ?int $duenoVisto, User $actor, array $otros = []): array
    {
        $usuarios = $this->bloquearUsuarios([$duenoVisto, ...$otros]);

        $cliente = Cliente::whereKey($visto->id)->lockForUpdate()->first();
        if (! $cliente) {
            throw (new ModelNotFoundException)->setModel(Cliente::class, [$visto->id]);
        }

        if ($cliente->vendedor_id !== $duenoVisto) {
            $this->rechazar('cliente', self::MENSAJE_CAMBIO);
        }

        // El vendedor del cliente está bloqueado: su equipo no cambia hasta que termine la transacción.
        $dueno = $cliente->vendedor_id === null ? null : $usuarios->get($cliente->vendedor_id);
        if ($actor->rol !== 'administrador' && $dueno && $dueno->supervisor_id !== $actor->id) {
            throw (new ModelNotFoundException)->setModel(Cliente::class, [$visto->id]);
        }

        return [$cliente, $usuarios];
    }

    /**
     * Primera lectura de la transacción: SELECT … FROM users WHERE id IN (…) ORDER BY id FOR UPDATE.
     *
     * @param  array<int, ?int>  $ids
     * @return Collection<int, User>
     */
    private function bloquearUsuarios(array $ids): Collection
    {
        $ids = array_values(array_unique(array_filter($ids, fn ($id) => $id !== null)));
        sort($ids);

        if ($ids === []) {
            return collect();
        }

        return User::whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
    }

    /**
     * Destino válido: vendedor activo; para el supervisor, además, de su equipo (DA4-5, L5-02).
     */
    private function exigirDestino(?User $vendedor, User $actor): void
    {
        $esSupervisor = $actor->rol !== 'administrador';
        $valido = $vendedor && $vendedor->rol === 'vendedor' && $vendedor->activo
            && (! $esSupervisor || $vendedor->supervisor_id === $actor->id);

        if (! $valido) {
            $this->rechazar('vendedor_id', $esSupervisor ? 'Elija un vendedor activo de su equipo.' : 'Elija un vendedor activo.');
        }
    }

    /**
     * Cartera máxima (R3), contada con la fila del vendedor ya bloqueada.
     */
    private function exigirEspacio(User $vendedor): void
    {
        if (Cliente::where('vendedor_id', $vendedor->id)->count() >= self::MAXIMO_CARTERA) {
            $this->rechazar('vendedor_id', sprintf(
                'La cartera de %s está llena (%d de %d). Libere o reasigne uno de sus clientes primero.',
                $vendedor->name, self::MAXIMO_CARTERA, self::MAXIMO_CARTERA,
            ));
        }
    }

    /**
     * Ejecuta $operacion en una transacción y traduce los errores de MySQL que decide la base:
     * 1062 (índice único de NIT o teléfono, A4-12) y 1451 (cliente con oportunidades, A4-25).
     */
    private function ejecutar(Closure $operacion): mixed
    {
        try {
            return DB::transaction($operacion);
        } catch (QueryException $e) {
            $codigo = $e->errorInfo[1] ?? null;
            $mensaje = $e->getMessage();

            if ($codigo === 1062 && str_contains($mensaje, 'clientes_nit_unique')) {
                $this->rechazar('nit', 'Ya existe un cliente con ese NIT.');
            }

            if ($codigo === 1062 && str_contains($mensaje, 'clientes_telefono_unique')) {
                $this->rechazar('telefono', 'Ya existe un cliente con ese teléfono.');
            }

            if ($codigo === 1451) {
                $this->rechazar('cliente', self::MENSAJE_CON_OPORTUNIDADES);
            }

            throw $e;
        }
    }

    /**
     * Vuelve al formulario con el mensaje junto al campo; la transacción se revierte.
     */
    private function rechazar(string $campo, string $mensaje): never
    {
        throw ValidationException::withMessages([$campo => $mensaje]);
    }
}
