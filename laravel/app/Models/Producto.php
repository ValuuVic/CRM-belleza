<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Table('productos')]
#[Fillable(['nombre', 'precio', 'activo', 'stock'])]
class Producto extends Model
{
    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'precio' => 'decimal:2',
            'activo' => 'boolean',
            // NULL: el producto no controla inventario (RP).
            'stock' => 'integer',
        ];
    }

    /**
     * Líneas de oportunidad en las que aparece el producto.
     */
    public function lineas(): HasMany
    {
        return $this->hasMany(OportunidadProducto::class);
    }
}
