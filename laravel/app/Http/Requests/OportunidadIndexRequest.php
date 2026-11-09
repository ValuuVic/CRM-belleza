<?php

namespace App\Http\Requests;

use App\Models\Oportunidad;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Filtros de la lista de oportunidades (L6-01; DA5-6): etapa (una de las seis de R5) y vendedor. Un valor
 * inválido no da 500: se vuelve a la lista sin filtros con el mensaje.
 */
class OportunidadIndexRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'etapa' => ['nullable', 'string', Rule::in(array_keys(Oportunidad::ETAPAS))],
            'vendedor' => ['nullable', 'integer', 'min:1'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'etapa.string' => 'Elija una etapa válida.',
            'etapa.in' => 'Elija una etapa válida.',
            'vendedor.integer' => 'Elija un vendedor de la lista.',
            'vendedor.min' => 'Elija un vendedor de la lista.',
        ];
    }

    protected function getRedirectUrl(): string
    {
        return $this->url();
    }
}
