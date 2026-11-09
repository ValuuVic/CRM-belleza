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
     * Roles que entran al panel; el vendedor usa la SPA (R1).
     */
    public const ROLES_PANEL = ['administrador', 'supervisor'];

    public const MENSAJE_DESACTIVADA = 'Su cuenta está desactivada. Comuníquese con el administrador.';

    public const MENSAJE_VENDEDOR = 'Su cuenta es de vendedor. Ingrese desde la aplicación de ventas.';

    /**
     * Por qué la cuenta no puede usar el panel, o null si puede (A2-04, A2-05, A2-08, A2-09).
     */
    public function motivoSinPanel(): ?string
    {
        if (! $this->activo) {
            return self::MENSAJE_DESACTIVADA;
        }

        if (! in_array($this->rol, self::ROLES_PANEL, true)) {
            return self::MENSAJE_VENDEDOR;
        }

        return null;
    }

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
