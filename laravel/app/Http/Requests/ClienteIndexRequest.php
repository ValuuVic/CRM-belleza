<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Búsqueda y filtros de la lista de clientes (DA4-8): q de hasta 100 caracteres (D16) y vendedor
 * con el id de un vendedor o «sin_asignar». Si algo falla, se vuelve a la lista sin filtros.
 */
class ClienteIndexRequest extends FormRequest
{
    protected $redirectRoute = 'clientes.index';

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
            'q' => ['nullable', 'string', 'max:100'],
            'vendedor' => ['nullable', 'regex:/^(sin_asignar|[1-9][0-9]{0,9})$/D'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'q.string' => 'Escriba un nombre o un NIT para buscar.',
            'q.max' => 'La búsqueda no debe superar los 100 caracteres.',
            'vendedor.regex' => 'Elija un vendedor de la lista.',
        ];
    }
}
