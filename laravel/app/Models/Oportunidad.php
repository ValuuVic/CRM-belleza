<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Table('oportunidades')]
#[Fillable(['cliente_id', 'vendedor_id', 'titulo', 'etapa', 'motivo_perdida', 'fecha_cierre'])]
class Oportunidad extends Model
{
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
