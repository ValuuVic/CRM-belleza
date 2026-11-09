<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password', 'rol', 'supervisor_id', 'activo'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'activo' => 'boolean',
        ];
    }

    /**
     * Supervisor del equipo al que pertenece un vendedor.
     */
    public function supervisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'supervisor_id');
    }

    /**
     * Vendedores del equipo de un supervisor.
     */
    public function vendedores(): HasMany
    {
        return $this->hasMany(User::class, 'supervisor_id');
    }

    /**
     * Cartera del vendedor.
     */
    public function clientes(): HasMany
    {
        return $this->hasMany(Cliente::class, 'vendedor_id');
    }

    public function oportunidades(): HasMany
    {
        return $this->hasMany(Oportunidad::class, 'vendedor_id');
    }

    public function actividades(): HasMany
    {
        return $this->hasMany(Actividad::class, 'vendedor_id');
    }
}
