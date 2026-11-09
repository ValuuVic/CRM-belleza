<?php

namespace App\Http\Requests;

/**
 * Edición de los datos de un cliente. Igual que el alta, salvo que el vendedor no se acepta: la
 * asignación es una acción aparte (DA4-2), así que vendedor_id se ignora si llega en el cuerpo.
 */
class ClienteUpdateRequest extends ClienteStoreRequest
{
    public function rules(): array
    {
        $reglas = parent::rules();
        unset($reglas['vendedor_id']);

        return $reglas;
    }

    public function vendedorId(): ?int
    {
        return null;
    }

    protected function clienteEditado(): ?int
    {
        return $this->route('cliente')->id;
    }
}
