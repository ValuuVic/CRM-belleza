<?php

namespace App\Http\Requests;

use App\Services\ReporteVentas;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Mes (AAAA-MM) y vendedor de las páginas Equipo y Reportes (DA5-3, P5). Un mes mal formado no da 500:
 * se vuelve a la misma página sin filtros (el mes actual de Guatemala) con «Elija un mes válido.».
 */
class FiltroMesRequest extends FormRequest
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
            'mes' => ['nullable', 'string', 'regex:/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/D'],
            'vendedor' => ['nullable', 'integer', 'min:1'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'mes.string' => 'Elija un mes válido.',
            'mes.regex' => 'Elija un mes válido.',
            'vendedor.integer' => 'Elija un vendedor de la lista.',
            'vendedor.min' => 'Elija un vendedor de la lista.',
        ];
    }

    /**
     * Al fallar, la misma página sin la consulta (y no la anterior, que podría ser esta misma con el
     * mismo mes inválido).
     */
    protected function getRedirectUrl(): string
    {
        return $this->url();
    }

    public function mes(ReporteVentas $reporte): string
    {
        return $this->validated('mes') ?? $reporte->mesActual();
    }

    public function vendedorId(): ?int
    {
        return $this->filled('vendedor') ? (int) $this->validated('vendedor') : null;
    }
}
