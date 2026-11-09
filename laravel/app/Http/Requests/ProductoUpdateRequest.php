<?php

namespace App\Http\Requests;

/**
 * Edición de productos por el administrador. Igual que el alta, más el campo oculto stock_original
 * con el stock que mostró el formulario (P2); ProductoController lo compara con el stock bloqueado.
 */
class ProductoUpdateRequest extends ProductoStoreRequest
{
    public function rules(): array
    {
        return parent::rules() + [
            'stock_original' => ['present', 'nullable', 'integer'],
        ];
    }

    protected function productoEditado(): ?int
    {
        return $this->route('producto')->id;
    }

    public function messages(): array
    {
        return parent::messages() + [
            'stock_original.present' => 'Recargue el formulario y guarde de nuevo.',
            'stock_original.integer' => 'Recargue el formulario y guarde de nuevo.',
        ];
    }
}
