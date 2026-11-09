<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Table('historial_etapas')]
#[Fillable(['oportunidad_id', 'usuario_id', 'etapa_anterior', 'etapa_nueva'])]
class HistorialEtapa extends Model
{
    /**
     * La tabla solo tiene created_at.
     */
    const UPDATED_AT = null;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function oportunidad(): BelongsTo
    {
        return $this->belongsTo(Oportunidad::class);
    }

    /**
     * Quién hizo el cambio de etapa.
     */
    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }
}
