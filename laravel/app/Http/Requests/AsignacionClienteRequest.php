<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Asignar o reasignar un cliente. Que el vendedor exista, esté activo, sea del equipo del supervisor y
 * tenga espacio en su cartera se comprueba en AsignacionClientes, con su fila bloqueada (DA4-5, DA4-6).
 */
class AsignacionClienteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'vendedor_id' => ['required', 'integer'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'vendedor_id.required' => 'Elija el vendedor al que se asignará el cliente.',
            'vendedor_id.integer' => 'Elija el vendedor al que se asignará el cliente.',
        ];
    }
}
