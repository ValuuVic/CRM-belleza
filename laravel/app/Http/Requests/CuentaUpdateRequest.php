<?php

namespace App\Http\Requests;

use Illuminate\Validation\Validator;

/**
 * Edición de cuentas por el administrador. Igual que el alta, salvo que la contraseña vacía conserva
 * la actual (DA2-4) y que el administrador no puede desactivarse ni quitarse su rol (A2-21).
 */
class CuentaUpdateRequest extends CuentaStoreRequest
{
    protected function reglasPassword(): array
    {
        return ['nullable', 'string', 'min:8', 'confirmed'];
    }

    protected function cuentaEditada(): ?int
    {
        return $this->route('user')->id;
    }

    /**
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                if ($this->cuentaEditada() !== $this->user()->id) {
                    return;
                }

                if ($this->input('rol') !== 'administrador') {
                    $validator->errors()->add('rol', 'Usted no puede quitarse su propio rol de administrador.');
                }

                if (! $this->boolean('activo')) {
                    $validator->errors()->add('activo', 'Usted no puede desactivar su propia cuenta.');
                }
            },
        ];
    }
}
