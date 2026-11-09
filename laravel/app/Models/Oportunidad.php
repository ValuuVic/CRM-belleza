<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Table('oportunidades')]
#[Fillable(['cliente_id', 'vendedor_id', 'titulo', 'etapa', 'motivo_perdida', 'fecha_cierre'])]
class Oportunidad extends Model
{
    /**
     * Etapas de R5 con su nombre para mostrar.
     */
    public const ETAPAS = [
        'prospecto' => 'Prospecto',
        'calificado' => 'Calificado',
        'propuesta' => 'Propuesta',
        'negociacion' => 'Negociación',
        'ganada' => 'Ganada',
        'perdida' => 'Perdida',
    ];

    /**
     * Oportunidades que puede ver una cuenta del panel (A5, DA5-2): el administrador, todas; el supervisor,
     * las de los vendedores de su equipo (la venta es de quien la cerró, DA5-1). Cualquier otra cuenta, ninguna.
     */
    #[Scope]
    protected function visiblePara(Builder $query, User $usuario): void
    {
        if ($usuario->rol === 'administrador') {
            return;
        }

        if ($usuario->rol !== 'supervisor') {
            $query->whereNull('oportunidades.id');

            return;
        }

        $query->whereIn('oportunidades.vendedor_id', User::select('id')->where('supervisor_id', $usuario->id));
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'fecha_cierre' => 'datetime',
        ];
    }

    public function cliente(): BelongsTo
    {
        return $this->belongsTo(Cliente::class);
    }

    /**
     * Dueño de la oportunidad.
     */
    public function vendedor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'vendedor_id');
    }

    public function lineas(): HasMany
    {
        return $this->hasMany(OportunidadProducto::class);
    }

    /**
     * Productos de la oportunidad, con la cantidad y el precio guardados en cada línea.
     */
    public function productos(): BelongsToMany
    {
        return $this->belongsToMany(Producto::class, 'oportunidad_productos')
            ->withPivot('id', 'cantidad', 'precio_unitario')
            ->withTimestamps();
    }

    public function historial(): HasMany
    {
        return $this->hasMany(HistorialEtapa::class);
    }
}
