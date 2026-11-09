<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Table('clientes')]
#[Fillable(['vendedor_id', 'nombre', 'nit', 'telefono', 'correo'])]
class Cliente extends Model
{
    /**
     * Etapas abiertas de una oportunidad (R5): las que se mueven al reasignar (D2) e impiden liberar (D3).
     */
    public const ETAPAS_ABIERTAS = ['prospecto', 'calificado', 'propuesta', 'negociacion'];

    /**
     * Clientes que puede ver una cuenta del panel (DA4-1, R2): el administrador, todos; el supervisor,
     * los disponibles y los de los vendedores de su equipo, activos o no. Cualquier otra cuenta, ninguno.
     */
    #[Scope]
    protected function visiblePara(Builder $query, User $usuario): void
    {
        if ($usuario->rol === 'administrador') {
            return;
        }

        if ($usuario->rol !== 'supervisor') {
            $query->whereNull('id');

            return;
        }

        $query->where(fn (Builder $q) => $q->whereNull('vendedor_id')
            ->orWhereIn('vendedor_id', User::select('id')->where('supervisor_id', $usuario->id)));
    }

    /**
     * Vendedor responsable; NULL si el cliente está disponible.
     */
    public function vendedor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'vendedor_id');
    }

    public function oportunidades(): HasMany
    {
        return $this->hasMany(Oportunidad::class);
    }

    public function actividades(): HasMany
    {
        return $this->hasMany(Actividad::class);
    }
}
