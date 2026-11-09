<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Línea de una oportunidad: un producto, su cantidad y el precio al que se cotizó.
 */
#[Table('oportunidad_productos')]
#[Fillable(['oportunidad_id', 'producto_id', 'cantidad', 'precio_unitario'])]
class OportunidadProducto extends Model
{
    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'cantidad' => 'integer',
            'precio_unitario' => 'decimal:2',
        ];
    }

    public function oportunidad(): BelongsTo
    {
        return $this->belongsTo(Oportunidad::class);
    }

    public function producto(): BelongsTo
    {
        return $this->belongsTo(Producto::class);
    }
}
